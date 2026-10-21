package com.mavis.analyzer.runtime.validator;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Component
@Slf4j
public class ComposePreflightValidator {

    private static final List<String> DANGEROUS_MOUNT_PREFIXES = List.of(
            "/var/run/docker.sock",
            "/etc",
            "/root"
    );

    public PreflightCheckResponseDTO validate(String yamlContent) {
        List<String> detectedServices = new ArrayList<>();
        List<String> securityWarnings = new ArrayList<>();

        if (yamlContent == null || yamlContent.isBlank()) {
            securityWarnings.add("Nội dung docker-compose rỗng hoặc không tồn tại");
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(detectedServices)
                    .securityWarnings(securityWarnings)
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .build();
        }

        try {
            LoaderOptions options = new LoaderOptions();
            Yaml yaml = new Yaml(new SafeConstructor(options));
            Object loaded = yaml.load(yamlContent);

            if (!(loaded instanceof Map<?, ?> rootMap)) {
                securityWarnings.add("Cấu trúc docker-compose không phải là YAML hợp lệ");
                return PreflightCheckResponseDTO.builder()
                        .compatible(false)
                        .detectedServices(detectedServices)
                        .securityWarnings(securityWarnings)
                        .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                        .build();
            }

            Object servicesObj = rootMap.get("services");
            if (servicesObj instanceof Map<?, ?> servicesMap) {
                for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                    String serviceName = String.valueOf(entry.getKey());
                    detectedServices.add(serviceName);

                    if (entry.getValue() instanceof Map<?, ?> serviceConfig) {
                        checkServiceSecurity(serviceName, serviceConfig, securityWarnings);
                    }
                }
            } else {
                securityWarnings.add("Không tìm thấy khối 'services:' trong docker-compose.yml");
            }
        } catch (Exception e) {
            log.error("Lỗi khi phân tích cú pháp docker-compose YAML", e);
            securityWarnings.add("Lỗi cú pháp YAML: " + e.getMessage());
        }

        boolean compatible = securityWarnings.isEmpty();

        return PreflightCheckResponseDTO.builder()
                .compatible(compatible)
                .detectedServices(detectedServices)
                .securityWarnings(securityWarnings)
                .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                .build();
    }

    public PreflightCheckResponseDTO validate(Path composeFile) {
        if (composeFile == null || !Files.isRegularFile(composeFile)) {
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(Collections.emptyList())
                    .securityWarnings(List.of("Không tìm thấy file docker-compose tại đường dẫn: " + composeFile))
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .build();
        }

        try {
            String content = Files.readString(composeFile, StandardCharsets.UTF_8);
            return validate(content);
        } catch (IOException e) {
            log.error("Không thể đọc file docker-compose: {}", composeFile, e);
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(Collections.emptyList())
                    .securityWarnings(List.of("Lỗi I/O khi đọc file compose: " + e.getMessage()))
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .build();
        }
    }

    private void checkServiceSecurity(String serviceName, Map<?, ?> serviceConfig, List<String> warnings) {
        // 1. Kiểm tra privileged: true
        Object privilegedObj = serviceConfig.get("privileged");
        if (privilegedObj != null) {
            String privStr = String.valueOf(privilegedObj).trim();
            if ("true".equalsIgnoreCase(privStr) || "yes".equalsIgnoreCase(privStr)) {
                warnings.add("Dịch vụ '" + serviceName + "' kích hoạt cờ nguy hiểm 'privileged: true' (Nguy cơ chiếm quyền root trên máy chủ host)");
            }
        }

        // 2. Kiểm tra network_mode: host
        Object netModeObj = serviceConfig.get("network_mode");
        if (netModeObj != null) {
            String netMode = String.valueOf(netModeObj).trim();
            if ("host".equalsIgnoreCase(netMode)) {
                warnings.add("Dịch vụ '" + serviceName + "' sử dụng 'network_mode: host' (Gây xung đột port và phá vỡ cô lập mạng sandbox)");
            }
        }

        // 3. Kiểm tra dangerous mount trong volumes
        Object volumesObj = serviceConfig.get("volumes");
        if (volumesObj instanceof List<?> volumeList) {
            for (Object volObj : volumeList) {
                String hostPath = extractHostPath(volObj);
                if (hostPath != null) {
                    for (String dangerousPrefix : DANGEROUS_MOUNT_PREFIXES) {
                        if (hostPath.startsWith(dangerousPrefix) || hostPath.equals(dangerousPrefix)
                                || hostPath.contains("docker.sock")) {
                            warnings.add("Dịch vụ '" + serviceName + "' mount thư mục hệ thống nguy hiểm '" + hostPath
                                    + "' (Nguy cơ thoát quyền container / Docker socket escape)");
                            break;
                        }
                    }
                }
            }
        }
    }

    private String extractHostPath(Object volumeEntry) {
        if (volumeEntry == null) return null;
        if (volumeEntry instanceof String volStr) {
            String trimmed = volStr.trim();
            if (trimmed.contains(":")) {
                return trimmed.substring(0, trimmed.indexOf(":")).trim();
            }
            return trimmed;
        } else if (volumeEntry instanceof Map<?, ?> volMap) {
            Object source = volMap.get("source");
            return source != null ? String.valueOf(source).trim() : null;
        }
        return null;
    }
}
