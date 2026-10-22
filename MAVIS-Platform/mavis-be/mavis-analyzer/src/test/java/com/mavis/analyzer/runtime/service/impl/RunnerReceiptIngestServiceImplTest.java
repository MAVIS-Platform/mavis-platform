package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
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
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

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
    private ModelRelationship staticRelBC;

    private final String validResourceProject = "mavisrun-0123456789abcdef0123456789abcdef";

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
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        ModelElement elementC = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .build();

        staticRelBC = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(elementB)
                .targetElement(elementC)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        ReflectionTestUtils.setField(runnerReceiptIngestService, "runnerStateRoot", tempStateRoot.toString());
    }

    @Test
    @DisplayName("KỊCH BẢN 1: Ingest receipt thành công với durationNanoseconds = '82500000' -> 82ms và modelServiceId chuẩn")
    void testIngestRunnerReceipt_Success_ConvertsDurationAndPreservesModelServiceId() {
        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("00f067aa0ba902b7")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .spanId("5fb397be34d23b7a")
                .parentSpanId("00f067aa0ba902b7")
                .runtimeService("payment-service")
                .modelServiceId(serviceBId.toString())
                .durationNanoseconds("82500000") // 82.5ms -> 82ms
                .httpStatusCode(200)
                .build();

        RunnerCausalEdgeDTO edge = RunnerCausalEdgeDTO.builder()
                .traceId("4bf92f3577b34da6a3ce929d0e0e4736")
                .parentSpanId("00f067aa0ba902b7")
                .childSpanId("5fb397be34d23b7a")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .modelVersionId(modelVersionId.toString())
                .spans(List.of(spanA, spanB))
                .causalEdges(List.of(edge))
                .warnings(List.of("TRACE_OK"))
                .build();

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .diagnostics(List.of("ALL_TESTS_PASSED"))
                .trace(trace)
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .resourceProject(validResourceProject)
                .sandboxEnforcementConfirmed(true)
                .outcome(outcome)
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(UUID.randomUUID());
            return mv;
        });
        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(elementA, elementB));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(staticRelAB));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        assertThat(response).isNotNull();
        assertThat(session.getScenarioStatus()).isEqualTo("PASSED");
        assertThat(session.getExecutionStatus()).isEqualTo("COMPLETED");
        assertThat(session.getCleanupStatus()).isEqualTo("CONFIRMED");
        assertThat(session.getTraceStatus()).isEqualTo("COMPLETE");

        // Kiểm tra chuyển đổi nanoseconds sang ms: 82500000ns -> 82ms trong Evidence excerpt
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Evidence>> evidenceCaptor = ArgumentCaptor.forClass(List.class);
        verify(evidenceRepository).saveAll(evidenceCaptor.capture());
        List<Evidence> savedEvidences = evidenceCaptor.getValue();
        assertThat(savedEvidences).isNotEmpty();
        assertThat(savedEvidences.get(0).getExcerpt()).contains("82ms");
    }

    @Test
    @DisplayName("KỊCH BẢN 2: Khi scenarioStatus = 'NotRun' (startup failure), RuntimeSession.scenarioStatus phải là FAILED (không thành PASSED)")
    void testIngestRunnerReceipt_ScenarioNotRun_SetsScenarioStatusToFailed() {
        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Failed")
                .scenarioStatus("NotRun") // Docker container không khởi động được
                .evidenceStatus("Unavailable")
                .cleanupStatus("Confirmed")
                .traceQuality("Unavailable")
                .mappingStatus("Unavailable")
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .resourceProject(validResourceProject)
                .outcome(outcome)
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(UUID.randomUUID());
            return mv;
        });

        runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        // Tuyệt đối không để mặc định PASSED biến startup failure thành scenario pass
        assertThat(session.getScenarioStatus()).isEqualTo("FAILED");
        assertThat(session.getExecutionStatus()).isEqualTo("FAILED");
        assertThat(session.getTraceStatus()).isEqualTo("NONE");
    }

    @Test
    @DisplayName("KỊCH BẢN 3: Gửi lại cùng 1 receipt lần 2 (Idempotent replay) không sinh thêm ModelVersion thứ hai")
    void testIngestRunnerReceipt_IdempotentReplay_DoesNotDuplicateModelVersion() {
        session.setRunnerReceiptJson(objectMapper.createObjectNode().put("alreadyProcessed", true));

        ModelVersion existingEnriched = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(project)
                .revision(2)
                .origin("RUNTIME_ENRICHED")
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .resourceProject(validResourceProject)
                .outcome(RunnerOutcomeDTO.builder().executionStatus("Completed").scenarioStatus("Passed").build())
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId))
                .thenReturn(Optional.of(existingEnriched));

        ModelVersionResponseDTO response = runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        assertThat(response).isNotNull();
        assertThat(response.getId()).isEqualTo(existingEnriched.getId());
        verify(modelVersionRepository, never()).save(any());
        verify(modelVersionRepository, never()).invalidatePreviousVersions(any(), any());
    }

    @Test
    @DisplayName("KỊCH BẢN 4: Receipt sai sessionId hoặc sourceSnapshotId bị từ chối 400 (WJ-02)")
    void testIngestRunnerReceipt_ScopeMismatch_ThrowsBadRequest() {
        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));

        // Sai sessionId
        RunnerReceiptIngestRequestDTO wrongSessionReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(UUID.randomUUID().toString())
                .sourceSnapshotId(snapshotId.toString())
                .build();

        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, wrongSessionReceipt))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Runner receipt scope mismatch");

        // Sai sourceSnapshotId
        RunnerReceiptIngestRequestDTO wrongSnapshotReceipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(UUID.randomUUID().toString())
                .build();

        assertThatThrownBy(() -> runnerReceiptIngestService.ingestRunnerReceipt(sessionId, wrongSnapshotReceipt))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Runner receipt scope mismatch");
    }

    @Test
    @DisplayName("KỊCH BẢN 5: Bảo toàn 100% các cạnh STATIC chưa đi qua trong runtime (WJ-04)")
    void testIngestRunnerReceipt_PreservesStaticRelationshipsNotTraversed() {
        // Trace chỉ ghi nhận tương tác giữa elementA -> elementB
        RunnerCorrelatedSpanDTO spanA = RunnerCorrelatedSpanDTO.builder()
                .traceId("trace123")
                .spanId("span1")
                .runtimeService("order-service")
                .modelServiceId(serviceAId.toString())
                .build();

        RunnerCorrelatedSpanDTO spanB = RunnerCorrelatedSpanDTO.builder()
                .traceId("trace123")
                .spanId("span2")
                .parentSpanId("span1")
                .runtimeService("payment-service")
                .modelServiceId(serviceBId.toString())
                .durationNanoseconds("50000000")
                .build();

        RunnerTraceCorrelationDTO trace = RunnerTraceCorrelationDTO.builder()
                .sessionId(sessionId.toString())
                .spans(List.of(spanA, spanB))
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

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .resourceProject(validResourceProject)
                .outcome(outcome)
                .build();

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(UUID.randomUUID());
            return mv;
        });
        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(elementA, elementB, staticRelBC.getTargetElement()));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        // Base version có 2 cạnh tĩnh: AB và BC
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(staticRelAB, staticRelBC));

        runnerReceiptIngestService.ingestRunnerReceipt(sessionId, receipt);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());
        List<ModelRelationship> savedRels = relCaptor.getValue();

        // Cả 2 cạnh đều được bảo toàn 100%! Cạnh AB được nâng cấp STATIC_AND_RUNTIME, cạnh BC vẫn là STATIC
        assertThat(savedRels).hasSize(2);
        ModelRelationship relAB = savedRels.stream()
                .filter(r -> r.getSourceElement().getName().equals("order-service"))
                .findFirst().orElseThrow();
        ModelRelationship relBC = savedRels.stream()
                .filter(r -> r.getSourceElement().getName().equals("payment-service"))
                .findFirst().orElseThrow();

        assertThat(relAB.getOriginLayer()).isEqualTo("STATIC_AND_RUNTIME");
        assertThat(relBC.getOriginLayer()).isEqualTo("STATIC"); // Tuyệt đối không bị xóa!
    }

    @Test
    @DisplayName("KỊCH BẢN 6: importReceiptFromStateRoot nhập receipt thành công từ thư mục outbox <state-root>/receipts/<resourceProject>.json")
    void testImportReceiptFromStateRoot_ReadsFromOutbox() throws IOException {
        Path receiptsDir = Files.createDirectories(tempStateRoot.resolve("receipts"));
        Path receiptFile = receiptsDir.resolve(validResourceProject + ".json");

        RunnerOutcomeDTO outcome = RunnerOutcomeDTO.builder()
                .executionStatus("Completed")
                .scenarioStatus("Passed")
                .evidenceStatus("Available")
                .cleanupStatus("Confirmed")
                .traceQuality("CompleteForCapturedData")
                .mappingStatus("Mapped")
                .build();

        RunnerReceiptIngestRequestDTO receipt = RunnerReceiptIngestRequestDTO.builder()
                .sessionId(sessionId.toString())
                .sourceSnapshotId(snapshotId.toString())
                .modelVersionId(modelVersionId.toString())
                .resourceProject(validResourceProject)
                .outcome(outcome)
                .build();

        Files.writeString(receiptFile, objectMapper.writeValueAsString(receipt));

        when(runtimeSessionRepository.findById(sessionId)).thenReturn(Optional.of(session));
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(projectId)).thenReturn(1);
        when(modelVersionRepository.save(any(ModelVersion.class))).thenAnswer(inv -> {
            ModelVersion mv = inv.getArgument(0);
            mv.setId(UUID.randomUUID());
            return mv;
        });

        RuntimeSessionResponseDTO response = runnerReceiptIngestService.importReceiptFromStateRoot(sessionId, validResourceProject);

        assertThat(response).isNotNull();
        assertThat(session.getExecutionStatus()).isEqualTo("COMPLETED");
        assertThat(session.getScenarioStatus()).isEqualTo("PASSED");
    }
}
