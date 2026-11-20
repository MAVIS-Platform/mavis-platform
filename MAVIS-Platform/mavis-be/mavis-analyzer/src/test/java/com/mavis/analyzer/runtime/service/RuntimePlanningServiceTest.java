package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DetectedEndpointDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.GenerateScenarioRequest;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.GeneratedScenarioDraftView;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.StartRequest;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.RuntimeScenario;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.RuntimeScenarioRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.security.AccessPolicyService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RuntimePlanningServiceTest {

    @Mock private ProjectRepository projects;
    @Mock private SourceSnapshotRepository sources;
    @Mock private ModelVersionRepository models;
    @Mock private RuntimeConfigurationRepository configurations;
    @Mock private RuntimeScenarioRepository scenarios;
    @Mock private AccessPolicyService policy;
    @Mock private RuntimeSessionService runtime;
    @Mock private RuntimeSessionEnvironmentService environments;
    @Mock private ApiKeyProvider apiKeyProvider;

    private final ObjectMapper json = new ObjectMapper();
    private final PlatformRuntimeSettings settings = new PlatformRuntimeSettings();
    private RuntimePlanningService planningService;

    private UUID projectId;
    private UUID snapshotId;
    private UUID modelId;
    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion model;

    @BeforeEach
    void setUp() {
        planningService = new RuntimePlanningService(
                projects, sources, models, configurations, scenarios,
                policy, settings, runtime, json, environments
        );
        ReflectionTestUtils.setField(planningService, "apiKeyProvider", apiKeyProvider);

        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();
        modelId = UUID.randomUUID();
        project = Project.builder().id(projectId).name("Test Project").build();
        snapshot = SourceSnapshot.builder().id(snapshotId).project(project).build();
        model = ModelVersion.builder().id(modelId).project(project).sourceSnapshot(snapshot).revision(1).isLatestValid(true).build();
    }

    @Test
    void rebuildingForNewSnapshotPinsItsModelAndDropsPreviousProfile() {
        var old = configuredImageBuild();
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId)).thenReturn(Optional.of(model));
        planningService.buildSandboxImages(projectId, new RuntimePlanningService.BuildImagesRequest(snapshotId, List.of("orders")));
        assertThat(old.getSourceSnapshotId()).isEqualTo(snapshotId);
        assertThat(old.getModelVersionId()).isEqualTo(modelId);
        assertThat(old.getRevision()).isEqualTo(8);
        assertThat(old.getProfile().path("serviceImageOverrides").has("old-service")).isFalse();
        assertThat(old.getProfile().path("serviceImageOverrides").path("orders").asText()).isEqualTo("sha256:" + "a".repeat(64));
        assertThat(old.getProfile().has("sealedInputs")).isFalse();
        verify(configurations).saveAndFlush(old);
    }

    @Test
    void buildingUnanalyzedSourcePreservesPreviousConfiguration() {
        var old = configuredImageBuild();
        UUID previousSnapshot = old.getSourceSnapshotId();
        UUID previousModel = old.getModelVersionId();
        var profile = old.getProfile().deepCopy();
        var result = planningService.buildSandboxImages(projectId,
                new RuntimePlanningService.BuildImagesRequest(snapshotId, List.of("orders")));
        assertThat(result.errors()).contains("Analyze the selected source snapshot before updating the runtime configuration.");
        assertThat(old.getSourceSnapshotId()).isEqualTo(previousSnapshot);
        assertThat(old.getModelVersionId()).isEqualTo(previousModel);
        assertThat(old.getRevision()).isEqualTo(7);
        assertThat(old.getProfile()).isEqualTo(profile);
        verify(configurations, never()).saveAndFlush(any());
    }

    private RuntimeConfiguration configuredImageBuild() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        snapshot.setStoragePath("/qa/pinned-source.zip");
        var builder = mock(SandboxImageBuilderService.class);
        ReflectionTestUtils.setField(planningService, "imageBuilder", builder);
        when(builder.buildSnapshotImages(projectId, snapshotId, java.nio.file.Path.of(snapshot.getStoragePath()), List.of("orders")))
                .thenReturn(new SandboxImageBuilderService.BuildImagesResult(Map.of("orders", "sha256:" + "a".repeat(64)), List.of()));
        var config = new RuntimeConfiguration();
        config.setProjectId(projectId);
        config.setSourceSnapshotId(UUID.randomUUID());
        config.setModelVersionId(UUID.randomUUID());
        config.setRevision(7);
        ObjectNode profile = json.createObjectNode().put("sealedInputs", "old-source-envelope");
        profile.putObject("serviceImageOverrides").put("old-service", "sha256:" + "b".repeat(64));
        config.setProfile(profile);
        when(configurations.findById(projectId)).thenReturn(Optional.of(config));
        return config;
    }

    @Test
    @DisplayName("STEP 2: Hệ thống + AI tự động sinh kịch bản, lọc bỏ service ảo giác và điền sẵn sample inputs")
    void testGenerateScenario_SystemAndAiWithAllowlistValidation() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));

        PreflightCheckResponseDTO preflight = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("orders-api", "payment-api"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("orders-api").method("GET").path("/api/orders/{orderId}").source("OrderController.java").build(),
                        DetectedEndpointDTO.builder().service("orders-api").method("POST").path("/api/orders/checkout").source("OrderController.java").build()
                ))
                .build();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of("DB_PASSWORD", "secret", "SPRING_PROFILES_ACTIVE", "staging"));

        // 1. Nhánh SYSTEM_STATIC (chưa có API Key)
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());
        GeneratedScenarioDraftView staticDraft = planningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, modelId, null));

        assertThat(staticDraft.generatorMode()).isEqualTo("SYSTEM_STATIC");
        assertThat(staticDraft.steps()).hasSize(2);
        assertThat(staticDraft.steps().get(0).path()).isEqualTo("/api/orders/{{V0}}");
        assertThat(staticDraft.sampleInputs()).containsKeys("ORDERS_API_ORDERID", "ORDERS_API_BODY_2");
        assertThat(staticDraft.inheritedEnvKeys()).contains("DB_PASSWORD", "SPRING_PROFILES_ACTIVE");

        // 2. Nhánh AI_ASSISTED (có API Key + Mock Gemini Server trả về cả bước hợp lệ và bước ảo giác)
        HttpServer mockGemini = HttpServer.create(new InetSocketAddress(0), 0);
        mockGemini.createContext("/gemini", exchange -> {
            String geminiResponse = """
                    {
                      "candidates": [{
                        "content": {
                          "parts": [{
                            "text": "{\\"suggestedName\\":\\"Luồng Đặt hàng & Thanh toán AI\\",\\"summary\\":\\"Kiểm thử luồng đặt hàng\\",\\"steps\\":[{\\"service\\":\\"orders-api\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/orders/checkout\\",\\"expectedStatus\\":201,\\"rationale\\":\\"Tạo đơn hàng mới\\",\\"sampleJsonBody\\":\\"{\\\\\\"itemId\\\\\\":\\\\\\"sku-99\\\\\\",\\\\\\"qty\\\\\\":2}\\"},{\\"service\\":\\"hallucinated-service\\",\\"method\\":\\"GET\\",\\"path\\":\\"/hack\\",\\"expectedStatus\\":200,\\"rationale\\":\\"Service không tồn tại\\"}]}"
                          }]
                        }
                      }]
                    }
                    """;
            byte[] bytes = geminiResponse.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockGemini.start();
        try {
            int port = mockGemini.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/gemini");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("dummy-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Kiểm thử đặt hàng"));

            assertThat(aiDraft.generatorMode()).isEqualTo("AI_ASSISTED");
            assertThat(aiDraft.suggestedName()).isEqualTo("Luồng Đặt hàng & Thanh toán AI");
            assertThat(aiDraft.steps()).hasSize(1); // hallucinated-service bị chặn bởi allowlist
            assertThat(aiDraft.steps().get(0).service()).isEqualTo("orders-api");
            assertThat(aiDraft.steps().get(0).expectedStatus()).isEqualTo(201);
            assertThat(aiDraft.sampleInputs().get("ORDERS_API_BODY_1")).contains("sku-99");
        } finally {
            mockGemini.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 2 -> START: Tự động kế thừa biến môi trường và secret từ Step 1 khi user xác nhận chạy ở Step 2")
    void testStart_InheritsStep1EnvironmentVariablesAndSecrets() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));

        ObjectNode profile = json.createObjectNode();
        ObjectNode apps = profile.putObject("applications");
        apps.putObject("orders-api").put("runtime", "java").put("containerPort", 8080);

        RuntimeConfiguration cfg = new RuntimeConfiguration();
        cfg.setProjectId(projectId);
        cfg.setSourceSnapshotId(snapshotId);
        cfg.setModelVersionId(modelId);
        cfg.setProfileId("SPRING_BOOT_DOTNET_COMPOSE_V1");
        cfg.setProfile(profile);
        cfg.setRevision(1);
        when(configurations.findById(projectId)).thenReturn(Optional.of(cfg));

        UUID scenarioId = UUID.randomUUID();
        RuntimeScenario scenario = new RuntimeScenario();
        scenario.setId(scenarioId);
        scenario.setProjectId(projectId);
        scenario.setName("Confirmed Scenario");
        scenario.setRevision(1);
        var stepsArr = json.createArrayNode();
        stepsArr.addObject().put("id", "step-1").put("service", "orders-api").put("method", "GET").put("path", "/health").put("expectedStatus", 200);
        scenario.setSteps(stepsArr);
        when(scenarios.findById(scenarioId)).thenReturn(Optional.of(scenario));

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("orders-api"))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of(
                "DB_PASSWORD", "step1-db-secret",
                "SPRING_PROFILES_ACTIVE", "staging"
        ));

        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).executionStatus("READY_FOR_DISPATCH").build());

        StartRequest startReq = new StartRequest(snapshotId, scenarioId, 1, 1, true, Map.of("ORDERS_API_BODY_1", "{\"qty\":1}"));
        RuntimeSessionResponseDTO resp = planningService.start(projectId, startReq);

        assertThat(resp.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        verify(environments).store(eq(sessionId), eq(Map.of(
                "DB_PASSWORD", "step1-db-secret",
                "SPRING_PROFILES_ACTIVE", "staging",
                "ORDERS_API_BODY_1", "{\"qty\":1}"
        )));
    }

    private RuntimeConfiguration savedConfig(String... appNames) {
        ObjectNode profile = json.createObjectNode();
        ObjectNode apps = profile.putObject("applications");
        for (String app : appNames) apps.putObject(app).put("runtime", "java").put("containerPort", 8080);
        RuntimeConfiguration cfg = new RuntimeConfiguration();
        cfg.setProjectId(projectId);
        cfg.setSourceSnapshotId(snapshotId);
        cfg.setModelVersionId(modelId);
        cfg.setProfileId("SPRING_BOOT_DOTNET_COMPOSE_V1");
        cfg.setProfile(profile);
        cfg.setRevision(1);
        return cfg;
    }

    private UUID savedScenario(String service) {
        UUID scenarioId = UUID.randomUUID();
        RuntimeScenario scenario = new RuntimeScenario();
        scenario.setId(scenarioId);
        scenario.setProjectId(projectId);
        scenario.setName("Auto");
        scenario.setRevision(1);
        var steps = json.createArrayNode();
        steps.addObject().put("id", "s1").put("service", service).put("method", "GET").put("path", "/health").put("expectedStatus", 200);
        scenario.setSteps(steps);
        when(scenarios.findById(scenarioId)).thenReturn(Optional.of(scenario));
        return scenarioId;
    }

    @Test
    void rejectsSavedComposeThatDoesNotMeetRunnerRequirementsBeforeCreatingSession() {
        var configuration = savedConfig("orders-api");
        ((ObjectNode) configuration.getProfile()).put("sandboxCompose", """
                services:
                  orders-api:
                    image: mavis/orders-api:curated
                """);
        ReflectionTestUtils.setField(planningService, "composeValidator", new ComposePreflightValidator());
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(configuration));
        var scenarioId = savedScenario("orders-api");
        when(runtime.runComposePreflight(snapshotId)).thenReturn(
                PreflightCheckResponseDTO.builder().compatible(true).build());

        assertThatThrownBy(() -> planningService.start(projectId,
                new StartRequest(snapshotId, scenarioId, 1, 1, true, null)))
                .isInstanceOfSatisfying(com.mavis.common.exception.BusinessException.class, failure -> {
                    assertThat(failure.getStableCode()).isEqualTo("PREFLIGHT_FAILED");
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                });
        verify(runtime, org.mockito.Mockito.never()).createRuntimeSession(any());
    }

    @Test
    void guidedStudioRejectsMissingFrozenTopologyEvenIfReferenceProfileHasTopology() {
        var referenceProject = Project.builder().id(UUID.randomUUID()).build();
        var reference = SourceSnapshot.builder().id(UUID.randomUUID())
                .project(referenceProject).isPublished(true).build();
        var assignment = new com.mavis.common.entity.Assignment();
        assignment.setReferenceModel(ModelVersion.builder().sourceSnapshot(reference).build());
        var workspace = new com.mavis.common.entity.Workspace();
        workspace.setCourseMode(true);
        project.setWorkspace(workspace);
        project.setProjectType("STUDENT_WORKING");
        project.setAssignment(assignment);
        project.setReferenceSnapshotId(reference.getId());
        var teacherConfig = savedConfig("orders-api");
        teacherConfig.setSourceSnapshotId(reference.getId());
        ((ObjectNode)teacherConfig.getProfile()).putObject("studioTopology").put("version",1)
                .putArray("blocks").addObject().put("service","orders-api").put("label","Reference B");
        ((ObjectNode)teacherConfig.getProfile().path("studioTopology")).putArray("connections");
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("orders-api")));
        lenient().when(configurations.findById(referenceProject.getId())).thenReturn(Optional.of(teacherConfig));
        var serviceId=UUID.randomUUID().toString();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true).detectedServices(List.of("orders-api"))
                .modelServiceNames(Map.of(serviceId,"orders-api"))
                .recommendedServiceMappings(Map.of("orders-api",serviceId)).build());
        var scenarioId=savedScenario("orders-api");

        assertThatThrownBy(() -> planningService.start(projectId,
                new StartRequest(snapshotId,scenarioId,1,1,true,null,List.of(),true)))
                .isInstanceOf(com.mavis.common.exception.BusinessException.class)
                .hasMessageContaining("not frozen");
        verify(runtime, org.mockito.Mockito.never()).createRuntimeSession(any());
    }

    @Test
    void guidedStudioRejectsFrozenTopologyOutsideConfirmedServices() {
        var referenceProject = Project.builder().id(UUID.randomUUID()).build();
        var reference = SourceSnapshot.builder().id(UUID.randomUUID())
                .project(referenceProject).isPublished(true).build();
        var assignment = new com.mavis.common.entity.Assignment();
        assignment.setReferenceModel(ModelVersion.builder().sourceSnapshot(reference).build());
        var frozen = json.createObjectNode().put("version",1);
        frozen.putArray("blocks").addObject().put("service","ghost").put("label","Outside");
        frozen.putArray("connections");
        assignment.setStudioTopologySnapshot(frozen);
        assignment.setStudioTopologyRevision(8);
        var workspace = new com.mavis.common.entity.Workspace();
        workspace.setCourseMode(true);
        project.setWorkspace(workspace);
        project.setProjectType("STUDENT_WORKING");
        project.setAssignment(assignment);
        project.setReferenceSnapshotId(reference.getId());
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("orders-api")));
        var serviceId=UUID.randomUUID().toString();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true).detectedServices(List.of("orders-api"))
                .modelServiceNames(Map.of(serviceId,"orders-api"))
                .recommendedServiceMappings(Map.of("orders-api",serviceId)).build());
        var scenarioId=savedScenario("orders-api");

        assertThatThrownBy(() -> planningService.start(projectId,
                new StartRequest(snapshotId,scenarioId,1,1,true,null,List.of(),true)))
                .isInstanceOf(com.mavis.common.exception.BusinessException.class)
                .hasMessageContaining("Invalid prepared Studio topology");
        verify(runtime, org.mockito.Mockito.never()).createRuntimeSession(any());
    }

    @Test
    void guidedStudioUsesFrozenLabTopologyBeforeTheReferenceProfile() {
        var referenceProject = Project.builder().id(UUID.randomUUID()).build();
        var reference = SourceSnapshot.builder().id(UUID.randomUUID())
                .project(referenceProject).isPublished(true).build();
        var assignment = new com.mavis.common.entity.Assignment();
        assignment.setReferenceModel(ModelVersion.builder().sourceSnapshot(reference).build());
        var frozen = json.createObjectNode().put("version",1);
        frozen.putArray("blocks").addObject().put("service","orders-api").put("label","Frozen orders");
        frozen.putArray("connections");
        assignment.setStudioTopologySnapshot(frozen);
        assignment.setStudioTopologyRevision(7);
        var referenceConfigB = savedConfig("orders-api");
        referenceConfigB.setSourceSnapshotId(reference.getId());
        ((ObjectNode)referenceConfigB.getProfile()).putObject("studioTopology").put("version",1)
                .putArray("blocks").addObject().put("service","orders-api").put("label","Reference B");
        ((ObjectNode)referenceConfigB.getProfile().path("studioTopology")).putArray("connections");
        lenient().when(configurations.findById(referenceProject.getId())).thenReturn(Optional.of(referenceConfigB));
        var workspace = new com.mavis.common.entity.Workspace();
        workspace.setCourseMode(true);
        project.setWorkspace(workspace);
        project.setProjectType("STUDENT_WORKING");
        project.setAssignment(assignment);
        project.setReferenceSnapshotId(reference.getId());
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("orders-api")));
        var serviceId=UUID.randomUUID().toString();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true).detectedServices(List.of("orders-api"))
                .modelServiceNames(Map.of(serviceId,"orders-api"))
                .recommendedServiceMappings(Map.of("orders-api",serviceId)).build());
        var scenarioId=savedScenario("orders-api");
        var sessionId=UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());

        planningService.start(projectId,new StartRequest(snapshotId,scenarioId,1,1,true,null,List.of(),true));

        verify(runtime).createRuntimeSession(org.mockito.ArgumentMatchers.argThat(request -> "Frozen orders".equals(request.getScenarioConfig()
                .path("profile").path("studioTopology").path("blocks").get(0).path("label").asText())));
    }

    @Test
    @DisplayName("STEP 1 AUTO: sandbox secrets are generated or reused from the DB container and bound to the owning service")
    void testStart_ProvidesSandboxSecretsWithoutUserInput() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("orders-api")));
        UUID scenarioId = savedScenario("orders-api");
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("orders-api", "orders-db"))
                .infrastructureServices(List.of("orders-db"))
                .sandboxDatabaseCredentials(Map.of("POSTGRES_PASSWORD", "pg-literal"))
                .requiredEnvVars(List.of(
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder().name("JWT_SECRET").service("orders-api").category("SECRET").scope("SANDBOX").build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder().name("DB_PASSWORD").service("orders-api").category("DB_SECRET").scope("SANDBOX").build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder().name("OPENAI_API_KEY").service("orders-api").category("SECRET").scope("EXTERNAL").build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder().name("SERVER_PORT").service("orders-api").category("ENV").defaultValue("8080").defaultPresent(true).build()))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of("SERVER_PORT", "8080"));
        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());

        planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null));

        ArgumentCaptor<com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest> created = ArgumentCaptor.forClass(com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest.class);
        verify(runtime).createRuntimeSession(created.capture());
        var bindings = created.getValue().getScenarioConfig().path("profile").path("environmentBindings").path("orders-api");
        assertThat(bindings.findValuesAsText("name")).containsExactlyInAnyOrder("JWT_SECRET", "DB_PASSWORD");
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> stored = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), stored.capture());
        assertThat(stored.getValue()).containsEntry("DB_PASSWORD", "pg-literal").doesNotContainKeys("OPENAI_API_KEY", "SERVER_PORT");
        assertThat(stored.getValue().get("JWT_SECRET")).hasSize(88); // 64 random bytes: HS512-safe
    }

    @Test
    @DisplayName("STEP 1 AUTO: Compose files the runner would reject are refused before a session is created")
    void testStart_RejectsComposeTheRunnerCannotExecute() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("orders-api")));
        UUID scenarioId = savedScenario("orders-api");
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("orders-api"))
                .runnerIssues(List.of("Service 'orders-api' uses build:"))
                .build());

        assertThatThrownBy(() -> planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null)))
                .isInstanceOfSatisfying(com.mavis.common.exception.BusinessException.class, failure -> {
                    assertThat(failure.getStableCode()).isEqualTo("PREFLIGHT_FAILED");
                    assertThat(failure.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                });
        verify(runtime, org.mockito.Mockito.never()).createRuntimeSession(any());
    }

    @Test
    @DisplayName("STEP 1 AUTO: profile excludes infrastructure, uses detected port/health and operator images")
    void testNormalizeStep1Profile_BuildsRunnableApplicationsAutomatically() {
        ReflectionTestUtils.setField(planningService, "runnerCollectorImage", "otel/collector@sha256:" + "d".repeat(64));
        ReflectionTestUtils.setField(planningService, "runnerScenarioImage", "mavis/scenario-runner@sha256:" + "e".repeat(64));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .detectedServices(List.of("order-service", "orders-db", "model-only-service"))
                .composeServices(List.of("order-service", "orders-db"))
                .infrastructureServices(List.of("orders-db"))
                .servicePorts(Map.of("order-service", 8081, "orders-db", 5432))
                .serviceHealthPaths(Map.of("order-service", "/actuator/health"))
                .build());
        when(environments.sealProjectInputs(eq(projectId), any())).thenReturn("v1.nonce.cipher");
        ObjectNode raw = json.createObjectNode();
        raw.putObject("serviceMappings").put("order-service", "order-service").put("orders-db", "orders-db");
        raw.putObject("secretValues").put("OPENAI_API_KEY", "sk-live-123");

        ObjectNode profile = (ObjectNode) ReflectionTestUtils.invokeMethod(planningService, "normalizeStep1Profile",
                projectId, snapshotId, "SPRING_BOOT_DOTNET_COMPOSE_V1", raw);

        assertThat(profile.path("applications").has("orders-db")).isFalse();
        assertThat(profile.path("applications").has("model-only-service")).isFalse();
        assertThat(profile.path("applications").path("order-service").path("containerPort").asInt()).isEqualTo(8081);
        assertThat(profile.path("applications").path("order-service").path("readinessPath").asText()).isEqualTo("/actuator/health");
        assertThat(profile.path("sealedInputs").asText()).isEqualTo("v1.nonce.cipher");
        assertThat(profile.path("collectorImage").asText()).endsWith("d".repeat(64));
        assertThat(profile.path("scenarioRunnerImage").asText()).endsWith("e".repeat(64));
    }

    @Test
    @DisplayName("STEP 1 100%: Multi-DB scoped secrets, shared multi-service JWT_SECRET, relocated compose secrets, unified management port & UUID mappings")
    void testStart_MultiDbScopedCredentialsSharedSecretsRelocatedComposeSecretsAndUuidMappings() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        RuntimeConfiguration cfg = savedConfig("api-gateway", "order-service", "catalog-service");
        ((ObjectNode) cfg.getProfile()).putObject("serviceMappings")
                .put("api-gateway", "api-gateway")
                .put("order-service", "order-service")
                .put("catalog-service", "catalog-service");
        when(configurations.findById(projectId)).thenReturn(Optional.of(cfg));
        UUID scenarioId = savedScenario("order-service");

        String gwUuid = UUID.randomUUID().toString();
        String orderUuid = UUID.randomUUID().toString();
        String catalogUuid = UUID.randomUUID().toString();

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway", "order-service", "catalog-service", "orders-db", "catalog-db"))
                .composeServices(List.of("api-gateway", "order-service", "catalog-service", "orders-db", "catalog-db"))
                .infrastructureServices(List.of("orders-db", "catalog-db"))
                .serviceDatabaseCredentials(Map.of(
                        "orders-db", Map.of("POSTGRES_PASSWORD", "orders-pw"),
                        "catalog-db", Map.of("POSTGRES_PASSWORD", "catalog-pw")
                ))
                .serviceDependencies(Map.of(
                        "order-service", List.of("orders-db"),
                        "catalog-service", List.of("catalog-db")
                ))
                .relocatedComposeSecrets(Map.of(
                        "orders-db", Map.of("POSTGRES_PASSWORD", "orders-pw"),
                        "catalog-db", Map.of("POSTGRES_PASSWORD", "catalog-pw")
                ))
                .unifiedManagementPorts(Map.of("order-service", 8085))
                .recommendedServiceMappings(Map.of(
                        "api-gateway", gwUuid,
                        "order-service", orderUuid,
                        "catalog-service", catalogUuid
                ))
                .modelServiceNames(Map.of(
                        gwUuid, "api-gateway",
                        orderUuid, "order-service",
                        catalogUuid, "catalog-service"
                ))
                .requiredEnvVars(List.of(
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("JWT_SECRET")
                                .service("api-gateway")
                                .services(List.of("api-gateway", "order-service", "catalog-service"))
                                .category("SECRET")
                                .scope("SANDBOX")
                                .build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("DB_PASSWORD")
                                .service("order-service")
                                .services(List.of("order-service", "catalog-service"))
                                .category("DB_SECRET")
                                .scope("SANDBOX")
                                .build()
                ))
                .build());

        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());

        planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null));

        ArgumentCaptor<com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest> created =
                ArgumentCaptor.forClass(com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest.class);
        verify(runtime).createRuntimeSession(created.capture());

        assertThat(created.getValue().getConfirmedServiceMappings())
                .containsEntry("api-gateway", gwUuid)
                .containsEntry("order-service", orderUuid)
                .containsEntry("catalog-service", catalogUuid);

        var envBindings = created.getValue().getScenarioConfig().path("profile").path("environmentBindings");
        assertThat(envBindings.path("api-gateway").findValuesAsText("name")).contains("JWT_SECRET");
        assertThat(envBindings.path("order-service").toString())
                .contains("\"name\":\"DB_PASSWORD\",\"reference\":\"ORDER_SERVICE__DB_PASSWORD\"")
                .contains("\"name\":\"JWT_SECRET\",\"reference\":\"JWT_SECRET\"")
                .contains("\"name\":\"MANAGEMENT_SERVER_PORT\",\"reference\":\"MANAGEMENT_SERVER_PORT\"");
        assertThat(envBindings.path("catalog-service").toString())
                .contains("\"name\":\"DB_PASSWORD\",\"reference\":\"CATALOG_SERVICE__DB_PASSWORD\"")
                .contains("\"name\":\"JWT_SECRET\",\"reference\":\"JWT_SECRET\"");
        assertThat(envBindings.path("orders-db").toString())
                .contains("\"name\":\"POSTGRES_PASSWORD\",\"reference\":\"ORDERS_DB__POSTGRES_PASSWORD\"");
        assertThat(envBindings.path("catalog-db").toString())
                .contains("\"name\":\"POSTGRES_PASSWORD\",\"reference\":\"CATALOG_DB__POSTGRES_PASSWORD\"");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> stored = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), stored.capture());
        assertThat(stored.getValue())
                .containsEntry("ORDER_SERVICE__DB_PASSWORD", "orders-pw")
                .containsEntry("CATALOG_SERVICE__DB_PASSWORD", "catalog-pw")
                .containsEntry("ORDERS_DB__POSTGRES_PASSWORD", "orders-pw")
                .containsEntry("CATALOG_DB__POSTGRES_PASSWORD", "catalog-pw")
                .containsEntry("MANAGEMENT_SERVER_PORT", "8085");
        assertThat(stored.getValue().get("JWT_SECRET")).hasSize(88); // 64 random bytes: HS512-safe
    }

    @Test
    void stepOneSelectsTheMuslAgentForAlpineDotnetServices() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        String serviceId = UUID.randomUUID().toString();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true).detectedServices(List.of("orders")).composeServices(List.of("orders"))
                .serviceStacks(Map.of("orders", "dotnet-musl")).servicePorts(Map.of("orders", 8080))
                .recommendedServiceMappings(Map.of("orders", serviceId)).modelServiceNames(Map.of(serviceId, "orders")).build());
        var holder = new java.util.concurrent.atomic.AtomicReference<RuntimeConfiguration>();
        when(configurations.findById(projectId)).thenAnswer(inv -> Optional.ofNullable(holder.get()));
        when(configurations.saveAndFlush(any())).thenAnswer(inv -> {
            holder.set(inv.getArgument(0));
            return holder.get();
        });
        ObjectNode profile = json.createObjectNode();
        profile.putObject("serviceMappings").put("orders", "orders");
        var saved = planningService.saveConfiguration(projectId, new RuntimePlanningService.ConfigurationRequest(
                snapshotId, modelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", profile, 0));
        assertThat(saved.profile().path("applications").path("orders").path("runtime").asText())
                .isEqualTo("dotnet8-linux-x64-musl");
    }

    @Test
    @DisplayName("STEP 1 100%: Step 1 draft saves immediately without operator images, maps polyglot/ASSUMED readiness, and enforces operator images at start()")
    void testSaveConfiguration_AllowsStep1DraftWithoutOperatorImagesWhileStartEnforcesThem() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));

        String gwUuid = UUID.randomUUID().toString();
        PreflightCheckResponseDTO preflight = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("gateway-node"))
                .composeServices(List.of("gateway-node"))
                .servicePorts(Map.of("gateway-node", 3000))
                .serviceStacks(Map.of("gateway-node", "node"))
                .serviceHealthPaths(Map.of("gateway-node", "/"))
                .serviceHealthConfidence(Map.of("gateway-node", "ASSUMED"))
                .recommendedServiceMappings(Map.of("gateway-node", gwUuid))
                .modelServiceNames(Map.of(gwUuid, "gateway-node"))
                .build();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);

        final RuntimeConfiguration[] holder = new RuntimeConfiguration[1];
        when(configurations.findById(projectId)).thenAnswer(inv -> Optional.ofNullable(holder[0]));
        when(configurations.saveAndFlush(any())).thenAnswer(inv -> {
            holder[0] = inv.getArgument(0);
            return holder[0];
        });

        ObjectNode step1Form = json.createObjectNode();
        step1Form.putObject("serviceMappings").put("gateway-node", "gateway-node");
        step1Form.putObject("environmentVariables").put("NODE_ENV", "production");

        var savedView = planningService.saveConfiguration(projectId,
                new RuntimePlanningService.ConfigurationRequest(snapshotId, modelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", step1Form, 0));

        assertThat(savedView.configured()).isTrue();
        assertThat(savedView.ready()).isFalse(); // operator images not configured yet
        assertThat(savedView.profile().path("serviceMappings").path("gateway-node").asText()).isEqualTo(gwUuid);
        assertThat(savedView.profile().path("applications").path("gateway-node").path("runtime").asText()).isEqualTo("passthrough");
        assertThat(savedView.profile().path("applications").path("gateway-node").path("allowClientErrorReadiness").asBoolean()).isTrue();

        UUID scenarioId = savedScenario("gateway-node");
        assertThatThrownBy(() -> planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null)))
                .hasMessageContaining("Sandbox runner images are not configured");
    }

    @Test
    @DisplayName("STEP 1 100%: App DB_PASSWORD declared before infra POSTGRES_PASSWORD still shares the exact generated password")
    void testStart_AppDbPasswordDeclaredBeforeInfraPostgresPasswordSharesGeneratedSecret() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("order-service")));
        UUID scenarioId = savedScenario("order-service");

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("order-service", "orders-db"))
                .composeServices(List.of("order-service", "orders-db"))
                .infrastructureServices(List.of("orders-db"))
                .serviceDependencies(Map.of("order-service", List.of("orders-db")))
                .requiredEnvVars(List.of(
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("DB_PASSWORD")
                                .service("order-service")
                                .services(List.of("order-service"))
                                .category("DB_SECRET")
                                .scope("SANDBOX")
                                .build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("POSTGRES_PASSWORD")
                                .service("orders-db")
                                .services(List.of("orders-db"))
                                .category("DB_SECRET")
                                .scope("SANDBOX")
                                .build()
                ))
                .build());
        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO.builder().id(sessionId).build());

        planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> stored = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), stored.capture());
        assertThat(stored.getValue().get("DB_PASSWORD"))
                .isNotBlank()
                .isEqualTo(stored.getValue().get("POSTGRES_PASSWORD"));
    }

    @Test
    @DisplayName("STEP 1 100%: Composite ${VAR} templates expand per service using defaults, DB container credentials and relocated secrets")
    void testStart_ExpandsCompositeEnvTemplatesAndWiresAutoProvisionedSandboxDbSecrets() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("order-service")));
        UUID scenarioId = savedScenario("order-service");

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("order-service", "sandbox-postgres"))
                .composeServices(List.of("order-service", "sandbox-postgres"))
                .infrastructureServices(List.of("sandbox-postgres"))
                .serviceDependencies(Map.of("order-service", List.of("sandbox-postgres")))
                .serviceDatabaseCredentials(Map.of("sandbox-postgres", Map.of(
                        "POSTGRES_USER", "testseed_user",
                        "POSTGRES_DB", "testseed",
                        "POSTGRES_PASSWORD", "ephemeral-pw-123"
                )))
                .sandboxDatabaseCredentials(Map.of(
                        "POSTGRES_USER", "testseed_user",
                        "POSTGRES_DB", "testseed",
                        "POSTGRES_PASSWORD", "ephemeral-pw-123"
                ))
                .relocatedComposeSecrets(Map.of(
                        "sandbox-postgres", Map.of("POSTGRES_PASSWORD", "ephemeral-pw-123")
                ))
                .composeEnvTemplates(Map.of("order-service", Map.of(
                        "SPRING_DATASOURCE_URL", "jdbc:postgresql://sandbox-postgres:5432/${DB_NAME}",
                        "ASYNC_DATABASE_URL", "postgresql://${DB_USERNAME}:${DB_PASSWORD}@sandbox-postgres:5432/${DB_NAME}"
                )))
                .requiredEnvVars(List.of(
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("DB_NAME")
                                .service("order-service")
                                .category("ENV")
                                .defaultValue("testseed")
                                .defaultPresent(true)
                                .build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("DB_USERNAME")
                                .service("order-service")
                                .category("ENV")
                                .defaultValue("testseed_user")
                                .defaultPresent(true)
                                .build(),
                        PreflightCheckResponseDTO.RequiredEnvVarDTO.builder()
                                .name("DB_PASSWORD")
                                .service("order-service")
                                .category("DB_SECRET")
                                .scope("SANDBOX")
                                .build()
                ))
                .build());

        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());

        planningService.start(projectId, new StartRequest(snapshotId, scenarioId, 1, 1, true, null));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> stored = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), stored.capture());
        assertThat(stored.getValue())
                .containsEntry("POSTGRES_PASSWORD", "ephemeral-pw-123")
                .containsEntry("DB_PASSWORD", "ephemeral-pw-123")
                .containsEntry("SPRING_DATASOURCE_URL", "jdbc:postgresql://sandbox-postgres:5432/testseed")
                .containsEntry("ASYNC_DATABASE_URL", "postgresql://testseed_user:ephemeral-pw-123@sandbox-postgres:5432/testseed");
    }

    @Test
    @DisplayName("STEP 2 100%: Causal CRUD ordering, infra exclusion, ModelElement-to-Compose normalization, DTO sampleJsonBody & multi-service health fallback")
    void testGenerateScenario_CausalMultiServiceOrderingExcludesInfraAndSynthesizesDtoPayloads() {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

        String gwUuid = UUID.randomUUID().toString();
        String orderUuid = UUID.randomUUID().toString();
        String invUuid = UUID.randomUUID().toString();

        PreflightCheckResponseDTO preflight = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("order-service", "api-gateway", "inventory-service", "orders-db", "sandbox-postgres", "redis"))
                .composeServices(List.of("order-service", "api-gateway", "inventory-service", "orders-db", "sandbox-postgres", "redis"))
                .infrastructureServices(List.of("orders-db", "sandbox-postgres", "redis"))
                .serviceHealthPaths(Map.of("inventory-service", "/actuator/health"))
                .recommendedServiceMappings(Map.of(
                        "api-gateway", gwUuid,
                        "order-service", orderUuid,
                        "inventory-service", invUuid
                ))
                .modelServiceNames(Map.of(
                        gwUuid, "ApiGateway",
                        orderUuid, "OrderService",
                        invUuid, "InventoryService"
                ))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("orders-db").method("GET").path("/db-internal").source("fake").build(),
                        DetectedEndpointDTO.builder().service("OrderService").method("GET").path("/actuator/health").source("Actuator").build(),
                        DetectedEndpointDTO.builder().service("OrderService").method("DELETE").path("/api/orders/{id}").expectedStatus(204).source("OrderController.java").build(),
                        DetectedEndpointDTO.builder().service("OrderService").method("GET").path("/api/orders/{id}").source("OrderController.java").build(),
                        DetectedEndpointDTO.builder()
                                .service("OrderService")
                                .method("POST")
                                .path("/api/orders")
                                .expectedStatus(201)
                                .requestBodyType("CreateOrderDto")
                                .sampleJsonBody("{\"sku\":\"SKU-900\",\"quantity\":2}")
                                .source("OrderController.java")
                                .build(),
                        DetectedEndpointDTO.builder().service("ApiGateway").method("POST").path("/api/auth/login").expectedStatus(200).sampleJsonBody("{\"email\":\"user@example.com\",\"password\":\"SandboxPass123!\"}").source("AuthController.java").build()
                ))
                .build();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);

        GeneratedScenarioDraftView draft = planningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, modelId, null));

        assertThat(draft.runnableServices())
                .containsExactly("order-service", "api-gateway", "inventory-service")
                .doesNotContain("orders-db", "sandbox-postgres", "redis");
        assertThat(draft.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::service)
                .doesNotContain("orders-db", "sandbox-postgres", "redis", "OrderService", "ApiGateway")
                .contains("api-gateway", "order-service", "inventory-service");

        // Upstream api-gateway auth step runs first
        assertThat(draft.steps().get(0).service()).isEqualTo("api-gateway");
        assertThat(draft.steps().get(0).path()).isEqualTo("/api/auth/login");
        assertThat(draft.steps().get(0).allowClientError()).isTrue();

        // Within order-service: POST /api/orders (seed) runs BEFORE GET /api/orders/{{V0}} and DELETE /api/orders/{{V0}}, and /actuator/health is last
        List<RuntimePlanningService.GeneratedStepDraft> orderSteps = draft.steps().stream()
                .filter(s -> "order-service".equals(s.service()))
                .toList();
        assertThat(orderSteps.get(0).method()).isEqualTo("POST");
        assertThat(orderSteps.get(0).path()).isEqualTo("/api/orders");
        assertThat(orderSteps.get(0).expectedStatus()).isEqualTo(201);
        assertThat(draft.sampleInputs().get(orderSteps.get(0).bodyReference())).isEqualTo("{\"sku\":\"SKU-900\",\"quantity\":2}");

        int getIdx = orderSteps.indexOf(orderSteps.stream().filter(s -> "GET".equals(s.method()) && s.path().startsWith("/api/orders/")).findFirst().orElseThrow());
        int delIdx = orderSteps.indexOf(orderSteps.stream().filter(s -> "DELETE".equals(s.method())).findFirst().orElseThrow());
        assertThat(getIdx).isGreaterThan(0).isLessThan(delIdx);
        assertThat(orderSteps.get(delIdx).expectedStatus()).isEqualTo(204);
        assertThat(orderSteps).noneMatch(s -> "/actuator/health".equals(s.path()));

        // inventory-service had 0 business endpoints so it gets 1 health fallback step from serviceHealthPaths for multi-service trace coverage
        assertThat(draft.steps()).anyMatch(s -> "inventory-service".equals(s.service()) && "/actuator/health".equals(s.path()));
    }

    @Test
    @DisplayName("STEP 2 100%: saveScenario enforces HttpScenarioRunner validation & start() normalizes ModelElement service + populates missing protected references")
    void testSaveScenarioAndStart_EnforcesRunnerStepContractNormalizesModelServiceAndPopulatesMissingProtectedReferences() {
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));

        // 1. Reject invalid Runner steps early in saveScenario()
        assertThatThrownBy(() -> planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Bad Path", List.of(
                        "{\"id\":\"s1\",\"service\":\"order-service\",\"method\":\"GET\",\"path\":\"/api\\\\orders\",\"expectedStatus\":200}"
                ), 0))).hasMessageContaining("Invalid or secret-bearing scenario step");

        assertThatThrownBy(() -> planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Both Bodies", List.of(
                        "{\"id\":\"s1\",\"service\":\"order-service\",\"method\":\"POST\",\"path\":\"/api/orders\",\"expectedStatus\":201,\"jsonBody\":\"{}\",\"bodyReference\":\"ORDER_BODY\"}"
                ), 0))).hasMessageContaining("both jsonBody and bodyReference");

        assertThatThrownBy(() -> planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Forbidden Header", List.of(
                        "{\"id\":\"s1\",\"service\":\"order-service\",\"method\":\"GET\",\"path\":\"/api/orders\",\"expectedStatus\":200,\"envHeaders\":[{\"name\":\"Host\",\"reference\":\"CUSTOM_HOST\"}]}"
                ), 0))).hasMessageContaining("Unsupported envHeaders");

        // 2. Save valid scenario referencing ModelElement name ("OrderService") + allowClientError + bodyReference + environmentVariables + envHeaders
        final RuntimeScenario[] savedHolder = new RuntimeScenario[1];
        when(scenarios.saveAndFlush(any())).thenAnswer(inv -> {
            RuntimeScenario sc = inv.getArgument(0);
            if (sc.getId() == null) sc.setId(UUID.randomUUID());
            savedHolder[0] = sc;
            return sc;
        });

        var savedView = planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Update Order Flow", List.of(
                        "{\"id\":\"step-1\",\"service\":\"OrderService\",\"method\":\"PUT\",\"path\":\"/api/orders/{{V0}}\",\"expectedStatus\":200,\"allowClientError\":true,\"bodyReference\":\"ORDER_UPDATE_BODY\",\"environmentVariables\":{\"V0\":\"ORDER_ID\"},\"envHeaders\":[{\"name\":\"Authorization\",\"reference\":\"ORDER_AUTH\"}]}"
                ), 0));
        assertThat(savedView.revision()).isEqualTo(1);

        // 3. Start session WITHOUT passing ORDER_UPDATE_BODY, ORDER_ID, or ORDER_AUTH in StartRequest.environment:
        //    start() must normalize "OrderService" -> "order-service" AND auto-populate all 3 protected references (using parameterized DTO sampleJsonBody!)
        String orderUuid = UUID.randomUUID().toString();
        RuntimeConfiguration cfg = savedConfig("order-service");
        ((ObjectNode) cfg.getProfile()).putObject("serviceMappings").put("order-service", orderUuid);
        when(configurations.findById(projectId)).thenReturn(Optional.of(cfg));
        when(scenarios.findById(savedView.id())).thenReturn(Optional.of(savedHolder[0]));

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("order-service"))
                .composeServices(List.of("order-service"))
                .recommendedServiceMappings(Map.of("order-service", orderUuid))
                .modelServiceNames(Map.of(orderUuid, "OrderService"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder()
                                .service("order-service")
                                .method("PUT")
                                .path("/api/orders/{id}")
                                .sampleJsonBody("{\"status\":\"CONFIRMED\",\"quantity\":5}")
                                .build()
                ))
                .build());

        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).executionStatus("READY_FOR_DISPATCH").build());

        planningService.start(projectId, new StartRequest(snapshotId, savedView.id(), 1, 1, true, Map.of()));

        ArgumentCaptor<com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest> created =
                ArgumentCaptor.forClass(com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest.class);
        verify(runtime).createRuntimeSession(created.capture());
        var exportedStep = created.getValue().getScenarioConfig().path("scenario").path("steps").get(0);
        assertThat(exportedStep.path("service").asText()).isEqualTo("order-service");
        assertThat(exportedStep.path("allowClientError").asBoolean()).isTrue();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> storedEnv = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), storedEnv.capture());
        assertThat(storedEnv.getValue())
                .containsEntry("ORDER_UPDATE_BODY", "{\"status\":\"CONFIRMED\",\"quantity\":5}")
                .containsEntry("ORDER_ID", "1");
        assertThat(storedEnv.getValue().get("ORDER_AUTH")).startsWith("Bearer eyJ");
    }

    @Test
    @DisplayName("STEP 2 AI: OpenAI sk- key routes to chat/completions with Bearer auth and parses gpt-5.4 JSON")
    void testGenerateScenario_OpenAiKeyRouting() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/gateway/checkout").source("GatewayServer.java").build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        String[] authHeader = new String[1];
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            authHeader[0] = exchange.getRequestHeaders().getFirst("Authorization");
            String openAiResp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"OpenAI Checkout Flow\\",\\"summary\\":\\"End-to-end checkout\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/gateway/checkout\\",\\"expectedStatus\\":201,\\"rationale\\":\\"Submit checkout\\",\\"sampleJsonBody\\":\\"{\\\\\\"sku\\\\\\":\\\\\\"SKU-1\\\\\\",\\\\\\"qty\\\\\\":1}\\"}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = openAiResp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Verify checkout"));

            assertThat(authHeader[0]).isEqualTo("Bearer sk-proj-test-key");
            assertThat(aiDraft.generatorMode()).isEqualTo("AI_ASSISTED");
            assertThat(aiDraft.aiModelName()).isEqualTo("gpt-5.4");
            assertThat(aiDraft.suggestedName()).isEqualTo("OpenAI Checkout Flow");
            assertThat(aiDraft.steps()).hasSize(1);
            assertThat(aiDraft.steps().get(0).expectedStatus()).isEqualTo(201);
        } finally {
            mockOpenAi.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 1 SANDBOX: generated secrets match their job (HS512 JWT, hex, shared RSA PEM pair)")
    void testRandomSecretForFormats() throws Exception {
        java.security.KeyPair[] rsa = new java.security.KeyPair[1];
        assertThat(java.util.Base64.getDecoder().decode(planningService.randomSecretFor("JWT_SECRET", rsa))).hasSizeGreaterThanOrEqualTo(64);
        assertThat(planningService.randomSecretFor("ENCRYPTION_KEY_HEX", rsa)).matches("[0-9a-f]{64}");
        assertThat(java.util.Base64.getDecoder().decode(planningService.randomSecretFor("SESSION_SECRET", rsa))).hasSize(32);

        String priv = planningService.randomSecretFor("SIGNING_PRIVATE_KEY", rsa);
        String pub = planningService.randomSecretFor("SIGNING_PUBLIC_KEY", rsa);
        assertThat(priv).startsWith("-----BEGIN PRIVATE KEY-----\n").endsWith("-----END PRIVATE KEY-----");
        var kf = java.security.KeyFactory.getInstance("RSA");
        var privateKey = kf.generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(java.util.Base64.getMimeDecoder().decode(priv.replaceAll("-----[A-Z ]+-----", ""))));
        var publicKey = kf.generatePublic(new java.security.spec.X509EncodedKeySpec(java.util.Base64.getMimeDecoder().decode(pub.replaceAll("-----[A-Z ]+-----", ""))));
        var sig = java.security.Signature.getInstance("SHA256withRSA");
        sig.initSign(privateKey);
        sig.update("mavis".getBytes(StandardCharsets.UTF_8));
        byte[] signed = sig.sign();
        sig.initVerify(publicKey);
        sig.update("mavis".getBytes(StandardCharsets.UTF_8));
        assertThat(sig.verify(signed)).isTrue();
    }

    @Test
    @DisplayName("STEP 2 TOP-DOWN: Stateful extract -> {{VAR}} chaining, Sandbox JWT minting (HS256 & RS256), and dual-compatible jsonBody promotion in start()")
    void testTopDownStatefulChainingSandboxJwtAndDualRunnerBodyPromotion() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

        PreflightCheckResponseDTO preflight = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway", "order-service"))
                .composeServices(List.of("api-gateway", "order-service"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder()
                                .service("api-gateway")
                                .method("POST")
                                .path("/api/orders")
                                .expectedStatus(201)
                                .requiresAuth(true)
                                .requiredRoles(List.of("ORDER_MANAGER"))
                                .sampleJsonBody("{\"sku\":\"SKU-LAPTOP-01\",\"quantity\":1}")
                                .responseFields(List.of("/id", "/status"))
                                .journeyRole("PREREQUISITE_SEED")
                                .fanOutScore(6)
                                .source("OrderController.java")
                                .build(),
                        DetectedEndpointDTO.builder()
                                .service("order-service")
                                .method("POST")
                                .path("/api/payments")
                                .expectedStatus(200)
                                .requiresAuth(true)
                                .sampleJsonBody("{\"orderId\":1,\"amount\":1299.0}")
                                .journeyRole("CROSS_SERVICE_WORKFLOW")
                                .fanOutScore(5)
                                .source("PaymentController.java")
                                .build(),
                        DetectedEndpointDTO.builder()
                                .service("order-service")
                                .method("GET")
                                .path("/api/orders/{orderId}")
                                .expectedStatus(200)
                                .requiresAuth(true)
                                .journeyRole("STATE_VERIFICATION")
                                .source("OrderController.java")
                                .build()
                ))
                .build();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of(
                "JWT_SECRET", "c2FuZGJveC1zZWNyZXQta2V5LTMtYnl0ZXMtbG9uZy1mb3ItaHMyNTYtc2lnbmluZy10ZXN0"
        ));

        GeneratedScenarioDraftView draft = planningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, modelId, null));

        assertThat(draft.aiModelName()).isEqualTo("topdown-journey-v3");
        assertThat(draft.steps()).hasSize(3);

        // Step 1 seeds order and extracts ORDER_ID -> /id, plus attaches envHeaders Authorization with signed JWT
        var step1 = draft.steps().get(0);
        assertThat(step1.path()).isEqualTo("/api/orders");
        assertThat(step1.extract()).containsEntry("ORDER_ID", "/id");
        assertThat(step1.envHeaders()).isNotEmpty();
        String authRef = step1.envHeaders().get(0).get("reference");
        assertThat(draft.sampleInputs().get(authRef)).startsWith("Bearer eyJ");

        // Step 2 (GET /api/orders/{orderId}) chains {{ORDER_ID}} directly in path!
        var step2 = draft.steps().get(1);
        assertThat(step2.path()).isEqualTo("/api/orders/{{ORDER_ID}}");

        // Step 3 (POST /api/payments) chains {{ORDER_ID}} inside its sample body!
        var step3 = draft.steps().get(2);
        assertThat(draft.sampleInputs().get(step3.bodyReference())).contains("{{ORDER_ID}}");

        // Now save and start() the scenario: verify that step 3's bodyReference containing {{ORDER_ID}} is promoted to inline jsonBody for pinned runner compatibility!
        final RuntimeScenario[] savedHolder = new RuntimeScenario[1];
        when(scenarios.saveAndFlush(any())).thenAnswer(inv -> {
            RuntimeScenario sc = inv.getArgument(0);
            if (sc.getId() == null) sc.setId(UUID.randomUUID());
            savedHolder[0] = sc;
            return sc;
        });

        var savedScenarioView = planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Stateful Journey", List.of(
                        json.writeValueAsString(step1),
                        json.writeValueAsString(step2),
                        json.writeValueAsString(step3)
                ), 0));

        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("api-gateway", "order-service")));
        when(scenarios.findById(savedScenarioView.id())).thenReturn(Optional.of(savedHolder[0]));
        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).executionStatus("READY_FOR_DISPATCH").build());

        planningService.start(projectId, new StartRequest(snapshotId, savedScenarioView.id(), 1, 1, true, draft.sampleInputs()));

        ArgumentCaptor<com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest> created =
                ArgumentCaptor.forClass(com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest.class);
        verify(runtime).createRuntimeSession(created.capture());
        var exportedSteps = created.getValue().getScenarioConfig().path("scenario").path("steps");
        assertThat(exportedSteps.get(0).path("extract").path("ORDER_ID").asText()).isEqualTo("/id");
        assertThat(exportedSteps.get(1).path("path").asText()).isEqualTo("/api/orders/{{ORDER_ID}}");
        // Step 3's bodyReference was promoted to inline jsonBody because it references {{ORDER_ID}}
        assertThat(exportedSteps.get(2).has("bodyReference")).isFalse();
        assertThat(exportedSteps.get(2).path("jsonBody").asText()).contains("{{ORDER_ID}}");
    }

    @Test
    @DisplayName("STEP 2 AI: Concrete path params match parameterized candidates and accidental double /api/<x>/api/<y> prefix is normalized")
    void testGenerateScenario_NormalizesDoubleGatewayPrefixAndMatchesConcretePathParams() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder()
                                .service("api-gateway")
                                .method("POST")
                                .path("/api/catalog/products/{id}/variants")
                                .requiresAuth(true)
                                .sampleJsonBody("{\"sku\":\"VAR-1\",\"price\":99.0}")
                                .source("Gateway Route -> catalog-service")
                                .build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            String resp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"Variant Flow\\",\\"summary\\":\\"Verify variants\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/auth/api/catalog/products/1/variants\\",\\"expectedStatus\\":200,\\"rationale\\":\\"Create variant\\"}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Verify variants"));

            assertThat(aiDraft.steps()).hasSize(1);
            assertThat(aiDraft.steps().get(0).path()).isEqualTo("/api/catalog/products/1/variants");
            assertThat(aiDraft.steps().get(0).envHeaders()).isNotEmpty();
            assertThat(aiDraft.sampleInputs().get(aiDraft.steps().get(0).bodyReference())).contains("VAR-1");
        } finally {
            mockOpenAi.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 2 AI & START: Unbound Authorization {{AUTH_TOKEN}} uses sandboxBearer envHeaders in AI generation and safe V_REF_0 alias in start() so SecretRedactor never corrupts environmentVariables")
    void testUnboundAuthTokenHeaderConvertsToEnvHeadersAndUsesSafeAliasInStart() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(projects.findLockedById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway"))
                .composeServices(List.of("api-gateway"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder()
                                .service("api-gateway")
                                .method("POST")
                                .path("/api/order/admin/coupons")
                                .requiresAuth(true)
                                .requiredRoles(List.of("ADMIN"))
                                .source("Gateway Route -> order-service")
                                .build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            String resp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"Coupon Flow\\",\\"summary\\":\\"Verify coupons\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/order/admin/coupons\\",\\"expectedStatus\\":201,\\"headers\\":{\\"Authorization\\":\\"Bearer {{AUTH_TOKEN}}\\"},\\"sampleJsonBody\\":\\"{\\\\\\"code\\\\\\":\\\\\\"SAVE10\\\\\\",\\\\\\"startsAt\\\\\\":\\\\\\"2026-01-01T00:00:00Z\\\\\\"}\\",\\"rationale\\":\\"Create coupon\\"}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Verify coupons"));

            assertThat(aiDraft.steps()).hasSize(1);
            assertThat(aiDraft.steps().get(0).headers()).isNull();
            assertThat(aiDraft.steps().get(0).envHeaders()).isNotEmpty();
            assertThat(aiDraft.sampleInputs().get("API_GATEWAY_AUTHORIZATION")).startsWith("Bearer eyJ");
            assertThat(aiDraft.sampleInputs().get(aiDraft.steps().get(0).bodyReference())).contains("\"2026-01-01T00:00:00\"");
        } finally {
            mockOpenAi.stop(0);
        }

        // Also verify start() with a manually saved step containing unbound {{AUTH_TOKEN}} in headers
        final RuntimeScenario[] savedHolder = new RuntimeScenario[1];
        when(scenarios.saveAndFlush(any())).thenAnswer(inv -> {
            RuntimeScenario sc = inv.getArgument(0);
            if (sc.getId() == null) sc.setId(UUID.randomUUID());
            savedHolder[0] = sc;
            return sc;
        });

        var savedScenarioView = planningService.saveScenario(projectId, null,
                new RuntimePlanningService.ScenarioRequest("Manual Auth Var", List.of(
                        "{\"id\":\"step-1\",\"service\":\"api-gateway\",\"method\":\"POST\",\"path\":\"/api/order/admin/coupons\",\"expectedStatus\":201,\"allowClientError\":true,\"headers\":{\"Authorization\":\"Bearer {{AUTH_TOKEN}}\"}}"
                ), 0));

        when(configurations.findById(projectId)).thenReturn(Optional.of(savedConfig("api-gateway")));
        when(scenarios.findById(savedScenarioView.id())).thenReturn(Optional.of(savedHolder[0]));
        UUID sessionId = UUID.randomUUID();
        when(runtime.createRuntimeSession(any())).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).build());
        when(runtime.approveAndStartSession(sessionId)).thenReturn(RuntimeSessionResponseDTO.builder().id(sessionId).executionStatus("READY_FOR_DISPATCH").build());

        planningService.start(projectId, new StartRequest(snapshotId, savedScenarioView.id(), 1, 1, true, Map.of()));

        ArgumentCaptor<com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest> created =
                ArgumentCaptor.forClass(com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest.class);
        verify(runtime).createRuntimeSession(created.capture());
        var redactedConfig = com.mavis.analyzer.runtime.util.SecretRedactor.redactJson(created.getValue().getScenarioConfig());
        var exportedStep = redactedConfig.path("scenario").path("steps").get(0);
        assertThat(exportedStep.path("headers").path("Authorization").asText()).isEqualTo("Bearer {{V_REF_0}}");
        assertThat(exportedStep.path("environmentVariables").path("V_REF_0").asText()).isEqualTo("AUTH_TOKEN");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, String>> storedEnv = ArgumentCaptor.forClass(Map.class);
        verify(environments).store(eq(sessionId), storedEnv.capture());
        assertThat(storedEnv.getValue().get("AUTH_TOKEN")).startsWith("eyJ");
    }

    @Test
    @DisplayName("STEP 2 MULTI-SERVICE: Deprioritizes /ai/ & /inactive endpoints, balances across services, and infers category JSON payload")
    void testGenerateScenario_BalancesMultiServiceDeprioritizesAiAuxiliaryAndInfersCategoryPayload() {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

        PreflightCheckResponseDTO preflight = PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("catalog-service", "identity-service", "order-service", "service-discovery"))
                .composeServices(List.of("catalog-service", "identity-service", "order-service", "service-discovery"))
                .serviceHealthPaths(Map.of("service-discovery", "/actuator/health"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("catalog-service").method("POST").path("/api/catalog/ai/chat").source("AiAssistantController.java").build(),
                        DetectedEndpointDTO.builder().service("catalog-service").method("POST").path("/api/catalog/ai/generate-description").source("AiAssistantController.java").build(),
                        DetectedEndpointDTO.builder().service("catalog-service").method("GET").path("/api/catalog/categories").source("CategoryController.java").build(),
                        DetectedEndpointDTO.builder().service("catalog-service").method("GET").path("/api/catalog/categories/inactive").source("CategoryController.java").build(),
                        DetectedEndpointDTO.builder().service("catalog-service").method("POST").path("/api/catalog/categories").source("CategoryController.java").build(),
                        DetectedEndpointDTO.builder().service("identity-service").method("POST").path("/api/identity/auth/login").source("AuthController.java").build(),
                        DetectedEndpointDTO.builder().service("order-service").method("POST").path("/api/order/cart/add").source("CartController.java").build(),
                        DetectedEndpointDTO.builder().service("order-service").method("GET").path("/api/order/orders").source("OrderController.java").build()
                ))
                .build();
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);

        GeneratedScenarioDraftView draft = planningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, modelId, null));

        assertThat(draft.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::service)
                .contains("catalog-service", "identity-service", "order-service")
                .doesNotContain("service-discovery");
        assertThat(draft.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::path)
                .doesNotContain("/api/catalog/ai/chat", "/api/catalog/ai/generate-description", "/api/catalog/categories/inactive");

        List<RuntimePlanningService.GeneratedStepDraft> catalogSteps = draft.steps().stream()
                .filter(s -> "catalog-service".equals(s.service()))
                .toList();
        assertThat(catalogSteps.get(0).method()).isEqualTo("POST");
        assertThat(catalogSteps.get(0).path()).isEqualTo("/api/catalog/categories");
        assertThat(draft.sampleInputs().get(catalogSteps.get(0).bodyReference()))
                .contains("Tinh dau thien nhien")
                .doesNotContain("SKU-MOUSE-02");
    }

    @Test
    @DisplayName("STEP 2 & 3 FIX: Deduplicates repeated AI auth routes and chains coupon {id} instead of SKU-LAPTOP-01")
    void testAiScenarioDeduplicatesAuthAndChainsCouponIdInsteadOfSku() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway"))
                .composeServices(List.of("api-gateway"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/register").build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/login").build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/order/admin/coupons").responseFields(List.of("/id", "/code")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("GET").path("/api/order/admin/coupons/{id}").build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            String resp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"Coupon Flow\\",\\"summary\\":\\"End-to-end\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/register\\",\\"expectedStatus\\":201},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/register\\",\\"expectedStatus\\":201},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/login\\",\\"expectedStatus\\":200},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/login\\",\\"expectedStatus\\":200},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/order/admin/coupons\\",\\"expectedStatus\\":201},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"GET\\",\\"path\\":\\"/api/order/admin/coupons/SKU-LAPTOP-01\\",\\"expectedStatus\\":200}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Coupon journey"));

            assertThat(aiDraft.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::path)
                    .containsExactly(
                            "/api/identity/auth/register",
                            "/api/identity/auth/login",
                            "/api/order/admin/coupons",
                            "/api/order/admin/coupons/{{COUPON_ID}}"
                    );
        } finally {
            mockOpenAi.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 2 & 3 FIX: Snaps hallucinated POST on multipart-excluded GET-only paths to GET and sanitizes /status AUTH_TOKEN extraction")
    void testSnapsMultipartExcludedPostToGetAndSanitizesStatusTokenExtract() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway"))
                .composeServices(List.of("api-gateway"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/login").responseFields(List.of("/data/accessToken")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("GET").path("/api/catalog/categories").responseFields(List.of("/data/id")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("GET").path("/api/catalog/products").responseFields(List.of("/data/id")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/order/orders/checkout").expectedStatus(200).build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            String resp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"Catalog & Order\\",\\"summary\\":\\"End-to-end\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/login\\",\\"expectedStatus\\":200,\\"extract\\":{\\"AUTH_TOKEN\\":\\"/status\\"}},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/catalog/categories\\",\\"expectedStatus\\":201,\\"extract\\":{\\"CATEGORY_STATUS\\":\\"/status\\"}},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/catalog/products\\",\\"expectedStatus\\":201,\\"extract\\":{\\"PRODUCT_ID\\":\\"/data/id\\"}}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, "Full journey"));

            assertThat(aiDraft.steps()).hasSize(4);
            assertThat(aiDraft.steps().get(0).extract()).containsEntry("AUTH_TOKEN", "/data/accessToken");
            assertThat(aiDraft.steps().get(1).method()).isEqualTo("GET");
            assertThat(aiDraft.steps().get(1).path()).isEqualTo("/api/catalog/categories");
            assertThat(aiDraft.steps().get(1).bodyReference()).isNull();
            assertThat(aiDraft.steps().get(1).extract()).containsEntry("CATEGORY_ID", "/data/id|/id");
            assertThat(aiDraft.steps().get(2).method()).isEqualTo("GET");
            assertThat(aiDraft.steps().get(2).path()).isEqualTo("/api/catalog/products");
            assertThat(aiDraft.steps().get(2).extract()).containsEntry("PRODUCT_ID", "/data/id|/id");
            assertThat(aiDraft.steps().get(3).method()).isEqualTo("POST");
            assertThat(aiDraft.steps().get(3).path()).isEqualTo("/api/order/orders/checkout");
        } finally {
            mockOpenAi.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 1 MULTI-REPO PREFLIGHT: Resolves unbraced $VAR in compose, Zuul routes map, root config/ shared YAML, and prunes Turbine/Hystrix sidecars")
    void testUnbracedComposeVarZuulRoutesRootConfigAndTurbinePruning() throws Exception {
        Path tempRepo = Files.createTempDirectory("piggymetrics-like-repo");
        try {
            String composeYaml = """
                    version: '2.1'
                    services:
                      config:
                        image: sqshq/piggymetrics-config
                        environment:
                          CONFIG_SERVICE_PASSWORD: $CONFIG_SERVICE_PASSWORD
                      gateway:
                        image: sqshq/piggymetrics-gateway
                        ports:
                          - "4000:4000"
                      account-service:
                        image: sqshq/piggymetrics-account-service
                      monitoring:
                        image: sqshq/piggymetrics-monitoring
                      turbine-stream-service:
                        image: sqshq/piggymetrics-turbine-stream-service
                    """;
            Files.writeString(tempRepo.resolve("docker-compose.yml"), composeYaml, StandardCharsets.UTF_8);
            Files.writeString(tempRepo.resolve(".env"), "CONFIG_SERVICE_PASSWORD=secret-pass\n", StandardCharsets.UTF_8);

            Path sharedDir = tempRepo.resolve("config/src/main/resources/shared");
            Files.createDirectories(sharedDir);
            Files.writeString(sharedDir.resolve("gateway.yml"), """
                    zuul:
                      routes:
                        account-service:
                          path: /accounts/**
                          serviceId: account-service
                          stripPrefix: false
                    server:
                      port: 4000
                    """, StandardCharsets.UTF_8);
            Files.writeString(sharedDir.resolve("account-service.yml"), """
                    server:
                      context-path: /accounts
                      port: 6000
                    """, StandardCharsets.UTF_8);

            Path controllerDir = tempRepo.resolve("account-service/src/main/java/com/piggymetrics/account/controller");
            Files.createDirectories(controllerDir);
            Files.writeString(controllerDir.resolve("AccountController.java"), """
                    package com.piggymetrics.account.controller;
                    import org.springframework.web.bind.annotation.*;
                    @RestController
                    public class AccountController {
                        @GetMapping("/current")
                        public String getCurrentAccount() { return "ok"; }
                    }
                    """, StandardCharsets.UTF_8);

            ComposePreflightValidator v = new ComposePreflightValidator();
            Map<String, String> envFiles = v.collectDirectoryEnvFiles(tempRepo);
            PreflightCheckResponseDTO pf = v.validate(composeYaml, Map.of(), envFiles);
            v.inspectSnapshotSource(tempRepo, pf);
            v.finalizeSandboxTopology(tempRepo, pf, composeYaml, Map.of(), envFiles);
            ComposePreflightValidator.assignEnvResolutions(pf);

            assertThat(pf.getDetectedServices())
                    .contains("gateway", "account-service")
                    .doesNotContain("monitoring", "turbine-stream-service");
            assertThat(pf.getServicePorts().get("account-service")).isEqualTo(6000);
            assertThat(pf.getDetectedEndpoints())
                    .anyMatch(ep -> "gateway".equals(ep.getService()) && "/accounts/current".equals(ep.getPath()));
            assertThat(pf.getRequiredEnvVars())
                    .anyMatch(ev -> "CONFIG_SERVICE_PASSWORD".equals(ev.getName())
                            && ev.isDefaultPresent()
                            && "DEFAULT".equals(ev.getResolution()));
        } finally {
            try (var walk = Files.walk(tempRepo)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> {
                    try { Files.deleteIfExists(p); } catch (Exception ignored) {}
                });
            }
        }
    }

    @Test
    @DisplayName("STEP 2 AI AUTO-FLOW: Prepends /register before /login, chains {{ADDRESS_ID}} & {{COUPON_CODE}} into checkout body, and backfills uncovered runnable services")
    void testAiAutoFlowPrependRegisterChainsPrefixedBodyVarsAndBackfillsUncoveredServices() throws Exception {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway", "identity-service", "order-service", "notification-service"))
                .composeServices(List.of("api-gateway", "identity-service", "order-service", "notification-service"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/register").expectedStatus(201).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/login").responseFields(List.of("/data/accessToken")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/addresses").responseFields(List.of("/data/id")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/order/admin/coupons").responseFields(List.of("/data/id", "/data/code")).build(),
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/order/orders/checkout")
                                .sampleJsonBody("{\"shippingAddressId\":1,\"couponCode\":\"SAVE10\",\"paymentMethod\":\"COD\"}")
                                .downstreamTargets(List.of("order-service"))
                                .build(),
                        DetectedEndpointDTO.builder().service("notification-service").method("GET").path("/api/notifications").expectedStatus(200).build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        HttpServer mockOpenAi = HttpServer.create(new InetSocketAddress(0), 0);
        mockOpenAi.createContext("/v1/chat/completions", exchange -> {
            String resp = """
                    {
                      "choices": [{
                        "message": {
                          "content": "{\\"suggestedName\\":\\"Smart Auto Journey\\",\\"summary\\":\\"End-to-end\\",\\"steps\\":[{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/auth/login\\",\\"expectedStatus\\":200},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/identity/addresses\\",\\"expectedStatus\\":201,\\"extract\\":{\\"ADDRESS_ID\\":\\"/data/id\\"}},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/order/admin/coupons\\",\\"expectedStatus\\":201,\\"extract\\":{\\"COUPON_ID\\":\\"/data/id\\",\\"COUPON_CODE\\":\\"/data/code\\"}},{\\"service\\":\\"api-gateway\\",\\"method\\":\\"POST\\",\\"path\\":\\"/api/order/orders/checkout\\",\\"expectedStatus\\":201}]}"
                        }
                      }]
                    }
                    """;
            byte[] bytes = resp.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        mockOpenAi.start();
        try {
            int port = mockOpenAi.getAddress().getPort();
            ReflectionTestUtils.setField(planningService, "customAiEndpointUrl", "http://127.0.0.1:" + port + "/v1/chat/completions");
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.of("sk-proj-test-key"));

            GeneratedScenarioDraftView aiDraft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, null));

            assertThat(aiDraft.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::path)
                    .containsExactly(
                            "/api/identity/auth/register",
                            "/api/identity/auth/login",
                            "/api/identity/addresses",
                            "/api/order/admin/coupons",
                            "/api/order/orders/checkout",
                            "/api/notifications"
                    );
            String checkoutBodyRef = aiDraft.steps().get(4).bodyReference();
            assertThat(aiDraft.sampleInputs().get(checkoutBodyRef))
                    .contains("\"shippingAddressId\":\"{{ADDRESS_ID}}\"")
                    .contains("\"couponCode\":\"{{COUPON_CODE}}\"");
        } finally {
            mockOpenAi.stop(0);
        }
    }

    @Test
    @DisplayName("STEP 2 DROPDOWN PRESETS: Filters non-CRUD custom domain service flow (with auth prerequisite) and Read-Only Smoke GET flow")
    void testDropdownFlowPresetsForCustomDomainAndReadOnlySmoke() {
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .detectedServices(List.of("api-gateway", "identity-service", "loan-service", "audit-service"))
                .composeServices(List.of("api-gateway", "identity-service", "loan-service", "audit-service"))
                .detectedEndpoints(List.of(
                        DetectedEndpointDTO.builder().service("api-gateway").method("POST").path("/api/identity/auth/login").responseFields(List.of("/accessToken")).build(),
                        DetectedEndpointDTO.builder().service("loan-service").method("POST").path("/api/loans/evaluate-risk").requiresAuth(true).downstreamTargets(List.of("audit-service")).build(),
                        DetectedEndpointDTO.builder().service("loan-service").method("GET").path("/api/loans/decisions/1").requiresAuth(true).build(),
                        DetectedEndpointDTO.builder().service("audit-service").method("POST").path("/api/audit/events").build(),
                        DetectedEndpointDTO.builder().service("audit-service").method("GET").path("/api/audit/summary").build()
                ))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

        GeneratedScenarioDraftView loanFlow = planningService.generateScenario(
                projectId,
                new GenerateScenarioRequest(snapshotId, modelId, "Focus on service loan-service: test primary workflow and state verification endpoints of loan-service", null));
        assertThat(loanFlow.steps()).extracting(RuntimePlanningService.GeneratedStepDraft::path)
                .contains("/api/identity/auth/login", "/api/loans/evaluate-risk", "/api/loans/decisions/1")
                .doesNotContain("/api/audit/events");

        GeneratedScenarioDraftView smokeFlow = planningService.generateScenario(
                projectId,
                new GenerateScenarioRequest(snapshotId, modelId, "Focus on read-only smoke verification: test GET and readiness endpoints across all services", null));
        assertThat(smokeFlow.steps()).allSatisfy(st -> assertThat(st.method()).isEqualTo("GET"));
        assertThat(smokeFlow.suggestedName()).isEqualTo("Read-Only Smoke & Health Verification Scenario");
    }

    @Test
    @DisplayName("STUDIO ENV: Binds relocated sandbox-postgres secrets and drops bindings for services outside sandboxCompose")
    void prepareStudioExecutionEnvironmentBindsRelocatedSecretsAndFiltersUnknownServices() {
        ReflectionTestUtils.setField(planningService, "composeValidator", new ComposePreflightValidator());
        ObjectNode apps = json.createObjectNode();
        apps.putObject("order-service").put("runtime", "java").put("containerPort", 8081);
        var steps = json.createArrayNode();
        steps.addObject().put("id", "smoke").put("service", "order-service").put("method", "GET").put("path", "/health").put("expectedStatus", 200);

        String pinnedCompose = """
                services:
                  order-service:
                    image: sha256:%s
                  sandbox-postgres:
                    image: postgres@sha256:%s
                """.formatted("a".repeat(64), "b".repeat(64));

        when(runtime.runComposePreflight(snapshotId)).thenReturn(PreflightCheckResponseDTO.builder()
                .compatible(true)
                .composeServices(List.of("order-service", "sandbox-postgres", "stale-service"))
                .detectedServices(List.of("order-service", "sandbox-postgres", "stale-service"))
                .relocatedComposeSecrets(Map.of(
                        "sandbox-postgres", Map.of("POSTGRES_PASSWORD", "ephemeral-pg-pass"),
                        "order-service", Map.of("SPRING_DATASOURCE_PASSWORD", "ephemeral-pg-pass"),
                        "stale-service", Map.of("UNUSED_SECRET", "drop-me")))
                .build());
        when(runtime.getProjectExecutionEnvironment(projectId)).thenReturn(Map.of());

        var prepared = planningService.prepareStudioExecutionEnvironment(
                projectId, snapshotId, json.createObjectNode(), apps, steps, pinnedCompose);

        assertThat(prepared.bindings().has("sandbox-postgres")).isTrue();
        assertThat(prepared.bindings().has("order-service")).isTrue();
        assertThat(prepared.bindings().has("stale-service")).isFalse();
        assertThat(prepared.protectedEnvironment()).containsValue("ephemeral-pg-pass");
        assertThat(prepared.protectedEnvironment()).doesNotContainValue("drop-me");
    }

    @Test
    @DisplayName("IMAGE INTEGRITY: Auto-realigns stale local sha256 image with rebuilt tag or fails fast with SANDBOX_IMAGE_MISSING")
    void ensureLocalImagesPresentAutoRealignsOrFailsFast() {
        ReflectionTestUtils.setField(planningService, "composeValidator", new ComposePreflightValidator());
        String staleDigest = "sha256:" + "1".repeat(64);
        String rebuiltDigest = "sha256:" + "2".repeat(64);
        String staleCompose = """
                services:
                  order-service:
                    image: %s
                """.formatted(staleDigest);

        var autoHealBuilder = mock(SandboxImageBuilderService.class);
        ReflectionTestUtils.setField(planningService, "imageBuilder", autoHealBuilder);
        when(autoHealBuilder.isLocalBuildAvailable()).thenReturn(true);
        when(autoHealBuilder.findMissingLocalImageServices(staleCompose)).thenReturn(List.of("order-service"));
        when(autoHealBuilder.discoverExistingBuiltImages(projectId, snapshotId, List.of("order-service")))
                .thenReturn(Map.of("order-service", rebuiltDigest));
        when(autoHealBuilder.findMissingLocalImageServices(org.mockito.ArgumentMatchers.argThat(y -> y != null && y.contains(rebuiltDigest))))
                .thenReturn(List.of());

        String healed = planningService.ensureLocalImagesPresent(projectId, snapshotId, staleCompose);
        assertThat(healed).contains(rebuiltDigest);

        var missingBuilder = mock(SandboxImageBuilderService.class);
        ReflectionTestUtils.setField(planningService, "imageBuilder", missingBuilder);
        when(missingBuilder.isLocalBuildAvailable()).thenReturn(true);
        when(missingBuilder.findMissingLocalImageServices(staleCompose)).thenReturn(List.of("order-service"));
        when(missingBuilder.discoverExistingBuiltImages(projectId, snapshotId, List.of("order-service")))
                .thenReturn(Map.of());

        assertThatThrownBy(() -> planningService.ensureLocalImagesPresent(projectId, snapshotId, staleCompose))
                .isInstanceOfSatisfying(com.mavis.common.exception.BusinessException.class, ex -> {
                    assertThat(ex.getStableCode()).isEqualTo("SANDBOX_IMAGE_MISSING");
                    assertThat(ex.getErrorCode()).isEqualTo(com.mavis.common.exception.ErrorCode.UNPROCESSABLE_ENTITY);
                    assertThat(ex.getMessage()).contains("order-service");
                });
    }
}
