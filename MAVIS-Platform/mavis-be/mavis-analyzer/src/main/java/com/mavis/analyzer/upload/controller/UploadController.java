package com.mavis.analyzer.upload.controller;

import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
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

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Tải lên file ZIP mã nguồn dự án", description = "Kiểm tra tính hợp lệ của file và lưu trữ tạm thời trước khi phân tích")
    public ApiResponse<String> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("projectId") UUID projectId
    ) {
        if (file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "File tải lên không được để trống");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".zip")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Chỉ chấp nhận file định dạng .zip");
        }

        String filePath = storageService.store(file);

        return ApiResponse.success("Tải file ZIP thành công", filePath);
    }
}
