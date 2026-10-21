package com.mavis.analyzer.orchestrator.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.analyzer.orchestrator.service.AnalyzerOrchestratorService;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.*;
import com.mavis.common.utils.HashUtils;
import com.mavis.common.utils.ZipUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.nio.file.Paths;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyzerOrchestratorServiceImpl implements AnalyzerOrchestratorService {

    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final JobRepository jobRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final DockerDetector dockerDetector;
    private final JavaSourceParser javaSourceParser;
    private final GraphBuilderService graphBuilderService;
    private final ObjectMapper objectMapper;

    @Async
    @EventListener
    @Override
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

        SourceSnapshot snapshot = null;
        if (event.snapshotId() != null) {
            snapshot = sourceSnapshotRepository.findById(event.snapshotId()).orElse(null);
        }

        if (snapshot == null) {
            try {
                String hash = HashUtils.sha256Hex(Paths.get(event.zipFilePath()));
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
        }

        Job job = null;
        if (event.jobId() != null) {
            job = jobRepository.findById(event.jobId()).orElse(null);
        }

        if (job != null) {
            job.setStatus("RUNNING");
            job = jobRepository.save(job);
        } else {
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
                long elementsCount = modelElementRepository.countByModelVersionId(modelVersion.getId());
                long relationshipsCount = modelRelationshipRepository.countByModelVersionId(modelVersion.getId());
                long evidencesCount = evidenceRepository.countByModelVersionId(modelVersion.getId());

                ObjectNode manifestNode = objectMapper.createObjectNode();
                manifestNode.put("elementsCount", elementsCount);
                manifestNode.put("relationshipsCount", relationshipsCount);
                manifestNode.put("evidencesCount", evidencesCount);
                ArrayNode servicesArray = manifestNode.putArray("servicesDetected");
                if (detectedServices != null) {
                    for (String service : detectedServices) {
                        servicesArray.add(service);
                    }
                }

                job.setResultManifest(manifestNode);
                job.setStatus("COMPLETED");
                job.setCompletedAt(OffsetDateTime.now());
                jobRepository.save(job);
                log.info("Job ID: {} đã hoàn tất thành công. ResultManifest: elements={}, relationships={}, evidences={}",
                        job.getId(), elementsCount, relationshipsCount, evidencesCount);
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
}
