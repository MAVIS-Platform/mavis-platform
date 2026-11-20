package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeRunnerDispatcher {

    private static final String DEFAULT_RUNNER_PROJECT_PATH = "../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj";
    private static final String DEFAULT_COLLECTOR_CONFIG_PATH = "samples/runtime-poc/collector.yaml";
    private static final Pattern SECRET_KEY_PATTERN = Pattern.compile("^[A-Za-z0-9_]{1,128}$");
    private static final List<String> RESERVED_ENV_PREFIXES = List.of(
            "OTEL_", "JAVA_", "JDK_", "DOTNET_", "CORECLR_", "LD_", "MAVIS_");

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

    @Value("${mavis.runner.service-key:}")
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

    boolean hasValidRunnerServiceKey() {
        return runnerServiceKey != null
                && !runnerServiceKey.isBlank()
                && !"mavis-local-runner-secret-key".equals(runnerServiceKey);
    }

    public CompletableFuture<Void> dispatchSessionAsync(UUID sessionId) {
        return CompletableFuture.runAsync(() -> {
            try {
                executeSessionInternal(sessionId);
            } catch (Exception e) {
                log.error("Runtime dispatch failed for {}", sessionId, e);
                recordAsyncDispatchFailure(sessionId, e);
            }
        });
    }

    void recordAsyncDispatchFailure(UUID sessionId, Exception e) {
        runtimeSessionRepository.findById(sessionId).ifPresent(session -> {
            if (isTerminalOrCommitted(session)) {
                return;
            }
            if (tryAutoImportOutboxReceipt(session)) {
                return;
            }
            String execStatus = session.getExecutionStatus() != null ? session.getExecutionStatus().toUpperCase(Locale.ROOT) : "";
            boolean allocated = Set.of("ALLOCATED", "RUNNING", "CANCELLING").contains(execStatus);
            session.setExecutionStatus("FAILED");
            if (!allocated) {
                session.setScenarioStatus("NOT_RUN");
                session.setCleanupStatus("NOT_APPLICABLE");
            } else {
                session.setCleanupStatus("UNCONFIRMED");
            }
            session.setCompletedAt(java.time.OffsetDateTime.now());

            List<String> logTail = readRedactedRunnerLogTail(sessionId);
            String rawMessage = (e != null && e.getMessage() != null && !e.getMessage().isBlank())
                    ? e.getMessage()
                    : "No synthetic trace was generated. Check runner availability and recovery status.";
            String redactedReason = SecretRedactor.redactString(rawMessage);

            ObjectNode recovery = objectMapper.createObjectNode();
            boolean preflightFailed = logTail.stream().anyMatch("MAVIS_RUNTIME_DIAGNOSTIC=PREFLIGHT_FAILED"::equals);
            recovery.put("code", allocated ? "RUNNER_FAILED_RECOVERY_REQUIRED"
                    : preflightFailed ? "PREFLIGHT_FAILED" : "RUNNER_UNAVAILABLE");
            recovery.put("reason", redactedReason);
            recovery.put("message", redactedReason);
            if (!logTail.isEmpty()) {
                ArrayNode diagArr = recovery.putArray("diagnostics");
                logTail.forEach(diagArr::add);
            }
            session.setRecoveryResultJson(recovery);
            runtimeSessionRepository.save(session);
        });
    }

    private static boolean isTerminalOrCommitted(RuntimeSession session) {
        if (session == null) {
            return true;
        }
        if (session.getReceiptDigest() != null || session.getRunnerReceiptJson() != null || session.getCompletedAt() != null) {
            return true;
        }
        String exec = session.getExecutionStatus() != null ? session.getExecutionStatus().toUpperCase(Locale.ROOT) : "";
        return Set.of("COMPLETED", "CANCELLED", "FAILED", "TIMED_OUT", "TIMEOUT").contains(exec);
    }

    private final java.util.concurrent.ConcurrentHashMap<UUID, Object> sessionLocks = new java.util.concurrent.ConcurrentHashMap<>();

    public boolean isAllowSimulatedFallback() {
        return false;
    }

    public RuntimeSessionResponseDTO dispatchSession(UUID sessionId) {
        executeSessionInternal(sessionId);
        return runtimeSessionService.getSessionById(sessionId);
    }

    void executeSessionInternal(UUID sessionId) {
        Object lock = sessionLocks.computeIfAbsent(sessionId, k -> new Object());
        synchronized (lock) {
            try {
                log.info("Bắt đầu điều phối thực thi phiên thực nghiệm {}", sessionId);

                RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy session: " + sessionId));

                if (isTerminalOrCommitted(session)) {
                    log.info("Phiên thực nghiệm {} đã kết thúc ({}), trả về kết quả idempotent", sessionId, session.getExecutionStatus());
                    return;
                }

                if (tryAutoImportOutboxReceipt(session)) {
                    return;
                }

                boolean managedAvailable = ("AUTO".equalsIgnoreCase(runnerMode) || "MANAGED_CLI".equalsIgnoreCase(runnerMode))
                        && isManagedCliEnvironmentAvailable();

                if (!managedAvailable) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Runtime runner unavailable. No application was executed and no observed trace was generated.");
                }

                if (!hasValidRunnerServiceKey()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST,
                            "Dedicated runner credential (MAVIS_RUNNER_SERVICE_KEY) is not configured on backend. No synthetic trace was generated.");
                }

                if ("NOT_STARTED".equalsIgnoreCase(session.getExecutionStatus()) || "PENDING".equalsIgnoreCase(session.getScenarioStatus())) {
                    session.setScenarioStatus("APPROVED");
                    session.setExecutionStatus("READY_FOR_DISPATCH");
                    session = runtimeSessionRepository.save(session);
                }

                try {
                    executeManagedCli(session);
                } catch (Exception failure) {
                    log.warn("Managed runtime execution failed for {}", sessionId, failure);
                    String detail = failure.getMessage() != null && !failure.getMessage().isBlank()
                            ? SecretRedactor.redactString(failure.getMessage())
                            : "Check runner status.";
                    throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR,
                            "Runtime execution failed. No synthetic trace was substituted. " + detail);
                }
            } catch (BusinessException be) {
                throw be;
            } catch (Exception executionFailure) {
                log.error("Runtime execution failed for {}", sessionId, executionFailure);
                throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Runtime execution failed. Check runner diagnostics.");
            } finally {
                sessionLocks.remove(sessionId, lock);
            }
        }
    }

    Path resolveRunnerProjectPath() {
        String configured = runnerProjectPath != null ? runnerProjectPath.trim() : "";
        if (!configured.isEmpty() && !DEFAULT_RUNNER_PROJECT_PATH.equals(configured)) {
            return Path.of(configured).toAbsolutePath().normalize();
        }
        List<Path> candidates = List.of(
                Path.of(DEFAULT_RUNNER_PROJECT_PATH),
                Path.of("../../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj"),
                Path.of("../../../MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj"),
                Path.of("MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj"),
                Path.of("/app/runner/MAVIS.Runner.dll"),
                Path.of("runner/MAVIS.Runner.dll")
        );
        for (Path p : candidates) {
            Path abs = p.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs)) {
                return abs;
            }
        }
        return Path.of(DEFAULT_RUNNER_PROJECT_PATH).toAbsolutePath().normalize();
    }

    Path resolveCollectorConfigPath() {
        String configured = collectorConfigPath != null ? collectorConfigPath.trim() : "";
        if (!configured.isEmpty() && !DEFAULT_COLLECTOR_CONFIG_PATH.equals(configured)) {
            Path explicit = Path.of(configured).toAbsolutePath().normalize();
            if (Files.isRegularFile(explicit)) {
                return explicit;
            }
            return explicit;
        }
        List<Path> candidates = List.of(
                Path.of(DEFAULT_COLLECTOR_CONFIG_PATH),
                Path.of("../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
                Path.of("../../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
                Path.of("../../../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
                Path.of("MAVIS.Worker/samples/runtime-poc/collector.yaml"),
                Path.of("/app/samples/runtime-poc/collector.yaml")
        );
        for (Path p : candidates) {
            Path abs = p.toAbsolutePath().normalize();
            if (Files.isRegularFile(abs)) {
                return abs;
            }
        }
        return Path.of(DEFAULT_COLLECTOR_CONFIG_PATH).toAbsolutePath().normalize();
    }

    Optional<Path> resolvePrebuiltRunnerDll(Path projPath, boolean requireFresh) {
        if (projPath == null || !Files.isRegularFile(projPath)) {
            return Optional.empty();
        }
        String fileName = projPath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".dll")) {
            return Optional.of(projPath);
        }
        Path projDir = projPath.getParent();
        if (projDir == null) {
            return Optional.empty();
        }
        List<Path> dllCandidates = List.of(
                projDir.resolve("bin/Release/net10.0/MAVIS.Runner.dll"),
                projDir.resolve("bin/Debug/net10.0/MAVIS.Runner.dll")
        );
        Path newestDll = null;
        FileTime newestTime = null;
        for (Path candidate : dllCandidates) {
            Path normalized = candidate.toAbsolutePath().normalize();
            Path runtimeConfig = normalized.resolveSibling("MAVIS.Runner.runtimeconfig.json");
            if (Files.isRegularFile(normalized) && Files.isRegularFile(runtimeConfig)) {
                try {
                    FileTime ft = Files.getLastModifiedTime(normalized);
                    if (newestDll == null || ft.compareTo(newestTime) > 0) {
                        newestDll = normalized;
                        newestTime = ft;
                    }
                } catch (Exception ignored) {
                }
            }
        }
        if (newestDll == null || newestTime == null) {
            return Optional.empty();
        }
        if (requireFresh) {
            try {
                if (Files.getLastModifiedTime(projPath).compareTo(newestTime) > 0) {
                    return Optional.empty();
                }
                try (Stream<Path> csFiles = Files.list(projDir)) {
                    final FileTime dllTime = newestTime;
                    boolean hasNewerSource = csFiles
                            .filter(Files::isRegularFile)
                            .filter(p -> p.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".cs"))
                            .anyMatch(p -> {
                                try {
                                    return Files.getLastModifiedTime(p).compareTo(dllTime) > 0;
                                } catch (Exception e) {
                                    return false;
                                }
                            });
                    if (hasNewerSource) {
                        return Optional.empty();
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return Optional.of(newestDll);
    }

    static List<String> buildSecretAllowlist(Map<String, String> projectEnv) {
        if (projectEnv == null || projectEnv.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> keys = new ArrayList<>();
        for (String key : projectEnv.keySet()) {
            if (key == null || !SECRET_KEY_PATTERN.matcher(key).matches()) {
                continue;
            }
            String upper = key.toUpperCase(Locale.ROOT);
            boolean reserved = RESERVED_ENV_PREFIXES.stream().anyMatch(upper::startsWith);
            if (!reserved) {
                keys.add(key);
                if (keys.size() >= 64) {
                    break;
                }
            }
        }
        return keys;
    }

    Path resolveStateDir() {
        String stateRoot = (runnerStateRoot == null || runnerStateRoot.isBlank())
                ? System.getProperty("java.io.tmpdir") + File.separator + "mavis-runner-state"
                : runnerStateRoot;
        return Path.of(stateRoot).toAbsolutePath().normalize();
    }

    boolean tryAutoImportOutboxReceipt(RuntimeSession session) {
        if (session == null || session.getId() == null) {
            return false;
        }
        if (session.getReceiptDigest() != null || session.getRunnerReceiptJson() != null) {
            return false;
        }
        String resProj = session.getResourceProject();
        if (resProj == null || resProj.isBlank()) {
            return false;
        }
        Path outboxFile = resolveStateDir().resolve("receipts").resolve(resProj + ".json").normalize();
        if (!Files.isRegularFile(outboxFile)) {
            return false;
        }
        try {
            RunnerServiceAuthGuard.runWithInternalBypass(() ->
                    runnerReceiptIngestService.importReceiptFromStateRoot(session.getId(), resProj));
            log.info("Đã tự động đồng bộ receipt outbox cho session {} ({})", session.getId(), resProj);
            return true;
        } catch (Exception ex) {
            log.warn("Không thể tự động import receipt outbox cho session {}: {}", session.getId(), ex.getMessage());
            return false;
        }
    }

    List<String> readRedactedRunnerLogTail(UUID sessionId) {
        if (sessionId == null) {
            return Collections.emptyList();
        }
        Path logFile = resolveStateDir().resolve("runner-" + sessionId + ".log");
        if (!Files.isRegularFile(logFile)) {
            return Collections.emptyList();
        }
        try {
            List<String> allLines = Files.readAllLines(logFile, StandardCharsets.UTF_8);
            List<String> nonBlank = new ArrayList<>();
            for (String line : allLines) {
                if (line != null && !line.isBlank()) {
                    String redacted = SecretRedactor.redactString(line.trim());
                    if (redacted != null && !redacted.isBlank()) {
                        nonBlank.add(redacted.length() > 300 ? redacted.substring(0, 300) + "..." : redacted);
                    }
                }
            }
            int from = Math.max(0, nonBlank.size() - 8);
            return new ArrayList<>(nonBlank.subList(from, nonBlank.size()));
        } catch (Exception ignored) {
            return Collections.emptyList();
        }
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
            boolean hasPrebuiltDll = resolvePrebuiltRunnerDll(projPath, false).isPresent();
            if (!probeCommandZeroExit(hasPrebuiltDll ? List.of("dotnet", "--list-runtimes") : List.of("dotnet", "--version"), 10)) {
                return false;
            }
            return probeCommandZeroExit(List.of("docker", "info"), 10);
        } catch (Exception ignored) {
            return false;
        }
    }

    static boolean probeCommandZeroExit(List<String> cmd, int timeoutSeconds) {
        try {
            Process proc = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            Thread.ofVirtual().start(() -> {
                try (var in = proc.getInputStream()) {
                    in.transferTo(java.io.OutputStream.nullOutputStream());
                } catch (Exception ignored) {}
            });
            if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                proc.destroyForcibly();
                return false;
            }
            return proc.exitValue() == 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    static String captureCommandStdout(List<String> cmd, int timeoutSeconds) {
        try {
            Process proc = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            byte[] out = proc.getInputStream().readAllBytes();
            if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS) || proc.exitValue() != 0) {
                proc.destroyForcibly();
                return null;
            }
            return new String(out, StandardCharsets.UTF_8).trim();
        } catch (Exception ignored) {
            return null;
        }
    }

    private RuntimeSession ensureRunnerHostPrerequisites(RuntimeSession session, Path projPath) {
        if (session == null || session.getScenarioConfig() == null || !session.getScenarioConfig().isObject()) {
            return session;
        }
        try {
            com.fasterxml.jackson.databind.JsonNode profileNode = session.getScenarioConfig().path("profile");
            if (!(profileNode instanceof ObjectNode profile)) {
                return session;
            }
            String volumeName = profile.path("instrumentationVolume").asText("mavis-agents-v1").trim();
            if (volumeName.matches("[A-Za-z0-9][A-Za-z0-9_.-]{0,63}")) {
                String labels = captureCommandStdout(List.of("docker", "volume", "inspect", "--format", "{{json .Labels}}", volumeName), 10);
                if (labels == null || !labels.contains("1.17.0") || !labels.contains("2.32.0") || !labels.contains("\"mavis.bundle.rev\":\"2\"")) {
                    for (Path b : List.of(
                            Path.of("/app/otel-bundle"),
                            Path.of("../MAVIS.Worker/samples/runtime-poc/artifacts/bundle"),
                            Path.of("../../MAVIS.Worker/samples/runtime-poc/artifacts/bundle"),
                            Path.of("MAVIS.Worker/samples/runtime-poc/artifacts/bundle"))) {
                        Path absBundle = b.toAbsolutePath().normalize();
                        if (Files.isDirectory(absBundle.resolve("java")) && Files.isDirectory(absBundle.resolve("dotnet"))) {
                            String helperImg = "mcr.microsoft.com/dotnet/aspnet@sha256:d5633778c754e89a386882eddf8dbee6942447a8a4b8267c19cf1e1158d0b0ac";
                            probeCommandZeroExit(List.of("docker", "volume", "rm", "-f", volumeName), 10);
                            probeCommandZeroExit(List.of("docker", "volume", "create",
                                    "--label", "mavis.poc.managed=true",
                                    "--label", "mavis.bundle.rev=2",
                                    "--label", "mavis.dotnet.version=1.17.0",
                                    "--label", "mavis.java.version=2.32.0",
                                    volumeName), 15);
                            probeCommandZeroExit(List.of("docker", "pull", helperImg), 120);
                            String tmpContainer = "mavis-agent-seed-" + UUID.randomUUID().toString().substring(0, 8);
                            boolean seeded = false;
                            try {
                                if (probeCommandZeroExit(List.of("docker", "create", "--name", tmpContainer, "-v", volumeName + ":/agents", helperImg), 20)) {
                                    seeded = probeCommandZeroExit(List.of("docker", "cp", absBundle.toString() + "/.", tmpContainer + ":/agents/"), 30);
                                }
                            } finally {
                                probeCommandZeroExit(List.of("docker", "rm", "-f", tmpContainer), 10);
                            }
                            if (!seeded) {
                                probeCommandZeroExit(List.of("docker", "volume", "rm", "-f", volumeName), 10);
                            }
                            break;
                        }
                    }
                }
            }

            String configuredRunnerImg = profile.path("scenarioRunnerImage").asText("").trim();
            boolean needsBuiltRunnerImg = configuredRunnerImg.isEmpty()
                    || configuredRunnerImg.startsWith("mcr.microsoft.com/dotnet/aspnet")
                    || configuredRunnerImg.endsWith("0000000000000000000000000000000000000000000000000000000000000001");
            if (needsBuiltRunnerImg) {
                String runnerImgId = captureCommandStdout(List.of("docker", "image", "inspect", "--format", "{{.Id}}", "mavis-poc-runner:2"), 10);
                if (runnerImgId == null || !runnerImgId.matches("^sha256:[0-9a-f]{64}$")) {
                    Optional<Path> dllOpt = resolvePrebuiltRunnerDll(projPath, false);
                    Path dllDir = dllOpt.map(Path::getParent).orElse(null);
                    Path dockerfile = null;
                    for (Path df : List.of(
                            Path.of("/app/samples/runtime-poc/Runner.Dockerfile"),
                            Path.of("../MAVIS.Worker/samples/runtime-poc/Runner.Dockerfile"),
                            Path.of("../../MAVIS.Worker/samples/runtime-poc/Runner.Dockerfile"),
                            Path.of("MAVIS.Worker/samples/runtime-poc/Runner.Dockerfile"))) {
                        if (Files.isRegularFile(df.toAbsolutePath().normalize())) {
                            dockerfile = df.toAbsolutePath().normalize();
                            break;
                        }
                    }
                    if (dllDir != null && Files.isDirectory(dllDir) && dockerfile != null) {
                        Path buildCtx = Files.createTempDirectory("mavis-runner-img-");
                        try {
                            Path pubDir = buildCtx.resolve("artifacts/runner-publish");
                            Files.createDirectories(pubDir);
                            try (Stream<Path> files = Files.list(dllDir)) {
                                for (Path f : files.filter(Files::isRegularFile).toList()) {
                                    Files.copy(f, pubDir.resolve(f.getFileName()));
                                }
                            }
                            Path dfCopy = buildCtx.resolve("Runner.Dockerfile");
                            Files.copy(dockerfile, dfCopy);
                            probeCommandZeroExit(List.of("docker", "build", "--quiet", "--file", dfCopy.toString(), "-t", "mavis-poc-runner:2", buildCtx.toString()), 120);
                        } finally {
                            try (Stream<Path> walk = Files.walk(buildCtx)) {
                                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                                    try { Files.deleteIfExists(p); } catch (Exception ignored) {}
                                });
                            }
                        }
                        runnerImgId = captureCommandStdout(List.of("docker", "image", "inspect", "--format", "{{.Id}}", "mavis-poc-runner:2"), 10);
                    }
                }
                if (runnerImgId != null && runnerImgId.matches("^sha256:[0-9a-f]{64}$")) {
                    profile.put("scenarioRunnerImage", runnerImgId);
                    session.setScenarioConfig(session.getScenarioConfig().deepCopy());
                    session = runtimeSessionRepository.save(session);
                }
            }
        } catch (Exception ex) {
            log.warn("Không thể tự động chuẩn bị host runner artifacts cho session {}: {}", session.getId(), ex.getMessage());
        }
        return session;
    }

    private void executeManagedCli(RuntimeSession session) throws Exception {
        Path stateDir = resolveStateDir();
        Files.createDirectories(stateDir);

        Path projPath = resolveRunnerProjectPath();
        Path collectorPath = resolveCollectorConfigPath();
        session = ensureRunnerHostPrerequisites(session, projPath);
        String baseApiUrl = "http://127.0.0.1:" + serverPort;

        Optional<Path> freshDll = resolvePrebuiltRunnerDll(projPath, true);
        List<String> command = freshDll.isPresent()
                ? List.of("dotnet", freshDll.get().toString(), "managed", baseApiUrl, session.getId().toString(), collectorPath.toString(), stateDir.toString())
                : List.of("dotnet", "run", "--project", projPath.toString(), "--", "managed", baseApiUrl, session.getId().toString(), collectorPath.toString(), stateDir.toString());

        int exitCode = runRunnerProcess(session, command, stateDir);

        if (exitCode != 0 && freshDll.isEmpty()) {
            Optional<Path> fallbackDll = resolvePrebuiltRunnerDll(projPath, false);
            List<String> logTail = readRedactedRunnerLogTail(session.getId());
            boolean sdkMismatch = logTail.stream().anyMatch(l -> l.contains("global.json") || l.contains("NETSDK"));
            if (fallbackDll.isPresent() && sdkMismatch) {
                log.info("dotnet run gặp lỗi SDK pin (global.json), chuyển sang prebuilt DLL cho session {}", session.getId());
                exitCode = runRunnerProcess(
                        session,
                        List.of("dotnet", fallbackDll.get().toString(), "managed", baseApiUrl, session.getId().toString(), collectorPath.toString(), stateDir.toString()),
                        stateDir);
            }
        }

        RuntimeSession refreshed = runtimeSessionRepository.findById(session.getId()).orElse(session);
        if (refreshed.getReceiptDigest() == null && refreshed.getRunnerReceiptJson() == null) {
            if (tryAutoImportOutboxReceipt(refreshed)) {
                refreshed = runtimeSessionRepository.findById(session.getId()).orElse(refreshed);
            }
        }
        if (isTerminalOrCommitted(refreshed)) {
            log.info("MAVIS.Runner CLI hoàn tất (exitCode={}) với receipt đã commit cho session {}", exitCode, session.getId());
            return;
        }
        if (exitCode != 0) {
            List<String> logTail = readRedactedRunnerLogTail(session.getId());
            String detail = logTail.isEmpty() ? "" : (" - " + logTail.get(logTail.size() - 1));
            throw new RuntimeException("MAVIS.Runner CLI exited with code " + exitCode + detail);
        }
        log.info("MAVIS.Runner CLI hoàn tất thành công cho session {}", session.getId());
    }

    private int runRunnerProcess(RuntimeSession session, List<String> command, Path stateDir) throws Exception {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.environment().put("MAVIS_RUNNER_ALLOW_LOCAL_POC", "1");
        pb.environment().put("MAVIS_RUNNER_SERVICE_KEY", runnerServiceKey);
        if (session.getProject() != null && session.getProject().getId() != null) {
            Map<String, String> projectEnv = runtimeSessionService.getProjectExecutionEnvironment(session.getProject().getId());
            if (projectEnv != null && !projectEnv.isEmpty()) {
                pb.environment().putAll(projectEnv);
                List<String> allowlist = buildSecretAllowlist(projectEnv);
                if (!allowlist.isEmpty()) {
                    pb.environment().put("MAVIS_RUNNER_SECRET_ALLOWLIST", String.join(",", allowlist));
                }
            }
        }
        pb.redirectErrorStream(true);
        pb.redirectOutput(stateDir.resolve("runner-" + session.getId() + ".log").toFile());

        Process process = pb.start();
        if (!process.waitFor(420, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("Runner deadline exceeded; recovery is required to confirm cleanup.");
        }
        return process.exitValue();
    }
}
