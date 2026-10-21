package com.mavis.analyzer.upload.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GitHubImportRequest {

    @NotNull(message = "Project ID không được để trống")
    private UUID projectId;

    @NotBlank(message = "Repository URL không được để trống")
    private String repositoryUrl;

    @Builder.Default
    private String branchName = "main";

    private String commitSha;
}
