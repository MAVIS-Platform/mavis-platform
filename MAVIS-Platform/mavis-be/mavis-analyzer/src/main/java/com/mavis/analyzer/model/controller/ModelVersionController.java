package com.mavis.analyzer.model.controller;

import com.mavis.analyzer.model.dto.ModelDiffResponseDTO;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.model.service.ModelVersionService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Model Version & Controlled Revision", description = "APIs for ModelVersion querying, controlled revisions, and O(N) model diffing")
public class ModelVersionController {

    private final ModelVersionService modelVersionService;

    @GetMapping("/projects/{projectId}/models")
    @Operation(summary = "Lấy danh sách các ModelVersion của một dự án",
            description = "Trả về danh sách ModelVersionResponseDTO sắp xếp theo revision DESC (BR-37, FE-06)")
    public ApiResponse<List<ModelVersionResponseDTO>> getModelVersionsByProject(@PathVariable UUID projectId) {
        List<ModelVersionResponseDTO> models = modelVersionService.getModelVersionsByProject(projectId);
        return ApiResponse.success("Lấy danh sách phiên bản mô hình thành công", models);
    }

    @GetMapping("/models/{modelVersionId}")
    @Operation(summary = "Lấy thông tin chi tiết một ModelVersion",
            description = "Trả về thông tin ModelVersionResponseDTO theo ID")
    public ApiResponse<ModelVersionResponseDTO> getModelVersionById(@PathVariable UUID modelVersionId) {
        ModelVersionResponseDTO model = modelVersionService.getModelVersionById(modelVersionId);
        return ApiResponse.success("Lấy thông tin phiên bản mô hình thành công", model);
    }

    @PostMapping("/models/{baseModelVersionId}/revisions")
    @Operation(summary = "Tạo bản sửa đổi mô hình có kiểm soát (Model Revision)",
            description = "Sao chép và áp dụng chỉnh sửa của sinh viên, tạo Revision mới với origin USER_CONFIRMED và lưu hàng loạt bằng saveAll()")
    public ApiResponse<ModelVersionResponseDTO> createControlledRevision(
            @PathVariable UUID baseModelVersionId,
            @Valid @RequestBody ModelRevisionRequestDTO request) {
        ModelVersionResponseDTO created = modelVersionService.createControlledRevision(baseModelVersionId, request);
        return ApiResponse.success("Tạo phiên bản sửa đổi mô hình thành công", created);
    }

    @GetMapping("/models/compare")
    @Operation(summary = "So sánh 2 phiên bản mô hình với độ phức tạp O(N)",
            description = "So sánh baseVersionId và targetVersionId, phân loại phần tử/quan hệ Added, Removed, Modified, Unchanged kèm DiffSummary")
    public ApiResponse<ModelDiffResponseDTO> compareModelVersions(
            @RequestParam UUID baseVersionId,
            @RequestParam UUID targetVersionId) {
        ModelDiffResponseDTO diff = modelVersionService.compareModelVersions(baseVersionId, targetVersionId);
        return ApiResponse.success("So sánh phiên bản mô hình thành công", diff);
    }
}
