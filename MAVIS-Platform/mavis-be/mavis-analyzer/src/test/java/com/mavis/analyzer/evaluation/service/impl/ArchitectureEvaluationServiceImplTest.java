package com.mavis.analyzer.evaluation.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.dto.EvaluationRunResponseDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ArchitectureEvaluationServiceImplTest {

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private EvaluationRunRepository evaluationRunRepository;

    @Mock
    private EvaluationFindingRepository evaluationFindingRepository;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private com.mavis.common.security.AccessPolicyService accessPolicy;

    @InjectMocks
    private ArchitectureEvaluationServiceImpl evaluationService;

    private UUID modelVersionId;
    private ModelVersion modelVersion;

    @BeforeEach
    void setUp() {
        modelVersionId = UUID.randomUUID();
        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .revision(1)
                .build();

        lenient().when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        lenient().when(evaluationRunRepository.save(any(EvaluationRun.class)))
                .thenAnswer(invocation -> {
                    EvaluationRun run = invocation.getArgument(0);
                    run.setId(UUID.randomUUID());
                    return run;
                });
        lenient().when(evaluationFindingRepository.saveAll(anyList()))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    @DisplayName("QUY TẮC 1-5 HOÀN HẢO: Tất cả 5 quy tắc đều PASS -> complianceScore = 100.0")
    void testEvaluateModel_AllRulesPass_ShouldReturn100Score() {
        // Arrange: 2 services, 1 DB riêng cho Service B, Service A gọi Service B (có evidence), Service B truy cập DB (có evidence)
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("order-service").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("payment-service").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement dbB = ModelElement.builder().id(UUID.randomUUID()).name("payment-db").elementType("DATABASE").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB, dbB);

        ModelRelationship relHttp = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(serviceA)
                .targetElement(serviceB)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship relDb = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(serviceB)
                .targetElement(dbB)
                .relationType("DATABASE_ACCESS")
                .build();

        List<ModelRelationship> relationships = List.of(relHttp, relDb);

        Evidence evHttp = Evidence.builder().id(UUID.randomUUID()).relationship(relHttp).sourceType("CODE").locator("OrderClient.java:25").build();
        Evidence evDb = Evidence.builder().id(UUID.randomUUID()).relationship(relDb).sourceType("CONFIG").locator("application.yml:10").build();
        List<Evidence> evidences = List.of(evHttp, evDb);

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(evidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        assertThat(response.getComplianceScore()).isEqualTo(100.0);
        assertThat(response.getSummaryMetrics().get("passedCount").asInt()).isEqualTo(5);
        assertThat(response.getSummaryMetrics().get("violationCount").asInt()).isEqualTo(0);
        assertThat(response.getSummaryMetrics().get("needsReviewCount").asInt()).isEqualTo(0);
        assertThat(response.getFindings()).hasSize(5);

        for (EvaluationFindingResponseDTO finding : response.getFindings()) {
            assertThat(finding.getStatus()).isEqualTo("PASS");
        }
    }

    @Test
    @DisplayName("RULE-01 (NO_CYCLIC_SERVICE_DEPENDENCY): DFS 3 màu phát hiện chu trình vòng lặp giữa các dịch vụ")
    void testRule01_CyclicDependencyDetection_ShouldDetectCycleAndReturnViolation() {
        // Arrange: Service A -> Service B -> Service C -> Service A (chu trình 3 node)
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("service-a").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("service-b").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceC = ModelElement.builder().id(UUID.randomUUID()).name("service-c").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB, serviceC);

        ModelRelationship relAB = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceA).targetElement(serviceB).relationType("SERVICE_HTTP_CALL").build();
        ModelRelationship relBC = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceB).targetElement(serviceC).relationType("SERVICE_HTTP_CALL").build();
        ModelRelationship relCA = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceC).targetElement(serviceA).relationType("SERVICE_HTTP_CALL").build();

        List<ModelRelationship> relationships = List.of(relAB, relBC, relCA);

        // Đính kèm bằng chứng cho tất cả để RULE-04 không bị vi phạm
        List<Evidence> evidences = List.of(
                Evidence.builder().id(UUID.randomUUID()).relationship(relAB).sourceType("CODE").locator("A.java:1").build(),
                Evidence.builder().id(UUID.randomUUID()).relationship(relBC).sourceType("CODE").locator("B.java:1").build(),
                Evidence.builder().id(UUID.randomUUID()).relationship(relCA).sourceType("CODE").locator("C.java:1").build()
        );

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(evidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        // RULE-01 vi phạm (ERROR: -20 điểm) -> Điểm còn 80.0
        assertThat(response.getComplianceScore()).isEqualTo(80.0);
        assertThat(response.getSummaryMetrics().get("violationCount").asInt()).isEqualTo(1);

        EvaluationFindingResponseDTO rule01Finding = response.getFindings().stream()
                .filter(f -> "RULE-01".equals(f.getRuleId()))
                .findFirst()
                .orElseThrow();

        assertThat(rule01Finding.getStatus()).isEqualTo("VIOLATION");
        assertThat(rule01Finding.getSeverity()).isEqualTo("ERROR");
        assertThat(rule01Finding.getMessage()).contains("Cyclic Service Dependency");
        assertThat(rule01Finding.getMessage()).contains("service-a");
        assertThat(rule01Finding.getMessage()).contains("service-b");
        assertThat(rule01Finding.getMessage()).contains("service-c");
    }

    @Test
    @DisplayName("RULE-02 (NO_SHARED_DATABASE_ANTI_PATTERN): Phát hiện cơ sở dữ liệu bị >= 2 dịch vụ cùng truy cập")
    void testRule02_SharedDatabaseAntiPattern_ShouldDetectSharedDatabaseViolation() {
        // Arrange: Service A và Service B cùng truy cập chung database 'shared-mysql'
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("order-service").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("inventory-service").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement sharedDb = ModelElement.builder().id(UUID.randomUUID()).name("shared-mysql").elementType("DATABASE").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB, sharedDb);

        ModelRelationship relAtoDb = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceA).targetElement(sharedDb).relationType("DATABASE_ACCESS").build();
        ModelRelationship relBtoDb = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceB).targetElement(sharedDb).relationType("DATABASE_ACCESS").build();
        List<ModelRelationship> relationships = List.of(relAtoDb, relBtoDb);

        List<Evidence> evidences = List.of(
                Evidence.builder().id(UUID.randomUUID()).relationship(relAtoDb).sourceType("CONFIG").locator("order:app.yml").build(),
                Evidence.builder().id(UUID.randomUUID()).relationship(relBtoDb).sourceType("CONFIG").locator("inv:app.yml").build()
        );

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(evidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        // RULE-02 vi phạm (WARNING: -10 điểm) -> Điểm 90.0
        assertThat(response.getComplianceScore()).isEqualTo(90.0);

        EvaluationFindingResponseDTO rule02Finding = response.getFindings().stream()
                .filter(f -> "RULE-02".equals(f.getRuleId()))
                .findFirst()
                .orElseThrow();

        assertThat(rule02Finding.getStatus()).isEqualTo("VIOLATION");
        assertThat(rule02Finding.getSeverity()).isEqualTo("WARNING");
        assertThat(rule02Finding.getMessage()).contains("Shared Database Anti-Pattern");
        assertThat(rule02Finding.getMessage()).contains("shared-mysql");
        assertThat(rule02Finding.getMessage()).contains("order-service");
        assertThat(rule02Finding.getMessage()).contains("inventory-service");
    }

    @Test
    @DisplayName("RULE-03 (ISOLATED_SERVICE_WARNING): Phát hiện dịch vụ bị cô lập có bậc vào = 0 và bậc ra = 0")
    void testRule03_IsolatedServiceWarning_ShouldFlagIsolatedService() {
        // Arrange: Service A kết nối Service B. Service C hoàn toàn đứng một mình (cô lập)
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("service-a").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("service-b").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceIsolated = ModelElement.builder().id(UUID.randomUUID()).name("isolated-service").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB, serviceIsolated);

        ModelRelationship relAB = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceA).targetElement(serviceB).relationType("SERVICE_HTTP_CALL").build();
        List<ModelRelationship> relationships = List.of(relAB);

        List<Evidence> evidences = List.of(
                Evidence.builder().id(UUID.randomUUID()).relationship(relAB).sourceType("CODE").locator("A.java:10").build()
        );

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(evidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        // RULE-03 cảnh báo NEEDS_REVIEW (-5 điểm) -> Điểm 95.0
        assertThat(response.getComplianceScore()).isEqualTo(95.0);

        EvaluationFindingResponseDTO rule03Finding = response.getFindings().stream()
                .filter(f -> "RULE-03".equals(f.getRuleId()))
                .findFirst()
                .orElseThrow();

        assertThat(rule03Finding.getStatus()).isEqualTo("NEEDS_REVIEW");
        assertThat(rule03Finding.getSeverity()).isEqualTo("INFO");
        assertThat(rule03Finding.getElementName()).isEqualTo("isolated-service");
        assertThat(rule03Finding.getMessage()).contains("isolated-service");
        assertThat(rule03Finding.getMessage()).contains("cô lập");
    }

    @Test
    @DisplayName("RULE-04 (EVIDENCE_GROUNDING_CHECK): Phát hiện cạnh HTTP hoặc DB thiếu Evidence trích xuất mã nguồn")
    void testRule04_EvidenceGroundingCheck_ShouldFlagUngroundedEdge() {
        // Arrange: Service A gọi Service B nhưng cạnh relAB không có bất kỳ Evidence nào
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("service-a").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("service-b").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB);

        ModelRelationship relAB = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceA).targetElement(serviceB).relationType("SERVICE_HTTP_CALL").build();
        List<ModelRelationship> relationships = List.of(relAB);

        // Rỗng -> Không có bằng chứng cho relAB
        List<Evidence> emptyEvidences = Collections.emptyList();

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(emptyEvidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        // RULE-04 vi phạm WARNING (-10 điểm) -> Điểm 90.0
        assertThat(response.getComplianceScore()).isEqualTo(90.0);

        EvaluationFindingResponseDTO rule04Finding = response.getFindings().stream()
                .filter(f -> "RULE-04".equals(f.getRuleId()))
                .findFirst()
                .orElseThrow();

        assertThat(rule04Finding.getStatus()).isEqualTo("VIOLATION");
        assertThat(rule04Finding.getSeverity()).isEqualTo("WARNING");
        assertThat(rule04Finding.getRelationshipId()).isEqualTo(relAB.getId());
        assertThat(rule04Finding.getMessage()).contains("Missing Evidence Grounding");
    }

    @Test
    @DisplayName("RULE-05 (UNCERTAIN_MAPPING_CHECK): Phát hiện phần tử đang ở trạng thái UNCERTAIN_MAPPING")
    void testRule05_UncertainMappingCheck_ShouldFlagUncertainElements() {
        // Arrange: Service A có status = "UNCERTAIN_MAPPING"
        ModelElement serviceA = ModelElement.builder().id(UUID.randomUUID()).name("mystery-service").elementType("SERVICE_CONTAINER").status("UNCERTAIN_MAPPING").build();
        ModelElement serviceB = ModelElement.builder().id(UUID.randomUUID()).name("service-b").elementType("SERVICE_CONTAINER").status("CONFIRMED").build();

        List<ModelElement> elements = List.of(serviceA, serviceB);

        ModelRelationship relAB = ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(serviceA).targetElement(serviceB).relationType("SERVICE_HTTP_CALL").build();
        List<ModelRelationship> relationships = List.of(relAB);

        List<Evidence> evidences = List.of(
                Evidence.builder().id(UUID.randomUUID()).relationship(relAB).sourceType("CODE").locator("M.java:1").build()
        );

        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(elements);
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(relationships);
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(evidences);

        // Act
        EvaluationRunResponseDTO response = evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert
        assertThat(response).isNotNull();
        // RULE-05 cảnh báo NEEDS_REVIEW (-5 điểm) -> Điểm 95.0
        assertThat(response.getComplianceScore()).isEqualTo(95.0);

        EvaluationFindingResponseDTO rule05Finding = response.getFindings().stream()
                .filter(f -> "RULE-05".equals(f.getRuleId()))
                .findFirst()
                .orElseThrow();

        assertThat(rule05Finding.getStatus()).isEqualTo("NEEDS_REVIEW");
        assertThat(rule05Finding.getSeverity()).isEqualTo("INFO");
        assertThat(rule05Finding.getElementName()).isEqualTo("mystery-service");
        assertThat(rule05Finding.getMessage()).contains("UNCERTAIN_MAPPING");
    }

    @Test
    @DisplayName("QUY TẮC HIỆU NĂNG: Chỉ nạp 3 query lên RAM và lưu toàn bộ findings bằng saveAll() duy nhất")
    void testPerformanceAndBatchSave_ShouldLoad3QueriesAndSaveAllOnce() {
        // Arrange
        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());
        when(evidenceRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());

        // Act
        evaluationService.evaluateModel(modelVersionId, "1.0");

        // Assert: 3 câu query nạp lên RAM được gọi ĐÚNG 1 LẦN
        verify(modelElementRepository, times(1)).findByModelVersionId(modelVersionId);
        verify(modelRelationshipRepository, times(1)).findByModelVersionId(modelVersionId);
        verify(evidenceRepository, times(1)).findByModelVersionId(modelVersionId);

        // Assert: saveAll() được gọi ĐÚNG 1 LẦN duy nhất
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<EvaluationFinding>> captor = ArgumentCaptor.forClass(List.class);
        verify(evaluationFindingRepository, times(1)).saveAll(captor.capture());

        List<EvaluationFinding> savedFindings = captor.getValue();
        assertThat(savedFindings).hasSize(5); // 5 rule findings
    }

    @Test
    @DisplayName("ĐỌC DỮ LIỆU: getEvaluationsByModelVersion và getFindingsByEvaluationRunId")
    void testReadMethods_ShouldReturnMappedDtos() {
        UUID runId = UUID.randomUUID();
        EvaluationRun run = EvaluationRun.builder()
                .id(runId)
                .modelVersion(modelVersion)
                .ruleSetVersion("1.0")
                .summaryMetrics(objectMapper.createObjectNode().put("complianceScore", 95.0))
                .build();

        EvaluationFinding finding = EvaluationFinding.builder()
                .id(UUID.randomUUID())
                .evaluationRun(run)
                .ruleId("RULE-01")
                .severity("INFO")
                .status("PASS")
                .message("Test pass finding")
                .build();

        when(evaluationRunRepository.findByModelVersionIdOrderByCreatedAtDesc(modelVersionId))
                .thenReturn(List.of(run));
        when(evaluationFindingRepository.findByEvaluationRunId(runId))
                .thenReturn(List.of(finding));
        when(evaluationRunRepository.findById(runId))
                .thenReturn(Optional.of(run));

        List<EvaluationRunResponseDTO> runs = evaluationService.getEvaluationsByModelVersion(modelVersionId);
        assertThat(runs).hasSize(1);
        assertThat(runs.get(0).getId()).isEqualTo(runId);
        assertThat(runs.get(0).getComplianceScore()).isEqualTo(95.0);

        List<EvaluationFindingResponseDTO> findings = evaluationService.getFindingsByEvaluationRunId(runId);
        assertThat(findings).hasSize(1);
        assertThat(findings.get(0).getRuleId()).isEqualTo("RULE-01");
        assertThat(findings.get(0).getStatus()).isEqualTo("PASS");

        EvaluationRunResponseDTO detail = evaluationService.getEvaluationRunById(runId);
        assertThat(detail.getId()).isEqualTo(runId);
        assertThat(detail.getFindings()).hasSize(1);
    }
}
