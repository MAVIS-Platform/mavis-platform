package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SubmissionApiIntegrationTest {

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
    private DiagramVersionRepository diagramVersionRepository;

    @Autowired
    private EvaluationRunRepository evaluationRunRepository;

    @Autowired
    private RuntimeSessionRepository runtimeSessionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    @DisplayName("FULL SUBMISSION LIFECYCLE API TEST: Validation -> Submit Immutable Snapshot -> Query by Assignment/Project/Id")
    void testSubmissionLifecycleApi() throws Exception {
        // --- 1. SETUP DỮ LIỆU BAN ĐẦU ---
        Role studentRole = roleRepository.findByCode("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().code("STUDENT").name("Student").build()));

        User user = userRepository.saveAndFlush(User.builder()
                .email("student_submitter_" + UUID.randomUUID().toString().substring(0, 8) + "@mavis.edu.vn")
                .passwordHash("hashed_pwd")
                .fullName("Tran Van Nop Bai")
                .role(studentRole)
                .build());

        Workspace workspace = workspaceRepository.saveAndFlush(Workspace.builder()
                .name("Kien Truc Phan Mem K18")
                .code("SE1801_" + UUID.randomUUID().toString().substring(0, 4))
                .createdBy(user)
                .build());

        // Đề bài yêu cầu bắt buộc Runtime Trace (requireRuntimeTrace = true)
        Assignment assignment = assignmentRepository.saveAndFlush(Assignment.builder()
                .workspace(workspace)
                .createdBy(user)
                .title("Do An Kien Truc Microservices")
                .dueAt(OffsetDateTime.now().plusDays(3))
                .requireRuntimeTrace(true)
                .build());

        Project project = projectRepository.saveAndFlush(Project.builder()
                .workspace(workspace)
                .owner(user)
                .name("Fruit E-Store Architecture")
                .build());

        SourceSnapshot snapshot = sourceSnapshotRepository.saveAndFlush(SourceSnapshot.builder()
                .project(project)
                .sourceType("GITHUB_COMMIT")
                .artifactHash("1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
                .build());

        ModelVersion modelVersion = modelVersionRepository.saveAndFlush(ModelVersion.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdBy(user)
                .build());

        DiagramVersion diagramVersion = diagramVersionRepository.saveAndFlush(DiagramVersion.builder()
                .modelVersion(modelVersion)
                .notation("C4")
                .level("CONTAINER")
                .layoutJson(objectMapper.createObjectNode())
                .build());

        ObjectNode summaryMetrics = objectMapper.createObjectNode();
        summaryMetrics.put("complianceScore", 98.5);
        summaryMetrics.put("passedRules", 5);
        summaryMetrics.put("failedRules", 0);

        EvaluationRun evaluationRun = evaluationRunRepository.saveAndFlush(EvaluationRun.builder()
                .modelVersion(modelVersion)
                .ruleSetVersion("1.0")
                .summaryMetrics(summaryMetrics)
                .build());

        RuntimeSession runtimeSession = runtimeSessionRepository.saveAndFlush(RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .triggeredBy(user)
                .scenarioName("Order Fulfillment E2E")
                .scenarioStatus("PASSED")
                .traceStatus("COMPLETE")
                .startedAt(OffsetDateTime.now().minusMinutes(10))
                .completedAt(OffsetDateTime.now())
                .build());

        System.out.println("================================================================================");
        System.out.println(">>> [BƯỚC 1]: GỌI API POST /api/v1/submissions THIẾU RUNTIME TRACE (KỲ VỌNG BỊ CHẶN 400)");
        System.out.println("================================================================================");

        // --- BƯỚC 1: POST /api/v1/submissions (Thiếu runtimeSessionId khi requireRuntimeTrace=true) ---
        SubmissionCreateRequest invalidReq = SubmissionCreateRequest.builder()
                .assignmentId(assignment.getId())
                .projectId(project.getId())
                .modelVersionId(modelVersion.getId())
                .diagramVersionId(diagramVersion.getId())
                .runtimeSessionId(null) // Thiếu
                .submissionNotes("Nộp thử khi chưa có runtime trace")
                .build();

        mockMvc.perform(post("/api/v1/submissions")
                        .header("X-Test-User-Email", user.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidReq)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.message").value("Đề bài này bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace"));

        System.out.println("Đã chặn thành công yêu cầu thiếu Runtime Trace theo đúng Business Rules!");

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 2]: GỌI API POST /api/v1/submissions HỢP LỆ ĐẦY ĐỦ 8 KHÓA NGOẠI");
        System.out.println("================================================================================");

        // --- BƯỚC 2: POST /api/v1/submissions Hợp lệ ---
        SubmissionCreateRequest validReq = SubmissionCreateRequest.builder()
                .assignmentId(assignment.getId())
                .projectId(project.getId())
                .modelVersionId(modelVersion.getId())
                .diagramVersionId(diagramVersion.getId())
                .evaluationRunId(evaluationRun.getId())
                .runtimeSessionId(runtimeSession.getId())
                .submissionNotes("Bài tập hoàn thiện đầy đủ C4 Container và OpenTelemetry Trace.")
                .build();

        MvcResult submitResult = mockMvc.perform(post("/api/v1/submissions")
                        .header("X-Test-User-Email", user.getEmail())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(validReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.assignmentTitle").value("Do An Kien Truc Microservices"))
                .andExpect(jsonPath("$.data.projectName").value("Fruit E-Store Architecture"))
                .andExpect(jsonPath("$.data.complianceScore").value(98.5))
                .andExpect(jsonPath("$.data.scenarioStatus").value("PASSED"))
                .andReturn();

        String submitJson = submitResult.getResponse().getContentAsString();
        JsonNode submitNode = objectMapper.readTree(submitJson);
        System.out.println("RESPONSE (Bước 2 - Nộp bài thành công):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(submitNode));

        UUID submissionId = UUID.fromString(submitNode.get("data").get("id").asText());

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 3]: GỌI API GET /api/v1/assignments/" + assignment.getId() + "/submissions");
        System.out.println("    Giảng viên xem danh sách bài nộp của lớp (8-way EntityGraph tối ưu 1 query)");
        System.out.println("================================================================================");

        // --- BƯỚC 3: GET /api/v1/assignments/{assignmentId}/submissions ---
        MvcResult classSubmissionsResult = mockMvc.perform(get("/api/v1/assignments/{assignmentId}/submissions", assignment.getId())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value(submissionId.toString()))
                .andExpect(jsonPath("$.data[0].submittedByName").value("Tran Van Nop Bai"))
                .andExpect(jsonPath("$.data[0].modelRevision").value(1))
                .andReturn();

        String classJson = classSubmissionsResult.getResponse().getContentAsString();
        JsonNode classNode = objectMapper.readTree(classJson);
        System.out.println("RESPONSE (Bước 3 - Danh sách bài nộp của Đề bài):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(classNode));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 4]: GỌI API GET /api/v1/projects/" + project.getId() + "/submissions");
        System.out.println("    Sinh viên xem lịch sử các lần nộp bài của Đồ án");
        System.out.println("================================================================================");

        // --- BƯỚC 4: GET /api/v1/projects/{projectId}/submissions ---
        MvcResult projectSubmissionsResult = mockMvc.perform(get("/api/v1/projects/{projectId}/submissions", project.getId())
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data[0].id").value(submissionId.toString()))
                .andReturn();

        String projectJson = projectSubmissionsResult.getResponse().getContentAsString();
        JsonNode projectNode = objectMapper.readTree(projectJson);
        System.out.println("RESPONSE (Bước 4 - Lịch sử nộp bài của Đồ án):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(projectNode));

        System.out.println("\n================================================================================");
        System.out.println(">>> [BƯỚC 5]: GỌI API GET /api/v1/submissions/" + submissionId);
        System.out.println("    Xem chi tiết gói bài nộp bất biến");
        System.out.println("================================================================================");

        // --- BƯỚC 5: GET /api/v1/submissions/{submissionId} ---
        MvcResult detailResult = mockMvc.perform(get("/api/v1/submissions/{submissionId}", submissionId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(submissionId.toString()))
                .andExpect(jsonPath("$.data.complianceScore").value(98.5))
                .andExpect(jsonPath("$.data.scenarioStatus").value("PASSED"))
                .andExpect(jsonPath("$.data.feedbackCount").value(0))
                .andReturn();

        String detailJson = detailResult.getResponse().getContentAsString();
        JsonNode detailNode = objectMapper.readTree(detailJson);
        System.out.println("RESPONSE (Bước 5 - Chi tiết bài nộp bất biến):");
        System.out.println(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(detailNode));

        System.out.println("================================================================================");
        System.out.println(">>> TOÀN BỘ CÁC BƯỚC KIỂM THỬ API TASK 6.1 HOÀN TẤT THÀNH CÔNG 100%!");
        System.out.println("================================================================================");
    }
}
