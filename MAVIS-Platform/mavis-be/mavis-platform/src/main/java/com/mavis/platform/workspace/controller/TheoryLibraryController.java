package com.mavis.platform.workspace.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.platform.workspace.service.TheoryImportService;
import com.mavis.platform.workspace.service.TheoryLibraryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class TheoryLibraryController {

    private final TheoryLibraryService library;
    private final TheoryImportService importer;

    public record AttachRequest(UUID assetId) {}

    public record ImportUrlRequest(String url, Boolean aiFormat, String language) {}

    @GetMapping("/api/v1/workspaces/{workspaceId}/theory-assets")
    public ApiResponse<List<TheoryLibraryService.AssetView>> list(@PathVariable UUID workspaceId) {
        return ApiResponse.success(library.list(workspaceId));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/theory-assets")
    public ApiResponse<TheoryLibraryService.AssetView> create(
            @PathVariable UUID workspaceId, @RequestBody TheoryLibraryService.Upsert request) {
        return ApiResponse.success(library.create(workspaceId, request));
    }

    @PutMapping("/api/v1/workspaces/{workspaceId}/theory-assets/{assetId}")
    public ApiResponse<TheoryLibraryService.AssetView> update(
            @PathVariable UUID workspaceId, @PathVariable UUID assetId,
            @RequestBody TheoryLibraryService.Upsert request) {
        return ApiResponse.success(library.update(workspaceId, assetId, request));
    }

    @DeleteMapping("/api/v1/workspaces/{workspaceId}/theory-assets/{assetId}")
    public ApiResponse<Void> delete(@PathVariable UUID workspaceId, @PathVariable UUID assetId) {
        library.delete(workspaceId, assetId);
        return ApiResponse.success(null);
    }

    @GetMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/theory-assets")
    public ApiResponse<List<TheoryLibraryService.Attached>> attached(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId) {
        return ApiResponse.success(library.attached(workspaceId, assignmentId));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/theory-assets")
    public ApiResponse<TheoryLibraryService.Attached> attach(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestBody AttachRequest request) {
        return ApiResponse.success(library.attach(workspaceId, assignmentId, request.assetId()));
    }

    @DeleteMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/theory-assets/{assetId}")
    public ApiResponse<Void> detach(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @PathVariable UUID assetId) {
        library.detach(workspaceId, assignmentId, assetId);
        return ApiResponse.success(null);
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/course-labs/{assignmentId}/theory-assets/generate")
    public ApiResponse<TheoryLibraryService.Draft> generate(
            @PathVariable UUID workspaceId, @PathVariable UUID assignmentId,
            @RequestBody(required = false) TheoryLibraryService.GenerateRequest request) {
        return ApiResponse.success(library.generateDraft(workspaceId, assignmentId, request));
    }

    @PostMapping(
            value = "/api/v1/workspaces/{workspaceId}/theory-assets/import-file",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<TheoryImportService.ImportResult> importFile(
            @PathVariable UUID workspaceId,
            @RequestPart("file") MultipartFile file,
            @RequestParam(required = false) Integer pageFrom,
            @RequestParam(required = false) Integer pageTo,
            @RequestParam(defaultValue = "true") boolean aiFormat,
            @RequestParam(defaultValue = "vi") String language) {
        return ApiResponse.success(importer.importFile(workspaceId, file, pageFrom, pageTo, aiFormat, language));
    }

    @PostMapping("/api/v1/workspaces/{workspaceId}/theory-assets/import-url")
    public ApiResponse<TheoryImportService.ImportResult> importUrl(
            @PathVariable UUID workspaceId,
            @RequestBody ImportUrlRequest request) {
        return ApiResponse.success(importer.importUrl(
                workspaceId,
                request.url(),
                request.aiFormat() == null || request.aiFormat(),
                request.language()));
    }
}
