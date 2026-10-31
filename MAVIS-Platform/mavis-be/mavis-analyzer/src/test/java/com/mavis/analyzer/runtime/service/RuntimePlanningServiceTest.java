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
}
