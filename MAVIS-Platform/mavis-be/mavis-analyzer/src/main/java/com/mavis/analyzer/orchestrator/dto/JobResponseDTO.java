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
