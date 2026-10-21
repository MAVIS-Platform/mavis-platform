package com.mavis.analyzer.upload.service.impl;

import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.analyzer.upload.dto.GitHubImportRequest;
import com.mavis.analyzer.upload.dto.IngestionResponseDTO;
import com.mavis.analyzer.upload.service.SourceIngestionService;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.utils.HashUtils;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Paths;
import java.time.Duration;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class SourceIngestionServiceImpl implements SourceIngestionService {

    private final StorageService storageService;
    private final ApplicationEventPublisher eventPublisher;
    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final JobRepository jobRepository;

    private HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.ALWAYS)
            .build();

    public void setHttpClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public IngestionResponseDTO ingestZipUpload(UUID projectId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "File tải lên không được để trống");
        }

        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".zip")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Chỉ chấp nhận file định dạng .zip");
        }

        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền tải lên cho dự án này");
        }

        String storagePath = storageService.store(file);
        String artifactHash = HashUtils.sha256Hex(Paths.get(storagePath));

        SourceSnapshot snapshot = SourceSnapshot.builder()
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .artifactHash(artifactHash)
                .storagePath(storagePath)
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

        eventPublisher.publishEvent(new AnalyzeRequestEvent(project.getId(), snapshot.getId(), job.getId(), storagePath));

        log.info("Đã ingest ZIP upload thành công. Project ID: {}, Snapshot ID: {}, Job ID: {}",
                project.getId(), snapshot.getId(), job.getId());

        return IngestionResponseDTO.builder()
                .projectId(project.getId())
                .snapshotId(snapshot.getId())
                .jobId(job.getId())
                .sourceType(snapshot.getSourceType())
                .artifactHash(artifactHash)
                .jobStatus(job.getStatus())
                .storagePath(storagePath)
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public IngestionResponseDTO ingestFromGitHub(GitHubImportRequest request) {
        if (request == null || request.getProjectId() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Thông tin import không hợp lệ: Project ID không được để trống");
        }
        if (request.getRepositoryUrl() == null || request.getRepositoryUrl().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Repository URL không được để trống");
        }

        Project project = projectRepository.findById(request.getProjectId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + request.getProjectId()));

        if (!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Bạn không có quyền nạp mã nguồn cho dự án này");
        }

        String cleanRepoUrl = request.getRepositoryUrl().trim();
        if (cleanRepoUrl.endsWith(".git")) {
            cleanRepoUrl = cleanRepoUrl.substring(0, cleanRepoUrl.length() - 4);
        }
        if (cleanRepoUrl.endsWith("/")) {
            cleanRepoUrl = cleanRepoUrl.substring(0, cleanRepoUrl.length() - 1);
        }

        String commitShaOrBranch;
        if (request.getCommitSha() != null && !request.getCommitSha().isBlank()) {
            commitShaOrBranch = request.getCommitSha().trim();
        } else if (request.getBranchName() != null && !request.getBranchName().isBlank()) {
            commitShaOrBranch = request.getBranchName().trim();
        } else {
            commitShaOrBranch = "main";
        }

        String downloadUrl = cleanRepoUrl + "/archive/" + commitShaOrBranch + ".zip";
        log.info("Bắt đầu tải archive GitHub từ URL: {}", downloadUrl);

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(downloadUrl))
                .timeout(Duration.ofSeconds(30))
                .header("User-Agent", "MAVIS-Platform/1.0")
                .GET()
                .build();

        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofInputStream());
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.error("Lỗi kết nối khi tải mã nguồn từ GitHub: {}", downloadUrl, e);
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Lỗi kết nối khi tải mã nguồn từ GitHub: " + e.getMessage());
        }

        if (response.statusCode() >= 400) {
            log.error("Không thể tải mã nguồn từ GitHub URL: {}, HTTP Status: {}", downloadUrl, response.statusCode());
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Không thể tải mã nguồn từ GitHub URL: " + downloadUrl + " (HTTP " + response.statusCode() + ")");
        }

        String filename = "github-" + commitShaOrBranch.replace("/", "_") + ".zip";
        String storagePath = storageService.store(response.body(), filename);
        String artifactHash = HashUtils.sha256Hex(Paths.get(storagePath));

        String branchName = (request.getBranchName() != null && !request.getBranchName().isBlank())
                ? request.getBranchName().trim()
                : "main";
        String commitSha = (request.getCommitSha() != null && !request.getCommitSha().isBlank())
                ? request.getCommitSha().trim()
                : null;

        SourceSnapshot snapshot = SourceSnapshot.builder()
                .project(project)
                .sourceType("GITHUB_COMMIT")
                .branchName(branchName)
                .commitSha(commitSha)
                .artifactHash(artifactHash)
                .storagePath(storagePath)
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

        eventPublisher.publishEvent(new AnalyzeRequestEvent(project.getId(), snapshot.getId(), job.getId(), storagePath));

        log.info("Đã ingest GitHub archive thành công. Project ID: {}, Snapshot ID: {}, Job ID: {}",
                project.getId(), snapshot.getId(), job.getId());

        return IngestionResponseDTO.builder()
                .projectId(project.getId())
                .snapshotId(snapshot.getId())
                .jobId(job.getId())
                .sourceType(snapshot.getSourceType())
                .artifactHash(artifactHash)
                .jobStatus(job.getStatus())
                .storagePath(storagePath)
                .build();
    }
}
