package com.mavis.platform.project.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProjectCreateRequest {
    private String name;
    private String description;
    private UUID workspaceId;
    private UUID assignmentId;
    private String repositoryUrl;
    private String defaultBranch;
    private String projectType;
}
