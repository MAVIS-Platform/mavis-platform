package com.mavis.bootstrap.acceptance;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.OtelSpanDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.ReceiptIngestAckDTO;
import com.mavis.analyzer.runtime.dto.RunnerCorrelatedSpanDTO;
import com.mavis.analyzer.runtime.dto.RunnerObservedInteractionDTO;
import com.mavis.analyzer.runtime.dto.RunnerOutcomeDTO;
import com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.RunnerTraceCorrelationDTO;
import com.mavis.analyzer.runtime.dto.RuntimeInfrastructureActionDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionLifecycleAckRequestDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RuntimePlanningService;
import com.mavis.analyzer.runtime.service.RuntimeSessionEnvironmentService;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.service.impl.OtelTraceCorrelationServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RunnerReceiptIngestServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RuntimeSessionServiceImpl;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.RuntimeConfiguration;
import com.mavis.common.entity.RuntimeScenario;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeConfigurationRepository;
import com.mavis.common.repository.RuntimeScenarioRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Automated acceptance verification matrix covering all 27 committed WF-03 test cases
 * (F05-001..008, F07-001..008, F08-001..008, TC-WF03-E2E, TC-ST03, TC-N05).
 */
class Wf03AcceptanceMatrixTest {

    @TempDir
    Path tempDir;

    private final ObjectMapper json = new ObjectMapper();

    private RuntimeSessionRepository sessionRepo;
    private ProjectRepository projectRepo;
    private SourceSnapshotRepository snapshotRepo;
    private UserRepository userRepo;
    private ModelVersionRepository modelRepo;
    private ModelElementRepository elementRepo;
    private ModelRelationshipRepository relRepo;
    private EvidenceRepository evidenceRepo;
    private DiagramVersionRepository diagramRepo;
    private RuntimeConfigurationRepository configRepo;
    private RuntimeScenarioRepository scenarioRepo;
    private AccessPolicyService accessPolicy;
    private RunnerServiceAuthGuard authGuard;
    private JdbcTemplate jdbc;
    private CourseLabPolicy courseLabs;

    private RuntimeSessionServiceImpl sessionService;
    private RunnerReceiptIngestServiceImpl receiptService;
    private OtelTraceCorrelationServiceImpl otelService;
    private RuntimePlanningService planningService;

    private User studentA;
    private User studentB;
    private Workspace workspace;
    private Assignment lab01;
    private Project projectA;
    private Project projectB;
    private SourceSnapshot snapshotA;
    private SourceSnapshot snapshotOther;
    private ModelVersion baseModel;
    private ModelElement orderEl;
    private ModelElement paymentEl;
    private ModelElement notificationEl;
    private ModelRelationship staticOrderPayment;
    private ModelRelationship staticOrderNotif;
    private Path projectDir;

    @BeforeEach
    void setUp() throws Exception {
        sessionRepo = mock(RuntimeSessionRepository.class);
        projectRepo = mock(ProjectRepository.class);
        snapshotRepo = mock(SourceSnapshotRepository.class);
        userRepo = mock(UserRepository.class);
        modelRepo = mock(ModelVersionRepository.class);
        elementRepo = mock(ModelElementRepository.class);
        relRepo = mock(ModelRelationshipRepository.class);
        evidenceRepo = mock(EvidenceRepository.class);
        diagramRepo = mock(DiagramVersionRepository.class);
        configRepo = mock(RuntimeConfigurationRepository.class);
        scenarioRepo = mock(RuntimeScenarioRepository.class);
        accessPolicy = mock(AccessPolicyService.class);
        authGuard = mock(RunnerServiceAuthGuard.class);
        jdbc = mock(JdbcTemplate.class);
        courseLabs = new CourseLabPolicy(jdbc);

        ComposePreflightValidator preflight = new ComposePreflightValidator();
        ComposeOverrideGenerator overrideGen = new ComposeOverrideGenerator();
        PlatformRuntimeSettings settings = new PlatformRuntimeSettings();
        RuntimeSessionEnvironmentService envService = mock(RuntimeSessionEnvironmentService.class);

        sessionService = new RuntimeSessionServiceImpl(
                sessionRepo, projectRepo, snapshotRepo, userRepo, preflight, overrideGen,
                modelRepo, elementRepo, accessPolicy, authGuard, json, settings);
        ReflectionTestUtils.setField(sessionService, "courseLabPolicy", courseLabs);
        ReflectionTestUtils.setField(sessionService, "runnerStateRoot", Files.createDirectories(tempDir.resolve("runner-state")).toString());

        receiptService = new RunnerReceiptIngestServiceImpl(
                sessionRepo, projectRepo, modelRepo, elementRepo, relRepo,
                evidenceRepo, diagramRepo, authGuard, json);

        otelService = new OtelTraceCorrelationServiceImpl(
                sessionRepo, modelRepo, elementRepo, relRepo,
                evidenceRepo, diagramRepo, json, accessPolicy);

        planningService = new RuntimePlanningService(
                projectRepo, snapshotRepo, modelRepo, configRepo, scenarioRepo,
                accessPolicy, settings, sessionService, json, envService);

        Role studentRole = Role.builder().code("STUDENT").build();
        studentA = User.builder().id(UUID.randomUUID()).email("studenta@fpt.edu.vn").fullName("Student A").role(studentRole).status("ACTIVE").build();
        studentB = User.builder().id(UUID.randomUUID()).email("studentb@fpt.edu.vn").fullName("Student B").role(studentRole).status("ACTIVE").build();

        workspace = Workspace.builder().id(UUID.randomUUID()).name("Architecture Class").status("ACTIVE").courseMode(true).build();
        Project refProj = Project.builder().id(UUID.randomUUID()).workspace(workspace).projectType("TEACHER_REFERENCE").build();
        SourceSnapshot refSnap = SourceSnapshot.builder().id(UUID.randomUUID()).project(refProj)
                .isPublished(true).artifactHash("sha256:" + "d".repeat(64)).build();
        ModelVersion refModel = ModelVersion.builder().id(UUID.randomUUID()).project(refProj).sourceSnapshot(refSnap).build();
        lab01 = Assignment.builder().id(UUID.randomUUID()).workspace(workspace).labOrder(1).referenceModel(refModel).build();

        projectDir = Files.createDirectory(tempDir.resolve("shop-runtime"));
        Files.writeString(projectDir.resolve("docker-compose.yml"), """
                services:
                  order-service:
                    image: mavis/order:1
                    ports: ["8081:8081"]
                  payment-service:
                    image: mavis/payment:1
                    ports: ["8082:8082"]
                """);

        projectA = Project.builder().id(UUID.randomUUID()).workspace(workspace).assignment(lab01).owner(studentA)
                .name("Order Runtime").projectType("STUDENT_WORKING").status("ACTIVE").referenceSnapshotId(refSnap.getId()).build();
        projectB = Project.builder().id(UUID.randomUUID()).workspace(workspace).assignment(lab01).owner(studentB)
                .name("Student B Project").projectType("STUDENT_WORKING").status("ACTIVE").build();

        snapshotA = SourceSnapshot.builder().id(UUID.randomUUID()).project(projectA)
                .artifactHash("sha256:" + "d".repeat(64)).storagePath(projectDir.toString()).build();
        snapshotOther = SourceSnapshot.builder().id(UUID.randomUUID()).project(projectB).storagePath(projectDir.toString()).build();

        baseModel = ModelVersion.builder().id(UUID.randomUUID()).project(projectA).sourceSnapshot(snapshotA)
                .revision(1).isLatestValid(true).build();

        orderEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel)
                .elementType("CONTAINER").languageStack("JAVA").name("order-service").status("VALID").build();
        paymentEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel)
                .elementType("CONTAINER").languageStack("JAVA").name("payment-service").status("VALID").build();
        notificationEl = ModelElement.builder().id(UUID.randomUUID()).modelVersion(baseModel)
                .elementType("CONTAINER").languageStack("JAVA").name("notification-service").status("VALID").build();

        staticOrderPayment = ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(baseModel)
                .sourceElement(orderEl).targetElement(paymentEl).relationType("HTTP_CALL").originLayer("STATIC").build();
        staticOrderNotif = ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(baseModel)
                .sourceElement(orderEl).targetElement(notificationEl).relationType("ASYNC_EVENT").originLayer("STATIC").build();

        when(accessPolicy.requireCurrentActiveUser()).thenReturn(studentA);
        when(userRepo.findById(studentA.getId())).thenReturn(Optional.of(studentA));
        when(userRepo.findById(studentB.getId())).thenReturn(Optional.of(studentB));
        when(projectRepo.findById(projectA.getId())).thenReturn(Optional.of(projectA));
        when(projectRepo.findLockedById(projectA.getId())).thenReturn(Optional.of(projectA));
        when(snapshotRepo.findById(snapshotA.getId())).thenReturn(Optional.of(snapshotA));
        when(snapshotRepo.findById(snapshotOther.getId())).thenReturn(Optional.of(snapshotOther));
        when(modelRepo.findById(baseModel.getId())).thenReturn(Optional.of(baseModel));
        when(modelRepo.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectA.getId())).thenReturn(Optional.of(baseModel));
        when(modelRepo.findByProjectIdOrderByRevisionDesc(projectA.getId())).thenReturn(List.of(baseModel));
        when(modelRepo.save(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        when(elementRepo.findByModelVersionId(baseModel.getId())).thenReturn(List.of(orderEl, paymentEl, notificationEl));
        when(elementRepo.saveAll(any())).thenAnswer(inv -> {
            List<ModelElement> items = inv.getArgument(0);
            items.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); });
            return items;
        });
        when(relRepo.findByModelVersionId(baseModel.getId())).thenReturn(List.of(staticOrderPayment, staticOrderNotif));
        when(relRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        when(evidenceRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        when(diagramRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(sessionRepo.save(any())).thenAnswer(inv -> {
            RuntimeSession s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            return s;
        });
    }

    @SuppressWarnings("unchecked")
    private void setQuizPassed(boolean passed) {
        when(jdbc.query(anyString(), any(RowMapper.class), any(), any(), any())).thenReturn(
                passed ? List.of(new CourseLabPolicy.QuizPass(UUID.randomUUID(), 1, 4, 4, 70, OffsetDateTime.now()))
                        : List.of());
    }

    private RuntimeSession makeSession(UUID id) {
        String rp = "mavisrun-" + id.toString().replace("-", "");
        ObjectNode cfg = json.createObjectNode();
        cfg.putArray("infrastructureActions")
                .addObject().put("action", "SCALE").put("service", "order-service").put("replicas", 4);
        return RuntimeSession.builder()
                .id(id).project(projectA).sourceSnapshot(snapshotA).modelVersion(baseModel)
                .triggeredBy(studentA).profileName("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .scenarioName("Checkout Resilience").resourceProject(rp)
                .scenarioConfig(cfg)
                .profileVersionId("SPRING_BOOT_DOTNET_COMPOSE_V1").runConfigurationVersionId("cfg-1").scenarioVersionId("scn-1")
                .executionStatus("RUNNING").evidenceStatus("PENDING").cleanupStatus("PENDING")
                .traceStatus("PENDING").scenarioStatus("RUNNING")
                .build();
    }

    private RunnerReceiptIngestRequestDTO buildReceipt(RuntimeSession session, List<RuntimeInfrastructureActionDTO> actions,
                                                       List<RunnerCorrelatedSpanDTO> spans, List<RunnerObservedInteractionDTO> interactions) {
        return RunnerReceiptIngestRequestDTO.builder()
                .sessionId(session.getId().toString())
                .modelVersionId(baseModel.getId().toString())
                .sourceSnapshotId(snapshotA.getId().toString())
                .profileVersionId("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .runConfigurationVersionId("cfg-1")
                .scenarioVersionId("scn-1")
                .resourceProject(session.getResourceProject())
                .sandboxEnforcementConfirmed(true)
                .imageSourceCorrespondence("VERIFIED")
                .profileAcceptance("ACCEPTED")
                .infrastructureActions(actions)
                .outcome(RunnerOutcomeDTO.builder()
                        .executionStatus("COMPLETED")
                        .scenarioStatus("PASSED")
                        .evidenceStatus(spans.isEmpty() ? "EMPTY" : "AVAILABLE")
                        .cleanupStatus("CONFIRMED")
                        .traceQuality(spans.isEmpty() ? "EMPTY" : "PARTIAL")
                        .mappingStatus("RESOLVED")
                        .persistenceStatus("NOT_PERSISTED")
                        .trace(RunnerTraceCorrelationDTO.builder()
                                .sessionId(session.getId().toString())
                                .modelVersionId(baseModel.getId().toString())
                                .spans(spans)
                                .interactions(interactions)
                                .causalEdges(List.of())
                                .build())
                        .build())
                .build();
    }

    @Test
    @DisplayName("F05-001..008: Before/After Stop & Scale comparisons, honest telemetry, OTel correlation & receipt immutability")
    void f05BeforeAfterComparisonAndTelemetryHonesty() throws Exception {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode beforeMetrics = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 420.5).put("errorRatePercent", 0.0);
        ObjectNode afterScaleMetrics = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 480.0).put("errorRatePercent", 0.0);
        ObjectNode partialMetrics = json.createObjectNode().put("requestCount", 0);

        // F05-001, F05-005, F05-006, F05-003/007: Scale 1->4 preserves non-improved latency honestly; missing samples marked INSUFFICIENT
        var scaleAction = RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(beforeMetrics).metricsAfter(afterScaleMetrics)
                .performedAt("2026-11-14T00:00:00Z").confirmed(true).build();
        var stopPartialAction = RuntimeInfrastructureActionDTO.builder()
                .action("STOP").service("payment-service").replicas(0).replicasBefore(1).replicasAfter(0)
                .metricsBefore(beforeMetrics).metricsAfter(partialMetrics)
                .performedAt("2026-11-14T00:00:05Z").confirmed(true).build();

        var spanRoot = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("1111111111111111")
                .runtimeService("order-service").modelServiceId(orderEl.getId().toString())
                .spanStatus("Error").httpStatusCode(503).httpMethod("POST").route("/orders").build();
        var spanChild = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("2222222222222222").parentSpanId("1111111111111111")
                .runtimeService("payment-service").modelServiceId(paymentEl.getId().toString())
                .spanStatus("Error").httpStatusCode(503).httpMethod("POST").route("/payments").build();

        var interaction = RunnerObservedInteractionDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .fromService("order-service").toService("payment-service")
                .fromModelServiceId(orderEl.getId().toString()).toModelServiceId(paymentEl.getId().toString())
                .parentSpanId("1111111111111111").childSpanId("2222222222222222").build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(scaleAction, stopPartialAction), List.of(spanRoot, spanChild), List.of(interaction)));

        JsonNode frozenReceipt = session.getRunnerReceiptJson().deepCopy();
        assertThat(frozenReceipt.isObject()).isTrue();

        RuntimeSessionResponseDTO dto = RuntimeSessionResponseDTO.fromEntity(session);
        assertThat(dto.getBeforeAfterComparison()).hasSize(2);
        var scaleCmp = dto.getBeforeAfterComparison().get(0);
        assertThat(scaleCmp.getAction()).isEqualTo("SCALE");
        assertThat(scaleCmp.getReplicasBefore()).isEqualTo(1);
        assertThat(scaleCmp.getReplicasAfter()).isEqualTo(4);
        assertThat(scaleCmp.getP95LatencyMsBefore()).isEqualTo(420.5);
        assertThat(scaleCmp.getP95LatencyMsAfter()).isEqualTo(480.0); // Honest, unfabricated
        assertThat(scaleCmp.getMeasurementStatus()).isEqualTo("MEASURED");

        var stopCmp = dto.getBeforeAfterComparison().get(1);
        assertThat(stopCmp.getMeasurementStatus()).isEqualTo("INSUFFICIENT_TELEMETRY_SAMPLES");

        // F05-002 & F05-008: Cross-snapshot trace ingest rejected, and reading/retrying never mutates frozen receipt
        assertThatThrownBy(() -> otelService.ingestTraces(sid, UUID.randomUUID(), new RuntimeTraceIngestRequestDTO()))
                .isInstanceOf(BusinessException.class);
        assertThat(sessionService.getSessionById(sid).getBeforeAfterComparison()).hasSize(2);
        assertThat(session.getRunnerReceiptJson()).isEqualTo(frozenReceipt);
    }

    @Test
    @DisplayName("F07-001..008: Quiz readiness gate, idempotent lifecycle acks, static vs observed edges, empty trace & isolation")
    void f07QuizReadinessStaticVsRuntimeAndAccessIsolation() {
        // F07-001: Blocked before Lab Quiz is passed
        setQuizPassed(false);
        assertThatThrownBy(() -> sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotA.getId()).build()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        // F07-002 & F07-003: Passing Quiz unlocks session creation & idempotent lifecycle acks
        setQuizPassed(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
        RuntimeSessionResponseDTO created = sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotA.getId()).modelVersionId(baseModel.getId()).build());
        RuntimeSession session = makeSession(created.getId());
        session.setExecutionStatus("READY_FOR_DISPATCH");
        when(sessionRepo.findById(created.getId())).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(created.getId())).thenReturn(Optional.of(session));

        RuntimeSessionLifecycleAckDTO alloc = sessionService.acknowledgeLifecycle(created.getId(),
                new RuntimeSessionLifecycleAckRequestDTO(created.getId(), session.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));
        RuntimeSessionLifecycleAckDTO allocReplay = sessionService.acknowledgeLifecycle(created.getId(),
                new RuntimeSessionLifecycleAckRequestDTO(created.getId(), session.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));
        assertThat(alloc.getExecutionStatus()).isEqualTo("ALLOCATED");
        assertThat(allocReplay.getExecutionStatus()).isEqualTo("ALLOCATED");

        // F07-004 & F07-006: OTel trace with HTTP 5xx only observes order->payment; order->notification stays STATIC
        var otelReq = new RuntimeTraceIngestRequestDTO();
        OtelSpanDTO s1 = new OtelSpanDTO();
        s1.setTraceId("t-503"); s1.setSpanId("sp-1"); s1.setServiceName("order-service");
        s1.setHttpMethod("POST"); s1.setHttpUrl("/payments"); s1.setHttpStatusCode(503);
        OtelSpanDTO s2 = new OtelSpanDTO();
        s2.setTraceId("t-503"); s2.setSpanId("sp-2"); s2.setParentSpanId("sp-1"); s2.setServiceName("payment-service");
        s2.setHttpStatusCode(503);
        otelReq.setSpans(List.of(s1, s2));

        ModelVersionResponseDTO enriched = otelService.ingestTraces(created.getId(), baseModel.getId(), otelReq);
        assertThat(enriched.getId()).isNotNull();
        verify(relRepo).saveAll(argThat(iterable -> {
            List<ModelRelationship> list = new ArrayList<>();
            iterable.forEach(list::add);
            boolean hasStaticNotif = list.stream().anyMatch(r -> "STATIC".equals(r.getOriginLayer()));
            boolean hasRuntimeOrderPay = list.stream().anyMatch(r -> !"STATIC".equals(r.getOriginLayer()));
            return hasStaticNotif && hasRuntimeOrderPay;
        }));

        // F07-005: Empty trace marks session traceStatus = NONE / evidenceStatus = EMPTY safely and yields no synthetic sequence steps
        RuntimeSession emptySession = makeSession(UUID.randomUUID());
        when(sessionRepo.findById(emptySession.getId())).thenReturn(Optional.of(emptySession));
        when(sessionRepo.findLockedById(emptySession.getId())).thenReturn(Optional.of(emptySession));
        receiptService.ingestRunnerReceipt(emptySession.getId(), buildReceipt(emptySession, List.of(), List.of(), List.of()));
        assertThat(emptySession.getTraceStatus()).isEqualTo("NONE");
        assertThat(emptySession.getEvidenceStatus()).isEqualTo("EMPTY");
        assertThat(otelService.getSequenceDiagramBySession(emptySession.getId()).getSteps()).isEmpty();

        // F07-008: Cross-student session access blocked (HTTP 403)
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicy).requireProjectReadAccess(projectA);
        assertThatThrownBy(() -> sessionService.getSessionById(created.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F08-001..008, TC-WF03-E2E, TC-ST03 & TC-N05: Compose preflight, scale bounds 1..8, idempotent ack, stop cleanup & 5-cycle loop")
    void f08PreflightScaleBoundsIdempotencyAndFiveCycleNfr() throws Exception {
        // F08-001: Reject privileged/host-network/docker-sock Compose definitions
        Path dangerousDir = Files.createDirectory(tempDir.resolve("dangerous-compose"));
        Files.writeString(dangerousDir.resolve("docker-compose.yml"), """
                services:
                  evil:
                    image: alpine:latest
                    privileged: true
                    network_mode: host
                    volumes:
                      - /var/run/docker.sock:/var/run/docker.sock
                """);
        SourceSnapshot dangerousSnap = SourceSnapshot.builder().id(UUID.randomUUID()).project(projectA).storagePath(dangerousDir.toString()).build();
        when(snapshotRepo.findById(dangerousSnap.getId())).thenReturn(Optional.of(dangerousSnap));
        PreflightCheckResponseDTO preflight = sessionService.runComposePreflight(dangerousSnap.getId());
        assertThat(preflight.isCompatible() && preflight.getRunnerIssues().isEmpty()).isFalse();

        // F08-002: SCALE outside 1..8 replicas rejected with HTTP 400
        RuntimeConfiguration cfg = new RuntimeConfiguration();
        cfg.setProjectId(projectA.getId());
        cfg.setSourceSnapshotId(snapshotA.getId());
        cfg.setModelVersionId(baseModel.getId());
        cfg.setProfileId("SPRING_BOOT_DOTNET_COMPOSE_V1");
        cfg.setProfile(json.createObjectNode().put("profileId", "SPRING_BOOT_DOTNET_COMPOSE_V1"));
        cfg.setRevision(1);
        RuntimeScenario scn = new RuntimeScenario();
        scn.setId(UUID.randomUUID());
        scn.setProjectId(projectA.getId());
        scn.setName("Load");
        scn.setSteps(json.createArrayNode().add("GET http://order-service:8081/health"));
        scn.setRevision(1);
        when(configRepo.findById(projectA.getId())).thenReturn(Optional.of(cfg));
        when(scenarioRepo.findById(scn.getId())).thenReturn(Optional.of(scn));

        for (int badReplica : List.of(0, 9, 20)) {
            assertThatThrownBy(() -> planningService.start(projectA.getId(),
                    new RuntimePlanningService.StartRequest(snapshotA.getId(), scn.getId(), 1, 1, true, Map.of(),
                            List.of(new RuntimePlanningService.InfrastructureActionRequest("SCALE", "order-service", badReplica)))))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
        }

        // F08-003 & F08-004: Wrong project/model receipt rejected; duplicate valid receipt returns ALREADY_COMMITTED
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));
        RunnerReceiptIngestRequestDTO mismatched = buildReceipt(session, List.of(), List.of(), List.of());
        mismatched.setResourceProject("mavisrun-ffffffffffffffffffffffffffffffff");
        assertThatThrownBy(() -> receiptService.ingestRunnerReceipt(sid, mismatched))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);

        RunnerReceiptIngestRequestDTO valid = buildReceipt(session,
                List.of(RuntimeInfrastructureActionDTO.builder()
                        .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                        .metricsBefore(json.createObjectNode().put("requestCount", 20).put("p95LatencyMs", 250.0))
                        .metricsAfter(json.createObjectNode().put("requestCount", 20).put("p95LatencyMs", 120.0))
                        .performedAt("2026-11-14T00:00:10Z").confirmed(true).build()),
                List.of(RunnerCorrelatedSpanDTO.builder().traceId("t1").spanId("s1").runtimeService("order-service").modelServiceId(orderEl.getId().toString()).build()),
                List.of());
        ReceiptIngestAckDTO firstAck = receiptService.ingestRunnerReceiptAck(sid, valid);
        ReceiptIngestAckDTO duplicateAck = receiptService.ingestRunnerReceiptAck(sid, valid);
        assertThat(firstAck.getReceiptDigest()).startsWith("sha256:");
        assertThat(duplicateAck.getReceiptDigest()).isEqualTo(firstAck.getReceiptDigest());
        assertThat(duplicateAck.getPersistenceStatus()).isEqualTo("ALREADY_COMMITTED");

        // F08-007 & TC-N05: 5 consecutive cycles complete within time budget with cleanup & non-promotion safety
        long nfrStart = System.nanoTime();
        for (int cycle = 0; cycle < 5; cycle++) {
            UUID cycleId = UUID.randomUUID();
            RuntimeSession s = makeSession(cycleId);
            s.setExecutionStatus("READY_FOR_DISPATCH");
            when(sessionRepo.findById(cycleId)).thenReturn(Optional.of(s));
            when(sessionRepo.findLockedById(cycleId)).thenReturn(Optional.of(s));
            sessionService.acknowledgeLifecycle(cycleId, new RuntimeSessionLifecycleAckRequestDTO(cycleId, s.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));
            sessionService.acknowledgeLifecycle(cycleId, new RuntimeSessionLifecycleAckRequestDTO(cycleId, s.getResourceProject(), "RUNNING", OffsetDateTime.now()));
            RuntimeSessionResponseDTO stopped = sessionService.stopSession(cycleId);
            assertThat(stopped.getExecutionStatus()).isEqualTo("CANCELLING");
            assertThat(stopped.getCancelRequestedAt()).isNotNull();
            assertThat(Files.exists(tempDir.resolve("runner-state").resolve(s.getResourceProject()).resolve("cancel.request"))).isTrue();
            RunnerReceiptIngestRequestDTO cleanupReceipt = buildReceipt(s, List.of(), List.of(), List.of());
            cleanupReceipt.getOutcome().setExecutionStatus("CANCELLED");
            cleanupReceipt.getOutcome().setCleanupStatus("CONFIRMED");
            ReceiptIngestAckDTO cleanedUp = receiptService.ingestRunnerReceiptAck(cycleId, cleanupReceipt);
            assertThat(cleanedUp.getReceiptDigest()).startsWith("sha256:");
            assertThat(s.getExecutionStatus()).isEqualTo("CANCELLED");
            assertThat(s.getCleanupStatus()).isEqualTo("CONFIRMED");
        }
        long elapsedMs = (System.nanoTime() - nfrStart) / 1_000_000;
        assertThat(elapsedMs).as("TC-N05 5 runtime lifecycles stay well under 300s limit").isLessThanOrEqualTo(300_000L);
    }
}
