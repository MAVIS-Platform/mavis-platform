package com.mavis.analyzer.detector.docker;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Component
@Slf4j
public class DockerDetector {

    private static final Pattern SERVICE_KEY_PATTERN = Pattern.compile("^(\\s*)([a-zA-Z0-9._-]+):\\s*(#.*)?$");

    public List<String> detectServices(String extractedPath) {
        if (extractedPath == null || extractedPath.isBlank()) {
            return Collections.emptyList();
        }

        Path rootPath = Paths.get(extractedPath);
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
            log.warn("Thư mục giải nén không tồn tại hoặc không phải là thư mục: {}", extractedPath);
            return Collections.emptyList();
        }

        Optional<Path> composeFileOpt = findComposeFile(rootPath);
        if (composeFileOpt.isEmpty()) {
            log.info("Không tìm thấy docker-compose.yml hoặc docker-compose.yaml trong {}", extractedPath);
            return Collections.emptyList();
        }

        Path composeFile = composeFileOpt.get();
        log.info("Tìm thấy file Docker Compose tại: {}", composeFile);

        return parseServices(composeFile);
    }

    private Optional<Path> findComposeFile(Path rootPath) {
        Path directYml = rootPath.resolve("docker-compose.yml");
        if (Files.isRegularFile(directYml)) {
            return Optional.of(directYml);
        }
        Path directYaml = rootPath.resolve("docker-compose.yaml");
        if (Files.isRegularFile(directYaml)) {
            return Optional.of(directYaml);
        }

        try (Stream<Path> stream = Files.walk(rootPath, 3)) {
            return stream
                    .filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString();
                        return "docker-compose.yml".equalsIgnoreCase(name) || "docker-compose.yaml".equalsIgnoreCase(name);
                    })
                    .findFirst();
        } catch (IOException e) {
            log.error("Lỗi khi tìm kiếm file docker-compose trong {}", rootPath, e);
            return Optional.empty();
        }
    }

    private List<String> parseServices(Path composeFile) {
        List<String> services = new ArrayList<>();
        try {
            List<String> lines = Files.readAllLines(composeFile, StandardCharsets.UTF_8);
            boolean inServices = false;
            int serviceIndent = -1;

            for (String line : lines) {
                String trimmed = line.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }

                if (!inServices) {
                    if (trimmed.equals("services:") || trimmed.startsWith("services:")) {
                        inServices = true;
                    }
                    continue;
                }

                // Nếu gặp key cấp cao mới (không thụt dòng), thoát khỏi khối services
                if (!line.startsWith(" ") && !line.startsWith("\t")) {
                    break;
                }

                Matcher matcher = SERVICE_KEY_PATTERN.matcher(line);
                if (matcher.matches()) {
                    String indent = matcher.group(1);
                    int indentLen = indent.length();

                    if (serviceIndent == -1) {
                        serviceIndent = indentLen;
                    }

                    if (indentLen == serviceIndent) {
                        String serviceName = matcher.group(2);
                        services.add(serviceName);
                    }
                }
            }
        } catch (IOException e) {
            log.error("Lỗi khi đọc file docker-compose tại {}", composeFile, e);
        }

        return services;
    }
}
