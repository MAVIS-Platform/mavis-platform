package com.mavis.platform.submission.service;

import com.mavis.platform.submission.dto.FeedbackCreateRequest;
import com.mavis.platform.submission.dto.FeedbackResponseDTO;
import com.mavis.platform.submission.dto.FeedbackUpdateRequest;

import java.util.List;
import java.util.UUID;

public interface FeedbackCommentService {

    /**
     * Thêm nhận xét / góp ý chấm bài của Giảng viên (BR-63).
     * Có thể ghim vào Node (elementId), ghim vào Edge (relationshipId), hoặc nhận xét chung toàn bài nộp.
     *
     * @param submissionId ID bài nộp
     * @param request Yêu cầu tạo nhận xét
     * @return FeedbackResponseDTO
     */
    FeedbackResponseDTO addFeedback(UUID submissionId, FeedbackCreateRequest request);

    /**
     * Lấy toàn bộ nhận xét của một bài nộp, tối ưu bằng @EntityGraph chỉ tốn 1 câu SELECT.
     *
     * @param submissionId ID bài nộp
     * @return Danh sách FeedbackResponseDTO
     */
    List<FeedbackResponseDTO> getFeedbacksBySubmission(UUID submissionId);

    /**
     * Cập nhật nội dung nhận xét (chỉ tác giả giảng viên được sửa).
     *
     * @param feedbackId ID nhận xét
     * @param request Nội dung cập nhật
     * @return FeedbackResponseDTO
     */
    FeedbackResponseDTO updateFeedback(UUID feedbackId, FeedbackUpdateRequest request);

    /**
     * Xóa nhận xét (chỉ tác giả giảng viên được xóa).
     *
     * @param feedbackId ID nhận xét
     */
    void deleteFeedback(UUID feedbackId);
}
