package com.mavis.analyzer.detector.docker.service.impl;

import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.dto.DockerDependencyDTO;
import com.mavis.analyzer.detector.docker.service.DockerDetectorService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

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

@Service
@Slf4j
public class DockerDetectorServiceImpl implements DockerDetectorService {

    private static final Pattern SERVICE_KEY_PATTERN = Pattern.compile("^(\\s*)([a-zA-Z0-9._-]+):\\s*(#.*)?$");

    @Override
    public List<DetectedContainerDTO> detectContainers(String extractedPath) {
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

        return parseContainers(composeFile);
    }

    @Override
    public List<String> detectServices(String extractedPath) {
        List<DetectedContainerDTO> containers = detectContainers(extractedPath);
        return containers.stream()
                .map(DetectedContainerDTO::getServiceName)
                .toList();
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

        try (Stream<Path> stream = Files.walk(rootPath, 4)) {
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

    private List<DetectedContainerDTO> parseContainers(Path composeFile) {
        List<DetectedContainerDTO> containers = new ArrayList<>();
        try {
            List<String> lines = Files.readAllLines(composeFile, StandardCharsets.UTF_8);
            boolean inServices = false;
            int serviceIndent = -1;
            DetectedContainerDTO currentContainer = null;
            String currentSection = null;
            int currentSectionIndent = -1;

            for (int i = 0; i < lines.size(); i++) {
                int lineNum = i + 1;
                String rawLine = lines.get(i);
                String trimmed = rawLine.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }

                int indent = countLeadingSpaces(rawLine);

                if (!inServices) {
                    if (trimmed.equals("services:") || trimmed.startsWith("services:")) {
                        inServices = true;
                    }
                    continue;
                }

                // Nếu gặp key cấp 0 (không thụt dòng), thoát khỏi khối services
                if (indent <= 0) {
                    break;
                }

                Matcher serviceMatcher = SERVICE_KEY_PATTERN.matcher(rawLine);
                if (serviceMatcher.matches()) {
                    if (serviceIndent == -1) {
                        serviceIndent = indent;
                    }

                    if (indent == serviceIndent) {
                        if (currentContainer != null) {
                            currentContainer.setElementType(resolveElementType(currentContainer.getImage(), currentContainer.getServiceName()));
                            containers.add(currentContainer);
                        }
                        String sName = serviceMatcher.group(2);
                        currentContainer = DetectedContainerDTO.builder()
                                .serviceName(sName)
                                .lineNumber(lineNum)
                                .composeFilePath(composeFile.toAbsolutePath().toString())
                                .build();
                        currentSection = null;
                        currentSectionIndent = -1;
                        continue;
                    }
                }

                if (currentContainer == null) {
                    continue;
                }

                if (indent > serviceIndent) {
                    if (trimmed.startsWith("image:")) {
                        String imgVal = trimmed.substring("image:".length()).trim();
                        int commentIdx = imgVal.indexOf('#');
                        if (commentIdx != -1) {
                            imgVal = imgVal.substring(0, commentIdx).trim();
                        }
                        currentContainer.setImage(stripQuotes(imgVal));
                        currentSection = null;
                        currentSectionIndent = -1;
                    } else if (trimmed.startsWith("ports:")) {
                        currentSection = "PORTS";
                        currentSectionIndent = indent;
                        String inlineVal = trimmed.substring("ports:".length()).trim();
                        if (inlineVal.startsWith("[") && inlineVal.endsWith("]")) {
                            extractInlineItems(inlineVal, currentContainer.getPorts());
                            currentSection = null;
                        }
                    } else if (trimmed.startsWith("depends_on:")) {
                        currentSection = "DEPENDS_ON";
                        currentSectionIndent = indent;
                        String inlineVal = trimmed.substring("depends_on:".length()).trim();
                        if (inlineVal.startsWith("[") && inlineVal.endsWith("]")) {
                            extractInlineDependsOn(inlineVal, lineNum, currentContainer.getDependsOn());
                            currentSection = null;
                        }
                    } else if (currentSection != null && indent > currentSectionIndent) {
                        if ("PORTS".equals(currentSection)) {
                            if (trimmed.startsWith("-")) {
                                String portVal = stripQuotes(trimmed.substring(1).trim());
                                currentContainer.getPorts().add(portVal);
                            }
                        } else if ("DEPENDS_ON".equals(currentSection)) {
                            if (trimmed.startsWith("-")) {
                                String depName = stripQuotes(trimmed.substring(1).trim());
                                currentContainer.getDependsOn().add(new DockerDependencyDTO(depName, lineNum));
                            } else if (trimmed.endsWith(":")) {
                                String depName = stripQuotes(trimmed.substring(0, trimmed.length() - 1).trim());
                                currentContainer.getDependsOn().add(new DockerDependencyDTO(depName, lineNum));
                            }
                        }
                    } else {
                        currentSection = null;
                        currentSectionIndent = -1;
                    }
                }
            }

            if (currentContainer != null) {
                currentContainer.setElementType(resolveElementType(currentContainer.getImage(), currentContainer.getServiceName()));
                containers.add(currentContainer);
            }
        } catch (IOException e) {
            log.error("Lỗi khi đọc file docker-compose tại {}", composeFile, e);
        }

        return containers;
    }

    public static String resolveElementType(String image, String serviceName) {
        String lowerImage = (image != null ? image.toLowerCase() : "");
        String lowerName = (serviceName != null ? serviceName.toLowerCase() : "");

        // 1. Phân loại DATABASE nếu chứa postgres, mysql, mariadb, mongo, mssql, redis
        if (lowerImage.contains("postgres") || lowerImage.contains("mysql")
                || lowerImage.contains("mariadb") || lowerImage.contains("mongo")
                || lowerImage.contains("mssql") || lowerImage.contains("redis")
                || lowerName.contains("postgres") || lowerName.contains("mysql")
                || lowerName.contains("mariadb") || lowerName.contains("mongo")
                || lowerName.contains("mssql") || lowerName.contains("redis")
                || lowerName.endsWith("-db") || lowerName.endsWith("_db")) {
            return "DATABASE";
        }

        // 2. Phân loại QUEUE_BROKER nếu chứa kafka, rabbitmq, activemq
        if (lowerImage.contains("kafka") || lowerImage.contains("rabbitmq")
                || lowerImage.contains("activemq")
                || lowerName.contains("kafka") || lowerName.contains("rabbitmq")
                || lowerName.contains("activemq")) {
            return "QUEUE_BROKER";
        }

        // 3. Mặc định là SERVICE_CONTAINER
        return "SERVICE_CONTAINER";
    }

    private int countLeadingSpaces(String line) {
        int count = 0;
        for (char c : line.toCharArray()) {
            if (c == ' ') {
                count++;
            } else if (c == '\t') {
                count += 4;
            } else {
                break;
            }
        }
        return count;
    }

    private String stripQuotes(String s) {
        if (s == null) return "";
        s = s.trim();
        if ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'"))) {
            if (s.length() >= 2) {
                return s.substring(1, s.length() - 1).trim();
            }
        }
        return s;
    }

    private void extractInlineItems(String inlineVal, List<String> targetList) {
        String content = inlineVal.substring(1, inlineVal.length() - 1).trim();
        String[] parts = content.split(",");
        for (String part : parts) {
            String val = stripQuotes(part.trim());
            if (!val.isEmpty()) {
                targetList.add(val);
            }
        }
    }

    private void extractInlineDependsOn(String inlineVal, int lineNum, List<DockerDependencyDTO> targetList) {
        String content = inlineVal.substring(1, inlineVal.length() - 1).trim();
        String[] parts = content.split(",");
        for (String part : parts) {
            String val = stripQuotes(part.trim());
            if (!val.isEmpty()) {
                targetList.add(new DockerDependencyDTO(val, lineNum));
            }
        }
    }
}
