package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeSessionServiceImpl implements RuntimeSessionService {

    private static final Pattern RESOURCE_PROJECT_PATTERN = Pattern.compile("^mavisrun-[0-9a-f]{32}$");

    private final RuntimeSessionRepository runtimeSessionRepository;
    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final UserRepository userRepository;
    private final ComposePreflightValidator composePreflightValidator;
    private final ComposeOverrideGenerator composeOverrideGenerator;
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final AccessPolicyService accessPolicyService;
    private final RunnerServiceAuthGuard runnerServiceAuthGuard;
    private final ObjectMapper objectMapper;

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot;

    @Override
    @Transactional(readOnly = true)
    public PreflightCheckResponseDTO runComposePreflight(UUID snapshotId) {
        log.info("Chạy Compose Preflight Check cho snapshotId: {}", snapshotId);

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy snapshot với ID: " + snapshotId));

        if (snapshot.getProject() != null) {
            accessPolicyService.requireProjectReadAccess(snapshot.getProject());
        }

        String storagePathStr = snapshot.getStoragePath();
        if (storagePathStr == null || storagePathStr.isBlank()) {
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .securityWarnings(List.of("Snapshot không có đường dẫn lưu trữ storagePath"))
                    .build();
        }

        Path path = Path.of(storagePathStr);
        if (Files.isRegularFile(path)) {
            String fileName = path.getFileName().toString().toLowerCase();
            if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
                return composePreflightValidator.validate(path);
            } else if (fileName.endsWith(".zip")) {
                // Đọc file docker-compose bên trong zip
                try (ZipFile zipFile = new ZipFile(path.toFile())) {
                    Enumeration<? extends ZipEntry> entries = zipFile.entries();
                    while (entries.hasMoreElements()) {
                        ZipEntry entry = entries.nextElement();
                        String entryName = entry.getName().toLowerCase();
                        if (entryName.endsWith("docker-compose.yml") || entryName.endsWith("docker-compose.yaml")) {
                            try (InputStream is = zipFile.getInputStream(entry)) {
                                String yamlContent = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                                return composePreflightValidator.validate(yamlContent);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.error("Lỗi khi đọc file zip snapshot: {}", path, e);
                }
            }
        } else if (Files.isDirectory(path)) {
            Optional<Path> composePath = findComposeFileInDirectory(path);
            if (composePath.isPresent()) {
                return composePreflightValidator.validate(composePath.get());
            }
        }

        // Nếu không tìm thấy file thực tế trên đĩa (VD: môi trường mock hoặc test)
        return composePreflightValidator.validate(path);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO createRuntimeSession(RuntimeSessionCreateRequest request) {
        log.info("Tạo RuntimeSession mới cho projectId: {}, snapshotId: {}", request.getProjectId(), request.getSourceSnapshotId());

        Project project = projectRepository.findById(request.getProjectId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + request.getProjectId()));

        accessPolicyService.requireProjectWriteAccess(project);

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(request.getSourceSnapshotId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy snapshot với ID: " + request.getSourceSnapshotId()));

        // [WJ-01]: Kiểm tra chặt chẽ projectId và sourceSnapshotId thuộc cùng Project
        if (snapshot.getProject() != null && !snapshot.getProject().getId().equals(project.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot không thuộc về dự án đã chọn");
        }

        // [CHẶNG 11]: Pin cứng ModelVersion ngay tại thời điểm tạo
        com.mavis.common.entity.ModelVersion pinnedModel;
        if (request.getModelVersionId() != null) {
            pinnedModel = modelVersionRepository.findById(request.getModelVersionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + request.getModelVersionId()));
            if (pinnedModel.getProject() != null && !pinnedModel.getProject().getId().equals(project.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên bản mô hình không thuộc về dự án đã chọn");
            }
            if (pinnedModel.getSourceSnapshot() == null || !pinnedModel.getSourceSnapshot().getId().equals(snapshot.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên bản mô hình không gắn với cùng SourceSnapshot");
            }
        } else {
            pinnedModel = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "Dự án chưa có ModelVersion hợp lệ. Vui lòng chạy phân tích tĩnh trước"));
        }

        // [WJ-01 / Chặng 11]: Suy ra confirmedServiceMappings từ model_elements của pinnedModel nếu không truyền
        Map<String, String> serviceMappings = request.getConfirmedServiceMappings();
        if (serviceMappings == null || serviceMappings.isEmpty()) {
            serviceMappings = new HashMap<>();
            List<com.mavis.common.entity.ModelElement> elements = modelElementRepository.findByModelVersionId(pinnedModel.getId());
            for (com.mavis.common.entity.ModelElement el : elements) {
                if ("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getName() != null) {
                    serviceMappings.put(el.getName(), el.getId().toString());
                }
            }
        }

        User triggeredBy = null;
        if (request.getTriggeredById() != null) {
            triggeredBy = userRepository.findById(request.getTriggeredById()).orElse(null);
        }

        JsonNode rawScenarioConfig = request.getScenarioConfig();

        // [CHẶNG 11]: Tính 64-hex SHA-256 cho profileVersionId, runConfigurationVersionId, scenarioVersionId nếu không truyền hoặc là legacy string
        String profileVersionId = request.getProfileVersionId();
        if (profileVersionId == null || profileVersionId.isBlank() || "local-poc-profile/1.0".equals(profileVersionId)) {
            JsonNode profileNode = rawScenarioConfig != null && rawScenarioConfig.has("profile")
                    ? rawScenarioConfig.get("profile")
                    : (rawScenarioConfig != null ? rawScenarioConfig : objectMapper.createObjectNode());
            profileVersionId = CanonicalReceiptDigestUtils.computeDigest(profileNode);
        }

        String runConfigVersionId = request.getRunConfigurationVersionId();
        if (runConfigVersionId == null || runConfigVersionId.isBlank() || "run-config/1.0".equals(runConfigVersionId)) {
            JsonNode runConfigNode = rawScenarioConfig != null && rawScenarioConfig.has("runConfiguration")
                    ? rawScenarioConfig.get("runConfiguration")
                    : (rawScenarioConfig != null && rawScenarioConfig.has("runConfig")
                    ? rawScenarioConfig.get("runConfig")
                    : (rawScenarioConfig != null ? rawScenarioConfig : objectMapper.createObjectNode()));
            runConfigVersionId = CanonicalReceiptDigestUtils.computeDigest(runConfigNode);
        }

        String scenarioVersionId = request.getScenarioVersionId();
        if (scenarioVersionId == null || scenarioVersionId.isBlank() || "scenario/1.0".equals(scenarioVersionId)) {
            JsonNode scenarioNode = rawScenarioConfig != null && rawScenarioConfig.has("scenario")
                    ? rawScenarioConfig.get("scenario")
                    : (rawScenarioConfig != null ? rawScenarioConfig : objectMapper.createObjectNode());
            scenarioVersionId = CanonicalReceiptDigestUtils.computeDigest(scenarioNode);
        }

        // [CHẶNG 11]: Sinh resourceProject = "mavisrun-" + 32hex lowercase (41 ký tự)
        String resourceProject = "mavisrun-" + UUID.randomUUID().toString().replace("-", "").toLowerCase();

        // [BẢO MẬT & BR-41..45]: Khử secret nhưng giữ nguyên secretHeaders
        JsonNode redactedConfig = SecretRedactor.redactJson(rawScenarioConfig);

        RuntimeSession session = RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .modelVersion(pinnedModel)
                .triggeredBy(triggeredBy)
                .profileName(request.getProfileName() != null && !request.getProfileName().isBlank()
                        ? request.getProfileName()
                        : "SPRING_BOOT_DOTNET_COMPOSE_V1")
                .profileVersionId(profileVersionId)
                .runConfigurationVersionId(runConfigVersionId)
                .scenarioVersionId(scenarioVersionId)
                .confirmedServiceMappings(serviceMappings)
                .resourceProject(resourceProject)
                .scenarioName(request.getScenarioName())
                .scenarioConfig(redactedConfig)
                .scenarioStatus("PENDING")
                .executionStatus("NOT_STARTED")
                .evidenceStatus("UNAVAILABLE")
                .cleanupStatus("NOT_APPLICABLE")
                .traceQuality("UNAVAILABLE")
                .mappingStatus("UNAVAILABLE")
                .sandboxEnforcementConfirmed(false)
                .traceStatus("NONE")
                .publicationGateStatus("NONE")
                .imageSourceCorrespondence("UNVERIFIED")
                .profileAcceptance("UNVERIFIED")
                .build();

        RuntimeSession saved = runtimeSessionRepository.save(session);
        log.info("Đã tạo RuntimeSession thành công với ID: {}, resourceProject: {}, pinnedModelVersion: {}",
                saved.getId(), resourceProject, pinnedModel.getId());

        return RuntimeSessionResponseDTO.fromEntity(saved);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO approveAndStartSession(UUID sessionId) {
        log.info("Phê duyệt và chuẩn bị dispatch RuntimeSession ID: {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        accessPolicyService.requireProjectWriteAccess(session.getProject());

        // [CHẶNG 11]: Kiểm tra preflight
        PreflightCheckResponseDTO preflight = runComposePreflight(session.getSourceSnapshot().getId());
        if (!preflight.isCompatible()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Compose preflight rejected: " + preflight.getSecurityWarnings());
        }

        // [CHẶNG 11]: Đặt scenarioStatus = "APPROVED", executionStatus = "READY_FOR_DISPATCH" (không đặt RUNNING ở đây)
        session.setScenarioStatus("APPROVED");
        session.setExecutionStatus("READY_FOR_DISPATCH");

        List<String> serviceNames = preflight.getDetectedServices();
        String overrideYaml = composeOverrideGenerator.generateOverrideYaml(serviceNames);

        RuntimeSession updated = runtimeSessionRepository.save(session);
        log.info("Phiên thực nghiệm ID: {} đã chuyển sang APPROVED / READY_FOR_DISPATCH thành công", sessionId);

        return RuntimeSessionResponseDTO.fromEntity(updated, overrideYaml);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionLifecycleAckDTO acknowledgeLifecycle(UUID sessionId, RuntimeSessionLifecycleAckRequestDTO request) {
        if (request == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Payload lifecycle-ack không được để trống");
        }

        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        runnerServiceAuthGuard.checkRunnerOrProjectWriteAccess(session.getProject());

        String resourceProject = request.getResourceProject();
        if (resourceProject == null || !RESOURCE_PROJECT_PATTERN.matcher(resourceProject).matches()
                || !resourceProject.equalsIgnoreCase(session.getResourceProject())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "ResourceProject không hợp lệ hoặc không khớp với phiên đã cấp phát: " + resourceProject);
        }

        String stage = request.getStage();
        OffsetDateTime observedAt = request.getObservedAt() != null ? request.getObservedAt() : OffsetDateTime.now();

        if ("ALLOCATED".equalsIgnoreCase(stage)) {
            session.setExecutionStatus("ALLOCATED");
            session.setAllocatedAt(observedAt);
        } else if ("RUNNING".equalsIgnoreCase(stage)) {
            session.setScenarioStatus("RUNNING");
            session.setExecutionStatus("RUNNING");
            session.setStartedAt(observedAt);
        } else {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Stage không hợp lệ: " + stage);
        }

        RuntimeSession saved = runtimeSessionRepository.save(session);
        log.info("Đã cập nhật lifecycle-ack cho session {}: stage={}, executionStatus={}, scenarioStatus={}",
                sessionId, stage, saved.getExecutionStatus(), saved.getScenarioStatus());

        return RuntimeSessionLifecycleAckDTO.builder()
                .sessionId(saved.getId())
                .resourceProject(saved.getResourceProject())
                .stage(stage.toUpperCase())
                .executionStatus(saved.getExecutionStatus())
                .scenarioStatus(saved.getScenarioStatus())
                .acknowledgedAt(OffsetDateTime.now())
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO stopSession(UUID sessionId) {
        log.info("Dừng phiên thực nghiệm ID: {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        accessPolicyService.requireProjectWriteAccess(session.getProject());

        String executionStatus = session.getExecutionStatus() != null ? session.getExecutionStatus().toUpperCase() : "NOT_STARTED";

        // [CHẶNG 11] Nhánh 3: Stop-after-completion (đã kết thúc COMPLETED, FAILED, TIMED_OUT, TIMEOUT hoặc CANCELLED có receipt)
        if ("COMPLETED".equals(executionStatus) || "FAILED".equals(executionStatus)
                || "TIMED_OUT".equals(executionStatus) || "TIMEOUT".equals(executionStatus)
                || ("CANCELLED".equals(executionStatus) && session.getRunnerReceiptJson() != null)) {
            log.info("Phiên thực nghiệm {} đã kết thúc ở trạng thái {}. Trả về idempotent.", sessionId, executionStatus);
            return RuntimeSessionResponseDTO.fromEntity(session);
        }

        // [CHẶNG 11] Nhánh 1: Stop-before-start (NOT_STARTED, PENDING, APPROVED, READY_FOR_DISPATCH)
        if ("NOT_STARTED".equals(executionStatus) || "PENDING".equals(executionStatus)
                || "APPROVED".equals(executionStatus) || "READY_FOR_DISPATCH".equals(executionStatus)) {
            session.setScenarioStatus("CANCELLED");
            session.setExecutionStatus("CANCELLED");
            session.setCleanupStatus("NOT_APPLICABLE");
            session.setCancelRequestedAt(OffsetDateTime.now());
            session.setCompletedAt(OffsetDateTime.now());

            RuntimeSession updated = runtimeSessionRepository.save(session);
            log.info("Phiên thực nghiệm {} dừng trước khi chạy (Stop-before-start). Đặt CANCELLED.", sessionId);
            return RuntimeSessionResponseDTO.fromEntity(updated);
        }

        // [CHẶNG 11] Nhánh 2: Stop-while-running (ALLOCATED, RUNNING, CANCELLING)
        if (runnerStateRoot == null || runnerStateRoot.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể ghi cancel.request tới state-root của Runner: runnerStateRoot chưa cấu hình");
        }

        if (session.getResourceProject() == null || session.getResourceProject().isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên chạy không có resourceProject để ghi cancel.request");
        }

        try {
            Path sessionDir = Path.of(runnerStateRoot, session.getResourceProject()).toAbsolutePath().normalize();
            Files.createDirectories(sessionDir);
            Path cancelMarker = sessionDir.resolve("cancel.request");
            Files.writeString(cancelMarker, OffsetDateTime.now().toString(), StandardCharsets.UTF_8);
            log.info("Đã tạo file cancel.request tại: {}", cancelMarker);
        } catch (Exception e) {
            log.error("Lỗi khi ghi cancel.request cho session: {}", sessionId, e);
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Không thể ghi cancel.request tới state-root của Runner: " + e.getMessage());
        }

        session.setCancelRequestedAt(OffsetDateTime.now());
        session.setExecutionStatus("CANCELLING");
        session.setCleanupStatus("STOP_REQUESTED");
        session.setCompletedAt(null); // Giữ null chờ Receipt xác nhận cleanup

        RuntimeSession updated = runtimeSessionRepository.save(session);
        log.info("Phiên thực nghiệm {} đang dừng (Stop-while-running), trạng thái CANCELLING, chờ Receipt cleanup.", sessionId);
        return RuntimeSessionResponseDTO.fromEntity(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public RunnerDefinitionExportDTO exportRunDefinition(UUID sessionId) {
        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        runnerServiceAuthGuard.checkRunnerOrProjectWriteAccess(session.getProject());

        SourceSnapshot snapshot = session.getSourceSnapshot();
        String composeYaml = "";
        if (snapshot != null && snapshot.getStoragePath() != null) {
            Path path = Path.of(snapshot.getStoragePath());
            if (Files.isRegularFile(path)) {
                String fileName = path.getFileName().toString().toLowerCase();
                if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
                    try {
                        composeYaml = Files.readString(path, StandardCharsets.UTF_8);
                    } catch (Exception ignored) {}
                } else if (fileName.endsWith(".zip")) {
                    try (ZipFile zipFile = new ZipFile(path.toFile())) {
                        Enumeration<? extends ZipEntry> entries = zipFile.entries();
                        while (entries.hasMoreElements()) {
                            ZipEntry entry = entries.nextElement();
                            String entryName = entry.getName().toLowerCase();
                            if (entryName.endsWith("docker-compose.yml") || entryName.endsWith("docker-compose.yaml")) {
                                try (InputStream is = zipFile.getInputStream(entry)) {
                                    composeYaml = new String(is.readAllBytes(), StandardCharsets.UTF_8);
                                    break;
                                }
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }
        }

        // Kiểm tra bắt buộc: composeYaml không rỗng
        if (composeYaml.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "composeYaml không được để trống cho run-definition");
        }

        JsonNode scenarioConfig = session.getScenarioConfig();
        JsonNode profileNode = scenarioConfig != null && scenarioConfig.has("profile")
                ? scenarioConfig.path("profile")
                : null;

        // Kiểm tra bắt buộc: profileNode là object hợp lệ có collectorImage, instrumentationVolume, applications không rỗng
        if (profileNode == null || !profileNode.isObject()
                || !profileNode.hasNonNull("collectorImage") || profileNode.get("collectorImage").asText().isBlank()
                || !profileNode.hasNonNull("instrumentationVolume") || profileNode.get("instrumentationVolume").asText().isBlank()
                || !profileNode.hasNonNull("applications") || !profileNode.get("applications").isObject() || profileNode.get("applications").isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "Cấu hình profile không hợp lệ: thiếu collectorImage, instrumentationVolume hoặc applications không rỗng");
        }

        JsonNode scenarioNode = scenarioConfig != null && scenarioConfig.has("scenario")
                ? scenarioConfig.path("scenario")
                : scenarioConfig;

        // Kiểm tra bắt buộc: scenarioNode là ObjectNode có mảng steps không rỗng
        if (scenarioNode == null || !scenarioNode.isObject()
                || !scenarioNode.has("steps") || !scenarioNode.get("steps").isArray() || scenarioNode.get("steps").isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Cấu hình scenario không hợp lệ: thiếu mảng steps không rỗng");
        }

        ObjectNode scenarioCopy = scenarioNode.deepCopy();
        if (!scenarioCopy.hasNonNull("sessionId") || !scenarioCopy.get("sessionId").asText().equalsIgnoreCase(session.getId().toString())) {
            scenarioCopy.put("sessionId", session.getId().toString());
        }

        // Kiểm tra bắt buộc: confirmedServiceMappings không rỗng
        Map<String, String> mappings = session.getConfirmedServiceMappings();
        if (mappings == null || mappings.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "confirmedServiceMappings không được để trống");
        }

        // Lấy modelVersionId trực tiếp từ session.getModelVersion() đã pin cứng
        if (session.getModelVersion() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm chưa được ghim ModelVersion");
        }
        String modelVersionIdStr = session.getModelVersion().getId().toString();

        return RunnerDefinitionExportDTO.builder()
                .sessionId(session.getId().toString())
                .modelVersionId(modelVersionIdStr)
                .sourceSnapshotId(snapshot != null ? snapshot.getId().toString() : "")
                .profileVersionId(session.getProfileVersionId() != null ? session.getProfileVersionId() : "local-poc-profile/1.0")
                .runConfigurationVersionId(session.getRunConfigurationVersionId() != null ? session.getRunConfigurationVersionId() : "run-config/1.0")
                .scenarioVersionId(session.getScenarioVersionId() != null ? session.getScenarioVersionId() : "scenario/1.0")
                .resourceProject(session.getResourceProject())
                .composeYaml(composeYaml)
                .profile(profileNode)
                .scenario(scenarioCopy)
                .confirmedServiceMappings(mappings)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public List<RuntimeSessionResponseDTO> getSessionsByProject(UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));
        accessPolicyService.requireProjectReadAccess(project);

        List<RuntimeSession> sessions = runtimeSessionRepository.findByProjectIdOrderByCreatedAtDesc(projectId);
        return sessions.stream()
                .map(RuntimeSessionResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public RuntimeSessionResponseDTO getSessionById(UUID sessionId) {
        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));
        accessPolicyService.requireProjectReadAccess(session.getProject());
        return RuntimeSessionResponseDTO.fromEntity(session);
    }

    private Optional<Path> findComposeFileInDirectory(Path dir) {
        Path yml = dir.resolve("docker-compose.yml");
        if (Files.isRegularFile(yml)) return Optional.of(yml);

        Path yaml = dir.resolve("docker-compose.yaml");
        if (Files.isRegularFile(yaml)) return Optional.of(yaml);

        try (Stream<Path> stream = Files.walk(dir, 4)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString().toLowerCase();
                        return "docker-compose.yml".equals(name) || "docker-compose.yaml".equals(name);
                    })
                    .findFirst();
        } catch (Exception e) {
            log.error("Lỗi khi tìm kiếm docker-compose trong thư mục {}", dir, e);
            return Optional.empty();
        }
    }
}
