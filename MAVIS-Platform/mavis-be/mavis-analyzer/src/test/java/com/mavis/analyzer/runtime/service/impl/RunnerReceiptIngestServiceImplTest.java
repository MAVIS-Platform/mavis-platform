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
                .sandboxEnforcementConfirmed(true);
    }

    @Test
    @DisplayName("CHẶNG 11: Tiếp nhận RunnerReceipt thành công và lưu receiptDigest 64-hex")
    void testIngestRunnerReceipt_Success_SavesDigestAndEnrichesModel() {
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
                .outcome(outcome)
                .build();

        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        assertThat(response).isNotNull();
        assertThat(session.getReceiptDigest()).isNotNull();
        assertThat(session.getReceiptDigest()).startsWith("sha256:");
        assertThat(session.getPublicationGateStatus()).isEqualTo("PROMOTED");
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

        RunnerReceiptIngestRequestDTO receipt = createValidReceiptBuilder()
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
}
