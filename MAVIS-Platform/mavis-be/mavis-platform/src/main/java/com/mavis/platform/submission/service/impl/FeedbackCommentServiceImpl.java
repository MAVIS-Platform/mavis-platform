package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.submission.dto.FeedbackCreateRequest;
import com.mavis.platform.submission.dto.FeedbackResponseDTO;
import com.mavis.platform.submission.dto.FeedbackUpdateRequest;
import com.mavis.platform.submission.service.FeedbackCommentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class FeedbackCommentServiceImpl implements FeedbackCommentService {

    private final FeedbackCommentRepository feedbackCommentRepository;
    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final UserRepository userRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FeedbackResponseDTO addFeedback(UUID submissionId, FeedbackCreateRequest request) {
        log.info("Thêm nhận xét chấm bài cho submissionId: {}, elementId: {}, relationshipId: {}",
                submissionId, request.getElementId(), request.getRelationshipId());

        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .or(() -> submissionSnapshotRepository.findById(submissionId))
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        if (submission.getAssignment() != null && submission.getAssignment().getWorkspace() != null) {
            accessPolicyService.requireWorkspaceLecturer(submission.getAssignment().getWorkspace().getId());
        }

        User lecturer = accessPolicyService.requireCurrentActiveUser();

        ModelElement element = null;
        if (request.getElementId() != null) {
            element = modelElementRepository.findById(request.getElementId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phần tử kiến trúc với ID: " + request.getElementId()));
            if (submission.getModelVersion() == null || !element.getModelVersion().getId().equals(submission.getModelVersion().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phần tử nhận xét không thuộc về phiên bản mô hình đã nộp");
            }
        }

        ModelRelationship relationship = null;
        if (request.getRelationshipId() != null) {
            relationship = modelRelationshipRepository.findById(request.getRelationshipId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy mối quan hệ kiến trúc với ID: " + request.getRelationshipId()));
            if (submission.getModelVersion() == null || !relationship.getModelVersion().getId().equals(submission.getModelVersion().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Quan hệ nhận xét không thuộc về phiên bản mô hình đã nộp");
            }
        }

        FeedbackComment comment = FeedbackComment.builder()
                .submission(submission)
                .lecturer(lecturer)
                .element(element)
                .relationship(relationship)
                .commentText(request.getCommentText())
                .build();

        comment = feedbackCommentRepository.save(comment);
        log.info("Thêm nhận xét thành công! FeedbackComment ID: {}", comment.getId());

        return FeedbackResponseDTO.fromEntity(comment);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FeedbackResponseDTO> getFeedbacksBySubmission(UUID submissionId) {
        log.debug("Lấy toàn bộ nhận xét của bài nộp: {}", submissionId);
        var submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));
        accessPolicyService.requireProjectReadAccess(submission.getProject());

        List<FeedbackComment> comments = feedbackCommentRepository.findBySubmissionIdOrderByCreatedAtAsc(submissionId);
        return comments.stream()
                .map(FeedbackResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public FeedbackResponseDTO updateFeedback(UUID feedbackId, FeedbackUpdateRequest request) {
        log.info("Cập nhật nhận xét ID: {}", feedbackId);
        UUID currentUserId = SecurityUtils.getCurrentUserId();

        FeedbackComment comment = feedbackCommentRepository.findById(feedbackId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy nhận xét với ID: " + feedbackId));

        validateAuthorPermission(comment, currentUserId, "sửa");

        if (request.getElementId() != null) {
            ModelElement element = modelElementRepository.findById(request.getElementId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phần tử kiến trúc với ID: " + request.getElementId()));
            if (!element.getModelVersion().getId().equals(comment.getSubmission().getModelVersion().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phần tử kiến trúc không thuộc phiên bản mô hình của bài nộp");
            }
            comment.setElement(element);
        }

        if (request.getRelationshipId() != null) {
            ModelRelationship relationship = modelRelationshipRepository.findById(request.getRelationshipId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy mối quan hệ kiến trúc với ID: " + request.getRelationshipId()));
            if (!relationship.getModelVersion().getId().equals(comment.getSubmission().getModelVersion().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Mối quan hệ kiến trúc không thuộc phiên bản mô hình của bài nộp");
            }
            comment.setRelationship(relationship);
        }

        comment.setCommentText(request.getCommentText());
        comment = feedbackCommentRepository.save(comment);

        return FeedbackResponseDTO.fromEntity(comment);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void deleteFeedback(UUID feedbackId) {
        log.info("Xóa nhận xét ID: {}", feedbackId);
        UUID currentUserId = SecurityUtils.getCurrentUserId();

        FeedbackComment comment = feedbackCommentRepository.findById(feedbackId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy nhận xét với ID: " + feedbackId));

        validateAuthorPermission(comment, currentUserId, "xóa");

        feedbackCommentRepository.delete(comment);
    }

    private void validateAuthorPermission(FeedbackComment comment, UUID currentUserId, String action) {
        if (comment.getLecturer() == null || !comment.getLecturer().getId().equals(currentUserId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền " + action + " nhận xét của giảng viên khác");
        }
    }
}
