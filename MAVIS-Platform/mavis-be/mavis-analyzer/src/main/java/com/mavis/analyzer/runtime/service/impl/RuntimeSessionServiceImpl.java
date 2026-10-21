package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.RuntimeSessionCreateRequest;
import com.mavis.analyzer.runtime.dto.RuntimeSessionResponseDTO;
import com.mavis.analyzer.runtime.generator.ComposeOverrideGenerator;
import com.mavis.analyzer.runtime.service.RuntimeSessionService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.RuntimeSession;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Service
@RequiredArgsConstructor
@Slf4j
public class RuntimeSessionServiceImpl implements RuntimeSessionService {

    private final RuntimeSessionRepository runtimeSessionRepository;
    private final ProjectRepository projectRepository;
    private final SourceSnapshotRepository sourceSnapshotRepository;
    private final UserRepository userRepository;
    private final ComposePreflightValidator composePreflightValidator;
    private final ComposeOverrideGenerator composeOverrideGenerator;

    @Override
    @Transactional(readOnly = true)
    public PreflightCheckResponseDTO runComposePreflight(UUID snapshotId) {
        log.info("Chạy Compose Preflight Check cho snapshotId: {}", snapshotId);

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(snapshotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy snapshot với ID: " + snapshotId));

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

        SourceSnapshot snapshot = sourceSnapshotRepository.findById(request.getSourceSnapshotId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy snapshot với ID: " + request.getSourceSnapshotId()));

        User triggeredBy = null;
        if (request.getTriggeredById() != null) {
            triggeredBy = userRepository.findById(request.getTriggeredById()).orElse(null);
        }

        // [BẢO MẬT & BR-41..45]: Khử toàn bộ thông tin nhạy cảm (Secret Redaction) trước khi lưu vào DB
        JsonNode redactedConfig = SecretRedactor.redactJson(request.getScenarioConfig());

        RuntimeSession session = RuntimeSession.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .triggeredBy(triggeredBy)
                .profileName(request.getProfileName() != null && !request.getProfileName().isBlank()
                        ? request.getProfileName()
                        : "SPRING_BOOT_DOTNET_COMPOSE_V1")
                .scenarioName(request.getScenarioName())
                .scenarioConfig(redactedConfig)
                .scenarioStatus("PENDING")
                .traceStatus("NONE")
                .build();

        RuntimeSession saved = runtimeSessionRepository.save(session);
        log.info("Đã tạo RuntimeSession thành công với ID: {}, status: PENDING", saved.getId());

        return RuntimeSessionResponseDTO.fromEntity(saved);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO approveAndStartSession(UUID sessionId) {
        log.info("Phê duyệt và khởi chạy RuntimeSession ID: {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        // [BR-41..BR-45]: Phải qua bước approve và chỉ được duyệt khi đang ở trạng thái PENDING (hoặc APPROVED)
        String currentStatus = session.getScenarioStatus();
        if (!"PENDING".equalsIgnoreCase(currentStatus) && !"APPROVED".equalsIgnoreCase(currentStatus)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST,
                    "Không thể khởi chạy phiên thực nghiệm ở trạng thái '" + currentStatus + "'. Phiên chạy phải ở trạng thái PENDING.");
        }

        // Lấy danh sách dịch vụ từ snapshot để sinh file Override
        PreflightCheckResponseDTO preflight = runComposePreflight(session.getSourceSnapshot().getId());
        List<String> serviceNames = preflight.getDetectedServices();

        // Sinh nội dung docker-compose.mavis-override.yml
        String overrideYaml = composeOverrideGenerator.generateOverrideYaml(serviceNames);

        // Cập nhật trạng thái RUNNING và startedAt
        session.setScenarioStatus("RUNNING");
        session.setStartedAt(OffsetDateTime.now());

        RuntimeSession updated = runtimeSessionRepository.save(session);
        log.info("Phiên thực nghiệm ID: {} đã chuyển sang RUNNING thành công kèm file Compose Override", sessionId);

        return RuntimeSessionResponseDTO.fromEntity(updated, overrideYaml);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO stopSession(UUID sessionId) {
        log.info("Dừng phiên thực nghiệm ID: {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        session.setScenarioStatus("CANCELLED");
        session.setCompletedAt(OffsetDateTime.now());

        RuntimeSession updated = runtimeSessionRepository.save(session);
        log.info("Phiên thực nghiệm ID: {} đã chuyển sang trạng thái CANCELLED", sessionId);

        return RuntimeSessionResponseDTO.fromEntity(updated);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RuntimeSessionResponseDTO> getSessionsByProject(UUID projectId) {
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
