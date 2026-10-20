package com.mavis.analyzer.upload.controller;

import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.Project;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.utils.SecurityUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Upload Pipeline")
public class UploadController {

    private final StorageService storageService;
    private final ApplicationEventPublisher eventPublisher;
    private final ProjectRepository projectRepository;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Tải lên file ZIP mã nguồn dự án", description = "Kiểm tra tính hợp lệ của file và lưu trữ tạm thời trước khi phân tích")
    public ApiResponse<String> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("projectId") UUID projectId) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "File tải lên không được để trống");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".zip")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Chỉ chấp nhận file định dạng .zip");
        }

        Project project = projectRepository.findById(projectId)
                .orElseThrow(
                        () -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền tải lên cho dự án này");
        }

        String filePath = storageService.store(file);

        eventPublisher.publishEvent(new AnalyzeRequestEvent(projectId, filePath));

        return ApiResponse.success("Tải file ZIP thành công và đã phát tín hiệu phân tích", filePath);
    }
}
