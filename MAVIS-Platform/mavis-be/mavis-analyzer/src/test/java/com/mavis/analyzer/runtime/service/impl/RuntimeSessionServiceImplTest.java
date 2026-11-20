package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
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
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RuntimeSessionServiceImplTest {

    private static final Pattern RESOURCE_PROJECT_PATTERN = Pattern.compile("^mavisrun-[0-9a-f]{32}$");
    private static final Pattern SHA256_PATTERN = Pattern.compile("^sha256:[0-9a-f]{64}$");

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private AccessPolicyService accessPolicyService;

    @Mock
    private RunnerServiceAuthGuard runnerServiceAuthGuard;

    @Spy
    private ComposePreflightValidator composePreflightValidator = new ComposePreflightValidator();

    @Spy
    private ComposeOverrideGenerator composeOverrideGenerator = new ComposeOverrideGenerator();

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @Spy private com.mavis.common.config.PlatformRuntimeSettings settings=new com.mavis.common.config.PlatformRuntimeSettings();

    @InjectMocks
    private RuntimeSessionServiceImpl runtimeSessionService;

    @Mock
    private com.mavis.common.security.CourseLabPolicy courseLabPolicy;

    @Test
    void guidedRuntimeRejectsModelFromAnotherSnapshotInTheSameProject() {
        configureGuidedRuntime();
        validModel.setSourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build());
        when(modelVersionRepository.findById(validModel.getId())).thenReturn(Optional.of(validModel));

        var request = RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId)
                .modelVersionId(validModel.getId()).build();
        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("selected snapshot");
        verify(runtimeSessionRepository, never()).save(any());
    }

    @Test
    void guidedRuntimeRejectsArtifactDifferentFromThePublishedLabSource() {
        configureGuidedRuntime();
        snapshot.setArtifactHash("another-artifact");
        when(modelVersionRepository.findById(validModel.getId())).thenReturn(Optional.of(validModel));

        var request = RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId)
                .modelVersionId(validModel.getId()).build();
        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("current Lab reference");
        verify(runtimeSessionRepository, never()).save(any());
    }

    @Test
    void runnerCannotExportAnOldSessionAfterTheLabReferenceChanges() {
        configureGuidedRuntime();
        UUID sessionId = UUID.randomUUID();
        var session = RuntimeSession.builder().id(sessionId).project(project).sourceSnapshot(snapshot)
                .modelVersion(validModel).build();
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        project.getAssignment().getReferenceModel().getSourceSnapshot().setId(UUID.randomUUID());

        assertThatThrownBy(() -> runtimeSessionService.exportRunDefinition(sessionId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("current Lab reference");
    }

    private void configureGuidedRuntime() {
        org.springframework.test.util.ReflectionTestUtils.setField(runtimeSessionService, "courseLabPolicy", courseLabPolicy);
        project.setWorkspace(com.mavis.common.entity.Workspace.builder().courseMode(true).build());
        project.setProjectType("STUDENT_WORKING");
        snapshot.setArtifactHash("curated-artifact");
        var reference = SourceSnapshot.builder().id(UUID.randomUUID()).artifactHash(snapshot.getArtifactHash())
                .isPublished(true).build();
        project.setReferenceSnapshotId(reference.getId());
        project.setAssignment(com.mavis.common.entity.Assignment.builder()
                .referenceModel(ModelVersion.builder().sourceSnapshot(reference).build()).build());
    }

    @Test
    void guidedStudioRejectsUnresolvedSeedImageBeforeSavingSession(@TempDir Path directory) throws IOException {
        var workspace = com.mavis.common.entity.Workspace.builder().id(UUID.randomUUID()).build();
        project.setWorkspace(workspace);
        var assignmentId = UUID.randomUUID();
        var assignment = com.mavis.common.entity.Assignment.builder().id(assignmentId)
                .workspace(workspace).referenceModel(validModel).build();
        var assignments = mock(com.mavis.common.repository.AssignmentRepository.class);
        org.springframework.test.util.ReflectionTestUtils.setField(runtimeSessionService, "assignmentRepository", assignments);
        when(assignments.findById(assignmentId)).thenReturn(Optional.of(assignment));
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.of(validModel));
        Path compose = directory.resolve("docker-compose.yml");
        Files.writeString(compose, "services:\n  orders:\n    image: mavis/orders:curated\n");
        snapshot.setStoragePath(compose.toString());

        var config = objectMapper.createObjectNode().put("interactiveStudio", true);
        var request = RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId)
                .assignmentId(assignmentId).scenarioConfig(config).build();

        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(request))
                .isInstanceOfSatisfying(BusinessException.class, failure -> {
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                    assertThat(failure.getStableCode()).isEqualTo("PREFLIGHT_FAILED");
                });
        verify(runtimeSessionRepository, never()).save(any());
    }

    private UUID projectId;
    private UUID snapshotId;
    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion validModel;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.lenient().when(projectRepository.findLockedById(org.mockito.ArgumentMatchers.any(UUID.class))).thenAnswer(call -> projectRepository.findById(call.getArgument(0)));
        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();

        project = Project.builder().id(projectId).name("Ecommerce System").build();
        snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath("/tmp/test/compose.yml").build();
        validModel = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .isLatestValid(true)
                .build();

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
    @DisplayName("CHẶNG 11: Tạo session tự động pin cứng ModelVersion hợp lệ và sinh hash 64-hex cho version IDs")
    void testCreateRuntimeSession_PinsModelVersionAndGenerates64HexHashes() {
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.of(validModel));

        ObjectNode scenarioConfig = objectMapper.createObjectNode();
        ObjectNode profile = scenarioConfig.putObject("profile");
        profile.put("collectorImage", "otel/collector@sha256:1111222233334444555566667777888899990000111122223333444455556666");

        ObjectNode scenario = scenarioConfig.putObject("scenario");
        ArrayNode steps = scenario.putArray("steps");
        ObjectNode step = steps.addObject();
        step.put("id", "step1");
        step.put("service", "order-service");
        step.put("method", "GET");
        step.put("path", "/health");

        RuntimeSessionCreateRequest request = RuntimeSessionCreateRequest.builder()
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .scenarioName("Order Flow Test")
                .scenarioConfig(scenarioConfig)
                .build();

        RuntimeSessionResponseDTO response = runtimeSessionService.createRuntimeSession(request);

        assertThat(response).isNotNull();
        assertThat(response.getModelVersionId()).isEqualTo(validModel.getId());
        assertThat(response.getResourceProject()).matches(RESOURCE_PROJECT_PATTERN);
        assertThat(response.getProfileVersionId()).matches(SHA256_PATTERN);
        assertThat(response.getRunConfigurationVersionId()).matches(SHA256_PATTERN);
        assertThat(response.getScenarioVersionId()).matches(SHA256_PATTERN);
        assertThat(response.getScenarioStatus()).isEqualTo("PENDING");
        assertThat(response.getExecutionStatus()).isEqualTo("NOT_STARTED");
    }

    @Test
    @DisplayName("CHẶNG 11: Chặn tạo session khi dự án chưa có ModelVersion hợp lệ nào")
    void testCreateRuntimeSession_NoValidModel_ThrowsBadRequest() {
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.empty());

        RuntimeSessionCreateRequest request = RuntimeSessionCreateRequest.builder()
                .projectId(projectId)
                .sourceSnapshotId(snapshotId)
                .build();

        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Dự án chưa có ModelVersion hợp lệ");
    }

    @Test
    @DisplayName("CHẶNG 11: approveAndStartSession đặt scenarioStatus = APPROVED, executionStatus = READY_FOR_DISPATCH")
    void testApproveAndStartSession_SetsApprovedAndReadyForDispatch(@TempDir Path tempDir) throws IOException {
        String safeYaml = "services:\n  app:\n    image: app:1.0\n";
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, safeYaml);
        snapshot.setStoragePath(composeFile.toString());

        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .scenarioStatus("PENDING")
                .executionStatus("NOT_STARTED")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO response = runtimeSessionService.approveAndStartSession(sessionId);

        assertThat(response.getScenarioStatus()).isEqualTo("APPROVED");
        assertThat(response.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        assertThat(response.getOverrideComposeYaml()).isNotBlank();
        assertThat(session.getStartedAt()).isNull(); // Chưa gán startedAt tại bước này
    }

    @Test
    @DisplayName("CHẶNG 11: acknowledgeLifecycle cập nhật ALLOCATED và RUNNING chính xác")
    void testAcknowledgeLifecycle_AllocatedAndRunningStages() {
        UUID sessionId = UUID.randomUUID();
        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .resourceProject(resourceProject)
                .scenarioStatus("APPROVED")
                .executionStatus("READY_FOR_DISPATCH")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        // 1. Stage ALLOCATED
        RuntimeSessionLifecycleAckRequestDTO allocReq = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(sessionId)
                .resourceProject(resourceProject)
                .stage("ALLOCATED")
                .observedAt(OffsetDateTime.now())
                .build();

        RuntimeSessionLifecycleAckDTO allocResp = runtimeSessionService.acknowledgeLifecycle(sessionId, allocReq);

        assertThat(allocResp.getExecutionStatus()).isEqualTo("ALLOCATED");
        assertThat(session.getAllocatedAt()).isNotNull();

        // 2. Stage RUNNING
        RuntimeSessionLifecycleAckRequestDTO runReq = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(sessionId)
                .resourceProject(resourceProject)
                .stage("RUNNING")
                .observedAt(OffsetDateTime.now())
                .build();

        RuntimeSessionLifecycleAckDTO runResp = runtimeSessionService.acknowledgeLifecycle(sessionId, runReq);

        assertThat(runResp.getExecutionStatus()).isEqualTo("RUNNING");
        assertThat(runResp.getScenarioStatus()).isEqualTo("RUNNING");
        assertThat(session.getStartedAt()).isNotNull();
    }

    @Test
    @DisplayName("CHẶNG 11: acknowledgeLifecycle từ chối 400 BAD_REQUEST khi resourceProject bị lệch")
    void testAcknowledgeLifecycle_ResourceProjectMismatch_ThrowsBadRequest() {
        UUID sessionId = UUID.randomUUID();
        String validResource = "mavisrun-0123456789abcdef0123456789abcdef";
        String invalidResource = "mavisrun-ffffffffffffffffffffffffffffffff";

        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .resourceProject(validResource)
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionLifecycleAckRequestDTO req = RuntimeSessionLifecycleAckRequestDTO.builder()
                .sessionId(sessionId)
                .resourceProject(invalidResource)
                .stage("ALLOCATED")
                .build();

        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(sessionId, req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("ResourceProject không hợp lệ hoặc không khớp");
    }

    @Test
    @DisplayName("CHẶNG 11: stopSession Nhánh 1 (Stop-before-start) đặt CANCELLED ngay lập tức")
    void testStopSession_Branch1_StopBeforeStart() {
        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .scenarioStatus("APPROVED")
                .executionStatus("READY_FOR_DISPATCH")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO stopped = runtimeSessionService.stopSession(sessionId);

        assertThat(stopped.getScenarioStatus()).isEqualTo("CANCELLED");
        assertThat(stopped.getExecutionStatus()).isEqualTo("CANCELLED");
        assertThat(stopped.getCleanupStatus()).isEqualTo("NOT_APPLICABLE");
        assertThat(stopped.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("CHẶNG 11: stopSession Nhánh 2 (Stop-while-running) ghi cancel.request và chuyển CANCELLING, giữ completedAt = null")
    void testStopSession_Branch2_StopWhileRunning(@TempDir Path tempDir) {
        org.springframework.test.util.ReflectionTestUtils.setField(runtimeSessionService, "runnerStateRoot", tempDir.toString());

        UUID sessionId = UUID.randomUUID();
        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .resourceProject(resourceProject)
                .scenarioStatus("RUNNING")
                .executionStatus("RUNNING")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO stopped = runtimeSessionService.stopSession(sessionId);

        assertThat(stopped.getExecutionStatus()).isEqualTo("CANCELLING");
        assertThat(stopped.getCleanupStatus()).isEqualTo("STOP_REQUESTED");
        assertThat(stopped.getCompletedAt()).isNull(); // Chờ receipt xác nhận cleanup

        Path marker = tempDir.resolve(resourceProject).resolve("cancel.request");
        assertThat(Files.exists(marker)).isTrue();
    }

    @Test
    @DisplayName("CHẶNG 11: stopSession Nhánh 2 ném INTERNAL_ERROR nếu runnerStateRoot chưa cấu hình")
    void testStopSession_Branch2_NoStateRoot_ThrowsInternalError() {
        org.springframework.test.util.ReflectionTestUtils.setField(runtimeSessionService, "runnerStateRoot", "");

        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .resourceProject("mavisrun-0123456789abcdef0123456789abcdef")
                .executionStatus("RUNNING")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> runtimeSessionService.stopSession(sessionId))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("runnerStateRoot chưa cấu hình");
    }

    @Test
    @DisplayName("CHẶNG 11: stopSession Nhánh 3 (Stop-after-completion) trả về idempotent mà không ghi file")
    void testStopSession_Branch3_StopAfterCompletion() {
        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .scenarioStatus("PASSED")
                .executionStatus("COMPLETED")
                .cleanupStatus("CONFIRMED")
                .build();

        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO result = runtimeSessionService.stopSession(sessionId);

        assertThat(result.getExecutionStatus()).isEqualTo("COMPLETED");
        verify(runtimeSessionRepository, never()).save(any());
    }

    @Test
    @DisplayName("CHẶNG 11: exportRunDefinition kiểm tra bắt buộc cấu trúc Profile, Scenario và Mappings")
    void testExportRunDefinition_StrictValidation_Success(@TempDir Path tempDir) throws IOException {
        String safeYaml = "services:\n  orders:\n    image: orders:1.0\n";
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, safeYaml);
        snapshot.setStoragePath(composeFile.toString());

        ObjectNode scenarioConfig = objectMapper.createObjectNode();
        ObjectNode profile = scenarioConfig.putObject("profile");
        profile.put("collectorImage", "otel/collector@sha256:1111222233334444555566667777888899990000111122223333444455556666");
        profile.put("instrumentationVolume", "mavis-agents-v1");
        ObjectNode apps = profile.putObject("applications");
        apps.putObject("orders").put("runtime", "dotnet8").put("containerPort", 8080);

        ObjectNode scenario = scenarioConfig.putObject("scenario");
        ArrayNode steps = scenario.putArray("steps");
        ObjectNode step = steps.addObject();
        step.put("id", "step1");
        step.put("service", "orders");

        UUID sessionId = UUID.randomUUID();
        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";

        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .resourceProject(resourceProject)
                .profileVersionId("sha256:profile")
                .runConfigurationVersionId("sha256:runconfig")
                .scenarioVersionId("sha256:scenario")
                .scenarioConfig(scenarioConfig)
                .confirmedServiceMappings(Map.of("orders", UUID.randomUUID().toString()))
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        RunnerDefinitionExportDTO exportDTO = runtimeSessionService.exportRunDefinition(sessionId);

        assertThat(exportDTO).isNotNull();
        assertThat(exportDTO.getResourceProject()).isEqualTo(resourceProject);
        assertThat(exportDTO.getModelVersionId()).isEqualTo(validModel.getId().toString());
        assertThat(exportDTO.getProfile()).isNotNull();
        assertThat(exportDTO.getScenario().path("sessionId").asText()).isEqualTo(sessionId.toString());
        assertThat(exportDTO.getConfirmedServiceMappings()).containsKey("orders");
    }
    @Test
    void lifecycleRejectsLateCancelledAndOutOfOrderEventsAndPreservesDuplicateTimestamp() {
        UUID id = UUID.randomUUID();
        String resource = "mavisrun-0123456789abcdef0123456789abcdef";
        RuntimeSession session = RuntimeSession.builder().id(id).project(project).resourceProject(resource)
                .executionStatus("READY_FOR_DISPATCH").scenarioStatus("APPROVED").build();
        when(runtimeSessionRepository.findLockedById(id)).thenReturn(Optional.of(session));
        var event = RuntimeSessionLifecycleAckRequestDTO.builder().sessionId(id).resourceProject(resource)
                .stage("RUNNING").observedAt(OffsetDateTime.now()).build();
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(id, event)).isInstanceOf(BusinessException.class);
        event.setStage("ALLOCATED");
        runtimeSessionService.acknowledgeLifecycle(id, event);
        var allocated = session.getAllocatedAt();
        event.setObservedAt(OffsetDateTime.now().plusSeconds(5));
        runtimeSessionService.acknowledgeLifecycle(id, event);
        assertThat(session.getAllocatedAt()).isEqualTo(allocated);
        event.setStage("RUNNING");
        runtimeSessionService.acknowledgeLifecycle(id, event);
        event.setStage("ALLOCATED");
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(id, event)).isInstanceOf(BusinessException.class);
        session.setCancelRequestedAt(OffsetDateTime.now());
        event.setStage("RUNNING");
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(id, event)).isInstanceOf(BusinessException.class);
        session.setCancelRequestedAt(null);
        session.setCompletedAt(OffsetDateTime.now());
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(id, event)).isInstanceOf(BusinessException.class);
        event.setSessionId(UUID.randomUUID());
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(id, event)).hasMessageContaining("scope mismatch");
    }

    @Test
    void defaultPinnedModelMustMatchSnapshot() {
        validModel.setSourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).project(project).build());
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId))
                .thenReturn(Optional.of(validModel));
        var request = RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId).build();
        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(request)).isInstanceOf(BusinessException.class)
                .hasMessageContaining("selected snapshot");
        verify(runtimeSessionRepository, never()).save(any());
    }
 @Test void disabledRuntimeIntegrationBlocksCreationBeforePersistence(){settings.updateIntegration("otel-collector",false,1,n->{});assertThatThrownBy(()->runtimeSessionService.createRuntimeSession(RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId).build())).isInstanceOf(BusinessException.class);verify(runtimeSessionRepository,never()).save(any());}

    @Test
    @DisplayName("STEP 1: Preflight quét Compose/Source phát hiện API, DB, Env/Secret và lưu cấu hình không lộ plaintext secret")
    void testStep1PreflightAndRuntimeConfigSecrets(@TempDir Path tempDir) throws IOException {
        String composeYaml = """
                services:
                  orders-api:
                    image: orders-api:1.0
                    ports:
                      - "8080:8080"
                    environment:
                      SPRING_DATASOURCE_URL: jdbc:postgresql://orders-db:5432/orders
                      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
                      FEATURE_FLAG: "true"
                  orders-db:
                    image: postgres:15
                    environment:
                      POSTGRES_PASSWORD: ${DB_PASSWORD}
                """;
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, composeYaml);
        Path controllerFile = tempDir.resolve("OrderController.java");
        Files.writeString(controllerFile, """
                @RestController
                @RequestMapping("/api/orders")
                public class OrderController {
                    @PostMapping("/checkout")
                    public void checkout() {}
                }
                """);
        snapshot.setStoragePath(composeFile.toString());

        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(sourceSnapshotRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId)).thenReturn(Optional.of(snapshot));
        when(projectRepository.findById(projectId)).thenReturn(Optional.of(project));

        PreflightCheckResponseDTO preflight = runtimeSessionService.runComposePreflight(snapshotId);
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getDatabaseChecks()).isNotEmpty();
        assertThat(preflight.getRequiredEnvVars()).extracting("name").contains("DB_PASSWORD");
        assertThat(preflight.getDetectedEndpoints()).extracting("path").contains("/api/orders/checkout");

        var updateReq = RuntimeProjectConfigRequestDTO.builder()
                .confirmedServiceMappings(Map.of("orders-api", "comp-orders"))
                .environmentVariables(Map.of("SPRING_PROFILES_ACTIVE", "staging"))
                .secretReferences(List.of("DB_PASSWORD"))
                .secretValues(Map.of("DB_PASSWORD", "super-secret-db-pass"))
                .build();

        var savedConfig = runtimeSessionService.updateProjectRuntimeConfig(projectId, updateReq);
        assertThat(savedConfig.getEnvironmentVariables()).containsEntry("SPRING_PROFILES_ACTIVE", "staging");
        assertThat(savedConfig.getConfiguredSecretKeys()).contains("DB_PASSWORD");
        assertThat(runtimeSessionService.getProjectExecutionEnvironment(projectId))
                .containsEntry("SPRING_PROFILES_ACTIVE", "staging")
                .containsEntry("DB_PASSWORD", "super-secret-db-pass");

        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .scenarioStatus("PENDING")
                .executionStatus("NOT_STARTED")
                .build();
        when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO approved = runtimeSessionService.approveAndStartSession(sessionId);
        assertThat(approved.getOverrideComposeYaml())
                .contains("- SPRING_PROFILES_ACTIVE=staging")
                .contains("- DB_PASSWORD=${DB_PASSWORD:-}")
                .doesNotContain("super-secret-db-pass");
    }

    @Test
    @DisplayName("STEP 1: Tự động nhận diện hệ thống có DB và AI để trả về mặc định 2 box DB_CONNECTION_STRING và API_KEY")
    void testAutoDetectDbAndAiProducesTwoDefaultBoxes(@TempDir Path tempDir) throws IOException {
        Path pomFile = tempDir.resolve("pom.xml");
        Files.writeString(pomFile, """
                <project>
                  <dependencies>
                    <dependency>
                      <groupId>org.springframework.boot</groupId>
                      <artifactId>spring-boot-starter-data-jpa</artifactId>
                    </dependency>
                    <dependency>
                      <groupId>com.mysql</groupId>
                      <artifactId>mysql-connector-j</artifactId>
                    </dependency>
                    <dependency>
                      <groupId>org.springframework.ai</groupId>
                      <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
                    </dependency>
                  </dependencies>
                </project>
                """);
        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, """
                services:
                  ai-order-service:
                    image: ai-order-service:1.0
                    ports:
                      - "8080:8080"
                """);
        snapshot.setStoragePath(composeFile.toString());
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        PreflightCheckResponseDTO preflight = runtimeSessionService.runComposePreflight(snapshotId);
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getRequiredEnvVars())
                .extracting(PreflightCheckResponseDTO.RequiredEnvVarDTO::getName)
                .containsExactly("DB_CONNECTION_STRING", "API_KEY");
    }

    @Test
    @DisplayName("STEP 1 & 2: GitHub ZIP multi-module tự động bỏ tên folder hash gốc và nhận diện đúng từng microservice")
    void testGitHubZipStripsRootHashAndDetectsMultiModuleServices(@TempDir Path tempDir) throws IOException {
        Path zipPath = tempDir.resolve("alibaba-snapshot.zip");
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(Files.newOutputStream(zipPath))) {
            zos.putNextEntry(new java.util.zip.ZipEntry("sample-spring-microservices-new-ea3924065d5e328246381c4932306cce6feb9757/employee-service/src/main/java/pl/piomin/EmployeeController.java"));
            zos.write("""
                    @RestController
                    public class EmployeeController {
                        @PostMapping("/")
                        public void add() {}
                        @GetMapping("/{id}")
                        public void findById() {}
                    }
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();

            zos.putNextEntry(new java.util.zip.ZipEntry("sample-spring-microservices-new-ea3924065d5e328246381c4932306cce6feb9757/organization-service/src/main/java/pl/piomin/OrganizationController.java"));
            zos.write("""
                    @RestController
                    @RequestMapping("/organization")
                    public class OrganizationController {
                        @GetMapping("/{organizationId}/with-employees")
                        public void findByIdWithEmployees() {}
                    }
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();
        }

        snapshot.setStoragePath(zipPath.toString());
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        PreflightCheckResponseDTO preflight = runtimeSessionService.runComposePreflight(snapshotId);
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getDetectedServices())
                .contains("employee-service", "organization-service")
                .doesNotContain("sample-spring-microservices-new-ea3924065d5e328246381c4932306cce6feb9757");
        assertThat(preflight.getDetectedEndpoints())
                .extracting(PreflightCheckResponseDTO.DetectedEndpointDTO::getService)
                .contains("employee-service", "organization-service")
                .doesNotContain("sample-spring-microservices-new-ea3924065d5e328246381c4932306cce6feb9757");
    }

    @Test
    @DisplayName("STEP 1: Petclinic microservices ánh xạ đúng module prefix vào compose service và chuẩn hóa wildcard /owners/*/pets/{petId}")
    void testPetclinicPrefixServiceMatchingAndWildcardNormalization(@TempDir Path tempDir) throws IOException {
        Path zipPath = tempDir.resolve("petclinic.zip");
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(Files.newOutputStream(zipPath))) {
            zos.putNextEntry(new java.util.zip.ZipEntry("spring-petclinic-microservices-e8b747ab522721076cacb5cf688eb8a54ba8c5c9/docker-compose.yml"));
            zos.write("""
                    services:
                      config-server:
                        image: petclinic-config:latest
                        ports: ["8888:8888"]
                      customers-service:
                        image: petclinic-customers:latest
                        ports: ["8081:8081"]
                      visits-service:
                        image: petclinic-visits:latest
                        ports: ["8082:8082"]
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();

            zos.putNextEntry(new java.util.zip.ZipEntry("spring-petclinic-microservices-e8b747ab522721076cacb5cf688eb8a54ba8c5c9/spring-petclinic-customers-service/src/main/java/org/springframework/samples/petclinic/customers/web/PetResource.java"));
            zos.write("""
                    @RestController
                    class PetResource {
                        @GetMapping("/owners/*/pets/{petId}")
                        public void findPet() {}
                    }
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();
        }

        snapshot.setStoragePath(zipPath.toString());
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        PreflightCheckResponseDTO preflight = runtimeSessionService.runComposePreflight(snapshotId);
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getDetectedEndpoints())
                .anySatisfy(ep -> {
                    assertThat(ep.getService()).isEqualTo("customers-service");
                    assertThat(ep.getMethod()).isEqualTo("GET");
                    assertThat(ep.getPath()).isEqualTo("/owners/{ownerId}/pets/{petId}");
                });
    }

    @Test
    @DisplayName("STEP 2 100%: exportRunDefinition giữ nguyên allowClientError cho C# Runner và tự tổng hợp composeYaml cho repo chỉ có Dockerfile")
    void testExportRunDefinition_PreservesAllowClientErrorAndSynthesizesDockerfileOnlyCompose(@TempDir Path tempDir) throws IOException {
        Path appDir = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(appDir.resolve("Dockerfile"), """
                FROM eclipse-temurin:21-jre
                EXPOSE 8080
                ENTRYPOINT ["java", "-jar", "/app.jar"]
                """);
        snapshot.setStoragePath(tempDir.toString());
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        String pinnedAppImage = "mavis-sandbox/order-service@sha256:" + "a".repeat(64);
        ObjectNode scenarioConfig = objectMapper.createObjectNode();
        ObjectNode profile = scenarioConfig.putObject("profile");
        profile.put("collectorImage", "otel/collector@sha256:" + "1".repeat(64));
        profile.put("scenarioRunnerImage", "mavis/runner@sha256:" + "2".repeat(64));
        profile.put("instrumentationVolume", "mavis-agents-v1");
        profile.putObject("serviceImageOverrides").put("order-service", pinnedAppImage);
        profile.putObject("applications").putObject("order-service")
                .put("runtime", "java")
                .put("containerPort", 8080)
                .put("readinessPath", "/")
                .put("allowClientErrorReadiness", true);
        ObjectNode topology = profile.putObject("studioTopology").put("version", 1);
        topology.putArray("blocks").addObject()
                .put("service", "order-service").put("label", "Order service")
                .put("canScale", true).put("initiallyStopped", true);
        topology.putArray("connections");

        ObjectNode scenario = scenarioConfig.putObject("scenario");
        ArrayNode steps = scenario.putArray("steps");
        steps.addObject()
                .put("id", "step-1")
                .put("service", "order-service")
                .put("method", "POST")
                .put("path", "/api/orders")
                .put("expectedStatus", 201)
                .put("allowClientError", true)
                .put("bodyReference", "ORDER_SERVICE_BODY_1")
                .put("rationale", "UI-only field that must be stripped before C# UnmappedMemberHandling.Disallow");

        UUID sessionId = UUID.randomUUID();
        String resourceProject = "mavisrun-0123456789abcdef0123456789abcdef";
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .resourceProject(resourceProject)
                .profileVersionId("sha256:" + "3".repeat(64))
                .runConfigurationVersionId("sha256:" + "4".repeat(64))
                .scenarioVersionId("sha256:" + "5".repeat(64))
                .scenarioConfig(scenarioConfig)
                .confirmedServiceMappings(Map.of("order-service", UUID.randomUUID().toString()))
                .build();
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        RunnerDefinitionExportDTO exported = runtimeSessionService.exportRunDefinition(sessionId);

        assertThat(exported.getComposeYaml())
                .contains("order-service:")
                .contains(pinnedAppImage)
                .doesNotContain("build:");
        JsonNode exportedStep = exported.getScenario().path("steps").get(0);
        assertThat(exportedStep.path("allowClientError").asBoolean()).isTrue();
        assertThat(exportedStep.path("bodyReference").asText()).isEqualTo("ORDER_SERVICE_BODY_1");
        assertThat(exportedStep.has("rationale")).isFalse();
        assertThat(exported.getProfile().has("serviceImageOverrides")).isFalse();
        assertThat(exported.getProfile().path("studioTopology").path("blocks").get(0)
                .path("initiallyStopped").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("WF-03 F08-002: Rejects invalid SCALE replica bounds (0 or 9) and unapproved service in createRuntimeSession")
    void rejectsInvalidInfrastructureActionBoundsAndUnapprovedService() {
        when(projectRepository.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(modelVersionRepository.findById(validModel.getId())).thenReturn(Optional.of(validModel));
        when(modelElementRepository.findByModelVersionId(validModel.getId())).thenReturn(Collections.emptyList());

        for (int badReplica : List.of(0, 9)) {
            ObjectNode cfg = objectMapper.createObjectNode();
            cfg.putObject("profile").putObject("applications").putObject("order-service").put("runtime", "java");
            cfg.putArray("infrastructureActions").addObject()
                    .put("action", "SCALE").put("service", "order-service").put("replicas", badReplica);

            RuntimeSessionCreateRequest req = RuntimeSessionCreateRequest.builder()
                    .projectId(projectId).sourceSnapshotId(snapshotId).modelVersionId(validModel.getId())
                    .profileName("SPRING_BOOT_DOTNET_COMPOSE_V1").scenarioConfig(cfg).build();

            assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(req))
                    .isInstanceOf(BusinessException.class)
                    .hasMessageContaining("REPLICA_BOUNDS_EXCEEDED")
                    .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);
        }

        ObjectNode badSvcCfg = objectMapper.createObjectNode();
        badSvcCfg.putObject("profile").putObject("applications").putObject("order-service").put("runtime", "java");
        badSvcCfg.putArray("infrastructureActions").addObject()
                .put("action", "STOP").put("service", "unauthorized-service");
        RuntimeSessionCreateRequest badSvcReq = RuntimeSessionCreateRequest.builder()
                .projectId(projectId).sourceSnapshotId(snapshotId).modelVersionId(validModel.getId())
                .profileName("SPRING_BOOT_DOTNET_COMPOSE_V1").scenarioConfig(badSvcCfg).build();

        assertThatThrownBy(() -> runtimeSessionService.createRuntimeSession(badSvcReq))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("INFRASTRUCTURE_ACTION_INVALID")
                .matches(ex -> ((BusinessException) ex).getErrorCode() == ErrorCode.BAD_REQUEST);
    }

    @Test
    void exportRunDefinitionKeepsCleanRunnerComposeWithoutInjectingSandboxInfra(@TempDir Path tempDir) throws IOException {
        Path zipPath = tempDir.resolve("commerce-seed.zip");
        String digest = "sha256:" + "d".repeat(64);
        String cleanCompose = """
                services:
                  api-gateway:
                    image: eclipse-temurin:21-jdk@%s
                    expose:
                      - "8080"
                  order-service:
                    image: eclipse-temurin:21-jdk@%s
                    expose:
                      - "8080"
                  catalog-service:
                    image: eclipse-temurin:21-jdk@%s
                    expose:
                      - "8080"
                  payment-service:
                    image: eclipse-temurin:21-jdk@%s
                    expose:
                      - "8080"
                """.formatted(digest, digest, digest, digest);
        try (java.util.zip.ZipOutputStream zos = new java.util.zip.ZipOutputStream(Files.newOutputStream(zipPath))) {
            zos.putNextEntry(new java.util.zip.ZipEntry("mavis-commerce-seed-beaf3c0/docker-compose.yml"));
            zos.write(cleanCompose.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();

            zos.putNextEntry(new java.util.zip.ZipEntry("mavis-commerce-seed-beaf3c0/order-service/src/main/resources/application.yml"));
            zos.write("""
                    spring:
                      datasource:
                        url: jdbc:postgresql://localhost:5432/orders
                      kafka:
                        bootstrap-servers: localhost:9092
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            zos.closeEntry();
        }

        snapshot.setStoragePath(zipPath.toString());
        when(sourceSnapshotRepository.findById(snapshotId)).thenReturn(Optional.of(snapshot));

        ObjectNode scenarioConfig = objectMapper.createObjectNode();
        ObjectNode profile = scenarioConfig.putObject("profile");
        profile.put("collectorImage", "otel/collector@sha256:" + "1".repeat(64));
        profile.put("scenarioRunnerImage", "mavis/runner@sha256:" + "2".repeat(64));
        profile.put("instrumentationVolume", "mavis-agents-v1");
        ObjectNode apps = profile.putObject("applications");
        for (String svc : List.of("api-gateway", "order-service", "catalog-service", "payment-service")) {
            apps.putObject(svc).put("runtime", "java").put("containerPort", 8080).put("readinessPath", "/health");
        }
        ArrayNode steps = scenarioConfig.putObject("scenario").putArray("steps");
        steps.addObject().put("id", "step-1").put("service", "api-gateway").put("method", "GET")
                .put("path", "/health").put("expectedStatus", 200);

        UUID sessionId = UUID.randomUUID();
        RuntimeSession session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(validModel)
                .resourceProject("mavisrun-0123456789abcdef0123456789abcdef")
                .profileVersionId("sha256:" + "3".repeat(64))
                .runConfigurationVersionId("sha256:" + "4".repeat(64))
                .scenarioVersionId("sha256:" + "5".repeat(64))
                .scenarioConfig(scenarioConfig)
                .confirmedServiceMappings(Map.of(
                        "api-gateway", UUID.randomUUID().toString(),
                        "order-service", UUID.randomUUID().toString(),
                        "catalog-service", UUID.randomUUID().toString(),
                        "payment-service", UUID.randomUUID().toString()))
                .build();
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        RunnerDefinitionExportDTO exported = runtimeSessionService.exportRunDefinition(sessionId);

        assertThat(exported.getComposeYaml())
                .contains("api-gateway:")
                .contains("order-service:")
                .contains("catalog-service:")
                .contains("payment-service:")
                .doesNotContain("sandbox-postgres")
                .doesNotContain("sandbox-kafka");
    }
}