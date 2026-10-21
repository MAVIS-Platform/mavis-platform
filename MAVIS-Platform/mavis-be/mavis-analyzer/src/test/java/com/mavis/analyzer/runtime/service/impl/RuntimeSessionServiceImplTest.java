package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RuntimeSessionServiceImplTest {

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private UserRepository userRepository;

    @Spy
    private ComposePreflightValidator composePreflightValidator = new ComposePreflightValidator();

    @Spy
    private ComposeOverrideGenerator composeOverrideGenerator = new ComposeOverrideGenerator();

    @InjectMocks
    private RuntimeSessionServiceImpl runtimeSessionService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private UUID projectId;
    private UUID snapshotId;
    private Project project;
    private SourceSnapshot snapshot;

    @BeforeEach
    void setUp() {
        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();

        project = Project.builder().id(projectId).name("Ecommerce System").build();
        snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath("/tmp/test/compose.yml").build();

        lenient().when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));
        lenient().when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        lenient().when(runtimeSessionRepository.save(any(RuntimeSession.class)))
                .thenAnswer(inv -> {
                    RuntimeSession s = inv.getArgument(0);
                    if (s.getId() == null) {
                        s.setId(UUID.randomUUID());
                    }
                    return s;
                });
    }

    @Test
    @DisplayName("COMPOSE PREFLIGHT: Phát hiện privileged: true, network_mode: host và mount /var/run/docker.sock")
    void testPreflight_DangerousConfig_ShouldFlagSecurityWarnings(@TempDir Path tempDir) throws IOException {
        String dangerousYaml = """
                version: '3.8'
                services:
                  malicious-service:
                    image: ubuntu:latest
                    privileged: true
                    network_mode: host
                    volumes:
                      - /var/run/docker.sock:/var/run/docker.sock
                      - /etc:/host_etc:ro
                  safe-service:
                    image: nginx:alpine
                    ports:
                      - "80:80"
                """;

        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, dangerousYaml);

        snapshot.setStoragePath(composeFile.toString());

        PreflightCheckResponseDTO result = runtimeSessionService.runComposePreflight(snapshotId);

        assertThat(result).isNotNull();
        assertThat(result.isCompatible()).isFalse();
        assertThat(result.getDetectedServices()).containsExactlyInAnyOrder("malicious-service", "safe-service");
        assertThat(result.getSecurityWarnings()).hasSize(4);
        assertThat(result.getSecurityWarnings().stream().anyMatch(w -> w.contains("privileged: true"))).isTrue();
        assertThat(result.getSecurityWarnings().stream().anyMatch(w -> w.contains("network_mode: host"))).isTrue();
        assertThat(result.getSecurityWarnings().stream().anyMatch(w -> w.contains("/var/run/docker.sock"))).isTrue();
        assertThat(result.getSecurityWarnings().stream().anyMatch(w -> w.contains("/etc"))).isTrue();
    }

    @Test
    @DisplayName("COMPOSE PREFLIGHT: File docker-compose an toàn -> compatible = true")
    void testPreflight_SafeConfig_ShouldBeCompatible(@TempDir Path tempDir) throws IOException {
        String safeYaml = """
                version: '3.8'
                services:
                  order-service:
                    image: order-service:1.0
                    ports:
                      - "8080:8080"
                  payment-service:
                    image: payment-service:1.0
                """;

        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, safeYaml);

        snapshot.setStoragePath(composeFile.toString());

        PreflightCheckResponseDTO result = runtimeSessionService.runComposePreflight(snapshotId);

        assertThat(result.isCompatible()).isTrue();
        assertThat(result.getSecurityWarnings()).isEmpty();
        assertThat(result.getDetectedServices()).containsExactlyInAnyOrder("order-service", "payment-service");
    }

    @Test
    @DisplayName("SECRET REDACTION: Tự động che giấu thông tin mật (password, token, apiKey, authorization)")
    void testCreateRuntimeSession_ShouldRedactSecretsInScenarioConfig() {
        ObjectNode config = objectMapper.createObjectNode();
        config.put("targetUrl", "http://order-service/api/checkout?token=super_secret_token_123");
        config.put("password", "MyP@ssw0rd!");
        config.put("authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
        config.put("apiKey", "api_key_secret_xyz");

        ObjectNode nested = objectMapper.createObjectNode();
        nested.put("dbPassword", "root_secret");
        nested.put("publicInfo", "visible-data");
        config.set("databaseCredentials", nested);

        RuntimeSessionCreateRequest request = RuntimeSessionCreateRequest.builder()
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .scenarioName("Checkout Stress Test")
                .scenarioConfig(config)
                .build();

        RuntimeSessionResponseDTO response = runtimeSessionService.createRuntimeSession(request);

        assertThat(response).isNotNull();
        assertThat(response.getScenarioStatus()).isEqualTo("PENDING");
        assertThat(response.getTraceStatus()).isEqualTo("NONE");

        JsonNode savedConfig = response.getScenarioConfig();
        assertThat(savedConfig.get("password").asText()).isEqualTo("[REDACTED]");
        assertThat(savedConfig.get("authorization").asText()).isEqualTo("[REDACTED]");
        assertThat(savedConfig.get("apiKey").asText()).isEqualTo("[REDACTED]");
        assertThat(savedConfig.get("targetUrl").asText()).contains("token=[REDACTED]");
        assertThat(savedConfig.get("databaseCredentials").get("dbPassword").asText()).isEqualTo("[REDACTED]");
        assertThat(savedConfig.get("databaseCredentials").get("publicInfo").asText()).isEqualTo("visible-data");
    }

    @Test
    @DisplayName("VÒNG ĐỜI TRẠNG THÁI: PENDING -> approve -> RUNNING (sinh Override) -> stop -> CANCELLED")
    void testSessionLifecycle_PendingToRunningToCancelled(@TempDir Path tempDir) throws IOException {
        String composeYaml = """
                version: '3.8'
                services:
                  web:
                    image: web:latest
                  api:
                    image: api:latest
                """;
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, composeYaml);
        snapshot.setStoragePath(composeFile.toString());

        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .scenarioStatus("PENDING")
                .traceStatus("NONE")
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        // 1. Phê duyệt & Khởi chạy (approve)
        RuntimeSessionResponseDTO approved = runtimeSessionService.approveAndStartSession(sessionId);

        assertThat(approved.getScenarioStatus()).isEqualTo("RUNNING");
        assertThat(approved.getStartedAt()).isNotNull();
        assertThat(approved.getOverrideComposeYaml()).isNotNull();
        assertThat(approved.getOverrideComposeYaml()).contains("cpus: '1.0'");
        assertThat(approved.getOverrideComposeYaml()).contains("mem_limit: 1024m");
        assertThat(approved.getOverrideComposeYaml()).contains("pids_limit: 128");
        assertThat(approved.getOverrideComposeYaml()).contains("mavis_sandbox_net");
        assertThat(approved.getOverrideComposeYaml()).contains("OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317");

        // 2. Dừng phiên (stop)
        RuntimeSessionResponseDTO stopped = runtimeSessionService.stopSession(sessionId);

        assertThat(stopped.getScenarioStatus()).isEqualTo("CANCELLED");
        assertThat(stopped.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("BR-41..BR-45 BẢO MẬT: Không cho phép approve phiên chạy không ở trạng thái PENDING")
    void testApproveSession_InvalidStatus_ShouldThrowBadRequest() {
        UUID sessionId = UUID.randomUUID();
        RuntimeSession runningSession = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .scenarioStatus("RUNNING")
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(runningSession));

        assertThatThrownBy(() -> runtimeSessionService.approveAndStartSession(sessionId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("PENDING");
    }

    @Test
    @DisplayName("TRUY VẤN: getSessionsByProject trả về danh sách phiên theo thứ tự mới nhất")
    void testGetSessionsByProject_ShouldReturnList() {
        RuntimeSession s1 = RuntimeSession.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).scenarioStatus("PENDING").build();
        RuntimeSession s2 = RuntimeSession.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).scenarioStatus("RUNNING").build();

        when(runtimeSessionRepository.findByProjectIdOrderByCreatedAtDesc(projectId)).thenReturn(List.of(s2, s1));

        List<RuntimeSessionResponseDTO> results = runtimeSessionService.getSessionsByProject(projectId);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).getId()).isEqualTo(s2.getId());
        assertThat(results.get(1).getId()).isEqualTo(s1.getId());
    }
}
