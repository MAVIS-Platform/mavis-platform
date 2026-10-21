package com.mavis.analyzer.upload.controller;

import com.mavis.analyzer.upload.dto.GitHubImportRequest;
import com.mavis.analyzer.upload.dto.IngestionResponseDTO;
import com.mavis.analyzer.upload.service.SourceIngestionService;
import com.mavis.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Upload Pipeline", description = "APIs for source code upload and GitHub import")
public class UploadController {

    private final SourceIngestionService sourceIngestionService;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Tải lên file ZIP mã nguồn dự án", description = "Kiểm tra tính hợp lệ của file và lưu trữ tạm thời trước khi phân tích")
    public ApiResponse<IngestionResponseDTO> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("projectId") UUID projectId) {
        IngestionResponseDTO response = sourceIngestionService.ingestZipUpload(projectId, file);
        return ApiResponse.success("Tải file ZIP thành công và đã tạo tiến trình phân tích", response);
    }

    @PostMapping("/import/github")
    @Operation(summary = "Nạp mã nguồn từ GitHub commit/branch", description = "Tải gói archive ZIP từ GitHub repo và tạo tiến trình phân tích")
    public ApiResponse<IngestionResponseDTO> importFromGitHub(
            @Valid @RequestBody GitHubImportRequest request) {
        IngestionResponseDTO response = sourceIngestionService.ingestFromGitHub(request);
        return ApiResponse.success("Nạp mã nguồn từ GitHub thành công và đã tạo tiến trình phân tích", response);
    }
}
