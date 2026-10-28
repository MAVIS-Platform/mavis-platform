package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class DiagramExportApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private WorkspaceRepository workspaceRepository;

    @Autowired
    private AssignmentRepository assignmentRepository;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private SourceSnapshotRepository sourceSnapshotRepository;

    @Autowired
    private ModelVersionRepository modelVersionRepository;

    @Autowired
    private ModelElementRepository modelElementRepository;

    @Autowired
    private ModelRelationshipRepository modelRelationshipRepository;

    @Autowired
    private DiagramVersionRepository diagramVersionRepository;

    @Autowired
    private SubmissionSnapshotRepository submissionSnapshotRepository;

    @Autowired
    private EvaluationRunRepository evaluationRunRepository;

    @Autowired
    private RuntimeSessionRepository runtimeSessionRepository;

    @Autowired
    private FeedbackCommentRepository feedbackCommentRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL STAGE 9 API TEST: Export (Mermaid, PlantUML, Drawio, JSON) -> 4+1 Deployment -> Submission Export Bundle")
    void testDiagramExportAndSubmissionBundleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        Role lecturerRole = roleRepository.findByCode("LECTURER")
                .orElseGet(() -> roleRepository.save(Role.builder().code("LECTURER").name("Lecturer").build()));

        User student = userRepository.saveAndFlush(User.builder()
                .email("export_student_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("Nguyen Van Export")
                .role(studentRole)
                .build());

        User lecturer = userRepository.saveAndFlush(User.builder()
                .email("export_lecturer_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("Thay Giao Cham Bai")
                .role(lecturerRole)
                .build());

        Workspace workspace = workspaceRepository.saveAndFlush(Workspace.builder()
                .name("Kien Truc Microservices K19")
                .code("SE1901_" + UUID.randomUUID().toString().substring(0, 4))
                .createdBy(lecturer)
                .build());

        Assignment assignment = assignmentRepository.saveAndFlush(Assignment.builder()
                .workspace(workspace)
                .createdBy(lecturer)
                .title("Do An Tot Nghiep Microservices Fruit")
                .dueAt(OffsetDateTime.now().plusDays(7))
                .requireRuntimeTrace(false)
                .build());

        Project project = projectRepository.saveAndFlush(Project.builder()
                .workspace(workspace)
                .owner(student)
                .name("Fruit Market E-Commerce Architecture")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.saveAndFlush(SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash("sha256:d41d8cd98f00b204e9800998ecf8427e")
                .build());

        ModelVersion modelVersion = modelVersionRepository.saveAndFlush(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(student)
                .build());

        ModelElement elA = modelElementRepository.saveAndFlush(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("Java 21 / Spring Boot")
                .status("VALIDATED")
                .build());

        ModelElement elB = modelElementRepository.saveAndFlush(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("payment-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack(".NET 10 / ASP.NET Core")
                .status("VALIDATED")
                .build());

        ModelElement elDb = modelElementRepository.saveAndFlush(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("order-db")
                .elementType("DATABASE")
                .status("VALIDATED")
                .build());

        modelRelationshipRepository.saveAndFlush(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(elA)
                .targetElement(elB)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        modelRelationshipRepository.saveAndFlush(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(elA)
                .targetElement(elDb)
                .relationType("DATABASE_ACCESS")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        ObjectNode layoutJson = objectMapper.createObjectNode();
        ArrayNode nodes = layoutJson.putArray("nodes");
        nodes.addObject().put("id", elA.getId().toString()).put("name", "order-service").put("kind", "SERVICE_CONTAINER").put("x", 100.0).put("y", 100.0);
        nodes.addObject().put("id", elB.getId().toString()).put("name", "payment-service").put("kind", "SERVICE_CONTAINER").put("x", 400.0).put("y", 100.0);
        nodes.addObject().put("id", elDb.getId().toString()).put("name", "order-db").put("kind", "DATABASE").put("x", 100.0).put("y", 300.0);

        ArrayNode edges = layoutJson.putArray("edges");
        edges.addObject().put("id", UUID.randomUUID().toString()).put("from", elA.getId().toString()).put("to", elB.getId().toString()).put("relationType", "SERVICE_HTTP_CALL").put("originLayer", "STATIC");
        edges.addObject().put("id", UUID.randomUUID().toString()).put("from", elA.getId().toString()).put("to", elDb.getId().toString()).put("relationType", "DATABASE_ACCESS").put("originLayer", "STATIC");

        DiagramVersion diagram = diagramVersionRepository.saveAndFlush(DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(layoutJson)
                .build());

        // --- BƯỚC 1: GET /api/v1/analyzer/diagrams/{diagramId}/export?format=MERMAID ---
        MvcResult mermaidResult = mockMvc.perform(get("/api/v1/analyzer/diagrams/{diagramId}/export", diagram.getId())
                        .header("Authorization", testAuthorization(student.getEmail()))
                        .param("format", "MERMAID"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.format").value("MERMAID"))
                .andExpect(jsonPath("$.data.nodeClickMap").isMap())
                .andReturn();

        String mermaidContent = objectMapper.readTree(mermaidResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content").asText();
        assertThat(mermaidContent).contains("C4Container");
        assertThat(mermaidContent).contains("order-service");
        assertThat(mermaidContent).contains("order-db");
        assertThat(objectMapper.readTree(mermaidResult.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data").path("nodeClickMap").size()).isEqualTo(3);

        // --- BƯỚC 2: GET /api/v1/analyzer/diagrams/{diagramId}/export?format=PLANTUML ---
        MvcResult plantUmlResult = mockMvc.perform(get("/api/v1/analyzer/diagrams/{diagramId}/export", diagram.getId())
                        .header("Authorization", testAuthorization(student.getEmail()))
                        .param("format", "PLANTUML"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.format").value("PLANTUML"))
                .andReturn();

        String plantUmlContent = objectMapper.readTree(plantUmlResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content").asText();
        assertThat(plantUmlContent).contains("@startuml");
        assertThat(plantUmlContent).contains("@enduml");
        assertThat(plantUmlContent).contains("rectangle", "order-service", "<<Container>>");
        assertThat(plantUmlContent).contains("database", "order-db");

        // --- BƯỚC 3: GET /api/v1/analyzer/diagrams/{diagramId}/export?format=DRAWIO_XML ---
        MvcResult drawioResult = mockMvc.perform(get("/api/v1/analyzer/diagrams/{diagramId}/export", diagram.getId())
                        .header("Authorization", testAuthorization(student.getEmail()))
                        .param("format", "DRAWIO_XML"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.format").value("DRAWIO_XML"))
                .andReturn();

        String drawioContent = objectMapper.readTree(drawioResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content").asText();
        assertThat(drawioContent).contains("<mxfile");
        assertThat(drawioContent).contains("<mxGraphModel");
        assertThat(drawioContent).contains("x=\"100.0\" y=\"100.0\"");

        // --- BƯỚC 4: GET /api/v1/analyzer/diagrams/{diagramId}/export?format=JSON ---
        MvcResult jsonExportResult = mockMvc.perform(get("/api/v1/analyzer/diagrams/{diagramId}/export", diagram.getId())
                        .header("Authorization", testAuthorization(student.getEmail()))
                        .param("format", "JSON"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.format").value("JSON"))
                .andReturn();

        String jsonContent = objectMapper.readTree(jsonExportResult.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data").path("content").asText();
        assertThat(jsonContent).contains("\"diagramId\"");
        assertThat(jsonContent).contains("\"modelVersionId\"");

        // --- BƯỚC 5: POST /api/v1/analyzer/models/{modelVersionId}/diagrams/deployment (VIEW_4_PLUS_1 DEPLOYMENT) ---
        mockMvc.perform(post("/api/v1/analyzer/models/{modelVersionId}/diagrams/deployment", modelVersion.getId())
                        .header("Authorization", testAuthorization(student.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.notation").value("VIEW_4_PLUS_1"))
                .andExpect(jsonPath("$.data.level").value("DEPLOYMENT"))
                .andExpect(jsonPath("$.data.layoutJson.nodes").isArray());

        // --- BƯỚC 6: TẠO BÀI NỘP VÀ XUẤT GÓI BÀI NỘP BẤT BIẾN GET /api/v1/submissions/{id}/export ---
        ObjectNode metrics = objectMapper.createObjectNode().put("complianceScore", 98.0);
        EvaluationRun evalRun = evaluationRunRepository.saveAndFlush(EvaluationRun.builder()
                .modelVersion(modelVersion)
                .ruleSetVersion("1.0")
                .summaryMetrics(metrics)
                .build());

        RuntimeSession runtimeSession = runtimeSessionRepository.saveAndFlush(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(modelVersion)
                .scenarioName("OrderCheckoutScenario")
                .scenarioStatus("PASSED")
                .traceStatus("COMPLETE")
                .executionStatus("COMPLETED")
                .build());

        SubmissionSnapshot submission = submissionSnapshotRepository.saveAndFlush(SubmissionSnapshot.builder()
                .assignment(assignment)
                .project(project)
                .submittedBy(student)
                .sourceSnapshot(snapshot)
                .modelVersion(modelVersion)
                .diagramVersion(diagram)
                .evaluationRun(evalRun)
                .runtimeSession(runtimeSession)
                .submissionNotes("Bài tập hoàn tất đầy đủ 100%")
                .build());

        feedbackCommentRepository.saveAndFlush(FeedbackComment.builder()
                .submission(submission)
                .lecturer(lecturer)
                .commentText("Kiến trúc phân tách chuẩn Clean Architecture!")
                .build());

        MvcResult bundleResult = mockMvc.perform(get("/api/v1/submissions/{submissionId}/export", submission.getId())
                        .header("Authorization", testAuthorization(student.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.submissionId").value(submission.getId().toString()))
                .andExpect(jsonPath("$.data.complianceScore").value(98.0))
                .andExpect(jsonPath("$.data.scenarioStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.lecturerFeedbacks").isArray())
                .andReturn();

        JsonNode bundleNode = objectMapper.readTree(bundleResult.getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
        assertThat(bundleNode.path("mermaidDsl").asText()).contains("C4Container");
        assertThat(bundleNode.path("markdownSummaryReport").asText()).contains("BÁO CÁO TỔNG HỢP GÓI BÀI NỘP BẤT BIẾN");
        assertThat(bundleNode.path("markdownSummaryReport").asText()).contains("Kiến trúc phân tách chuẩn Clean Architecture!");
    }
}
