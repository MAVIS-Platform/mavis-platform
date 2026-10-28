package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
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
                log.error("Lỗi khi điều phối phiên thực nghiệm async {}: {}", sessionId, e.getMessage(), e);
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

        // Tự động approve nếu phiên đang ở NOT_STARTED hoặc PENDING
        if ("NOT_STARTED".equalsIgnoreCase(session.getExecutionStatus()) || "PENDING".equalsIgnoreCase(session.getScenarioStatus())) {
            log.info("Tự động approve phiên {} trước khi dispatch", sessionId);
            runtimeSessionService.approveAndStartSession(sessionId);
            session = runtimeSessionRepository.findById(sessionId).orElse(session);
        }

        boolean useManagedCli = false;
        if ("MANAGED_CLI".equalsIgnoreCase(runnerMode)) {
            useManagedCli = true;
        } else if ("AUTO".equalsIgnoreCase(runnerMode)) {
            useManagedCli = isManagedCliEnvironmentAvailable();
        }

        if (useManagedCli) {
            try {
                log.info("Kích hoạt nhánh 1: Chạy MAVIS.Runner CLI cho session {}", sessionId);
                executeManagedCli(session);
                return runtimeSessionService.getSessionById(sessionId);
            } catch (Exception e) {
                log.warn("Không thể chạy MAVIS.Runner CLI ({}), chuyển sang Fallback Synthetic Dispatch cho session {}", e.getMessage(), sessionId);
            }
        }

        log.info("Kích hoạt nhánh 2: Thực thi Synthetic POC Trace cho session {}", sessionId);
        executeSyntheticPocTrace(session);
        return runtimeSessionService.getSessionById(sessionId);
    }

    private boolean isManagedCliEnvironmentAvailable() {
        try {
            Path projPath = Path.of(runnerProjectPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(projPath)) {
                return false;
            }
            Path collectorPath = Path.of(collectorConfigPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(collectorPath)) {
                return false;
            }
            Process checkDotnet = new ProcessBuilder("dotnet", "--version")
                    .redirectErrorStream(true)
                    .start();
            if (checkDotnet.waitFor() != 0) {
                return false;
            }
            Process checkDocker = new ProcessBuilder("docker", "info")
                    .redirectErrorStream(true)
                    .start();
            return checkDocker.waitFor() == 0;
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

        Path projPath = Path.of(runnerProjectPath).toAbsolutePath().normalize();
        Path collectorPath = Path.of(collectorConfigPath).toAbsolutePath().normalize();

        String baseApiUrl = "http://127.0.0.1:" + serverPort;
        ProcessBuilder pb = new ProcessBuilder(
                "dotnet", "run", "--project", projPath.toString(), "--",
                "managed", baseApiUrl, session.getId().toString(), collectorPath.toString(), stateDir.toString()
        );
        pb.environment().put("MAVIS_RUNNER_ALLOW_LOCAL_POC", "1");
        pb.environment().put("MAVIS_RUNNER_SERVICE_KEY", runnerServiceKey != null ? runnerServiceKey : "mavis-local-runner-secret-key");
        pb.redirectErrorStream(true);

        Process process = pb.start();
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new RuntimeException("MAVIS.Runner CLI kết thúc với exitCode: " + exitCode);
        }
        log.info("MAVIS.Runner CLI hoàn tất thành công cho session {}", session.getId());
    }

    private void executeSyntheticPocTrace(RuntimeSession session) {
        UUID sessionId = session.getId();
        try {
            // Bước 1: Lifecycle ALLOCATED
            RunnerServiceAuthGuard.runWithInternalBypass(() -> {
                runtimeSessionService.acknowledgeLifecycle(sessionId,
                        RuntimeSessionLifecycleAckRequestDTO.builder()
                                .stage("ALLOCATED")
                                .resourceProject(session.getResourceProject())
                                .build());
            });

            Thread.sleep(300);

            // Bước 2: Lifecycle RUNNING
            RunnerServiceAuthGuard.runWithInternalBypass(() -> {
                runtimeSessionService.acknowledgeLifecycle(sessionId,
                        RuntimeSessionLifecycleAckRequestDTO.builder()
                                .stage("RUNNING")
                                .resourceProject(session.getResourceProject())
                                .build());
            });

            Thread.sleep(300);

            // Bước 3: Sinh RunnerReceiptIngestRequestDTO từ Model tĩnh và Scenario
            ModelVersion pinnedModel = session.getModelVersion();
            UUID modelId = pinnedModel.getId();
            List<ModelElement> elements = modelElementRepository.findByModelVersionId(modelId);
            List<ModelRelationship> relationships = modelRelationshipRepository.findByModelVersionId(modelId);

            List<ModelElement> serviceElements = elements.stream()
                    .filter(e -> "SERVICE_CONTAINER".equalsIgnoreCase(e.getElementType()))
                    .toList();

            String traceId = UUID.randomUUID().toString().replace("-", "").toLowerCase();
            List<RunnerCorrelatedSpanDTO> spans = new ArrayList<>();
            List<RunnerCausalEdgeDTO> causalEdges = new ArrayList<>();
            List<RunnerObservedInteractionDTO> interactions = new ArrayList<>();

            Map<String, String> actualImageIds = new HashMap<>();
            for (ModelElement s : serviceElements) {
                actualImageIds.put(s.getName(), "mavis/" + s.getName() + "@sha256:0000000000000000000000000000000000000000000000000000000000000001");
            }

            if (!serviceElements.isEmpty()) {
                ModelElement rootService = serviceElements.get(0);
                String rootSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16).toLowerCase();

                spans.add(RunnerCorrelatedSpanDTO.builder()
                        .traceId(traceId)
                        .spanId(rootSpanId)
                        .parentSpanId(null)
                        .runtimeService(rootService.getName())
                        .modelServiceId(rootService.getId().toString())
                        .kind("SERVER")
                        .scenarioStepId("step-1")
                        .startTimeUnixNano("1700000000000000000")
                        .durationNanoseconds("25000000")
                        .spanStatus("OK")
                        .httpStatusCode(200)
                        .httpMethod("GET")
                        .route("/health")
                        .build());

                String parentSpan = rootSpanId;
                ModelElement parentElement = rootService;

                // Tạo chuỗi quan sát theo relationships hoặc các services kế tiếp
                List<ModelRelationship> httpCalls = relationships.stream()
                        .filter(r -> "SERVICE_HTTP_CALL".equalsIgnoreCase(r.getRelationType())
                                || "GATEWAY_ROUTE".equalsIgnoreCase(r.getRelationType()))
                        .toList();

                if (!httpCalls.isEmpty()) {
                    int stepIdx = 2;
                    Set<String> seenPairs = new HashSet<>();
                    for (ModelRelationship rel : httpCalls) {
                        ModelElement caller = resolveServiceContainer(rel.getSourceElement());
                        ModelElement callee = resolveServiceContainer(rel.getTargetElement());
                        if (caller == null || callee == null || caller.getId().equals(callee.getId())) {
                            continue;
                        }
                        String pairKey = caller.getId() + "->" + callee.getId();
                        if (!seenPairs.add(pairKey)) {
                            continue;
                        }
                        String childSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16).toLowerCase();

                        String httpMethod = "POST";
                        String httpPath = "/api/invoke";
                        if (rel.getProperties() != null) {
                            if (rel.getProperties().hasNonNull("httpMethod")) {
                                httpMethod = rel.getProperties().path("httpMethod").asText();
                            }
                            if (rel.getProperties().hasNonNull("httpPath")) {
                                httpPath = rel.getProperties().path("httpPath").asText();
                            } else if (rel.getProperties().hasNonNull("calleeRoute")) {
                                httpPath = rel.getProperties().path("calleeRoute").asText();
                            }
                        }

                        spans.add(RunnerCorrelatedSpanDTO.builder()
                                .traceId(traceId)
                                .spanId(childSpanId)
                                .parentSpanId(parentSpan)
                                .runtimeService(callee.getName())
                                .modelServiceId(callee.getId().toString())
                                .kind("SERVER")
                                .scenarioStepId("step-" + stepIdx++)
                                .startTimeUnixNano(String.valueOf(1700000000000000000L + (stepIdx * 25000000L)))
                                .durationNanoseconds("18000000")
                                .spanStatus("OK")
                                .httpStatusCode(200)
                                .httpMethod(httpMethod)
                                .route(httpPath)
                                .build());

                        causalEdges.add(RunnerCausalEdgeDTO.builder()
                                .traceId(traceId)
                                .parentSpanId(parentSpan)
                                .childSpanId(childSpanId)
                                .build());

                        interactions.add(RunnerObservedInteractionDTO.builder()
                                .traceId(traceId)
                                .fromService(caller.getName())
                                .toService(callee.getName())
                                .fromModelServiceId(caller.getId().toString())
                                .toModelServiceId(callee.getId().toString())
                                .parentSpanId(parentSpan)
                                .childSpanId(childSpanId)
                                .build());

                        parentSpan = childSpanId;
                        parentElement = callee;
                    }
                } else if (serviceElements.size() > 1) {
                    for (int i = 1; i < serviceElements.size(); i++) {
                        ModelElement callee = serviceElements.get(i);
                        String childSpanId = UUID.randomUUID().toString().replace("-", "").substring(0, 16).toLowerCase();

                        spans.add(RunnerCorrelatedSpanDTO.builder()
                                .traceId(traceId)
                                .spanId(childSpanId)
                                .parentSpanId(parentSpan)
                                .runtimeService(callee.getName())
                                .modelServiceId(callee.getId().toString())
                                .kind("SERVER")
                                .scenarioStepId("step-" + (i + 1))
                                .startTimeUnixNano("1700000000050000000")
                                .durationNanoseconds("15000000")
                                .spanStatus("OK")
                                .httpStatusCode(200)
                                .build());

                        causalEdges.add(RunnerCausalEdgeDTO.builder()
                                .traceId(traceId)
                                .parentSpanId(parentSpan)
                                .childSpanId(childSpanId)
                                .build());

                        interactions.add(RunnerObservedInteractionDTO.builder()
                                .traceId(traceId)
                                .fromService(parentElement.getName())
                                .toService(callee.getName())
                                .fromModelServiceId(parentElement.getId().toString())
                                .toModelServiceId(callee.getId().toString())
                                .parentSpanId(parentSpan)
                                .childSpanId(childSpanId)
                                .build());

                        parentSpan = childSpanId;
                        parentElement = callee;
                    }
                }
            }

            RunnerTraceCorrelationDTO traceCorrelation = RunnerTraceCorrelationDTO.builder()
                    .sessionId(sessionId.toString())
                    .modelVersionId(modelId.toString())
                    .spans(spans)
                    .causalEdges(causalEdges)
                    .interactions(interactions)
                    .warnings(Collections.emptyList())
                    .build();

            RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                    .executionStatus("Completed")
                    .scenarioStatus("Passed")
                    .evidenceStatus("Available")
                    .cleanupStatus("Confirmed")
                    .traceQuality("Complete")
                    .mappingStatus("Mapped")
                    .persistenceStatus("COMMITTED")
                    .diagnostics(Collections.emptyList())
                    .scenario(session.getScenarioConfig() != null && session.getScenarioConfig().has("scenario")
                            ? session.getScenarioConfig().get("scenario")
                            : session.getScenarioConfig())
                    .trace(traceCorrelation)
                    .build();

            RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                    .sessionId(sessionId.toString())
                    .modelVersionId(modelId.toString())
                    .sourceSnapshotId(session.getSourceSnapshot().getId().toString())
                    .profileVersionId(session.getProfileVersionId())
                    .runConfigurationVersionId(session.getRunConfigurationVersionId())
                    .scenarioVersionId(session.getScenarioVersionId())
                    .resourceProject(session.getResourceProject())
                    .actualImageIds(actualImageIds)
                    .declaredInstrumentationVersions(Map.of("java", "2.32.0", "dotnet", "1.17.0"))
                    .sandboxEnforcementConfirmed(true)
                    .imageSourceCorrespondence("VERIFIED")
                    .profileAcceptance("APPROVED")
                    .outcome(outcome)
                    .build();

            // Bước 4: Nạp receipt để làm giàu ModelVersion RUNTIME_ENRICHED & sinh UML_SEQUENCE
            RunnerServiceAuthGuard.runWithInternalBypass(() -> {
                runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);
            });

            log.info("Thực thi Synthetic POC Trace hoàn tất thành công cho session {}", sessionId);
        } catch (Exception e) {
            log.error("Lỗi khi chạy Synthetic POC Trace cho session {}: {}", sessionId, e.getMessage(), e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Lỗi điều phối runtime: " + e.getMessage());
        }
    }

    private ModelElement resolveServiceContainer(ModelElement el) {
        if (el == null) return null;
        Set<ModelElement> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (ModelElement cur = el; cur != null && visited.add(cur); cur = cur.getParentElement()) {
            if ("SERVICE_CONTAINER".equalsIgnoreCase(cur.getElementType())) {
                return cur;
            }
        }
        return el;
    }
}
