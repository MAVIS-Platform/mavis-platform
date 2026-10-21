package com.mavis.analyzer.upload.controller;

import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
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

import java.io.InputStream;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/analyzer")
@RequiredArgsConstructor
@Tag(name = "Upload Pipeline")
public class UploadController {

    private final StorageService storageService;
    private final ApplicationEventPublisher eventPublisher;
    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final JobRepository jobRepository;

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Tải lên file ZIP mã nguồn dự án", description = "Kiểm tra tính hợp lệ của file và lưu trữ tạm thời trước khi phân tích")
    public ApiResponse<Map<String, Object>> upload(
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

        String hash = calculateFileHash(file);
        String filePath = storageService.store(file);

        SourceSnapshot snapshot = SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash(hash)
                .storagePath(filePath)
                .createdBy(project.getOwner())
                .build();
        snapshot = sourceSnapshotRepository.save(snapshot);

        Job job = Job.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .jobType("STATIC_ANALYSIS")
                .status("PENDING")
                .build();
        job = jobRepository.save(job);

        eventPublisher.publishEvent(new AnalyzeRequestEvent(projectId, snapshot.getId(), job.getId(), filePath));

        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("projectId", projectId);
        responseData.put("snapshotId", snapshot.getId());
        responseData.put("jobId", job.getId());
        responseData.put("artifactHash", hash);
        responseData.put("filePath", filePath);

        return ApiResponse.success("Tải file ZIP thành công và đã tạo tiến trình phân tích", responseData);
    }

    private String calculateFileHash(MultipartFile file) {
        try (InputStream is = file.getInputStream()) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = is.read(buffer)) > 0) {
                digest.update(buffer, 0, read);
            }
            byte[] hash = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            return UUID.randomUUID().toString().replace("-", "");
        }
    }
}
