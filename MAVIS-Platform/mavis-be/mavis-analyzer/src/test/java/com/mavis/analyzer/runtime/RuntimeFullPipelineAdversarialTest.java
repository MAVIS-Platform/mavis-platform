package com.mavis.analyzer.runtime;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.OtelTraceCorrelationService;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import com.mavis.analyzer.runtime.service.RuntimePlanningService.*;
import com.mavis.analyzer.runtime.service.RuntimeSessionEnvironmentService;
import com.mavis.analyzer.runtime.service.impl.OtelTraceCorrelationServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RunnerReceiptIngestServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RuntimeRunnerDispatcher;
import com.mavis.analyzer.runtime.service.impl.RuntimeSessionServiceImpl;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Multi-case adversarial & cross-language (Java Step 1 -> Step 2 -> Step 3 <-> C# MAVIS.Runner.dll)
 * verification suite. Executes the real compiled C# MAVIS.Runner binary on Java-emitted contracts.
 */
class RuntimeFullPipelineAdversarialTest {

    private static final String PINNED_COLLECTOR =
            "otel/opentelemetry-collector-contrib@sha256:1111111111111111111111111111111111111111111111111111111111111111";
    private static final String PINNED_SCENARIO_RUNNER =
            "mavis/scenario-runner@sha256:2222222222222222222222222222222222222222222222222222222222222222";
    private static final String PINNED_APP_IMAGE_1 =
            "ghcr.io/mavis/api-gateway@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String PINNED_APP_IMAGE_2 =
            "ghcr.io/mavis/order-service@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    private static final String PINNED_APP_IMAGE_3 =
            "ghcr.io/mavis/notification-worker@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    private static final String PINNED_POSTGRES_IMAGE =
            "postgres@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    private static final String ENV_KEY_BASE64 =
            Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));
    private static final String RUNNER_KEY = "adversarial-runner-secret-key-2026";

    @TempDir
    Path tempDir;

    private ObjectMapper objectMapper;
    private ProjectRepository projectRepository;
    private SourceSnapshotRepository sourceSnapshotRepository;
    private ModelVersionRepository modelVersionRepository;
    private ModelElementRepository modelElementRepository;
    private ModelRelationshipRepository modelRelationshipRepository;
    private EvidenceRepository evidenceRepository;
    private DiagramVersionRepository diagramVersionRepository;
    private RuntimeSessionRepository runtimeSessionRepository;
    private RuntimeConfigurationRepository runtimeConfigurationRepository;
    private RuntimeScenarioRepository runtimeScenarioRepository;
    private UserRepository userRepository;
    private AccessPolicyService accessPolicyService;
    private PlatformRuntimeSettings settings;
    private RunnerServiceAuthGuard runnerServiceAuthGuard;
    private ComposePreflightValidator composePreflightValidator;
    private RuntimeSessionEnvironmentService environmentService;
    private RuntimeSessionServiceImpl runtimeSessionService;
    private RuntimePlanningService runtimePlanningService;
    private RunnerReceiptIngestService runnerReceiptIngestService;
    private OtelTraceCorrelationService otelTraceCorrelationService;

    private final Object dbLock = new Object();
    private volatile String defaultRunnerKey = RUNNER_KEY;
    private final ThreadLocal<String> threadRunnerKey = new ThreadLocal<>();

    private final Map<UUID, Project> projectsStore = new LinkedHashMap<>();
    private final Map<UUID, SourceSnapshot> snapshotsStore = new LinkedHashMap<>();
    private final Map<UUID, ModelVersion> modelsStore = new LinkedHashMap<>();
    private final Map<UUID, List<ModelElement>> elementsByModel = new LinkedHashMap<>();
    private final Map<UUID, List<ModelRelationship>> relsByModel = new LinkedHashMap<>();
    private final Map<UUID, List<Evidence>> evidenceByModel = new LinkedHashMap<>();
    private final Map<UUID, List<DiagramVersion>> diagramsByModel = new LinkedHashMap<>();
    private final Map<UUID, RuntimeConfiguration> configsStore = new LinkedHashMap<>();
    private final Map<UUID, RuntimeScenario> scenariosStore = new LinkedHashMap<>();
    private final Map<UUID, RuntimeSession> sessionsStore = new LinkedHashMap<>();

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        projectRepository = mock(ProjectRepository.class);
        sourceSnapshotRepository = mock(SourceSnapshotRepository.class);
        modelVersionRepository = mock(ModelVersionRepository.class);
        modelElementRepository = mock(ModelElementRepository.class);
        modelRelationshipRepository = mock(ModelRelationshipRepository.class);
        evidenceRepository = mock(EvidenceRepository.class);
        diagramVersionRepository = mock(DiagramVersionRepository.class);
        runtimeSessionRepository = mock(RuntimeSessionRepository.class);
        runtimeConfigurationRepository = mock(RuntimeConfigurationRepository.class);
        runtimeScenarioRepository = mock(RuntimeScenarioRepository.class);
        userRepository = mock(UserRepository.class);
        accessPolicyService = mock(AccessPolicyService.class);
        settings = new PlatformRuntimeSettings();

        runnerServiceAuthGuard = new RunnerServiceAuthGuard(accessPolicyService);
        ReflectionTestUtils.setField(runnerServiceAuthGuard, "runnerServiceKey", RUNNER_KEY);
        jakarta.servlet.http.HttpServletRequest threadAwareReq = (jakarta.servlet.http.HttpServletRequest) java.lang.reflect.Proxy.newProxyInstance(
                jakarta.servlet.http.HttpServletRequest.class.getClassLoader(),
                new Class<?>[]{jakarta.servlet.http.HttpServletRequest.class},
                (proxy, method, args) -> {
                    if ("getHeader".equals(method.getName()) && args != null && args.length == 1
                            && "X-Mavis-Runner-Key".equalsIgnoreCase(String.valueOf(args[0]))) {
                        String tl = threadRunnerKey.get();
                        if (tl != null) return "__NULL__".equals(tl) ? null : tl;
                        return defaultRunnerKey;
                    }
                    Class<?> rt = method.getReturnType();
                    if (rt == boolean.class) return false;
                    if (rt == int.class) return 0;
                    if (rt == long.class) return 0L;
                    return null;
                }
        );
        ReflectionTestUtils.setField(runnerServiceAuthGuard, "httpServletRequest", threadAwareReq);

        composePreflightValidator = new ComposePreflightValidator();
        environmentService = new RuntimeSessionEnvironmentService(
                runtimeSessionRepository, runnerServiceAuthGuard, objectMapper, ENV_KEY_BASE64);

        wireRepositories();

        runtimeSessionService = new RuntimeSessionServiceImpl(
                runtimeSessionRepository,
                projectRepository,
                sourceSnapshotRepository,
                userRepository,
                composePreflightValidator,
                new ComposeOverrideGenerator(),
                modelVersionRepository,
                modelElementRepository,
                accessPolicyService,
                runnerServiceAuthGuard,
                objectMapper,
                settings
        );
        ReflectionTestUtils.setField(runtimeSessionService, "runnerStateRoot", tempDir.resolve("state-root").toString());
        ReflectionTestUtils.setField(runtimeSessionService, "collectorImage", PINNED_COLLECTOR);
        ReflectionTestUtils.setField(runtimeSessionService, "modelRelationshipRepository", modelRelationshipRepository);
        ReflectionTestUtils.setField(runtimeSessionService, "evidenceRepository", evidenceRepository);
        ReflectionTestUtils.setField(runtimeSessionService, "runtimeConfigurationRepository", runtimeConfigurationRepository);
        ReflectionTestUtils.setField(runtimeSessionService, "runtimeSessionEnvironmentService", environmentService);

        runtimePlanningService = new RuntimePlanningService(
                projectRepository,
                sourceSnapshotRepository,
                modelVersionRepository,
                runtimeConfigurationRepository,
                runtimeScenarioRepository,
                accessPolicyService,
                settings,
                runtimeSessionService,
                objectMapper,
                environmentService
        );
        ReflectionTestUtils.setField(runtimePlanningService, "composeValidator", composePreflightValidator);
        ReflectionTestUtils.setField(runtimePlanningService, "modelElements", modelElementRepository);
        ReflectionTestUtils.setField(runtimePlanningService, "modelRelationships", modelRelationshipRepository);
        ReflectionTestUtils.setField(runtimePlanningService, "runnerCollectorImage", PINNED_COLLECTOR);
        ReflectionTestUtils.setField(runtimePlanningService, "runnerScenarioImage", PINNED_SCENARIO_RUNNER);

        runnerReceiptIngestService = new RunnerReceiptIngestServiceImpl(
                runtimeSessionRepository,
                projectRepository,
                modelVersionRepository,
                modelElementRepository,
                modelRelationshipRepository,
                evidenceRepository,
                diagramVersionRepository,
                runnerServiceAuthGuard,
                objectMapper
        );
        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempDir.resolve("state-root").toString());

        otelTraceCorrelationService = new OtelTraceCorrelationServiceImpl(
                runtimeSessionRepository,
                modelVersionRepository,
                modelElementRepository,
                modelRelationshipRepository,
                evidenceRepository,
                diagramVersionRepository,
                objectMapper,
                accessPolicyService
        );

        bindRunnerHeader(RUNNER_KEY);
    }

    private void bindRunnerHeader(String key) {
        defaultRunnerKey = key;
        MockHttpServletRequest req = new MockHttpServletRequest();
        if (key != null) {
            req.addHeader("X-Mavis-Runner-Key", key);
        }
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    private void wireRepositories() {
        when(projectRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(projectsStore.get(i.getArgument(0))); }
        });
        when(projectRepository.findByIdForUpdate(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(projectsStore.get(i.getArgument(0))); }
        });
        when(projectRepository.findLockedById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(projectsStore.get(i.getArgument(0))); }
        });
        when(sourceSnapshotRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(snapshotsStore.get(i.getArgument(0))); }
        });
        when(sourceSnapshotRepository.findFirstByProjectIdOrderByCreatedAtDesc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                List<SourceSnapshot> list = snapshotsStore.values().stream()
                        .filter(s -> s.getProject() != null && pid.equals(s.getProject().getId()))
                        .toList();
                return list.isEmpty() ? Optional.empty() : Optional.of(list.get(list.size() - 1));
            }
        });

        when(modelVersionRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(modelsStore.get(i.getArgument(0))); }
        });
        when(modelVersionRepository.findByProjectId(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return modelsStore.values().stream()
                        .filter(m -> m.getProject() != null && pid.equals(m.getProject().getId()))
                        .toList();
            }
        });
        when(modelVersionRepository.findByProjectIdOrderByRevisionDesc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return modelsStore.values().stream()
                        .filter(m -> m.getProject() != null && pid.equals(m.getProject().getId()))
                        .sorted(Comparator.comparingInt(ModelVersion::getRevision).reversed())
                        .toList();
            }
        });
        when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return modelsStore.values().stream()
                        .filter(m -> m.getProject() != null && pid.equals(m.getProject().getId()) && Boolean.TRUE.equals(m.getIsLatestValid()))
                        .max(Comparator.comparingInt(ModelVersion::getRevision));
            }
        });
        when(modelVersionRepository.findMaxRevisionByProjectId(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return modelsStore.values().stream()
                        .filter(m -> m.getProject() != null && pid.equals(m.getProject().getId()))
                        .mapToInt(ModelVersion::getRevision)
                        .max()
                        .orElse(0);
            }
        });
        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID sid = i.getArgument(0);
                return modelsStore.values().stream()
                        .filter(m -> m.getRuntimeSession() != null && sid.equals(m.getRuntimeSession().getId()))
                        .max(Comparator.comparingInt(ModelVersion::getRevision));
            }
        });
        doAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                UUID keepId = i.getArgument(1);
                for (ModelVersion mv : modelsStore.values()) {
                    if (mv.getProject() != null && pid.equals(mv.getProject().getId()) && !keepId.equals(mv.getId())) {
                        mv.setIsLatestValid(false);
                    }
                }
            }
            return null;
        }).when(modelVersionRepository).invalidatePreviousVersions(any(UUID.class), any(UUID.class));
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                ModelVersion mv = i.getArgument(0);
                if (mv.getId() == null) mv.setId(UUID.randomUUID());
                if (mv.getCreatedAt() == null) mv.setCreatedAt(OffsetDateTime.now());
                modelsStore.put(mv.getId(), mv);
                return mv;
            }
        });

        when(modelElementRepository.findByModelVersionId(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return new ArrayList<>(elementsByModel.getOrDefault(i.getArgument(0), List.of())); }
        });
        when(modelElementRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID eid = i.getArgument(0);
                return elementsByModel.values().stream().flatMap(List::stream).filter(e -> eid.equals(e.getId())).findFirst();
            }
        });
        when(modelElementRepository.saveAll(anyList())).thenAnswer(i -> {
            synchronized (dbLock) {
                List<ModelElement> list = i.getArgument(0);
                for (ModelElement el : list) {
                    if (el.getId() == null) el.setId(UUID.randomUUID());
                    if (el.getModelVersion() != null && el.getModelVersion().getId() != null) {
                        elementsByModel.computeIfAbsent(el.getModelVersion().getId(), k -> new ArrayList<>()).add(el);
                    }
                }
                return list;
            }
        });

        when(modelRelationshipRepository.findByModelVersionId(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return new ArrayList<>(relsByModel.getOrDefault(i.getArgument(0), List.of())); }
        });
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(i -> {
            synchronized (dbLock) {
                List<ModelRelationship> list = i.getArgument(0);
                for (ModelRelationship rel : list) {
                    if (rel.getId() == null) rel.setId(UUID.randomUUID());
                    if (rel.getModelVersion() != null && rel.getModelVersion().getId() != null) {
                        relsByModel.computeIfAbsent(rel.getModelVersion().getId(), k -> new ArrayList<>()).add(rel);
                    }
                }
                return list;
            }
        });

        when(evidenceRepository.findByModelVersionId(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return new ArrayList<>(evidenceByModel.getOrDefault(i.getArgument(0), List.of())); }
        });
        when(evidenceRepository.saveAll(anyList())).thenAnswer(i -> {
            synchronized (dbLock) {
                List<Evidence> list = i.getArgument(0);
                for (Evidence ev : list) {
                    if (ev.getId() == null) ev.setId(UUID.randomUUID());
                    if (ev.getModelVersion() != null && ev.getModelVersion().getId() != null) {
                        evidenceByModel.computeIfAbsent(ev.getModelVersion().getId(), k -> new ArrayList<>()).add(ev);
                    }
                }
                return list;
            }
        });

        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                DiagramVersion dv = i.getArgument(0);
                if (dv.getId() == null) dv.setId(UUID.randomUUID());
                if (dv.getModelVersion() != null && dv.getModelVersion().getId() != null) {
                    diagramsByModel.computeIfAbsent(dv.getModelVersion().getId(), k -> new ArrayList<>()).add(dv);
                }
                return dv;
            }
        });
        when(diagramVersionRepository.findByModelVersionIdAndNotation(any(UUID.class), any(String.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID mid = i.getArgument(0);
                String notation = i.getArgument(1);
                return diagramsByModel.getOrDefault(mid, List.of()).stream()
                        .filter(d -> notation.equals(d.getNotation()))
                        .toList();
            }
        });

        when(runtimeConfigurationRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(configsStore.get(i.getArgument(0))); }
        });
        when(runtimeConfigurationRepository.saveAndFlush(any(RuntimeConfiguration.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                RuntimeConfiguration rc = i.getArgument(0);
                configsStore.put(rc.getProjectId(), rc);
                return rc;
            }
        });

        when(runtimeScenarioRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(scenariosStore.get(i.getArgument(0))); }
        });
        when(runtimeScenarioRepository.findByProjectIdOrderByNameAsc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return scenariosStore.values().stream()
                        .filter(s -> pid.equals(s.getProjectId()))
                        .sorted(Comparator.comparing(RuntimeScenario::getName))
                        .toList();
            }
        });
        when(runtimeScenarioRepository.saveAndFlush(any(RuntimeScenario.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                RuntimeScenario sc = i.getArgument(0);
                if (sc.getId() == null) sc.setId(UUID.randomUUID());
                scenariosStore.put(sc.getId(), sc);
                return sc;
            }
        });

        when(runtimeSessionRepository.findById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(sessionsStore.get(i.getArgument(0))); }
        });
        when(runtimeSessionRepository.findLockedById(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) { return Optional.ofNullable(sessionsStore.get(i.getArgument(0))); }
        });
        when(runtimeSessionRepository.findByProjectIdOrderByCreatedAtDesc(any(UUID.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                UUID pid = i.getArgument(0);
                return sessionsStore.values().stream()
                        .filter(s -> s.getProject() != null && pid.equals(s.getProject().getId()))
                        .toList();
            }
        });
        when(runtimeSessionRepository.save(any(RuntimeSession.class))).thenAnswer(i -> {
            synchronized (dbLock) {
                RuntimeSession rs = i.getArgument(0);
                if (rs.getId() == null) rs.setId(UUID.randomUUID());
                if (rs.getCreatedAt() == null) rs.setCreatedAt(OffsetDateTime.now());
                sessionsStore.put(rs.getId(), rs);
                return rs;
            }
        });
    }

    private Optional<Path> locateRunnerDll() {
        List<Path> candidates = List.of(
                Path.of("../../../MAVIS.Worker/src/MAVIS.Runner/bin/Release/net10.0/MAVIS.Runner.dll"),
                Path.of("../../MAVIS.Worker/src/MAVIS.Runner/bin/Release/net10.0/MAVIS.Runner.dll"),
                Path.of("../../../MAVIS.Worker/src/MAVIS.Runner/bin/Debug/net10.0/MAVIS.Runner.dll"),
                Path.of("../../MAVIS.Worker/src/MAVIS.Runner/bin/Debug/net10.0/MAVIS.Runner.dll")
        );
        return candidates.stream().map(p -> p.toAbsolutePath().normalize()).filter(Files::isRegularFile).findFirst();
    }

    private Optional<Path> locateCollectorYaml() {
        List<Path> candidates = List.of(
                Path.of("../../../MAVIS.Worker/samples/runtime-poc/collector.yaml"),
                Path.of("../../MAVIS.Worker/samples/runtime-poc/collector.yaml")
        );
        return candidates.stream().map(p -> p.toAbsolutePath().normalize()).filter(Files::isRegularFile).findFirst();
    }

    private record CliOutcome(int exitCode, String stdout) {}

    private CliOutcome invokeRealCSharpRunner(Path runnerDll, String... args) throws Exception {
        return invokeRealCSharpRunnerWithEnv(runnerDll, Map.of(), args);
    }

    private CliOutcome invokeRealCSharpRunnerWithEnv(Path runnerDll, Map<String, String> extraEnv, String... args) throws Exception {
        List<String> cmd = new ArrayList<>();
        cmd.add("dotnet");
        cmd.add(runnerDll.toString());
        cmd.addAll(Arrays.asList(args));
        ProcessBuilder pb = new ProcessBuilder(cmd)
                .directory(tempDir.toFile())
                .redirectErrorStream(true);
        if (extraEnv != null && !extraEnv.isEmpty()) {
            pb.environment().putAll(extraEnv);
        }
        Process process = pb.start();
        byte[] bytes = process.getInputStream().readAllBytes();
        boolean done = process.waitFor(30, TimeUnit.SECONDS);
        assertThat(done).as("C# MAVIS.Runner CLI finished within 30s").isTrue();
        return new CliOutcome(process.exitValue(), new String(bytes, StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("CASE 1: Polyglot Multi-Service + Infra + Secrets -> Step 1 -> Step 2 -> Step 3 <-> Real C# MAVIS.Runner.dll (preflight + plan + correlate) -> Promoted Enrichment")
    void case1_polyglotFullPipelineAndRealCSharpRunnerWireContract() throws Exception {
        Optional<Path> runnerDllOpt = locateRunnerDll();
        Optional<Path> collectorOpt = locateCollectorYaml();
        assumeTrue(runnerDllOpt.isPresent() && collectorOpt.isPresent(), "Prebuilt MAVIS.Runner.dll and collector.yaml required");
        Path runnerDll = runnerDllOpt.get();
        Path collectorYaml = collectorOpt.get();

        Path repoDir = Files.createDirectories(tempDir.resolve("polyglot-repo"));
        Files.writeString(repoDir.resolve("docker-compose.yml"), """
                services:
                  api-gateway:
                    image: ghcr.io/mavis/api-gateway:1.0.0
                    ports:
                      - "8080:8080"
                    environment:
                      - ORDER_SERVICE_URL=http://order-service:5000
                      - JWT_SECRET=super-secret-jwt-signing-key-999999
                    depends_on:
                      - order-service
                  order-service:
                    build: ./order-service
                    ports:
                      - "5000:5000"
                    environment:
                      ASPNETCORE_URLS: http://+:5000
                      ConnectionStrings__OrdersDb: Host=postgres-db;Port=5432;Database=orders;Username=orders_user;Password=${POSTGRES_PASSWORD}
                    depends_on:
                      - postgres-db
                  notification-worker:
                    image: %s
                    expose:
                      - "3000"
                  postgres-db:
                    image: %s
                    environment:
                      POSTGRES_DB: orders
                      POSTGRES_USER: orders_user
                      POSTGRES_PASSWORD: my-sandbox-pg-password-123
                    volumes:
                      - pgdata:/var/lib/postgresql/data
                volumes:
                  pgdata:
                """.formatted(PINNED_APP_IMAGE_3, PINNED_POSTGRES_IMAGE));

        Path gwSrc = Files.createDirectories(repoDir.resolve("api-gateway/src/main/java/com/acme/gw"));
        Files.writeString(gwSrc.resolve("GatewayOrderController.java"), """
                package com.acme.gw;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/api/orders")
                public class GatewayOrderController {
                    public record CreateOrderDto(String customerEmail, String productCode, int quantity) {}
                    @PostMapping
                    public String create(@RequestBody CreateOrderDto body) { return "ok"; }
                    @GetMapping("/{id}")
                    public String getById(@PathVariable Long id) { return "ok"; }
                }
                """);
        Path gwRes = Files.createDirectories(repoDir.resolve("api-gateway/src/main/resources"));
        Files.writeString(gwRes.resolve("application.yml"), """
                server:
                  port: 8080
                management:
                  endpoints:
                    web:
                      exposure:
                        include: health,info
                """);

        Path orderDir = Files.createDirectories(repoDir.resolve("order-service"));
        Files.writeString(orderDir.resolve("Orders.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>");
        Files.writeString(orderDir.resolve("Program.cs"), """
                var builder = WebApplication.CreateBuilder(args);
                var app = builder.Build();
                app.MapHealthChecks("/healthz");
                app.MapPost("/orders", () => Results.Created("/orders/1", new { id = 1 }));
                app.MapGet("/orders/{id}", (int id) => Results.Ok(new { id }));
                app.Run();
                """);
        Path notifDir = Files.createDirectories(repoDir.resolve("notification-worker"));
        Files.writeString(notifDir.resolve("package.json"), "{\"name\":\"notification-worker\",\"dependencies\":{\"express\":\"^4.19.0\"}}");
        Files.writeString(notifDir.resolve("index.js"), "app.get('/health', (req, res) => res.send('ok')); app.post('/notify', (req, res) => res.send('sent'));");

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID baseModelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Polyglot Commerce").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).artifactHash("poly-hash").build();
        ModelVersion baseModel = ModelVersion.builder().id(baseModelId).project(project).sourceSnapshot(snapshot).revision(1).origin("STATIC").isLatestValid(true).build();

        ModelElement gwEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("ApiGateway").elementType("SERVICE_CONTAINER").languageStack("java").build();
        ModelElement ordEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("OrderService").elementType("SERVICE_CONTAINER").languageStack("dotnet").build();
        ModelElement notifEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("NotificationWorker").elementType("SERVICE_CONTAINER").languageStack("node").build();
        ModelRelationship staticEdge = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModel)
                .sourceElement(gwEl)
                .targetElement(ordEl)
                .relationType("HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        projectsStore.put(projectId, project);
        snapshotsStore.put(snapshotId, snapshot);
        modelsStore.put(baseModelId, baseModel);
        elementsByModel.put(baseModelId, new ArrayList<>(List.of(gwEl, ordEl, notifEl)));
        relsByModel.put(baseModelId, new ArrayList<>(List.of(staticEdge)));

        // --- STEP 1: Configuration & Auto-Remediated Compose ---
        ObjectNode reqProfile = objectMapper.createObjectNode();
        ObjectNode imgOverrides = reqProfile.putObject("serviceImageOverrides");
        imgOverrides.put("api-gateway", PINNED_APP_IMAGE_1);
        imgOverrides.put("order-service", PINNED_APP_IMAGE_2);
        ObjectNode secretVals = reqProfile.putObject("secretValues");
        secretVals.put("EXTERNAL_STRIPE_API_KEY", "sk_test_redacted_value_123456");

        ConfigurationView savedCfg = runtimePlanningService.saveConfiguration(
                projectId,
                new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", reqProfile, 0));
        assertThat(savedCfg.revision()).isEqualTo(1);
        assertThat(savedCfg.supported()).isTrue();
        assertThat(savedCfg.ready()).isTrue();
        assertThat(savedCfg.protectedInputsReady()).isTrue();
        assertThat(savedCfg.profile().toString()).doesNotContain("sk_test_redacted_value_123456");
        assertThat(savedCfg.profile().toString()).doesNotContain("super-secret-jwt-signing-key-999999");

        JsonNode apps = savedCfg.profile().path("applications");
        assertThat(apps.has("postgres-db")).as("Infrastructure DB excluded from instrumented applications").isFalse();
        assertThat(apps.path("api-gateway").path("runtime").asText()).isEqualTo("java");
        assertThat(apps.path("order-service").path("runtime").asText()).isEqualTo("dotnet8-linux-x64-glibc");
        assertThat(apps.path("order-service").path("containerPort").asInt()).isEqualTo(5000);
        assertThat(apps.path("notification-worker").path("runtime").asText()).isEqualTo("passthrough");

        String sandboxCompose = savedCfg.profile().path("sandboxCompose").asText();
        assertThat(sandboxCompose).isNotBlank();
        Path composeOut = tempDir.resolve("step1-sandbox-compose.yml");
        Files.writeString(composeOut, sandboxCompose);

        CliOutcome preflightCli = invokeRealCSharpRunner(runnerDll, "preflight", composeOut.toString());
        assertThat(preflightCli.exitCode()).as("C# MAVIS.Runner preflight stdout: %s", preflightCli.stdout()).isZero();
        JsonNode preflightJson = objectMapper.readTree(preflightCli.stdout());
        assertThat(preflightJson.path("compatible").asBoolean()).isTrue();

        // Revision conflict check on Step 1
        assertThatThrownBy(() -> runtimePlanningService.saveConfiguration(
                projectId,
                new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", reqProfile, 0)))
                .isInstanceOf(BusinessException.class)
                .extracting(ex -> ((BusinessException) ex).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);

        // --- STEP 2: Scenario Synthesis, DTO Payload Grounding & Causal Ordering ---
        GeneratedScenarioDraftView generated = runtimePlanningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, baseModelId, "Verify order creation across services"));
        assertThat(generated.steps()).isNotEmpty();
        assertThat(generated.runnableServices()).contains("api-gateway", "order-service", "notification-worker");
        assertThat(generated.runnableServices()).doesNotContain("postgres-db");

        List<String> serializedSteps = new ArrayList<>();
        for (GeneratedStepDraft st : generated.steps()) {
            ObjectNode stepNode = objectMapper.createObjectNode();
            stepNode.put("id", st.id());
            stepNode.put("service", st.service());
            stepNode.put("method", st.method());
            stepNode.put("path", st.path());
            stepNode.put("expectedStatus", st.expectedStatus());
            stepNode.put("allowClientError", st.allowClientError() == null || st.allowClientError());
            if (st.bodyReference() != null) stepNode.put("bodyReference", st.bodyReference());
            if (st.environmentVariables() != null && !st.environmentVariables().isEmpty()) {
                stepNode.set("environmentVariables", objectMapper.valueToTree(st.environmentVariables()));
            }
            serializedSteps.add(objectMapper.writeValueAsString(stepNode));
        }

        ScenarioView savedScenario = runtimePlanningService.saveScenario(
                projectId, null, new ScenarioRequest(generated.suggestedName(), serializedSteps, 0));
        assertThat(savedScenario.revision()).isEqualTo(1);

        // --- STEP 3: Start Session, Encrypted Protected Environment & Real C# MAVIS.Runner `plan` + `correlate` ---
        RuntimeSessionResponseDTO started = runtimePlanningService.start(
                projectId,
                new StartRequest(snapshotId, savedScenario.id(), savedCfg.revision(), savedScenario.revision(), true, generated.sampleInputs()));
        assertThat(started.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
        assertThat(started.getScenarioStatus()).isEqualTo("APPROVED");

        // Protected environment unseals relocated secrets + user secret + generated step payloads
        var envView = environmentService.readForRunner(started.getId());
        assertThat(envView.values()).containsEntry("EXTERNAL_STRIPE_API_KEY", "sk_test_redacted_value_123456");
        assertThat(envView.values().values()).anyMatch(v -> v.contains("super-secret-jwt-signing-key-999999"));
        assertThat(envView.values().values()).anyMatch(v -> v.contains("my-sandbox-pg-password-123"));

        RunnerDefinitionExportDTO runDef = runtimeSessionService.exportRunDefinition(started.getId());
        assertThat(runDef.isProtectedEnvironmentAvailable()).isTrue();
        assertThat(runDef.getConfirmedServiceMappings())
                .containsEntry("api-gateway", gwEl.getId().toString())
                .containsEntry("order-service", ordEl.getId().toString());

        // C# `MAVIS.Runner plan <def.json> <collector.yaml>` parses with UnmappedMemberHandling.Disallow
        // (note: CLI `plan` invokes ComposeOverrideBuilder without secret values, so test plan with bindings cleared while preserving all other fields)
        JsonNode fullDefTree = objectMapper.valueToTree(runDef);
        ObjectNode planDefTree = fullDefTree.deepCopy();
        if (planDefTree.path("profile") instanceof ObjectNode profObj) {
            profObj.remove("environmentBindings");
        }
        Path defFile = tempDir.resolve("step3-run-definition.json");
        Files.writeString(defFile, objectMapper.writeValueAsString(planDefTree));

        CliOutcome planCli = invokeRealCSharpRunner(runnerDll, "plan", defFile.toString(), collectorYaml.toString());
        assertThat(planCli.exitCode()).as("C# MAVIS.Runner plan stdout: %s", planCli.stdout()).isZero();
        JsonNode overrideJson = objectMapper.readTree(planCli.stdout());
        assertThat(overrideJson.path("networks").path("default").path("internal").asBoolean()).isTrue();
        assertThat(overrideJson.path("services").path("api-gateway").path("environment").path("JAVA_TOOL_OPTIONS").asText())
                .contains("opentelemetry-javaagent.jar");
        assertThat(overrideJson.path("services").path("order-service").path("environment").path("CORECLR_ENABLE_PROFILING").asText())
                .isEqualTo("1");
        assertThat(overrideJson.path("services").has("mavis-collector")).isTrue();

        // Also verify direct legacy `createRuntimeSession` path with .NET PascalCase ModelElement passes C# `MAVIS.Runner plan`
        RuntimeSessionResponseDTO directSession = runtimeSessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder()
                        .projectId(projectId)
                        .sourceSnapshotId(snapshotId)
                        .modelVersionId(baseModelId)
                        .scenarioName("Direct API Session")
                        .profileName("SPRING_BOOT_DOTNET_COMPOSE_V1")
                        .build());
        RunnerDefinitionExportDTO directExport = runtimeSessionService.exportRunDefinition(directSession.getId());
        assertThat(directExport.getProfile().path("applications").path("order-service").path("runtime").asText())
                .isEqualTo("dotnet8-linux-x64-glibc");
        Path directDefFile = tempDir.resolve("direct-run-definition.json");
        Files.writeString(directDefFile, objectMapper.writeValueAsString(directExport));
        CliOutcome directPlanCli = invokeRealCSharpRunner(runnerDll, "plan", directDefFile.toString(), collectorYaml.toString());
        assertThat(directPlanCli.exitCode()).as("Direct session C# plan stdout: %s", directPlanCli.stdout()).isZero();

        // Invoke REAL C# `MAVIS.Runner correlate` on multi-hop OTLP JSON (api-gateway -> order-service -> notification-worker)
        String traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
        Path otlpFile = tempDir.resolve("otlp-multihop.json");
        Files.writeString(otlpFile, """
                {
                  "resourceSpans": [
                    {
                      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "api-gateway" } }] },
                      "scopeSpans": [{ "spans": [{
                        "traceId": "%s",
                        "spanId": "1111111111111111",
                        "parentSpanId": "",
                        "kind": "SPAN_KIND_SERVER",
                        "startTimeUnixNano": "1700000000000000000",
                        "endTimeUnixNano": "1700000000095000000",
                        "status": { "code": "STATUS_CODE_OK" },
                        "attributes": [{ "key": "http.response.status_code", "value": { "intValue": 201 } }]
                      }]}]
                    },
                    {
                      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "order-service" } }] },
                      "scopeSpans": [{ "spans": [{
                        "traceId": "%s",
                        "spanId": "2222222222222222",
                        "parentSpanId": "1111111111111111",
                        "kind": "SPAN_KIND_SERVER",
                        "startTimeUnixNano": "1700000000010000000",
                        "endTimeUnixNano": "1700000000070000000",
                        "status": { "code": "STATUS_CODE_OK" },
                        "attributes": [{ "key": "http.response.status_code", "value": { "intValue": 201 } }]
                      }]}]
                    },
                    {
                      "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "notification-worker" } }] },
                      "scopeSpans": [{ "spans": [{
                        "traceId": "%s",
                        "spanId": "3333333333333333",
                        "parentSpanId": "2222222222222222",
                        "kind": "SPAN_KIND_SERVER",
                        "startTimeUnixNano": "1700000000030000000",
                        "endTimeUnixNano": "1700000000060000000",
                        "status": { "code": "STATUS_CODE_OK" },
                        "attributes": [{ "key": "http.response.status_code", "value": { "intValue": 200 } }]
                      }]}]
                    }
                  ]
                }
                """.formatted(traceId, traceId, traceId));

        Path mappingsFile = tempDir.resolve("mappings.json");
        Files.writeString(mappingsFile, objectMapper.writeValueAsString(runDef.getConfirmedServiceMappings()));

        CliOutcome correlateCli = invokeRealCSharpRunner(
                runnerDll, "correlate", started.getId().toString(), baseModelId.toString(), otlpFile.toString(), mappingsFile.toString());
        assertThat(correlateCli.exitCode()).as("C# MAVIS.Runner correlate stdout: %s", correlateCli.stdout()).isZero();
        RunnerTraceCorrelationDTO csharpTrace = objectMapper.readValue(correlateCli.stdout(), RunnerTraceCorrelationDTO.class);
        assertThat(csharpTrace.getSpans()).hasSize(3);
        assertThat(csharpTrace.getCausalEdges()).hasSize(2);

        RuntimeSession liveSession = sessionsStore.get(started.getId());
        ObjectNode scenarioOutcomeJson = objectMapper.createObjectNode();
        scenarioOutcomeJson.put("sessionId", started.getId().toString());
        scenarioOutcomeJson.put("status", "Passed");
        scenarioOutcomeJson.putArray("steps").addObject()
                .put("stepId", "step-1")
                .put("status", "Passed")
                .put("statusCode", 201)
                .put("traceId", traceId)
                .put("parentSpanId", "00f067aa0ba902b7")
                .put("elapsedMilliseconds", 95);

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(started.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(liveSession.getProfileVersionId())
                .runConfigurationVersionId(liveSession.getRunConfigurationVersionId())
                .scenarioVersionId(liveSession.getScenarioVersionId())
                .resourceProject(liveSession.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .actualImageIds(Map.of(
                        "api-gateway", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        "order-service", "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        "notification-worker", "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                        "postgres-db", "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                        "mavis-collector", "sha256:1111111111111111111111111111111111111111111111111111111111111111"))
                .declaredInstrumentationVersions(Map.of("java", "2.32.0", "dotnet", "1.17.0"))
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Completed")
                        .scenarioStatus("Passed")
                        .evidenceStatus("Available")
                        .cleanupStatus("Confirmed")
                        .traceQuality("CompleteForCapturedData")
                        .mappingStatus("Mapped")
                        .scenario(scenarioOutcomeJson)
                        .trace(csharpTrace)
                        .build())
                .build();

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(started.getId(), receipt);
        assertThat(ack.getPersistenceStatus()).isEqualTo("COMMITTED");
        assertThat(ack.getPublicationGateStatus()).isEqualTo("PROMOTED");
        assertThat(ack.getPromotedLatest()).isTrue();
        assertThat(ack.getEnrichedModelVersionId()).isNotNull();

        List<ModelRelationship> enrichedRels = relsByModel.get(ack.getEnrichedModelVersionId());
        assertThat(enrichedRels).anyMatch(r -> "STATIC_AND_RUNTIME".equals(r.getOriginLayer())
                && "ApiGateway".equals(r.getSourceElement().getName())
                && "OrderService".equals(r.getTargetElement().getName()));
        assertThat(enrichedRels).anyMatch(r -> "RUNTIME_OBSERVED".equals(r.getRelationType())
                && "OrderService".equals(r.getSourceElement().getName())
                && "NotificationWorker".equals(r.getTargetElement().getName()));

        SequenceDiagramResponseDTO seq = otelTraceCorrelationService.getSequenceDiagramBySession(started.getId());
        assertThat(seq.getSteps()).hasSize(2);

        RuntimeSessionResponseDTO richDto = runtimeSessionService.getSessionById(started.getId());
        assertThat(richDto.getEnrichedModelVersionId()).isEqualTo(ack.getEnrichedModelVersionId());
        assertThat(richDto.getPublicationGateStatus()).isEqualTo("PROMOTED");
        assertThat(richDto.getCapturedSpanCount()).isEqualTo(3);
        assertThat(richDto.getStepResults()).hasSize(generated.steps().size());
        assertThat(richDto.getStepResults().get(0).getStatus()).isEqualTo("PASSED");
        assertThat(richDto.getStepResults().get(0).getStatusCode()).isEqualTo(201);
        if (richDto.getStepResults().size() > 1) {
            assertThat(richDto.getStepResults().get(1).getStatus()).isEqualTo("NOT_RUN");
        }
    }

    @Test
    @DisplayName("CASE 2: Repo WITHOUT docker-compose.yml (Dockerfile Synthesis) -> Real C# MAVIS.Runner preflight & plan -> Single-Service W3C traceparent Sequence")
    void case2_dockerfileOnlySynthesisAndSingleServiceTraceparentSequence() throws Exception {
        Optional<Path> runnerDllOpt = locateRunnerDll();
        Optional<Path> collectorOpt = locateCollectorYaml();
        assumeTrue(runnerDllOpt.isPresent() && collectorOpt.isPresent(), "Prebuilt MAVIS.Runner.dll and collector.yaml required");

        Path repoDir = Files.createDirectories(tempDir.resolve("dockerfile-only-repo"));
        Files.writeString(repoDir.resolve("Dockerfile"), """
                FROM eclipse-temurin:21-jre
                EXPOSE 8085
                COPY app.jar /app.jar
                ENTRYPOINT ["java","-jar","/app.jar"]
                """);
        Path srcDir = Files.createDirectories(repoDir.resolve("src/main/java/com/acme/catalog"));
        Files.writeString(srcDir.resolve("CatalogController.java"), """
                package com.acme.catalog;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/api/catalog")
                public class CatalogController {
                    @GetMapping("/items")
                    public String items() { return "[]"; }
                }
                """);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID baseModelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Catalog Single Service").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).artifactHash("cat-hash").build();
        ModelVersion baseModel = ModelVersion.builder().id(baseModelId).project(project).sourceSnapshot(snapshot).revision(1).origin("STATIC").isLatestValid(true).build();
        ModelElement catEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("CatalogService").elementType("SERVICE_CONTAINER").languageStack("java").build();

        projectsStore.put(projectId, project);
        snapshotsStore.put(snapshotId, snapshot);
        modelsStore.put(baseModelId, baseModel);
        elementsByModel.put(baseModelId, new ArrayList<>(List.of(catEl)));

        PreflightCheckResponseDTO pre = runtimeSessionService.runComposePreflight(snapshotId);
        assertThat(pre.isCompatible()).isTrue();
        assertThat(pre.getDetectedServices()).isNotEmpty();
        String detectedSvc = pre.getDetectedServices().get(0);

        ObjectNode reqProfile = objectMapper.createObjectNode();
        reqProfile.putObject("serviceImageOverrides").put(detectedSvc, PINNED_APP_IMAGE_1);

        ConfigurationView savedCfg = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", reqProfile, 0));
        String synthCompose = savedCfg.profile().path("sandboxCompose").asText();
        assertThat(synthCompose).isNotBlank();

        Path composeFile = tempDir.resolve("case2-synth-compose.yml");
        Files.writeString(composeFile, synthCompose);
        CliOutcome preCli = invokeRealCSharpRunner(runnerDllOpt.get(), "preflight", composeFile.toString());
        assertThat(preCli.exitCode()).as("Synthesized Compose C# preflight: %s", preCli.stdout()).isZero();

        GeneratedScenarioDraftView gen = runtimePlanningService.generateScenario(projectId, new GenerateScenarioRequest(snapshotId, baseModelId, null));
        assertThat(gen.steps()).isNotEmpty();
        String stepJson = objectMapper.writeValueAsString(Map.of(
                "id", "step-1",
                "service", detectedSvc,
                "method", "GET",
                "path", "/api/catalog/items",
                "expectedStatus", 200,
                "allowClientError", true
        ));
        ScenarioView sc = runtimePlanningService.saveScenario(projectId, null, new ScenarioRequest("Catalog Smoke", List.of(stepJson), 0));
        RuntimeSessionResponseDTO started = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), savedCfg.revision(), sc.revision(), true, Map.of()));

        RunnerDefinitionExportDTO exported = runtimeSessionService.exportRunDefinition(started.getId());
        ObjectNode planTree = objectMapper.valueToTree(exported);
        if (planTree.path("profile") instanceof ObjectNode pObj) pObj.remove("environmentBindings");
        Path defPath = tempDir.resolve("case2-def.json");
        Files.writeString(defPath, objectMapper.writeValueAsString(planTree));

        CliOutcome planCli = invokeRealCSharpRunner(runnerDllOpt.get(), "plan", defPath.toString(), collectorOpt.get().toString());
        assertThat(planCli.exitCode()).as("Synthesized Compose C# plan: %s", planCli.stdout()).isZero();

        // Single-service span with W3C traceparent parentSpanId from scenario-runner (external parent -> synthesized Runner -> CatalogService hop!)
        String traceId = "abcdef1234567890abcdef1234567890";
        String runnerParentSpan = "9999999999999999";
        RuntimeSession live = sessionsStore.get(started.getId());
        ObjectNode scOut = objectMapper.createObjectNode();
        scOut.put("sessionId", started.getId().toString()).put("status", "Passed");
        scOut.putArray("steps").addObject()
                .put("stepId", "step-1").put("status", "Passed").put("statusCode", 200)
                .put("traceId", traceId).put("parentSpanId", runnerParentSpan).put("elapsedMilliseconds", 22);

        RunnerCorrelatedSpanDTO singleSpan = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId("1234567812345678")
                .parentSpanId(runnerParentSpan)
                .runtimeService(detectedSvc)
                .modelServiceId(catEl.getId().toString())
                .kind("SPAN_KIND_SERVER")
                .httpMethod("GET")
                .route("/api/catalog/items")
                .httpStatusCode(200)
                .durationNanoseconds("22000000")
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(started.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(live.getProfileVersionId())
                .runConfigurationVersionId(live.getRunConfigurationVersionId())
                .scenarioVersionId(live.getScenarioVersionId())
                .resourceProject(live.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .actualImageIds(Map.of(detectedSvc, "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
                .declaredInstrumentationVersions(Map.of("java", "2.32.0"))
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Completed")
                        .scenarioStatus("Passed")
                        .evidenceStatus("Available")
                        .cleanupStatus("Confirmed")
                        .traceQuality("CompleteForCapturedData")
                        .mappingStatus("Mapped")
                        .scenario(scOut)
                        .trace(RunnerTraceCorrelationDTO.builder()
                                .sessionId(started.getId().toString())
                                .modelVersionId(baseModelId.toString())
                                .spans(List.of(singleSpan))
                                .causalEdges(List.of())
                                .warnings(List.of("MISSING_PARENT_SPAN"))
                                .build())
                        .build())
                .build();

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(started.getId(), receipt);
        assertThat(ack.getPublicationGateStatus()).isEqualTo("PROMOTED");

        SequenceDiagramResponseDTO seq = otelTraceCorrelationService.getSequenceDiagramBySession(started.getId());
        assertThat(seq.getSteps()).hasSize(1);
        assertThat(seq.getSteps().get(0).getCalleeService()).isEqualTo("CatalogService");
    }

    @Test
    @DisplayName("CASE 3: Adversarial Security, Idempotency, Redaction, Stale Model Protection & Failure Modes Matrix (3A..3H)")
    void case3_adversarialSecurityAndFailureModesMatrix() throws Exception {
        Optional<Path> runnerDllOpt = locateRunnerDll();

        // 3A. Host-escape Compose rejected by BOTH Java Preflight and C# MAVIS.Runner preflight
        String maliciousCompose = """
                services:
                  evil:
                    image: alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
                    privileged: true
                    network_mode: host
                    volumes:
                      - /var/run/docker.sock:/var/run/docker.sock
                """;
        PreflightCheckResponseDTO javaMalicious = composePreflightValidator.validate(maliciousCompose);
        assertThat(javaMalicious.isCompatible()).isFalse();
        assertThat(javaMalicious.getSecurityWarnings()).isNotEmpty();

        if (runnerDllOpt.isPresent()) {
            Path evilPath = tempDir.resolve("evil-compose.yml");
            Files.writeString(evilPath, maliciousCompose);
            CliOutcome csharpEvil = invokeRealCSharpRunner(runnerDllOpt.get(), "preflight", evilPath.toString());
            assertThat(csharpEvil.exitCode()).isNotZero();
            assertThat(objectMapper.readTree(csharpEvil.stdout()).path("compatible").asBoolean()).isFalse();
        }

        // Setup base project + session for 3B..3H
        Path safeDir = Files.createDirectories(tempDir.resolve("safe-repo"));
        Files.writeString(safeDir.resolve("docker-compose.yml"), """
                services:
                  api-gateway:
                    image: %s
                    expose:
                      - "8080"
                """.formatted(PINNED_APP_IMAGE_1));

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID baseModelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Adversarial Project").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(safeDir.toString()).artifactHash("adv-hash").build();
        ModelVersion baseModel = ModelVersion.builder().id(baseModelId).project(project).sourceSnapshot(snapshot).revision(1).origin("STATIC").isLatestValid(true).build();
        ModelElement gwEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("api-gateway").elementType("SERVICE_CONTAINER").languageStack("java").build();

        projectsStore.put(projectId, project);
        snapshotsStore.put(snapshotId, snapshot);
        modelsStore.put(baseModelId, baseModel);
        elementsByModel.put(baseModelId, new ArrayList<>(List.of(gwEl)));

        ObjectNode safeStep1Form = objectMapper.createObjectNode();
        safeStep1Form.putObject("serviceMappings");
        ConfigurationView cfg = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", safeStep1Form, 0));
        ScenarioView sc = runtimePlanningService.saveScenario(
                projectId, null, new ScenarioRequest("Adv Scenario", List.of("{\"id\":\"step-1\",\"service\":\"api-gateway\",\"method\":\"GET\",\"path\":\"/health\",\"expectedStatus\":200}"), 0));
        RuntimeSessionResponseDTO s1 = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfg.revision(), sc.revision(), true, Map.of("API_TOKEN", "top-secret-token")));

        // 3B. Forged X-Mavis-Runner-Key rejected with 403 FORBIDDEN across all runner endpoints
        bindRunnerHeader("forged-wrong-runner-key");
        assertThatThrownBy(() -> environmentService.readForRunner(s1.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        assertThatThrownBy(() -> runtimeSessionService.acknowledgeLifecycle(
                s1.getId(), RuntimeSessionLifecycleAckRequestDTO.builder().sessionId(s1.getId()).resourceProject(s1.getResourceProject()).stage("ALLOCATED").build()))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        bindRunnerHeader(RUNNER_KEY);

        // 3C & 3D. Scenario HTTP 500 failure + diagnostic secret redaction + idempotent replay vs tampered digest 409
        RuntimeSession liveS1 = sessionsStore.get(s1.getId());
        ObjectNode failedScenarioJson = objectMapper.createObjectNode();
        failedScenarioJson.put("sessionId", s1.getId().toString()).put("status", "Failed");
        failedScenarioJson.putArray("steps").addObject()
                .put("stepId", "step-1").put("status", "Failed").put("statusCode", 500)
                .put("traceId", "4bf92f3577b34da6a3ce929d0e0e4736").put("parentSpanId", "1111111111111111").put("elapsedMilliseconds", 140);

        RunnerReceiptIngestRequestDTO failedReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(s1.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(liveS1.getProfileVersionId())
                .runConfigurationVersionId(liveS1.getRunConfigurationVersionId())
                .scenarioVersionId(liveS1.getScenarioVersionId())
                .resourceProject(liveS1.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .actualImageIds(Map.of("api-gateway", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
                .declaredInstrumentationVersions(Map.of("java", "2.32.0"))
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Completed")
                        .scenarioStatus("Failed")
                        .evidenceStatus("Available")
                        .cleanupStatus("Confirmed")
                        .traceQuality("CompleteForCapturedData")
                        .mappingStatus("Mapped")
                        .diagnostics(List.of("Upstream failed with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret.sig"))
                        .scenario(failedScenarioJson)
                        .trace(RunnerTraceCorrelationDTO.builder()
                                .sessionId(s1.getId().toString())
                                .modelVersionId(baseModelId.toString())
                                .spans(List.of(RunnerCorrelatedSpanDTO.builder()
                                        .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                                        .spanId("2222222222222222")
                                        .parentSpanId("1111111111111111")
                                        .runtimeService("api-gateway")
                                        .modelServiceId(gwEl.getId().toString())
                                        .httpStatusCode(500)
                                        .durationNanoseconds("140000000")
                                        .build()))
                                .causalEdges(List.of())
                                .warnings(List.of())
                                .build())
                        .build())
                .build();

        ReceiptIngestAckDTO failedAck = runnerReceiptIngestService.ingestRunnerReceiptAck(s1.getId(), failedReceipt);
        assertThat(failedAck.getPersistenceStatus()).isEqualTo("COMMITTED");
        assertThat(failedAck.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
        assertThat(failedAck.getPromotedLatest()).isFalse();
        assertThat(baseModel.getIsLatestValid()).as("Failed scenario never demotes base static model").isTrue();

        // Idempotent replay returns ALREADY_COMMITTED
        ReceiptIngestAckDTO replayAck = runnerReceiptIngestService.ingestRunnerReceiptAck(s1.getId(), failedReceipt);
        assertThat(replayAck.getPersistenceStatus()).isEqualTo("ALREADY_COMMITTED");

        // Tampered replay throws 409 CONFLICT
        RunnerReceiptIngestRequestDTO tampered = objectMapper.readValue(
                objectMapper.writeValueAsString(failedReceipt), RunnerReceiptIngestRequestDTO.class);
        tampered.setImageSourceCorrespondence("Unverified");
        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceiptAck(s1.getId(), tampered))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CONFLICT);

        // Diagnostics exposed on RuntimeSessionResponseDTO must have Bearer JWT redacted
        RuntimeSessionResponseDTO failedDto = runtimeSessionService.getSessionById(s1.getId());
        assertThat(failedDto.getDiagnostics()).isNotEmpty();
        assertThat(String.join(" ", failedDto.getDiagnostics())).doesNotContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
        assertThat(failedDto.getStepResults()).hasSize(1);
        assertThat(failedDto.getStepResults().get(0).getStatus()).isEqualTo("FAILED");
        assertThat(failedDto.getStepResults().get(0).getStatusCode()).isEqualTo(500);

        // 3E. Startup failure with 0 spans -> SKIPPED_NO_EVIDENCE (no empty RUNTIME_ENRICHED model created)
        RuntimeSessionResponseDTO s2 = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfg.revision(), sc.revision(), true, Map.of()));
        RuntimeSession liveS2 = sessionsStore.get(s2.getId());
        RunnerReceiptIngestRequestDTO zeroSpanReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(s2.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(liveS2.getProfileVersionId())
                .runConfigurationVersionId(liveS2.getRunConfigurationVersionId())
                .scenarioVersionId(liveS2.getScenarioVersionId())
                .resourceProject(liveS2.getResourceProject())
                .sandboxEnforcementConfirmed(false)
                .imageSourceCorrespondence("Unverified")
                .profileAcceptance("Accepted")
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Failed")
                        .scenarioStatus("NotRun")
                        .evidenceStatus("None")
                        .cleanupStatus("Confirmed")
                        .traceQuality("Empty")
                        .mappingStatus("None")
                        .diagnostics(List.of("Container exited during readiness check"))
                        .build())
                .build();
        ReceiptIngestAckDTO zeroAck = runnerReceiptIngestService.ingestRunnerReceiptAck(s2.getId(), zeroSpanReceipt);
        assertThat(zeroAck.getPersistenceStatus()).isEqualTo("COMMITTED");
        assertThat(zeroAck.getPublicationGateStatus()).isEqualTo("SKIPPED_NO_EVIDENCE");
        assertThat(zeroAck.getPromotedLatest()).isFalse();
        assertThat(zeroAck.getEnrichedModelVersionId()).isNull();

        // 3F & 3G. Late receipt after newer static model (rev 3) + blank runnerStateRoot fallback to <tmpdir>/mavis-runner-state
        RuntimeSessionResponseDTO s3 = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfg.revision(), sc.revision(), true, Map.of()));
        RuntimeSession liveS3 = sessionsStore.get(s3.getId());

        // Newer static model becomes latest valid while s3 was running
        baseModel.setIsLatestValid(false);
        ModelVersion newerStatic = ModelVersion.builder()
                .id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot)
                .revision(3).origin("STATIC").isLatestValid(true).build();
        modelsStore.put(newerStatic.getId(), newerStatic);

        RunnerReceiptIngestRequestDTO lateValidReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(s3.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(liveS3.getProfileVersionId())
                .runConfigurationVersionId(liveS3.getRunConfigurationVersionId())
                .scenarioVersionId(liveS3.getScenarioVersionId())
                .resourceProject(liveS3.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .actualImageIds(Map.of("api-gateway", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
                .declaredInstrumentationVersions(Map.of("java", "2.32.0"))
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Completed")
                        .scenarioStatus("Passed")
                        .evidenceStatus("Available")
                        .cleanupStatus("Confirmed")
                        .traceQuality("CompleteForCapturedData")
                        .mappingStatus("Mapped")
                        .trace(RunnerTraceCorrelationDTO.builder()
                                .sessionId(s3.getId().toString())
                                .modelVersionId(baseModelId.toString())
                                .spans(List.of(RunnerCorrelatedSpanDTO.builder()
                                        .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                                        .spanId("8888888888888888")
                                        .parentSpanId("7777777777777777")
                                        .runtimeService("api-gateway")
                                        .modelServiceId(gwEl.getId().toString())
                                        .httpStatusCode(200)
                                        .durationNanoseconds("15000000")
                                        .build()))
                                .causalEdges(List.of())
                                .warnings(List.of())
                                .build())
                        .build())
                .build();

        // Test blank runnerStateRoot outbox import fallback
        Path defaultTmpOutbox = Path.of(System.getProperty("java.io.tmpdir"), "mavis-runner-state", "receipts")
                .toAbsolutePath().normalize();
        Files.createDirectories(defaultTmpOutbox);
        Path outboxFile = defaultTmpOutbox.resolve(liveS3.getResourceProject() + ".json");
        try {
            Files.writeString(outboxFile, objectMapper.writeValueAsString(lateValidReceipt));
            ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", "");
            RuntimeSessionResponseDTO imported = runnerReceiptIngestService.importReceiptFromStateRoot(s3.getId(), null);
            assertThat(imported.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
            assertThat(newerStatic.getIsLatestValid()).as("Newer static model remains latest valid").isTrue();
        } finally {
            Files.deleteIfExists(outboxFile);
            ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempDir.resolve("state-root").toString());
        }

        // 3H. RuntimeRunnerDispatcher honesty check: never fabricates simulated traces when runner is unavailable
        RuntimeRunnerDispatcher dispatcher = new RuntimeRunnerDispatcher(
                runtimeSessionRepository,
                modelElementRepository,
                modelRelationshipRepository,
                runnerReceiptIngestService,
                runtimeSessionService,
                objectMapper
        );
        ReflectionTestUtils.setField(dispatcher, "runnerMode", "DISABLED");
        ReflectionTestUtils.setField(dispatcher, "runnerStateRoot", tempDir.resolve("state-root").toString());
        assertThat(dispatcher.isAllowSimulatedFallback()).isFalse();

        RuntimeSessionResponseDTO s4 = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfg.revision(), sc.revision(), true, Map.of()));
        assertThatThrownBy(() -> dispatcher.dispatchSession(s4.getId()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("No application was executed and no observed trace was generated");

        // 3I. Direct createRuntimeSession API (without RuntimePlanningService) on C#/.NET repo -> emits dotnet8-linux-x64-glibc & passes real C# MAVIS.Runner plan
        Path dotnetDir = Files.createDirectories(tempDir.resolve("direct-dotnet-repo"));
        Files.writeString(dotnetDir.resolve("docker-compose.yml"), """
                services:
                  order-api:
                    image: mcr.microsoft.com/dotnet/aspnet@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
                    expose:
                      - "5000"
                """);
        UUID dotnetPid = UUID.randomUUID();
        UUID dotnetSid = UUID.randomUUID();
        UUID dotnetMid = UUID.randomUUID();
        Project dotnetProj = Project.builder().id(dotnetPid).name("Direct Dotnet Project").build();
        SourceSnapshot dotnetSnap = SourceSnapshot.builder().id(dotnetSid).project(dotnetProj).storagePath(dotnetDir.toString()).artifactHash("dotnet-hash").build();
        ModelVersion dotnetModel = ModelVersion.builder().id(dotnetMid).project(dotnetProj).sourceSnapshot(dotnetSnap).revision(1).origin("STATIC").isLatestValid(true).build();
        ModelElement dotnetEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(dotnetModel).name("OrderApi").elementType("SERVICE_CONTAINER").languageStack("csharp").build();
        projectsStore.put(dotnetPid, dotnetProj);
        snapshotsStore.put(dotnetSid, dotnetSnap);
        modelsStore.put(dotnetMid, dotnetModel);
        elementsByModel.put(dotnetMid, new ArrayList<>(List.of(dotnetEl)));

        RuntimeSessionResponseDTO directSession = runtimeSessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder()
                        .projectId(dotnetPid)
                        .sourceSnapshotId(dotnetSid)
                        .modelVersionId(dotnetMid)
                        .build());
        RunnerDefinitionExportDTO directExport = runtimeSessionService.exportRunDefinition(directSession.getId());
        assertThat(directExport.getConfirmedServiceMappings()).containsEntry("order-api", dotnetEl.getId().toString());
        assertThat(directExport.getProfile().path("applications").path("order-api").path("runtime").asText())
                .isEqualTo("dotnet8-linux-x64-glibc");
        assertThat(directExport.getProfile().path("applications").path("order-api").path("containerPort").asInt())
                .isEqualTo(5000);
        Optional<Path> collectorOpt = locateCollectorYaml();
        if (runnerDllOpt.isPresent() && collectorOpt.isPresent()) {
            Path directDefPath = tempDir.resolve("case3i-direct-def.json");
            Files.writeString(directDefPath, objectMapper.writeValueAsString(directExport));
            CliOutcome directPlan = invokeRealCSharpRunner(runnerDllOpt.get(), "plan", directDefPath.toString(), collectorOpt.get().toString());
            assertThat(directPlan.exitCode()).as("Direct createRuntimeSession C# plan: %s", directPlan.stdout()).isZero();
        }

        // 3J. User-edited {param}, unbound camelCase {{customVar}}, JSONPath extract pointer, >64 mixed-case StartRequest.environment(),
        //     and duplicate approveAndStartSession idempotency on an already-running session
        newerStatic.setIsLatestValid(false);
        baseModel.setIsLatestValid(true);
        ObjectNode profileWithStep1Env = safeStep1Form.deepCopy();
        profileWithStep1Env.putObject("environmentVariables").put("CUSTOM_VAR", "step1-tag-alpha");
        ConfigurationView cfgWithEnv = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", profileWithStep1Env, cfg.revision()));
        ScenarioView userEditedScenario = runtimePlanningService.saveScenario(
                projectId,
                null,
                new ScenarioRequest(
                        "User Edited Edge Case Scenario",
                        List.of(
                                "{\"id\":\"step-1\",\"service\":\"api-gateway\",\"method\":\"POST\",\"path\":\"/api/orders/{orderUuid}?tag={{customVar}}\",\"expectedStatus\":201,\"bodyReference\":\"CREATE_ORDER_BODY\",\"extract\":{\"createdId\":\"$.data.id\"}}",
                                "{\"id\":\"step-2\",\"service\":\"api-gateway\",\"method\":\"GET\",\"path\":\"/api/orders/{{createdId}}\",\"expectedStatus\":200}"
                        ),
                        0));

        Map<String, String> noisyEnv = new LinkedHashMap<>();
        noisyEnv.put("ConnectionStrings__DefaultConnection", "Host=db;Database=orders");
        noisyEnv.put("invalid-lower-key", "ignored");
        for (int i = 0; i < 68; i++) {
            noisyEnv.put("UNREFERENCED_EXTRA_" + i, "val-" + i);
        }

        RuntimeSessionResponseDTO s5 = runtimePlanningService.start(
                projectId,
                new StartRequest(snapshotId, userEditedScenario.id(), cfgWithEnv.revision(), userEditedScenario.revision(), true, noisyEnv));
        RunnerDefinitionExportDTO s5Export = runtimeSessionService.exportRunDefinition(s5.getId());
        var exportedSteps = s5Export.getScenario().path("steps");
        assertThat(exportedSteps).hasSize(2);
        assertThat(exportedSteps.get(0).path("path").asText())
                .isEqualTo("/api/orders/00000000-0000-0000-0000-000000000001?tag={{CUSTOM_VAR}}");
        assertThat(exportedSteps.get(0).path("environmentVariables").path("CUSTOM_VAR").asText())
                .isEqualTo("CUSTOM_VAR");
        assertThat(exportedSteps.get(0).path("extract").path("createdId").asText())
                .isEqualTo("/data/id");
        assertThat(exportedSteps.get(1).path("path").asText())
                .isEqualTo("/api/orders/{{createdId}}");

        bindRunnerHeader(RUNNER_KEY);
        Map<String, String> storedProtectedEnv = environmentService.readForRunner(s5.getId()).values();
        assertThat(storedProtectedEnv.size()).isLessThanOrEqualTo(64);
        assertThat(storedProtectedEnv)
                .containsEntry("CUSTOM_VAR", "step1-tag-alpha")
                .containsKey("CREATE_ORDER_BODY")
                .doesNotContainKey("ConnectionStrings__DefaultConnection")
                .doesNotContainKey("invalid-lower-key");

        // Idempotent duplicate approve when session is already RUNNING must NOT reset executionStatus to READY_FOR_DISPATCH
        RuntimeSession liveS5 = sessionsStore.get(s5.getId());
        liveS5.setExecutionStatus("RUNNING");
        liveS5.setScenarioStatus("RUNNING");
        RuntimeSessionResponseDTO duplicateApprove = runtimeSessionService.approveAndStartSession(s5.getId());
        assertThat(duplicateApprove.getExecutionStatus()).isEqualTo("RUNNING");
        assertThat(liveS5.getExecutionStatus()).isEqualTo("RUNNING");

        if (runnerDllOpt.isPresent() && collectorOpt.isPresent()) {
            ObjectNode s5PlanTree = ((ObjectNode) objectMapper.valueToTree(s5Export)).deepCopy();
            if (s5PlanTree.path("profile") instanceof ObjectNode profObj) {
                profObj.remove("environmentBindings");
            }
            Path s5DefPath = tempDir.resolve("case3j-user-edited-def.json");
            Files.writeString(s5DefPath, objectMapper.writeValueAsString(s5PlanTree));
            CliOutcome s5Plan = invokeRealCSharpRunner(runnerDllOpt.get(), "plan", s5DefPath.toString(), collectorOpt.get().toString());
            assertThat(s5Plan.exitCode()).as("User-edited scenario C# plan: %s", s5Plan.stdout()).isZero();

            // Also execute real C# HttpScenarioRunner (`stdin-scenario`) end-to-end against a live loopback HTTP server
            List<String> observedUris = Collections.synchronizedList(new ArrayList<>());
            var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/api/orders", exchange -> {
                observedUris.add(exchange.getRequestMethod() + " " + exchange.getRequestURI().toString());
                byte[] resp = "{\"data\":{\"id\":\"ord-777\"}}".getBytes(StandardCharsets.UTF_8);
                int code = "POST".equalsIgnoreCase(exchange.getRequestMethod()) ? 201 : 200;
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(code, resp.length);
                try (var os = exchange.getResponseBody()) { os.write(resp); }
            });
            server.start();
            try {
                int port = server.getAddress().getPort();
                ObjectNode envelope = objectMapper.createObjectNode();
                envelope.set("scenario", s5Export.getScenario());
                envelope.putObject("endpoints").put("api-gateway", "http://127.0.0.1:" + port + "/");
                envelope.set("secrets", objectMapper.valueToTree(storedProtectedEnv));

                ProcessBuilder pb = new ProcessBuilder("dotnet", runnerDllOpt.get().toString(), "stdin-scenario");
                pb.environment().put("MAVIS_RUNNER_INTERNAL_NETWORK", "1");
                pb.redirectErrorStream(true);
                Process proc = pb.start();
                try (var stdin = proc.getOutputStream()) {
                    stdin.write(objectMapper.writeValueAsBytes(envelope));
                }
                String out = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
                assertThat(proc.waitFor(20, TimeUnit.SECONDS)).isTrue();
                assertThat(proc.exitValue()).as("Real C# HttpScenarioRunner output: %s", out).isZero();
                assertThat(observedUris).containsExactly(
                        "POST /api/orders/00000000-0000-0000-0000-000000000001?tag=step1-tag-alpha",
                        "GET /api/orders/ord-777");
            } finally {
                server.stop(0);
            }
        }
    }

    @Test
    @DisplayName("CASE 4: Digit-Leading Services, Live Loopback HTTP <-> Real C# MAVIS.Runner (ack-lifecycle/deliver/deliver-pending), Crash Recovery, Multi-Generation Promoted Chain & 8-Thread Concurrency Stress")
    void case4_liveHttpRunnerTransportRecoveryDigitServicesMultiCycleAndConcurrencyStress() throws Exception {
        Optional<Path> runnerDllOpt = locateRunnerDll();
        Optional<Path> collectorOpt = locateCollectorYaml();
        assumeTrue(runnerDllOpt.isPresent() && collectorOpt.isPresent(), "Prebuilt MAVIS.Runner.dll and collector.yaml required");
        Path runnerDll = runnerDllOpt.get();
        Path collectorYaml = collectorOpt.get();

        // =========================================================================
        // 4A. Digit-leading service name (`2fa-service`) -> valid [A-Z][A-Z0-9_]{0,63} env refs & C# plan
        // =========================================================================
        Path repoDir = Files.createDirectories(tempDir.resolve("digit-service-repo"));
        Files.writeString(repoDir.resolve("docker-compose.yml"), """
                services:
                  2fa-service:
                    image: %s
                    expose:
                      - "8080"
                """.formatted(PINNED_APP_IMAGE_1));
        Path srcDir = Files.createDirectories(repoDir.resolve("src/main/java/com/acme/twofa"));
        Files.writeString(srcDir.resolve("TwoFactorController.java"), """
                package com.acme.twofa;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/api/2fa")
                public class TwoFactorController {
                    public record VerifyOtpDto(String otpToken, String deviceId) {}
                    @PostMapping("/verify/{code}")
                    public String verify(@PathVariable String code, @RequestBody VerifyOtpDto dto) { return "ok"; }
                    @GetMapping("/status")
                    public String status() { return "ready"; }
                }
                """);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID baseModelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Digit Service Security Suite").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).artifactHash("2fa-hash").build();
        ModelVersion baseModel = ModelVersion.builder()
                .id(baseModelId).project(project).sourceSnapshot(snapshot)
                .revision(1).origin("STATIC").isLatestValid(true)
                .createdAt(OffsetDateTime.now().minusMinutes(10))
                .build();
        ModelElement twoFaEl = ModelElement.builder()
                .id(UUID.randomUUID()).modelVersion(baseModel)
                .name("2fa-service").elementType("SERVICE_CONTAINER").languageStack("java")
                .build();

        projectsStore.put(projectId, project);
        snapshotsStore.put(snapshotId, snapshot);
        modelsStore.put(baseModelId, baseModel);
        elementsByModel.put(baseModelId, new ArrayList<>(List.of(twoFaEl)));

        ObjectNode step1Form = objectMapper.createObjectNode();
        step1Form.putObject("serviceMappings").put("2fa-service", twoFaEl.getId().toString());
        step1Form.putObject("secretValues").put("TWOFA_MASTER_KEY", "twofa-super-secret-master-key-777");
        ConfigurationView cfg1 = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", step1Form, 0));
        assertThat(cfg1.ready()).isTrue();

        GeneratedScenarioDraftView draft = runtimePlanningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, baseModelId, "Verify 2FA OTP endpoint"));
        assertThat(draft.steps()).isNotEmpty();
        boolean sawVerifyPost = false;
        List<String> serializedSteps = new ArrayList<>();
        for (GeneratedStepDraft st : draft.steps()) {
            if (st.bodyReference() != null) {
                assertThat(st.bodyReference()).matches("[A-Z][A-Z0-9_]{0,63}");
                assertThat(st.bodyReference()).startsWith("SVC_2FA_SERVICE_BODY_");
                sawVerifyPost = true;
            }
            if (st.environmentVariables() != null) {
                st.environmentVariables().forEach((k, v) -> {
                    assertThat(k).matches("[A-Z][A-Z0-9_]{0,63}");
                    assertThat(v).matches("[A-Z][A-Z0-9_]{0,63}");
                });
            }
            ObjectNode stepNode = objectMapper.createObjectNode();
            stepNode.put("id", st.id());
            stepNode.put("service", st.service());
            stepNode.put("method", st.method());
            stepNode.put("path", st.path());
            stepNode.put("expectedStatus", st.expectedStatus());
            stepNode.put("allowClientError", st.allowClientError() == null || st.allowClientError());
            if (st.bodyReference() != null) stepNode.put("bodyReference", st.bodyReference());
            if (st.environmentVariables() != null && !st.environmentVariables().isEmpty()) {
                stepNode.set("environmentVariables", objectMapper.valueToTree(st.environmentVariables()));
            }
            serializedSteps.add(objectMapper.writeValueAsString(stepNode));
        }
        assertThat(sawVerifyPost).as("POST /api/2fa/verify/{code} generated SVC_2FA_SERVICE_BODY_* reference").isTrue();

        ScenarioView sc1 = runtimePlanningService.saveScenario(
                projectId, null, new ScenarioRequest(draft.suggestedName(), serializedSteps, 0));
        RuntimeSessionResponseDTO run1 = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc1.id(), cfg1.revision(), sc1.revision(), true, draft.sampleInputs()));
        assertThat(run1.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");

        RunnerDefinitionExportDTO run1Def = runtimeSessionService.exportRunDefinition(run1.getId());
        ObjectNode run1PlanNode = ((ObjectNode) objectMapper.valueToTree(run1Def)).deepCopy();
        if (run1PlanNode.path("profile") instanceof ObjectNode pNode) pNode.remove("environmentBindings");
        Path run1DefPath = tempDir.resolve("case4a-digit-def.json");
        Files.writeString(run1DefPath, objectMapper.writeValueAsString(run1PlanNode));
        CliOutcome planOut = invokeRealCSharpRunner(runnerDll, "plan", run1DefPath.toString(), collectorYaml.toString());
        assertThat(planOut.exitCode()).as("Digit-leading service C# plan stdout: %s", planOut.stdout()).isZero();

        // =========================================================================
        // 4B. Live Loopback HTTP Transport Between Java & Real C# MAVIS.Runner.dll
        //     (`run-definition`, `protected-environment`, `ack-lifecycle`, `deliver`, `deliver-pending`, `recovery-result`)
        // =========================================================================
        var recoveryController = new com.mavis.analyzer.runtime.controller.RuntimeRecoveryController(
                runtimeSessionRepository, runnerServiceAuthGuard, objectMapper);
        var rowLocks = new java.util.concurrent.ConcurrentHashMap<UUID, java.util.concurrent.locks.ReentrantLock>();
        var executor = java.util.concurrent.Executors.newFixedThreadPool(8);
        var httpServer = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        httpServer.setExecutor(executor);
        httpServer.createContext("/api/v1/analyzer/runtime/sessions/", exchange -> {
            String hdr = exchange.getRequestHeaders().getFirst("X-Mavis-Runner-Key");
            threadRunnerKey.set(hdr == null ? "__NULL__" : hdr);
            int status = 200;
            Object bodyObj;
            try {
                String rel = exchange.getRequestURI().getPath().substring("/api/v1/analyzer/runtime/sessions/".length());
                String[] parts = rel.split("/");
                UUID sid = UUID.fromString(parts[0]);
                String action = parts.length > 1 ? parts[1] : "";
                byte[] reqBytes = exchange.getRequestBody().readAllBytes();
                var lock = rowLocks.computeIfAbsent(sid, k -> new java.util.concurrent.locks.ReentrantLock());
                lock.lock();
                try {
                    bodyObj = switch (action) {
                        case "run-definition" -> com.mavis.common.dto.ApiResponse.success(runtimeSessionService.exportRunDefinition(sid));
                        case "protected-environment" -> com.mavis.common.dto.ApiResponse.success(environmentService.readForRunner(sid));
                        case "lifecycle-ack" -> {
                            RuntimeSessionLifecycleAckRequestDTO req = objectMapper.readValue(reqBytes, RuntimeSessionLifecycleAckRequestDTO.class);
                            yield com.mavis.common.dto.ApiResponse.success(runtimeSessionService.acknowledgeLifecycle(sid, req));
                        }
                        case "ingest-receipt-ack" -> {
                            RunnerReceiptIngestRequestDTO req = objectMapper.readValue(reqBytes, RunnerReceiptIngestRequestDTO.class);
                            yield com.mavis.common.dto.ApiResponse.success(runnerReceiptIngestService.ingestRunnerReceiptAck(sid, req));
                        }
                        case "recovery-result" -> {
                            var req = objectMapper.readValue(reqBytes, com.mavis.analyzer.runtime.controller.RuntimeRecoveryController.Result.class);
                            yield recoveryController.recover(sid, req);
                        }
                        default -> {
                            status = 404;
                            yield com.mavis.common.dto.ApiResponse.error(ErrorCode.NOT_FOUND, "Unknown action: " + action);
                        }
                    };
                } finally {
                    lock.unlock();
                }
            } catch (BusinessException bex) {
                status = switch (bex.getErrorCode()) {
                    case NOT_FOUND -> 404;
                    case FORBIDDEN -> 403;
                    case CONFLICT -> 409;
                    case BAD_REQUEST -> 400;
                    default -> 500;
                };
                bodyObj = com.mavis.common.dto.ApiResponse.error(bex.getErrorCode(), bex.getMessage());
            } catch (Exception ex) {
                status = 500;
                bodyObj = Map.of("code", 500, "message", String.valueOf(ex.getMessage()));
            } finally {
                threadRunnerKey.remove();
            }
            byte[] respBytes = objectMapper.writeValueAsBytes(bodyObj);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, respBytes.length);
            try (var os = exchange.getResponseBody()) {
                os.write(respBytes);
            }
        });
        httpServer.start();
        var httpClient = java.net.http.HttpClient.newHttpClient();
        try {
            String baseUrl = "http://127.0.0.1:" + httpServer.getAddress().getPort();
            Map<String, String> validRunnerEnv = Map.of(
                    "MAVIS_RUNNER_ALLOW_LOCAL_POC", "1",
                    "MAVIS_RUNNER_SERVICE_KEY", RUNNER_KEY
            );
            Map<String, String> wrongRunnerEnv = Map.of(
                    "MAVIS_RUNNER_ALLOW_LOCAL_POC", "1",
                    "MAVIS_RUNNER_SERVICE_KEY", "wrong-forged-service-key"
            );

            // Live HTTP /protected-environment: 403 with wrong key, 200 with valid key & decrypted values
            var unauthEnvResp = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + run1.getId() + "/protected-environment"))
                            .header("X-Mavis-Runner-Key", "wrong-key").GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(unauthEnvResp.statusCode()).isEqualTo(403);

            var authEnvResp = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + run1.getId() + "/protected-environment"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY).GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(authEnvResp.statusCode()).isEqualTo(200);
            JsonNode authEnvJson = objectMapper.readTree(authEnvResp.body());
            assertThat(authEnvJson.path("data").path("values").path("TWOFA_MASTER_KEY").asText())
                    .isEqualTo("twofa-super-secret-master-key-777");

            // Real C# `MAVIS.Runner ack-lifecycle` over live loopback HTTP
            RuntimeSession liveRun1 = sessionsStore.get(run1.getId());
            Path allocatedEventFile = tempDir.resolve("event-allocated.json");
            Files.writeString(allocatedEventFile, objectMapper.writeValueAsString(Map.of(
                    "sessionId", run1.getId().toString(),
                    "modelVersionId", baseModelId.toString(),
                    "sourceSnapshotId", snapshotId.toString(),
                    "profileVersionId", liveRun1.getProfileVersionId(),
                    "runConfigurationVersionId", liveRun1.getRunConfigurationVersionId(),
                    "scenarioVersionId", liveRun1.getScenarioVersionId(),
                    "resourceProject", liveRun1.getResourceProject(),
                    "stage", "ALLOCATED",
                    "sequence", 1,
                    "occurredAt", OffsetDateTime.now().toString()
            )));

            // Forged service key rejected over live HTTP by real C# MAVIS.Runner
            CliOutcome badKeyAck = invokeRealCSharpRunnerWithEnv(runnerDll, wrongRunnerEnv, "ack-lifecycle", baseUrl, allocatedEventFile.toString());
            assertThat(badKeyAck.exitCode()).isNotZero();
            assertThat(liveRun1.getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");

            // Valid ALLOCATED (seq 1) -> RUNNING (seq 2) + duplicate RUNNING replay idempotency
            CliOutcome allocAck = invokeRealCSharpRunnerWithEnv(runnerDll, validRunnerEnv, "ack-lifecycle", baseUrl, allocatedEventFile.toString());
            assertThat(allocAck.exitCode()).as("C# ack-lifecycle ALLOCATED: %s", allocAck.stdout()).isZero();
            assertThat(liveRun1.getExecutionStatus()).isEqualTo("ALLOCATED");
            assertThat(liveRun1.getAllocatedAt()).isNotNull();

            Path runningEventFile = tempDir.resolve("event-running.json");
            Files.writeString(runningEventFile, objectMapper.writeValueAsString(Map.of(
                    "sessionId", run1.getId().toString(),
                    "modelVersionId", baseModelId.toString(),
                    "sourceSnapshotId", snapshotId.toString(),
                    "profileVersionId", liveRun1.getProfileVersionId(),
                    "runConfigurationVersionId", liveRun1.getRunConfigurationVersionId(),
                    "scenarioVersionId", liveRun1.getScenarioVersionId(),
                    "resourceProject", liveRun1.getResourceProject(),
                    "stage", "RUNNING",
                    "sequence", 2,
                    "occurredAt", OffsetDateTime.now().toString()
            )));
            CliOutcome runAck = invokeRealCSharpRunnerWithEnv(runnerDll, validRunnerEnv, "ack-lifecycle", baseUrl, runningEventFile.toString());
            assertThat(runAck.exitCode()).as("C# ack-lifecycle RUNNING: %s", runAck.stdout()).isZero();
            assertThat(liveRun1.getExecutionStatus()).isEqualTo("RUNNING");
            assertThat(liveRun1.getScenarioStatus()).isEqualTo("RUNNING");
            assertThat(liveRun1.getStartedAt()).isNotNull();

            CliOutcome dupRunAck = invokeRealCSharpRunnerWithEnv(runnerDll, validRunnerEnv, "ack-lifecycle", baseUrl, runningEventFile.toString());
            assertThat(dupRunAck.exitCode()).as("Duplicate C# ack-lifecycle RUNNING: %s", dupRunAck.stdout()).isZero();

            // Real C# `correlate` -> write receipt to stateRoot -> real C# `deliver` & `deliver-pending` over live HTTP!
            String traceId1 = "11112222333344445555666677778888";
            Path otlp1 = tempDir.resolve("case4b-otlp.json");
            Files.writeString(otlp1, """
                    {
                      "resourceSpans": [{
                        "resource": { "attributes": [{ "key": "service.name", "value": { "stringValue": "2fa-service" } }] },
                        "scopeSpans": [{ "spans": [{
                          "traceId": "%s",
                          "spanId": "aaaa1111bbbb2222",
                          "parentSpanId": "00f067aa0ba902b7",
                          "kind": "SPAN_KIND_SERVER",
                          "startTimeUnixNano": "1700000000000000000",
                          "endTimeUnixNano": "1700000000045000000",
                          "status": { "code": "STATUS_CODE_OK" },
                          "attributes": [{ "key": "http.response.status_code", "value": { "intValue": 200 } }]
                        }]}]
                      }]
                    }
                    """.formatted(traceId1));
            Path mappings1 = tempDir.resolve("case4b-mappings.json");
            Files.writeString(mappings1, objectMapper.writeValueAsString(run1Def.getConfirmedServiceMappings()));
            CliOutcome corr1 = invokeRealCSharpRunner(
                    runnerDll, "correlate", run1.getId().toString(), baseModelId.toString(), otlp1.toString(), mappings1.toString());
            assertThat(corr1.exitCode()).isZero();
            RunnerTraceCorrelationDTO trace1 = objectMapper.readValue(corr1.stdout(), RunnerTraceCorrelationDTO.class);

            RunnerReceiptIngestRequestDTO receipt1 = buildPassingReceipt(liveRun1, snapshotId, baseModelId, traceId1, trace1);
            Path liveStateRoot = Files.createDirectories(tempDir.resolve("live-http-state")).toAbsolutePath().normalize();
            Path receiptsDir = Files.createDirectories(liveStateRoot.resolve("receipts"));
            Path receipt1Path = receiptsDir.resolve(liveRun1.getResourceProject() + ".json");
            Files.writeString(receipt1Path, objectMapper.writeValueAsString(receipt1));

            CliOutcome deliver1 = invokeRealCSharpRunnerWithEnv(
                    runnerDll, validRunnerEnv, "deliver", baseUrl, liveStateRoot.toString(), liveRun1.getResourceProject());
            assertThat(deliver1.exitCode()).as("Real C# deliver over live HTTP: %s", deliver1.stdout()).isZero();

            Path ack1Path = receiptsDir.resolve(liveRun1.getResourceProject() + ".ack.json");
            assertThat(ack1Path).isRegularFile();
            JsonNode ack1Json = objectMapper.readTree(Files.readString(ack1Path));
            assertThat(ack1Json.path("data").path("persistenceStatus").asText()).isEqualTo("COMMITTED");
            assertThat(ack1Json.path("data").path("publicationGateStatus").asText()).isEqualTo("PROMOTED");
            assertThat(ack1Json.path("data").path("enrichedRevision").asInt()).isEqualTo(2);
            UUID enrichedM2Id = UUID.fromString(ack1Json.path("data").path("enrichedModelVersionId").asText());
            assertThat(baseModel.getIsLatestValid()).as("invalidatePreviousVersions cleared M1.isLatestValid").isFalse();
            assertThat(modelsStore.get(enrichedM2Id).getIsLatestValid()).isTrue();

            // `deliver-pending` validates existing .ack.json idempotently without creating duplicate ModelVersions
            int modelCountAfterDeliver = modelsStore.size();
            CliOutcome deliverPending1 = invokeRealCSharpRunnerWithEnv(
                    runnerDll, validRunnerEnv, "deliver-pending", baseUrl, liveStateRoot.toString());
            assertThat(deliverPending1.exitCode()).as("Real C# deliver-pending: %s", deliverPending1.stdout()).isZero();
            assertThat(modelsStore).hasSize(modelCountAfterDeliver);

            // Terminal session rejects further /protected-environment reads
            var postCompleteEnvResp = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + run1.getId() + "/protected-environment"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY).GET().build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(postCompleteEnvResp.statusCode()).isEqualTo(400);

            // =========================================================================
            // 4C. Crash Recovery via RuntimeRecoveryController (`/recovery-result`) Over Live HTTP
            // =========================================================================
            RuntimeSessionResponseDTO sRec = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg1.revision(), sc1.revision(), true, Map.of()));
            RuntimeSession liveRec = sessionsStore.get(sRec.getId());
            runtimeSessionService.acknowledgeLifecycle(
                    sRec.getId(),
                    RuntimeSessionLifecycleAckRequestDTO.builder()
                            .sessionId(sRec.getId()).resourceProject(liveRec.getResourceProject()).stage("ALLOCATED").build());

            var recPayload = new com.mavis.analyzer.runtime.controller.RuntimeRecoveryController.Result(
                    sRec.getId().toString(),
                    baseModelId.toString(),
                    snapshotId.toString(),
                    liveRec.getProfileVersionId(),
                    liveRec.getRunConfigurationVersionId(),
                    liveRec.getScenarioVersionId(),
                    liveRec.getResourceProject(),
                    "0123456789abcdef0123456789abcdef",
                    "Confirmed",
                    "2026-11-01T13:30:00Z"
            );
            var recResp1 = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + sRec.getId() + "/recovery-result"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY)
                            .header("Content-Type", "application/json")
                            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(recPayload)))
                            .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(recResp1.statusCode()).isEqualTo(200);
            assertThat(objectMapper.readTree(recResp1.body()).path("data").path("persistenceStatus").asText()).isEqualTo("COMMITTED");
            assertThat(liveRec.getExecutionStatus()).isEqualTo("FAILED");
            assertThat(liveRec.getCleanupStatus()).isEqualTo("CONFIRMED");
            assertThat(liveRec.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");

            // Idempotent replay of identical recovery result -> ALREADY_COMMITTED
            var recRespReplay = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + sRec.getId() + "/recovery-result"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY)
                            .header("Content-Type", "application/json")
                            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(recPayload)))
                            .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(recRespReplay.statusCode()).isEqualTo(200);
            assertThat(objectMapper.readTree(recRespReplay.body()).path("data").path("persistenceStatus").asText()).isEqualTo("ALREADY_COMMITTED");

            // Tampered recovery timestamp -> 409 CONFLICT
            var tamperedRec = new com.mavis.analyzer.runtime.controller.RuntimeRecoveryController.Result(
                    recPayload.sessionId(), recPayload.modelVersionId(), recPayload.sourceSnapshotId(),
                    recPayload.profileVersionId(), recPayload.runConfigurationVersionId(), recPayload.scenarioVersionId(),
                    recPayload.resourceProject(), recPayload.recoveryId(), "Confirmed", "2026-11-01T14:00:00Z");
            var recRespConflict = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + sRec.getId() + "/recovery-result"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY)
                            .header("Content-Type", "application/json")
                            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(tamperedRec)))
                            .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(recRespConflict.statusCode()).isEqualTo(409);

            // Late execution receipt after crash recovery -> 409 CONFLICT
            RunnerReceiptIngestRequestDTO lateAfterRec = buildPassingReceipt(liveRec, snapshotId, baseModelId, traceId1, trace1);
            var lateRecResp = httpClient.send(
                    java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + sRec.getId() + "/ingest-receipt-ack"))
                            .header("X-Mavis-Runner-Key", RUNNER_KEY)
                            .header("Content-Type", "application/json")
                            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(lateAfterRec)))
                            .build(),
                    java.net.http.HttpResponse.BodyHandlers.ofString());
            assertThat(lateRecResp.statusCode()).isEqualTo(409);

            // =========================================================================
            // 4D. Stop-Before-Start, Stop-While-Running (`cancel.request`), Unanalyzed Newer Snapshot Coexistence,
            //     and Multi-Generation Sequential `PROMOTED` Chain (rev 1 -> rev 2 -> rev 3 -> rev 4)
            // =========================================================================
            // Stop-before-start (READY_FOR_DISPATCH -> CANCELLED immediately)
            RuntimeSessionResponseDTO sStopBefore = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg1.revision(), sc1.revision(), true, Map.of()));
            RuntimeSessionResponseDTO stoppedBefore = runtimeSessionService.stopSession(sStopBefore.getId());
            assertThat(stoppedBefore.getExecutionStatus()).isEqualTo("CANCELLED");
            assertThat(stoppedBefore.getCleanupStatus()).isEqualTo("NOT_APPLICABLE");
            assertThat(stoppedBefore.getCompletedAt()).isNotNull();

            // Stop-while-running (RUNNING -> CANCELLING + cancel.request file -> Cancelled receipt -> CANCELLED)
            RuntimeSessionResponseDTO sStopRunning = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg1.revision(), sc1.revision(), true, Map.of()));
            RuntimeSession liveStopRunning = sessionsStore.get(sStopRunning.getId());
            runtimeSessionService.acknowledgeLifecycle(sStopRunning.getId(),
                    RuntimeSessionLifecycleAckRequestDTO.builder().sessionId(sStopRunning.getId()).resourceProject(liveStopRunning.getResourceProject()).stage("ALLOCATED").build());
            runtimeSessionService.acknowledgeLifecycle(sStopRunning.getId(),
                    RuntimeSessionLifecycleAckRequestDTO.builder().sessionId(sStopRunning.getId()).resourceProject(liveStopRunning.getResourceProject()).stage("RUNNING").build());
            RuntimeSessionResponseDTO stoppingDto = runtimeSessionService.stopSession(sStopRunning.getId());
            assertThat(stoppingDto.getExecutionStatus()).isEqualTo("CANCELLING");
            assertThat(stoppingDto.getCleanupStatus()).isEqualTo("STOP_REQUESTED");
            assertThat(tempDir.resolve("state-root").resolve(liveStopRunning.getResourceProject()).resolve("cancel.request")).isRegularFile();

            RunnerReceiptIngestRequestDTO cancelledReceipt = RunnerReceiptIngestRequestDTO.builder()
                    .sessionId(sStopRunning.getId().toString())
                    .sourceSnapshotId(snapshotId.toString())
                    .modelVersionId(baseModelId.toString())
                    .profileVersionId(liveStopRunning.getProfileVersionId())
                    .runConfigurationVersionId(liveStopRunning.getRunConfigurationVersionId())
                    .scenarioVersionId(liveStopRunning.getScenarioVersionId())
                    .resourceProject(liveStopRunning.getResourceProject())
                    .sandboxEnforcementConfirmed(true)
                    .imageSourceCorrespondence("Verified")
                    .profileAcceptance("Accepted")
                    .outcome(RunnerOutcomeDTO.builder()
                            .executionStatus("Cancelled")
                            .scenarioStatus("NotRun")
                            .evidenceStatus("Unavailable")
                            .cleanupStatus("Confirmed")
                            .traceQuality("Unavailable")
                            .mappingStatus("Unavailable")
                            .build())
                    .build();
            ReceiptIngestAckDTO cancelledAck = runnerReceiptIngestService.ingestRunnerReceiptAck(sStopRunning.getId(), cancelledReceipt);
            assertThat(cancelledAck.getPublicationGateStatus()).isEqualTo("SKIPPED_NO_EVIDENCE");
            assertThat(liveStopRunning.getExecutionStatus()).isEqualTo("CANCELLED");
            assertThat(liveStopRunning.getScenarioStatus()).isEqualTo("CANCELLED");

            // Newer unanalyzed snapshot uploaded -> passing RUNTIME_ENRICHED M2 into Step 1/Step 2/Step 3 cleanly unwraps to STATIC M1
            UUID unanalyzedSnapshotId = UUID.randomUUID();
            snapshotsStore.put(unanalyzedSnapshotId, SourceSnapshot.builder()
                    .id(unanalyzedSnapshotId).project(project).storagePath(repoDir.toString()).artifactHash("unanalyzed-hash").build());

            ConfigurationView cfg2 = runtimePlanningService.saveConfiguration(
                    projectId, new ConfigurationRequest(snapshotId, enrichedM2Id, "SPRING_BOOT_DOTNET_COMPOSE_V1", step1Form, cfg1.revision()));
            assertThat(cfg2.modelId()).as("saveConfiguration unwraps RUNTIME_ENRICHED M2 -> STATIC M1").isEqualTo(baseModelId);

            GeneratedScenarioDraftView draft2 = runtimePlanningService.generateScenario(
                    projectId, new GenerateScenarioRequest(snapshotId, enrichedM2Id, "Second verification pass"));
            assertThat(draft2.modelId()).as("generateScenario unwraps RUNTIME_ENRICHED M2 -> STATIC M1").isEqualTo(baseModelId);

            RuntimeSessionResponseDTO autoModelSession = runtimeSessionService.createRuntimeSession(
                    RuntimeSessionCreateRequest.builder().projectId(projectId).sourceSnapshotId(snapshotId).modelVersionId(null).build());
            assertThat(autoModelSession.getModelVersionId()).as("createRuntimeSession(null) unwraps latest RUNTIME_ENRICHED -> STATIC M1").isEqualTo(baseModelId);

            // Start an older concurrent session BEFORE Run #2 & Run #3 promote M3 & M4
            RuntimeSessionResponseDTO sConcurrentOld = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg2.revision(), sc1.revision(), true, Map.of()));
            RuntimeSession liveConcurrentOld = sessionsStore.get(sConcurrentOld.getId());
            liveConcurrentOld.setCreatedAt(OffsetDateTime.now().minusMinutes(3));

            // Sequential Run #2 -> PROMOTED M3 (revision 3)
            RuntimeSessionResponseDTO run2 = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg2.revision(), sc1.revision(), true, draft.sampleInputs()));
            RuntimeSession liveRun2 = sessionsStore.get(run2.getId());
            ReceiptIngestAckDTO ack2 = runnerReceiptIngestService.ingestRunnerReceiptAck(
                    run2.getId(), buildPassingReceipt(liveRun2, snapshotId, baseModelId, traceId1, trace1));
            assertThat(ack2.getPublicationGateStatus()).isEqualTo("PROMOTED");
            assertThat(ack2.getEnrichedRevision()).isEqualTo(3);
            UUID enrichedM3Id = ack2.getEnrichedModelVersionId();
            assertThat(modelsStore.get(enrichedM3Id).getBaseModelVersion().getId()).isEqualTo(baseModelId);

            // Sequential Run #3 -> PROMOTED M4 (revision 4), delivered via real C# `deliver-pending`!
            RuntimeSessionResponseDTO run3 = runtimePlanningService.start(
                    projectId, new StartRequest(snapshotId, sc1.id(), cfg2.revision(), sc1.revision(), true, draft.sampleInputs()));
            RuntimeSession liveRun3 = sessionsStore.get(run3.getId());
            Files.writeString(receiptsDir.resolve(liveRun3.getResourceProject() + ".json"),
                    objectMapper.writeValueAsString(buildPassingReceipt(liveRun3, snapshotId, baseModelId, traceId1, trace1)));
            CliOutcome deliverRun3 = invokeRealCSharpRunnerWithEnv(
                    runnerDll, validRunnerEnv, "deliver-pending", baseUrl, liveStateRoot.toString());
            assertThat(deliverRun3.exitCode()).as("Run #3 C# deliver-pending: %s", deliverRun3.stdout()).isZero();
            JsonNode ack3Json = objectMapper.readTree(Files.readString(receiptsDir.resolve(liveRun3.getResourceProject() + ".ack.json")));
            assertThat(ack3Json.path("data").path("publicationGateStatus").asText()).isEqualTo("PROMOTED");
            assertThat(ack3Json.path("data").path("enrichedRevision").asInt()).isEqualTo(4);
            UUID enrichedM4Id = UUID.fromString(ack3Json.path("data").path("enrichedModelVersionId").asText());

            // Older concurrent session finishing AFTER M4 was promoted is held as HELD_NON_PROMOTED (revision 5), keeping M4 latest!
            ReceiptIngestAckDTO lateConcurrentAck = runnerReceiptIngestService.ingestRunnerReceiptAck(
                    sConcurrentOld.getId(), buildPassingReceipt(liveConcurrentOld, snapshotId, baseModelId, traceId1, trace1));
            assertThat(lateConcurrentAck.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
            assertThat(lateConcurrentAck.getPromotedLatest()).isFalse();
            assertThat(lateConcurrentAck.getEnrichedRevision()).isEqualTo(5);

            List<ModelVersion> latestValidModels = modelsStore.values().stream()
                    .filter(m -> projectId.equals(m.getProject().getId()) && Boolean.TRUE.equals(m.getIsLatestValid()))
                    .toList();
            assertThat(latestValidModels).hasSize(1);
            assertThat(latestValidModels.get(0).getId()).isEqualTo(enrichedM4Id);

            // =========================================================================
            // 4E. 8-Thread Concurrency Stress on `approveAndStartSession` & Live HTTP `/ingest-receipt-ack`
            // =========================================================================
            RuntimeSessionResponseDTO sConc = runtimeSessionService.createRuntimeSession(
                    RuntimeSessionCreateRequest.builder()
                            .projectId(projectId).sourceSnapshotId(snapshotId).modelVersionId(baseModelId)
                            .scenarioName("Concurrency Stress Scenario")
                            .build());
            UUID concId = sConc.getId();
            var concLock = rowLocks.computeIfAbsent(concId, k -> new java.util.concurrent.locks.ReentrantLock());

            int threads = 8;
            var startGate = new java.util.concurrent.CountDownLatch(1);
            var approvePool = java.util.concurrent.Executors.newFixedThreadPool(threads);
            try {
                List<java.util.concurrent.Future<RuntimeSessionResponseDTO>> approveFutures = new ArrayList<>();
                for (int i = 0; i < threads; i++) {
                    approveFutures.add(approvePool.submit(() -> {
                        startGate.await(5, TimeUnit.SECONDS);
                        concLock.lock();
                        try {
                            return runtimeSessionService.approveAndStartSession(concId);
                        } finally {
                            concLock.unlock();
                        }
                    }));
                }
                startGate.countDown();
                for (var f : approveFutures) {
                    assertThat(f.get(15, TimeUnit.SECONDS).getExecutionStatus()).isEqualTo("READY_FOR_DISPATCH");
                }

                RuntimeSession liveConc = sessionsStore.get(concId);
                String concReceiptBody = objectMapper.writeValueAsString(
                        buildPassingReceipt(liveConc, snapshotId, baseModelId, traceId1, trace1));
                var ingestGate = new java.util.concurrent.CountDownLatch(1);
                List<java.util.concurrent.Future<JsonNode>> ingestFutures = new ArrayList<>();
                for (int i = 0; i < threads; i++) {
                    ingestFutures.add(approvePool.submit(() -> {
                        ingestGate.await(5, TimeUnit.SECONDS);
                        var resp = httpClient.send(
                                java.net.http.HttpRequest.newBuilder(java.net.URI.create(baseUrl + "/api/v1/analyzer/runtime/sessions/" + concId + "/ingest-receipt-ack"))
                                        .header("X-Mavis-Runner-Key", RUNNER_KEY)
                                        .header("Content-Type", "application/json")
                                        .POST(java.net.http.HttpRequest.BodyPublishers.ofString(concReceiptBody))
                                        .build(),
                                java.net.http.HttpResponse.BodyHandlers.ofString());
                        assertThat(resp.statusCode()).isEqualTo(200);
                        return objectMapper.readTree(resp.body()).path("data");
                    }));
                }
                ingestGate.countDown();

                int committedCount = 0;
                int alreadyCommittedCount = 0;
                Set<String> digests = new HashSet<>();
                Set<String> enrichedIds = new HashSet<>();
                for (var f : ingestFutures) {
                    JsonNode ackData = f.get(15, TimeUnit.SECONDS);
                    String pStatus = ackData.path("persistenceStatus").asText();
                    if ("COMMITTED".equals(pStatus)) committedCount++;
                    else if ("ALREADY_COMMITTED".equals(pStatus)) alreadyCommittedCount++;
                    digests.add(ackData.path("receiptDigest").asText());
                    enrichedIds.add(ackData.path("enrichedModelVersionId").asText());
                }
                assertThat(committedCount).isEqualTo(1);
                assertThat(alreadyCommittedCount).isEqualTo(threads - 1);
                assertThat(digests).hasSize(1);
                assertThat(enrichedIds).hasSize(1);

                long modelsForConcSession = modelsStore.values().stream()
                        .filter(m -> m.getRuntimeSession() != null && concId.equals(m.getRuntimeSession().getId()))
                        .count();
                assertThat(modelsForConcSession).isEqualTo(1);
            } finally {
                approvePool.shutdownNow();
            }
        } finally {
            httpServer.stop(0);
            executor.shutdownNow();
        }
    }

    private RunnerReceiptIngestRequestDTO buildPassingReceipt(
            RuntimeSession session,
            UUID snapshotId,
            UUID baseModelId,
            String traceId,
            RunnerTraceCorrelationDTO csharpTrace
    ) {
        ObjectNode scenarioJson = objectMapper.createObjectNode();
        scenarioJson.put("sessionId", session.getId().toString()).put("status", "Passed");
        scenarioJson.putArray("steps").addObject()
                .put("stepId", "step-1").put("status", "Passed").put("statusCode", 200)
                .put("traceId", traceId).put("parentSpanId", "00f067aa0ba902b7").put("elapsedMilliseconds", 45);
        RunnerTraceCorrelationDTO scopedTrace = RunnerTraceCorrelationDTO.builder()
                .sessionId(session.getId().toString())
                .modelVersionId(baseModelId.toString())
                .spans(csharpTrace.getSpans())
                .causalEdges(csharpTrace.getCausalEdges())
                .warnings(csharpTrace.getWarnings())
                .build();
        return RunnerReceiptIngestRequestDTO.builder()
                .sessionId(session.getId().toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(baseModelId.toString())
                .profileVersionId(session.getProfileVersionId())
                .runConfigurationVersionId(session.getRunConfigurationVersionId())
                .scenarioVersionId(session.getScenarioVersionId())
                .resourceProject(session.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("Verified")
                .profileAcceptance("Accepted")
                .actualImageIds(Map.of("2fa-service", "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
                .declaredInstrumentationVersions(Map.of("java", "2.32.0"))
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("Completed")
                        .scenarioStatus("Passed")
                        .evidenceStatus("Available")
                        .cleanupStatus("Confirmed")
                        .traceQuality("CompleteForCapturedData")
                        .mappingStatus("Mapped")
                        .scenario(scenarioJson)
                        .trace(scopedTrace)
                        .build())
                .build();
    }

    @Test
    @DisplayName("CASE 5: Multi-DB Colliding Secrets, Split Actuator Management Port, ${VAR} Templates & >64 EnvironmentBindings Pruning Integrity")
    void case5_multiDbCollidingSecretsManagementPortTemplatesAndOver64BindingsBudget() throws Exception {
        Optional<Path> runnerDllOpt = locateRunnerDll();
        assumeTrue(runnerDllOpt.isPresent(), "Prebuilt MAVIS.Runner.dll required");
        Path runnerDll = runnerDllOpt.get();

        Path repoDir = Files.createDirectories(tempDir.resolve("multidb-overflow-repo"));
        Files.writeString(repoDir.resolve("docker-compose.yml"), """
                services:
                  2fa-service:
                    image: %s
                    ports:
                      - "8080:8080"
                    environment:
                      JWT_SECRET: secret-for-2fa-service-11111111
                      SPRING_DATASOURCE_URL: jdbc:postgresql://auth-db:5432/${POSTGRES_DB:-auth_fallback}
                    depends_on:
                      - auth-db
                  billing-service:
                    image: %s
                    ports:
                      - "8082:8082"
                    environment:
                      JWT_SECRET: secret-for-billing-service-22222222
                    depends_on:
                      - billing-db
                  auth-db:
                    image: %s
                    environment:
                      POSTGRES_DB: auth_prod
                      POSTGRES_USER: auth_user
                      POSTGRES_PASSWORD: auth-db-password-alpha-123
                  billing-db:
                    image: %s
                    environment:
                      POSTGRES_DB: billing_prod
                      POSTGRES_USER: billing_user
                      POSTGRES_PASSWORD: billing-db-password-beta-456
                """.formatted(PINNED_APP_IMAGE_1, PINNED_APP_IMAGE_2, PINNED_POSTGRES_IMAGE, PINNED_POSTGRES_IMAGE));

        Path twoFaRes = Files.createDirectories(repoDir.resolve("2fa-service/src/main/resources"));
        Files.writeString(twoFaRes.resolve("application.yml"), """
                server:
                  port: 8080
                management:
                  server:
                    port: 9091
                  endpoints:
                    web:
                      exposure:
                        include: health
                """);
        Path twoFaSrc = Files.createDirectories(repoDir.resolve("2fa-service/src/main/java/com/acme/twofa"));
        Files.writeString(twoFaSrc.resolve("OtpController.java"), """
                package com.acme.twofa;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/api/otp")
                public class OtpController {
                    public record OtpBody(String code, String channel) {}
                    @PostMapping("/send/{userId}")
                    public String send(@PathVariable String userId, @RequestBody OtpBody body) { return "sent"; }
                }
                """);
        Path billingSrc = Files.createDirectories(repoDir.resolve("billing-service/src/main/java/com/acme/bill"));
        Files.writeString(billingSrc.resolve("BillingController.java"), """
                package com.acme.bill;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/api/billing")
                public class BillingController {
                    public record ChargeBody(String accountId, int amountCents) {}
                    @PostMapping("/charge")
                    public String charge(@RequestBody ChargeBody body) { return "charged"; }
                }
                """);

        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID baseModelId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Multi-DB Overflow Suite").build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(snapshotId).project(project).storagePath(repoDir.toString()).artifactHash("mdb-hash").build();
        ModelVersion baseModel = ModelVersion.builder().id(baseModelId).project(project).sourceSnapshot(snapshot).revision(1).origin("STATIC").isLatestValid(true).build();
        ModelElement twoFaEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("2fa-service").elementType("SERVICE_CONTAINER").languageStack("java").build();
        ModelElement billEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel).name("billing-service").elementType("SERVICE_CONTAINER").languageStack("java").build();

        projectsStore.put(projectId, project);
        snapshotsStore.put(snapshotId, snapshot);
        modelsStore.put(baseModelId, baseModel);
        elementsByModel.put(baseModelId, new ArrayList<>(List.of(twoFaEl, billEl)));

        // Step 1A: First verify multi-DB colliding secrets & split management.server.port isolation without overflow
        ObjectNode baseStep1 = objectMapper.createObjectNode();
        baseStep1.putObject("serviceMappings")
                .put("2fa-service", twoFaEl.getId().toString())
                .put("billing-service", billEl.getId().toString());
        ConfigurationView cfgClean = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", baseStep1, 0));
        GeneratedScenarioDraftView gen = runtimePlanningService.generateScenario(
                projectId, new GenerateScenarioRequest(snapshotId, baseModelId, "Verify OTP and Billing"));
        List<String> stepRows = new ArrayList<>();
        for (GeneratedStepDraft st : gen.steps()) {
            ObjectNode sn = objectMapper.createObjectNode();
            sn.put("id", st.id()).put("service", st.service()).put("method", st.method())
                    .put("path", st.path()).put("expectedStatus", st.expectedStatus())
                    .put("allowClientError", st.allowClientError() == null || st.allowClientError());
            if (st.bodyReference() != null) sn.put("bodyReference", st.bodyReference());
            if (st.environmentVariables() != null && !st.environmentVariables().isEmpty()) {
                sn.set("environmentVariables", objectMapper.valueToTree(st.environmentVariables()));
            }
            stepRows.add(objectMapper.writeValueAsString(sn));
        }
        ScenarioView sc = runtimePlanningService.saveScenario(projectId, null, new ScenarioRequest("Multi-DB Smoke", stepRows, 0));

        RuntimeSessionResponseDTO sClean = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfgClean.revision(), sc.revision(), true, gen.sampleInputs()));
        Map<String, String> cleanEnv = environmentService.readForRunner(sClean.getId()).values();
        assertThat(cleanEnv.values())
                .as("Both colliding JWT_SECRET and POSTGRES_PASSWORD values preserved without cross-service overwrite")
                .contains(
                        "secret-for-2fa-service-11111111",
                        "secret-for-billing-service-22222222",
                        "auth-db-password-alpha-123",
                        "billing-db-password-beta-456"
                );
        assertThat(cleanEnv).containsEntry("MANAGEMENT_SERVER_PORT", "8080");

        // Step 1B: Inject 70 distinct user environmentVariables (>64 Runner cap!) + relocated secrets + scenario body/param refs
        ObjectNode overflowStep1 = baseStep1.deepCopy();
        ObjectNode envOverrides = overflowStep1.putObject("environmentVariables");
        for (int i = 1; i <= 70; i++) {
            envOverrides.put(String.format("CUSTOM_CFG_%02d", i), "override-val-" + i);
        }
        ConfigurationView cfgOverflow = runtimePlanningService.saveConfiguration(
                projectId, new ConfigurationRequest(snapshotId, baseModelId, "SPRING_BOOT_DOTNET_COMPOSE_V1", overflowStep1, cfgClean.revision()));
        RuntimeSessionResponseDTO sOverflow = runtimePlanningService.start(
                projectId, new StartRequest(snapshotId, sc.id(), cfgOverflow.revision(), sc.revision(), true, gen.sampleInputs()));

        RunnerDefinitionExportDTO overflowDef = runtimeSessionService.exportRunDefinition(sOverflow.getId());
        Map<String, String> overflowEnv = environmentService.readForRunner(sOverflow.getId()).values();
        assertThat(overflowEnv).hasSize(64);

        // Preflight check via real C# MAVIS.Runner.dll on the remediated composeYaml
        Path overflowCompose = tempDir.resolve("case5-overflow-compose.yml");
        Files.writeString(overflowCompose, overflowDef.getComposeYaml());
        CliOutcome preCli = invokeRealCSharpRunner(runnerDll, "preflight", overflowCompose.toString());
        assertThat(preCli.exitCode()).as("C# preflight on multi-DB compose: %s", preCli.stdout()).isZero();
        JsonNode preJson = objectMapper.readTree(preCli.stdout());
        Set<String> preflightServices = new HashSet<>();
        preJson.path("services").forEach(n -> preflightServices.add(n.asText()));

        // Verify 100% referential integrity for C# ComposeOverrideBuilder.Build:
        // EVERY remaining binding in profile.environmentBindings MUST target a known Compose service AND exist in overflowEnv!
        JsonNode exportedBindings = overflowDef.getProfile().path("environmentBindings");
        assertThat(exportedBindings.isObject()).isTrue();
        exportedBindings.fields().forEachRemaining(svcEntry -> {
            assertThat(preflightServices).contains(svcEntry.getKey());
            assertThat(svcEntry.getValue().size()).isLessThanOrEqualTo(64);
            for (JsonNode b : svcEntry.getValue()) {
                String name = b.path("name").asText();
                String ref = b.path("reference").asText();
                assertThat(name).matches("[A-Z][A-Z0-9_]{0,63}");
                assertThat(overflowEnv)
                        .as("Binding %s -> %s on service %s must exist in capped 64-key protected environment", name, ref, svcEntry.getKey())
                        .containsKey(ref);
            }
        });

        // Verify 100% referential integrity for C# HttpScenarioRunner:
        // EVERY scenario step bodyReference / environmentVariables / envHeaders MUST ALSO exist in overflowEnv!
        for (JsonNode st : overflowDef.getScenario().path("steps")) {
            if (st.hasNonNull("bodyReference")) {
                assertThat(overflowEnv).containsKey(st.get("bodyReference").asText());
            }
            if (st.path("environmentVariables").isObject()) {
                st.path("environmentVariables").elements().forEachRemaining(v -> assertThat(overflowEnv).containsKey(v.asText()));
            }
            if (st.path("envHeaders").isArray()) {
                st.path("envHeaders").forEach(h -> assertThat(overflowEnv).containsKey(h.path("reference").asText()));
            }
        }
    }
}
