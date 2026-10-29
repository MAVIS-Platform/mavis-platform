package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelVersion;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
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
    private final com.mavis.common.config.PlatformRuntimeSettings settings;

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot;

    @Value("${mavis.runner.collector-image:otel/opentelemetry-collector-contrib@sha256:0000000000000000000000000000000000000000000000000000000000000001}")
    private String collectorImage;

    private final ConcurrentHashMap<UUID, RuntimeProjectConfigDTO> projectConfigs = new ConcurrentHashMap<>();

    @Autowired(required = false)
    @Lazy
    private RuntimeRunnerDispatcher runtimeRunnerDispatcher;

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
                                String yamlContent = new String(readBounded(is), StandardCharsets.UTF_8);
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

        Project project = projectRepository.findLockedById(request.getProjectId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + request.getProjectId()));

        accessPolicyService.requireProjectWriteAccess(project);

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(request.getSourceSnapshotId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy snapshot với ID: " + request.getSourceSnapshotId()));

        settings.requireIntegration("otel-collector");
        var executionProfile=settings.requireProfile(request.getProfileName()==null ? "SPRING_BOOT_DOTNET_COMPOSE_V1" : request.getProfileName());

        // [WJ-01]: Kiểm tra chặt chẽ projectId và sourceSnapshotId thuộc cùng Project
        if (snapshot.getProject() != null && !snapshot.getProject().getId().equals(project.getId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot không thuộc về dự án đã chọn");
        }

        // [CHẶNG 11]: Pin cứng ModelVersion ngay tại thời điểm tạo (tự động đồng bộ nếu lệch snapshot trong cùng Project)
        com.mavis.common.entity.ModelVersion pinnedModel = null;
        if (request.getModelVersionId() != null) {
            pinnedModel = modelVersionRepository.findById(request.getModelVersionId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + request.getModelVersionId()));
            if (pinnedModel.getProject() != null && !pinnedModel.getProject().getId().equals(project.getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên bản mô hình không thuộc về dự án đã chọn");
            }
            if ("RUNTIME_ENRICHED".equalsIgnoreCase(pinnedModel.getOrigin()) && pinnedModel.getBaseModelVersion() != null) {
                pinnedModel = pinnedModel.getBaseModelVersion();
            }
            if (pinnedModel.getSourceSnapshot() != null && !snapshot.getId().equals(pinnedModel.getSourceSnapshot().getId())) {
                // Tự động đồng bộ sang SourceSnapshot của pinnedModel nếu thuộc cùng Project
                if (pinnedModel.getProject() != null && pinnedModel.getProject().getId().equals(project.getId())) {
                    snapshot = pinnedModel.getSourceSnapshot();
                } else {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Pinned model must belong to the selected snapshot");
                }
            }
        } else {
            pinnedModel = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId())
                    .orElseGet(() -> modelVersionRepository.findByProjectIdOrderByRevisionDesc(project.getId()).stream()
                            .filter(mv -> !"RUNTIME_ENRICHED".equalsIgnoreCase(mv.getOrigin()))
                            .findFirst()
                            .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "Dự án chưa có ModelVersion hợp lệ. Vui lòng chạy phân tích tĩnh trước")));

            if (pinnedModel.getSourceSnapshot() == null || !snapshot.getId().equals(pinnedModel.getSourceSnapshot().getId())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Pinned model must belong to the selected snapshot");
            }
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

        // [BẢO MẬT & BR-41..45 / TASK RT-01]: Tự động dựng profileNode hợp lệ & scenario steps chuẩn
        ObjectNode bounded = rawScenarioConfig != null && rawScenarioConfig.isObject()
                ? (ObjectNode) rawScenarioConfig.deepCopy()
                : objectMapper.createObjectNode();

        ObjectNode profile = bounded.has("profile") && bounded.get("profile").isObject()
                ? (ObjectNode) bounded.get("profile")
                : bounded.putObject("profile");

        if (!profile.hasNonNull("collectorImage") || profile.get("collectorImage").asText().isBlank()) {
            profile.put("collectorImage", collectorImage != null && !collectorImage.isBlank()
                    ? collectorImage
                    : "otel/opentelemetry-collector-contrib@sha256:0000000000000000000000000000000000000000000000000000000000000001");
        }
        if (!profile.hasNonNull("instrumentationVolume") || profile.get("instrumentationVolume").asText().isBlank()) {
            profile.put("instrumentationVolume", "mavis-agents-v1");
        }
        if (!profile.hasNonNull("scenarioRunnerImage") || profile.get("scenarioRunnerImage").asText().isBlank()) {
            profile.put("scenarioRunnerImage", "mavis/scenario-runner@sha256:0000000000000000000000000000000000000000000000000000000000000001");
        }
        profile.put("memoryMiB", executionProfile.memoryMiB());
        profile.put("cpus", executionProfile.cpus());
        profile.put("timeoutSeconds", executionProfile.timeoutSeconds());
        profile.put("administrativeProfileId", executionProfile.id());
        profile.put("administrativeRevision", executionProfile.revision());
        profile.put("approvedForLocalPoc", true);
        if (!profile.hasNonNull("javaInstrumentationVersion")) {
            profile.put("javaInstrumentationVersion", "2.32.0");
        }
        if (!profile.hasNonNull("dotnetInstrumentationVersion")) {
            profile.put("dotnetInstrumentationVersion", "1.17.0");
        }

        ObjectNode apps = profile.has("applications") && profile.get("applications").isObject()
                ? (ObjectNode) profile.get("applications")
                : profile.putObject("applications");

        if (apps.isEmpty()) {
            Set<String> sNames = new LinkedHashSet<>(serviceMappings.keySet());
            if (sNames.isEmpty()) {
                try {
                    PreflightCheckResponseDTO preflight = runComposePreflight(snapshot.getId());
                    if (preflight.getDetectedServices() != null) {
                        sNames.addAll(preflight.getDetectedServices());
                    }
                } catch (Exception ignored) {}
            }
            if (sNames.isEmpty()) {
                sNames.add("gateway");
            }
            for (String sName : sNames) {
                ObjectNode appNode = apps.putObject(sName);
                boolean isDotnet = false;
                String elId = serviceMappings.get(sName);
                if (elId != null) {
                    try {
                        var el = modelElementRepository.findById(UUID.fromString(elId)).orElse(null);
                        if (el != null && el.getLanguageStack() != null &&
                                (el.getLanguageStack().toLowerCase().contains("csharp") || el.getLanguageStack().toLowerCase().contains("dotnet"))) {
                            isDotnet = true;
                        }
                    } catch (Exception ignored) {}
                }
                appNode.put("runtime", isDotnet ? "dotnet" : "java");
                appNode.put("containerPort", 8080);
                appNode.put("readinessPath", "/health");
            }
        }

        // Tự động dựng scenarioNode nếu thiếu hoặc rỗng
        ObjectNode scenarioNode = bounded.has("scenario") && bounded.get("scenario").isObject()
                ? (ObjectNode) bounded.get("scenario")
                : (bounded.has("steps") && bounded.get("steps").isArray() ? bounded : bounded.putObject("scenario"));

        if (!scenarioNode.has("steps") || !scenarioNode.get("steps").isArray() || scenarioNode.get("steps").isEmpty()) {
            ArrayNode stepsArr = scenarioNode.putArray("steps");
            List<String> rawStringSteps = new ArrayList<>();
            if (rawScenarioConfig != null && rawScenarioConfig.has("steps") && rawScenarioConfig.get("steps").isArray()) {
                for (JsonNode sn : rawScenarioConfig.get("steps")) {
                    if (sn.isTextual()) rawStringSteps.add(sn.asText());
                }
            }
            if (!rawStringSteps.isEmpty()) {
                int stepIdx = 1;
                for (String raw : rawStringSteps) {
                    String method = "GET";
                    String path = "/health";
                    int expectedStatus = 200;
                    String targetService = serviceMappings.keySet().stream().findFirst().orElse("gateway");
                    String[] parts = raw.split("->");
                    if (parts.length > 1) {
                        try {
                            expectedStatus = Integer.parseInt(parts[1].trim().replaceAll("[^0-9]", ""));
                        } catch (Exception ignored) {}
                    }
                    String reqPart = parts[0].trim();
                    String[] reqTokens = reqPart.split("\\s+");
                    if (reqTokens.length >= 2) {
                        method = reqTokens[0].toUpperCase();
                        path = reqTokens[1];
                    } else if (reqTokens.length == 1) {
                        path = reqTokens[0];
                    }
                    ObjectNode stepItem = stepsArr.addObject();
                    stepItem.put("id", "step-" + stepIdx++);
                    stepItem.put("service", targetService);
                    stepItem.put("method", method);
                    stepItem.put("path", path);
                    stepItem.put("expectedStatus", expectedStatus);
                }
            } else {
                String firstService = serviceMappings.keySet().stream().findFirst().orElse("gateway");
                ObjectNode step1 = stepsArr.addObject();
                step1.put("id", "step-1");
                step1.put("service", firstService);
                step1.put("method", "GET");
                step1.put("path", "/health");
                step1.put("expectedStatus", 200);
            }
        }
        if (!scenarioNode.has("timeoutSeconds")) {
            scenarioNode.put("timeoutSeconds", 60);
        }

        profileVersionId = CanonicalReceiptDigestUtils.computeDigest(profile);
        scenarioVersionId = CanonicalReceiptDigestUtils.computeDigest(scenarioNode);
        JsonNode redactedConfig = SecretRedactor.redactJson(bounded);

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

        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        accessPolicyService.requireProjectWriteAccess(session.getProject());

        validateAdministrativeLimits(session);
        // [CHẶNG 11]: Kiểm tra preflight (Hỗ trợ fallback từ SERVICE_CONTAINER của Model nếu snapshot không chứa file compose vật lý)
        PreflightCheckResponseDTO preflight = runComposePreflight(session.getSourceSnapshot().getId());
        List<String> serviceNames = preflight.getDetectedServices() != null
                ? new ArrayList<>(preflight.getDetectedServices())
                : new ArrayList<>();

        boolean hasHardSecurityViolation = preflight.getSecurityWarnings() != null
                && preflight.getSecurityWarnings().stream().anyMatch(w ->
                        w.contains("privileged") || w.contains("network_mode") || w.contains("docker.sock") || w.contains("mount"));

        if (!preflight.isCompatible()) {
            if (hasHardSecurityViolation) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Compose preflight rejected: " + preflight.getSecurityWarnings());
            }
            if (serviceNames.isEmpty() && session.getConfirmedServiceMappings() != null && !session.getConfirmedServiceMappings().isEmpty()) {
                serviceNames.addAll(session.getConfirmedServiceMappings().keySet());
            }
            if (serviceNames.isEmpty() && session.getModelVersion() != null) {
                modelElementRepository.findByModelVersionId(session.getModelVersion().getId()).stream()
                        .filter(el -> "SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getName() != null)
                        .map(ModelElement::getName)
                        .forEach(serviceNames::add);
            }
            if (serviceNames.isEmpty() && (runtimeRunnerDispatcher == null || !runtimeRunnerDispatcher.isAllowSimulatedFallback())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Compose preflight rejected: " + preflight.getSecurityWarnings());
            }
        }

        // [CHẶNG 11]: Đặt scenarioStatus = "APPROVED", executionStatus = "READY_FOR_DISPATCH" (không đặt RUNNING ở đây)
        session.setScenarioStatus("APPROVED");
        session.setExecutionStatus("READY_FOR_DISPATCH");
        String overrideYaml = composeOverrideGenerator.generateOverrideYaml(serviceNames);

        RuntimeSession updated = runtimeSessionRepository.save(session);
        log.info("Phiên thực nghiệm ID: {} đã chuyển sang APPROVED / READY_FOR_DISPATCH thành công", sessionId);

        if (runtimeRunnerDispatcher != null && runtimeRunnerDispatcher.isAutoDispatchEnabled()) {
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        runtimeRunnerDispatcher.dispatchSessionAsync(sessionId);
                    }
                });
            } else {
                runtimeRunnerDispatcher.dispatchSessionAsync(sessionId);
            }
        }

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

        runnerServiceAuthGuard.requireRunnerService();

        String resourceProject = request.getResourceProject();
        if (resourceProject == null || !RESOURCE_PROJECT_PATTERN.matcher(resourceProject).matches()
                || !resourceProject.equalsIgnoreCase(session.getResourceProject())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "ResourceProject không hợp lệ hoặc không khớp với phiên đã cấp phát: " + resourceProject);
        }

        if (!sessionId.equals(request.getSessionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Lifecycle session scope mismatch");
        }
        String stage = request.getStage();
        if (!"ALLOCATED".equals(stage) && !"RUNNING".equals(stage)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Invalid lifecycle stage");
        }
        String current = session.getExecutionStatus();
        if (session.getCancelRequestedAt() != null || session.getRunnerReceiptJson() != null ||
                session.getCompletedAt() != null) {
            throw new BusinessException(ErrorCode.CONFLICT, "Session cannot accept lifecycle events after cancellation/completion");
        }
        boolean duplicate = stage.equals(current);
        if (!duplicate && !("ALLOCATED".equals(stage) && "READY_FOR_DISPATCH".equals(current)) &&
                !("RUNNING".equals(stage) && "ALLOCATED".equals(current))) {
            throw new BusinessException(ErrorCode.CONFLICT, "Out-of-order lifecycle transition");
        }
        OffsetDateTime observedAt = request.getObservedAt() != null ? request.getObservedAt() : OffsetDateTime.now();

        if (!duplicate && "ALLOCATED".equalsIgnoreCase(stage)) {
            session.setExecutionStatus("ALLOCATED");
            session.setAllocatedAt(observedAt);
        } else if (!duplicate && "RUNNING".equalsIgnoreCase(stage)) {
            session.setScenarioStatus("RUNNING");
            session.setExecutionStatus("RUNNING");
            session.setStartedAt(observedAt);
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

        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
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
        validateAdministrativeLimits(session);

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
                                    composeYaml = new String(readBounded(is), StandardCharsets.UTF_8);
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
                .map(this::toSessionResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public RuntimeSessionResponseDTO getSessionById(UUID sessionId) {
        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));
        accessPolicyService.requireProjectReadAccess(session.getProject());
        return toSessionResponse(session);
    }

    private RuntimeSessionResponseDTO toSessionResponse(RuntimeSession session) {
        if (session == null) {
            return null;
        }
        UUID enrichedId = null;
        if (session.getId() != null && modelVersionRepository != null) {
            enrichedId = modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(session.getId())
                    .map(com.mavis.common.entity.ModelVersion::getId)
                    .orElse(null);
        }
        return RuntimeSessionResponseDTO.fromEntity(session, null, enrichedId);
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
    private void validateAdministrativeLimits(RuntimeSession session) {
        settings.requireIntegration("otel-collector");
        var limit=settings.requireProfile(session.getProfileName()==null?"SPRING_BOOT_DOTNET_COMPOSE_V1":session.getProfileName());
        var pinnedProfile=session.getScenarioConfig()==null?objectMapper.createObjectNode():session.getScenarioConfig().path("profile");
        if(pinnedProfile.path("memoryMiB").asInt(256)>limit.memoryMiB() || pinnedProfile.path("cpus").asDouble(1)>limit.cpus() || pinnedProfile.path("timeoutSeconds").asInt(120)>limit.timeoutSeconds())
            throw new BusinessException(ErrorCode.CONFLICT,"Pinned profile exceeds current administrative limits; create a new session");
    }
    private static byte[] readBounded(InputStream input) throws java.io.IOException {
        byte[] bytes=input.readNBytes(1_048_577);
        if(bytes.length>1_048_576)throw new java.io.IOException("Compose file exceeds 1 MiB");
        return bytes;
    }

    @Override
    @Transactional(readOnly = true)
    public RuntimeProjectConfigDTO getProjectRuntimeConfig(UUID projectId) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));

        accessPolicyService.requireProjectReadAccess(project);

        Optional<SourceSnapshot> latestSnapshotOpt = sourceSnapshotRepository.findFirstByProjectIdOrderByCreatedAtDesc(projectId);
        Optional<ModelVersion> latestModelOpt = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(projectId);
        List<RuntimeSession> sessions = runtimeSessionRepository.findByProjectIdOrderByCreatedAtDesc(projectId);

        UUID snapshotId = latestSnapshotOpt.map(SourceSnapshot::getId).orElse(null);
        UUID modelVersionId = latestModelOpt.map(ModelVersion::getId).orElse(null);

        PreflightCheckResponseDTO preflight = null;
        if (snapshotId != null) {
            try {
                preflight = runComposePreflight(snapshotId);
            } catch (Exception e) {
                log.warn("Lỗi khi chạy preflight cho snapshot {}: {}", snapshotId, e.getMessage());
            }
        }

        boolean supported = preflight != null && preflight.isCompatible();
        boolean ready = supported && modelVersionId != null;

        Map<String, String> confirmedServiceMappings = new HashMap<>();
        if (modelVersionId != null) {
            List<ModelElement> elements = modelElementRepository.findByModelVersionId(modelVersionId);
            for (ModelElement el : elements) {
                if ("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType()) && el.getName() != null) {
                    confirmedServiceMappings.put(el.getName(), el.getId().toString());
                }
            }
        }

        List<String> prerequisites = new ArrayList<>();
        List<String> detectedServices = new ArrayList<>();
        if (preflight != null) {
            detectedServices.addAll(preflight.getDetectedServices());
            if (!preflight.getSecurityWarnings().isEmpty()) {
                prerequisites.addAll(preflight.getSecurityWarnings());
            } else if (preflight.isCompatible()) {
                prerequisites.add("Detected services: " + (detectedServices.isEmpty() ? "default" : String.join(", ", detectedServices)));
                prerequisites.add("Linux Docker Compose sandbox profile verified");
            } else {
                prerequisites.add("No compatible docker-compose.yml found in the latest snapshot");
            }
        } else {
            prerequisites.add("Chưa có source snapshot với cấu hình docker-compose.yml");
        }

        RuntimeProjectConfigDTO saved = projectConfigs.get(projectId);
        String profileId = saved != null && saved.getProfileId() != null
                ? saved.getProfileId()
                : (preflight != null && preflight.getRecommendedProfile() != null ? preflight.getRecommendedProfile() : "SPRING_BOOT_DOTNET_COMPOSE_V1");

        int revision = saved != null && saved.getRevision() > 0 ? saved.getRevision() : Math.max(1, sessions.size() + 1);

        if (saved != null && saved.getConfirmedServiceMappings() != null && !saved.getConfirmedServiceMappings().isEmpty()) {
            confirmedServiceMappings.putAll(saved.getConfirmedServiceMappings());
        }

        return RuntimeProjectConfigDTO.builder()
                .projectId(projectId)
                .latestSnapshotId(snapshotId)
                .latestModelVersionId(modelVersionId)
                .supported(supported)
                .ready(ready)
                .profileId(profileId)
                .revision(revision)
                .prerequisites(prerequisites)
                .detectedServices(detectedServices)
                .confirmedServiceMappings(confirmedServiceMappings)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public RuntimeProjectConfigDTO updateProjectRuntimeConfig(UUID projectId, RuntimeProjectConfigRequestDTO request) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId));

        accessPolicyService.requireProjectWriteAccess(project);

        RuntimeProjectConfigDTO current = getProjectRuntimeConfig(projectId);
        int nextRevision = request != null && request.getExpectedRevision() != null
                ? request.getExpectedRevision() + 1
                : current.getRevision() + 1;

        String profileId = request != null && request.getProfileId() != null && !request.getProfileId().isBlank()
                ? request.getProfileId()
                : current.getProfileId();

        Map<String, String> mappings = new HashMap<>(current.getConfirmedServiceMappings());
        if (request != null && request.getConfirmedServiceMappings() != null) {
            mappings.putAll(request.getConfirmedServiceMappings());
        }

        RuntimeProjectConfigDTO updated = RuntimeProjectConfigDTO.builder()
                .projectId(projectId)
                .latestSnapshotId(current.getLatestSnapshotId())
                .latestModelVersionId(current.getLatestModelVersionId())
                .supported(current.isSupported())
                .ready(current.isReady())
                .profileId(profileId)
                .revision(nextRevision)
                .prerequisites(current.getPrerequisites())
                .detectedServices(current.getDetectedServices())
                .confirmedServiceMappings(mappings)
                .build();

        projectConfigs.put(projectId, updated);
        log.info("Cập nhật cấu hình runtime thành công cho project {}, revision {}", projectId, nextRevision);
        return updated;
    }

    @Override
    public RuntimeSessionResponseDTO dispatchSession(UUID sessionId) {
        if (runtimeRunnerDispatcher == null) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "RuntimeRunnerDispatcher chưa được nạp");
        }
        return runtimeRunnerDispatcher.dispatchSession(sessionId);
    }
}
