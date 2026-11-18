package com.mavis.platform.assignment.service;

import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.workspace.service.CourseLabSeederService;
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
            Path rawPath = Path.of(snapshot.getStoragePath());
            Path archive = Files.isRegularFile(rawPath) ? rawPath.toRealPath() : null;
            if (archive != null) {
                Path fallbackRoot = Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads");
                boolean inPrimaryRoot = Files.exists(storageRoot) && archive.startsWith(storageRoot.toRealPath());
                boolean inFallbackRoot = Files.exists(fallbackRoot) && archive.startsWith(fallbackRoot.toRealPath());
                if (!inPrimaryRoot && !inFallbackRoot) {
                    throw unavailable();
                }
            } else if (rawPath.getFileName() != null && rawPath.getFileName().toString().startsWith("curated-course-")) {
                Path fallbackDir = Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads");
                Files.createDirectories(fallbackDir);
                Path materialized = fallbackDir.toRealPath().resolve(rawPath.getFileName().toString());
                Files.write(materialized, CourseLabSeederService.buildCuratedArchive());
                archive = materialized;
            } else {
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
