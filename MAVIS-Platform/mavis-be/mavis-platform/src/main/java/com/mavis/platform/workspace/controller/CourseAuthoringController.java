package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.CourseAuthoringService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/course")
@RequiredArgsConstructor
public class CourseAuthoringController {
    private final CourseAuthoringService authoring;

    public record CourseBody(@NotBlank @Size(max = 255) String title, String description) {}
    public record ModuleBody(@NotBlank @Size(max = 255) String title, String description, UUID prerequisiteModuleId) {}
    public record ItemBody(@NotBlank String type, @NotBlank @Size(max = 255) String title, String description,
                           UUID assignmentId, com.fasterxml.jackson.databind.JsonNode content, Boolean required) {}

    @GetMapping
    public ApiResponse<CourseAuthoringService.CourseView> get(@PathVariable UUID workspaceId) {
        return ApiResponse.success(authoring.get(workspaceId));
    }

    @GetMapping("/published")
    public ApiResponse<CourseAuthoringService.PublishedView> published(@PathVariable UUID workspaceId) {
        return ApiResponse.success(authoring.publishedForLearner(workspaceId));
    }

    @PostMapping("/draft")
    public ApiResponse<CourseAuthoringService.CourseView> startDraft(@PathVariable UUID workspaceId) {
        return ApiResponse.success(authoring.startDraft(workspaceId));
    }

    @PutMapping("/draft")
    public ApiResponse<CourseAuthoringService.CourseView> saveDraft(
            @PathVariable UUID workspaceId, @Valid @RequestBody CourseBody body) {
        return ApiResponse.success(authoring.saveDraft(workspaceId,
                new CourseAuthoringService.CourseRequest(body.title(), body.description())));
    }

    @PostMapping("/publish")
    public ApiResponse<CourseAuthoringService.PublishedView> publish(@PathVariable UUID workspaceId) {
        return ApiResponse.success(authoring.publish(workspaceId));
    }

    @GetMapping("/versions")
    public ApiResponse<java.util.List<CourseAuthoringService.PublishedView>> versions(@PathVariable UUID workspaceId) {
        return ApiResponse.success(authoring.versions(workspaceId));
    }

    @GetMapping("/versions/{version}")
    public ApiResponse<CourseAuthoringService.PublishedView> version(
            @PathVariable UUID workspaceId, @PathVariable int version) {
        return ApiResponse.success(authoring.version(workspaceId, version));
    }

    @PostMapping("/modules")
    public ApiResponse<CourseAuthoringService.CourseView> addModule(
            @PathVariable UUID workspaceId, @Valid @RequestBody ModuleBody body) {
        return ApiResponse.success(authoring.addModule(workspaceId,
                new CourseAuthoringService.ModuleRequest(body.title(), body.description(), body.prerequisiteModuleId())));
    }

    @PostMapping("/modules/{moduleId}/items")
    public ApiResponse<CourseAuthoringService.CourseView> addItem(
            @PathVariable UUID workspaceId, @PathVariable UUID moduleId, @Valid @RequestBody ItemBody body) {
        return ApiResponse.success(authoring.addItem(workspaceId, moduleId,
                new CourseAuthoringService.ItemRequest(body.type(), body.title(), body.description(),
                        body.assignmentId(), body.content(), body.required())));
    }
}
