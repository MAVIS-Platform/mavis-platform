package com.mavis.analyzer.storage.service.impl;

import com.mavis.analyzer.storage.service.ArtifactRetentionService;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Comparator;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ArtifactRetentionServiceImpl implements ArtifactRetentionService {

    private final ModelVersionRepository modelVersionRepository;
    private final SubmissionSnapshotRepository submissionSnapshotRepository;
    private final JobRepository jobRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;

    @Value("${mavis.storage.upload-dir:C:/mavis/uploads/}")
    private String uploadDir;

    @Override
    @Transactional(readOnly = true)
    public boolean canDeleteSourceSnapshot(UUID snapshotId) {
        if (snapshotId == null) {
            return false;
        }

        // 1. Check if referenced by any model_versions
        if (modelVersionRepository.existsBySourceSnapshotId(snapshotId)) {
            log.info("SourceSnapshot {} is pinned by a ModelVersion and cannot be deleted", snapshotId);
            return false;
        }

        // 2. Check if referenced by any submission_snapshots
        if (submissionSnapshotRepository.existsBySourceSnapshotId(snapshotId)) {
            log.info("SourceSnapshot {} is pinned by a SubmissionSnapshot and cannot be deleted", snapshotId);
            return false;
        }

        // 3. Check if referenced by any PENDING or RUNNING jobs
        boolean hasActiveJobs = jobRepository.findBySourceSnapshotId(snapshotId).stream()
                .anyMatch(job -> Set.of("PENDING", "RUNNING", "CANCELLING").contains(job.getStatus()));
        if (hasActiveJobs) {
            log.info("SourceSnapshot {} has active analysis jobs and cannot be deleted", snapshotId);
            return false;
        }

        return true;
    }

    @Override
    @Transactional
    public int cleanupUnreferencedArtifacts() {
        Path root;
        try {
            root = Paths.get(uploadDir).toAbsolutePath().normalize();
        } catch (Exception e) {
            log.warn("Invalid upload directory path: {}", uploadDir, e);
            return 0;
        }

        if (!Files.exists(root) || !Files.isDirectory(root)) {
            log.debug("Upload directory does not exist: {}", root);
            return 0;
        }

        // Collect all active artifact paths referenced by source snapshots
        Set<Path> referencedPaths = sourceSnapshotRepository.findAll().stream()
                .map(SourceSnapshot::getStoragePath)
                .filter(Objects::nonNull)
                .map(p -> {
                    try {
                        return Paths.get(p).toAbsolutePath().normalize();
                    } catch (Exception e) {
                        return null;
                    }
                })
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        int deletedCount = 0;
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(root)) {
            for (Path entry : stream) {
                Path normalizedEntry = entry.toAbsolutePath().normalize();
                String fileName = entry.getFileName().toString();
                boolean isTemp = fileName.startsWith(".mavis-upload-") || fileName.endsWith(".part") || fileName.endsWith(".tmp");
                boolean isReferenced = referencedPaths.contains(normalizedEntry);

                if (isTemp || !isReferenced) {
                    try {
                        if (Files.isDirectory(entry)) {
                            try (var walk = Files.walk(entry)) {
                                walk.sorted(Comparator.reverseOrder())
                                        .forEach(p -> {
                                            try {
                                                Files.deleteIfExists(p);
                                            } catch (IOException ignored) {
                                            }
                                        });
                            }
                        } else {
                            Files.deleteIfExists(entry);
                        }
                        deletedCount++;
                        log.debug("Cleaned up unreferenced artifact: {}", entry);
                    } catch (Exception e) {
                        log.warn("Failed to delete unreferenced artifact: {}", entry, e);
                    }
                }
            }
        } catch (IOException e) {
            log.error("Failed to inspect storage directory for cleanup: {}", root, e);
        }

        return deletedCount;
    }
}
