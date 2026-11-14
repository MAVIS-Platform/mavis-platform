package com.mavis.platform.submission.dto;

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
    private static com.fasterxml.jackson.databind.JsonNode studioSummary(SubmissionSnapshot submission) {
        if(submission.getStudioEvidence()==null)return null;
        var summary=(com.fasterxml.jackson.databind.node.ObjectNode)submission.getStudioEvidence().deepCopy();
        summary.remove("receipt");
        for(var snapshot:summary.path("snapshots"))
            if(snapshot instanceof com.fasterxml.jackson.databind.node.ObjectNode object)
                object.remove(java.util.List.of("telemetry","actions","imageData"));
        return summary;
    }

    private UUID id;
    private UUID assignmentId;
    private String assignmentTitle;
    private UUID projectId;
    private String projectName;
    private UUID submittedById;
    private String submittedByName;
    private String submittedByEmail;
    private UUID sourceSnapshotId;
    private UUID modelVersionId;
    private Integer modelRevision;
    private UUID diagramVersionId;
    private String diagramNotation;
    private UUID evaluationRunId;
    private Double complianceScore;
    private UUID runtimeSessionId;
    private com.fasterxml.jackson.databind.JsonNode courseQuizEvidence;
    private com.fasterxml.jackson.databind.JsonNode studioEvidence;
    private com.fasterxml.jackson.databind.JsonNode studentSnapshots;
    private String scenarioStatus;
    private Long feedbackCount;
    private String submissionNotes;
    private String evidencePackageDigest;
    private OffsetDateTime submittedAt;

    public static SubmissionResponseDTO fromEntity(SubmissionSnapshot s, Long feedbackCount) {
        if (s == null) return null;

        Double complianceScore = null;
        if (s.getEvaluationRun() != null && s.getEvaluationRun().getSummaryMetrics() != null) {
            var metrics = s.getEvaluationRun().getSummaryMetrics();
            if (metrics.has("complianceScore") && !metrics.get("complianceScore").isNull()) {
                complianceScore = metrics.get("complianceScore").asDouble();
            }
        }

        String scenarioStatus = s.getRuntimeSession() != null ? s.getRuntimeSession().getScenarioStatus() : null;

        return SubmissionResponseDTO.builder()
                .id(s.getId())
                .assignmentId(s.getAssignment() != null ? s.getAssignment().getId() : null)
                .assignmentTitle(s.getAssignment() != null ? s.getAssignment().getTitle() : null)
                .projectId(s.getProject() != null ? s.getProject().getId() : null)
                .projectName(s.getProject() != null ? s.getProject().getName() : null)
                .submittedById(s.getSubmittedBy() != null ? s.getSubmittedBy().getId() : null)
                .submittedByName(s.getSubmittedBy() != null ? s.getSubmittedBy().getFullName() : null)
                .submittedByEmail(s.getSubmittedBy() != null ? s.getSubmittedBy().getEmail() : null)
                .sourceSnapshotId(s.getSourceSnapshot() != null ? s.getSourceSnapshot().getId() : null)
                .modelVersionId(s.getModelVersion() != null ? s.getModelVersion().getId() : null)
                .modelRevision(s.getModelVersion() != null ? s.getModelVersion().getRevision() : null)
                .diagramVersionId(s.getDiagramVersion() != null ? s.getDiagramVersion().getId() : null)
                .diagramNotation(s.getDiagramVersion() != null ? s.getDiagramVersion().getNotation() : null)
                .evaluationRunId(s.getEvaluationRun() != null ? s.getEvaluationRun().getId() : null)
                .complianceScore(complianceScore)
                .runtimeSessionId(s.getRuntimeSession() != null ? s.getRuntimeSession().getId() : null)
                .courseQuizEvidence(s.getCourseQuizEvidence())
                .studioEvidence(studioSummary(s))
                .studentSnapshots(s.getStudentSnapshots())
                .scenarioStatus(scenarioStatus)
                .feedbackCount(feedbackCount != null ? feedbackCount : 0L)
                .submissionNotes(s.getSubmissionNotes())
                .evidencePackageDigest(s.getEvidencePackageDigest())
                .submittedAt(s.getSubmittedAt())
                .build();
    }
}
