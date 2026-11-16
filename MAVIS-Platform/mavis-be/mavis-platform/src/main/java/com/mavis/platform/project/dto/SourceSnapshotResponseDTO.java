package com.mavis.platform.project.dto;

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
public class SourceSnapshotResponseDTO {
    private UUID id;
    private UUID projectId;
    private String projectName;
    private String sourceType;
    private String branchName;
    private String commitSha;
    private String artifactHash;
    private String storagePath;
    private Boolean isPublished;
    private String createdByName;
    private OffsetDateTime createdAt;
}
