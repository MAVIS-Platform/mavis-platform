package com.mavis.analyzer.storage.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
@Slf4j
public class LocalDiskStorageServiceImpl implements StorageService {

    @Value("${mavis.storage.upload-dir:C:/mavis/uploads/}")
    private String uploadDir;

    @Override
    public String store(MultipartFile file) {
        try {
            Path uploadPath = Paths.get(uploadDir);
            Files.createDirectories(uploadPath);

            String uniqueFilename = UUID.randomUUID() + "_" + file.getOriginalFilename();
            Path targetPath = uploadPath.resolve(uniqueFilename);

            file.transferTo(targetPath);
            log.info("Successfully stored uploaded file to: {}", targetPath.toAbsolutePath());

            return targetPath.toAbsolutePath().toString();
        } catch (IOException e) {
            log.error("Failed to store uploaded file: {}", file.getOriginalFilename(), e);
            throw new BusinessException(ErrorCode.FILE_UPLOAD_FAILED, "Lỗi khi lưu trữ file ZIP xuống hệ thống");
        }
    }

    @Override
    public String store(byte[] data, String originalFilename) {
        try {
            Path uploadPath = Paths.get(uploadDir);
            Files.createDirectories(uploadPath);

            String uniqueFilename = UUID.randomUUID() + "_" + (originalFilename != null ? originalFilename : "download.zip");
            Path targetPath = uploadPath.resolve(uniqueFilename);

            Files.write(targetPath, data);
            log.info("Successfully stored byte data to: {}", targetPath.toAbsolutePath());

            return targetPath.toAbsolutePath().toString();
        } catch (IOException e) {
            log.error("Failed to store byte data file: {}", originalFilename, e);
            throw new BusinessException(ErrorCode.FILE_UPLOAD_FAILED, "Lỗi khi lưu trữ file ZIP xuống hệ thống");
        }
    }

    @Override
    public String store(java.io.InputStream inputStream, String originalFilename) {
        try {
            Path uploadPath = Paths.get(uploadDir);
            Files.createDirectories(uploadPath);

            String uniqueFilename = UUID.randomUUID() + "_" + (originalFilename != null ? originalFilename : "download.zip");
            Path targetPath = uploadPath.resolve(uniqueFilename);

            Files.copy(inputStream, targetPath, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            log.info("Successfully stored stream to: {}", targetPath.toAbsolutePath());

            return targetPath.toAbsolutePath().toString();
        } catch (IOException e) {
            log.error("Failed to store stream to file: {}", originalFilename, e);
            throw new BusinessException(ErrorCode.FILE_UPLOAD_FAILED, "Lỗi khi lưu trữ file ZIP xuống hệ thống");
        }
    }
}
