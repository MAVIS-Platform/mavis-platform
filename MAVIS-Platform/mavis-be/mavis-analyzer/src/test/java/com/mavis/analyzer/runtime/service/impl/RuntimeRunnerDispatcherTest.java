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
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RuntimeRunnerDispatcherTest {

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
}
