package com.mavis.analyzer.model.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.*;

@RestController
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BrowserReadController {
    private final ProjectRepository projects;
    private final SourceSnapshotRepository snapshots;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final AccessPolicyService accessPolicy;
    public record SnapshotView(UUID id, UUID projectId, String sourceType, String branchName, String commitSha,
                               String artifactHash, Boolean published, OffsetDateTime createdAt) {}
    public record ElementView(UUID id, UUID modelVersionId, String name, String elementType, String languageStack,
                              String scope, String status, UUID parentElementId, JsonNode properties) {}
    @GetMapping("/api/v1/projects/{projectId}/snapshots")
    public ApiResponse<List<SnapshotView>> snapshots(@PathVariable UUID projectId) {
        var project = projects.findById(projectId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(project);
        var result = snapshots.findByProjectId(projectId).stream()
                .sorted(Comparator.comparing(SourceSnapshot::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::snapshotView).toList();
        return ApiResponse.success(result);
    }
    @GetMapping("/api/v1/analyzer/snapshots/{snapshotId}")
    public ApiResponse<SnapshotView> snapshot(@PathVariable UUID snapshotId) {
        var value = snapshots.findById(snapshotId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(value.getProject());
        return ApiResponse.success(snapshotView(value));
    }
    @GetMapping("/api/v1/analyzer/models/{modelVersionId}/elements")
    public ApiResponse<List<ElementView>> elements(@PathVariable UUID modelVersionId) {
        var model = models.findById(modelVersionId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(model.getProject());
        return ApiResponse.success(elements.findByModelVersionId(modelVersionId).stream().map(this::elementView).toList());
    }
    @GetMapping("/api/v1/analyzer/models/{modelVersionId}/elements/{elementId}")
    public ApiResponse<ElementView> element(@PathVariable UUID modelVersionId, @PathVariable UUID elementId) {
        var model = models.findById(modelVersionId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(model.getProject());
        var element = elements.findById(elementId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!element.getModelVersion().getId().equals(modelVersionId)) throw new BusinessException(ErrorCode.NOT_FOUND);
        return ApiResponse.success(elementView(element));
    }
    private SnapshotView snapshotView(SourceSnapshot v) {
        return new SnapshotView(v.getId(), v.getProject().getId(), v.getSourceType(), v.getBranchName(),
                v.getCommitSha(), v.getArtifactHash(), v.getIsPublished(), v.getCreatedAt());
    }
    private ElementView elementView(ModelElement v) {
        return new ElementView(v.getId(), v.getModelVersion().getId(), v.getName(), v.getElementType(),
                v.getLanguageStack(), v.getScope(), v.getStatus(), v.getParentElement() == null ? null : v.getParentElement().getId(), v.getProperties());
    }
}
