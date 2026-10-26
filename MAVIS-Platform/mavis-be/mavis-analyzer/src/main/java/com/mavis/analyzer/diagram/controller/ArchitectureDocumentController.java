package com.mavis.analyzer.diagram.controller;
import com.mavis.analyzer.diagram.service.impl.ArchitectureDocumentService;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
@RestController @RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/models/{modelId}/documents")
public class ArchitectureDocumentController {
    private final ArchitectureDocumentService service;
    @GetMapping public ApiResponse<java.util.List<ArchitectureDocumentService.Revision>> list(@PathVariable UUID modelId) {
        return ApiResponse.success(service.revisions(modelId));
    }
    @PostMapping("/freeze") public ApiResponse<UUID> freezeArtifacts(@PathVariable UUID modelId, @RequestBody ArchitectureDocumentService.ArtifactSelection selection) {
        return ApiResponse.success(service.freezeArtifacts(modelId, selection));
    }
    @PostMapping("/{viewId}/revisions/{revision}/freeze") public ApiResponse<UUID> freeze(@PathVariable UUID modelId, @PathVariable String viewId, @PathVariable long revision) {
        return ApiResponse.success(service.freeze(modelId, viewId, revision));
    }
    @GetMapping("/{viewId}") public ApiResponse<ArchitectureDocumentService.Document> get(@PathVariable UUID modelId,@PathVariable String viewId,@RequestParam(required=false) Long revision) {
        return ApiResponse.success("Document loaded",service.get(modelId,viewId,revision));
    }
    @PostMapping("/{viewId}") public ApiResponse<ArchitectureDocumentService.Document> save(@PathVariable UUID modelId,@PathVariable String viewId,@RequestBody ArchitectureDocumentService.Save request) {
        return ApiResponse.success("Document saved",service.save(modelId,viewId,request));
    }
}
