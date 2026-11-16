package com.mavis.analyzer.orchestrator.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobResponseDTO {
    /** Explicit UI state: a retained partial result must not appear as complete analysis. */
    public String getAnalysisState() {
        if (!"COMPLETED".equals(status)) return status;
        if (resultManifest == null || resultManifest.path("completeness").asText().isEmpty()) return "COMPLETED_LEGACY";
        if ("PARTIAL".equals(resultManifest.path("completeness").asText())) return "PARTIAL";
        return "REQUIRES_REVIEW".equals(resultManifest.path("canonicalMapping").asText()) ? "COMPLETED_WITH_REVIEW" : "COMPLETED";
    }
    public String getModelVersionId() { return resultManifest == null ? null : resultManifest.path("modelVersionId").asText(null); }
    public boolean isPromotedLatest() { return resultManifest != null && resultManifest.path("promotedLatest").asBoolean(false); }
    public String getDotnetStatus() { return resultManifest == null ? null : resultManifest.path("dotnetAdapter").path("status").asText(null); }
    private UUID jobId;
    private UUID projectId;
    private UUID sourceSnapshotId;
    private String jobType;
    private String status;
    private JsonNode resultManifest;
    private String errorDiagnostics;
    private OffsetDateTime startedAt;
    private OffsetDateTime completedAt;
}
