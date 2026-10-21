package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionResponseDTO;
import com.mavis.platform.submission.service.SubmissionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SubmissionServiceImpl implements SubmissionService {

    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final AssignmentRepository assignmentRepository;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final DiagramVersionRepository diagramVersionRepository;
    private final EvaluationRunRepository evaluationRunRepository;
    private final RuntimeSessionRepository runtimeSessionRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final FeedbackCommentRepository feedbackCommentRepository;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SubmissionResponseDTO submitAssignment(SubmissionCreateRequest request) {
        log.info("Xử lý nộp bài tập kiến trúc: assignmentId={}, projectId={}, modelVersionId={}",
                request.getAssignmentId(), request.getProjectId(), request.getModelVersionId());

        UUID currentUserId = SecurityUtils.getCurrentUserId();
        User submitter = userRepository.findById(currentUserId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy thông tin người dùng đang đăng nhập"));

        Assignment assignment = assignmentRepository.findById(request.getAssignmentId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy đề bài tập với ID: " + request.getAssignmentId()));

        // 1. Kiểm tra hạn nộp bài (BR-14)
        if (assignment.getDueAt() != null && OffsetDateTime.now().isAfter(assignment.getDueAt())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Đã quá hạn nộp bài cho đề bài này");
        }

        // 2. Kiểm tra dự án
        Project project = projectRepository.findById(request.getProjectId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + request.getProjectId()));

        // 3. Kiểm tra ModelVersion thuộc đúng project
        ModelVersion modelVersion = modelVersionRepository.findById(request.getModelVersionId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + request.getModelVersionId()));
        if (!modelVersion.getProject().getId().equals(project.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên bản mô hình không thuộc về dự án đã chọn");
        }

        // 4. Kiểm tra DiagramVersion thuộc đúng modelVersion
        DiagramVersion diagramVersion = diagramVersionRepository.findById(request.getDiagramVersionId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bản vẽ kiến trúc với ID: " + request.getDiagramVersionId()));
        if (!diagramVersion.getModelVersion().getId().equals(modelVersion.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Bản vẽ sơ đồ không thuộc về phiên bản mô hình đã chọn");
        }

        // 5. Kiểm tra điều kiện bắt buộc Runtime Trace (BR-41..BR-45, BR-61..BR-64)
        if (Boolean.TRUE.equals(assignment.getRequireRuntimeTrace()) && request.getRuntimeSessionId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Đề bài này bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace");
        }

        // 6. Kiểm tra EvaluationRun (nếu có đính kèm)
        EvaluationRun evaluationRun = null;
        if (request.getEvaluationRunId() != null) {
            evaluationRun = evaluationRunRepository.findById(request.getEvaluationRunId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy kết quả đánh giá quy tắc với ID: " + request.getEvaluationRunId()));
            if (!evaluationRun.getModelVersion().getId().equals(modelVersion.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Kết quả chấm quy tắc kiến trúc không thuộc về phiên bản mô hình đã chọn");
            }
        }

        // 7. Kiểm tra RuntimeSession (nếu có đính kèm)
        RuntimeSession runtimeSession = null;
        if (request.getRuntimeSessionId() != null) {
            runtimeSession = runtimeSessionRepository.findById(request.getRuntimeSessionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + request.getRuntimeSessionId()));
            if (!runtimeSession.getProject().getId().equals(project.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm không thuộc về dự án đã chọn");
            }
        }

        // 8. Xác định SourceSnapshot bất biến
        SourceSnapshot sourceSnapshot = modelVersion.getSourceSnapshot();
        if (sourceSnapshot == null && runtimeSession != null) {
            sourceSnapshot = runtimeSession.getSourceSnapshot();
        }
        if (sourceSnapshot == null) {
            sourceSnapshot = sourceSnapshotRepository.findFirstByProjectIdOrderByCreatedAtDesc(project.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "Không tìm thấy bản chụp mã nguồn (SourceSnapshot) hợp lệ của dự án"));
        }

        // 9. Lưu bản ghi nộp bài bất biến vào submission_snapshots
        SubmissionSnapshot submission = SubmissionSnapshot.builder()
                .assignment(assignment)
                .project(project)
                .submittedBy(submitter)
                .sourceSnapshot(sourceSnapshot)
                .modelVersion(modelVersion)
                .diagramVersion(diagramVersion)
                .evaluationRun(evaluationRun)
                .runtimeSession(runtimeSession)
                .submissionNotes(request.getSubmissionNotes())
                .build();

        submission = submissionSnapshotRepository.save(submission);
        log.info("Nộp bài tập thành công! Submission ID: {}, SubmittedAt: {}", submission.getId(), submission.getSubmittedAt());

        return SubmissionResponseDTO.fromEntity(submission, 0L);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByAssignment(UUID assignmentId) {
        log.debug("Lấy danh sách bài nộp theo assignmentId: {}", assignmentId);
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId);
        return mapToResponseListWithFeedbackCount(submissions);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByProject(UUID projectId) {
        log.debug("Lấy danh sách bài nộp theo projectId: {}", projectId);
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByProjectIdOrderBySubmittedAtDesc(projectId);
        return mapToResponseListWithFeedbackCount(submissions);
    }

    @Override
    @Transactional(readOnly = true)
    public SubmissionResponseDTO getSubmissionById(UUID submissionId) {
        log.debug("Lấy chi tiết bài nộp theo submissionId: {}", submissionId);
        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        long feedbackCount = feedbackCommentRepository.countBySubmissionId(submissionId);
        return SubmissionResponseDTO.fromEntity(submission, feedbackCount);
    }

    private List<SubmissionResponseDTO> mapToResponseListWithFeedbackCount(List<SubmissionSnapshot> submissions) {
        if (submissions.isEmpty()) {
            return Collections.emptyList();
        }

        List<UUID> submissionIds = submissions.stream().map(SubmissionSnapshot::getId).toList();
        Map<UUID, Long> feedbackCounts = new HashMap<>();
        List<Object[]> countRows = feedbackCommentRepository.countFeedbacksBySubmissionIds(submissionIds);
        for (Object[] row : countRows) {
            UUID subId = (UUID) row[0];
            Long count = (Long) row[1];
            feedbackCounts.put(subId, count);
        }

        return submissions.stream()
                .map(s -> SubmissionResponseDTO.fromEntity(s, feedbackCounts.getOrDefault(s.getId(), 0L)))
                .collect(Collectors.toList());
    }
}
