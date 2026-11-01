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
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
        assertThat(stored.getValue().get("JWT_SECRET")).hasSize(44);
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
                .hasMessageContaining("uses build:");
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
        assertThat(stored.getValue().get("JWT_SECRET")).hasSize(44);
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
}