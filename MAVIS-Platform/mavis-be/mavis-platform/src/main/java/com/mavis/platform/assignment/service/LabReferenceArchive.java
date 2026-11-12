package com.mavis.platform.assignment.service;

import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.utils.HashUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class LabReferenceArchive {
    private final Path storageRoot;

    public LabReferenceArchive(@Value("${mavis.storage.upload-dir:C:/mavis/uploads/}") String uploadDir) {
        storageRoot = Path.of(uploadDir);
    }

    public Resource resolve(SourceSnapshot snapshot, boolean verifyDigest) {
        if (snapshot == null || snapshot.getStoragePath() == null || snapshot.getStoragePath().isBlank()) {
            throw unavailable();
        }
        try {
            Path root = storageRoot.toRealPath();
            Path archive = Path.of(snapshot.getStoragePath()).toRealPath();
            if (!archive.startsWith(root) || !Files.isRegularFile(archive)) {
                throw unavailable();
            }
            if (verifyDigest) {
                try (var stream = Files.newInputStream(archive)) {
                    String actual = HashUtils.sha256Hex(stream);
                    if (!actual.equalsIgnoreCase(snapshot.getArtifactHash())) {
                        throw new BusinessException(ErrorCode.CONFLICT, "The published source archive no longer matches its digest");
                    }
                }
            }
            return new FileSystemResource(archive);
        } catch (IOException | IllegalArgumentException ignored) {
            throw unavailable();
        }
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.NOT_FOUND, "Reference archive is unavailable");
    }
}
