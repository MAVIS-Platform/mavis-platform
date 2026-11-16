package com.mavis.platform.submission.service;

import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;

import java.util.List;
import java.util.UUID;

public interface SubmissionService {

    /**
     * Nộp bài tập kiến trúc bất biến (SubmissionSnapshot).
     * Kiểm tra hạn nộp, liên kết ModelVersion/DiagramVersion và yêu cầu Runtime Trace (BR-14, BR-61..BR-64).
     *
     * @param request Yêu cầu nộp bài
     * @return SubmissionResponseDTO chứa đầy đủ thông tin bài nộp
     */
    List<SubmissionResponseDTO> getMySubmissions();

    SubmissionResponseDTO submitAssignment(SubmissionCreateRequest request);

    /**
     * Lấy danh sách các bài nộp theo đề bài (Assignment), tối ưu 8-way EntityGraph chỉ với 1 câu query.
     *
     * @param assignmentId ID của đề bài
     * @return Danh sách SubmissionResponseDTO
     */
    List<SubmissionResponseDTO> getSubmissionsByAssignment(UUID assignmentId);

    /**
     * Lấy lịch sử các bài nộp theo đồ án (Project), tối ưu 8-way EntityGraph.
     *
     * @param projectId ID đồ án
     * @return Danh sách SubmissionResponseDTO
     */
    List<SubmissionResponseDTO> getSubmissionsByProject(UUID projectId);

    /**
     * Lấy chi tiết một bài nộp bất biến theo submissionId.
     *
     * @param submissionId ID bài nộp
     * @return SubmissionResponseDTO
     */
    SubmissionResponseDTO getSubmissionById(UUID submissionId);

    /**
     * Xuất gói bài nộp bất biến (SubmissionExportBundleDTO) bao gồm phiên bản ghim, Mermaid DSL,
     * điểm tuân thủ, kết quả runtime, danh sách phản hồi và báo cáo tổng hợp Markdown (Ticket V11, T15).
     *
     * @param submissionId ID của bài nộp bất biến
     * @return SubmissionExportBundleDTO
     */
    com.mavis.platform.submission.dto.SubmissionExportBundleDTO exportSubmissionBundle(UUID submissionId);
}
