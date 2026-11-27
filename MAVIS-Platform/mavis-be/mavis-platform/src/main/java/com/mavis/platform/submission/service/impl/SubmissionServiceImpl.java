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

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.springframework.jdbc.core.JdbcTemplate jdbc;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private LabStudioExerciseRepository labStudioExerciseRepository;

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getMySubmissions() {
        return getMySubmissions(null);
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getMySubmissions(UUID workspaceId) {
        User user = accessPolicyService.requireCurrentActiveUser();
        boolean admin = user.getRole() != null && "SYSTEM_ADMIN".equalsIgnoreCase(user.getRole().getCode());
        boolean revealDraft = admin || (user.getRole() != null && !"STUDENT".equalsIgnoreCase(user.getRole().getCode()));
        if (jdbc != null) {
            return queryMySubmissionsLightweight(user.getId(), admin, workspaceId, revealDraft);
        }
        List<SubmissionSnapshot> visible = submissionSnapshotRepository.findVisibleTo(user.getId(), admin);
        if (visible.isEmpty()) {
            return Collections.emptyList();
        }
        Set<UUID> workspacesWithOrderedLabs = visible.stream()
                .map(SubmissionSnapshot::getAssignment)
                .filter(Objects::nonNull)
                .filter(a -> a.getLabOrder() != null && a.getWorkspace() != null && a.getWorkspace().getId() != null)
                .map(a -> a.getWorkspace().getId())
                .collect(Collectors.toSet());
        List<SubmissionSnapshot> activeVisible = visible.stream()
                .filter(s -> workspaceId == null
                        || (s.getAssignment() != null && s.getAssignment().getWorkspace() != null
                                && workspaceId.equals(s.getAssignment().getWorkspace().getId())))
                .filter(s -> !isObsoleteDetachedCourseLab(s.getAssignment(), workspacesWithOrderedLabs))
                .toList();
        return mapToResponseListWithFeedbackCount(activeVisible, revealDraft);
    }

    private static boolean isObsoleteDetachedCourseLab(Assignment assignment, Set<UUID> workspacesWithOrderedLabs) {
        if (assignment == null || assignment.getWorkspace() == null || !assignment.getWorkspace().isCourseMode()) {
            return false;
        }
        if (assignment.getLabOrder() != null) {
            return false;
        }
        if (assignment.getAiPolicy() != null && assignment.getAiPolicy().path("archivedV1").asBoolean(false)) {
            return true;
        }
        UUID wsId = assignment.getWorkspace().getId();
        return wsId != null && workspacesWithOrderedLabs.contains(wsId);
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
            var referenceModel = lockedLab.getReferenceModel();
            var referenceSnapshot = referenceModel == null ? null : referenceModel.getSourceSnapshot();
            if (referenceSnapshot == null || !referenceSnapshot.getId().equals(project.getReferenceSnapshotId())
                    || !Objects.equals(referenceSnapshot.getArtifactHash(), sourceSnapshot.getArtifactHash())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Submission source does not match the current Lab reference");
            }
            if (courseLabs.isQuizNotRequired(lockedLab)) {
                courseQuizEvidence = json.createObjectNode().put("status", "NOT_REQUIRED")
                        .put("referenceModelId", referenceModel.getId().toString())
                        .put("referenceSnapshotId", referenceSnapshot.getId().toString())
                        .put("artifactHash", referenceSnapshot.getArtifactHash()).put("commitSha", referenceSnapshot.getCommitSha());
            } else {
                var pass = courseLabs.currentQuizPass(lockedLab, currentUserId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN, "Pass the current Lab Quiz before submitting"));
                courseQuizEvidence = json.createObjectNode().put("status", "PASSED")
                        .put("attemptId", pass.attemptId().toString()).put("quizVersion", pass.quizVersion())
                        .put("correctCount", pass.correctCount()).put("questionCount", pass.questionCount())
                        .put("passPercent", pass.passPercent()).put("submittedAt", pass.submittedAt().toString())
                        .put("referenceModelId", referenceModel.getId().toString())
                        .put("referenceSnapshotId", referenceSnapshot.getId().toString())
                        .put("artifactHash", referenceSnapshot.getArtifactHash()).put("commitSha", referenceSnapshot.getCommitSha());
            }
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
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STEP_4_SIGNED_RUNTIME_RECEIPT", "STEP_4_SIGNED_RUNTIME_RECEIPT");
            }
        }

        var studioEvidence = freezeStudioEvidence(runtimeSession, true);
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
        boolean studioMode = "THEORY_QUIZ_STUDIO".equalsIgnoreCase(assignment.getLabMode());
        ModelVersion referenceModel = assignment.getReferenceModel();
        if (studioMode && (referenceModel == null || referenceModel.getSourceSnapshot() == null)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Lab chưa có reference source đã phân tích");
        }
        SourceSnapshot sourceSnapshot = referenceModel != null ? referenceModel.getSourceSnapshot() : null;
        Project referenceProject = referenceModel != null ? referenceModel.getProject() : null;
        if (studioMode && referenceProject == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Reference source không thuộc project hợp lệ");
        }
        if (studioMode && assignment.getLabOrder() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Studio Lab phải được publish trước khi nộp");
        }

        boolean skipQuiz = com.mavis.common.security.CourseLabPolicy.canSkipQuiz(assignment)
                || courseLabs.isQuizNotRequired(assignment);
        JsonNode quizEvidence = null;
        if (!skipQuiz && assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && com.mavis.common.security.CourseLabPolicy.isStudent(submitter)) {
            var pass = courseLabs.currentQuizPass(assignment, currentUserId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN,
                            "Pass the current Lab Quiz before submitting"));
            var node = json.createObjectNode().put("status", "PASSED")
                    .put("attemptId", pass.attemptId().toString()).put("quizVersion", pass.quizVersion())
                    .put("correctCount", pass.correctCount()).put("questionCount", pass.questionCount())
                    .put("passPercent", pass.passPercent()).put("submittedAt", pass.submittedAt().toString());
            if (referenceModel != null) {
                node.put("referenceModelId", referenceModel.getId().toString());
            }
            if (sourceSnapshot != null) {
                node.put("referenceSnapshotId", sourceSnapshot.getId().toString())
                        .put("artifactHash", sourceSnapshot.getArtifactHash())
                        .put("commitSha", sourceSnapshot.getCommitSha());
            }
            quizEvidence = node;
        } else if (skipQuiz) {
            String labTier = studioMode
                    ? "THEORY_QUIZ_STUDIO"
                    : (com.mavis.common.security.CourseLabPolicy.canSkipQuiz(assignment) ? "THEORY_ONLY" : "THEORY_QUIZ");
            var node = json.createObjectNode().put("status", "NOT_REQUIRED")
                    .put("labTier", labTier);
            if (referenceModel != null) {
                node.put("referenceModelId", referenceModel.getId().toString());
            }
            if (sourceSnapshot != null) {
                node.put("referenceSnapshotId", sourceSnapshot.getId().toString());
            }
            quizEvidence = node;
        }

        JsonNode theoryEvidence = theoryEvidence(request.getTheoryAnswers());
        if (theoryEvidence.path("answers").isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ANSWER_REQUIRED");
        }

        RuntimeSession runtimeSession = null;
        JsonNode studioEvidence = null;
        if (studioMode) {
            if (request.getRuntimeSessionId() == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STUDIO_SESSION_REQUIRED", "STUDIO_SESSION_REQUIRED");
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
            UUID configuredRuntimeSnapshotId = parseUuidOrNull(
                    assignment.getStudioExerciseSnapshot() == null
                            ? null
                            : assignment.getStudioExerciseSnapshot().path("runtimeSnapshotId").asText(null));
            if (configuredRuntimeSnapshotId == null && labStudioExerciseRepository != null) {
                configuredRuntimeSnapshotId = labStudioExerciseRepository.findByAssignmentId(assignment.getId())
                        .map(LabStudioExercise::getRuntimeSnapshotId)
                        .orElse(null);
            }
            var configuredRuntimeSnapshot = configuredRuntimeSnapshotId == null
                    ? null
                    : sourceSnapshotRepository.findById(configuredRuntimeSnapshotId).orElse(null);
            boolean sameSource = sessionSource != null
                    && (sourceSnapshot.getId().equals(sessionSource.getId())
                        || (configuredRuntimeSnapshotId != null && configuredRuntimeSnapshotId.equals(sessionSource.getId()))
                        || (configuredRuntimeSnapshot != null
                            && configuredRuntimeSnapshot.getArtifactHash() != null
                            && configuredRuntimeSnapshot.getArtifactHash().equals(sessionSource.getArtifactHash()))
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
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STUDIO_EVIDENCE_REQUIRED", "STUDIO_EVIDENCE_REQUIRED");
            }
            studioEvidence = freezeStudioEvidence(runtimeSession, false);
            if (studioEvidence == null) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STUDIO_EVIDENCE_REQUIRED", "STUDIO_EVIDENCE_REQUIRED");
            }
            if (studioEvidence.path("snapshots").isEmpty()) {
                throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STUDIO_SNAPSHOT_REQUIRED", "STUDIO_SNAPSHOT_REQUIRED");
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
            Set<String> captureIds = new HashSet<>();
            for (JsonNode captured : studioEvidence.path("snapshots")) {
                String captureId = captured.path("id").asText("");
                String explanation = captured.path("explanation").asText("");
                if (captureId.isBlank() || !captureIds.add(captureId)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "STUDIO_SNAPSHOT_EVIDENCE_INVALID");
                }
                if (explanation.isBlank()) {
                    throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY,
                            "STUDIO_SNAPSHOT_EVIDENCE_INVALID", "STUDIO_SNAPSHOT_EVIDENCE_INVALID");
                }
                snapshots.add(StudentSnapshotItemDTO.builder()
                        .snapshotId("STUDIO_" + captureId)
                        .step("STEP_4_RUNTIME")
                        .title(captured.path("title").asText("Studio snapshot " + index))
                        .writtenExplanation(explanation)
                        .build());
                index++;
            }
        }
        JsonNode studentSnapshots = mapper.valueToTree(snapshots);
        String digest = evidenceDigestV2(assignment, sourceSnapshot, quizEvidence, theoryEvidence,
                studioEvidence, request.getSubmissionNotes());
        if (assignment.getWorkspace() != null && assignment.getWorkspace().isCourseMode()
                && com.mavis.common.security.CourseLabPolicy.isStudent(submitter)) {
            var latest = submissionSnapshotRepository
                    .findFirstByAssignmentIdAndSubmittedByIdOrderBySubmittedAtDescIdDesc(assignment.getId(), currentUserId);
            if (latest.isPresent()) {
                var previous = latest.get();
                if (digest.equals(previous.getEvidencePackageDigest())) {
                    return SubmissionResponseDTO.fromEntity(previous, 0L);
                }
                boolean needsRevision = submissionReviewRepository.findBySubmissionId(previous.getId())
                        .filter(review -> "RETURNED".equals(review.getStatus())
                                || "NEEDS_REVISION".equals(review.getLabOutcome())).isPresent();
                if (!needsRevision) {
                    throw new BusinessException(ErrorCode.CONFLICT, "LAB_SUBMISSION_AWAITING_REVIEW");
                }
            }
        }

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
            Set<String> sections = new HashSet<>();
            for (var answer : answers) {
                if (answer == null) continue;
                String text = answer.getAnswer() == null ? "" : answer.getAnswer().trim();
                if (text.isEmpty()) continue;
                if (sections.size() >= 5 || text.length() > 20000) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "THEORY_ANSWER_INVALID");
                }
                String section = answer.getSectionId() == null || answer.getSectionId().isBlank()
                        ? "THEORY" : answer.getSectionId().trim().toUpperCase(java.util.Locale.ROOT);
                if (!section.matches("[A-Z0-9_]{1,64}") || !sections.add(section)) {
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
                .append(source == null ? "" : source.getId()).append('|')
                .append(source == null ? "" : Objects.toString(source.getArtifactHash(), "")).append('|')
                .append(quiz == null ? "" : quiz.toString()).append('|')
                .append(theory.toString()).append('|')
                .append(studio == null ? "" : studio.path("receiptDigest").asText("") + "|" + studio.path("snapshots"))
                .append('|')
                .append(notes == null ? "" : notes.trim());
        return "sha256:" + com.mavis.common.utils.HashUtils.sha256Hex(
                canonical.toString().getBytes(StandardCharsets.UTF_8));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByWorkspace(UUID workspaceId, String reviewStatus, String labOutcome) {
        accessPolicyService.requireWorkspaceLecturer(workspaceId);
        Workspace workspace = workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Workspace not found"));

        List<Assignment> allAssignments = assignmentRepository.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId);
        boolean hasOrdered = workspace.isCourseMode() && allAssignments.stream().anyMatch(a -> a.getLabOrder() != null);
        List<UUID> activeAssignmentIds = allAssignments.stream()
                .filter(a -> !hasOrdered || a.getLabOrder() != null)
                .map(Assignment::getId)
                .toList();
        if (activeAssignmentIds.isEmpty()) {
            return List.of();
        }
        List<SubmissionResponseDTO> mapped;
        if (jdbc != null) {
            String placeholders = activeAssignmentIds.stream().map(id -> "?").collect(Collectors.joining(","));
            mapped = querySubmissionsLightweight("s.assignment_id IN (" + placeholders + ")",
                    new ArrayList<>(activeAssignmentIds), true);
        } else {
            List<SubmissionSnapshot> submissions =
                    submissionSnapshotRepository.findByAssignmentIdInOrderBySubmittedAtDesc(activeAssignmentIds);
            mapped = mapToResponseListWithFeedbackCount(submissions, true);
        }
        return filterAndSortLecturerSubmissions(mapped, reviewStatus, labOutcome);
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
        List<SubmissionResponseDTO> mapped = jdbc != null
                ? querySubmissionsLightweight("s.assignment_id = ?", List.of(assignmentId), true)
                : mapToResponseListWithFeedbackCount(
                        submissionSnapshotRepository.findByAssignmentIdOrderBySubmittedAtDesc(assignmentId), true);
        return filterAndSortLecturerSubmissions(mapped, reviewStatus, labOutcome);
    }

    private static List<SubmissionResponseDTO> filterAndSortLecturerSubmissions(
            List<SubmissionResponseDTO> mapped, String reviewStatus, String labOutcome) {
        Comparator<SubmissionResponseDTO> ordering = Comparator
                .comparing((SubmissionResponseDTO s) -> "PENDING".equalsIgnoreCase(s.getReviewStatus()) ? 0 : 1)
                .thenComparing(SubmissionResponseDTO::getSubmittedAt,
                        Comparator.nullsLast(Comparator.reverseOrder()));
        return mapped.stream()
                .filter(s -> reviewStatus == null || reviewStatus.isBlank()
                        || reviewStatus.trim().equalsIgnoreCase(s.getReviewStatus()))
                .filter(s -> labOutcome == null || labOutcome.isBlank()
                        || labOutcome.trim().equalsIgnoreCase(s.getLabOutcome()))
                .sorted(ordering)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<SubmissionResponseDTO> getSubmissionsByProject(UUID projectId) {
        log.debug("Lấy danh sách bài nộp theo projectId: {}", projectId);
        accessPolicyService.requireProjectReadAccess(projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Project not found")));
        User actor = accessPolicyService.requireCurrentActiveUser();
        boolean studentOnly = actor != null && actor.getRole() != null
                && "STUDENT".equalsIgnoreCase(actor.getRole().getCode());
        if (jdbc != null) {
            // Students may read shared TEACHER_REFERENCE projects, so scope project submission queries to their own rows.
            if (studentOnly && actor.getId() != null) {
                return querySubmissionsLightweight("s.project_id = ? AND s.submitted_by = ?",
                        List.of(projectId, actor.getId()), false);
            }
            return querySubmissionsLightweight("s.project_id = ?", List.of(projectId), !studentOnly);
        }
        List<SubmissionSnapshot> submissions = submissionSnapshotRepository.findByProjectIdOrderBySubmittedAtDesc(projectId);
        if (studentOnly && actor.getId() != null) {
            submissions = submissions.stream()
                    .filter(s -> s.getSubmittedBy() != null && actor.getId().equals(s.getSubmittedBy().getId()))
                    .toList();
        }
        return mapToResponseListWithFeedbackCount(submissions, !studentOnly);
    }

    private static UUID parseUuidOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    @Override
    @Transactional(readOnly = true)
    public SubmissionResponseDTO getSubmissionById(UUID submissionId) {
        log.debug("Lấy chi tiết bài nộp theo submissionId: {}", submissionId);
        if (jdbc != null) {
            User actor = accessPolicyService.requireCurrentActiveUser();
            boolean revealDraft = actor != null && actor.getRole() != null
                    && !"STUDENT".equalsIgnoreCase(actor.getRole().getCode());
            List<LightweightSubmissionRow> rows = executeLightweightSubmissionQuery(
                    "s.id = ?", List.of(submissionId), revealDraft);
            if (rows.isEmpty()) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId);
            }
            SubmissionResponseDTO dto = rows.get(0).dto();
            requireLightweightSubmissionReadAccess(dto, actor);
            enrichCourseQuizEvidenceIfMissing(dto);
            return dto;
        }
        SubmissionSnapshot submission = submissionSnapshotRepository.findWithDetailsById(submissionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId));

        requireSubmissionReadAccess(accessPolicyService, submission);
        long feedbackCount = feedbackCommentRepository.countBySubmissionId(submissionId);
        SubmissionReview review = submissionReviewRepository.findBySubmissionId(submissionId).orElse(null);
        User actor = accessPolicyService.requireCurrentActiveUser();
        boolean revealDraft = actor != null && actor.getRole() != null
                && !"STUDENT".equalsIgnoreCase(actor.getRole().getCode());
        SubmissionResponseDTO dto = SubmissionResponseDTO.fromEntity(submission, feedbackCount, review, revealDraft);
        enrichCourseQuizEvidenceIfMissing(dto);
        return dto;
    }

    private void enrichCourseQuizEvidenceIfMissing(SubmissionResponseDTO dto) {
        if (jdbc == null || dto == null || dto.getCourseQuizEvidence() != null
                || dto.getAssignmentId() == null || dto.getSubmittedById() == null) {
            return;
        }
        try {
            ObjectMapper mapper = this.json != null ? this.json : new ObjectMapper();
            List<JsonNode> attempts = jdbc.query("""
                    SELECT a.attempt_id, a.quiz_version, a.correct_count,
                           jsonb_array_length(q.questions) AS question_count,
                           q.pass_percent, a.passed, a.submitted_at
                    FROM course_quiz_attempts a
                    JOIN course_quizzes q ON q.assignment_id = a.assignment_id AND q.version = a.quiz_version
                    WHERE a.assignment_id = ? AND a.student_id = ?
                    ORDER BY a.passed DESC, a.correct_count DESC, a.submitted_at DESC, a.attempt_id DESC
                    LIMIT 1
                    """, (rs, rowNum) -> {
                var node = mapper.createObjectNode();
                boolean passed = rs.getBoolean("passed");
                node.put("status", passed ? "PASSED" : "FAILED");
                UUID attemptId = toUuid(rs.getObject("attempt_id"));
                if (attemptId != null) node.put("attemptId", attemptId.toString());
                Integer quizVersion = toInteger(rs.getObject("quiz_version"));
                if (quizVersion != null && quizVersion > 0) node.put("quizVersion", quizVersion);
                Integer correctCount = toInteger(rs.getObject("correct_count"));
                if (correctCount != null && correctCount >= 0) node.put("correctCount", correctCount);
                Integer questionCount = toInteger(rs.getObject("question_count"));
                if (questionCount != null && questionCount > 0) node.put("questionCount", questionCount);
                Integer passPercent = toInteger(rs.getObject("pass_percent"));
                if (passPercent != null && passPercent >= 1 && passPercent <= 100) {
                    node.put("passPercent", passPercent);
                }
                OffsetDateTime submittedAt = toOffsetDateTime(rs, "submitted_at");
                if (submittedAt != null) node.put("submittedAt", submittedAt.toString());
                return (JsonNode) node;
            }, dto.getAssignmentId(), dto.getSubmittedById());
            if (!attempts.isEmpty()) {
                dto.setCourseQuizEvidence(attempts.get(0));
                return;
            }
            List<JsonNode> quizzes = jdbc.query("""
                    SELECT jsonb_array_length(q.questions) AS question_count,
                           q.pass_percent, q.version
                    FROM course_quizzes q
                    WHERE q.assignment_id = ?
                    ORDER BY q.version DESC
                    LIMIT 1
                    """, (rs, rowNum) -> {
                var node = mapper.createObjectNode().put("status", "NOT_ATTEMPTED");
                Integer quizVersion = toInteger(rs.getObject("version"));
                if (quizVersion != null && quizVersion > 0) node.put("quizVersion", quizVersion);
                Integer questionCount = toInteger(rs.getObject("question_count"));
                if (questionCount != null && questionCount > 0) node.put("questionCount", questionCount);
                Integer passPercent = toInteger(rs.getObject("pass_percent"));
                if (passPercent != null && passPercent >= 1 && passPercent <= 100) {
                    node.put("passPercent", passPercent);
                }
                return (JsonNode) node;
            }, dto.getAssignmentId());
            if (!quizzes.isEmpty()) {
                dto.setCourseQuizEvidence(quizzes.get(0));
            } else {
                dto.setCourseQuizEvidence(mapper.createObjectNode().put("status", "NOT_REQUIRED"));
            }
        } catch (Exception ignored) {
            // Optional quiz lookup must never block submission retrieval when quiz tables are absent.
        }
    }

    private void requireLightweightSubmissionReadAccess(SubmissionResponseDTO dto, User actor) {
        boolean v2Lab = dto.getLabMode() != null && !"LEGACY".equalsIgnoreCase(dto.getLabMode());
        if (v2Lab) {
            UUID currentUserId = actor != null ? actor.getId() : SecurityUtils.getCurrentUserId();
            if (currentUserId != null && currentUserId.equals(dto.getSubmittedById())) {
                if (dto.getWorkspaceId() != null) {
                    accessPolicyService.requireWorkspaceMember(dto.getWorkspaceId());
                }
                return;
            }
            if (dto.getWorkspaceId() != null) {
                accessPolicyService.requireWorkspaceLecturer(dto.getWorkspaceId());
                return;
            }
        }
        Project project = dto.getProjectId() == null ? null : projectRepository.findById(dto.getProjectId()).orElse(null);
        accessPolicyService.requireProjectReadAccess(project);
    }

    @Override
    @Transactional(readOnly = true)
    public com.mavis.platform.submission.dto.SubmissionExportBundleDTO exportSubmissionBundle(UUID submissionId) {
        log.info("Xuất gói bài nộp bất biến: submissionId={}", submissionId);
        if (jdbc != null) {
            return exportSubmissionBundleLightweight(submissionId);
        }

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
            var tenScore = SubmissionReviewService.toTenScale(review.getScore());
            markdownReport += "\n## Lecturer review\n- Status: " + review.getStatus()
                    + "\n- Lecturer score (0-10): " + (tenScore != null ? tenScore + " / 10" : "N/A")
                    + " (equivalent " + review.getScore() + "/100)\n\n" + review.getSummary() + "\n";
        }

        User actor = accessPolicyService.requireCurrentActiveUser();
        boolean revealLecturerEvaluation = actor != null && actor.getRole() != null
                && !"STUDENT".equalsIgnoreCase(actor.getRole().getCode());
        var assignment = submission.getAssignment();
        var workspace = assignment != null ? assignment.getWorkspace() : null;

        return com.mavis.platform.submission.dto.SubmissionExportBundleDTO.builder()
                .studioEvidence(SubmissionResponseDTO.redactStudioEvidenceForRole(
                        submission.getStudioEvidence(), revealLecturerEvaluation))
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
                .studentSnapshots(SubmissionResponseDTO.redactStudioEvidenceForRole(
                        submission.getStudentSnapshots(), revealLecturerEvaluation))
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

    private com.fasterxml.jackson.databind.node.ObjectNode freezeStudioEvidence(
            RuntimeSession runtime, boolean requireSnapshots) {
        if (runtime == null || runtime.getScenarioConfig() == null
                || !runtime.getScenarioConfig().path("interactiveStudio").asBoolean()) return null;

        var control = runtime.getStudioControl();
        if (control == null
                || (requireSnapshots && (!control.path("snapshots").isArray() || control.path("snapshots").isEmpty()))
                || !runtime.hasVerifiedStudioEvidence()
                || control.path("receiptSignature").asText("").isBlank()) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STEP_4_SIGNED_RUNTIME_RECEIPT", "STEP_4_SIGNED_RUNTIME_RECEIPT");
        }
        var evidence = com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode()
                .put("sessionId", runtime.getId().toString()).put("receiptDigest", runtime.getReceiptDigest());
        evidence.set("snapshots", control.path("snapshots").isArray()
                ? control.path("snapshots").deepCopy()
                : com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode());
        if (control.path("actions").isArray()) {
            evidence.set("actions", control.path("actions").deepCopy());
        }
        if (control.hasNonNull("finalExerciseEvaluation") && control.get("finalExerciseEvaluation").isObject()) {
            evidence.set("finalExerciseEvaluation", control.get("finalExerciseEvaluation").deepCopy());
        }
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
                    throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "STEP_4_SIGNED_RUNTIME_RECEIPT", "STEP_4_SIGNED_RUNTIME_RECEIPT");
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
                if (explanation == null || explanation.isBlank()) {
                    throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED",
                            "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");
                }
                if (explanation.length() > 5000) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");
                }
                explanations.put(id, explanation.strip());
            }
        }
        if (required.stream().anyMatch(id -> !capturedById.containsKey(id) && !explanations.containsKey(id))) {
            throw new BusinessException(ErrorCode.UNPROCESSABLE_ENTITY, "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED",
                    "SUBMISSION_SNAPSHOT_EXPLANATIONS_REQUIRED");
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

    // Scalar + SQL-stripped studio_evidence summary avoids loading multi-MB PNG/OTel TOAST JSONB on submission list queries.
    private static final String SUBMISSION_LIST_SELECT = """
            SELECT s.id,
                   a.workspace_id,
                   w.name AS workspace_name,
                   COALESCE(w.course_mode, false) AS workspace_course_mode,
                   s.assignment_id,
                   a.title AS assignment_title,
                   a.lab_order,
                   a.lab_mode,
                   CASE WHEN a.ai_policy IS NOT NULL
                         AND jsonb_typeof(a.ai_policy->'archivedV1') = 'boolean'
                        THEN (a.ai_policy->>'archivedV1')::boolean
                        ELSE false END AS assignment_archived_v1,
                   s.project_id,
                   p.name AS project_name,
                   s.submitted_by,
                   u.full_name AS submitted_by_name,
                   u.email AS submitted_by_email,
                   s.source_snapshot_id,
                   s.model_version_id,
                   mv.revision AS model_revision,
                   s.diagram_version_id,
                   dv.notation AS diagram_notation,
                   s.evaluation_run_id,
                   CASE WHEN er.summary_metrics IS NOT NULL
                         AND jsonb_typeof(er.summary_metrics->'complianceScore') = 'number'
                        THEN (er.summary_metrics->>'complianceScore')::double precision
                        ELSE NULL END AS compliance_score,
                   s.runtime_session_id,
                   rs.scenario_status,
                   s.course_quiz_evidence::text AS course_quiz_evidence_json,
                   s.theory_evidence::text AS theory_evidence_json,
                   CASE WHEN s.studio_evidence IS NULL THEN NULL
                        WHEN jsonb_typeof(s.studio_evidence) <> 'object' THEN s.studio_evidence::text
                        WHEN jsonb_typeof(s.studio_evidence->'snapshots') = 'array' THEN
                          jsonb_set(
                            s.studio_evidence - 'receipt',
                            '{snapshots}',
                            COALESCE(
                              (SELECT jsonb_agg(
                                 CASE WHEN jsonb_typeof(snap) = 'object'
                                      THEN snap - 'telemetry' - 'actions' - 'imageData' - 'videoData'
                                      ELSE snap END
                               ) FROM jsonb_array_elements(s.studio_evidence->'snapshots') AS snap),
                              '[]'::jsonb
                            )
                          )::text
                        ELSE (s.studio_evidence - 'receipt')::text
                   END AS studio_evidence_summary_json,
                   s.student_snapshots::text AS student_snapshots_json,
                   s.submission_notes,
                   s.evidence_package_digest,
                   s.submitted_at,
                   (SELECT COUNT(*) FROM feedback_comments fc WHERE fc.submission_id = s.id) AS feedback_count,
                   sr.status AS review_status,
                   sr.score AS review_score,
                   sr.lab_outcome AS review_lab_outcome,
                   sr.summary AS review_summary,
                   grader.full_name AS graded_by_name,
                   sr.updated_at AS graded_at
            FROM submission_snapshots s
            JOIN assignments a ON a.id = s.assignment_id
            LEFT JOIN workspaces w ON w.id = a.workspace_id
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN users u ON u.id = s.submitted_by
            LEFT JOIN model_versions mv ON mv.id = s.model_version_id
            LEFT JOIN diagram_versions dv ON dv.id = s.diagram_version_id
            LEFT JOIN evaluation_runs er ON er.id = s.evaluation_run_id
            LEFT JOIN runtime_sessions rs ON rs.id = s.runtime_session_id
            LEFT JOIN submission_reviews sr ON sr.submission_id = s.id
            LEFT JOIN users grader ON grader.id = sr.lecturer_id
            """;

    private record LightweightSubmissionRow(
            SubmissionResponseDTO dto,
            boolean workspaceCourseMode,
            boolean assignmentArchivedV1) {}

    private List<SubmissionResponseDTO> queryMySubmissionsLightweight(
            UUID userId, boolean admin, UUID workspaceId, boolean revealDraft) {
        StringBuilder where = new StringBuilder();
        List<Object> params = new ArrayList<>();
        if (admin) {
            where.append("1 = 1");
        } else {
            where.append("(s.submitted_by = ? OR EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = a.workspace_id AND wm.user_id = ? AND wm.member_role = 'LECTURER'))");
            params.add(userId);
            params.add(userId);
        }
        if (workspaceId != null) {
            where.append(" AND a.workspace_id = ?");
            params.add(workspaceId);
        }
        List<LightweightSubmissionRow> rows = executeLightweightSubmissionQuery(where.toString(), params, revealDraft);
        if (rows.isEmpty()) {
            return Collections.emptyList();
        }
        Set<UUID> workspacesWithOrderedLabs = rows.stream()
                .filter(r -> r.dto().getLabOrder() != null && r.dto().getWorkspaceId() != null)
                .map(r -> r.dto().getWorkspaceId())
                .collect(Collectors.toSet());
        return rows.stream()
                .filter(r -> !isObsoleteDetachedLightweight(r, workspacesWithOrderedLabs))
                .map(LightweightSubmissionRow::dto)
                .toList();
    }

    private static boolean isObsoleteDetachedLightweight(
            LightweightSubmissionRow row, Set<UUID> workspacesWithOrderedLabs) {
        if (!row.workspaceCourseMode() || row.dto().getLabOrder() != null) {
            return false;
        }
        if (row.assignmentArchivedV1()) {
            return true;
        }
        UUID wsId = row.dto().getWorkspaceId();
        return wsId != null && workspacesWithOrderedLabs.contains(wsId);
    }

    private List<SubmissionResponseDTO> querySubmissionsLightweight(
            String whereClause, List<Object> params, boolean revealDraft) {
        return executeLightweightSubmissionQuery(whereClause, params, revealDraft).stream()
                .map(LightweightSubmissionRow::dto)
                .toList();
    }

    private List<LightweightSubmissionRow> executeLightweightSubmissionQuery(
            String whereClause, List<Object> params, boolean revealDraft) {
        String sql = SUBMISSION_LIST_SELECT + " WHERE " + whereClause + " ORDER BY s.submitted_at DESC";
        ObjectMapper mapper = this.json != null ? this.json : new ObjectMapper();
        return jdbc.query(sql, (rs, rowNum) -> {
            UUID id = toUuid(rs.getObject("id"));
            UUID wsId = toUuid(rs.getObject("workspace_id"));
            Integer labOrder = toInteger(rs.getObject("lab_order"));
            String labModeRaw = rs.getString("lab_mode");
            JsonNode courseQuizEvidence = parseJsonOrNull(mapper, rs.getString("course_quiz_evidence_json"));
            JsonNode theoryEvidence = parseJsonOrNull(mapper, rs.getString("theory_evidence_json"));
            JsonNode studioEvidence = SubmissionResponseDTO.redactStudioEvidenceForRole(
                    parseJsonOrNull(mapper, rs.getString("studio_evidence_summary_json")),
                    revealDraft);
            JsonNode studentSnapshots = SubmissionResponseDTO.redactStudioEvidenceForRole(
                    parseJsonOrNull(mapper, rs.getString("student_snapshots_json")),
                    revealDraft);

            boolean guidedLab = labOrder != null
                    || (courseQuizEvidence != null
                        && ("PASSED".equals(courseQuizEvidence.path("status").asText())
                            || "NOT_REQUIRED".equals(courseQuizEvidence.path("status").asText())));

            String rawReviewStatus = rs.getString("review_status");
            boolean visibleReview = rawReviewStatus != null
                    && (revealDraft || !"DRAFT".equalsIgnoreCase(rawReviewStatus));
            String reviewStatus = visibleReview ? rawReviewStatus : "PENDING";
            java.math.BigDecimal scoreBd = rs.getBigDecimal("review_score");
            Double reviewScore = visibleReview && scoreBd != null ? scoreBd.doubleValue() : null;
            Double reviewScoreTenScale = reviewScore != null
                    ? Math.round((reviewScore / 10.0) * 100.0) / 100.0
                    : null;
            String rawLabOutcome = rs.getString("review_lab_outcome");
            String labOutcome = "PENDING";
            if (visibleReview) {
                if (rawLabOutcome != null && !rawLabOutcome.isBlank()) {
                    labOutcome = rawLabOutcome;
                } else if ("RETURNED".equalsIgnoreCase(reviewStatus)) {
                    labOutcome = "NEEDS_REVISION";
                } else if ("GRADED".equalsIgnoreCase(reviewStatus) && reviewScore != null) {
                    labOutcome = reviewScore > 50.0 ? "PASSED" : "NEEDS_REVISION";
                }
            }

            Double complianceScore = toDouble(rs.getObject("compliance_score"));
            OffsetDateTime submittedAt = toOffsetDateTime(rs, "submitted_at");
            OffsetDateTime gradedAt = visibleReview ? toOffsetDateTime(rs, "graded_at") : null;

            SubmissionResponseDTO dto = SubmissionResponseDTO.builder()
                    .id(id)
                    .workspaceId(wsId)
                    .workspaceName(rs.getString("workspace_name"))
                    .assignmentId(toUuid(rs.getObject("assignment_id")))
                    .guidedLab(guidedLab)
                    .assignmentTitle(rs.getString("assignment_title"))
                    .labOrder(labOrder)
                    .projectId(toUuid(rs.getObject("project_id")))
                    .projectName(rs.getString("project_name"))
                    .submittedById(toUuid(rs.getObject("submitted_by")))
                    .submittedByName(rs.getString("submitted_by_name"))
                    .submittedByEmail(rs.getString("submitted_by_email"))
                    .labMode(labModeRaw != null ? labModeRaw : "LEGACY")
                    .sourceSnapshotId(toUuid(rs.getObject("source_snapshot_id")))
                    .modelVersionId(toUuid(rs.getObject("model_version_id")))
                    .modelRevision(toInteger(rs.getObject("model_revision")))
                    .diagramVersionId(toUuid(rs.getObject("diagram_version_id")))
                    .diagramNotation(rs.getString("diagram_notation"))
                    .evaluationRunId(toUuid(rs.getObject("evaluation_run_id")))
                    .complianceScore(complianceScore)
                    .runtimeSessionId(toUuid(rs.getObject("runtime_session_id")))
                    .courseQuizEvidence(courseQuizEvidence)
                    .theoryEvidence(theoryEvidence)
                    .studioEvidence(studioEvidence)
                    .studentSnapshots(studentSnapshots)
                    .scenarioStatus(rs.getString("scenario_status"))
                    .feedbackCount(rs.getLong("feedback_count"))
                    .submissionNotes(rs.getString("submission_notes"))
                    .evidencePackageDigest(rs.getString("evidence_package_digest"))
                    .submittedAt(submittedAt)
                    .reviewStatus(reviewStatus)
                    .reviewScore(reviewScore)
                    .reviewScoreTenScale(reviewScoreTenScale)
                    .labOutcome(labOutcome)
                    .reviewSummary(visibleReview ? rs.getString("review_summary") : null)
                    .gradedByName(visibleReview ? rs.getString("graded_by_name") : null)
                    .gradedAt(gradedAt)
                    .build();

            return new LightweightSubmissionRow(
                    dto,
                    rs.getBoolean("workspace_course_mode"),
                    rs.getBoolean("assignment_archived_v1"));
        }, params.toArray());
    }

    // Export projection skips heavy runtime_sessions.runner_receipt_json / studio_control & assignments.studio_topology_snapshot TOAST columns.
    private static final String SUBMISSION_EXPORT_SELECT = """
            SELECT s.id,
                   a.workspace_id,
                   w.name AS workspace_name,
                   s.assignment_id,
                   a.title AS assignment_title,
                   a.lab_order,
                   a.lab_mode,
                   s.project_id,
                   p.name AS project_name,
                   s.submitted_by,
                   u.full_name AS submitted_by_name,
                   u.email AS submitted_by_email,
                   s.source_snapshot_id,
                   ss.artifact_hash,
                   s.model_version_id,
                   mv.revision AS model_revision,
                   s.diagram_version_id,
                   dv.notation AS diagram_notation,
                   dv.level AS diagram_level,
                   dv.layout_json::text AS layout_json_text,
                   CASE WHEN er.summary_metrics IS NOT NULL
                         AND jsonb_typeof(er.summary_metrics->'complianceScore') = 'number'
                        THEN (er.summary_metrics->>'complianceScore')::double precision
                        ELSE NULL END AS compliance_score,
                   s.runtime_session_id,
                   rs.scenario_status,
                   rs.trace_quality,
                   s.course_quiz_evidence::text AS course_quiz_evidence_json,
                   s.theory_evidence::text AS theory_evidence_json,
                   s.studio_evidence::text AS studio_evidence_json,
                   s.student_snapshots::text AS student_snapshots_json,
                   s.submission_notes,
                   s.evidence_package_digest,
                   s.submitted_at,
                   sr.status AS review_status,
                   sr.score AS review_score,
                   sr.lab_outcome AS review_lab_outcome,
                   sr.summary AS review_summary,
                   sr.snapshot_grades::text AS snapshot_grades_json,
                   grader.full_name AS reviewer_name,
                   sr.updated_at AS reviewed_at
            FROM submission_snapshots s
            JOIN assignments a ON a.id = s.assignment_id
            LEFT JOIN workspaces w ON w.id = a.workspace_id
            LEFT JOIN projects p ON p.id = s.project_id
            LEFT JOIN users u ON u.id = s.submitted_by
            LEFT JOIN source_snapshots ss ON ss.id = s.source_snapshot_id
            LEFT JOIN model_versions mv ON mv.id = s.model_version_id
            LEFT JOIN diagram_versions dv ON dv.id = s.diagram_version_id
            LEFT JOIN evaluation_runs er ON er.id = s.evaluation_run_id
            LEFT JOIN runtime_sessions rs ON rs.id = s.runtime_session_id
            LEFT JOIN submission_reviews sr ON sr.submission_id = s.id
            LEFT JOIN users grader ON grader.id = sr.lecturer_id
            WHERE s.id = ?
            """;

    private com.mavis.platform.submission.dto.SubmissionExportBundleDTO exportSubmissionBundleLightweight(UUID submissionId) {
        ObjectMapper mapper = this.json != null ? this.json : new ObjectMapper();
        var rows = jdbc.query(SUBMISSION_EXPORT_SELECT, (rs, rowNum) -> {
            UUID wsId = toUuid(rs.getObject("workspace_id"));
            UUID assignmentId = toUuid(rs.getObject("assignment_id"));
            UUID projectId = toUuid(rs.getObject("project_id"));
            UUID submittedById = toUuid(rs.getObject("submitted_by"));
            String labModeRaw = rs.getString("lab_mode");
            String labMode = labModeRaw != null ? labModeRaw : "LEGACY";

            User actor = accessPolicyService.requireCurrentActiveUser();
            requireLightweightSubmissionReadAccess(
                    SubmissionResponseDTO.builder()
                            .id(submissionId)
                            .workspaceId(wsId)
                            .assignmentId(assignmentId)
                            .projectId(projectId)
                            .submittedById(submittedById)
                            .labMode(labMode)
                            .build(),
                    actor);

            List<com.mavis.platform.submission.dto.FeedbackResponseDTO> feedbacks = feedbackCommentRepository
                    .findBySubmissionIdOrderByCreatedAtAsc(submissionId).stream()
                    .map(com.mavis.platform.submission.dto.FeedbackResponseDTO::fromEntity)
                    .collect(Collectors.toList());

            Double complianceScore = toDouble(rs.getObject("compliance_score"));
            JsonNode layoutJson = parseJsonOrNull(mapper, rs.getString("layout_json_text"));
            String diagramNotation = rs.getString("diagram_notation");
            String diagramLevel = rs.getString("diagram_level");
            String mermaidDsl = layoutJson != null
                    ? com.mavis.common.utils.MermaidDslGenerator.generateFromLayoutJson(
                            diagramNotation, diagramLevel, layoutJson).getDsl()
                    : null;

            String reviewStatusRaw = rs.getString("review_status");
            boolean released = reviewStatusRaw != null && !"DRAFT".equals(reviewStatusRaw);
            java.math.BigDecimal reviewScore = released ? rs.getBigDecimal("review_score") : null;
            String reviewSummary = released ? Objects.toString(rs.getString("review_summary"), "") : "";
            String reviewerName = released ? rs.getString("reviewer_name") : null;
            OffsetDateTime reviewedAt = released ? toOffsetDateTime(rs, "reviewed_at") : null;
            JsonNode snapshotGrades = released ? parseJsonOrNull(mapper, rs.getString("snapshot_grades_json")) : null;
            String labOutcome = released ? rs.getString("review_lab_outcome") : null;

            String assignmentTitle = rs.getString("assignment_title");
            String projectName = rs.getString("project_name");
            String submittedByName = rs.getString("submitted_by_name");
            String submittedByEmail = rs.getString("submitted_by_email");
            UUID sourceSnapshotId = toUuid(rs.getObject("source_snapshot_id"));
            String artifactHash = rs.getString("artifact_hash");
            UUID modelVersionId = toUuid(rs.getObject("model_version_id"));
            Integer modelRevision = toInteger(rs.getObject("model_revision"));
            UUID diagramVersionId = toUuid(rs.getObject("diagram_version_id"));
            UUID runtimeSessionId = toUuid(rs.getObject("runtime_session_id"));
            String scenarioStatus = rs.getString("scenario_status");
            String traceQuality = rs.getString("trace_quality");
            String submissionNotes = rs.getString("submission_notes");
            String digest = rs.getString("evidence_package_digest");
            OffsetDateTime submittedAt = toOffsetDateTime(rs, "submitted_at");

            StringBuilder md = new StringBuilder();
            md.append("# BÁO CÁO TỔNG HỢP GÓI BÀI NỘP BẤT BIẾN (IMMUTABLE SUBMISSION BUNDLE)\n\n");
            md.append("## 1. Thông Tin Chung Bài Nộp\n");
            md.append("- **Mã bài nộp (Submission ID)**: `").append(submissionId).append("`\n");
            md.append("- **Đề bài (Assignment)**: ").append(assignmentTitle != null ? assignmentTitle : "N/A").append("\n");
            md.append("- **Đồ án (Project)**: ").append(projectName != null ? projectName : "N/A").append("\n");
            md.append("- **Sinh viên nộp bài**: ").append(submittedByName != null ? submittedByName : "N/A");
            if (submittedByEmail != null) md.append(" (").append(submittedByEmail).append(")");
            md.append("\n- **Thời gian nộp bài**: ").append(submittedAt).append("\n");
            if (submissionNotes != null && !submissionNotes.isBlank()) {
                md.append("- **Ghi chú của sinh viên**: ").append(submissionNotes).append("\n");
            }
            md.append("\n## 2. Phiên Bản Kiến Trúc & Tính Toàn Vẹn Bất Biến (Pinning)\n");
            md.append("- **Source Snapshot ID**: `").append(sourceSnapshotId != null ? sourceSnapshotId : "N/A").append("`\n");
            md.append("- **Mã băm mã nguồn (Artifact Hash)**: `").append(artifactHash != null ? artifactHash : "N/A").append("`\n");
            md.append("- **Model Version ID**: `").append(modelVersionId != null ? modelVersionId : "N/A").append("`\n");
            md.append("- **Phiên bản mô hình (Revision)**: ").append(modelRevision != null ? modelRevision : "N/A").append("\n");
            md.append("- **Diagram Version ID**: `").append(diagramVersionId != null ? diagramVersionId : "N/A").append("`\n\n");
            md.append("- **Evidence Package SHA-256**: `").append(digest).append("`\n\n");
            md.append("## 3. Đánh Giá Kiến Trúc & Thực Nghiệm Runtime\n");
            md.append("- **Điểm tuân thủ quy tắc kiến trúc (Compliance Score)**: ")
                    .append(complianceScore != null ? complianceScore + " / 100" : "Chưa chấm điểm / Không áp dụng").append("\n");
            md.append("- **Phiên thực nghiệm (Runtime Session)**: `").append(runtimeSessionId != null ? runtimeSessionId : "N/A").append("`\n");
            md.append("- **Trạng thái kịch bản (Scenario Status)**: ").append(scenarioStatus != null ? scenarioStatus : "N/A").append("\n");
            md.append("- **Chất lượng Trace (Trace Quality)**: ").append(traceQuality != null ? traceQuality : "N/A").append("\n\n");
            md.append("## 4. Sơ Đồ Kiến Trúc (Mermaid DSL)\n```mermaid\n")
                    .append(mermaidDsl != null ? mermaidDsl : "flowchart LR\n    emptyNode[\"Chưa có sơ đồ\"]")
                    .append("\n```\n\n## 5. Nhận Xét & Đánh Giá Của Giảng Viên (Feedbacks)\n");
            if (feedbacks.isEmpty()) {
                md.append("*Chưa có nhận xét nào từ giảng viên.*\n");
            } else {
                for (int i = 0; i < feedbacks.size(); i++) {
                    var fb = feedbacks.get(i);
                    md.append(i + 1).append(". **").append(fb.getLecturerName() != null ? fb.getLecturerName() : "Giảng viên").append("**");
                    if (fb.getCreatedAt() != null) md.append(" (").append(fb.getCreatedAt()).append(")");
                    md.append(":\n   - *Nội dung*: ").append(fb.getCommentText()).append("\n\n");
                }
            }
            if (released) {
                var tenScore = SubmissionReviewService.toTenScale(reviewScore);
                md.append("\n## Lecturer review\n- Status: ").append(reviewStatusRaw)
                        .append("\n- Lecturer score (0-10): ").append(tenScore != null ? tenScore + " / 10" : "N/A")
                        .append(" (equivalent ").append(reviewScore).append("/100)\n\n").append(reviewSummary).append("\n");
            }

            boolean revealLecturerEvaluation = actor != null && actor.getRole() != null
                    && !"STUDENT".equalsIgnoreCase(actor.getRole().getCode());
            return com.mavis.platform.submission.dto.SubmissionExportBundleDTO.builder()
                    .studioEvidence(SubmissionResponseDTO.redactStudioEvidenceForRole(
                            parseJsonOrNull(mapper, rs.getString("studio_evidence_json")),
                            revealLecturerEvaluation))
                    .submissionId(submissionId)
                    .workspaceId(wsId)
                    .workspaceName(rs.getString("workspace_name"))
                    .projectId(projectId)
                    .projectName(projectName)
                    .assignmentId(assignmentId)
                    .assignmentTitle(assignmentTitle)
                    .labOrder(toInteger(rs.getObject("lab_order")))
                    .labMode(labMode)
                    .submittedById(submittedById)
                    .submittedByName(submittedByName)
                    .sourceSnapshotId(sourceSnapshotId)
                    .artifactHash(artifactHash)
                    .evidencePackageDigest(digest)
                    .modelVersionId(modelVersionId)
                    .modelRevision(modelRevision)
                    .diagramVersionId(diagramVersionId)
                    .layoutJson(layoutJson)
                    .mermaidDsl(mermaidDsl)
                    .complianceScore(complianceScore)
                    .reviewStatus(released ? reviewStatusRaw : "PENDING")
                    .lecturerScore(reviewScore)
                    .reviewSummary(reviewSummary)
                    .reviewerName(reviewerName)
                    .reviewedAt(reviewedAt)
                    .runtimeSessionId(runtimeSessionId)
                    .courseQuizEvidence(parseJsonOrNull(mapper, rs.getString("course_quiz_evidence_json")))
                    .theoryEvidence(parseJsonOrNull(mapper, rs.getString("theory_evidence_json")))
                    .studentSnapshots(SubmissionResponseDTO.redactStudioEvidenceForRole(
                            parseJsonOrNull(mapper, rs.getString("student_snapshots_json")),
                            revealLecturerEvaluation))
                    .snapshotGrades(snapshotGrades)
                    .labOutcome(labOutcome)
                    .scenarioStatus(scenarioStatus)
                    .lecturerFeedbacks(feedbacks)
                    .markdownSummaryReport(md.toString())
                    .exportedAt(OffsetDateTime.now())
                    .build();
        }, submissionId);
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy bài nộp với ID: " + submissionId);
        }
        return rows.get(0);
    }

    static String lightweightSelectSql() {
        return SUBMISSION_LIST_SELECT;
    }

    static String lightweightExportSql() {
        return SUBMISSION_EXPORT_SELECT;
    }

    private static UUID toUuid(Object value) {
        if (value == null) return null;
        if (value instanceof UUID u) return u;
        return UUID.fromString(value.toString());
    }

    private static Integer toInteger(Object value) {
        return value instanceof Number n ? n.intValue() : null;
    }

    private static Double toDouble(Object value) {
        return value instanceof Number n ? n.doubleValue() : null;
    }

    private static OffsetDateTime toOffsetDateTime(java.sql.ResultSet rs, String col) throws java.sql.SQLException {
        Object raw = rs.getObject(col);
        if (raw == null) return null;
        if (raw instanceof OffsetDateTime odt) return odt;
        if (raw instanceof java.sql.Timestamp ts) return ts.toInstant().atOffset(java.time.ZoneOffset.UTC);
        return OffsetDateTime.parse(raw.toString());
    }

    private static JsonNode parseJsonOrNull(ObjectMapper mapper, String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return mapper.readTree(raw);
        } catch (Exception ex) {
            return null;
        }
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
