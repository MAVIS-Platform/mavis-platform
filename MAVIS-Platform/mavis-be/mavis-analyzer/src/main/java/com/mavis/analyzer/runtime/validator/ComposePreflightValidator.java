package com.mavis.analyzer.runtime.validator;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DatabaseCheckDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DetectedEndpointDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.RequiredEnvVarDTO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

@Component
@Slf4j
public class ComposePreflightValidator {

    private static final List<String> DANGEROUS_MOUNT_PREFIXES = List.of(
            "/var/run/docker.sock",
            "/etc",
            "/root"
    );

    private static final Pattern ENV_PLACEHOLDER_PATTERN = Pattern.compile("\\$\\{([A-Za-z_][A-Za-z0-9_]*)(?::-?([^}]*))?}");
    private static final Pattern SPRING_MAPPING_PATTERN = Pattern.compile("@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\\s*(?:\\(([^)]*)\\))?");
    private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("\"([^\"]+)\"");
    private static final Pattern DOTNET_ROUTE_ATTR_PATTERN = Pattern.compile("\\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route)\\s*(?:\\(\\s*\"([^\"]*)\"\\s*\\))?\\]");
    private static final Pattern DOTNET_MINIMAL_API_PATTERN = Pattern.compile("\\.Map(Get|Post|Put|Delete|Patch)\\s*\\(\\s*\"([^\"]+)\"");

    public PreflightCheckResponseDTO validate(String yamlContent) {
        List<String> detectedServices = new ArrayList<>();
        List<String> securityWarnings = new ArrayList<>();
        Map<String, Integer> servicePorts = new HashMap<>();
        Map<String, String> serviceStacks = new HashMap<>();
        List<DetectedEndpointDTO> detectedEndpoints = new ArrayList<>();
        List<DatabaseCheckDTO> databaseChecks = new ArrayList<>();
        Map<String, RequiredEnvVarDTO> envVarMap = new LinkedHashMap<>();

        if (yamlContent == null || yamlContent.isBlank()) {
            securityWarnings.add("Nội dung docker-compose rỗng hoặc không tồn tại");
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(detectedServices)
                    .securityWarnings(securityWarnings)
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .servicePorts(servicePorts)
                    .serviceStacks(serviceStacks)
                    .detectedEndpoints(detectedEndpoints)
                    .databaseChecks(databaseChecks)
                    .requiredEnvVars(new ArrayList<>(envVarMap.values()))
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
                        .servicePorts(servicePorts)
                        .serviceStacks(serviceStacks)
                        .detectedEndpoints(detectedEndpoints)
                        .databaseChecks(databaseChecks)
                        .requiredEnvVars(new ArrayList<>(envVarMap.values()))
                        .build();
            }

            Object servicesObj = rootMap.get("services");
            if (servicesObj instanceof Map<?, ?> servicesMap) {
                for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                    String serviceName = String.valueOf(entry.getKey());
                    detectedServices.add(serviceName);

                    if (entry.getValue() instanceof Map<?, ?> serviceConfig) {
                        checkServiceSecurity(serviceName, serviceConfig, securityWarnings);
                        servicePorts.put(serviceName, extractTargetPort(serviceConfig));
                        String stack = extractStack(serviceName, serviceConfig);
                        serviceStacks.put(serviceName, stack);
                        inspectComposeServiceEnvironmentAndDb(serviceName, serviceConfig, databaseChecks, envVarMap);
                    } else {
                        servicePorts.put(serviceName, 8080);
                        serviceStacks.put(serviceName, "java");
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
                .servicePorts(servicePorts)
                .serviceStacks(serviceStacks)
                .detectedEndpoints(detectedEndpoints)
                .databaseChecks(databaseChecks)
                .requiredEnvVars(new ArrayList<>(envVarMap.values()))
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

    public void inspectSnapshotSource(Path storagePath, PreflightCheckResponseDTO dto) {
        if (storagePath == null || dto == null || !Files.exists(storagePath)) {
            return;
        }
        Map<String, RequiredEnvVarDTO> envMap = new LinkedHashMap<>();
        if (dto.getRequiredEnvVars() != null) {
            for (RequiredEnvVarDTO v : dto.getRequiredEnvVars()) {
                envMap.put(v.getName(), v);
            }
        }
        List<DatabaseCheckDTO> dbChecks = dto.getDatabaseChecks() != null ? new ArrayList<>(dto.getDatabaseChecks()) : new ArrayList<>();
        List<DetectedEndpointDTO> endpoints = dto.getDetectedEndpoints() != null ? new ArrayList<>(dto.getDetectedEndpoints()) : new ArrayList<>();
        Set<String> endpointKeys = new HashSet<>();
        for (DetectedEndpointDTO ep : endpoints) {
            endpointKeys.add((ep.getService() + ":" + ep.getMethod() + ":" + ep.getPath()).toLowerCase(Locale.ROOT));
        }

        try {
            if (Files.isRegularFile(storagePath) && storagePath.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".zip")) {
                try (ZipFile zipFile = new ZipFile(storagePath.toFile())) {
                    Enumeration<? extends ZipEntry> entries = zipFile.entries();
                    int inspectedFiles = 0;
                    while (entries.hasMoreElements() && inspectedFiles < 400) {
                        ZipEntry entry = entries.nextElement();
                        if (entry.isDirectory() || entry.getSize() > 512_000) continue;
                        String entryName = entry.getName().replace('\\', '/');
                        if (isIgnoredArchiveEntry(entryName)) continue;
                        if (isInspectableSourceOrConfig(entryName)) {
                            inspectedFiles++;
                            try (InputStream is = zipFile.getInputStream(entry)) {
                                String content = new String(is.readNBytes(256_000), StandardCharsets.UTF_8);
                                inspectFileContent(entryName, content, dto, envMap, dbChecks, endpoints, endpointKeys);
                            }
                        }
                    }
                }
            } else {
                Path dirToScan = Files.isDirectory(storagePath) ? storagePath : storagePath.getParent();
                if (dirToScan != null && Files.isDirectory(dirToScan)) {
                    try (Stream<Path> stream = Files.walk(dirToScan, 6)) {
                        stream.filter(Files::isRegularFile)
                                .filter(p -> !isIgnoredArchiveEntry(dirToScan.relativize(p).toString().replace('\\', '/')))
                                .filter(p -> isInspectableSourceOrConfig(p.getFileName().toString()))
                                .limit(400)
                                .forEach(file -> {
                                    try {
                                        if (Files.size(file) <= 256_000) {
                                            String rel = dirToScan.relativize(file).toString().replace('\\', '/');
                                            String content = Files.readString(file, StandardCharsets.UTF_8);
                                            inspectFileContent(rel, content, dto, envMap, dbChecks, endpoints, endpointKeys);
                                        }
                                    } catch (Exception ignored) {}
                                });
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Không thể quét bổ sung source snapshot tại {}: {}", storagePath, e.getMessage());
        }

        dto.setRequiredEnvVars(new ArrayList<>(envMap.values()));
        dto.setDatabaseChecks(dbChecks);
        dto.setDetectedEndpoints(endpoints);
    }

    private boolean isIgnoredArchiveEntry(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.contains("/node_modules/") || lower.contains("/target/") || lower.contains("/build/")
                || lower.contains("/bin/") || lower.contains("/obj/") || lower.contains("/.git/")
                || lower.contains("/test/") || lower.contains("/tests/");
    }

    private static final Pattern CODE_GETENV_PATTERN = Pattern.compile(
            "(?:System\\.getenv|Environment\\.GetEnvironmentVariable)\\s*\\(\\s*\"([A-Za-z_][A-Za-z0-9_]*)\"\\s*\\)");

    private boolean isInspectableSourceOrConfig(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        return lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".properties")
                || lower.endsWith(".json") || lower.endsWith(".env") || lower.endsWith(".env.example")
                || lower.endsWith("pom.xml") || lower.endsWith("build.gradle") || lower.endsWith("build.gradle.kts")
                || lower.endsWith(".csproj") || lower.endsWith("directory.packages.props")
                || lower.endsWith(".java") || lower.endsWith(".cs");
    }

    private void inspectFileContent(
            String relativePath,
            String content,
            PreflightCheckResponseDTO dto,
            Map<String, RequiredEnvVarDTO> envMap,
            List<DatabaseCheckDTO> dbChecks,
            List<DetectedEndpointDTO> endpoints,
            Set<String> endpointKeys) {

        String lowerPath = relativePath.toLowerCase(Locale.ROOT);
        String inferredService = inferServiceFromPath(relativePath, dto.getDetectedServices());
        String lowerContent = content.toLowerCase(Locale.ROOT);

        // 0. Quét placeholder ${VAR:default} và System.getenv / Environment.GetEnvironmentVariable
        if (!lowerPath.endsWith(".xml") && !lowerPath.endsWith(".csproj")) {
            Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(content);
            while (m.find()) {
                String varName = m.group(1);
                String defaultVal = m.group(2);
                registerEnvVar(envMap, varName, inferredService, defaultVal, relativePath);
            }
        }
        Matcher envCallMatcher = CODE_GETENV_PATTERN.matcher(content);
        while (envCallMatcher.find()) {
            registerEnvVar(envMap, envCallMatcher.group(1), inferredService, null, relativePath);
        }

        // 1. Config files (.yml, .yaml, .properties, .json, .env)
        if (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml") || lowerPath.endsWith(".properties")
                || lowerPath.endsWith(".json") || lowerPath.endsWith(".env") || lowerPath.endsWith(".env.example")) {

            for (String rawLine : content.split("\r?\n")) {
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) continue;
                String lowerLine = line.toLowerCase(Locale.ROOT);

                if (lowerLine.contains("datasource.url") || lowerLine.contains("jdbc:") || lowerLine.contains("r2dbc:")
                        || lowerLine.contains("connectionstrings") || lowerLine.contains("defaultconnection")
                        || lowerLine.contains("mongodb.uri") || lowerLine.contains("database_url")) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    String dbType = inferDbTypeFromLine(lowerLine);
                    if (lineVars.isEmpty()) {
                        registerEnvVar(envMap, "DB_CONNECTION_STRING", inferredService, null, relativePath);
                        lineVars.add("DB_CONNECTION_STRING");
                    }
                    boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService) && Objects.equals(d.getDbType(), dbType));
                    if (!exists) {
                        dbChecks.add(DatabaseCheckDTO.builder()
                                .service(inferredService)
                                .dbType(dbType)
                                .configKey(relativePath)
                                .connectionUrl(sanitizeConnectionPreview(line))
                                .requiredEnvVars(lineVars)
                                .status("REQUIRES_ENV_OR_SECRET")
                                .build());
                    }
                }
                if (lowerLine.contains("jwt.secret") || lowerLine.contains("jwt_secret")) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    if (lineVars.isEmpty()) {
                        registerEnvVar(envMap, "JWT_SECRET", inferredService, null, relativePath);
                    }
                }
                if (containsAiIndicator(lowerLine)) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    if (lineVars.isEmpty() && envMap.keySet().stream().noneMatch(k -> k.toUpperCase(Locale.ROOT).contains("API_KEY"))) {
                        registerEnvVar(envMap, "API_KEY", inferredService, null, relativePath);
                    }
                }
            }
        }

        // 1B. Phát hiện Database & AI từ build manifest (pom.xml, build.gradle, .csproj) hoặc code (.java, .cs)
        if (lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts")
                || lowerPath.endsWith(".csproj") || lowerPath.endsWith("directory.packages.props")
                || lowerPath.endsWith(".java") || lowerPath.endsWith(".cs")) {

            if (containsDbDependencyOrCode(lowerPath, content, lowerContent)) {
                String dbType = inferDbTypeFromLine(lowerContent);
                if (!envMap.containsKey("DB_CONNECTION_STRING")
                        && envMap.values().stream().noneMatch(v -> "DB_SECRET".equals(v.getCategory()))) {
                    registerEnvVar(envMap, "DB_CONNECTION_STRING", inferredService, null, relativePath);
                }
                boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService));
                if (!exists) {
                    dbChecks.add(DatabaseCheckDTO.builder()
                            .service(inferredService)
                            .dbType(dbType)
                            .configKey(relativePath)
                            .connectionUrl("Detected " + dbType + " integration in " + relativePath)
                            .requiredEnvVars(List.of("DB_CONNECTION_STRING"))
                            .status("DETECTED_IN_SOURCE")
                            .build());
                }
            }

            if (containsAiIndicator(lowerContent)
                    && envMap.keySet().stream().noneMatch(k -> k.toUpperCase(Locale.ROOT).contains("API_KEY"))) {
                registerEnvVar(envMap, "API_KEY", inferredService, null, relativePath);
            }
        }
        // 2. Java Controller endpoints
        if (lowerPath.endsWith(".java") && content.contains("Mapping")) {
            String basePath = "";
            Matcher classMapping = Pattern.compile("@RequestMapping\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?\"([^\"]+)\"").matcher(content);
            if (classMapping.find()) {
                basePath = classMapping.group(1);
            }
            Matcher matcher = SPRING_MAPPING_PATTERN.matcher(content);
            while (matcher.find()) {
                String ann = matcher.group(1);
                String args = matcher.group(2) != null ? matcher.group(2) : "";
                if ("RequestMapping".equals(ann) && args.contains(basePath) && !basePath.isEmpty()) {
                    continue;
                }
                String method = switch (ann) {
                    case "PostMapping" -> "POST";
                    case "PutMapping" -> "PUT";
                    case "DeleteMapping" -> "DELETE";
                    case "PatchMapping" -> "PATCH";
                    default -> "GET";
                };
                String subPath = "";
                Matcher qm = QUOTED_STRING_PATTERN.matcher(args);
                if (qm.find()) {
                    subPath = qm.group(1);
                }
                String fullPath = normalizeEndpointPath(basePath, subPath);
                String key = (inferredService + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(relativePath)
                            .build());
                }
            }
        }

        // 3. C# Controller / Minimal API endpoints
        if (lowerPath.endsWith(".cs")) {
            String baseRoute = "";
            Matcher routeAttr = Pattern.compile("\\[Route\\s*\\(\\s*\"([^\"]+)\"\\s*\\)\\]").matcher(content);
            if (routeAttr.find()) {
                String controllerName = relativePath.substring(relativePath.lastIndexOf('/') + 1).replace("Controller.cs", "").toLowerCase(Locale.ROOT);
                baseRoute = routeAttr.group(1).replace("[controller]", controllerName);
            }
            Matcher attrMatcher = DOTNET_ROUTE_ATTR_PATTERN.matcher(content);
            while (attrMatcher.find()) {
                String verbAttr = attrMatcher.group(1);
                if ("Route".equals(verbAttr)) continue;
                String method = verbAttr.replace("Http", "").toUpperCase(Locale.ROOT);
                String sub = attrMatcher.group(2) != null ? attrMatcher.group(2) : "";
                String fullPath = normalizeEndpointPath(baseRoute, sub);
                String key = (inferredService + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(relativePath)
                            .build());
                }
            }
            Matcher minimalMatcher = DOTNET_MINIMAL_API_PATTERN.matcher(content);
            while (minimalMatcher.find()) {
                String method = minimalMatcher.group(1).toUpperCase(Locale.ROOT);
                String fullPath = normalizeEndpointPath("", minimalMatcher.group(2));
                String key = (inferredService + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(relativePath)
                            .build());
                }
            }
        }
    }

    private void inspectComposeServiceEnvironmentAndDb(
            String serviceName,
            Map<?, ?> serviceConfig,
            List<DatabaseCheckDTO> databaseChecks,
            Map<String, RequiredEnvVarDTO> envVarMap) {

        String lowerName = serviceName.toLowerCase(Locale.ROOT);
        String image = serviceConfig.get("image") != null ? String.valueOf(serviceConfig.get("image")).toLowerCase(Locale.ROOT) : "";

        if (isDatabaseContainer(lowerName, image)) {
            String dbType = inferDbTypeFromLine(lowerName + " " + image);
            databaseChecks.add(DatabaseCheckDTO.builder()
                    .service(serviceName)
                    .dbType(dbType)
                    .configKey("docker-compose.yml:services." + serviceName)
                    .connectionUrl(image.isBlank() ? serviceName : image)
                    .requiredEnvVars(new ArrayList<>())
                    .status("DETECTED_CONTAINER")
                    .build());
        }

        Object envObj = serviceConfig.get("environment");
        if (envObj instanceof Map<?, ?> envMapNode) {
            for (Map.Entry<?, ?> e : envMapNode.entrySet()) {
                String key = String.valueOf(e.getKey()).trim();
                String val = e.getValue() != null ? String.valueOf(e.getValue()).trim() : "";
                processComposeEnvEntry(serviceName, key, val, databaseChecks, envVarMap);
            }
        } else if (envObj instanceof List<?> envList) {
            for (Object item : envList) {
                if (item == null) continue;
                String raw = String.valueOf(item).trim();
                int idx = raw.indexOf('=');
                if (idx > 0) {
                    String key = raw.substring(0, idx).trim();
                    String val = raw.substring(idx + 1).trim();
                    processComposeEnvEntry(serviceName, key, val, databaseChecks, envVarMap);
                } else if (!raw.isEmpty()) {
                    registerEnvVar(envVarMap, raw, serviceName, null, "docker-compose.yml");
                }
            }
        }
    }

    private void processComposeEnvEntry(
            String serviceName,
            String key,
            String val,
            List<DatabaseCheckDTO> databaseChecks,
            Map<String, RequiredEnvVarDTO> envVarMap) {

        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(val);
        List<String> placeholders = new ArrayList<>();
        while (m.find()) {
            String pName = m.group(1);
            String defVal = m.group(2);
            placeholders.add(pName);
            registerEnvVar(envVarMap, pName, serviceName, defVal, "docker-compose.yml");
        }

        String upperKey = key.toUpperCase(Locale.ROOT);
        if (placeholders.isEmpty()) {
            if (classifyEnvCategory(upperKey).contains("SECRET") || val.isBlank()) {
                registerEnvVar(envVarMap, key, serviceName, val.isBlank() ? null : "********", "docker-compose.yml");
            } else if (upperKey.contains("DATASOURCE") || upperKey.contains("DB_") || upperKey.contains("URL") || upperKey.contains("HOST") || upperKey.contains("PORT") || upperKey.contains("PROFILE") || upperKey.contains("ASPNETCORE")) {
                registerEnvVar(envVarMap, key, serviceName, val, "docker-compose.yml");
            }
        }

        if (upperKey.contains("DATASOURCE_URL") || upperKey.contains("DATABASE_URL") || upperKey.contains("CONNECTIONSTRINGS") || val.toLowerCase(Locale.ROOT).startsWith("jdbc:")) {
            String dbType = inferDbTypeFromLine(val.toLowerCase(Locale.ROOT));
            databaseChecks.add(DatabaseCheckDTO.builder()
                    .service(serviceName)
                    .dbType(dbType)
                    .configKey("docker-compose.yml:" + key)
                    .connectionUrl(sanitizeConnectionPreview(val))
                    .requiredEnvVars(placeholders)
                    .status(placeholders.isEmpty() ? "CONFIGURED_IN_COMPOSE" : "REQUIRES_ENV_OR_SECRET")
                    .build());
        }
    }

    public static void registerEnvVar(
            Map<String, RequiredEnvVarDTO> envVarMap,
            String name,
            String service,
            String defaultValue,
            String source) {
        if (name == null || name.isBlank()) return;
        String cleanName = name.trim();
        if (cleanName.startsWith("OTEL_") || cleanName.startsWith("JAVA_TOOL_OPTIONS")) return;
        String category = classifyEnvCategory(cleanName);
        boolean required = defaultValue == null || defaultValue.isBlank() || "DB_SECRET".equals(category) || "SECRET".equals(category);
        envVarMap.computeIfAbsent(cleanName, k -> RequiredEnvVarDTO.builder()
                .name(cleanName)
                .service(service != null && !service.isBlank() ? service : "global")
                .category(category)
                .defaultValue("DB_SECRET".equals(category) || "SECRET".equals(category) ? null : defaultValue)
                .required(required)
                .source(source)
                .build());
    }

    public static String classifyEnvCategory(String name) {
        String u = name == null ? "" : name.toUpperCase(Locale.ROOT);
        if (u.contains("DB_PASS") || u.contains("DATASOURCE_PASSWORD") || u.contains("POSTGRES_PASSWORD")
                || u.contains("MYSQL_PASSWORD") || u.contains("MYSQL_ROOT_PASSWORD")
                || u.contains("MONGO_INITDB_ROOT_PASSWORD") || u.contains("REDIS_PASSWORD")
                || u.contains("CONNECTIONSTRING") || u.contains("CONNECTION_STRING")
                || u.equals("DATABASE_URL") || u.equals("SPRING_DATASOURCE_URL")) {
            return "DB_SECRET";
        }
        if (u.contains("SECRET") || u.contains("PASSWORD") || u.contains("TOKEN") || u.contains("API_KEY") || u.contains("PRIVATE_KEY") || u.contains("CREDENTIAL")) {
            return "SECRET";
        }
        return "ENV";
    }

    private static boolean containsDbDependencyOrCode(String lowerPath, String content, String lowerContent) {
        if (lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts")
                || lowerPath.endsWith(".csproj") || lowerPath.endsWith("directory.packages.props")) {
            return lowerContent.contains("spring-boot-starter-data-jpa")
                    || lowerContent.contains("spring-boot-starter-jdbc")
                    || lowerContent.contains("mybatis")
                    || lowerContent.contains("druid")
                    || lowerContent.contains("mysql-connector")
                    || lowerContent.contains("postgresql")
                    || lowerContent.contains("npgsql")
                    || lowerContent.contains("mssql-jdbc")
                    || lowerContent.contains("sqlclient")
                    || lowerContent.contains("entityframeworkcore")
                    || lowerContent.contains("dapper")
                    || lowerContent.contains("spring-boot-starter-data-mongodb");
        }
        return content.contains("@Entity") || content.contains("@Table") || content.contains("JpaRepository")
                || content.contains("CrudRepository") || content.contains("JdbcTemplate")
                || content.contains("@Mapper") || content.contains("DbContext") || content.contains("SqlConnection");
    }

    public static boolean containsAiIndicator(String lower) {
        if (lower == null || lower.isEmpty()) return false;
        return lower.contains("spring-ai") || lower.contains("langchain4j") || lower.contains("openai")
                || lower.contains("gemini") || lower.contains("generativelanguage") || lower.contains("anthropic")
                || lower.contains("dashscope") || lower.contains("qianwen") || lower.contains("tongyi")
                || lower.contains("semantickernel") || lower.contains("azure.ai.openai")
                || lower.contains("ai.api-key") || lower.contains("api_key") || lower.contains("apikey")
                || lower.contains("chatclient") || lower.contains("chatmodel");
    }
    private static boolean isDatabaseContainer(String lowerName, String lowerImage) {
        return lowerName.equals("db") || lowerName.endsWith("-db") || lowerName.contains("postgres")
                || lowerName.contains("mysql") || lowerName.contains("mariadb") || lowerName.contains("mongo")
                || lowerName.contains("redis") || lowerName.contains("mssql")
                || lowerImage.contains("postgres") || lowerImage.contains("mysql") || lowerImage.contains("mariadb")
                || lowerImage.contains("mongo") || lowerImage.contains("redis") || lowerImage.contains("mssql");
    }

    private static String inferDbTypeFromLine(String lower) {
        if (lower.contains("postgres")) return "PostgreSQL";
        if (lower.contains("mysql")) return "MySQL";
        if (lower.contains("mariadb")) return "MariaDB";
        if (lower.contains("mongo")) return "MongoDB";
        if (lower.contains("redis")) return "Redis";
        if (lower.contains("sqlserver") || lower.contains("mssql")) return "SQL Server";
        if (lower.contains("h2:")) return "H2 In-Memory";
        return "SQL Database";
    }

    private static List<String> extractPlaceholderNames(String text) {
        List<String> list = new ArrayList<>();
        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(text);
        while (m.find()) {
            list.add(m.group(1));
        }
        return list;
    }

    private static String sanitizeConnectionPreview(String raw) {
        if (raw == null) return "";
        String cleaned = raw.replaceAll("(?i)(password|pwd)\\s*[:=]\\s*[^;&\\s\"']+", "$1=***");
        return cleaned.length() > 140 ? cleaned.substring(0, 140) + "..." : cleaned;
    }

    private static String inferServiceFromPath(String relativePath, List<String> detectedServices) {
        String norm = relativePath.replace('\\', '/').toLowerCase(Locale.ROOT);
        if (detectedServices != null) {
            for (String svc : detectedServices) {
                if (norm.contains(svc.toLowerCase(Locale.ROOT))) {
                    return svc;
                }
            }
        }
        String[] parts = relativePath.replace('\\', '/').split("/");
        for (String part : parts) {
            if (!part.isBlank() && !part.equalsIgnoreCase("src") && !part.equalsIgnoreCase("main")
                    && !part.equalsIgnoreCase("java") && !part.equalsIgnoreCase("resources")
                    && !part.endsWith(".java") && !part.endsWith(".cs") && !part.endsWith(".yml")
                    && !part.endsWith(".yaml") && !part.endsWith(".properties") && !part.endsWith(".json")) {
                return part;
            }
        }
        return detectedServices != null && !detectedServices.isEmpty() ? detectedServices.get(0) : "default-service";
    }

    private static String normalizeEndpointPath(String basePath, String subPath) {
        String b = basePath == null ? "" : basePath.trim();
        String s = subPath == null ? "" : subPath.trim();
        if (!b.isEmpty() && !b.startsWith("/")) b = "/" + b;
        if (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        if (!s.isEmpty() && !s.startsWith("/")) s = "/" + s;
        String combined = (b + s).replaceAll("//+", "/");
        return combined.isEmpty() ? "/" : combined;
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

    private Integer extractTargetPort(Map<?, ?> serviceConfig) {
        Object portsObj = serviceConfig.get("ports");
        if (portsObj instanceof List<?> portList && !portList.isEmpty()) {
            for (Object p : portList) {
                if (p != null) {
                    String str = String.valueOf(p).trim();
                    if (str.contains(":")) {
                        String[] parts = str.split(":");
                        String target = parts[parts.length - 1].replaceAll("[^0-9]", "");
                        if (!target.isBlank()) {
                            try { return Integer.parseInt(target); } catch (Exception ignored) {}
                        }
                    } else {
                        String target = str.replaceAll("[^0-9]", "");
                        if (!target.isBlank()) {
                            try { return Integer.parseInt(target); } catch (Exception ignored) {}
                        }
                    }
                }
            }
        }
        return 8080;
    }

    private String extractStack(String serviceName, Map<?, ?> serviceConfig) {
        String lowerName = serviceName.toLowerCase();
        Object imageObj = serviceConfig.get("image");
        String img = imageObj != null ? String.valueOf(imageObj).toLowerCase() : "";
        Object buildObj = serviceConfig.get("build");
        String build = buildObj != null ? String.valueOf(buildObj).toLowerCase() : "";

        if (lowerName.contains("dotnet") || lowerName.contains("csharp") || img.contains("dotnet") || img.contains("aspnet") || build.contains("dotnet")) {
            return "dotnet";
        }
        return "java";
    }
}
