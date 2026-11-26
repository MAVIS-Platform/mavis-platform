package com.mavis.platform.submission.dto;

import com.mavis.common.entity.SubmissionReview;
import com.mavis.common.entity.SubmissionSnapshot;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Thông tin chi tiết gói bài nộp bất biến")
public class SubmissionResponseDTO {
    public static com.fasterxml.jackson.databind.JsonNode redactStudioEvidenceForRole(
            com.fasterxml.jackson.databind.JsonNode studioEvidence,
            boolean revealLecturerEvaluation) {
        if (revealLecturerEvaluation || studioEvidence == null || !studioEvidence.isObject()) {
            return studioEvidence;
        }
        var copy = (com.fasterxml.jackson.databind.node.ObjectNode) studioEvidence.deepCopy();
        copy.remove(java.util.List.of("exerciseEvaluation", "finalExerciseEvaluation"));
        var receipt = copy.get("receipt");
        if (receipt instanceof com.fasterxml.jackson.databind.node.ObjectNode receiptObj) {
            receiptObj.remove(java.util.List.of("exerciseEvaluation", "finalExerciseEvaluation"));
        }
        return copy;
    }

    private static com.fasterxml.jackson.databind.JsonNode studioSummary(SubmissionSnapshot submission) {
        if(submission.getStudioEvidence()==null)return null;
        var summary=(com.fasterxml.jackson.databind.node.ObjectNode)submission.getStudioEvidence().deepCopy();
        summary.remove("receipt");
        for(var snapshot:summary.path("snapshots"))
            if(snapshot instanceof com.fasterxml.jackson.databind.node.ObjectNode object)
                object.remove(java.util.List.of("telemetry","actions","imageData","videoData"));
        return summary;
    }

    private UUID id;
    private UUID workspaceId;
    private String workspaceName;
    private UUID assignmentId;
    private boolean guidedLab;
    private String assignmentTitle;
    private Integer labOrder;
    private UUID projectId;
    private String projectName;
    private UUID submittedById;
    private String submittedByName;
    private String submittedByEmail;
    private String labMode;
    private UUID sourceSnapshotId;
    private UUID modelVersionId;
    private Integer modelRevision;
    private UUID diagramVersionId;
    private String diagramNotation;
    private UUID evaluationRunId;
    private Double complianceScore;
    private UUID runtimeSessionId;
    private com.fasterxml.jackson.databind.JsonNode courseQuizEvidence;
    private com.fasterxml.jackson.databind.JsonNode theoryEvidence;
    private com.fasterxml.jackson.databind.JsonNode studioEvidence;
    private com.fasterxml.jackson.databind.JsonNode studentSnapshots;
    private String scenarioStatus;
    private Long feedbackCount;
    private String submissionNotes;
    private String evidencePackageDigest;
    private OffsetDateTime submittedAt;
    private String reviewStatus;
    private Double reviewScore;
    private Double reviewScoreTenScale;
    private String labOutcome;
    private String reviewSummary;
    private String gradedByName;
    private OffsetDateTime gradedAt;

    public static SubmissionResponseDTO fromEntity(SubmissionSnapshot s, Long feedbackCount) {
        return fromEntity(s, feedbackCount, null, false);
    }

    public static SubmissionResponseDTO fromEntity(
            SubmissionSnapshot s,
            Long feedbackCount,
            SubmissionReview review,
            boolean revealDraft) {
        if (s == null) return null;

        Double complianceScore = null;
        if (s.getEvaluationRun() != null && s.getEvaluationRun().getSummaryMetrics() != null) {
            var metrics = s.getEvaluationRun().getSummaryMetrics();
            if (metrics.has("complianceScore") && !metrics.get("complianceScore").isNull()) {
                complianceScore = metrics.get("complianceScore").asDouble();
            }
        }

        String scenarioStatus = s.getRuntimeSession() != null ? s.getRuntimeSession().getScenarioStatus() : null;

        var assignment = s.getAssignment();
        var workspace = assignment != null ? assignment.getWorkspace() : null;

        boolean visibleReview = review != null && (revealDraft || !"DRAFT".equalsIgnoreCase(review.getStatus()));
        String reviewStatus = visibleReview && review.getStatus() != null ? review.getStatus() : "PENDING";
        Double reviewScore = visibleReview && review.getScore() != null ? review.getScore().doubleValue() : null;
        Double reviewScoreTenScale = reviewScore != null
                ? Math.round((reviewScore / 10.0) * 100.0) / 100.0
                : null;
        String labOutcome = "PENDING";
        if (visibleReview) {
            if (review.getLabOutcome() != null && !review.getLabOutcome().isBlank()) {
                labOutcome = review.getLabOutcome();
            } else if ("RETURNED".equalsIgnoreCase(reviewStatus)) {
                labOutcome = "NEEDS_REVISION";
            } else if ("GRADED".equalsIgnoreCase(reviewStatus) && reviewScore != null) {
                labOutcome = reviewScore > 50.0 ? "PASSED" : "NEEDS_REVISION";
            }
        }
        String reviewSummary = visibleReview ? review.getSummary() : null;
        String gradedByName = visibleReview && review.getLecturer() != null ? review.getLecturer().getFullName() : null;
        OffsetDateTime gradedAt = visibleReview ? review.getUpdatedAt() : null;

        return SubmissionResponseDTO.builder()
                .id(s.getId())
                .workspaceId(workspace != null ? workspace.getId() : null)
                .workspaceName(workspace != null ? workspace.getName() : null)
                .assignmentId(assignment != null ? assignment.getId() : null)
                .guidedLab(s.isGuidedLab())
                .assignmentTitle(assignment != null ? assignment.getTitle() : null)
                .labOrder(assignment != null ? assignment.getLabOrder() : null)
                .projectId(s.getProject() != null ? s.getProject().getId() : null)
                .projectName(s.getProject() != null ? s.getProject().getName() : null)
                .submittedById(s.getSubmittedBy() != null ? s.getSubmittedBy().getId() : null)
                .submittedByName(s.getSubmittedBy() != null ? s.getSubmittedBy().getFullName() : null)
                .submittedByEmail(s.getSubmittedBy() != null ? s.getSubmittedBy().getEmail() : null)
                .labMode(assignment != null && assignment.getLabMode() != null ? assignment.getLabMode() : "LEGACY")
                .sourceSnapshotId(s.getSourceSnapshot() != null ? s.getSourceSnapshot().getId() : null)
                .modelVersionId(s.getModelVersion() != null ? s.getModelVersion().getId() : null)
                .modelRevision(s.getModelVersion() != null ? s.getModelVersion().getRevision() : null)
                .diagramVersionId(s.getDiagramVersion() != null ? s.getDiagramVersion().getId() : null)
                .diagramNotation(s.getDiagramVersion() != null ? s.getDiagramVersion().getNotation() : null)
                .evaluationRunId(s.getEvaluationRun() != null ? s.getEvaluationRun().getId() : null)
                .complianceScore(complianceScore)
                .runtimeSessionId(s.getRuntimeSession() != null ? s.getRuntimeSession().getId() : null)
                .courseQuizEvidence(s.getCourseQuizEvidence())
                .theoryEvidence(s.getTheoryEvidence())
                .studioEvidence(redactStudioEvidenceForRole(studioSummary(s), revealDraft))
                .studentSnapshots(s.getStudentSnapshots())
                .scenarioStatus(scenarioStatus)
                .feedbackCount(feedbackCount != null ? feedbackCount : 0L)
                .submissionNotes(s.getSubmissionNotes())
                .evidencePackageDigest(s.getEvidencePackageDigest())
                .submittedAt(s.getSubmittedAt())
                .reviewStatus(reviewStatus)
                .reviewScore(reviewScore)
                .reviewScoreTenScale(reviewScoreTenScale)
                .labOutcome(labOutcome)
                .reviewSummary(reviewSummary)
                .gradedByName(gradedByName)
                .gradedAt(gradedAt)
                .build();
    }
}
