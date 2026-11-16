package com.mavis.analyzer.diagram.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.dto.DiagramExportResponseDTO;
import com.mavis.analyzer.diagram.dto.DiagramResponseDTO;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DiagramExportServiceImplTest {

    @Mock
    private DiagramVersionRepository diagramVersionRepository;

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private AccessPolicyService accessPolicyService;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private DiagramExportServiceImpl diagramExportService;

    private UUID diagramId;
    private UUID modelVersionId;
    private UUID snapshotId;
    private UUID projectId;
    private UUID ownerId;
    private Project project;
    private SourceSnapshot snapshot;
    private ModelVersion modelVersion;
    private DiagramVersion diagramVersion;
    private UUID elementAId;
    private UUID elementBId;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(diagramExportService, "accessPolicyService", accessPolicyService);

        diagramId = UUID.randomUUID();
        modelVersionId = UUID.randomUUID();
        snapshotId = UUID.randomUUID();
        projectId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        elementAId = UUID.randomUUID();
        elementBId = UUID.randomUUID();

        User owner = User.builder().id(ownerId).fullName("Dev Lead").build();
        project = Project.builder().id(projectId).name("Order Platform").owner(owner).build();
        snapshot = SourceSnapshot.builder().id(snapshotId).project(project).artifactHash("sha256:abc1234").build();

        modelVersion = ModelVersion.builder()
                .id(modelVersionId)
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .isLatestValid(true)
                .build();

        ObjectNode layout = objectMapper.createObjectNode();
        ArrayNode nodes = layout.putArray("nodes");
        nodes.addObject()
                .put("id", elementAId.toString())
                .put("name", "order-service")
                .put("kind", "SERVICE_CONTAINER")
                .put("type", "SERVICE_CONTAINER")
                .put("languageStack", "Java 21 / Spring Boot")
                .put("x", 120.0)
                .put("y", 150.0);
        nodes.addObject()
                .put("id", elementBId.toString())
                .put("name", "order-db")
                .put("kind", "DATABASE")
                .put("type", "DATABASE")
                .put("x", 450.0)
                .put("y", 150.0);

        ArrayNode edges = layout.putArray("edges");
        edges.addObject()
                .put("id", UUID.randomUUID().toString())
                .put("from", elementAId.toString())
                .put("to", elementBId.toString())
                .put("relationType", "DATABASE_QUERY")
                .put("originLayer", "STATIC");

        diagramVersion = DiagramVersion.builder()
                .id(diagramId)
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(layout)
                .build();

        when(diagramVersionRepository.findById(diagramId)).thenReturn(Optional.of(diagramVersion));
    }

    @Test
    @DisplayName("Ticket B3/T09/T15: Xuất định dạng MERMAID thành công kèm clickable nodeClickMap")
    void testExportDiagram_Mermaid_Success() {
        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, "MERMAID");

        assertThat(response).isNotNull();
        assertThat(response.getFormat()).isEqualTo("MERMAID");
        assertThat(response.getContent()).startsWith("C4Container");
        assertThat(response.getContent()).contains("order-service");
        assertThat(response.getContent()).contains("ContainerDb("); // Database shape
        assertThat(response.getContent()).contains("Rel("); // C4 relationship
        assertThat(response.getContent()).doesNotContain("call onMavisElementClick");
        assertThat(response.getNodeClickMap()).containsKey("n_" + elementAId.toString().replace("-", ""));
        assertThat(response.getNodeClickMap()).containsKey("n_" + elementBId.toString().replace("-", ""));
        verify(accessPolicyService).requireProjectReadAccess(project);
    }

    @Test
    void c4ComponentPreservesParentContainerAndItsComponents() {
        ObjectNode layout = (ObjectNode) diagramVersion.getLayoutJson();
        UUID componentId = UUID.randomUUID();
        ((ArrayNode) layout.path("nodes")).addObject().put("id", componentId.toString())
                .put("name", "OrderController").put("kind", "COMPONENT").put("parentId", elementAId.toString());
        diagramVersion.setLevel("COMPONENT");
        DiagramExportResponseDTO mermaid = diagramExportService.exportDiagramById(diagramId, "MERMAID");
        assertThat(mermaid.getContent()).startsWith("C4Component").contains("Container_Boundary(")
                .contains("Component(n_" + componentId.toString().replace("-", ""));
        assertThat(mermaid.getNodeClickMap()).hasSize(3);
        DiagramExportResponseDTO plant = diagramExportService.exportDiagramById(diagramId, "PLANTUML");
        assertThat(plant.getContent()).contains("package \"order-service components\"").contains("<<Component>>");
    }

    @Test
    void dependencyDiagramRemainsAFlowchart() {
        diagramVersion.setNotation("DEPENDENCY_GRAPH");
        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, "MERMAID");
        assertThat(response.getContent()).startsWith("flowchart LR").contains("-->");
    }
    @Test
    @DisplayName("Ticket B3: Xuất định dạng MERMAID cho UML_SEQUENCE đọc từ mảng steps")
    void testExportDiagram_MermaidSequence_Success() {
        ObjectNode seqLayout = objectMapper.createObjectNode();
        ArrayNode steps = seqLayout.putArray("steps");
        steps.addObject()
                .put("stepOrder", 1)
                .put("callerService", "order-service")
                .put("calleeService", "payment-service")
                .put("operation", "POST /payments")
                .put("httpStatusCode", 200)
                .put("durationMs", 85L);

        DiagramVersion seqDiagram = DiagramVersion.builder()
                .id(UUID.randomUUID())
                .modelVersion(modelVersion)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .layoutJson(seqLayout)
                .build();

        when(diagramVersionRepository.findById(seqDiagram.getId())).thenReturn(Optional.of(seqDiagram));

        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(seqDiagram.getId(), "MERMAID");

        assertThat(response.getContent()).startsWith("sequenceDiagram");
        assertThat(response.getContent()).contains("autonumber");
        assertThat(response.getContent()).contains("participant order_service as order-service");
        assertThat(response.getContent()).contains("participant payment_service as payment-service");
        assertThat(response.getContent()).contains("order_service->>+payment_service: [1] POST /payments (200 - 85ms)");
    }

    @Test
    @DisplayName("Ticket B3: Xuất định dạng PLANTUML thành công")
    void testExportDiagram_PlantUml_Success() {
        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, "PLANTUML");

        assertThat(response).isNotNull();
        assertThat(response.getFormat()).isEqualTo("PLANTUML");
        assertThat(response.getContent()).startsWith("@startuml");
        assertThat(response.getContent()).contains("<<Container>>");
        assertThat(response.getContent()).contains("rectangle \"order-service");
        assertThat(response.getContent()).contains("database \"order-db");
        assertThat(response.getContent()).contains("-->");
        assertThat(response.getContent()).endsWith("@enduml\n");
    }

    @Test
    @DisplayName("Ticket B3/T15: Xuất định dạng DRAWIO_XML thành công với tọa độ x/y")
    void testExportDiagram_DrawioXml_Success() {
        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, "DRAWIO_XML");

        assertThat(response).isNotNull();
        assertThat(response.getFormat()).isEqualTo("DRAWIO_XML");
        assertThat(response.getContent()).startsWith("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        assertThat(response.getContent()).contains("<mxfile");
        assertThat(response.getContent()).contains("<diagram");
        assertThat(response.getContent()).contains("<mxGraphModel");
        assertThat(response.getContent()).contains("x=\"120.0\" y=\"150.0\"");
        assertThat(response.getContent()).contains("order-service");
        assertThat(response.getContent()).contains("order-db");
        assertThat(response.getContent()).contains("DATABASE_QUERY");
        assertThat(response.getContent()).contains("</mxGraphModel>");
    }

    @Test
    @DisplayName("Ticket B3: Xuất định dạng JSON có đầy đủ provenance")
    void testExportDiagram_Json_Success() {
        DiagramExportResponseDTO response = diagramExportService.exportDiagramById(diagramId, "JSON");

        assertThat(response).isNotNull();
        assertThat(response.getFormat()).isEqualTo("JSON");
        assertThat(response.getContent()).contains("\"diagramId\"");
        assertThat(response.getContent()).contains("\"modelVersionId\"");
        assertThat(response.getContent()).contains("\"modelRevision\"");
        assertThat(response.getContent()).contains("\"layoutJson\"");
    }

    @Test
    @DisplayName("Từ chối định dạng xuất không hợp lệ")
    void testExportDiagram_UnsupportedFormat_ThrowsBadRequest() {
        assertThatThrownBy(() -> diagramExportService.exportDiagramById(diagramId, "PDF_INVALID"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Định dạng xuất không được hỗ trợ");
    }

    @Test
    @DisplayName("Ném NOT_FOUND khi diagramId không tồn tại")
    void testExportDiagram_NotFound_ThrowsNotFound() {
        UUID nonExistent = UUID.randomUUID();
        when(diagramVersionRepository.findById(nonExistent)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> diagramExportService.exportDiagramById(nonExistent, "MERMAID"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không tìm thấy sơ đồ với ID");
    }

    @Test
    @DisplayName("Ném FORBIDDEN khi người dùng không có quyền đọc đồ án")
    void testExportDiagram_Forbidden_ThrowsForbidden() {
        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "Access denied"))
                .when(accessPolicyService).requireProjectReadAccess(project);

        assertThatThrownBy(() -> diagramExportService.exportDiagramById(diagramId, "MERMAID"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Access denied");
    }

    @Test
    @DisplayName("Ticket T09/T15: generateOrGet4Plus1DeploymentDiagram tạo mới sơ đồ DEPLOYMENT nếu chưa có")
    void testGenerateOrGet4Plus1DeploymentDiagram_CreatesNew() {
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        when(diagramVersionRepository.findByModelVersionId(modelVersionId)).thenReturn(Collections.emptyList());

        ModelElement elA = ModelElement.builder().id(elementAId).modelVersion(modelVersion).name("order-service").elementType("SERVICE_CONTAINER").status("ACTIVE").build();
        ModelElement elB = ModelElement.builder().id(elementBId).modelVersion(modelVersion).name("order-db").elementType("DATABASE").status("ACTIVE").build();
        when(modelElementRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(elA, elB));

        ModelRelationship rel = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(modelVersion)
                .sourceElement(elA)
                .targetElement(elB)
                .relationType("DATABASE_ACCESS")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();
        when(modelRelationshipRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(rel));

        when(diagramVersionRepository.save(any(DiagramVersion.class))).thenAnswer(inv -> {
            DiagramVersion d = inv.getArgument(0);
            d.setId(UUID.randomUUID());
            return d;
        });

        DiagramResponseDTO result = diagramExportService.generateOrGet4Plus1DeploymentDiagram(modelVersionId);

        assertThat(result).isNotNull();
        assertThat(result.getNotation()).isEqualTo("VIEW_4_PLUS_1");
        assertThat(result.getLevel()).isEqualTo("DEPLOYMENT");
        assertThat(result.getLayoutJson().path("nodes")).hasSize(2);
        verify(diagramVersionRepository).save(any(DiagramVersion.class));
    }

    @Test
    @DisplayName("Ticket T09/T15: generateOrGet4Plus1DeploymentDiagram trả về sơ đồ DEPLOYMENT đã có sẵn")
    void testGenerateOrGet4Plus1DeploymentDiagram_ReturnsExisting() {
        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));

        DiagramVersion existingDeployment = DiagramVersion.builder()
                .id(UUID.randomUUID())
                .modelVersion(modelVersion)
                .notation("VIEW_4_PLUS_1")
                .level("DEPLOYMENT")
                .layoutJson(objectMapper.createObjectNode())
                .build();

        when(diagramVersionRepository.findByModelVersionId(modelVersionId)).thenReturn(List.of(existingDeployment));

        DiagramResponseDTO result = diagramExportService.generateOrGet4Plus1DeploymentDiagram(modelVersionId);

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo(existingDeployment.getId());
        verify(diagramVersionRepository, never()).save(any(DiagramVersion.class));
    }

    @Test
    @DisplayName("RF-02/SR-07: Guided Lab student receives BAD_REQUEST when exporting behavioral UML or 4+1 diagrams")
    void guidedStudentCannotExportBehavioralDiagrams() {
        project.setWorkspace(Workspace.builder().id(UUID.randomUUID()).courseMode(true).build());
        project.setProjectType("STUDENT_WORKING");
        when(accessPolicyService.requireCurrentActiveUser()).thenReturn(User.builder()
                .role(Role.builder().code("STUDENT").build()).build());

        for (String notation : List.of("UML_SEQUENCE", "UML_ACTIVITY", "UML_STATE", "VIEW_4_PLUS_1")) {
            UUID blockedId = UUID.randomUUID();
            DiagramVersion blocked = DiagramVersion.builder().id(blockedId).modelVersion(modelVersion)
                    .notation(notation).level("ALL").layoutJson(objectMapper.createObjectNode()).build();
            when(diagramVersionRepository.findById(blockedId)).thenReturn(Optional.of(blocked));
            assertThatThrownBy(() -> diagramExportService.exportDiagramById(blockedId, "MERMAID"))
                    .isInstanceOfSatisfying(BusinessException.class,
                            err -> assertThat(err.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST));
        }

        when(modelVersionRepository.findById(modelVersionId)).thenReturn(Optional.of(modelVersion));
        assertThatThrownBy(() -> diagramExportService.generateOrGet4Plus1DeploymentDiagram(modelVersionId))
                .isInstanceOfSatisfying(BusinessException.class,
                        err -> assertThat(err.getErrorCode()).isEqualTo(ErrorCode.BAD_REQUEST));
    }
}
