package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RunnerReceiptIngestServiceImplTest {

    @Mock
    private RuntimeSessionRepository runtimeSessionRepository;

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

    @Mock
    private RunnerServiceAuthGuard runnerServiceAuthGuard;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private RunnerReceiptIngestServiceImpl runnerReceiptIngestService;

    @TempDir
    Path tempStateRoot;

    private UUID sessionId;
    private UUID projectId;
    private UUID snapshotId;
    private UUID modelVersionId;
    private UUID serviceAId;
    private UUID serviceBId;

    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion baseModelVersion;
    private RuntimeSession session;
    private ModelElement elementA;
    private ModelElement elementB;
    private ModelRelationship staticRelAB;

    private final String validResourceProject = "mavisrun-0123456789abcdef0123456789abcdef";
    private final String profileVersionId = "local-poc-profile/1.0";
    private final String runConfigurationVersionId = "run-config/1.0";
    private final String scenarioVersionId = "scenario/1.0";

    @BeforeEach
    void setUp() {
        sessionId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();
        modelVersionId = UUID.randomUUID();
        serviceAId = UUID.randomUUID();
        serviceBId = UUID.randomUUID();

        project = Project.builder().id(projectId).name("Payment Platform").build();
        snapshot = SourceSnapshot.builder().id(snapshotId).project(project).build();

        baseModelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .build();

        session = RuntimeSession.builder()
                .id(sessionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(baseModelVersion)
                .profileVersionId(profileVersionId)
                .runConfigurationVersionId(runConfigurationVersionId)
                .scenarioVersionId(scenarioVersionId)
                .resourceProject(validResourceProject)
                .scenarioStatus("RUNNING")
                .traceStatus("NONE")
                .executionStatus("RUNNING")
                .build();

        elementA = ModelElement.builder()
                .id(serviceAId)
                .modelVersion(baseModelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        elementB = ModelElement.builder()
                .id(serviceBId)
                .modelVersion(baseModelVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        staticRelAB = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(elementA)
                .targetElement(elementB)
                .relationType("DEPENDS_ON")
                .originLayer("STATIC")
                .build();

        lenient().when(runtimeSessionRepository.findLockedById(sessionId)).thenReturn(Optional.of(session));
        lenient().when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        lenient().when(projectRepository.findByIdForUpdate(projectId)).thenReturn(Optional.of(project));
        lenient().when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModelVersion));
        lenient().when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId)).thenReturn(Optional.of(baseModelVersion));
        lenient().when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        lenient().when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            assertThat(mv.getBaseModelVersion()).isSameAs(baseModelVersion);
            if (mv.getId() == null) mv.setId(UUID.randomUUID());
            return mv;
        });
        lenient().when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(elementA, elementB));
        lenient().when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelElement> list = inv.getArgument(0);
            for (ModelElement el : list) {
                if (el.getId() == null) el.setId(UUID.randomUUID());
            }
            return list;
        });
        lenient().when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(staticRelAB));
        lenient().when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelRelationship> list = inv.getArgument(0);
            for (ModelRelationship r : list) {
                if (r.getId() == null) r.setId(UUID.randomUUID());
            }
            return list;
        });
        lenient().when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());
        lenient().when(evidenceRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempStateRoot.toString());
        ReflectionTestUtils.setField(runnerReceiptIngestService, "allowUnverifiedPocPromotion", true);
    }

    private RunnerReceiptIngestRequestDTO.RunnerReceiptIngestRequestDTOBuilder createValidReceiptBuilder() {
        return RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .profileVersionId(profileVersionId)
                .runConfigurationVersionId(runConfigurationVersionId)
                .scenarioVersionId(scenarioVersionId)
                .resourceProject(validResourceProject)
                .infrastructureActions(List.of(RuntimeInfrastructureActionDTO.builder()
                        .action("SCALE")
                        .service("order-service")
                        .replicasBefore(1)
                        .replicasAfter(2)
                        .metricsBefore(new ObjectMapper().createObjectNode().put("p95LatencyMs", 125))
                        .metricsAfter(new ObjectMapper().createObjectNode().put("p95LatencyMs", 82))
                        .performedAt(OffsetDateTime.now().toString())
                        .confirmed(true)
                        .build()))
                .sandboxEnforcementConfirmed(true);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @DisplayName("BR-08: reject missing or mismatched infrastructure evidence")
    void rejectsSuccessfulReceiptWithoutMatchingInfrastructureAction(boolean mismatched) {
        var config = new ObjectMapper().createObjectNode();
        config.putArray("infrastructureActions").addObject().put("action", "SCALE")
                .put("service", "order-service").put("replicas", 4);
        session.setScenarioConfig(config);
        RunnerCorrelatedSpanDTO span = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .build();
        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .mappingStatus("Mapped")
                .trace(RunnerTraceCorrelationDTO.builder().spans(List.of(span)).warnings(List.of()).build())
                .build();
        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
                .infrastructureActions(mismatched ? createValidReceiptBuilder().build().getInfrastructureActions() : List.of())
                .outcome(outcome)
                .build();

        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("INCOMPLETE_RUNTIME_SCENARIO");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @DisplayName("Publish observation and matching Studio receipts")
    void testIngestRunnerReceipt_Success_SavesDigestAndEnrichesModel(boolean studio) {
        if (studio) {
            var config = new ObjectMapper().createObjectNode();
            config.putArray("infrastructureActions").addObject().put("action", "SCALE")
                    .put("service", "order-service").put("replicas", 2);
            session.setScenarioConfig(config);
        }
        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .durationNanoseconds("15000000")
                .httpStatusCode(200)
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b0f")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("payment-service")
                .modelServiceId(serviceBId.toString())
                .durationNanoseconds("82500000")
                .httpStatusCode(200)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(new RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b0f")))
                .warnings(List.of())
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        var builder = createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome);
        RunnerReceiptIngestRequestDTO receipt = (studio ? builder : builder.infrastructureActions(List.of())).build();

        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        assertThat(response).isNotNull();
        assertThat(session.getReceiptDigest()).isNotNull();
        assertThat(session.getReceiptDigest()).startsWith("sha256:");
        assertThat(session.getPublicationGateStatus()).isEqualTo("PROMOTED");
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");
        assertThat(com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO.fromEntity(session).isStudioVerified())
                .isEqualTo(studio);
    }

    @Test
    @DisplayName("CHẶNG 11: Tiếp nhận RunnerReceipt thành công và lưu receiptDigest 64-hex")
    void testUnverifiedReceiptCannotPromoteEvenWithLegacyBypass() {
        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .durationNanoseconds("15000000")
                .httpStatusCode(200)
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b0f")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("payment-service")
                .modelServiceId(serviceBId.toString())
                .durationNanoseconds("82500000")
                .httpStatusCode(200)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(new RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b0f")))
                .warnings(List.of())
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
                .imageSourceCorrespondence("Unverified").outcome(outcome)
                .build();

        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        assertThat(response).isNotNull();
        assertThat(session.getReceiptDigest()).isNotNull();
        assertThat(session.getReceiptDigest()).startsWith("sha256:");
        assertThat(session.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");
    }

    @Test
    @DisplayName("CHẶNG 11: Idempotency Replay - Gửi lại cùng digest trả ALREADY_COMMITTED mà không tạo thêm ModelVersion")
    void testIngestRunnerReceipt_SameDigest_ReturnsAlreadyCommitted() {
        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
                .outcome(RunnerOutcomeDTO.builder().executionStatus("Completed").scenarioStatus("Passed").evidenceStatus("Unavailable").build())
                .build();

        // Lần 1: Xử lý thành công
        ReceiptIngestAckDTO ack1 = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);
        assertThat(ack1.getPersistenceStatus()).isEqualTo("COMMITTED");

        // Lần 2: Replay cùng digest -> ALREADY_COMMITTED
        ReceiptIngestAckDTO ack2 = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);
        assertThat(ack2.getPersistenceStatus()).isEqualTo("ALREADY_COMMITTED");
        assertThat(ack2.getReceiptDigest()).isEqualTo(ack1.getReceiptDigest());
    }

    @Test
    @DisplayName("CHẶNG 11: Replay khác digest ném 409 CONFLICT (Conflicting RunnerReceipt digest)")
    void testIngestRunnerReceipt_ConflictingDigest_Throws409Conflict() {
        RunnerReceiptIngestRequestDTO receipt1 = createValidReceiptBuilder()
                .outcome(RunnerOutcomeDTO.builder().executionStatus("Completed").scenarioStatus("Passed").build())
                .build();

        runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt1);

        RunnerReceiptIngestRequestDTO receipt2 = createValidReceiptBuilder()
                .outcome(RunnerOutcomeDTO.builder().executionStatus("Failed").scenarioStatus("Failed").build())
                .build();

        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt2))
                .isInstanceOf(BusinessException.class)
                .satisfies(ex -> {
                    BusinessException be = (BusinessException) ex;
                    assertThat(be.getErrorCode()).isEqualTo(ErrorCode.CONFLICT);
                    assertThat(be.getMessage()).contains("Conflicting RunnerReceipt digest");
                });
    }

    @Test
    @DisplayName("CHẶNG 11: Lệch bất kỳ version ID nào trong 6 ID trả 400 BAD_REQUEST")
    void testIngestRunnerReceipt_VersionIdMismatch_Throws400BadRequest() {
        // 1. Lệch profileVersionId
        RunnerReceiptIngestRequestDTO badProfile = createValidReceiptBuilder()
                .profileVersionId("wrong-profile")
                .build();
        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, badProfile))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("profileVersionId không khớp");

        // 2. Lệch runConfigurationVersionId
        RunnerReceiptIngestRequestDTO badRunConfig = createValidReceiptBuilder()
                .runConfigurationVersionId("wrong-run-config")
                .build();
        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, badRunConfig))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("runConfigurationVersionId không khớp");

        // 3. Lệch scenarioVersionId
        RunnerReceiptIngestRequestDTO badScenario = createValidReceiptBuilder()
                .scenarioVersionId("wrong-scenario")
                .build();
        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, badScenario))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("scenarioVersionId không khớp");

        // 4. Lệch resourceProject
        RunnerReceiptIngestRequestDTO badResource = createValidReceiptBuilder()
                .resourceProject("mavisrun-ffffffffffffffffffffffffffffffff")
                .build();
        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, badResource))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("resourceProject không khớp");
    }

    @Test
    @DisplayName("CHẶNG 12: Capture Boundary - MISSING_PARENT_SPAN từ scenario step được công nhận là External Root (traceStatus = COMPLETE, PROMOTED)")
    void testIngestRunnerReceipt_CaptureBoundary_ExternalRootRecognized() {
        String extTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
        String extParentSpanId = "0000000000000001";
        String rootSpanId = "00f067aa0ba902b7";

        // Scenario step bơm traceparent với parentSpanId = extParentSpanId
        ObjectNode scenarioNode = objectMapper.createObjectNode();
        ArrayNode stepsArr = scenarioNode.putArray("steps");
        ObjectNode stepNode = stepsArr.addObject();
        stepNode.put("id", "step1");
        stepNode.put("traceId", extTraceId);
        stepNode.put("parentSpanId", extParentSpanId);

        RunnerCorrelatedSpanDTO rootSpan = RunnerCorrelatedSpanDTO.builder()
                .traceId(extTraceId)
                .spanId(rootSpanId)
                .parentSpanId(extParentSpanId)
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .durationNanoseconds("20000000")
                .httpStatusCode(200)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(rootSpan))
                .warnings(List.of("MISSING_PARENT_SPAN", "ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION"))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Partial") // Do MISSING_PARENT_SPAN
                .mappingStatus("Mapped")
                .scenario(scenarioNode)
                .trace(trace)
                .build();

        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder().imageSourceCorrespondence("Verified")
                .outcome(outcome)
                .build();

        Evidence staticEvidence = Evidence.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceSnapshot(snapshot)
                .element(elementA)
                .sourceType("STATIC_CODE")
                .locator("src/main/OrderService.java#L10-L20")
                .excerpt("class OrderService {}")
                .provenance(objectMapper.createObjectNode().put("tool", "parser"))
                .build();
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(staticEvidence));

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);

        assertThat(ack).isNotNull();
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE"); // External root recognized!
        assertThat(ack.getPublicationGateStatus()).isEqualTo("PROMOTED");
        assertThat(ack.getPromotedLatest()).isTrue();

        ArgumentCaptor<List<Evidence>> evCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository, atLeastOnce()).saveAll(evCaptor.capture());
        List<Evidence> allSaved = evCaptor.getAllValues().stream().flatMap(List::stream).toList();
        assertThat(allSaved).anyMatch(ev -> "STATIC_CODE".equals(ev.getSourceType())
                && "src/main/OrderService.java#L10-L20".equals(ev.getLocator())
                && ev.getProvenance() != null && "parser".equals(ev.getProvenance().path("tool").asText()));
    }

    @Test
    @DisplayName("CHẶNG 12: StartupFailure (spans rỗng) -> SKIPPED_NO_EVIDENCE, không tạo ModelVersion mới")
    void testIngestRunnerReceipt_StartupFailure_SkippedNoEvidence() {
        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Failed")
                .scenarioStatus("NotRun")
                .evidenceStatus("Unavailable")
                .cleanupStatus("Confirmed")
                .traceQuality("Unavailable")
                .mappingStatus("Unavailable")
                .trace(RunnerTraceCorrelationDTO.builder().spans(List.of()).build())
                .build();

        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
                .sandboxEnforcementConfirmed(false)
                .outcome(outcome)
                .build();

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);

        assertThat(ack).isNotNull();
        assertThat(ack.getPublicationGateStatus()).isEqualTo("SKIPPED_NO_EVIDENCE");
        assertThat(ack.getEnrichedModelVersionId()).isNull();
        assertThat(session.getScenarioStatus()).isEqualTo("FAILED");
        verify(modelVersionRepository, never()).save(any());
    }

    @Test
    @DisplayName("CHẶNG 12: Scenario Failed (có spans) -> HELD_NON_PROMOTED, isLatestValid = false")
    void testIngestRunnerReceipt_ScenarioFailed_HeldNonPromoted() {
        RunnerCorrelatedSpanDTO span = RunnerCorrelatedSpanDTO.builder()
                .traceId("trace123")
                .spanId("span1")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Failed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .mappingStatus("Mapped")
                .trace(RunnerTraceCorrelationDTO.builder().spans(List.of(span)).build())
                .build();

        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
                .outcome(outcome)
                .build();

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(sessionId, receipt);

        assertThat(ack).isNotNull();
        assertThat(ack.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
        assertThat(ack.getPromotedLatest()).isFalse();
        assertThat(ack.getEnrichedModelVersionId()).isNotNull();
        verify(modelVersionRepository, never()).invalidatePreviousVersions(any(), any());
    }
 @Test void lateReceiptCannotReplaceANewerStaticOrConfirmedRevision(){
  when(modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId)).thenReturn(Optional.of(ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(2).isLatestValid(true).build()));
  var span=RunnerCorrelatedSpanDTO.builder().traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("00f067aa0ba902b7").runtimeService("order-service").modelServiceId(serviceAId.toString()).durationNanoseconds("1000000").httpStatusCode(200).build();
  var trace=RunnerTraceCorrelationDTO.builder().sessionId(sessionId.toString()).modelVersionId(modelVersionId.toString()).spans(List.of(span)).causalEdges(List.of()).warnings(List.of()).build();
  var outcome=RunnerOutcomeDTO.builder().executionStatus("Completed").scenarioStatus("Passed").evidenceStatus("Available").cleanupStatus("Confirmed").traceQuality("CompleteForCapturedData").mappingStatus("Mapped").trace(trace).build();
  var result=runnerReceiptIngestService.ingestRunnerReceipt(sessionId,createValidReceiptBuilder().outcome(outcome).build());
  assertThat(result.getIsLatestValid()).isFalse();assertThat(session.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");verify(modelVersionRepository,never()).invalidatePreviousVersions(any(),any());
 }

    @Test
    @DisplayName("Step 3: Case/slug service resolution upgrades Partial/UNMAPPED_SERVICE without creating UNCERTAIN_MAPPING placeholders")
    void caseAndSlugServiceMappingUpgradesPartialReceiptWithoutCreatingUncertainPlaceholder() {
        session.setConfirmedServiceMappings(Map.of("order-service", serviceAId.toString()));

        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("OrderService")
                .modelServiceId(null)
                .durationNanoseconds("12000000")
                .httpStatusCode(200)
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b0f")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("PaymentService")
                .modelServiceId(null)
                .durationNanoseconds("25000000")
                .httpStatusCode(200)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(new RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b0f")))
                .warnings(List.of("UNMAPPED_SERVICE", "ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION"))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Partial")
                .mappingStatus("Partial")
                .trace(trace)
                .build();

        ReceiptIngestAckDTO ack = runnerReceiptIngestService.ingestRunnerReceiptAck(
                sessionId,
                createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome).build());

        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");
        assertThat(session.getMappingStatus()).isEqualTo("MAPPED");
        assertThat(ack.getPublicationGateStatus()).isEqualTo("PROMOTED");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> elemCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository, atLeastOnce()).saveAll(elemCaptor.capture());
        List<ModelElement> savedElements = elemCaptor.getValue();
        assertThat(savedElements).hasSize(2);
        assertThat(savedElements).noneMatch(el -> el.getProperties() != null
                && "UNCERTAIN_MAPPING".equals(el.getProperties().path("resolutionStatus").asText()));
    }

    @Test
    @DisplayName("Step 3: Single-service external root projects observed UML_SEQUENCE with redacted pinned route and zero bogus elements")
    void singleServiceExternalRootProjectsObservedSequenceWithRedactedStepMetadata() {
        String extTraceId = "4bf92f3577b34da6a3ce929d0e0e4736";
        String extParentSpanId = "0000000000000099";
        String rootSpanId = "00f067aa0ba902b7";

        ObjectNode pinnedConfig = objectMapper.createObjectNode();
        ObjectNode pinnedScenario = pinnedConfig.putObject("scenario");
        ArrayNode pinnedSteps = pinnedScenario.putArray("steps");
        ObjectNode pinnedStep = pinnedSteps.addObject();
        pinnedStep.put("id", "step-orders");
        pinnedStep.put("service", "order-service");
        pinnedStep.put("method", "GET");
        pinnedStep.put("path", "/api/orders?api_key=secret-value-999");
        pinnedStep.put("expectedStatus", 200);
        session.setScenarioConfig(pinnedConfig);

        ObjectNode outcomeScenario = objectMapper.createObjectNode();
        ArrayNode outcomeSteps = outcomeScenario.putArray("steps");
        ObjectNode outcomeStep = outcomeSteps.addObject();
        outcomeStep.put("stepId", "step-orders");
        outcomeStep.put("status", "Passed");
        outcomeStep.put("statusCode", 200);
        outcomeStep.put("traceId", extTraceId);
        outcomeStep.put("parentSpanId", extParentSpanId);
        outcomeStep.put("elapsedMilliseconds", 18);

        RunnerCorrelatedSpanDTO rootSpan = RunnerCorrelatedSpanDTO.builder()
                .traceId(extTraceId)
                .spanId(rootSpanId)
                .parentSpanId(extParentSpanId)
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .durationNanoseconds("18000000")
                .httpStatusCode(null)
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(rootSpan))
                .warnings(List.of("MISSING_PARENT_SPAN", "ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION"))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Partial")
                .mappingStatus("Mapped")
                .scenario(outcomeScenario)
                .trace(trace)
                .build();

        runnerReceiptIngestService.ingestRunnerReceiptAck(
                sessionId,
                createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome).build());

        ArgumentCaptor<DiagramVersion> diagCaptor = ArgumentCaptor.forClass(DiagramVersion.class);
        verify(diagramVersionRepository).save(diagCaptor.capture());
        DiagramVersion savedDiagram = diagCaptor.getValue();
        assertThat(savedDiagram.getNotation()).isEqualTo("UML_SEQUENCE");
        assertThat(savedDiagram.getLayoutJson().path("totalSteps").asInt()).isEqualTo(1);
        var step0 = savedDiagram.getLayoutJson().path("steps").get(0);
        assertThat(step0.path("callerService").asText()).isEqualTo("scenario-runner");
        assertThat(step0.path("calleeService").asText()).isEqualTo("order-service");
        assertThat(step0.path("httpMethod").asText()).isEqualTo("GET");
        assertThat(step0.path("httpStatusCode").asInt()).isEqualTo(200);
        assertThat(step0.path("operation").asText()).startsWith("/api/orders");
        assertThat(step0.path("operation").asText()).doesNotContain("secret-value-999");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> elemCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository, atLeastOnce()).saveAll(elemCaptor.capture());
        List<ModelElement> allElements = elemCaptor.getAllValues().stream().flatMap(List::stream).toList();
        assertThat(allElements).noneMatch(el -> "scenario-runner".equalsIgnoreCase(el.getName()));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> evCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository, atLeastOnce()).saveAll(evCaptor.capture());
        List<Evidence> allEv = evCaptor.getAllValues().stream().flatMap(List::stream).toList();
        assertThat(allEv).anyMatch(ev -> "RUNTIME_TRACE".equals(ev.getSourceType())
                && ev.getElement() != null
                && "order-service".equals(ev.getElement().getName())
                && ev.getRelationship() == null);
    }

    @Test
    @DisplayName("Step 3: RuntimeSessionResponseDTO extracts per-step results, span counts, and redacted diagnostics")
    void runtimeSessionResponseDtoExtractsStepResultsSpanCountAndRedactedDiagnostics() {
        ObjectNode pinnedConfig = objectMapper.createObjectNode();
        ArrayNode pinnedSteps = pinnedConfig.putObject("scenario").putArray("steps");
        pinnedSteps.addObject()
                .put("id", "step-1")
                .put("service", "order-service")
                .put("method", "GET")
                .put("path", "/api/orders")
                .put("expectedStatus", 200);
        pinnedSteps.addObject()
                .put("id", "step-2")
                .put("service", "payment-service")
                .put("method", "POST")
                .put("path", "/api/payments?token=secret777")
                .put("expectedStatus", 201);

        ObjectNode receiptJson = objectMapper.createObjectNode();
        ObjectNode outcomeJson = receiptJson.putObject("outcome");
        outcomeJson.putArray("diagnostics").add("WaitUntilReadyAsync: password=hidden123");
        ArrayNode outSteps = outcomeJson.putObject("scenario").putArray("steps");
        outSteps.addObject()
                .put("stepId", "step-1")
                .put("status", "Passed")
                .put("statusCode", 200)
                .put("elapsedMilliseconds", 14)
                .put("traceId", "4bf92f3577b34da6a3ce929d0e0e4736")
                .put("parentSpanId", "0000000000000001");
        outSteps.addObject()
                .put("stepId", "step-2")
                .put("status", "Failed")
                .put("statusCode", 500)
                .put("elapsedMilliseconds", 45);
        ArrayNode spansArr = outcomeJson.putObject("trace").putArray("spans");
        spansArr.addObject().put("spanId", "s1");
        spansArr.addObject().put("spanId", "s2");

        session.setScenarioConfig(pinnedConfig);
        session.setRunnerReceiptJson(receiptJson);
        session.setExecutionStatus("COMPLETED");
        session.setScenarioStatus("FAILED");
        session.setPublicationGateStatus("HELD_NON_PROMOTED");
        UUID enrichedId = UUID.randomUUID();
        session.setEnrichedModelVersionId(enrichedId);

        RuntimeSessionResponseDTO dto = RuntimeSessionResponseDTO.fromEntity(session);
        assertThat(dto.getEnrichedModelVersionId()).isEqualTo(enrichedId);
        assertThat(dto.getPublicationGateStatus()).isEqualTo("HELD_NON_PROMOTED");
        assertThat(dto.getCapturedSpanCount()).isEqualTo(2);
        assertThat(dto.getStepResults()).hasSize(2);
        assertThat(dto.getStepResults().get(0).getStatus()).isEqualTo("PASSED");
        assertThat(dto.getStepResults().get(0).getStatusCode()).isEqualTo(200);
        assertThat(dto.getStepResults().get(0).getDurationMs()).isEqualTo(14L);
        assertThat(dto.getStepResults().get(1).getStatus()).isEqualTo("FAILED");
        assertThat(dto.getStepResults().get(1).getStatusCode()).isEqualTo(500);
        assertThat(dto.getStepResults().get(1).getFailureReason()).contains("HTTP 500 (expected 201)");
        assertThat(dto.getStepResults().get(1).getPath()).doesNotContain("secret777");
        assertThat(dto.getFailureReason()).doesNotContain("secret777").doesNotContain("hidden123");
        assertThat(String.join(" ", dto.getDiagnostics())).doesNotContain("hidden123");

        // Verify out-of-order container-batch interactions sort chronologically and resolve causalParentMessageIds
    }

    @Test
    @DisplayName("Step 3: Out-of-order OTel container-batch interactions sort chronologically and resolve causalParentMessageIds")
    void outOfOrderContainerBatchInteractionsSortChronologicallyAndResolveCausalParents() {
        UUID serviceCId = UUID.randomUUID();
        ModelElement baseServiceC = ModelElement.builder()
                .id(serviceCId)
                .modelVersion(baseModelVersion)
                .name("ledger-service")
                .elementType("SERVICE_CONTAINER")
                .status("ACTIVE")
                .build();
        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(elementA, elementB, baseServiceC));

        String traceId = "2d9249389ce8d609a63b3411d44440fd";
        RunnerCorrelatedSpanDTO gwClientToOrder = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId("49e9c40e616d2a37")
                .parentSpanId("f65db588bf8464bf")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .startTimeUnixNano("1793542783600924440")
                .durationNanoseconds("651926101")
                .build();
        RunnerCorrelatedSpanDTO invServer = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId("a88572a2dd072d9a")
                .parentSpanId("49e9c40e616d2a37")
                .runtimeService("inventory-service")
                .modelServiceId(serviceBId.toString())
                .startTimeUnixNano("1793542783620651528")
                .durationNanoseconds("631493536")
                .build();
        RunnerCorrelatedSpanDTO invClientToPay = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId("8c860789f2f41e94")
                .parentSpanId("a88572a2dd072d9a")
                .runtimeService("inventory-service")
                .modelServiceId(serviceBId.toString())
                .startTimeUnixNano("1793542784140798127")
                .durationNanoseconds("80190228")
                .build();
        RunnerCorrelatedSpanDTO payServer = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceId)
                .spanId("71e0258e6b933a8f")
                .parentSpanId("8c860789f2f41e94")
                .runtimeService("payment-service")
                .modelServiceId(serviceCId.toString())
                .startTimeUnixNano("1793542784178217004")
                .durationNanoseconds("43368094")
                .build();

        RunnerObservedInteractionDTO downstreamFirst = RunnerObservedInteractionDTO.builder()
                .traceId(traceId)
                .fromService("inventory-service")
                .toService("payment-service")
                .fromModelServiceId(serviceBId.toString())
                .toModelServiceId(serviceCId.toString())
                .parentSpanId("8c860789f2f41e94")
                .childSpanId("71e0258e6b933a8f")
                .build();
        RunnerObservedInteractionDTO upstreamSecond = RunnerObservedInteractionDTO.builder()
                .traceId(traceId)
                .fromService("order-service")
                .toService("inventory-service")
                .fromModelServiceId(serviceAId.toString())
                .toModelServiceId(serviceBId.toString())
                .parentSpanId("49e9c40e616d2a37")
                .childSpanId("a88572a2dd072d9a")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(gwClientToOrder, invServer, invClientToPay, payServer))
                .interactions(List.of(downstreamFirst, upstreamSecond))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Complete")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        runnerReceiptIngestService.ingestRunnerReceiptAck(
                sessionId,
                createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome).build());

        ArgumentCaptor<DiagramVersion> diagCaptor = ArgumentCaptor.forClass(DiagramVersion.class);
        verify(diagramVersionRepository).save(diagCaptor.capture());
        var steps = diagCaptor.getValue().getLayoutJson().path("steps");
        assertThat(steps).hasSize(2);
        assertThat(steps.get(0).path("stepOrder").asInt()).isEqualTo(1);
        assertThat(steps.get(0).path("callerService").asText()).isEqualTo("order-service");
        assertThat(steps.get(0).path("calleeService").asText()).isEqualTo("payment-service");
        assertThat(steps.get(0).path("causalParentMessageIds")).isEmpty();

        assertThat(steps.get(1).path("stepOrder").asInt()).isEqualTo(2);
        assertThat(steps.get(1).path("callerService").asText()).isEqualTo("payment-service");
        assertThat(steps.get(1).path("calleeService").asText()).isEqualTo("ledger-service");
        assertThat(steps.get(1).path("causalParentMessageIds").get(0).asText()).isEqualTo("msg-obs-1");
        filtersDiscoveryHeartbeatsAndResolvesGatewayDownstreamPinnedRoute();
        groupsAsyncDownstreamSpansByScenarioTraceOrderAndEnrichesKafkaChannelAndCalleeRoute();
    }

    private void groupsAsyncDownstreamSpansByScenarioTraceOrderAndEnrichesKafkaChannelAndCalleeRoute() {
        setUp();
        UUID gatewayId = UUID.randomUUID();
        UUID catalogId = UUID.randomUUID();
        UUID notificationId = UUID.randomUUID();
        UUID kafkaTopicId = UUID.randomUUID();

        ModelElement gatewayEl = ModelElement.builder().id(gatewayId).modelVersion(baseModelVersion).name("api-gateway").elementType("SERVICE_CONTAINER").status("ACTIVE").build();
        ModelElement orderEl = ModelElement.builder().id(serviceAId).modelVersion(baseModelVersion).name("order-service").elementType("SERVICE_CONTAINER").status("ACTIVE").build();
        ModelElement catalogEl = ModelElement.builder().id(catalogId).modelVersion(baseModelVersion).name("catalog-service").elementType("SERVICE_CONTAINER").status("ACTIVE").build();
        ModelElement notifEl = ModelElement.builder().id(notificationId).modelVersion(baseModelVersion).name("notification-service").elementType("SERVICE_CONTAINER").status("ACTIVE").build();
        ModelElement topicEl = ModelElement.builder().id(kafkaTopicId).modelVersion(baseModelVersion).name("order.created").elementType("MESSAGE_CHANNEL").status("ACTIVE").build();

        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(gatewayEl, orderEl, catalogEl, notifEl, topicEl));

        ObjectNode deductProps = objectMapper.createObjectNode().put("calleeRoute", "/api/catalog/inventory/deduct").put("httpMethod", "POST");
        ModelRelationship staticOrderToCatalog = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(orderEl)
                .targetElement(catalogEl)
                .relationType("REST_CALL")
                .originLayer("STATIC")
                .properties(deductProps)
                .build();
        ModelRelationship staticOrderToTopic = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(orderEl)
                .targetElement(topicEl)
                .relationType("PUBLISHES_EVENT")
                .originLayer("STATIC")
                .build();
        ModelRelationship staticTopicToNotif = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(topicEl)
                .targetElement(notifEl)
                .relationType("CONSUMES_EVENT")
                .originLayer("STATIC")
                .build();
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(staticOrderToCatalog, staticOrderToTopic, staticTopicToNotif));

        ObjectNode pinnedConfig = objectMapper.createObjectNode();
        ArrayNode pinnedSteps = pinnedConfig.putObject("scenario").putArray("steps");
        pinnedSteps.addObject().put("id", "step-7").put("service", "api-gateway").put("method", "POST").put("path", "/api/order/orders/checkout").put("expectedStatus", 200);
        pinnedSteps.addObject().put("id", "step-9").put("service", "api-gateway").put("method", "PUT").put("path", "/api/order/orders/1/cancel").put("expectedStatus", 200);
        session.setScenarioConfig(pinnedConfig);

        String traceCheckout = "77ad575777ad575777ad575777ad5757";
        String traceCancel = "8fe2e1688fe2e1688fe2e1688fe2e168";

        RunnerCorrelatedSpanDTO gwCheckout = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCheckout).spanId("c001").runtimeService("api-gateway").modelServiceId(gatewayId.toString())
                .scenarioStepId("step-7").startTimeUnixNano("1793542790000000000").durationNanoseconds("50000000").httpStatusCode(200).build();
        RunnerCorrelatedSpanDTO orderCheckout = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCheckout).spanId("c002").parentSpanId("c001").runtimeService("order-service").modelServiceId(serviceAId.toString())
                .scenarioStepId("step-7").startTimeUnixNano("1793542790005000000").durationNanoseconds("40000000").httpStatusCode(200).build();
        RunnerCorrelatedSpanDTO catalogDeduct = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCheckout).spanId("c003").parentSpanId("c002").runtimeService("catalog-service").modelServiceId(catalogId.toString())
                .scenarioStepId("step-7").startTimeUnixNano("1793542790010000000").durationNanoseconds("15000000").httpStatusCode(200).build();
        RunnerCorrelatedSpanDTO notifAsync = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCheckout).spanId("c004").parentSpanId("c002").runtimeService("notification-service").modelServiceId(notificationId.toString())
                .scenarioStepId("step-7").startTimeUnixNano("1793542799000000000").durationNanoseconds("10000000").httpStatusCode(200).build();

        RunnerCorrelatedSpanDTO gwCancel = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCancel).spanId("d001").runtimeService("api-gateway").modelServiceId(gatewayId.toString())
                .scenarioStepId("step-9").startTimeUnixNano("1793542795000000000").durationNanoseconds("25000000").httpStatusCode(200).build();
        RunnerCorrelatedSpanDTO orderCancel = RunnerCorrelatedSpanDTO.builder()
                .traceId(traceCancel).spanId("d002").parentSpanId("d001").runtimeService("order-service").modelServiceId(serviceAId.toString())
                .scenarioStepId("step-9").startTimeUnixNano("1793542795005000000").durationNanoseconds("20000000").httpStatusCode(200).build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(gwCheckout, orderCheckout, catalogDeduct, gwCancel, orderCancel, notifAsync))
                .causalEdges(List.of(
                        new RunnerCausalEdgeDTO(traceCheckout, "c001", "c002"),
                        new RunnerCausalEdgeDTO(traceCheckout, "c002", "c003"),
                        new RunnerCausalEdgeDTO(traceCheckout, "c002", "c004"),
                        new RunnerCausalEdgeDTO(traceCancel, "d001", "d002")))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed").scenarioStatus("Passed").evidenceStatus("Available")
                .cleanupStatus("Confirmed").traceQuality("Complete").mappingStatus("Mapped").trace(trace).build();

        runnerReceiptIngestService.ingestRunnerReceiptAck(
                sessionId,
                createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome).build());

        ArgumentCaptor<DiagramVersion> diagCaptor = ArgumentCaptor.forClass(DiagramVersion.class);
        verify(diagramVersionRepository, atLeastOnce()).save(diagCaptor.capture());
        List<DiagramVersion> savedDiagrams = diagCaptor.getAllValues();
        var steps = savedDiagrams.get(savedDiagrams.size() - 1).getLayoutJson().path("steps");
        assertThat(steps).hasSize(4);
        assertThat(steps.get(0).path("operation").asText()).isEqualTo("/api/order/orders/checkout");
        assertThat(steps.get(1).path("operation").asText()).isEqualTo("/api/catalog/inventory/deduct");
        assertThat(steps.get(2).path("calleeService").asText()).isEqualTo("notification-service");
        assertThat(steps.get(3).path("operation").asText()).isEqualTo("/api/order/orders/1/cancel");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository, atLeastOnce()).saveAll(relCaptor.capture());
        List<ModelRelationship> lastSavedRels = relCaptor.getAllValues().get(relCaptor.getAllValues().size() - 1);
        assertThat(lastSavedRels)
                .filteredOn(r -> "STATIC_AND_RUNTIME".equals(r.getOriginLayer()))
                .extracting(r -> r.getSourceElement().getName() + "->" + r.getTargetElement().getName())
                .contains("order-service->catalog-service", "order-service->order.created", "order.created->notification-service");
    }

    private void filtersDiscoveryHeartbeatsAndResolvesGatewayDownstreamPinnedRoute() {
        setUp();
        UUID gatewayId = UUID.randomUUID();
        UUID discoveryId = UUID.randomUUID();
        ModelElement gatewayEl = ModelElement.builder()
                .id(gatewayId)
                .modelVersion(baseModelVersion)
                .name("api-gateway")
                .elementType("SERVICE_CONTAINER")
                .status("ACTIVE")
                .build();
        ModelElement discoveryEl = ModelElement.builder()
                .id(discoveryId)
                .modelVersion(baseModelVersion)
                .name("service-discovery")
                .elementType("SERVICE_CONTAINER")
                .status("ACTIVE")
                .build();
        when(modelElementRepository.findByModelVersionId(modelVersionId))
                .thenReturn(List.of(gatewayEl, discoveryEl, elementA, elementB));

        ObjectNode pinnedConfig = objectMapper.createObjectNode();
        ArrayNode pinnedSteps = pinnedConfig.putObject("scenario").putArray("steps");
        pinnedSteps.addObject()
                .put("id", "step-checkout")
                .put("service", "api-gateway")
                .put("method", "PUT")
                .put("path", "/api/orders/checkout")
                .put("expectedStatus", 200);
        session.setScenarioConfig(pinnedConfig);

        RunnerCorrelatedSpanDTO gwHeartbeat = RunnerCorrelatedSpanDTO.builder()
                .traceId("11111111111111111111111111111111")
                .spanId("aaaa000000000001")
                .runtimeService("api-gateway")
                .modelServiceId(gatewayId.toString())
                .startTimeUnixNano("1793542780000000000")
                .durationNanoseconds("5000000")
                .build();
        RunnerCorrelatedSpanDTO eurekaServer = RunnerCorrelatedSpanDTO.builder()
                .traceId("11111111111111111111111111111111")
                .spanId("aaaa000000000002")
                .parentSpanId("aaaa000000000001")
                .runtimeService("service-discovery")
                .modelServiceId(discoveryId.toString())
                .startTimeUnixNano("1793542780001000000")
                .durationNanoseconds("4000000")
                .build();

        RunnerCorrelatedSpanDTO gwEntry = RunnerCorrelatedSpanDTO.builder()
                .traceId("22222222222222222222222222222222")
                .spanId("bbbb000000000001")
                .parentSpanId("0000000000000099")
                .runtimeService("api-gateway")
                .modelServiceId(gatewayId.toString())
                .scenarioStepId("step-checkout")
                .startTimeUnixNano("1793542785000000000")
                .durationNanoseconds("30000000")
                .build();
        RunnerCorrelatedSpanDTO orderDownstream = RunnerCorrelatedSpanDTO.builder()
                .traceId("22222222222222222222222222222222")
                .spanId("bbbb000000000002")
                .parentSpanId("bbbb000000000001")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .scenarioStepId("step-checkout")
                .startTimeUnixNano("1793542785005000000")
                .durationNanoseconds("20000000")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(gwHeartbeat, eurekaServer, gwEntry, orderDownstream))
                .causalEdges(List.of(
                        new RunnerCausalEdgeDTO("11111111111111111111111111111111", "aaaa000000000001", "aaaa000000000002"),
                        new RunnerCausalEdgeDTO("22222222222222222222222222222222", "bbbb000000000001", "bbbb000000000002")))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("Complete")
                .mappingStatus("Mapped")
                .trace(trace)
                .build();

        runnerReceiptIngestService.ingestRunnerReceiptAck(
                sessionId,
                createValidReceiptBuilder().imageSourceCorrespondence("Verified").outcome(outcome).build());

        ArgumentCaptor<DiagramVersion> diagCaptor = ArgumentCaptor.forClass(DiagramVersion.class);
        verify(diagramVersionRepository, atLeastOnce()).save(diagCaptor.capture());
        List<DiagramVersion> savedDiagrams = diagCaptor.getAllValues();
        var steps = savedDiagrams.get(savedDiagrams.size() - 1).getLayoutJson().path("steps");
        assertThat(steps).hasSize(1);
        assertThat(steps.get(0).path("stepOrder").asInt()).isEqualTo(1);
        assertThat(steps.get(0).path("callerService").asText()).isEqualTo("api-gateway");
        assertThat(steps.get(0).path("calleeService").asText()).isEqualTo("order-service");
        assertThat(steps.get(0).path("httpMethod").asText()).isEqualTo("PUT");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository, atLeastOnce()).saveAll(relCaptor.capture());
        List<ModelRelationship> lastSavedRels = relCaptor.getAllValues().get(relCaptor.getAllValues().size() - 1);
        assertThat(lastSavedRels)
                .filteredOn(r -> "RUNTIME".equals(r.getOriginLayer()) || "STATIC_AND_RUNTIME".equals(r.getOriginLayer()))
                .extracting(r -> r.getSourceElement().getName() + "->" + r.getTargetElement().getName())
                .containsExactly("api-gateway->order-service");
        assertThat(steps.get(0).path("operation").asText()).isEqualTo("/api/orders/checkout");
    }
}
