package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseQuizAssetService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/quiz-assets")
@RequiredArgsConstructor
public class CourseQuizAssetController {
    private final CourseQuizAssetService assets;
    private final com.mavis.platform.workspace.service.CourseQuizGenerationService generation;

    @GetMapping
    public ApiResponse<List<CourseQuizAssetService.View>> list(@PathVariable UUID workspaceId) {
        return ApiResponse.success(assets.list(workspaceId));
    }

    @GetMapping("/catalog")
    public ApiResponse<CourseQuizAssetService.CatalogView> catalog(@PathVariable UUID workspaceId) {
        return ApiResponse.success(assets.catalog(workspaceId));
    }

    @PostMapping
    public ApiResponse<CourseQuizAssetService.View> create(@PathVariable UUID workspaceId,
                                                            @RequestBody CourseQuizAssetService.Upsert request) {
        return ApiResponse.success(assets.create(workspaceId, request));
    }

    @PostMapping("/generate")
    public ApiResponse<com.mavis.platform.workspace.service.CourseQuizGenerationService.Generated> generate(
            @PathVariable UUID workspaceId,
            @RequestBody(required = false) com.mavis.platform.workspace.service.CourseQuizGenerationService.Request request) {
        return ApiResponse.success(generation.generate(workspaceId, request));
    }

    @PutMapping("/{assetId}")
    public ApiResponse<CourseQuizAssetService.View> update(@PathVariable UUID workspaceId,
                                                            @PathVariable UUID assetId,
                                                            @RequestBody CourseQuizAssetService.Upsert request) {
        return ApiResponse.success(assets.update(workspaceId, assetId, request));
    }

    @DeleteMapping("/{assetId}")
    public ApiResponse<Void> delete(@PathVariable UUID workspaceId, @PathVariable UUID assetId) {
        assets.delete(workspaceId, assetId);
        return ApiResponse.success(null);
    }
}
