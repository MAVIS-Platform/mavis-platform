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
public class ProjectResponseDTO {
    private UUID id;
    private UUID workspaceId;
    private String workspaceName;
    private UUID assignmentId;
    private String assignmentTitle;
    private UUID ownerId;
    private String ownerName;
    private String ownerEmail;
    private String name;
    private String description;
    private String repositoryUrl;
    private String defaultBranch;
    private String projectType;
    private Boolean isReferenceTemplate;
    private UUID referenceSnapshotId;
    private String status;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
