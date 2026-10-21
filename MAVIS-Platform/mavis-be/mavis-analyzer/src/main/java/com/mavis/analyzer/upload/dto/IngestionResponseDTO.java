package com.mavis.analyzer.upload.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IngestionResponseDTO {
    private UUID projectId;
    private UUID snapshotId;
    private UUID jobId;
    private String sourceType;
    private String artifactHash;
    private String jobStatus;
    private String storagePath;

    public String getFilePath() {
        return storagePath;
    }
}
