package com.mavis.analyzer.detector.config.service.impl;

import com.mavis.analyzer.detector.config.dto.ConfigEvidenceDTO;
import com.mavis.analyzer.detector.config.dto.ConfigTargetUrlDTO;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import com.mavis.analyzer.detector.config.service.SpringConfigDetectorService;
import lombok.AllArgsConstructor;
import lombok.Data;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

@Service
@Slf4j
public class SpringConfigDetectorServiceImpl implements SpringConfigDetectorService {

    private static final Pattern JDBC_URL_PATTERN = Pattern.compile("jdbc:[a-zA-Z0-9_-]+://([^:/]+)(?::(\\d+))?(?:/([^?]+))?.*");

    @Override
    public List<DetectedSpringConfigDTO> detectConfigs(String rootPathStr) {
        if (rootPathStr == null || rootPathStr.isBlank()) {
            return Collections.emptyList();
        }

        Path rootPath = Paths.get(rootPathStr);
        if (!Files.exists(rootPath) || !Files.isDirectory(rootPath)) {
            log.warn("Đường dẫn không tồn tại hoặc không phải là thư mục: {}", rootPathStr);
            return Collections.emptyList();
        }

        List<Path> configFiles = findConfigFiles(rootPath);
        log.info("Tìm thấy {} file cấu hình Spring trong {}", configFiles.size(), rootPathStr);

        List<DetectedSpringConfigDTO> results = new ArrayList<>();
        for (Path configFile : configFiles) {
            try {
                DetectedSpringConfigDTO dto = parseConfigFile(configFile, rootPath);
                if (dto != null) {
                    results.add(dto);
                }
            } catch (Exception e) {
                log.error("Lỗi khi phân tích file cấu hình: {}", configFile, e);
            }
        }

        return results;
    }

    private List<Path> findConfigFiles(Path rootPath) {
        List<Path> configFiles = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(rootPath)) {
            stream.filter(Files::isRegularFile)
                    .filter(p -> !isIgnoredPath(p))
                    .filter(this::isSpringConfigFile)
                    .forEach(configFiles::add);
        } catch (IOException e) {
            log.error("Lỗi khi duyệt thư mục tìm file cấu hình trong {}", rootPath, e);
        }
        return configFiles;
    }

    public static boolean isIgnoredPath(Path path) {
        String normalized = path.toString().replace('\\', '/').toLowerCase();
        return normalized.contains("/test/")
                || normalized.contains("/target/")
                || normalized.contains("/build/")
                || normalized.contains("/.git/")
                || normalized.endsWith("/test")
                || normalized.endsWith("/target")
                || normalized.endsWith("/build");
    }

    private boolean isSpringConfigFile(Path path) {
        String fileName = path.getFileName().toString().toLowerCase();
        boolean resourceConfig = path.toString().replace('\\', '/').contains("/src/main/resources/");
        return (fileName.startsWith("application") || fileName.startsWith("bootstrap") || resourceConfig)
                && (fileName.endsWith(".yml") || fileName.endsWith(".yaml") || fileName.endsWith(".properties"));
    }

    private DetectedSpringConfigDTO parseConfigFile(Path configFile, Path rootPath) throws IOException {
        String fileName = configFile.getFileName().toString().toLowerCase();
        List<RawProperty> properties;

        if (fileName.endsWith(".properties")) {
            properties = parsePropertiesFile(configFile);
        } else {
            properties = parseYamlFile(configFile);
        }

        if (properties.isEmpty()) {
            return null;
        }

        DetectedSpringConfigDTO dto = DetectedSpringConfigDTO.builder()
                .configFilePath(configFile.toAbsolutePath().toString())
                .build();

        String inferredServiceName = inferServiceNameFromPath(configFile, rootPath);
        boolean namedConfig = !fileName.startsWith("application") && !fileName.startsWith("bootstrap");
        if (namedConfig) {
            inferredServiceName = fileName.replaceFirst("\\.(yml|yaml|properties)$", "").replaceFirst("-(docker|dev|prod|production|staging|test|local)$", "");
            dto.setApplicationName(inferredServiceName);
        }
        dto.setServiceName(inferredServiceName);

        for (RawProperty prop : properties) {
            String key = prop.getKey();
            String val = prop.getValue();
            int line = prop.getLineNumber();

            if ("spring.application.name".equalsIgnoreCase(key)) {
                dto.setApplicationName(val);
                if (val != null && !val.isBlank()) {
                    dto.setServiceName(val.trim());
                }
                dto.getEvidences().add(ConfigEvidenceDTO.builder()
                        .configKey(key)
                        .configValue(val)
                        .filePath(configFile.toAbsolutePath().toString())
                        .lineNumber(line)
                        .sourceType("CONFIG_FILE")
                        .build());
            } else if ("server.port".equalsIgnoreCase(key)) {
                try {
                    dto.setServerPort(Integer.parseInt(val.trim()));
                } catch (NumberFormatException ignored) {
                }
                dto.getEvidences().add(ConfigEvidenceDTO.builder()
                        .configKey(key)
                        .configValue(val)
                        .filePath(configFile.toAbsolutePath().toString())
                        .lineNumber(line)
                        .sourceType("CONFIG_FILE")
                        .build());
            } else if ("spring.datasource.url".equalsIgnoreCase(key)) {
                dto.setDatasourceUrl(val);
                dto.setDatasourceLineNumber(line);
                extractDatasourceHostAndDb(val, dto);
                dto.getEvidences().add(ConfigEvidenceDTO.builder()
                        .configKey(key)
                        .configValue(val)
                        .filePath(configFile.toAbsolutePath().toString())
                        .lineNumber(line)
                        .sourceType("CONFIG_FILE")
                        .build());
            } else if (isTargetServiceUrlKey(key)) {
                for (String candidate : val.split(",")) {
                    String target = cleanPlaceholder(stripQuotes(candidate.trim()).replaceFirst("^optional:", "").replaceFirst("^configserver:", ""));
                    if (!target.matches("(?i)^(https?|lb)://.+")) continue;
                    String profile = prop.getProfile();
                    if (profile == null && fileName.matches("(application|bootstrap)-.+\\.(yml|yaml|properties)")) profile = fileName.replaceFirst("^(application|bootstrap)-", "").replaceFirst("\\.(yml|yaml|properties)$", "");
                    if (profile == null && namedConfig && fileName.matches(".*-(docker|dev|prod|production|staging|test|local)\\.(yml|yaml|properties)")) profile = fileName.replaceFirst("^.*-(docker|dev|prod|production|staging|test|local)\\.(yml|yaml|properties)$", "$1");
                    dto.getTargetServiceUrls().add(ConfigTargetUrlDTO.builder().configKey(key).targetUrl(target)
                            .relationType(relationTypeForKey(key)).profile(profile).lineNumber(line).build());
                }
                dto.getEvidences().add(ConfigEvidenceDTO.builder()
                        .configKey(key)
                        .configValue(val)
                        .filePath(configFile.toAbsolutePath().toString())
                        .lineNumber(line)
                        .sourceType("CONFIG_FILE")
                        .build());
            }
        }

        String configPath = configFile.toString().replace('\\', '/');
        if (dto.getApplicationName() == null && configPath.matches(".*/(config-service|config-server)/src/main/resources/config/.*")) dto.setServiceName(null);
        return dto.getEvidences().isEmpty() ? null : dto;
    }

    private void extractDatasourceHostAndDb(String jdbcUrl, DetectedSpringConfigDTO dto) {
        if (jdbcUrl == null || jdbcUrl.isBlank()) {
            return;
        }

        String url = cleanPlaceholder(jdbcUrl.trim());
        int doubleSlash = url.indexOf("://");
        if (doubleSlash == -1) {
            return;
        }

        String afterSlash = url.substring(doubleSlash + 3);
        int slashIdx = afterSlash.indexOf('/');
        String hostAndPort;
        String dbPart = "";

        if (slashIdx != -1) {
            hostAndPort = afterSlash.substring(0, slashIdx);
            dbPart = afterSlash.substring(slashIdx + 1);
            int questionIdx = dbPart.indexOf('?');
            if (questionIdx != -1) {
                dbPart = dbPart.substring(0, questionIdx);
            }
        } else {
            hostAndPort = afterSlash;
        }

        String host;
        if (hostAndPort.startsWith("${") && hostAndPort.contains("}")) {
            int closeBrace = hostAndPort.indexOf('}');
            String placeholder = hostAndPort.substring(0, closeBrace + 1);
            host = cleanPlaceholder(placeholder);
        } else {
            int colonIdx = hostAndPort.lastIndexOf(':');
            if (colonIdx != -1) {
                host = hostAndPort.substring(0, colonIdx);
            } else {
                host = hostAndPort;
            }
            host = cleanPlaceholder(host);
        }

        dto.setDatasourceHost(cleanPlaceholder(host));
        dto.setDatasourceDatabase(cleanPlaceholder(dbPart));
    }

    private String cleanPlaceholder(String str) {
        if (str == null) return null;
        str = str.trim();
        if (str.startsWith("${") && str.endsWith("}")) {
            int colonIdx = str.indexOf(':');
            if (colonIdx != -1) {
                return str.substring(colonIdx + 1, str.length() - 1).trim();
            } else {
                return str.substring(2, str.length() - 1).trim();
            }
        }
        return str;
    }

    private boolean isTargetServiceUrlKey(String key) {
        if (key == null) return false;
        String lower = key.toLowerCase();
        if (lower.equals("spring.datasource.url")) {
            return false;
        }
        return lower.equals("spring.config.import") || lower.equals("spring.cloud.config.uri")
                || lower.startsWith("eureka.client.serviceurl.") || lower.startsWith("eureka.client.service-url.") || lower.startsWith("eureka.client.service_url.") || lower.startsWith("eureka.client.service.url.")
                || (lower.equals("management.zipkin.tracing.endpoint") || lower.equals("management.otlp.tracing.endpoint")) || lower.equals("spring.zipkin.base-url")
                || (lower.contains(".gateway.") && (lower.contains(".routes.") || lower.contains(".routes[")) && lower.endsWith(".uri"))
                || lower.endsWith(".url")
                || lower.endsWith("-url")
                || lower.endsWith("_url")
                || lower.endsWith(".service-url")
                || lower.endsWith("-service-url")
                || lower.endsWith(".service_url")
                || lower.endsWith("-service_url")
                || lower.contains(".service-url.")
                || lower.contains(".url.");
    }

    public static String relationTypeForKey(String key) {
        String lower = key == null ? "" : key.toLowerCase(java.util.Locale.ROOT);
        if (lower.equals("spring.config.import") || lower.equals("spring.cloud.config.uri")) return "CONFIGURATION_DEPENDENCY";
        if (lower.startsWith("eureka.client.serviceurl.") || lower.startsWith("eureka.client.service-url.") || lower.startsWith("eureka.client.service_url.") || lower.startsWith("eureka.client.service.url.")) return "SERVICE_DISCOVERY";
        if (lower.contains("zipkin") || lower.contains("tracing.endpoint")) return "TRACING_EXPORT";
        if (lower.contains(".gateway.") && (lower.contains(".routes.") || lower.contains(".routes[")) && lower.endsWith(".uri")) return "GATEWAY_ROUTE";
        return "CONFIGURED_ENDPOINT"; // An endpoint setting alone does not prove an HTTP invocation.
    }

    private List<RawProperty> parsePropertiesFile(Path file) throws IOException {
        List<RawProperty> list = new ArrayList<>();
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);

        for (int i = 0; i < lines.size(); i++) {
            int lineNum = i + 1;
            String trimmed = lines.get(i).trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#") || trimmed.startsWith("!")) {
                continue;
            }

            int eqIdx = trimmed.indexOf('=');
            int colonIdx = trimmed.indexOf(':');
            int splitIdx = -1;

            if (eqIdx != -1 && colonIdx != -1) {
                splitIdx = Math.min(eqIdx, colonIdx);
            } else if (eqIdx != -1) {
                splitIdx = eqIdx;
            } else {
                splitIdx = colonIdx;
            }

            if (splitIdx != -1) {
                String k = trimmed.substring(0, splitIdx).trim();
                String v = stripQuotes(trimmed.substring(splitIdx + 1).trim());
                list.add(new RawProperty(k, v, lineNum));
            }
        }

        return list;
    }

    private List<RawProperty> parseYamlFile(Path file) throws IOException {
        List<RawProperty> list = new ArrayList<>();
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);

        List<YamlIndentEntry> stack = new ArrayList<>();
        List<RawProperty> document = new ArrayList<>();

        for (int i = 0; i < lines.size(); i++) {
            int lineNum = i + 1;
            String rawLine = lines.get(i);
            String trimmed = rawLine.trim();

            if (trimmed.equals("---")) {
                appendDocumentProperties(document, list); document.clear(); stack.clear(); continue;
            }
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }

            int indent = countLeadingSpaces(rawLine);

            // Pop stack entries with indent >= currentIndent
            while (!stack.isEmpty() && (stack.get(stack.size() - 1).indent > indent || (stack.get(stack.size() - 1).indent == indent && !trimmed.startsWith("- ")))) {
                stack.remove(stack.size() - 1);
            }

            if (trimmed.startsWith("- ")) {
                String item = stripQuotes(trimmed.substring(2).trim());
                if (!stack.isEmpty() && item.matches("(?i)^(optional:)?(configserver:)?(https?|lb)://.*")) {
                    String listKey = stack.stream().map(entry -> entry.key).collect(java.util.stream.Collectors.joining("."));
                    document.add(new RawProperty(listKey, item, lineNum)); continue;
                }
                trimmed = item;
            }
            int colonIdx = trimmed.indexOf(':');
            if (colonIdx == -1) {
                continue;
            }

            String key = trimmed.substring(0, colonIdx).trim();
            String val = trimmed.substring(colonIdx + 1).trim();

            // Bỏ comment inline nếu có (nhưng cẩn thận không cắt URL http://...)
            val = stripInlineComment(val);
            val = stripQuotes(val);

            String fullKey;
            if (stack.isEmpty()) {
                fullKey = key;
            } else {
                StringBuilder sb = new StringBuilder();
                for (YamlIndentEntry entry : stack) {
                    sb.append(entry.key).append('.');
                }
                sb.append(key);
                fullKey = sb.toString();
            }

            if (val.isEmpty()) {
                // Node cha (object/map)
                stack.add(new YamlIndentEntry(indent, key));
            } else {
                document.add(new RawProperty(fullKey, val, lineNum));
            }
        }

        appendDocumentProperties(document, list);
        return list;
    }

    private void appendDocumentProperties(List<RawProperty> document, List<RawProperty> output) {
        String profile = document.stream().filter(p -> p.key.equals("spring.config.activate.on-profile") || p.key.equals("spring.profiles"))
                .map(RawProperty::getValue).findFirst().orElse(null);
        for (RawProperty property : document) { property.setProfile(profile); output.add(property); }
    }

    private String stripInlineComment(String val) {
        if (val == null) return "";
        // Nếu chứa '#' mà không nằm trong chuỗi URL
        int hashIdx = val.indexOf('#');
        if (hashIdx != -1) {
            // Kiểm tra xem '#' có khoảng trắng trước nó không (theo chuẩn YAML)
            if (hashIdx > 0 && Character.isWhitespace(val.charAt(hashIdx - 1))) {
                val = val.substring(0, hashIdx).trim();
            }
        }
        return val.trim();
    }

    private String inferServiceNameFromPath(Path configFile, Path rootPath) {
        try {
            Path rel = rootPath.relativize(configFile);
            if (rel.getNameCount() > 1) {
                String topDir = rel.getName(0).toString();
                if (!"src".equalsIgnoreCase(topDir)) {
                    return topDir;
                }
            }
        } catch (Exception ignored) {
        }
        return "default-service";
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

    @Data
    @AllArgsConstructor
    private static class RawProperty {
        private String key;
        private String value;
        private int lineNumber;
        private String profile;
        RawProperty(String key, String value, int lineNumber) { this(key, value, lineNumber, null); }
    }

    @Data
    @AllArgsConstructor
    private static class YamlIndentEntry {
        private int indent;
        private String key;
    }
}
