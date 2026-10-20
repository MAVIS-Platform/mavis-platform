package com.mavis.analyzer.orchestrator.service;

import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.utils.ZipUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyzerOrchestrator {

    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final JobRepository jobRepository;
    private final DockerDetector dockerDetector;
    private final JavaSourceParser javaSourceParser;
    private final GraphBuilderService graphBuilderService;

    @Async
    @EventListener
    public void handleAnalyzeRequest(AnalyzeRequestEvent event) {
        log.info("Bắt đầu luồng phân tích cho Project ID: {}", event.projectId());

        Optional<Project> projectOpt;
        try {
            projectOpt = projectRepository.findById(event.projectId());
        } catch (Exception e) {
            log.error("Lỗi khi truy vấn thông tin dự án cho Project ID: {}", event.projectId(), e);
            return;
        }

        if (projectOpt.isEmpty()) {
            log.error("Không tìm thấy dự án với Project ID: {}", event.projectId());
            return;
        }

        Project project = projectOpt.get();

        SourceSnapshot snapshot;
        try {
            String hash = calculateFileHash(event.zipFilePath());
            snapshot = SourceSnapshot.builder()
                    .project(project)
                    .sourceType("ZIP_UPLOAD")
                    .artifactHash(hash)
                    .storagePath(event.zipFilePath())
                    .createdBy(project.getOwner())
                    .build();
            snapshot = sourceSnapshotRepository.save(snapshot);
            log.info("Đã tạo SourceSnapshot ID: {} cho Project ID: {}", snapshot.getId(), project.getId());
        } catch (Exception e) {
            log.error("Lỗi khi khởi tạo SourceSnapshot cho Project ID: {}", event.projectId(), e);
            return;
        }

        Job job = null;
        try {
            job = Job.builder()
                    .project(project)
                    .sourceSnapshot(snapshot)
                    .jobType("STATIC_ANALYSIS")
                    .status("RUNNING")
                    .build();
            job = jobRepository.save(job);
        } catch (Exception e) {
            log.warn("Không thể tạo Job log: {}", e.getMessage());
        }

        ModelVersion modelVersion;
        try {
            int nextRevision = modelVersionRepository.findMaxRevisionByProjectId(project.getId()) + 1;
            modelVersion = ModelVersion.builder()
                    .project(project)
                    .sourceSnapshot(snapshot)
                    .revision(nextRevision)
                    .schemaVersion("1.0")
                    .origin("GENERATED")
                    .isLatestValid(false)
                    .createdBy(project.getOwner())
                    .build();

            modelVersion = modelVersionRepository.save(modelVersion);
            log.info("Đã tạo ModelVersion (revision {}) thành công cho Project ID: {}", nextRevision, event.projectId());
        } catch (Exception e) {
            log.error("Lỗi xảy ra trong quá trình khởi tạo ModelVersion cho Project ID: {}", event.projectId(), e);
            if (job != null) {
                job.setStatus("FAILED");
                job.setErrorDiagnostics(e.getMessage());
                job.setCompletedAt(OffsetDateTime.now());
                jobRepository.save(job);
            }
            return;
        }

        try {
            String extractedPath = ZipUtils.extract(event.zipFilePath());
            log.info("Đã giải nén mã nguồn tại đường dẫn: {}", extractedPath);

            List<String> detectedServices = dockerDetector.detectServices(extractedPath);
            log.info("Đã phát hiện {} Docker services: {}", detectedServices.size(), detectedServices);

            List<ModelElement> savedElements = graphBuilderService.buildAndSaveElements(modelVersion, detectedServices, extractedPath);
            log.info("Đã lưu {} model elements vào database", savedElements.size());

            List<CodeEvidenceDTO> evidences = javaSourceParser.parseProject(extractedPath);
            log.info("Đã trích xuất {} code evidences từ mã nguồn", evidences.size());

            graphBuilderService.buildRelationshipsAndEvidences(snapshot, modelVersion, savedElements, evidences);
            log.info("Đã hoàn tất kết nối model relationships và lưu trữ evidences");

            finalizeModelVersion(project, modelVersion);

            if (job != null) {
                job.setStatus("COMPLETED");
                job.setCompletedAt(OffsetDateTime.now());
                jobRepository.save(job);
            }
        } catch (Exception e) {
            log.error("Lỗi xảy ra trong quá trình trích xuất và phân tích mã nguồn cho Project ID: {}", event.projectId(), e);
            if (job != null) {
                job.setStatus("FAILED");
                job.setErrorDiagnostics(e.getMessage());
                job.setCompletedAt(OffsetDateTime.now());
                jobRepository.save(job);
            }
        }
    }

    private void finalizeModelVersion(Project project, ModelVersion modelVersion) {
        log.info("Bắt đầu hoàn tất ModelVersion ID: {} (revision {}) cho Project ID: {}",
                modelVersion.getId(), modelVersion.getRevision(), project.getId());

        // 1. Tước cờ 'isLatestValid = true' của các version cũ
        modelVersionRepository.invalidatePreviousVersions(project.getId(), modelVersion.getId());

        // 2. Set 'isLatestValid = true' cho version mới nhất
        modelVersion.setIsLatestValid(true);
        modelVersionRepository.save(modelVersion);

        log.info("ModelVersion ID: {} đã hoàn tất thành công (isLatestValid = true)", modelVersion.getId());
    }

    private String calculateFileHash(String filePath) {
        if (filePath == null) {
            return UUID.randomUUID().toString().replace("-", "");
        }
        try (InputStream is = Files.newInputStream(Paths.get(filePath))) {
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
