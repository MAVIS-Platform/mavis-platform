package com.mavis.platform.submission.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
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
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class SubmissionControllerTest {

    private MockMvc mockMvc;

    @Mock
    private SubmissionService submissionService;

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
}
