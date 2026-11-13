package com.mavis.platform.submission.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
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
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SubmissionServiceImpl implements SubmissionService {

    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final AssignmentRepository assignmentRepository;
    private final com.mavis.common.security.CourseLabPolicy courseLabs;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final DiagramVersionRepository diagramVersionRepository;
    private final EvaluationRunRepository evaluationRunRepository;
    private final RuntimeSessionRepository runtimeSessionRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final FeedbackCommentRepository feedbackCommentRepository;
    private final JobRepository jobRepository;
    private final SubmissionReviewRepository submissionReviewRepository;
    private final com.mavis.common.security.AccessPolicyService accessPolicyService;
    private final ObjectMapper json;

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getMySubmissions() {
        User user = accessPolicyService.requireCurrentActiveUser();
        boolean admin = user.getRole()!=null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode());
        return mapToResponseListWithFeedbackCount(submissionSnapshotRepository.findVisibleTo(user.getId(), admin));
    }

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

        accessPolicyService.requireCurrentActiveUser();
        if (assignment.getWorkspace()!=null) accessPolicyService.requireWorkspaceMember(assignment.getWorkspace().getId());

        if (assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && com.mavis.common.security.CourseLabPolicy.isStudent(submitter)) {
            courseLabs.requireOpen(assignment, submitter);
        }

        // 1. Kiểm tra hạn nộp bài (BR-14)
        if (assignment.getDueAt() != null && OffsetDateTime.now().isAfter(assignment.getDueAt())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Đã quá hạn nộp bài cho đề bài này");
        }

        // 2. Kiểm tra dự án và quyền sở hữu
        Project project = projectRepository.findById(request.getProjectId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + request.getProjectId()));

        if (project.getOwner() == null || !project.getOwner().getId().equals(currentUserId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Chỉ chủ sở hữu của dự án mới có quyền nộp bài");
        }

        if (assignment.getWorkspace() != null && (project.getWorkspace() == null || !project.getWorkspace().getId().equals(assignment.getWorkspace().getId()))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Dự án không thuộc về không gian làm việc của đề bài");
        }

        if (assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && (project.getAssignment() == null || !assignment.getId().equals(project.getAssignment().getId()))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Project must belong to the submitted Lab");
        }

        // 3. Kiểm tra ModelVersion thuộc đúng project
        ModelVersion modelVersion = modelVersionRepository.findById(request.getModelVersionId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + request.getModelVersionId()));
        if (!modelVersion.getProject().getId().equals(project.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên bản mô hình không thuộc về dự án đã chọn");
        }

        // 4. Lấy SourceSnapshot bất biến trực tiếp từ ModelVersion (KHÔNG fallback)
        SourceSnapshot sourceSnapshot = modelVersion.getSourceSnapshot();
        if (sourceSnapshot == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "ModelVersion không gắn với SourceSnapshot bất biến hợp lệ");
        }
        JsonNode courseQuizEvidence = null;
        if (assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && com.mavis.common.security.CourseLabPolicy.isStudent(submitter)) {
            var lockedLab = assignmentRepository.findLockedById(assignment.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
            var pass = courseLabs.currentQuizPass(lockedLab, currentUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN, "Pass the current Lab Quiz before submitting"));
            var referenceModel = lockedLab.getReferenceModel();
            var referenceSnapshot = referenceModel.getSourceSnapshot();
            if (referenceSnapshot == null || !referenceSnapshot.getId().equals(project.getReferenceSnapshotId())
                    || !Objects.equals(referenceSnapshot.getArtifactHash(), sourceSnapshot.getArtifactHash())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Submission source does not match the current Lab reference");
            }
            courseQuizEvidence = json.createObjectNode().put("status", "PASSED")
                    .put("attemptId", pass.attemptId().toString()).put("quizVersion", pass.quizVersion())
                    .put("correctCount", pass.correctCount()).put("questionCount", pass.questionCount())
                    .put("passPercent", pass.passPercent()).put("submittedAt", pass.submittedAt().toString())
                    .put("referenceModelId", referenceModel.getId().toString())
                    .put("referenceSnapshotId", referenceSnapshot.getId().toString())
                    .put("artifactHash", referenceSnapshot.getArtifactHash()).put("commitSha", referenceSnapshot.getCommitSha());
        }

        // 5. Kiểm tra tính toàn vẹn của ModelVersion (không cho phép nộp bản nháp PARTIAL chưa được xác nhận)
        if (!"USER_CONFIRMED".equalsIgnoreCase(modelVersion.getOrigin())) {
            boolean isPartialDraft = jobRepository.findBySourceSnapshotId(sourceSnapshot.getId()).stream()
                    .anyMatch(j -> j.getResultManifest() != null
                            && modelVersion.getId().toString().equals(j.getResultManifest().path("modelVersionId").asText())
                            && "PARTIAL".equalsIgnoreCase(j.getResultManifest().path("completeness").asText()));
            if (isPartialDraft) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Không thể nộp phiên bản mô hình chưa hoàn thiện (PARTIAL) trừ khi đã được xác nhận");
            }
        }

        // 6. Kiểm tra DiagramVersion thuộc đúng modelVersion
        DiagramVersion diagramVersion = diagramVersionRepository.findById(request.getDiagramVersionId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bản vẽ kiến trúc với ID: " + request.getDiagramVersionId()));
        if (!diagramVersion.getModelVersion().getId().equals(modelVersion.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Bản vẽ sơ đồ không thuộc về phiên bản mô hình đã chọn");
        }
        if (assignment.getRequiredDiagramTypes() != null && assignment.getRequiredDiagramTypes().isArray()) {
            var supplied = com.mavis.common.utils.CourseworkDiagramTypes.supplied(diagramVersion.getNotation(), diagramVersion.getLevel(), diagramVersion.getLayoutJson());
            for (var required : assignment.getRequiredDiagramTypes()) if (!supplied.contains(required.asText().trim().toUpperCase())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Missing required diagram type: " + required.asText());
            }
        }

        // 7. Kiểm tra EvaluationRun (nếu có đính kèm hoặc tự động lấy lượt đánh giá mới nhất)
        EvaluationRun evaluationRun = null;
        if (request.getEvaluationRunId() != null) {
            evaluationRun = evaluationRunRepository.findById(request.getEvaluationRunId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy kết quả đánh giá quy tắc với ID: " + request.getEvaluationRunId()));
            if (!evaluationRun.getModelVersion().getId().equals(modelVersion.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Kết quả chấm quy tắc kiến trúc không thuộc về phiên bản mô hình đã chọn");
            }
        } else {
            List<EvaluationRun> existingRuns = evaluationRunRepository.findByModelVersionIdOrderByCreatedAtDesc(modelVersion.getId());
            if (existingRuns != null && !existingRuns.isEmpty()) {
                evaluationRun = existingRuns.get(0);
            }
        }

        // 8. Kiểm tra RuntimeSession (nếu có đính kèm)
        RuntimeSession runtimeSession = null;
        if (request.getRuntimeSessionId() != null) {
            runtimeSession = runtimeSessionRepository.findById(request.getRuntimeSessionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + request.getRuntimeSessionId()));
            if (!runtimeSession.getProject().getId().equals(project.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm không thuộc về dự án đã chọn");
            }
            if (runtimeSession.getSourceSnapshot() == null || !runtimeSession.getSourceSnapshot().getId().equals(sourceSnapshot.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm không chạy trên cùng SourceSnapshot với ModelVersion");
            }
            if (modelVersion.getRuntimeSession() != null && !modelVersion.getRuntimeSession().getId().equals(runtimeSession.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm không khớp với phiên thực nghiệm gắn trên ModelVersion");
            }
        }

        // 9. Kiểm tra điều kiện bắt buộc Runtime Trace (BR-41..BR-45, BR-61..BR-64)
        if (Boolean.TRUE.equals(assignment.getRequireRuntimeTrace())) {
            if (runtimeSession == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Đề bài này bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace");
            }
            boolean scenarioPassed = "PASSED".equalsIgnoreCase(runtimeSession.getScenarioStatus());
            boolean traceValid = "COMPLETE".equalsIgnoreCase(runtimeSession.getTraceStatus()) || "PARTIAL".equalsIgnoreCase(runtimeSession.getTraceStatus());
            boolean verifiedExecution="COMPLETED".equalsIgnoreCase(runtimeSession.getExecutionStatus())
                && "AVAILABLE".equalsIgnoreCase(runtimeSession.getEvidenceStatus()) && "CONFIRMED".equalsIgnoreCase(runtimeSession.getCleanupStatus())
                && runtimeSession.getRunnerReceiptJson()!=null;
            if (!scenarioPassed || !traceValid || !verifiedExecution) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Đề bài yêu cầu Runtime Trace hợp lệ đã hoàn tất (PASSED) trên đúng SourceSnapshot của mô hình");
            }
        }

        if (assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()) {
            List<String> missingStages = new ArrayList<>();
            if (sourceSnapshot.getArtifactHash() == null || sourceSnapshot.getArtifactHash().isBlank()) missingStages.add("STEP_1_STATIC_ANALYZED");
            double score = evaluationRun != null && evaluationRun.getSummaryMetrics() != null
                    ? evaluationRun.getSummaryMetrics().path("complianceScore").asDouble(-1) : -1;
            if (score < 70) missingStages.add("STEP_2_C4_GROUND_TRUTH_70");
            if (runtimeSession == null || !("COMPLETE".equalsIgnoreCase(runtimeSession.getTraceStatus()) || "PARTIAL".equalsIgnoreCase(runtimeSession.getTraceStatus())))
                missingStages.add("STEP_3_RUNTIME_OTEL_VIEW");
            if (runtimeSession == null || runtimeSession.getReceiptDigest() == null || runtimeSession.getReceiptDigest().isBlank()
                    || runtimeSession.getRunnerReceiptJson() == null || !"CONFIRMED".equalsIgnoreCase(runtimeSession.getCleanupStatus()))
                missingStages.add("STEP_4_SIGNED_RUNTIME_RECEIPT");
            if (!missingStages.isEmpty()) throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                    "INCOMPLETE_4STAGE_EVIDENCE: " + String.join(",", missingStages));
        }

        String evidencePackageDigest = evidencePackageDigest(assignment, project, sourceSnapshot, modelVersion,
                diagramVersion, evaluationRun, runtimeSession, courseQuizEvidence, request.getSubmissionNotes());

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
                .courseQuizEvidence(courseQuizEvidence)
                .submissionNotes(request.getSubmissionNotes())
                .evidencePackageDigest(evidencePackageDigest)
                .build();

        submission = submissionSnapshotRepository.save(submission);
        // @CreationTimestamp is populated at flush. Build the response only
        // after persistence, otherwise clients receive submittedAt=null even
        // though the transaction succeeds and may retry an already saved work.
        submissionSnapshotRepository.flush();
        log.info("Nộp bài tập thành công! Submission ID: {}, SubmittedAt: {}", submission.getId(), submission.getSubmittedAt());

        return SubmissionResponseDTO.fromEntity(submission, 0L);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByAssignment(UUID assignmentId) {
        log.debug("Lấy danh sách bài nộp theo assignmentId: {}", assignmentId);
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Assignment not found"));
        if (assignment.getWorkspace() == null) throw new BusinessException(ErrorCode.FORBIDDEN, "Assignment workspace required");
        accessPolicyService.requireWorkspaceLecturer(assignment.getWorkspace().getId());
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId);
        return mapToResponseListWithFeedbackCount(submissions);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByProject(UUID projectId) {
        log.debug("Lấy danh sách bài nộp theo projectId: {}", projectId);
        accessPolicyService.requireProjectReadAccess(projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Project not found")));
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByProjectIdOrderBySubmittedAtDesc(projectId);
        return mapToResponseListWithFeedbackCount(submissions);
    }

    @Override
    @Transactional(readOnly = true)
    public SubmissionResponseDTO getSubmissionById(UUID submissionId) {
        log.debug("Lấy chi tiết bài nộp theo submissionId: {}", submissionId);
        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        accessPolicyService.requireProjectReadAccess(submission.getProject());
        long feedbackCount = feedbackCommentRepository.countBySubmissionId(submissionId);
        return SubmissionResponseDTO.fromEntity(submission, feedbackCount);
    }

    @Override
    @Transactional(readOnly = true)
    public com.mavis.platform.submission.dto.SubmissionExportBundleDTO exportSubmissionBundle(UUID submissionId) {
        log.info("Xuất gói bài nộp bất biến: submissionId={}", submissionId);

        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        accessPolicyService.requireProjectReadAccess(submission.getProject());
        // Kiểm tra quyền đọc
        Project project = submission.getProject();
        // Lấy danh sách feedbacks
        List<com.mavis.platform.submission.dto.FeedbackResponseDTO> feedbacks = feedbackCommentRepository
                .findBySubmissionIdOrderByCreatedAtAsc(submissionId).stream()
                .map(com.mavis.platform.submission.dto.FeedbackResponseDTO::fromEntity)
                .collect(Collectors.toList());

        // Lấy điểm tuân thủ
        Double complianceScore = null;
        if (submission.getEvaluationRun() != null && submission.getEvaluationRun().getSummaryMetrics() != null) {
            var metrics = submission.getEvaluationRun().getSummaryMetrics();
            if (metrics.has("complianceScore") && !metrics.get("complianceScore").isNull()) {
                complianceScore = metrics.get("complianceScore").asDouble();
            }
        }

        // Tạo Mermaid DSL
        String mermaidDsl = null;
        DiagramVersion dv = submission.getDiagramVersion();
        if (dv != null && dv.getLayoutJson() != null) {
            mermaidDsl = com.mavis.common.utils.MermaidDslGenerator.generateFromLayoutJson(
                    dv.getNotation(),
                    dv.getLevel(),
                    dv.getLayoutJson()
            ).getDsl();
        }

        String markdownReport = buildMarkdownReport(submission, complianceScore, mermaidDsl, feedbacks);
        var releasedReview = submissionReviewRepository.findBySubmissionId(submissionId).filter(r -> !"DRAFT".equals(r.getStatus()));
        if (releasedReview.isPresent()) {
            var review = releasedReview.get();
            markdownReport += "\n## Lecturer review\n- Status: " + review.getStatus() + "\n- Lecturer score /100: " + review.getScore() + "\n\n" + review.getSummary() + "\n";
        }

        return com.mavis.platform.submission.dto.SubmissionExportBundleDTO.builder()
                .submissionId(submission.getId())
                .projectId(project != null ? project.getId() : null)
                .projectName(project != null ? project.getName() : null)
                .assignmentId(submission.getAssignment() != null ? submission.getAssignment().getId() : null)
                .assignmentTitle(submission.getAssignment() != null ? submission.getAssignment().getTitle() : null)
                .submittedById(submission.getSubmittedBy() != null ? submission.getSubmittedBy().getId() : null)
                .submittedByName(submission.getSubmittedBy() != null ? submission.getSubmittedBy().getFullName() : null)
                .sourceSnapshotId(submission.getSourceSnapshot() != null ? submission.getSourceSnapshot().getId() : null)
                .artifactHash(submission.getSourceSnapshot() != null ? submission.getSourceSnapshot().getArtifactHash() : null)
                .evidencePackageDigest(submission.getEvidencePackageDigest())
                .modelVersionId(submission.getModelVersion() != null ? submission.getModelVersion().getId() : null)
                .modelRevision(submission.getModelVersion() != null ? submission.getModelVersion().getRevision() : null)
                .diagramVersionId(dv != null ? dv.getId() : null)
                .layoutJson(dv != null ? dv.getLayoutJson() : null)
                .mermaidDsl(mermaidDsl)
                .complianceScore(complianceScore)
                .reviewStatus(releasedReview.map(SubmissionReview::getStatus).orElse("PENDING"))
                .lecturerScore(releasedReview.map(SubmissionReview::getScore).orElse(null))
                .reviewSummary(releasedReview.map(SubmissionReview::getSummary).orElse(""))
                .reviewerName(releasedReview.map(r -> r.getLecturer().getFullName()).orElse(null))
                .reviewedAt(releasedReview.map(SubmissionReview::getUpdatedAt).orElse(null))
                .runtimeSessionId(submission.getRuntimeSession() != null ? submission.getRuntimeSession().getId() : null)
                .courseQuizEvidence(submission.getCourseQuizEvidence())
                .scenarioStatus(submission.getRuntimeSession() != null ? submission.getRuntimeSession().getScenarioStatus() : null)
                .lecturerFeedbacks(feedbacks)
                .markdownSummaryReport(markdownReport)
                .exportedAt(OffsetDateTime.now())
                .build();
    }

    private String buildMarkdownReport(SubmissionSnapshot s, Double complianceScore, String mermaidDsl,
                                       List<com.mavis.platform.submission.dto.FeedbackResponseDTO> feedbacks) {
        StringBuilder sb = new StringBuilder();
        sb.append("# BÁO CÁO TỔNG HỢP GÓI BÀI NỘP BẤT BIẾN (IMMUTABLE SUBMISSION BUNDLE)\n\n");
        sb.append("## 1. Thông Tin Chung Bài Nộp\n");
        sb.append("- **Mã bài nộp (Submission ID)**: `").append(s.getId()).append("`\n");
        sb.append("- **Đề bài (Assignment)**: ").append(s.getAssignment() != null ? s.getAssignment().getTitle() : "N/A").append("\n");
        sb.append("- **Đồ án (Project)**: ").append(s.getProject() != null ? s.getProject().getName() : "N/A").append("\n");
        sb.append("- **Sinh viên nộp bài**: ").append(s.getSubmittedBy() != null ? s.getSubmittedBy().getFullName() : "N/A");
        if (s.getSubmittedBy() != null && s.getSubmittedBy().getEmail() != null) {
            sb.append(" (").append(s.getSubmittedBy().getEmail()).append(")");
        }
        sb.append("\n");
        sb.append("- **Thời gian nộp bài**: ").append(s.getSubmittedAt()).append("\n");
        if (s.getSubmissionNotes() != null && !s.getSubmissionNotes().isBlank()) {
            sb.append("- **Ghi chú của sinh viên**: ").append(s.getSubmissionNotes()).append("\n");
        }
        sb.append("\n");

        sb.append("## 2. Phiên Bản Kiến Trúc & Tính Toàn Vẹn Bất Biến (Pinning)\n");
        sb.append("- **Source Snapshot ID**: `").append(s.getSourceSnapshot() != null ? s.getSourceSnapshot().getId() : "N/A").append("`\n");
        sb.append("- **Mã băm mã nguồn (Artifact Hash)**: `").append(s.getSourceSnapshot() != null ? s.getSourceSnapshot().getArtifactHash() : "N/A").append("`\n");
        sb.append("- **Model Version ID**: `").append(s.getModelVersion() != null ? s.getModelVersion().getId() : "N/A").append("`\n");
        sb.append("- **Phiên bản mô hình (Revision)**: ").append(s.getModelVersion() != null ? s.getModelVersion().getRevision() : "N/A").append("\n");
        sb.append("- **Diagram Version ID**: `").append(s.getDiagramVersion() != null ? s.getDiagramVersion().getId() : "N/A").append("`\n\n");
        sb.append("- **Evidence Package SHA-256**: `").append(s.getEvidencePackageDigest()).append("`\n\n");

        sb.append("## 3. Đánh Giá Kiến Trúc & Thực Nghiệm Runtime\n");
        sb.append("- **Điểm tuân thủ quy tắc kiến trúc (Compliance Score)**: ")
                .append(complianceScore != null ? complianceScore + " / 100" : "Chưa chấm điểm / Không áp dụng").append("\n");
        sb.append("- **Phiên thực nghiệm (Runtime Session)**: `")
                .append(s.getRuntimeSession() != null ? s.getRuntimeSession().getId() : "N/A").append("`\n");
        sb.append("- **Trạng thái kịch bản (Scenario Status)**: ")
                .append(s.getRuntimeSession() != null ? s.getRuntimeSession().getScenarioStatus() : "N/A").append("\n");
        sb.append("- **Chất lượng Trace (Trace Quality)**: ")
                .append(s.getRuntimeSession() != null ? s.getRuntimeSession().getTraceQuality() : "N/A").append("\n\n");

        sb.append("## 4. Sơ Đồ Kiến Trúc (Mermaid DSL)\n");
        sb.append("```mermaid\n");
        sb.append(mermaidDsl != null ? mermaidDsl : "flowchart LR\n    emptyNode[\"Chưa có sơ đồ\"]");
        sb.append("\n```\n\n");

        sb.append("## 5. Nhận Xét & Đánh Giá Của Giảng Viên (Feedbacks)\n");
        if (feedbacks == null || feedbacks.isEmpty()) {
            sb.append("*Chưa có nhận xét nào từ giảng viên.*\n");
        } else {
            for (int i = 0; i < feedbacks.size(); i++) {
                com.mavis.platform.submission.dto.FeedbackResponseDTO fb = feedbacks.get(i);
                sb.append(i + 1).append(". **").append(fb.getLecturerName() != null ? fb.getLecturerName() : "Giảng viên").append("**");
                if (fb.getCreatedAt() != null) {
                    sb.append(" (").append(fb.getCreatedAt()).append(")");
                }
                sb.append(":\n");
                if (fb.getElementName() != null) {
                    sb.append("   - *Phần tử*: `").append(fb.getElementName()).append("`\n");
                }
                if (fb.getRelationType() != null) {
                    sb.append("   - *Quan hệ*: `").append(fb.getRelationType()).append("`\n");
                }
                sb.append("   - *Nội dung*: ").append(fb.getCommentText()).append("\n\n");
            }
        }
        return sb.toString();
    }

    private String evidencePackageDigest(Assignment assignment, Project project, SourceSnapshot sourceSnapshot,
                                         ModelVersion modelVersion, DiagramVersion diagramVersion,
                                         EvaluationRun evaluationRun, RuntimeSession runtimeSession,
                                         JsonNode courseQuizEvidence, String notes) {
        String canonical = String.join("|",
                assignment.getId().toString(), project.getId().toString(), sourceSnapshot.getId().toString(),
                Objects.toString(sourceSnapshot.getArtifactHash(), ""), modelVersion.getId().toString(),
                Objects.toString(modelVersion.getRevision(), ""), diagramVersion.getId().toString(),
                Objects.toString(diagramVersion.getLayoutJson(), ""),
                evaluationRun == null ? "" : evaluationRun.getId().toString(),
                evaluationRun == null ? "" : Objects.toString(evaluationRun.getSummaryMetrics(), ""),
                runtimeSession == null ? "" : runtimeSession.getId().toString(),
                runtimeSession == null ? "" : Objects.toString(runtimeSession.getReceiptDigest(), ""),
                Objects.toString(courseQuizEvidence, ""), Objects.toString(notes, ""));
        return "sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(canonical.getBytes(StandardCharsets.UTF_8));
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
