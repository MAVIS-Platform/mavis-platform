package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.platform.submission.dto.FeedbackCreateRequest;
import com.mavis.platform.submission.dto.FeedbackUpdateRequest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class FeedbackApiIntegrationTest extends ApiIntegrationContext {

    @Autowired
    private MockMvc mockMvc;

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
    private FeedbackCommentRepository feedbackCommentRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL FEEDBACK PINNING & GRADING API TEST: Pin to Node/Edge -> Get All -> Update -> Delete")
    void testFeedbackLifecycleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role lecturerRole = roleRepository.findByCode("LECTURER")
                .orElseGet(() -> roleRepository.save(Role.builder().code("LECTURER").name("Lecturer").build()));

        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User lecturer = userRepository.save(User.builder()
                .email("lecturer_reviewer_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("TS. Nguyen Tan Hoang")
                .role(lecturerRole)
                .build());

        User student = userRepository.save(User.builder()
                .email("student_author_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("Le Minh Triet")
                .role(studentRole)
                .build());

        Workspace workspace = workspaceRepository.save(Workspace.builder()
                .name("Kien Truc Microservices SE1801")
                .code("SE1801_WS_" + UUID.randomUUID().toString().substring(0, 4))
                .createdBy(lecturer)
                .build());

        Assignment assignment = assignmentRepository.save(Assignment.builder()
                .workspace(workspace)
                .createdBy(lecturer)
                .title("Bai Tap Lon Kien Truc Microservices")
                .dueAt(OffsetDateTime.now().plusDays(5))
                .requireRuntimeTrace(false)
                .build());

        Project project = projectRepository.save(Project.builder()
                .workspace(workspace)
                .owner(student)
                .name("E-Commerce High Scale Architecture")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.save(SourceSnapshot.builder()
                .project(project)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("deadbeef12345678deadbeef12345678deadbeef12345678deadbeef12345678")
                .build());

        ModelVersion modelVersion = modelVersionRepository.save(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(student)
                .build());

        ModelElement element = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build());

        ModelElement targetElement = modelElementRepository.save(ModelElement.builder()
                .modelVersion(modelVersion)
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .status("VALIDATED")
                .build());

        ModelRelationship relationship = modelRelationshipRepository.save(ModelRelationship.builder()
                .modelVersion(modelVersion)
                .sourceElement(element)
                .targetElement(targetElement)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build());

        DiagramVersion diagramVersion = diagramVersionRepository.save(DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(objectMapper.createObjectNode())
                .build());

        SubmissionSnapshot submission = submissionSnapshotRepository.save(SubmissionSnapshot.builder()
                .assignment(assignment)
                .project(project)
                .submittedBy(student)
                .sourceSnapshot(snapshot)
                .modelVersion(modelVersion)
                .diagramVersion(diagramVersion)
                .submissionNotes("Bài tập hoàn thiện kiến trúc Microservices.")
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GIẢNG VIÊN GHIM NHẬN XÉT VÀO NODE (order-service)");
        System.out.println("    POST /api/v1/submissions/" + submission.getId() + "/feedbacks");
        System.out.println("================================================================================");

        // --- BƯỚC 1: Ghim nhận xét vào Node ---
        FeedbackCreateRequest nodeReq = FeedbackCreateRequest.builder()
                .elementId(element.getId())
                .commentText("Dịch vụ order-service cần bổ sung cơ chế Retry Pattern và Idempotency Key.")
                .build();

        MvcResult nodeFeedbackResult = mockMvc.perform(post("/api/v1/submissions/{submissionId}/feedbacks", submission.getId())
                        .header("X-Test-User-Email", lecturer.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nodeReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.elementId").value(element.getId().toString()))
                .andExpect(jsonPath("$.data.elementName").value("order-service"))
                .andExpect(jsonPath("$.data.lecturerName").value("TS. Nguyen Tan Hoang"))
                .andReturn();

        String nodeJson = nodeFeedbackResult.getResponse().getContentAsString();
        JsonNode nodeRes = objectMapper.readTree(nodeJson);
        System.out.println("RESPONSE (Bước 1 - Ghim nhận xét vào Node):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(nodeRes));

        UUID firstFeedbackId = UUID.fromString(nodeRes.get("data").get("id").asText());

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GIẢNG VIÊN GHIM NHẬN XÉT VÀO EDGE (order-service -> inventory-service)");
        System.out.println("================================================================================");

        // --- BƯỚC 2: Ghim nhận xét vào Edge ---
        FeedbackCreateRequest edgeReq = FeedbackCreateRequest.builder()
                .relationshipId(relationship.getId())
                .commentText("Cạnh gọi HTTP đồng bộ giữa Order và Inventory dễ gây cascading failure, nên chuyển sang Event-Driven với Kafka.")
                .build();

        MvcResult edgeFeedbackResult = mockMvc.perform(post("/api/v1/submissions/{submissionId}/feedbacks", submission.getId())
                        .header("X-Test-User-Email", lecturer.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(edgeReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.relationshipId").value(relationship.getId().toString()))
                .andExpect(jsonPath("$.data.relationType").value("SERVICE_HTTP_CALL"))
                .andReturn();

        String edgeJson = edgeFeedbackResult.getResponse().getContentAsString();
        JsonNode edgeRes = objectMapper.readTree(edgeJson);
        System.out.println("RESPONSE (Bước 2 - Ghim nhận xét vào Edge):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(edgeRes));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: LẤY TOÀN BỘ NHẬN XÉT CỦA BÀI NỘP (TỐI ƯU 1 CÂU SELECT)");
        System.out.println("    GET /api/v1/submissions/" + submission.getId() + "/feedbacks");
        System.out.println("================================================================================");

        // --- BƯỚC 3: GET Feedbacks by Submission ---
        MvcResult listResult = mockMvc.perform(get("/api/v1/submissions/{submissionId}/feedbacks", submission.getId()).header("X-Test-User-Email",student.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        String listJson = listResult.getResponse().getContentAsString();
        JsonNode listRes = objectMapper.readTree(listJson);
        System.out.println("RESPONSE (Bước 3 - Danh sách nhận xét bài nộp):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(listRes));

        assertThat(listRes.get("data").size()).isEqualTo(2);

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 4]: GIẢNG VIÊN CẬP NHẬT NỘI DUNG NHẬN XÉT");
        System.out.println("    PUT /api/v1/feedbacks/" + firstFeedbackId);
        System.out.println("================================================================================");

        // --- BƯỚC 4: PUT /api/v1/feedbacks/{feedbackId} ---
        FeedbackUpdateRequest updateReq = FeedbackUpdateRequest.builder()
                .commentText("Đã kiểm tra lại: Em nhớ cấu hình thêm Timeout 3s cho order-service nhé.")
                .build();

        MvcResult updateResult = mockMvc.perform(put("/api/v1/feedbacks/{feedbackId}", firstFeedbackId)
                        .header("X-Test-User-Email", lecturer.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.commentText").value("Đã kiểm tra lại: Em nhớ cấu hình thêm Timeout 3s cho order-service nhé."))
                .andReturn();

        String updateJson = updateResult.getResponse().getContentAsString();
        JsonNode updateRes = objectMapper.readTree(updateJson);
        System.out.println("RESPONSE (Bước 4 - Cập nhật nhận xét):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(updateRes));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 5]: GIẢNG VIÊN XÓA NHẬN XÉT");
        System.out.println("    DELETE /api/v1/feedbacks/" + firstFeedbackId);
        System.out.println("================================================================================");

        // --- BƯỚC 5: DELETE /api/v1/feedbacks/{feedbackId} ---
        mockMvc.perform(delete("/api/v1/feedbacks/{feedbackId}", firstFeedbackId)
                        .header("X-Test-User-Email", lecturer.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        // Xác minh chỉ còn 1 nhận xét
        MvcResult remainingResult = mockMvc.perform(get("/api/v1/submissions/{submissionId}/feedbacks", submission.getId()).header("X-Test-User-Email",student.getEmail())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray())
                .andReturn();

        JsonNode remainingRes = objectMapper.readTree(remainingResult.getResponse().getContentAsString());
        assertThat(remainingRes.get("data").size()).isEqualTo(1);
        System.out.println("Số lượng nhận xét còn lại sau khi xóa: 1");

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ CÁC BƯỚC KIỂM THỬ API TASK 6.2 HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
