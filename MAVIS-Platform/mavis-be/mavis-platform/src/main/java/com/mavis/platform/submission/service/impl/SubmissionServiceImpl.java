package com.mavis.platform.submission.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.platform.submission.dto.SubmissionCreateRequest;
import com.mavis.platform.submission.dto.SubmissionCreateRequest.StudentSnapshotItemDTO;
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

    private static final String STATIC_SNAPSHOT = "STEP_1_STATIC";
    private static final String STUDIO_SNAPSHOT = "STEP_4_RUNTIME";

    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final AssignmentRepository assignmentRepository;
    private final WorkspaceRepository workspaceRepository;
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
        return getMySubmissions(null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getMySubmissions(UUID workspaceId) {
        User user = accessPolicyService.requireCurrentActiveUser();
        boolean admin = user.getRole()!=null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode());
        List<SubmissionResponseDTO> all = mapToResponseListWithFeedbackCount(
                submissionSnapshotRepository.findVisibleTo(user.getId(), admin));
        if (workspaceId == null) {
            return all;
        }
        return all.stream()
                .filter(s -> workspaceId.equals(s.getWorkspaceId()))
                .toList();
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

        boolean guidedLab = assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode();
        boolean studentLab = guidedLab && com.mavis.common.security.CourseLabPolicy.isStudent(submitter);

        accessPolicyService.requireCurrentActiveUser();
        if (assignment.getWorkspace()!=null) accessPolicyService.requireWorkspaceMember(assignment.getWorkspace().getId());

        if (studentLab) {
            UUID workspaceId = assignment.getWorkspace().getId();
            workspaceRepository.findLockedById(workspaceId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));
            courseLabs.requireOpen(assignment, submitter);
            if (courseLabs.passedAssignments(workspaceId, currentUserId).contains(assignment.getId())) {
                throw new BusinessException(ErrorCode.CONFLICT, "LAB_SUBMISSION_ALREADY_PASSED");
            }
        }

        // 1. Kiểm tra hạn nộp bài (BR-14)
        if (assignment.getDueAt() != null && OffsetDateTime.now().isAfter(assignment.getDueAt())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Đã quá hạn nộp bài cho đề bài này");
        }

        if (!"LEGACY".equalsIgnoreCase(assignment.getLabMode() == null ? "LEGACY" : assignment.getLabMode())) {
            return submitTheoryV2(request, assignment, submitter, currentUserId);
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

        if (guidedLab
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
        if (studentLab) {
            var lockedLab = assignmentRepository.findLockedById(assignment.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Lab not found"));
            var pass = courseLabs.currentQuizPass(lockedLab, currentUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN, "Pass the current Lab Quiz before submitting"));
            var referenceModel = lockedLab.getReferenceModel();
            var referenceSnapshot = referenceModel == null ? null : referenceModel.getSourceSnapshot();
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
        boolean requiresRuntime = Boolean.TRUE.equals(assignment.getRequireRuntimeTrace());
        if (requiresRuntime && !guidedLab) {
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

        if (guidedLab) {
            if (sourceSnapshot.getArtifactHash() == null || sourceSnapshot.getArtifactHash().isBlank()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "STEP_1_STATIC_ANALYZED");
            }
            if (requiresRuntime && (runtimeSession == null || !runtimeSession.hasVerifiedStudioEvidence()
                    || (modelVersion.getRuntimeSession() == null && (runtimeSession.getModelVersion() == null
                        || !modelVersion.getId().equals(runtimeSession.getModelVersion().getId()))))) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "STEP_4_SIGNED_RUNTIME_RECEIPT");
            }
        }

        var studioEvidence = freezeStudioEvidence(runtimeSession);
        List<StudentSnapshotItemDTO> studentSnapshots = request.getStudentSnapshots();
        if (studentLab) {
            studentSnapshots = guidedSnapshots(studentSnapshots, modelVersion,
                    requiresRuntime || studioEvidence != null ? runtimeSession : null, studioEvidence);
        }
        ObjectMapper mapper = this.json != null ? this.json : new ObjectMapper();
        JsonNode studentSnapshotsNode = studentSnapshots == null || studentSnapshots.isEmpty()
                ? null : mapper.valueToTree(studentSnapshots);

        String evidencePackageDigest = evidencePackageDigest(assignment, project, sourceSnapshot, modelVersion,
                diagramVersion, evaluationRun, runtimeSession, courseQuizEvidence, studentSnapshotsNode, request.getSubmissionNotes());
        if (studioEvidence != null) {
            StringBuilder snapshotDigests = new StringBuilder();
            for (var captured : studioEvidence.path("snapshots")) {
                snapshotDigests.append(captured.path("id").asText()).append(':')
                        .append(captured.path("digest").asText()).append('|');
            }
            evidencePackageDigest = "sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(
                    (evidencePackageDigest + "|" + snapshotDigests + "|" + studioEvidence.path("receiptSignature").asText(""))
                            .getBytes(StandardCharsets.UTF_8));
        }

        SubmissionSnapshot submission = SubmissionSnapshot.builder()
                .studioEvidence(studioEvidence)
                .assignment(assignment)
                .project(project)
                .submittedBy(submitter)
                .sourceSnapshot(sourceSnapshot)
                .modelVersion(modelVersion)
                .diagramVersion(diagramVersion)
                .evaluationRun(evaluationRun)
                .runtimeSession(runtimeSession)
                .courseQuizEvidence(courseQuizEvidence)
                .studentSnapshots(studentSnapshotsNode)
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

    private SubmissionResponseDTO submitTheoryV2(SubmissionCreateRequest request, Assignment assignment,
                                                  User submitter, UUID currentUserId) {
        ModelVersion referenceModel = assignment.getReferenceModel();
        if (referenceModel == null || referenceModel.getSourceSnapshot() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Lab chưa có reference source đã phân tích");
        }
        SourceSnapshot sourceSnapshot = referenceModel.getSourceSnapshot();
        Project referenceProject = referenceModel.getProject();
        if (referenceProject == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Reference source không thuộc project hợp lệ");
        }
        boolean studioMode = "THEORY_QUIZ_STUDIO".equalsIgnoreCase(assignment.getLabMode());
        if (studioMode && assignment.getLabOrder() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Studio Lab phải được publish trước khi nộp");
        }

        boolean skipQuiz = assignment.getAiPolicy() != null
                && (assignment.getAiPolicy().path("skipQuiz").asBoolean(false)
                    || "THEORY_ONLY".equalsIgnoreCase(assignment.getAiPolicy().path("labTier").asText()));
        JsonNode quizEvidence = null;
        if (!skipQuiz && assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && com.mavis.common.security.CourseLabPolicy.isStudent(submitter)) {
            var pass = courseLabs.currentQuizPass(assignment, currentUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
                            "Pass the current Lab Quiz before submitting"));
            quizEvidence = json.createObjectNode().put("status", "PASSED")
                    .put("attemptId", pass.attemptId().toString()).put("quizVersion", pass.quizVersion())
                    .put("correctCount", pass.correctCount()).put("questionCount", pass.questionCount())
                    .put("passPercent", pass.passPercent()).put("submittedAt", pass.submittedAt().toString())
                    .put("referenceModelId", referenceModel.getId().toString())
                    .put("referenceSnapshotId", sourceSnapshot.getId().toString())
                    .put("artifactHash", sourceSnapshot.getArtifactHash()).put("commitSha", sourceSnapshot.getCommitSha());
        } else if (skipQuiz) {
            quizEvidence = json.createObjectNode().put("status", "NOT_REQUIRED")
                    .put("labTier", "THEORY_ONLY")
                    .put("referenceModelId", referenceModel.getId().toString())
                    .put("referenceSnapshotId", sourceSnapshot.getId().toString());
        }

        JsonNode theoryEvidence = theoryEvidence(request.getTheoryAnswers());
        if (theoryEvidence.path("answers").isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ANSWER_REQUIRED");
        }

        RuntimeSession runtimeSession = null;
        JsonNode studioEvidence = null;
        if (studioMode) {
            if (request.getRuntimeSessionId() == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_SESSION_REQUIRED");
            }
            runtimeSession = runtimeSessionRepository.findById(request.getRuntimeSessionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Studio session not found"));
            if (runtimeSession.getAssignment() == null
                    || !assignment.getId().equals(runtimeSession.getAssignment().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Studio session does not belong to this Lab");
            }
            if (runtimeSession.getTriggeredBy() == null
                    || !currentUserId.equals(runtimeSession.getTriggeredBy().getId())) {
                throw new BusinessException(ErrorCode.FORBIDDEN, "Use your own Studio session as evidence");
            }
            if (runtimeSession.getProject() == null || runtimeSession.getProject().getWorkspace() == null
                    || assignment.getWorkspace() == null
                    || !assignment.getWorkspace().getId().equals(runtimeSession.getProject().getWorkspace().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Studio session belongs to a different workspace");
            }
            var sessionSource = runtimeSession.getSourceSnapshot();
            var sessionModel = runtimeSession.getModelVersion();
            boolean sameSource = sessionSource != null
                    && (sourceSnapshot.getId().equals(sessionSource.getId())
                        || (sourceSnapshot.getArtifactHash() != null
                            && sourceSnapshot.getArtifactHash().equals(sessionSource.getArtifactHash())));
            boolean sameModel = sessionModel != null
                    && (referenceModel.getId().equals(sessionModel.getId())
                        || (sameSource && runtimeSession.getProject() != null
                            && sessionModel.getProject() != null
                            && runtimeSession.getProject().getId().equals(sessionModel.getProject().getId())));
            if (!sameSource || !sameModel) {
                throw new BusinessException(ErrorCode.BAD_REQUEST,
                        "Studio session source/model does not match this Lab");
            }
            if (!runtimeSession.hasVerifiedStudioEvidence()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EVIDENCE_REQUIRED");
            }
            studioEvidence = freezeStudioEvidence(runtimeSession);
            if (studioEvidence == null) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_EVIDENCE_REQUIRED");
            }
        }

        ObjectMapper mapper = this.json != null ? this.json : new ObjectMapper();
        var snapshots = new ArrayList<StudentSnapshotItemDTO>();
        for (JsonNode answer : theoryEvidence.path("answers")) {
            snapshots.add(StudentSnapshotItemDTO.builder()
                    .snapshotId("THEORY_" + answer.path("sectionId").asText("THEORY"))
                    .step("THEORY")
                    .title(answer.path("title").asText("Theory explanation"))
                    .writtenExplanation(answer.path("answer").asText())
                    .build());
        }
        if (studioEvidence != null) {
            int index = 1;
            for (JsonNode captured : studioEvidence.path("snapshots")) {
                snapshots.add(StudentSnapshotItemDTO.builder()
                        .snapshotId("STUDIO_" + captured.path("id").asText("snapshot" + index))
                        .step("STEP_4_RUNTIME")
                        .title(captured.path("title").asText("Studio snapshot " + index))
                        .writtenExplanation(captured.path("explanation").asText(""))
                        .build());
                index++;
            }
        }
        JsonNode studentSnapshots = mapper.valueToTree(snapshots);
        String digest = evidenceDigestV2(assignment, sourceSnapshot, quizEvidence, theoryEvidence,
                studioEvidence, request.getSubmissionNotes());

        SubmissionSnapshot submission = SubmissionSnapshot.builder()
                .assignment(assignment)
                .project(referenceProject)
                .submittedBy(submitter)
                .sourceSnapshot(sourceSnapshot)
                .modelVersion(referenceModel)
                .diagramVersion(null)
                .runtimeSession(runtimeSession)
                .courseQuizEvidence(quizEvidence)
                .theoryEvidence(theoryEvidence)
                .studentSnapshots(studentSnapshots)
                .submissionNotes(request.getSubmissionNotes())
                .evidencePackageDigest(digest)
                .studioEvidence(studioEvidence)
                .build();
        submission = submissionSnapshotRepository.save(submission);
        submissionSnapshotRepository.flush();
        log.info("Nộp bài Lab v2 thành công: submissionId={}, mode={}", submission.getId(), assignment.getLabMode());
        return SubmissionResponseDTO.fromEntity(submission, 0L);
    }

    private JsonNode theoryEvidence(List<SubmissionCreateRequest.TheoryAnswerDTO> answers) {
        var root = (com.fasterxml.jackson.databind.node.ObjectNode) json.createObjectNode();
        var array = root.putArray("answers");
        if (answers != null) {
            int count = 0;
            for (var answer : answers) {
                if (answer == null) continue;
                String text = answer.getAnswer() == null ? "" : answer.getAnswer().trim();
                if (text.isEmpty()) continue;
                if (++count > 5 || text.length() > 20000) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ANSWER_INVALID");
                }
                String section = answer.getSectionId() == null || answer.getSectionId().isBlank()
                        ? "THEORY" : answer.getSectionId().trim().toUpperCase(java.util.Locale.ROOT);
                if (!section.matches("[A-Z0-9_]{1,64}")) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_SECTION_INVALID");
                }
                array.addObject().put("sectionId", section)
                        .put("title", answer.getTitle() == null || answer.getTitle().isBlank()
                                ? "Theory explanation" : answer.getTitle().trim())
                        .put("answer", text);
            }
        }
        return root;
    }

    private String evidenceDigestV2(Assignment assignment, SourceSnapshot source, JsonNode quiz,
                                    JsonNode theory, JsonNode studio, String notes) {
        StringBuilder canonical = new StringBuilder()
                .append(assignment.getId()).append('|').append(assignment.getLabMode()).append('|')
                .append(source.getId()).append('|').append(source.getArtifactHash()).append('|')
                .append(quiz == null ? "" : quiz.toString()).append('|')
                .append(theory.toString()).append('|')
                .append(studio == null ? "" : studio.path("receiptSignature").asText("")).append('|')
                .append(notes == null ? "" : notes.trim());
        return "sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(
                canonical.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByAssignment(UUID assignmentId) {
        return getSubmissionsByAssignment(assignmentId, null, null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByAssignment(UUID assignmentId, String reviewStatus, String labOutcome) {
        log.debug("Lấy danh sách bài nộp theo assignmentId: {}, reviewStatus={}, labOutcome={}", assignmentId, reviewStatus, labOutcome);
        Assignment assignment = assignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Assignment not found"));
        if (assignment.getWorkspace() == null) throw new BusinessException(ErrorCode.FORBIDDEN, "Assignment workspace required");
        accessPolicyService.requireWorkspaceLecturer(assignment.getWorkspace().getId());
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId);
        List<SubmissionResponseDTO> mapped = mapToResponseListWithFeedbackCount(submissions, true);
        if ((reviewStatus == null || reviewStatus.isBlank()) && (labOutcome == null || labOutcome.isBlank())) {
            return mapped;
        }
        return mapped.stream()
                .filter(s -> reviewStatus == null || reviewStatus.isBlank()
                        || reviewStatus.trim().equalsIgnoreCase(s.getReviewStatus()))
                .filter(s -> labOutcome == null || labOutcome.isBlank()
                        || labOutcome.trim().equalsIgnoreCase(s.getLabOutcome()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByProject(UUID projectId) {
        log.debug("Lấy danh sách bài nộp theo projectId: {}", projectId);
        accessPolicyService.requireProjectReadAccess(projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Project not found")));
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByProjectIdOrderBySubmittedAtDesc(projectId);
        return mapToResponseListWithFeedbackCount(submissions, false);
    }

    @Override
    @Transactional(readOnly = true)
    public SubmissionResponseDTO getSubmissionById(UUID submissionId) {
        log.debug("Lấy chi tiết bài nộp theo submissionId: {}", submissionId);
        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        requireSubmissionReadAccess(accessPolicyService, submission);
        long feedbackCount = feedbackCommentRepository.countBySubmissionId(submissionId);
        SubmissionReview review = submissionReviewRepository.findBySubmissionId(submissionId).orElse(null);
        User actor = accessPolicyService.requireCurrentActiveUser();
        boolean revealDraft = actor != null && actor.getRole() != null
                && !"STUDENT".equalsIgnoreCase(actor.getRole().getCode());
        return SubmissionResponseDTO.fromEntity(submission, feedbackCount, review, revealDraft);
    }

    @Override
    @Transactional(readOnly = true)
    public com.mavis.platform.submission.dto.SubmissionExportBundleDTO exportSubmissionBundle(UUID submissionId) {
        log.info("Xuất gói bài nộp bất biến: submissionId={}", submissionId);

        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        requireSubmissionReadAccess(accessPolicyService, submission);
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

        var assignment = submission.getAssignment();
        var workspace = assignment != null ? assignment.getWorkspace() : null;

        return com.mavis.platform.submission.dto.SubmissionExportBundleDTO.builder()
                .studioEvidence(submission.getStudioEvidence())
                .submissionId(submission.getId())
                .workspaceId(workspace != null ? workspace.getId() : null)
                .workspaceName(workspace != null ? workspace.getName() : null)
                .projectId(project != null ? project.getId() : null)
                .projectName(project != null ? project.getName() : null)
                .assignmentId(assignment != null ? assignment.getId() : null)
                .assignmentTitle(assignment != null ? assignment.getTitle() : null)
                .labOrder(assignment != null ? assignment.getLabOrder() : null)
                .labMode(assignment != null && assignment.getLabMode() != null ? assignment.getLabMode() : "LEGACY")
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
                .theoryEvidence(submission.getTheoryEvidence())
                .studentSnapshots(submission.getStudentSnapshots())
                .snapshotGrades(releasedReview.map(SubmissionReview::getSnapshotGrades).orElse(null))
                .labOutcome(releasedReview.map(SubmissionReview::getLabOutcome).orElse(null))
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

    private com.fasterxml.jackson.databind.node.ObjectNode freezeStudioEvidence(RuntimeSession runtime) {
        if (runtime == null || runtime.getScenarioConfig() == null
                || !runtime.getScenarioConfig().path("interactiveStudio").asBoolean()) return null;

        var control = runtime.getStudioControl();
        if (control == null || !control.path("snapshots").isArray() || control.path("snapshots").isEmpty()
                || !runtime.hasVerifiedStudioEvidence() || control.path("receiptSignature").asText("").isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "STEP_4_SIGNED_RUNTIME_RECEIPT");
        }
        var evidence = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode()
                .put("sessionId", runtime.getId().toString()).put("receiptDigest", runtime.getReceiptDigest());
        evidence.set("snapshots", control.path("snapshots").deepCopy());
        evidence.set("receiptSignature", control.path("receiptSignature").deepCopy());
        evidence.set("receipt", runtime.getRunnerReceiptJson().deepCopy());
        return evidence;
    }

    private List<StudentSnapshotItemDTO> guidedSnapshots(List<StudentSnapshotItemDTO> submitted, ModelVersion model,
                                                        RuntimeSession runtime, JsonNode studioEvidence) {
        Set<String> required = new LinkedHashSet<>();
        required.add(STATIC_SNAPSHOT);
        Map<String, JsonNode> capturedById = new LinkedHashMap<>();
        if (studioEvidence != null) {
            for (JsonNode capture : studioEvidence.path("snapshots")) {
                String id = capture.path("id").asText("");
                if (id.isBlank() || !required.add(id) || capture.path("explanation").asText("").isBlank()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "STEP_4_SIGNED_RUNTIME_RECEIPT");
                }
                capturedById.put(id, capture);
            }
        } else if (runtime != null) {
            required.add(STUDIO_SNAPSHOT);
        }

        Map<String, String> explanations = new HashMap<>();
        if (submitted != null) {
            for (StudentSnapshotItemDTO item : submitted) {
                String id = item == null ? null : item.getSnapshotId();
                if (!required.contains(id) || explanations.containsKey(id)
                        || !Objects.equals(item.getStep(), STATIC_SNAPSHOT.equals(id) ? STATIC_SNAPSHOT : STUDIO_SNAPSHOT)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "SUBMISSION_SNAPSHOT_IDS_INVALID");
                }
                String explanation = item.getWrittenExplanation();
                if (explanation == null || explanation.isBlank() || explanation.length() > 5000) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");
                }
                explanations.put(id, explanation.strip());
            }
        }
        if (required.stream().anyMatch(id -> !capturedById.containsKey(id) && !explanations.containsKey(id))) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");
        }

        List<StudentSnapshotItemDTO> snapshots = new ArrayList<>();
        snapshots.add(StudentSnapshotItemDTO.builder().snapshotId(STATIC_SNAPSHOT).step(STATIC_SNAPSHOT)
                .title("Snapshot 1 · Static C1–C3 Architecture & 3E Reasoning").targetViewOrService(model.getId().toString())
                .writtenExplanation(explanations.get(STATIC_SNAPSHOT)).build());
        if (runtime == null) return snapshots;

        if (studioEvidence == null) {
            snapshots.add(StudentSnapshotItemDTO.builder().snapshotId(STUDIO_SNAPSHOT).step(STUDIO_SNAPSHOT)
                    .title("Snapshot 2 · MAVIS Studio Runtime Stop/Scale Before-After Analysis")
                    .targetViewOrService(runtime.getId().toString()).writtenExplanation(explanations.get(STUDIO_SNAPSHOT)).build());
        } else {
            int index = 1;
            for (var captured : capturedById.entrySet()) {
                snapshots.add(StudentSnapshotItemDTO.builder().snapshotId(captured.getKey()).step(STUDIO_SNAPSHOT)
                        .title("Studio snapshot " + index++).targetViewOrService(runtime.getId().toString())
                        .writtenExplanation(captured.getValue().path("explanation").asText())
                        .capturedAt(captured.getValue().path("capturedAt").textValue()).build());
            }
        }
        return snapshots;
    }

    private String evidencePackageDigest(Assignment assignment, Project project, SourceSnapshot sourceSnapshot,
                                         ModelVersion modelVersion, DiagramVersion diagramVersion,
                                         EvaluationRun evaluationRun, RuntimeSession runtimeSession,
                                         JsonNode courseQuizEvidence, JsonNode studentSnapshots, String notes) {
        String canonical = String.join("|",
                assignment.getId().toString(), project.getId().toString(), sourceSnapshot.getId().toString(),
                Objects.toString(sourceSnapshot.getArtifactHash(), ""), modelVersion.getId().toString(),
                Objects.toString(modelVersion.getRevision(), ""), diagramVersion.getId().toString(),
                Objects.toString(diagramVersion.getLayoutJson(), ""),
                evaluationRun == null ? "" : evaluationRun.getId().toString(),
                evaluationRun == null ? "" : Objects.toString(evaluationRun.getSummaryMetrics(), ""),
                runtimeSession == null ? "" : runtimeSession.getId().toString(),
                runtimeSession == null ? "" : Objects.toString(runtimeSession.getReceiptDigest(), ""),
                Objects.toString(courseQuizEvidence, ""),
                Objects.toString(studentSnapshots, ""),
                Objects.toString(notes, ""));
        return "sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(canonical.getBytes(StandardCharsets.UTF_8));
    }

    private List<SubmissionResponseDTO> mapToResponseListWithFeedbackCount(List<SubmissionSnapshot> submissions) {
        return mapToResponseListWithFeedbackCount(submissions, false);
    }

    private List<SubmissionResponseDTO> mapToResponseListWithFeedbackCount(
            List<SubmissionSnapshot> submissions,
            boolean revealDraft) {
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

        Map<UUID, SubmissionReview> reviewsBySubmission = new HashMap<>();
        List<SubmissionReview> reviews = submissionReviewRepository.findBySubmissionIdIn(submissionIds);
        if (reviews != null) {
            for (SubmissionReview review : reviews) {
                if (review != null && review.getSubmission() != null && review.getSubmission().getId() != null) {
                    reviewsBySubmission.put(review.getSubmission().getId(), review);
                }
            }
        }

        return submissions.stream()
                .map(s -> SubmissionResponseDTO.fromEntity(
                        s,
                        feedbackCounts.getOrDefault(s.getId(), 0L),
                        reviewsBySubmission.get(s.getId()),
                        revealDraft))
                .collect(Collectors.toList());
    }

    static void requireSubmissionReadAccess(com.mavis.common.security.AccessPolicyService accessPolicyService,
                                            SubmissionSnapshot submission) {
        Assignment assignment = submission.getAssignment();
        boolean v2Lab = assignment != null && assignment.getLabMode() != null
                && !"LEGACY".equalsIgnoreCase(assignment.getLabMode());
        if (v2Lab) {
            User actor = accessPolicyService.requireCurrentActiveUser();
            UUID currentUserId = actor != null ? actor.getId() : SecurityUtils.getCurrentUserId();
            if (currentUserId != null && submission.getSubmittedBy() != null
                    && currentUserId.equals(submission.getSubmittedBy().getId())) {
                if (assignment.getWorkspace() != null) {
                    accessPolicyService.requireWorkspaceMember(assignment.getWorkspace().getId());
                }
                return;
            }
            if (assignment.getWorkspace() != null) {
                accessPolicyService.requireWorkspaceLecturer(assignment.getWorkspace().getId());
                return;
            }
        }
        accessPolicyService.requireProjectReadAccess(submission.getProject());
    }
}
