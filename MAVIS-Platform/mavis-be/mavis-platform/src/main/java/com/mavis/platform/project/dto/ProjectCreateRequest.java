package com.mavis.platform.project.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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

    @NotBlank(message = "Tên dự án không được để trống")
    @Size(max = 255, message = "Tên dự án không được vượt quá 255 ký tự")
    private String name;

    private String description;

    private UUID workspaceId;

    private UUID assignmentId;

    private String projectType;

    private String repositoryUrl;

    private String defaultBranch;

    private Boolean isReferenceTemplate;

    private UUID referenceSnapshotId;
}
