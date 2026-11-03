package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DatabaseCheckDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DetectedEndpointDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.RequiredEnvVarDTO;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.GenerateScenarioRequest;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.GeneratedScenarioDraftView;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.GeneratedStepDraft;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MocHuongProductionAuditTest {

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

    @Test
    void auditRealMocHuongShopStep1Step2Step3() throws Exception {
        Path repoDir = Path.of("C:/Users/nhuth/Desktop/MAVIS-Root/Moc-Huong-Shop");
        if (!Files.isDirectory(repoDir)) {
            return;
        }
        Path composePath = repoDir.resolve("aromatics-platform/docker-compose.yml");
        String yamlContent = Files.readString(composePath, StandardCharsets.UTF_8);

        ComposePreflightValidator validator = new ComposePreflightValidator();
        Map<String, String> envFiles = validator.collectDirectoryEnvFiles(composePath.getParent());
        PreflightCheckResponseDTO preflight = validator.validate(yamlContent, Map.of(), envFiles);
        validator.inspectSnapshotSource(repoDir, preflight);
        validator.finalizeSandboxTopology(repoDir, preflight, yamlContent, Map.of(), envFiles);
        ComposePreflightValidator.assignEnvResolutions(preflight);

        System.out.println("=== STEP 1 PREFLIGHT SUMMARY ===");
        System.out.println("Detected Services (" + preflight.getDetectedServices().size() + "): " + preflight.getDetectedServices());
        System.out.println("Infra Services (" + preflight.getInfrastructureServices().size() + "): " + preflight.getInfrastructureServices());
        System.out.println("Service Ports: " + preflight.getServicePorts());
        System.out.println("Service Health Paths: " + preflight.getServiceHealthPaths());
        System.out.println("Database Checks (" + preflight.getDatabaseChecks().size() + "):");
        for (DatabaseCheckDTO db : preflight.getDatabaseChecks()) {
            System.out.println("  - DB: service=" + db.getService() + " | type=" + db.getDbType() + " | status=" + db.getStatus() + " | key=" + db.getConfigKey() + " | url=" + db.getConnectionUrl());
        }
        System.out.println("Detected Endpoints (" + preflight.getDetectedEndpoints().size() + "):");
        Map<String, Integer> epByService = new LinkedHashMap<>();
        for (DetectedEndpointDTO ep : preflight.getDetectedEndpoints()) {
            epByService.merge(ep.getService(), 1, Integer::sum);
        }
        System.out.println("  Endpoints by service: " + epByService);
        for (DetectedEndpointDTO ep : preflight.getDetectedEndpoints()) {
            if ("api-gateway".equals(ep.getService()) || ep.getService() == null || !preflight.getDetectedServices().contains(ep.getService())) {
                System.out.println("  - EP: [" + ep.getService() + "] " + ep.getMethod() + " " + ep.getPath()
                        + " (status=" + ep.getExpectedStatus() + ", req=" + ep.getRequestBodyType()
                        + ", resp=" + ep.getResponseBodyType() + ", fields=" + ep.getResponseFields()
                        + ", role=" + ep.getJourneyRole() + ", score=" + ep.getFanOutScore() + ")");
            }
        }
        System.out.println("Required Env Vars (" + preflight.getRequiredEnvVars().size() + "):");
        for (RequiredEnvVarDTO ev : preflight.getRequiredEnvVars()) {
            System.out.println("  - ENV: " + ev.getName() + " | cat=" + ev.getCategory() + " | res=" + ev.getResolution() + " | svc=" + ev.getServices() + " | def=" + ev.getDefaultValue());
        }

        // Setup RuntimePlanningService for Step 2 & Step 3 testing
        RuntimePlanningService planningService = new RuntimePlanningService(
                projects, sources, models, configurations, scenarios,
                policy, settings, runtime, json, environments
        );
        ReflectionTestUtils.setField(planningService, "apiKeyProvider", apiKeyProvider);
        ReflectionTestUtils.setField(planningService, "composeValidator", validator);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID modelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Moc Huong Shop").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).build();
        ModelVersion model = ModelVersion.builder().id(modelId).project(project).sourceSnapshot(snapshot).revision(1).isLatestValid(true).build();

        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);
        when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

        String[] testGoals = {
                null,
                "Focus ONLY on Auth & User Identity (register, login, profile, addresses, token refresh).",
                "Focus ONLY on Catalog & Inventory (categories, products, stock/search, reviews).",
                "Focus ONLY on Order, Cart, Coupon Checkout & Payment flows.",
                "Focus on compensating/admin & edge-case flows (status updates, cancellations, stock deduction/restoration, validation)."
        };
        Map<String, GeneratedScenarioDraftView> draftsByGoal = new LinkedHashMap<>();
        for (String goal : testGoals) {
            GeneratedScenarioDraftView draft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, goal));
            draftsByGoal.put(goal == null ? "FULL_AUTO" : goal, draft);
            System.out.println("=== STEP 2 SCENARIO [goal=" + (goal == null ? "FULL_AUTO" : goal) + "] ===");
            System.out.println("Name: " + draft.suggestedName() + " | Mode: " + draft.generatorMode() + " | Steps: " + draft.steps().size());
            Set<String> seenRoutesInScenario = new HashSet<>();
            for (GeneratedStepDraft s : draft.steps()) {
                String body = s.bodyReference() != null ? draft.sampleInputs().get(s.bodyReference()) : null;
                System.out.println("  Step " + s.id() + ": [" + s.service() + "] " + s.method() + " " + s.path()
                        + " -> expect=" + s.expectedStatus()
                        + " | phase=" + s.journeyPhase()
                        + " | extract=" + s.extract()
                        + " | envHeaders=" + s.envHeaders()
                        + " | body=" + body);
                assertThat(seenRoutesInScenario.add(s.method() + ":" + s.path()))
                        .as("No duplicate method:path across steps in scenario " + draft.suggestedName())
                        .isTrue();
                assertThat(s.journeyPhase()).contains(":");
            }
        }

        // Step 1 strict assertions: no phantom services, accurate counts
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getDetectedServices()).containsExactlyInAnyOrder(
                "service-discovery", "api-gateway", "identity-service", "catalog-service",
                "order-service", "notification-service", "redis", "kafka", "sandbox-postgres");
        assertThat(preflight.getInfrastructureServices()).containsExactlyInAnyOrder("redis", "kafka", "sandbox-postgres");
        assertThat(preflight.getDatabaseChecks())
                .noneMatch(db -> "aromatics-platform".equals(db.getService()) || "render.yaml".equals(db.getConfigKey()))
                .noneMatch(db -> "MySQL".equalsIgnoreCase(db.getDbType()));
        long sqlDbCount = preflight.getDatabaseChecks().stream()
                .filter(d -> !"DETECTED_CONTAINER".equals(d.getStatus()))
                .filter(d -> !Set.of("redis", "kafka", "rabbitmq").contains(d.getDbType().toLowerCase(Locale.ROOT)))
                .map(d -> d.getService() + ":" + d.getDbType())
                .distinct()
                .count();
        assertThat(sqlDbCount).isEqualTo(4L);
        long controllerEndpointCount = preflight.getDetectedEndpoints().stream()
                .filter(ep -> ep.getSource() == null || !ep.getSource().toLowerCase(Locale.ROOT).contains("gateway route"))
                .count();
        assertThat(controllerEndpointCount).isEqualTo(88L);
        assertThat(preflight.getDetectedEndpoints()).hasSize(176);

        // Verify LoginRequest DTO synthesis was not corrupted by HttpServletRequest parameter
        DetectedEndpointDTO loginEp = preflight.getDetectedEndpoints().stream()
                .filter(ep -> "POST".equals(ep.getMethod()) && "/api/identity/auth/login".equals(ep.getPath()) && "api-gateway".equals(ep.getService()))
                .findFirst().orElseThrow();
        assertThat(loginEp.getRequestBodyType()).isEqualTo("LoginRequest");
        assertThat(loginEp.getSampleJsonBody()).contains("email", "password");
        assertThat(loginEp.getResponseFields()).contains("/data/accessToken");

        // Verify Step 2 FULL_AUTO causal order: register BEFORE login, covers identity + catalog + order + notification readiness
        GeneratedScenarioDraftView fullDraft = draftsByGoal.get("FULL_AUTO");
        assertThat(fullDraft.steps().get(0).path()).isEqualTo("/api/identity/auth/register");
        assertThat(fullDraft.steps().get(1).path()).isEqualTo("/api/identity/auth/login");
        assertThat(fullDraft.steps().get(1).extract()).containsEntry("AUTH_TOKEN", "/data/accessToken");
        assertThat(fullDraft.steps()).anyMatch(s -> s.path().startsWith("/api/catalog/"));
        assertThat(fullDraft.steps()).anyMatch(s -> s.path().startsWith("/api/order/"));

        // Verify focused goals produce distinct domain-specific scenarios
        GeneratedScenarioDraftView authDraft = draftsByGoal.get(testGoals[1]);
        assertThat(authDraft.steps()).allMatch(s -> s.path().contains("/identity/"));
        GeneratedScenarioDraftView catalogDraft = draftsByGoal.get(testGoals[2]);
        assertThat(catalogDraft.steps()).allMatch(s -> s.path().contains("/catalog/"));
        GeneratedScenarioDraftView orderDraft = draftsByGoal.get(testGoals[3]);
        assertThat(orderDraft.steps()).anyMatch(s -> s.path().contains("/order/"));
        for (GeneratedStepDraft s : orderDraft.steps()) {
            if ("/api/order/coupons/preview".equals(s.path()) && s.bodyReference() != null) {
                String previewBody = orderDraft.sampleInputs().get(s.bodyReference());
                assertThat(previewBody).contains("{{COUPON_CODE}}").doesNotContain("{{COUPON_ID}}");
            }
        }

        // Verify Step 3 variable normalization & credential binding between register and login
        var stepsArray = json.createArrayNode();
        for (GeneratedStepDraft s : fullDraft.steps()) {
            stepsArray.add(json.valueToTree(s));
        }
        ReflectionTestUtils.invokeMethod(planningService, "normalizeAndBindScenarioVariables", stepsArray, preflight);
        Map<String, String> step1Defaults = new LinkedHashMap<>(fullDraft.sampleInputs());
        Map<String, String> protectedEnv = new LinkedHashMap<>(fullDraft.sampleInputs());
        ReflectionTestUtils.invokeMethod(planningService, "ensureScenarioStepReferences", stepsArray, preflight, step1Defaults, protectedEnv);
        String regBody = protectedEnv.get(fullDraft.steps().get(0).bodyReference());
        String loginBody = protectedEnv.get(fullDraft.steps().get(1).bodyReference());
        assertThat(json.readTree(regBody).path("email").asText()).isEqualTo(json.readTree(loginBody).path("email").asText());
        assertThat(json.readTree(regBody).path("password").asText()).isEqualTo(json.readTree(loginBody).path("password").asText());
    }

    @Test
    void auditExternalGitHubMicroserviceReposStep1Step2Step3() throws Exception {
        Path baseDir = Path.of("C:/Users/nhuth/.gemini/antigravity/brain/f2ca13c1-0139-4609-bc20-d9f77e37dc0e/scratch/external-repos");
        if (!Files.isDirectory(baseDir)) {
            return;
        }
        String[] repoNames = {
                "spring-petclinic-microservices",
                "spring-boot-microservices",
                "sample-spring-microservices-new",
                "piggymetrics",
                "E-Mart-Microservices"
        };
        for (String repoName : repoNames) {
            Path repoDir = baseDir.resolve(repoName);
            Path composePath = repoDir.resolve("docker-compose.yml");
            if (!Files.isRegularFile(composePath)) continue;

            String yamlContent = Files.readString(composePath, StandardCharsets.UTF_8);
            ComposePreflightValidator validator = new ComposePreflightValidator();
            Map<String, String> envFiles = validator.collectDirectoryEnvFiles(composePath.getParent());
            PreflightCheckResponseDTO preflight = validator.validate(yamlContent, Map.of(), envFiles);
            validator.inspectSnapshotSource(repoDir, preflight);
            validator.finalizeSandboxTopology(repoDir, preflight, yamlContent, Map.of(), envFiles);
            ComposePreflightValidator.assignEnvResolutions(preflight);

            System.out.println("\n=======================================================");
            System.out.println("REPO: " + repoName);
            System.out.println("=======================================================");
            System.out.println("Compatible: " + preflight.isCompatible());
            System.out.println("Runner Issues: " + preflight.getRunnerIssues());
            System.out.println("Unresolvable Issues: " + preflight.getUnresolvableRunnerIssues());
            System.out.println("Detected Services (" + preflight.getDetectedServices().size() + "): " + preflight.getDetectedServices());
            System.out.println("Infra Services (" + preflight.getInfrastructureServices().size() + "): " + preflight.getInfrastructureServices());
            System.out.println("Service Ports: " + preflight.getServicePorts());
            System.out.println("Service Health Paths: " + preflight.getServiceHealthPaths());
            System.out.println("Database Checks (" + preflight.getDatabaseChecks().size() + "):");
            for (DatabaseCheckDTO db : preflight.getDatabaseChecks()) {
                System.out.println("  - DB: service=" + db.getService() + " | type=" + db.getDbType() + " | status=" + db.getStatus() + " | key=" + db.getConfigKey() + " | url=" + db.getConnectionUrl());
            }
            System.out.println("Detected Endpoints (" + preflight.getDetectedEndpoints().size() + "):");
            for (DetectedEndpointDTO ep : preflight.getDetectedEndpoints()) {
                System.out.println("  - EP: [" + ep.getService() + "] " + ep.getMethod() + " " + ep.getPath()
                        + " (status=" + ep.getExpectedStatus() + ", req=" + ep.getRequestBodyType()
                        + ", resp=" + ep.getResponseBodyType() + ", fields=" + ep.getResponseFields()
                        + ", sample=" + ep.getSampleJsonBody() + ")");
            }
            System.out.println("Required Env Vars (" + preflight.getRequiredEnvVars().size() + "):");
            for (RequiredEnvVarDTO ev : preflight.getRequiredEnvVars()) {
                System.out.println("  - ENV: " + ev.getName() + " | cat=" + ev.getCategory() + " | res=" + ev.getResolution() + " | svc=" + ev.getServices() + " | def=" + ev.getDefaultValue());
            }

            RuntimePlanningService planningService = new RuntimePlanningService(
                    projects, sources, models, configurations, scenarios,
                    policy, settings, runtime, json, environments
            );
            ReflectionTestUtils.setField(planningService, "apiKeyProvider", apiKeyProvider);
            ReflectionTestUtils.setField(planningService, "composeValidator", validator);

            UUID projectId = UUID.randomUUID();
            UUID snapshotId = UUID.randomUUID();
            UUID modelId = UUID.randomUUID();
            Project project = Project.builder().id(projectId).name(repoName).build();
            SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).build();
            ModelVersion model = ModelVersion.builder().id(modelId).project(project).sourceSnapshot(snapshot).revision(1).isLatestValid(true).build();

            when(projects.findById(projectId)).thenReturn(Optional.of(project));
            when(sources.findById(snapshotId)).thenReturn(Optional.of(snapshot));
            when(models.findById(modelId)).thenReturn(Optional.of(model));
            when(runtime.runComposePreflight(snapshotId)).thenReturn(preflight);
            when(apiKeyProvider.resolveApiKey()).thenReturn(Optional.empty());

            GeneratedScenarioDraftView draft = planningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, modelId, null));
            System.out.println("--- STEP 2 SCENARIO [" + repoName + "] ---");
            System.out.println("Name: " + draft.suggestedName() + " | Steps: " + draft.steps().size());
            for (GeneratedStepDraft s : draft.steps()) {
                String body = s.bodyReference() != null ? draft.sampleInputs().get(s.bodyReference()) : null;
                System.out.println("  Step " + s.id() + ": [" + s.service() + "] " + s.method() + " " + s.path()
                        + " -> expect=" + s.expectedStatus()
                        + " | phase=" + s.journeyPhase()
                        + " | extract=" + s.extract()
                        + " | vars=" + s.environmentVariables()
                        + " | body=" + body);
            }

            assertThat(preflight.isCompatible()).isTrue();
            assertThat(draft.steps()).isNotEmpty();

            if ("spring-petclinic-microservices".equals(repoName)) {
                assertThat(preflight.getUnresolvableRunnerIssues()).isEmpty();
                assertThat(preflight.getSandboxComposeYaml())
                        .contains("SPRING_CLOUD_CONFIG_FAIL_FAST: 'false'")
                        .contains("SPRING_CLOUD_CONFIG_RETRY_MAX_ATTEMPTS: '10'");
                assertThat(preflight.getDetectedServices())
                        .contains("api-gateway", "customers-service", "visits-service", "vets-service", "sandbox-mysql")
                        .doesNotContain("grafana-server", "prometheus-server", "tracing-server");
                assertThat(draft.steps().get(0).path()).isEqualTo("/api/customer/owners");
                assertThat(draft.steps().get(0).extract()).containsEntry("OWNER_ID", "/id");
                assertThat(draft.steps().get(1).path()).isEqualTo("/api/customer/owners/{{OWNER_ID}}/pets");
                assertThat(draft.steps().get(1).extract()).containsEntry("PET_ID", "/id");
                assertThat(draft.steps().get(2).path()).isEqualTo("/api/visit/owners/{{OWNER_ID}}/pets/{{PET_ID}}/visits");
                assertThat(draft.steps().get(2).extract()).containsEntry("VISIT_ID", "/id");
                assertThat(draft.steps())
                        .anyMatch(s -> "/api/visit/pets/visits?petId={{PET_ID}}".equals(s.path()));
            } else if ("spring-boot-microservices".equals(repoName)) {
                assertThat(preflight.getRequiredEnvVars())
                        .noneMatch(v -> "USER_REQUIRED".equals(v.getResolution()));
                assertThat(draft.steps().get(0).service()).isEqualTo("api-gateway");
                assertThat(draft.steps().get(0).path()).isEqualTo("/api/product");
                assertThat(draft.steps().get(0).expectedStatus()).isEqualTo(201);
            } else if ("sample-spring-microservices-new".equals(repoName)) {
                assertThat(preflight.getRequiredEnvVars())
                        .noneMatch(v -> "USER_REQUIRED".equals(v.getResolution()));
                assertThat(draft.steps().get(0).service()).isEqualTo("gateway-service");
                assertThat(draft.steps().get(0).path()).isEqualTo("/organization/");
                assertThat(draft.steps().get(0).extract()).containsEntry("ORGANIZATION_ID", "/id");
                assertThat(draft.steps().get(1).path()).isEqualTo("/department/");
                assertThat(draft.steps().get(1).extract()).containsEntry("DEPARTMENT_ID", "/id");
                assertThat(draft.steps().get(2).path()).isEqualTo("/employee/");
                assertThat(draft.steps().get(2).extract()).containsEntry("EMPLOYEE_ID", "/id");
            } else if ("piggymetrics".equals(repoName)) {
                assertThat(preflight.getDetectedServices())
                        .contains("gateway", "auth-service", "account-service", "statistics-service", "notification-service")
                        .doesNotContain("monitoring", "turbine-stream-service");
                assertThat(preflight.getServicePorts().get("account-service")).isEqualTo(6000);
                assertThat(preflight.getServicePorts().get("auth-service")).isEqualTo(5000);
                assertThat(preflight.getServicePorts().get("statistics-service")).isEqualTo(7000);
                assertThat(preflight.getServicePorts().get("notification-service")).isEqualTo(8000);
                assertThat(preflight.getDetectedEndpoints())
                        .anyMatch(ep -> "gateway".equals(ep.getService()) && ep.getPath().startsWith("/accounts"))
                        .anyMatch(ep -> "gateway".equals(ep.getService()) && ep.getPath().startsWith("/uaa/users"))
                        .anyMatch(ep -> "gateway".equals(ep.getService()) && ep.getPath().startsWith("/statistics"))
                        .anyMatch(ep -> "gateway".equals(ep.getService()) && ep.getPath().startsWith("/notifications"));
                assertThat(preflight.getRequiredEnvVars())
                        .noneMatch(v -> "USER_REQUIRED".equals(v.getResolution()));
            } else if ("E-Mart-Microservices".equals(repoName)) {
                assertThat(preflight.getDetectedServices())
                        .contains("api-gateway", "eureka-server", "user-service", "product-service", "order-service", "sandbox-mysql");
                assertThat(preflight.getDetectedEndpoints())
                        .anyMatch(ep -> "api-gateway".equals(ep.getService()));
            }

            // Step 3 variable normalization & payload binding check
            var stepsArray = json.createArrayNode();
            for (GeneratedStepDraft s : draft.steps()) {
                stepsArray.add(json.valueToTree(s));
            }
            ReflectionTestUtils.invokeMethod(planningService, "normalizeAndBindScenarioVariables", stepsArray, preflight);
            Map<String, String> step1Defaults = new LinkedHashMap<>(draft.sampleInputs());
            Map<String, String> protectedEnv = new LinkedHashMap<>(draft.sampleInputs());
            ReflectionTestUtils.invokeMethod(planningService, "ensureScenarioStepReferences", stepsArray, preflight, step1Defaults, protectedEnv);
            assertThat(stepsArray.size()).isEqualTo(draft.steps().size());
        }
    }
}
