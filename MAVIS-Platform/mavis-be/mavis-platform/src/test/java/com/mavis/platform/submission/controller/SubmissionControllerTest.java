package com.mavis.platform.submission.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.platform.submission.dto.*;
import com.mavis.platform.submission.service.FeedbackCommentService;
import com.mavis.platform.submission.service.SubmissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class SubmissionControllerTest {

    private MockMvc mockMvc;

    @Mock
    private SubmissionService submissionService;

    @Mock
    private FeedbackCommentService feedbackCommentService;

    @InjectMocks
    private SubmissionController submissionController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(submissionController).build();
    }

    @Test
    @DisplayName("POST /api/v1/submissions: Nộp bài tập kiến trúc")
    void testSubmitAssignment() throws Exception {
        UUID subId = UUID.randomUUID();
        UUID assignmentId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        UUID modelVersionId = UUID.randomUUID();
        UUID diagramVersionId = UUID.randomUUID();

        SubmissionCreateRequest request = SubmissionCreateRequest.builder()
                .assignmentId(assignmentId)
                .projectId(projectId)
                .modelVersionId(modelVersionId)
                .diagramVersionId(diagramVersionId)
                .submissionNotes("Final Submission")
                .build();

        SubmissionResponseDTO response = SubmissionResponseDTO.builder()
                .id(subId)
                .assignmentId(assignmentId)
                .assignmentTitle("Microservices Assignment")
                .projectId(projectId)
                .projectName("Fruit Store")
                .submittedByName("Nguyen Van A")
                .submittedAt(OffsetDateTime.now())
                .build();

        when(submissionService.submitAssignment(any(SubmissionCreateRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/v1/submissions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(subId.toString()))
                .andExpect(jsonPath("$.data.assignmentTitle").value("Microservices Assignment"));
    }

    @Test
    @DisplayName("GET /api/v1/assignments/{assignmentId}/submissions: Lấy danh sách bài nộp của lớp")
    void testGetSubmissionsByAssignment() throws Exception {
        UUID assignmentId = UUID.randomUUID();
        SubmissionResponseDTO dto = SubmissionResponseDTO.builder()
                .id(UUID.randomUUID())
                .assignmentId(assignmentId)
                .projectName("Project Alpha")
                .feedbackCount(2L)
                .build();

        when(submissionService.getSubmissionsByAssignment(assignmentId)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/assignments/{assignmentId}/submissions", assignmentId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].projectName").value("Project Alpha"));
    }

    @Test
    @DisplayName("GET /api/v1/submissions/{submissionId}: Lấy chi tiết bài nộp")
    void testGetSubmissionById() throws Exception {
        UUID subId = UUID.randomUUID();
        SubmissionResponseDTO dto = SubmissionResponseDTO.builder()
                .id(subId)
                .projectName("Project Alpha")
                .complianceScore(92.0)
                .build();

        when(submissionService.getSubmissionById(subId)).thenReturn(dto);

        mockMvc.perform(get("/api/v1/submissions/{submissionId}", subId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(subId.toString()))
                .andExpect(jsonPath("$.data.complianceScore").value(92.0));
    }

    @Test
    @DisplayName("POST /api/v1/submissions/{submissionId}/feedbacks: Thêm nhận xét")
    void testAddFeedback() throws Exception {
        UUID subId = UUID.randomUUID();
        UUID feedbackId = UUID.randomUUID();

        FeedbackCreateRequest request = FeedbackCreateRequest.builder()
                .commentText("Cần tối ưu hóa thêm")
                .build();

        FeedbackResponseDTO responseDTO = FeedbackResponseDTO.builder()
                .id(feedbackId)
                .submissionId(subId)
                .commentText("Cần tối ưu hóa thêm")
                .lecturerName("TS. Nguyen Tan Hoang")
                .build();

        when(feedbackCommentService.addFeedback(eq(subId), any(FeedbackCreateRequest.class))).thenReturn(responseDTO);

        mockMvc.perform(post("/api/v1/submissions/{submissionId}/feedbacks", subId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(feedbackId.toString()))
                .andExpect(jsonPath("$.data.commentText").value("Cần tối ưu hóa thêm"));
    }

    @Test
    @DisplayName("GET /api/v1/submissions/{submissionId}/feedbacks: Lấy danh sách nhận xét")
    void testGetFeedbacksBySubmission() throws Exception {
        UUID subId = UUID.randomUUID();
        FeedbackResponseDTO dto = FeedbackResponseDTO.builder()
                .id(UUID.randomUUID())
                .submissionId(subId)
                .commentText("Thiết kế tốt")
                .build();

        when(feedbackCommentService.getFeedbacksBySubmission(subId)).thenReturn(List.of(dto));

        mockMvc.perform(get("/api/v1/submissions/{submissionId}/feedbacks", subId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data[0].commentText").value("Thiết kế tốt"));
    }

    @Test
    @DisplayName("PUT /api/v1/feedbacks/{feedbackId}: Sửa nhận xét")
    void testUpdateFeedback() throws Exception {
        UUID feedbackId = UUID.randomUUID();
        FeedbackUpdateRequest request = FeedbackUpdateRequest.builder()
                .commentText("Nội dung mới")
                .build();

        FeedbackResponseDTO responseDTO = FeedbackResponseDTO.builder()
                .id(feedbackId)
                .commentText("Nội dung mới")
                .build();

        when(feedbackCommentService.updateFeedback(eq(feedbackId), any(FeedbackUpdateRequest.class))).thenReturn(responseDTO);

        mockMvc.perform(put("/api/v1/feedbacks/{feedbackId}", feedbackId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.commentText").value("Nội dung mới"));
    }

    @Test
    @DisplayName("DELETE /api/v1/feedbacks/{feedbackId}: Xóa nhận xét")
    void testDeleteFeedback() throws Exception {
        UUID feedbackId = UUID.randomUUID();
        doNothing().when(feedbackCommentService).deleteFeedback(feedbackId);

        mockMvc.perform(delete("/api/v1/feedbacks/{feedbackId}", feedbackId)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}

