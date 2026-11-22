package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RuntimeRunnerDispatcherTest {

    private String currentBundleLabels() {
        return "{\"mavis.bundle.rev\":\"3\",\"mavis.dotnet.version\":\"1.17.0\","
                + "\"mavis.dotnet.musl.version\":\"1.17.0\",\"mavis.java.version\":\"2.32.0\"}";
    }

    @Test
    void bundleLabelsMustIncludeExactMuslVersion() {
        assertThat(RuntimeRunnerDispatcher.hasCurrentBundleLabels(currentBundleLabels())).isTrue();
        assertThat(RuntimeRunnerDispatcher.hasCurrentBundleLabels(currentBundleLabels()
                .replace("\"mavis.dotnet.musl.version\":\"1.17.0\",", ""))).isFalse();
        assertThat(RuntimeRunnerDispatcher.hasCurrentBundleLabels(currentBundleLabels()
                .replace("1.17.0", "11.17.0"))).isFalse();
        assertThat(RuntimeRunnerDispatcher.hasCurrentBundleLabels("null")).isFalse();
    }

    @Test
    void upgradingBundlePreservesOldSharedVolumeAndSwitchesOnlyAfterCopy() {
        var profile = new ObjectMapper().createObjectNode().put("instrumentationVolume", "mavis-agents-v1");
        var commands = new java.util.ArrayList<List<String>>();
        try (var mocked = mockStatic(RuntimeRunnerDispatcher.class, CALLS_REAL_METHODS)) {
            mocked.when(() -> RuntimeRunnerDispatcher.captureCommandStdout(anyList(), anyInt())).thenReturn(null);
            mocked.when(() -> RuntimeRunnerDispatcher.probeCommandZeroExit(anyList(), anyInt())).thenAnswer(inv -> {
                commands.add(List.copyOf(inv.getArgument(0)));
                return true;
            });
            assertThat(RuntimeRunnerDispatcher.prepareInstrumentationVolume(profile, tempDir)).isTrue();
            assertThat(profile.path("instrumentationVolume").asText()).isEqualTo("mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3");
            assertThat(commands).anyMatch(cmd -> cmd.subList(0, 2).equals(List.of("docker", "cp")));
            assertThat(commands).noneMatch(cmd -> cmd.contains("mavis-agents-v1") || cmd.subList(0, 3).equals(List.of("docker", "volume", "rm")));
        }
    }

    @Test
    void failedBundleCopyKeepsProfileAndRemovesOnlyNewVolume() {
        var profile = new ObjectMapper().createObjectNode().put("instrumentationVolume", "mavis-agents-v1");
        var commands = new java.util.ArrayList<List<String>>();
        try (var mocked = mockStatic(RuntimeRunnerDispatcher.class, CALLS_REAL_METHODS)) {
            mocked.when(() -> RuntimeRunnerDispatcher.captureCommandStdout(anyList(), anyInt())).thenReturn(null);
            mocked.when(() -> RuntimeRunnerDispatcher.probeCommandZeroExit(anyList(), anyInt())).thenAnswer(inv -> {
                List<String> cmd = List.copyOf(inv.getArgument(0));
                commands.add(cmd);
                return !cmd.get(1).equals("cp");
            });
            assertThat(RuntimeRunnerDispatcher.prepareInstrumentationVolume(profile, tempDir)).isFalse();
            assertThat(profile.path("instrumentationVolume").asText()).isEqualTo("mavis-agents-v1");
            assertThat(commands).contains(List.of("docker", "volume", "rm", "mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3"));
            assertThat(commands).noneMatch(cmd -> cmd.contains("mavis-agents-v1"));
        }
    }

    @Test
    void completedVersionedBundleIsReusedWithoutMutatingDockerResources() {
        var profile = new ObjectMapper().createObjectNode().put("instrumentationVolume", "mavis-agents-v1");
        try (var mocked = mockStatic(RuntimeRunnerDispatcher.class, CALLS_REAL_METHODS)) {
            mocked.when(() -> RuntimeRunnerDispatcher.captureCommandStdout(anyList(), anyInt())).thenReturn(currentBundleLabels());
            assertThat(RuntimeRunnerDispatcher.prepareInstrumentationVolume(profile, tempDir)).isTrue();
            mocked.verify(() -> RuntimeRunnerDispatcher.probeCommandZeroExit(anyList(), anyInt()), never());
        }
    }

    @TempDir
    Path tempDir;

    private RuntimeRunnerDispatcher newDispatcher(
            RuntimeSessionRepository sessions,
            RunnerReceiptIngestService receipt,
            RuntimeSessionService service) {
        return new RuntimeRunnerDispatcher(
                sessions,
                mock(ModelElementRepository.class),
                mock(ModelRelationshipRepository.class),
                receipt,
                service,
                new ObjectMapper());
    }

    @ParameterizedTest
    @ValueSource(strings = {"AUTO", "MANAGED_CLI", "SYNTHETIC"})
    void unavailableRunnerNeverApprovesOrFabricatesEvidence(String mode) {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);
        ReflectionTestUtils.setField(dispatcher, "runnerMode", mode);
        ReflectionTestUtils.setField(dispatcher, "runnerProjectPath", "missing-runner-for-test.csproj");
        var id = UUID.randomUUID();
        when(sessions.findById(id)).thenReturn(Optional.of(RuntimeSession.builder().id(id).build()));
        assertThatThrownBy(() -> dispatcher.dispatchSession(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("runner unavailable");
        verifyNoInteractions(receipt, service);
        verify(sessions, never()).save(any());
    }

    @Test
    void resolvePrebuiltRunnerDllChecksRuntimeConfigAndSourceFreshness() throws Exception {
        var dispatcher = newDispatcher(
                mock(RuntimeSessionRepository.class),
                mock(RunnerReceiptIngestService.class),
                mock(RuntimeSessionService.class));

        Path projDir = Files.createDirectories(tempDir.resolve("MAVIS.Runner"));
        Path csproj = Files.writeString(projDir.resolve("MAVIS.Runner.csproj"), "<Project/>");
        Path source = Files.writeString(projDir.resolve("Program.cs"), "class Program {}");
        Path releaseDir = Files.createDirectories(projDir.resolve("bin/Release/net10.0"));
        Path dll = Files.writeString(releaseDir.resolve("MAVIS.Runner.dll"), "binary");
        Files.writeString(releaseDir.resolve("MAVIS.Runner.runtimeconfig.json"), "{}");

        Instant base = Instant.parse("2026-11-01T10:00:00Z");
        Files.setLastModifiedTime(csproj, FileTime.from(base));
        Files.setLastModifiedTime(source, FileTime.from(base));
        Files.setLastModifiedTime(dll, FileTime.from(base.plusSeconds(30)));

        assertThat(dispatcher.resolvePrebuiltRunnerDll(csproj, true))
                .contains(dll.toAbsolutePath().normalize());

        // Newer .cs source invalidates requireFresh=true, while SDK-pin fallback (requireFresh=false) still finds the DLL
        Files.setLastModifiedTime(source, FileTime.from(base.plusSeconds(90)));
        assertThat(dispatcher.resolvePrebuiltRunnerDll(csproj, true)).isEmpty();
        assertThat(dispatcher.resolvePrebuiltRunnerDll(csproj, false))
                .contains(dll.toAbsolutePath().normalize());
    }

    @Test
    void runnerCredentialValidationAndSecretAllowlistEnforceSecurityBoundaries() {
        var dispatcher = newDispatcher(
                mock(RuntimeSessionRepository.class),
                mock(RunnerReceiptIngestService.class),
                mock(RuntimeSessionService.class));

        ReflectionTestUtils.setField(dispatcher, "runnerServiceKey", "");
        assertThat(dispatcher.hasValidRunnerServiceKey()).isFalse();

        ReflectionTestUtils.setField(dispatcher, "runnerServiceKey", "mavis-local-runner-secret-key");
        assertThat(dispatcher.hasValidRunnerServiceKey()).isFalse();

        ReflectionTestUtils.setField(dispatcher, "runnerServiceKey", "dedicated-runner-secret-9f2c");
        assertThat(dispatcher.hasValidRunnerServiceKey()).isTrue();

        Map<String, String> env = new LinkedHashMap<>();
        env.put("DB_PASSWORD", "s3cr3t");
        env.put("JWT_SIGNING_KEY", "jwt-secret");
        env.put("OTEL_EXPORTER_OTLP_HEADERS", "blocked");
        env.put("MAVIS_RUNNER_SERVICE_KEY", "blocked");
        env.put("JAVA_TOOL_OPTIONS", "blocked");
        env.put("DOTNET_ROOT", "blocked");
        env.put("INVALID-KEY-NAME", "blocked");

        List<String> allowlist = RuntimeRunnerDispatcher.buildSecretAllowlist(env);
        assertThat(allowlist).containsExactly("DB_PASSWORD", "JWT_SIGNING_KEY");
    }

    @Test
    void filterProjectEnvDropsDangerousKeysAndPreservesValidApplicationKeys() {
        Map<String, String> env = new LinkedHashMap<>();
        env.put("LD_PRELOAD", "/tmp/evil.so");
        env.put("DOTNET_STARTUP_HOOKS", "/tmp/hook.dll");
        env.put("COREHOST_TRACE", "1");
        env.put("ASPNETCORE_HOSTINGSTARTUPASSEMBLIES", "Evil");
        env.put("DOCKER_HOST", "tcp://1.2.3.4:2375");
        env.put("MAVIS_RUNNER_SERVICE_KEY", "stolen");
        env.put("JAVA_TOOL_OPTIONS", "-javaagent:/tmp/a.jar");
        env.put("JDK_JAVA_OPTIONS", "-Xmx1g");
        env.put("_JAVA_OPTIONS", "-Xmx1g");
        env.put("SSL_CERT_FILE", "/tmp/ca.pem");
        env.put("NODE_OPTIONS", "--require /tmp/a.js");
        env.put("PYTHONPATH", "/tmp/py");
        env.put("PATH", "/tmp/bin");
        env.put("HOME", "/tmp");
        env.put("HTTP_PROXY", "http://evil:8080");
        env.put("BASH_ENV", "/tmp/pwn.sh");
        env.put("BAD-KEY", "nope");
        env.put("DB_PASSWORD", "s3cr3t");
        env.put("API_KEY", "k-123");
        env.put("ConnectionStrings__CatalogDb", "Host=catalog-db;Database=catalog");

        Map<String, String> filtered = RuntimeRunnerDispatcher.filterProjectEnv(env);
        assertThat(filtered).containsOnlyKeys("DB_PASSWORD", "API_KEY", "ConnectionStrings__CatalogDb");
        assertThat(filtered.get("DB_PASSWORD")).isEqualTo("s3cr3t");
        assertThat(filtered.get("API_KEY")).isEqualTo("k-123");
        assertThat(filtered.get("ConnectionStrings__CatalogDb")).isEqualTo("Host=catalog-db;Database=catalog");
        assertThat(RuntimeRunnerDispatcher.buildSecretAllowlist(filtered))
                .containsExactly("DB_PASSWORD", "API_KEY", "ConnectionStrings__CatalogDb");
    }

    @Test
    void tryAutoImportOutboxReceiptSyncsExistingReceiptUnderInternalBypass() throws Exception {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);
        ReflectionTestUtils.setField(dispatcher, "runnerStateRoot", tempDir.toString());

        UUID sessionId = UUID.randomUUID();
        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";
        Path receiptsDir = Files.createDirectories(tempDir.resolve("receipts"));
        Files.writeString(receiptsDir.resolve(resourceProject + ".json"), "{\"sessionId\":\"" + sessionId + "\"}");

        var guard = new RunnerServiceAuthGuard(mock(com.mavis.common.security.AccessPolicyService.class));
        AtomicBoolean bypassObservedInsideCall = new AtomicBoolean(false);
        when(receipt.importReceiptFromStateRoot(sessionId, resourceProject)).thenAnswer(inv -> {
            bypassObservedInsideCall.set(guard.isRunnerServiceKeyValid());
            return null;
        });

        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .resourceProject(resourceProject)
                .executionStatus("RUNNING")
                .build();

        assertThat(dispatcher.tryAutoImportOutboxReceipt(session)).isTrue();
        assertThat(bypassObservedInsideCall.get()).isTrue();
        assertThat(guard.isRunnerServiceKeyValid()).isFalse();
        verify(receipt).importReceiptFromStateRoot(sessionId, resourceProject);
    }

    @Test
    void recordAsyncDispatchFailurePreservesCommittedReceiptAndRedactsRunnerLogDiagnostics() throws Exception {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);
        ReflectionTestUtils.setField(dispatcher, "runnerStateRoot", tempDir.toString());

        // Case 1: Session already has a committed receipt (e.g. CLI exited 1 on Failed/TimedOut scenario) -> NEVER overwrite
        UUID committedId = UUID.randomUUID();
        RuntimeSession committed = RuntimeSession.builder()
                .id(committedId)
                .executionStatus("FAILED")
                .scenarioStatus("FAILED")
                .cleanupStatus("CONFIRMED")
                .receiptDigest("sha256:alreadycommitted")
                .build();
        when(sessions.findById(committedId)).thenReturn(Optional.of(committed));

        dispatcher.recordAsyncDispatchFailure(committedId, new RuntimeException("CLI exited with code 1"));
        verify(sessions, never()).save(committed);

        // Case 2: Uncommitted failure -> marks FAILED cleanly and attaches redacted runner log tail
        UUID failedId = UUID.randomUUID();
        RuntimeSession uncommitted = RuntimeSession.builder()
                .id(failedId)
                .executionStatus("READY_FOR_DISPATCH")
                .scenarioStatus("APPROVED")
                .cleanupStatus("NOT_APPLICABLE")
                .build();
        when(sessions.findById(failedId)).thenReturn(Optional.of(uncommitted));

        Files.writeString(
                tempDir.resolve("runner-" + failedId + ".log"),
                "Starting MAVIS.Runner\nError NETSDK1045 Authorization: Bearer topsecret-jwt-token\n",
                StandardCharsets.UTF_8);

        dispatcher.recordAsyncDispatchFailure(
                failedId,
                new RuntimeException("Runner crashed with password=my_db_secret"));

        verify(sessions).save(uncommitted);
        assertThat(uncommitted.getExecutionStatus()).isEqualTo("FAILED");
        assertThat(uncommitted.getScenarioStatus()).isEqualTo("NOT_RUN");
        assertThat(uncommitted.getCleanupStatus()).isEqualTo("NOT_APPLICABLE");
        assertThat(uncommitted.getRecoveryResultJson()).isNotNull();
        String serializedRecovery = uncommitted.getRecoveryResultJson().toString();
        assertThat(serializedRecovery).contains("RUNNER_UNAVAILABLE");
        assertThat(serializedRecovery).contains("NETSDK1045");
        assertThat(serializedRecovery).doesNotContain("topsecret-jwt-token");
        assertThat(serializedRecovery).doesNotContain("my_db_secret");
    }

    @Test
    void dispatchSessionAsyncCompletesWithoutCallingAuthenticatedSessionRead() {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);

        // Simulate unauthenticated async ForkJoinPool thread where service.getSessionById would throw UNAUTHORIZED
        when(service.getSessionById(any())).thenThrow(
                new BusinessException(com.mavis.common.exception.ErrorCode.UNAUTHORIZED, "Yêu cầu đăng nhập hợp lệ"));

        UUID sessionId = UUID.randomUUID();
        RuntimeSession completed = RuntimeSession.builder()
                .id(sessionId)
                .executionStatus("COMPLETED")
                .scenarioStatus("PASSED")
                .cleanupStatus("CONFIRMED")
                .receiptDigest("sha256:committed")
                .build();
        when(sessions.findById(sessionId)).thenReturn(Optional.of(completed));

        dispatcher.dispatchSessionAsync(sessionId).join();

        verifyNoInteractions(service);
        verify(sessions, never()).save(any());
    }

    @Test
    void resolveProcessDeadlineSecondsHonorsConfiguredTimeoutWithMargin() {
        var mapper = new ObjectMapper();
        assertThat(RuntimeRunnerDispatcher.resolveProcessDeadlineSeconds(null)).isEqualTo(420L);

        var shortCfg = mapper.createObjectNode();
        shortCfg.putObject("profile").put("timeoutSeconds", 120);
        assertThat(RuntimeRunnerDispatcher.resolveProcessDeadlineSeconds(
                RuntimeSession.builder().scenarioConfig(shortCfg).build())).isEqualTo(420L);

        var longCfg = mapper.createObjectNode();
        longCfg.putObject("profile").put("timeoutSeconds", 600);
        assertThat(RuntimeRunnerDispatcher.resolveProcessDeadlineSeconds(
                RuntimeSession.builder().scenarioConfig(longCfg).build())).isEqualTo(780L);

        var cappedCfg = mapper.createObjectNode();
        cappedCfg.putObject("scenario").put("timeoutSeconds", 9999);
        assertThat(RuntimeRunnerDispatcher.resolveProcessDeadlineSeconds(
                RuntimeSession.builder().scenarioConfig(cappedCfg).build())).isEqualTo(3600L);
    }

    @Test
    void shouldRetryPreAllocationFailureOnlyBeforeAllocationWithoutPreflightFailure(@org.junit.jupiter.api.io.TempDir java.nio.file.Path tempDir) throws Exception {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);
        org.springframework.test.util.ReflectionTestUtils.setField(dispatcher, "runnerStateRoot", tempDir.toString());

        UUID retryableId = UUID.randomUUID();
        RuntimeSession ready = RuntimeSession.builder()
                .id(retryableId)
                .executionStatus("READY_FOR_DISPATCH")
                .resourceProject("mavisrun-" + "a".repeat(32))
                .build();
        assertThat(dispatcher.shouldRetryPreAllocationFailure(ready, tempDir)).isTrue();

        // Must NOT retry once ALLOCATED or RUNNING
        RuntimeSession allocated = RuntimeSession.builder()
                .id(retryableId)
                .executionStatus("ALLOCATED")
                .resourceProject(ready.getResourceProject())
                .build();
        assertThat(dispatcher.shouldRetryPreAllocationFailure(allocated, tempDir)).isFalse();

        // Must NOT retry if reservation file already exists on disk
        java.nio.file.Files.writeString(tempDir.resolve(".allocation-" + ready.getResourceProject() + ".json"), "{}");
        assertThat(dispatcher.shouldRetryPreAllocationFailure(ready, tempDir)).isFalse();

        // Must NOT retry if PREFLIGHT_FAILED diagnostic was emitted
        UUID preflightId = UUID.randomUUID();
        RuntimeSession preflightSession = RuntimeSession.builder()
                .id(preflightId)
                .executionStatus("READY_FOR_DISPATCH")
                .resourceProject("mavisrun-" + "b".repeat(32))
                .build();
        java.nio.file.Files.writeString(tempDir.resolve("runner-" + preflightId + ".log"),
                "MAVIS_RUNTIME_DIAGNOSTIC=PREFLIGHT_FAILED\n");
        assertThat(dispatcher.shouldRetryPreAllocationFailure(preflightSession, tempDir)).isFalse();
    }

    @Test
    void twoDistinctSessionsDispatchTrulyConcurrentlyWithoutPinning() throws Exception {
        var sessions = mock(RuntimeSessionRepository.class);
        var receipt = mock(RunnerReceiptIngestService.class);
        var service = mock(RuntimeSessionService.class);
        var dispatcher = newDispatcher(sessions, receipt, service);

        UUID s1 = UUID.randomUUID();
        UUID s2 = UUID.randomUUID();
        var bothEntered = new java.util.concurrent.CountDownLatch(2);
        when(sessions.findById(any())).thenAnswer(inv -> {
            bothEntered.countDown();
            boolean met = bothEntered.await(5, java.util.concurrent.TimeUnit.SECONDS);
            assertThat(met).as("Both runner dispatches must run concurrently without carrier pinning").isTrue();
            UUID id = inv.getArgument(0);
            return Optional.of(RuntimeSession.builder().id(id).executionStatus("COMPLETED").build());
        });

        var f1 = dispatcher.dispatchSessionAsync(s1);
        var f2 = dispatcher.dispatchSessionAsync(s2);
        java.util.concurrent.CompletableFuture.allOf(f1, f2).get(10, java.util.concurrent.TimeUnit.SECONDS);
        assertThat(bothEntered.getCount()).isZero();
    }
}
