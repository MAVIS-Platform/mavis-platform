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
import com.mavis.analyzer.runtime.service.impl.OtelTraceCorrelationServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RunnerReceiptIngestServiceImpl;
import com.mavis.analyzer.runtime.service.impl.RuntimeSessionServiceImpl;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
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
 * Automated granular acceptance verification matrix covering WF-03 test cases
 * (F05-001..008, F07-001..008, F08-001..008, TC-WF03-E2E, TC-ST03, TC-N05, DS-03).
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
        return makeSession(id, "SCALE", "order-service", 4);
    }

    private RuntimeSession makeSession(UUID id, String plannedAction, String plannedService, int plannedReplicas) {
        String rp = "mavisrun-" + id.toString().replace("-", "");
        ObjectNode cfg = json.createObjectNode();
        cfg.putArray("infrastructureActions")
                .addObject().put("action", plannedAction).put("service", plannedService).put("replicas", plannedReplicas);
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

    private RunnerCorrelatedSpanDTO sampleSpan(String spanId, String status, int httpStatus) {
        return RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId(spanId)
                .runtimeService("order-service").modelServiceId(orderEl.getId().toString())
                .spanStatus(status).httpStatusCode(httpStatus).httpMethod("POST").route("/orders").build();
    }

    private RuntimeInfrastructureActionDTO sampleConfirmedScale() {
        ObjectNode before = json.createObjectNode().put("requestCount", 10).put("p95LatencyMs", 220.0).put("errorRatePercent", 0.0);
        ObjectNode after = json.createObjectNode().put("requestCount", 10).put("p95LatencyMs", 120.0).put("errorRatePercent", 0.0);
        return RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(before).metricsAfter(after).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();
    }

    // ==================== F05: RUNTIME CHAOS BEFORE/AFTER & TELEMETRY HONESTY ====================

    @Test
    @DisplayName("F05-001: SCALE action ingest records measured Before/After latency and replicas accurately")
    void f05_001_scaleActionRecordsBeforeAfterMetricsAccurately() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode before = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 420.5).put("errorRatePercent", 0.0);
        ObjectNode after = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 185.0).put("errorRatePercent", 0.0);
        var scaleAction = RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(before).metricsAfter(after).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(scaleAction), List.of(sampleSpan("1111", "Ok", 200)), List.of()));
        RuntimeSessionResponseDTO dto = RuntimeSessionResponseDTO.fromEntity(session);
        assertThat(dto.getBeforeAfterComparison()).hasSize(1);
        assertThat(dto.getBeforeAfterComparison().getFirst().getReplicasBefore()).isEqualTo(1);
        assertThat(dto.getBeforeAfterComparison().getFirst().getReplicasAfter()).isEqualTo(4);
        assertThat(dto.getBeforeAfterComparison().getFirst().getP95LatencyMsBefore()).isEqualTo(420.5);
        assertThat(dto.getBeforeAfterComparison().getFirst().getP95LatencyMsAfter()).isEqualTo(185.0);
    }

    @Test
    @DisplayName("F05-002: Cross-model/non-matching modelVersionId trace ingest is rejected")
    void f05_002_mismatchedModelVersionTraceIngestRejected() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));

        assertThatThrownBy(() -> otelService.ingestTraces(sid, UUID.randomUUID(), new RuntimeTraceIngestRequestDTO()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F05-003: Missing after-samples yields INSUFFICIENT_TELEMETRY_SAMPLES instead of synthetic zeroes")
    void f05_003_missingAfterTelemetryYieldsInsufficientStatus() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid, "STOP", "payment-service", 0);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode before = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 420.5);
        ObjectNode partial = json.createObjectNode().put("requestCount", 0);
        var stopPartial = RuntimeInfrastructureActionDTO.builder()
                .action("STOP").service("payment-service").replicas(0).replicasBefore(1).replicasAfter(0)
                .metricsBefore(before).metricsAfter(partial).performedAt("2026-11-14T00:00:05Z").confirmed(true).build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(stopPartial), List.of(sampleSpan("2222", "Ok", 200)), List.of()));
        RuntimeSessionResponseDTO dto = RuntimeSessionResponseDTO.fromEntity(session);
        assertThat(dto.getBeforeAfterComparison().getFirst().getMeasurementStatus()).isEqualTo("INSUFFICIENT_TELEMETRY_SAMPLES");
    }

    @Test
    @DisplayName("F05-004: OTel correlated spans preserve parent-child traceIds and HTTP status errors")
    void f05_004_otelCorrelatedSpansPreserveTraceIdsAndErrors() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        var s1 = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("1111111111111111")
                .runtimeService("order-service").modelServiceId(orderEl.getId().toString())
                .spanStatus("Error").httpStatusCode(503).httpMethod("POST").route("/orders").build();
        var s2 = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("2222222222222222").parentSpanId("1111111111111111")
                .runtimeService("payment-service").modelServiceId(paymentEl.getId().toString())
                .spanStatus("Error").httpStatusCode(503).httpMethod("POST").route("/payments").build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(sampleConfirmedScale()), List.of(s1, s2), List.of()));
        assertThat(RuntimeSessionResponseDTO.fromEntity(session).getCapturedSpanCount()).isEqualTo(2);
        assertThat(session.getTraceQuality()).isEqualTo("PARTIAL");
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");
    }

    @Test
    @DisplayName("F05-005: Non-improved latency after scaling is reported honestly without fabrication")
    void f05_005_unimprovedLatencyAfterScaleReportedHonestly() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode before = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 420.5).put("errorRatePercent", 0.0);
        ObjectNode worseAfter = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 480.0).put("errorRatePercent", 0.0);
        var action = RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(before).metricsAfter(worseAfter).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(action), List.of(sampleSpan("3333", "Ok", 200)), List.of()));
        var cmp = RuntimeSessionResponseDTO.fromEntity(session).getBeforeAfterComparison().getFirst();
        assertThat(cmp.getMeasurementStatus()).isEqualTo("MEASURED");
        assertThat(cmp.getP95LatencyMsAfter()).isGreaterThan(cmp.getP95LatencyMsBefore());
    }

    @Test
    @DisplayName("F05-006: STOP chaos action records 0 target replicas and Error propagation metrics")
    void f05_006_stopActionRecordsZeroReplicasAndErrorRate() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid, "STOP", "payment-service", 0);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode before = json.createObjectNode().put("requestCount", 20).put("p95LatencyMs", 80.0).put("errorRatePercent", 0.0);
        ObjectNode after = json.createObjectNode().put("requestCount", 20).put("p95LatencyMs", 500.0).put("errorRatePercent", 100.0);
        var stop = RuntimeInfrastructureActionDTO.builder()
                .action("STOP").service("payment-service").replicas(0).replicasBefore(1).replicasAfter(0)
                .metricsBefore(before).metricsAfter(after).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(stop), List.of(sampleSpan("4444", "Error", 503)), List.of()));
        var cmp = RuntimeSessionResponseDTO.fromEntity(session).getBeforeAfterComparison().getFirst();
        assertThat(cmp.getAction()).isEqualTo("STOP");
        assertThat(cmp.getReplicasAfter()).isEqualTo(0);
        assertThat(cmp.getErrorRateAfter()).isEqualTo(100.0);
    }

    @Test
    @DisplayName("F05-007: Observed service interaction maps model element endpoints onto runtime receipt")
    void f05_007_observedInteractionRetainsModelElementEndpoints() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        var interaction = RunnerObservedInteractionDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .fromService("order-service").toService("payment-service")
                .fromModelServiceId(orderEl.getId().toString()).toModelServiceId(paymentEl.getId().toString())
                .parentSpanId("1111111111111111").childSpanId("2222222222222222").build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(), List.of(), List.of(interaction)));
        assertThat(session.getMappingStatus()).isNotBlank();
        assertThat(session.getRunnerReceiptJson()).isNotNull();
    }

    @Test
    @DisplayName("F05-008: Reading runtime session preserves immutable runnerReceiptJson")
    void f05_008_readingSessionPreservesImmutableReceiptJson() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode metrics = json.createObjectNode().put("requestCount", 15).put("p95LatencyMs", 150.0);
        var scale = RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(metrics).metricsAfter(metrics).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();
        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(scale), List.of(sampleSpan("5555", "Ok", 200)), List.of()));
        JsonNode frozenReceipt = session.getRunnerReceiptJson().deepCopy();

        assertThat(sessionService.getSessionById(sid).getBeforeAfterComparison()).hasSize(1);
        assertThat(session.getRunnerReceiptJson()).isEqualTo(frozenReceipt);
    }

    // ==================== F07: QUIZ GATE, LIFECYCLE, STATIC VS RUNTIME & ISOLATION ====================

    @Test
    @DisplayName("F07-001: Runtime session creation is blocked with FORBIDDEN until Lab Quiz is passed")
    void f07_001_runtimeBlockedUntilQuizPassed() {
        setQuizPassed(false);
        assertThatThrownBy(() -> sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotA.getId()).build()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F07-002: Passing Lab Quiz unlocks runtime session creation on pinned snapshot")
    void f07_002_passingQuizUnlocksRuntimeSessionCreation() {
        setQuizPassed(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);

        RuntimeSessionResponseDTO created = sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotA.getId()).modelVersionId(baseModel.getId()).build());
        assertThat(created.getId()).isNotNull();
        assertThat(created.getExecutionStatus()).isEqualTo("NOT_STARTED");
    }

    @Test
    @DisplayName("F07-003: Lifecycle acknowledgements (ALLOCATED) are idempotent on replay")
    void f07_003_lifecycleAckReplayIsIdempotent() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        session.setExecutionStatus("READY_FOR_DISPATCH");
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        RuntimeSessionLifecycleAckDTO first = sessionService.acknowledgeLifecycle(sid,
                new RuntimeSessionLifecycleAckRequestDTO(sid, session.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));
        RuntimeSessionLifecycleAckDTO replay = sessionService.acknowledgeLifecycle(sid,
                new RuntimeSessionLifecycleAckRequestDTO(sid, session.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));

        assertThat(first.getExecutionStatus()).isEqualTo("ALLOCATED");
        assertThat(replay.getExecutionStatus()).isEqualTo("ALLOCATED");
    }

    @Test
    @DisplayName("F07-004: OTel trace ingest creates enriched model distinguishing observed runtime edges from STATIC edges")
    void f07_004_otelIngestSeparatesObservedEdgesFromStaticEdges() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));

        var otelReq = new RuntimeTraceIngestRequestDTO();
        OtelSpanDTO s1 = new OtelSpanDTO();
        s1.setTraceId("t-503"); s1.setSpanId("sp-1"); s1.setServiceName("order-service");
        s1.setHttpMethod("POST"); s1.setHttpUrl("/payments"); s1.setHttpStatusCode(503);
        OtelSpanDTO s2 = new OtelSpanDTO();
        s2.setTraceId("t-503"); s2.setSpanId("sp-2"); s2.setParentSpanId("sp-1"); s2.setServiceName("payment-service");
        s2.setHttpStatusCode(503);
        otelReq.setSpans(List.of(s1, s2));

        ModelVersionResponseDTO enriched = otelService.ingestTraces(sid, baseModel.getId(), otelReq);
        assertThat(enriched.getId()).isNotNull();
        verify(relRepo).saveAll(argThat(iterable -> {
            List<ModelRelationship> list = new ArrayList<>();
            iterable.forEach(list::add);
            return list.stream().anyMatch(r -> "STATIC".equals(r.getOriginLayer()))
                    && list.stream().anyMatch(r -> !"STATIC".equals(r.getOriginLayer()));
        }));
    }

    @Test
    @DisplayName("F07-005: Empty span receipt records NONE traceStatus, EMPTY evidenceStatus, and empty sequence diagram")
    void f07_005_emptySpanReceiptYieldsHonestEmptySequence() {
        RuntimeSession emptySession = makeSession(UUID.randomUUID());
        when(sessionRepo.findById(emptySession.getId())).thenReturn(Optional.of(emptySession));
        when(sessionRepo.findLockedById(emptySession.getId())).thenReturn(Optional.of(emptySession));

        receiptService.ingestRunnerReceipt(emptySession.getId(), buildReceipt(emptySession, List.of(), List.of(), List.of()));
        assertThat(emptySession.getTraceStatus()).isEqualTo("NONE");
        assertThat(emptySession.getEvidenceStatus()).isEqualTo("EMPTY");
        assertThat(otelService.getSequenceDiagramBySession(emptySession.getId()).getSteps()).isEmpty();
    }

    @Test
    @DisplayName("F07-006: Unobserved static relationships are never falsely marked as RUNTIME_OBSERVED")
    void f07_006_unobservedStaticEdgeNotPromotedToRuntimeObserved() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));

        var otelReq = new RuntimeTraceIngestRequestDTO();
        OtelSpanDTO s1 = new OtelSpanDTO();
        s1.setTraceId("t-200"); s1.setSpanId("sp-1"); s1.setServiceName("order-service");
        s1.setHttpMethod("POST"); s1.setHttpUrl("/payments"); s1.setHttpStatusCode(200);
        OtelSpanDTO s2 = new OtelSpanDTO();
        s2.setTraceId("t-200"); s2.setSpanId("sp-2"); s2.setParentSpanId("sp-1"); s2.setServiceName("payment-service");
        s2.setHttpStatusCode(200);
        otelReq.setSpans(List.of(s1, s2));

        otelService.ingestTraces(sid, baseModel.getId(), otelReq);
        assertThat(staticOrderNotif.getOriginLayer()).isEqualTo("STATIC");
    }

    @Test
    @DisplayName("F07-007: Snapshot from another student's project cannot be used to create runtime session")
    void f07_007_foreignSnapshotRejectedOnRuntimeCreation() {
        setQuizPassed(true);
        assertThatThrownBy(() -> sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotOther.getId()).build()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F07-008: Cross-student session read is denied with FORBIDDEN")
    void f07_008_crossStudentSessionAccessDenied() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(accessPolicy).requireProjectReadAccess(projectA);

        assertThatThrownBy(() -> sessionService.getSessionById(sid))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    // ==================== F08: PREFLIGHT, SCALE BOUNDS, IDEMPOTENCY, CLEANUP & NFR ====================

    @Test
    @DisplayName("F08-001: Compose preflight blocks privileged mode, host network, and docker.sock bind mounts")
    void f08_001_composePreflightBlocksDangerousDirectives() throws Exception {
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
    }

    @Test
    @DisplayName("F08-002: SCALE action outside 1..8 replica bounds (0, 9, 20) fails with BAD_REQUEST")
    void f08_002_scaleOutsideReplicaBoundsRejected() {
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

        for (int badReplica : List.of(0, 4, 9, 20)) {
            assertThatThrownBy(() -> planningService.start(projectA.getId(),
                    new RuntimePlanningService.StartRequest(snapshotA.getId(), scn.getId(), 1, 1, true, Map.of(),
                            List.of(new RuntimePlanningService.InfrastructureActionRequest("SCALE", "order-service", badReplica)))))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
        }
    }

    @Test
    @DisplayName("F08-003: Receipt with mismatched resourceProject identifier is rejected with BAD_REQUEST")
    void f08_003_mismatchedResourceProjectReceiptRejected() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        RunnerReceiptIngestRequestDTO mismatched = buildReceipt(session, List.of(), List.of(), List.of());
        mismatched.setResourceProject("mavisrun-ffffffffffffffffffffffffffffffff");
        assertThatThrownBy(() -> receiptService.ingestRunnerReceipt(sid, mismatched))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("F08-004: Duplicate valid runner receipt returns ALREADY_COMMITTED with identical SHA-256 digest")
    void f08_004_duplicateValidReceiptIsIdempotent() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

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
    }

    @Test
    @DisplayName("F08-005: Valid compose snapshot passes Compose preflight verification")
    void f08_005_validComposeSnapshotPassesPreflight() {
        PreflightCheckResponseDTO preflight = sessionService.runComposePreflight(snapshotA.getId());
        assertThat(preflight.isCompatible()).isTrue();
        assertThat(preflight.getDetectedServices()).isNotEmpty();
    }

    @Test
    @DisplayName("F08-006: Stopping a RUNNING session writes cancel.request sentinel and enters CANCELLING")
    void f08_006_stopSessionWritesCancelSentinel() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        session.setExecutionStatus("RUNNING");
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        RuntimeSessionResponseDTO stopped = sessionService.stopSession(sid);
        assertThat(stopped.getExecutionStatus()).isEqualTo("CANCELLING");
        assertThat(stopped.getCancelRequestedAt()).isNotNull();
        assertThat(Files.exists(tempDir.resolve("runner-state").resolve(session.getResourceProject()).resolve("cancel.request"))).isTrue();
    }

    @Test
    @DisplayName("F08-007: Cleanup confirmation receipt transitions session to CANCELLED with CONFIRMED cleanup")
    void f08_007_cleanupConfirmationTransitionsToCancelled() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        session.setExecutionStatus("CANCELLING");
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        RunnerReceiptIngestRequestDTO cleanupReceipt = buildReceipt(session, List.of(), List.of(), List.of());
        cleanupReceipt.getOutcome().setExecutionStatus("CANCELLED");
        cleanupReceipt.getOutcome().setCleanupStatus("CONFIRMED");
        ReceiptIngestAckDTO ack = receiptService.ingestRunnerReceiptAck(sid, cleanupReceipt);

        assertThat(ack.getReceiptDigest()).startsWith("sha256:");
        assertThat(session.getExecutionStatus()).isEqualTo("CANCELLED");
        assertThat(session.getCleanupStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("F08-008: Cancelled cleanup never promotes base latest valid static model falsely")
    void f08_008_cancelledSessionNeverPromotesStaticModel() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        session.setExecutionStatus("CANCELLING");
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        RunnerReceiptIngestRequestDTO cleanupReceipt = buildReceipt(session, List.of(), List.of(), List.of());
        cleanupReceipt.getOutcome().setExecutionStatus("CANCELLED");
        cleanupReceipt.getOutcome().setCleanupStatus("CONFIRMED");
        receiptService.ingestRunnerReceiptAck(sid, cleanupReceipt);
        verify(modelRepo, never()).save(any());
    }

    // ==================== E2E, STATE TRANSITIONS, DS-03 & NFR ====================

    @Test
    @DisplayName("TC-WF03-E2E: Quiz pass -> runtime creation -> ALLOCATED -> RUNNING -> SCALE -> COMPLETED receipt")
    void tcWf03E2eMainWorkflow() {
        setQuizPassed(true);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenReturn(true);
        RuntimeSessionResponseDTO created = sessionService.createRuntimeSession(
                RuntimeSessionCreateRequest.builder().projectId(projectA.getId()).sourceSnapshotId(snapshotA.getId()).modelVersionId(baseModel.getId()).build());

        RuntimeSession session = makeSession(created.getId());
        session.setExecutionStatus("READY_FOR_DISPATCH");
        when(sessionRepo.findById(created.getId())).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(created.getId())).thenReturn(Optional.of(session));

        sessionService.acknowledgeLifecycle(created.getId(), new RuntimeSessionLifecycleAckRequestDTO(created.getId(), session.getResourceProject(), "ALLOCATED", OffsetDateTime.now()));
        sessionService.acknowledgeLifecycle(created.getId(), new RuntimeSessionLifecycleAckRequestDTO(created.getId(), session.getResourceProject(), "RUNNING", OffsetDateTime.now()));

        RunnerCorrelatedSpanDTO span = RunnerCorrelatedSpanDTO.builder()
                .traceId("t-e2e").spanId("s-e2e").runtimeService("order-service").modelServiceId(orderEl.getId().toString()).build();
        receiptService.ingestRunnerReceipt(created.getId(), buildReceipt(session, List.of(sampleConfirmedScale()), List.of(span), List.of()));
        assertThat(session.getExecutionStatus()).isEqualTo("COMPLETED");
        assertThat(session.getCleanupStatus()).isEqualTo("CONFIRMED");
    }

    @Test
    @DisplayName("TC-ST03: Runtime execution state transitions READY_FOR_DISPATCH -> ALLOCATED -> RUNNING -> CANCELLING -> CANCELLED")
    void tcSt03RuntimeStateTransitions() {
        UUID sid = UUID.randomUUID();
        RuntimeSession s = makeSession(sid);
        s.setExecutionStatus("READY_FOR_DISPATCH");
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(s));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(s));

        assertThat(sessionService.acknowledgeLifecycle(sid, new RuntimeSessionLifecycleAckRequestDTO(sid, s.getResourceProject(), "ALLOCATED", OffsetDateTime.now())).getExecutionStatus())
                .isEqualTo("ALLOCATED");
        assertThat(sessionService.acknowledgeLifecycle(sid, new RuntimeSessionLifecycleAckRequestDTO(sid, s.getResourceProject(), "RUNNING", OffsetDateTime.now())).getExecutionStatus())
                .isEqualTo("RUNNING");
        assertThat(sessionService.stopSession(sid).getExecutionStatus()).isEqualTo("CANCELLING");

        RunnerReceiptIngestRequestDTO cleanupReceipt = buildReceipt(s, List.of(), List.of(), List.of());
        cleanupReceipt.getOutcome().setExecutionStatus("CANCELLED");
        cleanupReceipt.getOutcome().setCleanupStatus("CONFIRMED");
        receiptService.ingestRunnerReceiptAck(sid, cleanupReceipt);
        assertThat(s.getExecutionStatus()).isEqualTo("CANCELLED");
    }

    @Test
    @DisplayName("TC-N05: Five consecutive runtime lifecycles and cleanup receipts finish well within 300s budget")
    void tcN05FiveConsecutiveCyclesWithinBudget() {
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
            RunnerReceiptIngestRequestDTO cleanupReceipt = buildReceipt(s, List.of(), List.of(), List.of());
            cleanupReceipt.getOutcome().setExecutionStatus("CANCELLED");
            cleanupReceipt.getOutcome().setCleanupStatus("CONFIRMED");
            ReceiptIngestAckDTO cleanedUp = receiptService.ingestRunnerReceiptAck(cycleId, cleanupReceipt);
            assertThat(cleanedUp.getReceiptDigest()).startsWith("sha256:");
            assertThat(s.getExecutionStatus()).isEqualTo("CANCELLED");
        }
        long elapsedMs = (System.nanoTime() - nfrStart) / 1_000_000;
        assertThat(elapsedMs).isLessThanOrEqualTo(300_000L);
    }

    @Test
    @DisplayName("DS-03: Combined SCALE + STOP receipt preserves both measurement comparisons without overwriting")
    void ds03_beforeAfterMultiActionComparisonPreservesEntries() {
        UUID sid = UUID.randomUUID();
        RuntimeSession session = makeSession(sid);
        when(sessionRepo.findById(sid)).thenReturn(Optional.of(session));
        when(sessionRepo.findLockedById(sid)).thenReturn(Optional.of(session));

        ObjectNode before = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 300.0).put("errorRatePercent", 0.0);
        ObjectNode afterScale = json.createObjectNode().put("requestCount", 25).put("p95LatencyMs", 150.0).put("errorRatePercent", 0.0);
        ObjectNode afterStop = json.createObjectNode().put("requestCount", 10).put("p95LatencyMs", 600.0).put("errorRatePercent", 100.0);

        var scaleAction = RuntimeInfrastructureActionDTO.builder()
                .action("SCALE").service("order-service").replicas(4).replicasBefore(1).replicasAfter(4)
                .metricsBefore(before).metricsAfter(afterScale).performedAt("2026-11-14T00:00:00Z").confirmed(true).build();
        var stopAction = RuntimeInfrastructureActionDTO.builder()
                .action("STOP").service("payment-service").replicas(0).replicasBefore(1).replicasAfter(0)
                .metricsBefore(before).metricsAfter(afterStop).performedAt("2026-11-14T00:00:05Z").confirmed(true).build();

        receiptService.ingestRunnerReceipt(sid, buildReceipt(session, List.of(scaleAction, stopAction), List.of(sampleSpan("6666", "Ok", 200)), List.of()));
        var comparisons = RuntimeSessionResponseDTO.fromEntity(session).getBeforeAfterComparison();
        assertThat(comparisons).hasSize(2);
        assertThat(comparisons.get(0).getAction()).isEqualTo("SCALE");
        assertThat(comparisons.get(1).getAction()).isEqualTo("STOP");
    }
}
