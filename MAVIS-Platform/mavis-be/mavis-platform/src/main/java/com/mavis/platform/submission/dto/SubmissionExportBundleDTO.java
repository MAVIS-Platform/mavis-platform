package com.mavis.platform.submission.dto;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Gói xuất bài nộp bất biến (Immutable Submission Export Bundle - Ticket V11 & T15)")
public class SubmissionExportBundleDTO {
    private JsonNode studioEvidence;
    private com.fasterxml.jackson.databind.JsonNode courseQuizEvidence;

    private UUID submissionId;
    private UUID projectId;
    private String projectName;
    private UUID assignmentId;
    private String assignmentTitle;
    private UUID submittedById;
    private String submittedByName;
    private UUID sourceSnapshotId;
    private String artifactHash;
    private UUID modelVersionId;
    private Integer modelRevision;
    private UUID diagramVersionId;
    private JsonNode layoutJson;
    private String mermaidDsl;
    private Double complianceScore;
    private String reviewStatus;
    private java.math.BigDecimal lecturerScore;
    private String reviewSummary;
    private String reviewerName;
    private OffsetDateTime reviewedAt;
    private UUID runtimeSessionId;
    private String scenarioStatus;

    @Builder.Default
    private List<FeedbackResponseDTO> lecturerFeedbacks = new ArrayList<>();

    private String markdownSummaryReport;
    private OffsetDateTime exportedAt;
}
