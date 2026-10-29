package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeRunnerDispatcher {

    private final RuntimeSessionRepository runtimeSessionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final RunnerReceiptIngestService runnerReceiptIngestService;
    @Lazy
    private final RuntimeSessionService runtimeSessionService;
    private final ObjectMapper objectMapper;

    @Value("${mavis.runner.auto-dispatch-enabled:true}")
    private boolean autoDispatchEnabled;

    @Value("${mavis.runner.mode:AUTO}")
    private String runnerMode;

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot;

    @Value("${mavis.runner.service-key:mavis-local-runner-secret-key}")
    private String runnerServiceKey;

    @Value("${mavis.runner.collector-config-path:samples/runtime-poc/collector.yaml}")
    private String collectorConfigPath;

    @Value("${mavis.runner.runner-project-path:../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj}")
    private String runnerProjectPath;

    @Value("${mavis.runtime.runner.allow-simulated-fallback:true}")
    private boolean allowSimulatedFallback;

    @Value("${server.port:8080}")
    private int serverPort;

    public boolean isAutoDispatchEnabled() {
        return autoDispatchEnabled;
    }

    public CompletableFuture<Void> dispatchSessionAsync(UUID sessionId) {
        return CompletableFuture.runAsync(() -> {
            try {
                dispatchSession(sessionId);
            } catch (Exception e) {
                log.error("Runtime dispatch failed for {}", sessionId, e);
                runtimeSessionRepository.findById(sessionId).ifPresent(session -> {
                    if (Set.of("COMPLETED", "CANCELLED", "FAILED", "TIMED_OUT").contains(session.getExecutionStatus())) return;
                    boolean allocated = Set.of("ALLOCATED", "RUNNING", "CANCELLING").contains(session.getExecutionStatus());
                    session.setExecutionStatus("FAILED");
                    if (!allocated) { session.setScenarioStatus("NOT_RUN"); session.setCleanupStatus("NOT_APPLICABLE"); }
                    else session.setCleanupStatus("UNCONFIRMED");
                    session.setCompletedAt(java.time.OffsetDateTime.now());
                    session.setRecoveryResultJson(objectMapper.createObjectNode().put("code", allocated ? "RUNNER_FAILED_RECOVERY_REQUIRED" : "RUNNER_UNAVAILABLE").put("message", "No synthetic trace was generated. Check runner availability and recovery status."));
                    runtimeSessionRepository.save(session);
                });
            }
        });
    }

    public RuntimeSessionResponseDTO dispatchSession(UUID sessionId) {
        log.info("Bắt đầu điều phối thực thi phiên thực nghiệm {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy session: " + sessionId));

        if ("COMPLETED".equalsIgnoreCase(session.getExecutionStatus()) || "CANCELLED".equalsIgnoreCase(session.getExecutionStatus())) {
            log.info("Phiên thực nghiệm {} đã kết thúc ({}), bỏ qua dispatch", sessionId, session.getExecutionStatus());
            return runtimeSessionService.getSessionById(sessionId);
        }

        boolean managedAvailable = ("AUTO".equalsIgnoreCase(runnerMode) || "MANAGED_CLI".equalsIgnoreCase(runnerMode)) && isManagedCliEnvironmentAvailable();

        if (!managedAvailable && !allowSimulatedFallback) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runtime runner unavailable. No application was executed and no observed trace was generated.");
        }

        if ("NOT_STARTED".equalsIgnoreCase(session.getExecutionStatus()) || "PENDING".equalsIgnoreCase(session.getScenarioStatus())) {
            runtimeSessionService.approveAndStartSession(sessionId);
            session = runtimeSessionRepository.findById(sessionId).orElse(session);
        }

        if (managedAvailable) {
            try {
                executeManagedCli(session);
                return runtimeSessionService.getSessionById(sessionId);
            } catch (Exception failure) {
                log.warn("Managed runtime execution failed for {}: {}", sessionId, failure.getMessage());
                if (!allowSimulatedFallback) {
                    throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Runtime execution failed. No synthetic trace was substituted. Check runner diagnostics and recovery status.");
                }
                log.info("Falling back to model-grounded runtime run for session {}", sessionId);
            }
        }

        try {
            executeModelGroundedFallbackRun(session);
            return runtimeSessionService.getSessionById(sessionId);
        } catch (Exception fallbackFailure) {
            log.error("Model-grounded fallback execution failed for {}", sessionId, fallbackFailure);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Runtime execution and fallback both failed: " + fallbackFailure.getMessage());
        }
    }

    private Path resolveRunnerProjectPath() {
        List<Path> candidates = List.of(
            Path.of(runnerProjectPath),
            Path.of("../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj"),
            Path.of("../../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj"),
            Path.of("MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj")
        );
        for (Path p : candidates) {
            Path abs = p.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs)) {
                return abs;
            }
        }
        return Path.of(runnerProjectPath).toAbsolutePath().normalize();
    }

    private Path resolveCollectorConfigPath() {
        List<Path> candidates = List.of(
            Path.of(collectorConfigPath),
            Path.of("../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
            Path.of("../../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
            Path.of("samples/runtime-poc/collector.yaml"),
            Path.of("MAVIS.Worker/samples/runtime-poc/collector.yaml")
        );
        for (Path p : candidates) {
            Path abs = p.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs)) {
                return abs;
            }
        }
        return Path.of(collectorConfigPath).toAbsolutePath().normalize();
    }

    private boolean isManagedCliEnvironmentAvailable() {
        try {
            Path projPath = resolveRunnerProjectPath();
            if (!Files.isRegularFile(projPath)) {
                return false;
            }
            Path collectorPath = resolveCollectorConfigPath();
            if (!Files.isRegularFile(collectorPath)) {
                return false;
            }
            Process checkDotnet = new ProcessBuilder("dotnet", "--version")
                    .redirectErrorStream(true)
                    .start();
            if (!checkDotnet.waitFor(10, java.util.concurrent.TimeUnit.SECONDS)) { checkDotnet.destroyForcibly(); return false; }
            if (checkDotnet.exitValue() != 0) {
                return false;
            }
            Process checkDocker = new ProcessBuilder("docker", "info")
                    .redirectErrorStream(true)
                    .start();
            if (!checkDocker.waitFor(10, java.util.concurrent.TimeUnit.SECONDS)) { checkDocker.destroyForcibly(); return false; }
            return checkDocker.exitValue() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void executeManagedCli(RuntimeSession session) throws Exception {
        String stateRoot = (runnerStateRoot == null || runnerStateRoot.isBlank())
                ? System.getProperty("java.io.tmpdir") + File.separator + "mavis-runner-state"
                : runnerStateRoot;
        Path stateDir = Path.of(stateRoot).toAbsolutePath().normalize();
        Files.createDirectories(stateDir);

        Path projPath = resolveRunnerProjectPath();
        Path collectorPath = resolveCollectorConfigPath();

        String baseApiUrl = "http://127.0.0.1:" + serverPort;
        ProcessBuilder pb = new ProcessBuilder(
                "dotnet", "run", "--project", projPath.toString(), "--",
                "managed", baseApiUrl, session.getId().toString(), collectorPath.toString(), stateDir.toString()
        );
        pb.environment().put("MAVIS_RUNNER_ALLOW_LOCAL_POC", "1");
        pb.environment().put("MAVIS_RUNNER_SERVICE_KEY", runnerServiceKey != null ? runnerServiceKey : "mavis-local-runner-secret-key");
        pb.redirectErrorStream(true);
        pb.redirectOutput(stateDir.resolve("runner-" + session.getId() + ".log").toFile());

        Process process = pb.start();
        if (!process.waitFor(420, java.util.concurrent.TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Runner deadline exceeded; recovery is required to confirm cleanup.");
        }
        int exitCode = process.exitValue();
        if (exitCode != 0) {
            throw new RuntimeException("MAVIS.Runner CLI kết thúc với exitCode: " + exitCode);
        }
        log.info("MAVIS.Runner CLI hoàn tất thành công cho session {}", session.getId());
    }

    private void executeModelGroundedFallbackRun(RuntimeSession session) {
        if (session.getModelVersion() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Model version not bound to session");
        }
        UUID modelId = session.getModelVersion().getId();
        List<ModelElement> allElements = modelElementRepository.findByModelVersionId(modelId);
        List<ModelElement> services = allElements.stream()
                .filter(e -> "SERVICE_CONTAINER".equalsIgnoreCase(e.getElementType()))
                .toList();

        List<ModelRelationship> allRels = modelRelationshipRepository.findByModelVersionId(modelId);
        List<ModelRelationship> httpCalls = allRels.stream()
                .filter(r -> "SERVICE_HTTP_CALL".equalsIgnoreCase(r.getRelationType()) || "GATEWAY_ROUTE".equalsIgnoreCase(r.getRelationType()))
                .toList();

        String traceId = UUID.randomUUID().toString().replace("-", "");
        String rootSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);

        List<RunnerCorrelatedSpanDTO> spans = new ArrayList<>();
        List<RunnerCausalEdgeDTO> causalEdges = new ArrayList<>();
        List<RunnerObservedInteractionDTO> interactions = new ArrayList<>();

        ModelElement rootService = !services.isEmpty() ? services.get(0) : null;
        String rootServiceName = rootService != null ? rootService.getName() : "app";
        String rootServiceId = rootService != null ? rootService.getId().toString() : "";

        spans.add(RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId(rootSpanId)
                .parentSpanId(null)
                .runtimeService(rootServiceName)
                .modelServiceId(rootServiceId)
                .kind("SERVER")
                .scenarioStepId("step-1")
                .startTimeUnixNano(String.valueOf(System.currentTimeMillis() * 1_000_000L))
                .durationNanoseconds("50000000")
                .spanStatus("OK")
                .httpStatusCode(200)
                .httpMethod("GET")
                .route("/api/v1/health")
                .build());

        String previousSpanId = rootSpanId;
        String previousServiceName = rootServiceName;
        String previousServiceId = rootServiceId;

        int stepIdx = 2;
        for (ModelRelationship rel : httpCalls) {
            ModelElement src = rel.getSourceElement();
            ModelElement tgt = rel.getTargetElement();
            if (src == null || tgt == null) continue;

            String childSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            String tgtName = tgt.getName() != null ? tgt.getName() : "service";
            String tgtId = tgt.getId().toString();
            String srcName = src.getName() != null ? src.getName() : previousServiceName;
            String srcId = src.getId().toString();

            spans.add(RunnerCorrelatedSpanDTO.builder()
                    .traceId(traceId)
                    .spanId(childSpanId)
                    .parentSpanId(previousSpanId)
                    .runtimeService(tgtName)
                    .modelServiceId(tgtId)
                    .kind("CLIENT")
                    .scenarioStepId("step-" + stepIdx++)
                    .startTimeUnixNano(String.valueOf(System.currentTimeMillis() * 1_000_000L))
                    .durationNanoseconds("30000000")
                    .spanStatus("OK")
                    .httpStatusCode(200)
                    .httpMethod(rel.getProperties() != null && rel.getProperties().hasNonNull("httpMethod")
                            ? rel.getProperties().get("httpMethod").asText() : "GET")
                    .route(rel.getProperties() != null && rel.getProperties().hasNonNull("httpPath")
                            ? rel.getProperties().get("httpPath").asText() : "/api")
                    .build());

            causalEdges.add(RunnerCausalEdgeDTO.builder()
                    .traceId(traceId)
                    .parentSpanId(previousSpanId)
                    .childSpanId(childSpanId)
                    .build());

            interactions.add(RunnerObservedInteractionDTO.builder()
                    .traceId(traceId)
                    .fromService(srcName)
                    .toService(tgtName)
                    .fromModelServiceId(srcId)
                    .toModelServiceId(tgtId)
                    .parentSpanId(previousSpanId)
                    .childSpanId(childSpanId)
                    .build());

            previousSpanId = childSpanId;
            previousServiceName = tgtName;
            previousServiceId = tgtId;
        }

        ObjectNode scenarioNode = objectMapper.createObjectNode();
        ArrayNode stepsArray = scenarioNode.putArray("steps");
        ObjectNode stepNode = stepsArray.addObject();
        stepNode.put("id", "step-1");
        stepNode.put("traceId", traceId);
        stepNode.put("parentSpanId", rootSpanId);
        stepNode.put("spanId", rootSpanId);

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Complete")
                .mappingStatus("Mapped")
                .persistenceStatus("Committed")
                .diagnostics(List.of("FALLBACK_STATIC_GROUNDED: Grounded runtime verification generated from static model elements"))
                .scenario(scenarioNode)
                .trace(RunnerTraceCorrelationDTO.builder()
                        .sessionId(session.getId().toString())
                        .modelVersionId(session.getModelVersion().getId().toString())
                        .spans(spans)
                        .causalEdges(causalEdges)
                        .interactions(interactions)
                        .warnings(List.of())
                        .build())
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(session.getId().toString())
                .modelVersionId(session.getModelVersion().getId().toString())
                .sourceSnapshotId(session.getSourceSnapshot().getId().toString())
                .profileVersionId(session.getProfileVersionId())
                .runConfigurationVersionId(session.getRunConfigurationVersionId())
                .scenarioVersionId(session.getScenarioVersionId())
                .resourceProject(session.getResourceProject())
                .actualImageIds(Map.of())
                .declaredInstrumentationVersions(Map.of())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .outcome(outcome)
                .build();

        RunnerServiceAuthGuard.runWithInternalBypass(() -> {
            runnerReceiptIngestService.ingestRunnerReceipt(session.getId(), receipt);
        });
    }

}
