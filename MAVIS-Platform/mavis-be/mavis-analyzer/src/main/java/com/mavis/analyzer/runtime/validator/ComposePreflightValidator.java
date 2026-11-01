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

    private static final Pattern ENV_PLACEHOLDER_PATTERN = Pattern.compile("\\$\\{([A-Z][A-Z0-9_]+)(?::-?([^}]*))?}");
    private static final Pattern SPRING_MAPPING_PATTERN = Pattern.compile("@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\\s*(?:\\(([^)]*)\\))?");
    private static final Pattern QUOTED_STRING_PATTERN = Pattern.compile("\"([^\"]+)\"");
    private static final Pattern DOTNET_ROUTE_ATTR_PATTERN = Pattern.compile("\\[(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route)\\s*(?:\\(\\s*\"([^\"]*)\"\\s*\\))?\\]");
    private static final Pattern DOTNET_MINIMAL_API_PATTERN = Pattern.compile("\\.Map(Get|Post|Put|Delete|Patch)\\s*\\(\\s*\"([^\"]+)\"");
    private static final Pattern MAP_HEALTH_CHECKS_PATTERN = Pattern.compile("\\.MapHealthChecks\\s*\\(\\s*\"(/[^\"]*)\"");
    private static final Pattern JAVA_HEALTH_ROUTE_PATTERN = Pattern.compile("(?:@(?:GetMapping|RequestMapping)\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?|createContext\\s*\\(\\s*)\"(/health[A-Za-z/]*)\"");
    private static final Pattern HEALTHCHECK_URL_PATTERN = Pattern.compile("https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?(/[^\\s\"'|;&]*)");
    private static final Pattern ASPNETCORE_URL_PORT_PATTERN = Pattern.compile(":(\\d{2,5})");
    private static final Pattern PINNED_IMAGE_PATTERN = Pattern.compile(".+@sha256:[0-9a-fA-F]{64}|sha256:[0-9a-fA-F]{64}");
    private static final Pattern RUNNER_NAME_PATTERN = Pattern.compile("[A-Za-z0-9_-]{1,63}");
    // Mirrors MAVIS.Worker/src/MAVIS.Runner/ComposePreflight.cs so Step 1 reports exactly what the runner will reject.
    private static final Set<String> RUNNER_ROOT_KEYS = Set.of("services", "volumes");
    private static final Set<String> RUNNER_SERVICE_KEYS = Set.of("image", "command", "entrypoint", "environment", "depends_on",
            "healthcheck", "expose", "volumes", "user", "working_dir", "init", "stop_grace_period");
    private static final List<String> INFRASTRUCTURE_KEYWORDS = List.of("kafka", "zookeeper", "rabbitmq", "activemq", "nats",
            "elasticsearch", "opensearch", "kibana", "logstash", "keycloak", "jaeger", "zipkin", "prometheus", "grafana",
            "otel-collector", "opentelemetry-collector", "consul", "vault", "minio", "localstack", "mailhog", "mailpit",
            "adminer", "pgadmin", "memcached", "cassandra", "neo4j", "influxdb", "nginx", "traefik", "envoy", "haproxy");
    private static final List<String> DB_PASSWORD_KEYS = List.of("POSTGRES_PASSWORD", "MYSQL_PASSWORD", "MARIADB_PASSWORD",
            "MYSQL_ROOT_PASSWORD", "MARIADB_ROOT_PASSWORD", "MONGO_INITDB_ROOT_PASSWORD", "MSSQL_SA_PASSWORD", "SA_PASSWORD");
    private static final List<String> DB_USER_KEYS = List.of("POSTGRES_USER", "MYSQL_USER", "MARIADB_USER", "MONGO_INITDB_ROOT_USERNAME", "MSSQL_USER");
    private static final List<String> DB_NAME_KEYS = List.of("POSTGRES_DB", "MYSQL_DATABASE", "MARIADB_DATABASE", "MONGO_INITDB_DATABASE");
    private static final List<String> EXTERNAL_SECRET_MARKERS = List.of("OPENAI", "GEMINI", "ANTHROPIC", "CLAUDE", "AZURE", "AWS_",
            "GOOGLE", "GCP", "STRIPE", "PAYPAL", "TWILIO", "SENDGRID", "MAILGUN", "SMTP", "MAIL_", "SLACK", "GITHUB", "DISCORD",
            "FIREBASE", "CLOUDINARY", "S3_", "MAPS", "OAUTH", "CLIENT_SECRET", "API_KEY", "APIKEY", "ACCESS_KEY", "DASHSCOPE",
            "HUGGINGFACE", "DEEPSEEK", "MISTRAL", "COHERE");

    public PreflightCheckResponseDTO validate(String yamlContent) {
        List<String> detectedServices = new ArrayList<>();
        List<String> securityWarnings = new ArrayList<>();
        Map<String, Integer> servicePorts = new HashMap<>();
        Map<String, String> serviceStacks = new HashMap<>();
        List<DetectedEndpointDTO> detectedEndpoints = new ArrayList<>();
        List<DatabaseCheckDTO> databaseChecks = new ArrayList<>();
        Map<String, RequiredEnvVarDTO> envVarMap = new LinkedHashMap<>();
        List<String> runnerIssues = new ArrayList<>();
        List<String> infrastructureServices = new ArrayList<>();
        Map<String, String> healthPaths = new HashMap<>();
        Map<String, String> databaseCredentials = new HashMap<>();

        if (yamlContent == null || yamlContent.isBlank()) {
            securityWarnings.add("Nội dung docker-compose rỗng hoặc không tồn tại");
            runnerIssues.add("No docker-compose.yml content was found; the sandbox runner needs a Compose file");
        } else {
            try {
                LoaderOptions options = new LoaderOptions();
                Yaml yaml = new Yaml(new SafeConstructor(options));
                Object loaded = yaml.load(yamlContent);

                if (!(loaded instanceof Map<?, ?> rootMap)) {
                    securityWarnings.add("Cấu trúc docker-compose không phải là YAML hợp lệ");
                    runnerIssues.add("docker-compose.yml is not a YAML mapping");
                } else {
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
                                String image = serviceConfig.get("image") != null ? String.valueOf(serviceConfig.get("image")) : "";
                                if (isInfrastructureService(serviceName, image)) {
                                    infrastructureServices.add(serviceName);
                                    collectDatabaseCredentials(image, serviceConfig, databaseCredentials);
                                }
                                String healthPath = extractHealthcheckPath(serviceConfig.get("healthcheck"));
                                if (healthPath != null) healthPaths.put(serviceName, healthPath);
                            } else {
                                servicePorts.put(serviceName, 8080);
                                serviceStacks.put(serviceName, "java");
                            }
                        }
                    } else {
                        securityWarnings.add("Không tìm thấy khối 'services:' trong docker-compose.yml");
                    }
                    runnerIssues.addAll(runnerCompatibilityIssues(yamlContent, rootMap));
                }
            } catch (Exception e) {
                log.error("Lỗi khi phân tích cú pháp docker-compose YAML", e);
                securityWarnings.add("Lỗi cú pháp YAML: " + e.getMessage());
                runnerIssues.add("docker-compose.yml could not be parsed");
            }
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
                .runnerIssues(runnerIssues)
                .infrastructureServices(infrastructureServices)
                .serviceHealthPaths(healthPaths)
                .sandboxDatabaseCredentials(databaseCredentials)
                .build();
    }

    public PreflightCheckResponseDTO validate(Path composeFile) {
        if (composeFile == null || !Files.isRegularFile(composeFile)) {
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(Collections.emptyList())
                    .securityWarnings(List.of("Không tìm thấy file docker-compose tại đường dẫn: " + composeFile))
                    .runnerIssues(new ArrayList<>(List.of("No docker-compose.yml was found; the sandbox runner needs a Compose file")))
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
                    .runnerIssues(new ArrayList<>(List.of("docker-compose.yml could not be read")))
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
        Map<String, String> explicitHealth = new HashMap<>();
        Set<String> actuatorServices = new HashSet<>();

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
                                inspectFileContent(entryName, content, dto, envMap, dbChecks, endpoints, endpointKeys, explicitHealth, actuatorServices);
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
                                            inspectFileContent(rel, content, dto, envMap, dbChecks, endpoints, endpointKeys, explicitHealth, actuatorServices);
                                        }
                                    } catch (Exception ignored) {}
                                });
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Không thể quét bổ sung source snapshot tại {}: {}", storagePath, e.getMessage());
        }

        List<String> services = dto.getDetectedServices() != null ? new ArrayList<>(dto.getDetectedServices()) : new ArrayList<>();
        Map<String, Integer> ports = dto.getServicePorts() != null ? new HashMap<>(dto.getServicePorts()) : new HashMap<>();
        Map<String, String> stacks = dto.getServiceStacks() != null ? new HashMap<>(dto.getServiceStacks()) : new HashMap<>();
        if (services.isEmpty() && !endpoints.isEmpty()) {
            for (DetectedEndpointDTO ep : endpoints) {
                String s = cleanServiceCandidate(ep.getService());
                if (!s.isBlank() && s.matches("[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}")
                        && services.stream().noneMatch(x -> x.equalsIgnoreCase(s))
                        && services.size() < 8) {
                    services.add(s);
                    ports.putIfAbsent(s, 8080);
                    stacks.putIfAbsent(s, ep.getSource() != null && ep.getSource().toLowerCase(Locale.ROOT).endsWith(".cs") ? "dotnet" : "java");
                }
            }
            dto.setDetectedServices(services);
            dto.setServicePorts(ports);
            dto.setServiceStacks(stacks);
        }
        Map<String, String> health = new HashMap<>(dto.getServiceHealthPaths() != null ? dto.getServiceHealthPaths() : Map.of());
        Set<String> infra = new HashSet<>(dto.getInfrastructureServices() != null ? dto.getInfrastructureServices() : List.of());
        for (String svc : services) {
            if (infra.contains(svc)) continue;
            health.computeIfAbsent(svc, s -> explicitHealth.getOrDefault(s, actuatorServices.contains(s) ? "/actuator/health" : "/health"));
        }
        dto.setServiceHealthPaths(health);
        pruneSpeculativeConnectionString(envMap, dbChecks);
        dto.setRequiredEnvVars(new ArrayList<>(envMap.values()));
        dto.setDatabaseChecks(dbChecks);
        dto.setDetectedEndpoints(endpoints);
    }

    private boolean isIgnoredArchiveEntry(String path) {
        String lower = path.replace('\\', '/').toLowerCase(Locale.ROOT);
        return lower.contains("/node_modules/") || lower.contains("/target/") || lower.contains("/build/")
                || lower.contains("/bin/") || lower.contains("/obj/") || lower.contains("/.git/")
                || lower.contains("/.github/") || lower.startsWith(".github/")
                || lower.contains("/.mvn/") || lower.startsWith(".mvn/")
                || lower.contains("/.idea/") || lower.contains("/.vscode/")
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
            Set<String> endpointKeys,
            Map<String, String> explicitHealth,
            Set<String> actuatorServices) {

        String cleanRelPath = stripGitHubRootPrefix(relativePath);
        String lowerPath = cleanRelPath.toLowerCase(Locale.ROOT);
        String inferredService = inferServiceFromPath(relativePath, dto.getDetectedServices());
        String lowerContent = content.toLowerCase(Locale.ROOT);

        // 0. Quét placeholder ${VAR:default} và System.getenv / Environment.GetEnvironmentVariable
        if (!lowerPath.endsWith(".xml") && !lowerPath.endsWith(".csproj")) {
            Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(content);
            while (m.find()) {
                String varName = m.group(1);
                String defaultVal = m.group(2);
                registerEnvVar(envMap, varName, inferredService, defaultVal, cleanRelPath);
            }
        }
        Matcher envCallMatcher = CODE_GETENV_PATTERN.matcher(content);
        while (envCallMatcher.find()) {
            registerEnvVar(envMap, envCallMatcher.group(1), inferredService, null, cleanRelPath);
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
                        registerEnvVar(envMap, "DB_CONNECTION_STRING", inferredService, null, cleanRelPath);
                        lineVars.add("DB_CONNECTION_STRING");
                    }
                    boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService) && Objects.equals(d.getDbType(), dbType));
                    if (!exists) {
                        dbChecks.add(DatabaseCheckDTO.builder()
                                .service(inferredService)
                                .dbType(dbType)
                                .configKey(cleanRelPath)
                                .connectionUrl(sanitizeConnectionPreview(line))
                                .requiredEnvVars(lineVars)
                                .status("REQUIRES_ENV_OR_SECRET")
                                .build());
                    }
                }
                if (lowerLine.contains("jwt.secret") || lowerLine.contains("jwt_secret")) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    if (lineVars.isEmpty()) {
                        registerEnvVar(envMap, "JWT_SECRET", inferredService, null, cleanRelPath);
                    }
                }
                if (containsAiIndicator(lowerLine)) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    if (lineVars.isEmpty() && envMap.keySet().stream().noneMatch(k -> k.toUpperCase(Locale.ROOT).contains("API_KEY"))) {
                        registerEnvVar(envMap, "API_KEY", inferredService, null, cleanRelPath);
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
                    registerEnvVar(envMap, "DB_CONNECTION_STRING", inferredService, null, cleanRelPath);
                }
                boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService));
                if (!exists) {
                    dbChecks.add(DatabaseCheckDTO.builder()
                            .service(inferredService)
                            .dbType(dbType)
                            .configKey(cleanRelPath)
                            .connectionUrl("Detected " + dbType + " integration in " + cleanRelPath)
                            .requiredEnvVars(List.of("DB_CONNECTION_STRING"))
                            .status("DETECTED_IN_SOURCE")
                            .build());
                }
            }

            if (containsAiIndicator(lowerContent)
                    && envMap.keySet().stream().noneMatch(k -> k.toUpperCase(Locale.ROOT).contains("API_KEY"))) {
                registerEnvVar(envMap, "API_KEY", inferredService, null, cleanRelPath);
            }
        }
        // 1C. Readiness signals: actuator dependency, explicit /health routes, ASP.NET MapHealthChecks
        if ((lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts"))
                && lowerContent.contains("spring-boot-starter-actuator")) {
            actuatorServices.add(inferredService);
        }
        if (lowerPath.endsWith(".java")) {
            Matcher healthRoute = JAVA_HEALTH_ROUTE_PATTERN.matcher(content);
            if (healthRoute.find()) explicitHealth.putIfAbsent(inferredService, healthRoute.group(1));
        }
        if (lowerPath.endsWith(".cs")) {
            Matcher healthChecks = MAP_HEALTH_CHECKS_PATTERN.matcher(content);
            if (healthChecks.find()) explicitHealth.putIfAbsent(inferredService, healthChecks.group(1));
        }

        // 2. Java Controller endpoints (skip @FeignClient / @HttpExchange client interfaces)
        if (lowerPath.endsWith(".java") && content.contains("Mapping") && !content.contains("@FeignClient") && !content.contains("@HttpExchange")) {
            int classDeclIdx = content.indexOf("class ");
            if (classDeclIdx < 0) classDeclIdx = content.indexOf("interface ");
            String basePath = "";
            Matcher classMapping = Pattern.compile("@RequestMapping\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?\"([^\"]+)\"").matcher(content);
            if (classMapping.find() && (classDeclIdx < 0 || classMapping.start() < classDeclIdx)) {
                basePath = classMapping.group(1);
            }
            Matcher matcher = SPRING_MAPPING_PATTERN.matcher(content);
            while (matcher.find()) {
                String ann = matcher.group(1);
                String args = matcher.group(2) != null ? matcher.group(2) : "";
                if ("RequestMapping".equals(ann)) {
                    if (classDeclIdx > 0 && matcher.start() < classDeclIdx) {
                        continue;
                    }
                    if (!basePath.isEmpty() && args.contains(basePath)) {
                        continue;
                    }
                }
                String method = switch (ann) {
                    case "PostMapping" -> "POST";
                    case "PutMapping" -> "PUT";
                    case "DeleteMapping" -> "DELETE";
                    case "PatchMapping" -> "PATCH";
                    case "RequestMapping" -> {
                        String u = args.toUpperCase(Locale.ROOT);
                        if (u.contains("POST")) yield "POST";
                        if (u.contains("PUT")) yield "PUT";
                        if (u.contains("DELETE")) yield "DELETE";
                        if (u.contains("PATCH")) yield "PATCH";
                        yield "GET";
                    }
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
                            .source(cleanRelPath)
                            .build());
                }
            }
        }

        // 3. C# Controller / Minimal API endpoints
        if (lowerPath.endsWith(".cs")) {
            String baseRoute = "";
            Matcher routeAttr = Pattern.compile("\\[Route\\s*\\(\\s*\"([^\"]+)\"\\s*\\)\\]").matcher(content);
            if (routeAttr.find()) {
                String controllerName = cleanRelPath.substring(cleanRelPath.lastIndexOf('/') + 1).replace("Controller.cs", "").toLowerCase(Locale.ROOT);
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
                            .source(cleanRelPath)
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
                            .source(cleanRelPath)
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
        boolean secret = "DB_SECRET".equals(category) || "SECRET".equals(category);
        boolean hasDefault = defaultValue != null && !defaultValue.isBlank();
        RequiredEnvVarDTO existing = envVarMap.get(cleanName);
        if (existing != null) {
            // A later reference with a default (e.g. ${DB_PASSWORD:postgres}) means no input is needed.
            if (hasDefault && !existing.isDefaultPresent()) {
                existing.setDefaultPresent(true);
                existing.setRequired(false);
                if (!secret && existing.getDefaultValue() == null) existing.setDefaultValue(defaultValue);
            }
            return;
        }
        envVarMap.put(cleanName, RequiredEnvVarDTO.builder()
                .name(cleanName)
                .service(service != null && !service.isBlank() ? service : "global")
                .category(category)
                .defaultValue(secret ? null : defaultValue)
                .required(!hasDefault)
                .source(source)
                .scope(secret ? classifySecretScope(cleanName) : null)
                .defaultPresent(hasDefault)
                .build());
    }

    /** EXTERNAL secrets belong to third-party services (unreachable from the sandbox); everything else is sandbox-internal. */
    public static String classifySecretScope(String name) {
        String u = name == null ? "" : name.toUpperCase(Locale.ROOT);
        return EXTERNAL_SECRET_MARKERS.stream().anyMatch(u::contains) ? "EXTERNAL" : "SANDBOX";
    }

    /** Sandbox secrets that are plain random material (passwords, signing keys), never URLs or connection strings. */
    public static boolean isGeneratableSandboxSecret(String name) {
        String u = name == null ? "" : name.toUpperCase(Locale.ROOT);
        return "SANDBOX".equals(classifySecretScope(u))
                && !(u.contains("CONNECTION") || u.contains("URL") || u.contains("URI") || u.contains("DSN") || u.contains("HOST"));
    }

    /** Reuses a sandbox database container credential for an application variable such as DB_PASSWORD or DB_USERNAME. */
    public static String databaseCredentialFor(String name, Map<String, String> credentials) {
        if (name == null || credentials == null || credentials.isEmpty()) return null;
        String u = name.toUpperCase(Locale.ROOT);
        if (!u.matches(".*(DB|DATASOURCE|DATABASE|POSTGRES|MYSQL|MARIADB|MONGO|SQL|PG).*")) return null;
        List<String> keys = u.contains("PASS") ? DB_PASSWORD_KEYS
                : u.contains("USER") ? DB_USER_KEYS
                : (u.endsWith("_NAME") || u.endsWith("_DB") || u.endsWith("DATABASE")) ? DB_NAME_KEYS
                : List.of();
        // shortcut: with several database containers the first credential wins; extend with per-service matching if needed.
        for (String key : keys) {
            if (credentials.containsKey(key)) return credentials.get(key);
        }
        return null;
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
        if (u.contains("SECRET") || u.contains("PASSWORD") || u.contains("TOKEN") || u.contains("API_KEY") || u.contains("PRIVATE_KEY") || u.endsWith("_KEY") || u.contains("CREDENTIAL")) {
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
    public static boolean isDatabaseContainer(String lowerName, String lowerImage) {
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

    private static final Pattern GITHUB_ZIP_ROOT_PATTERN = Pattern.compile("^(.*)-[0-9a-f]{7,40}$", Pattern.CASE_INSENSITIVE);

    public static String stripGitHubRootPrefix(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) return "";
        String norm = relativePath.replace('\\', '/');
        int slashIdx = norm.indexOf('/');
        if (slashIdx > 0) {
            String firstSeg = norm.substring(0, slashIdx);
            if (GITHUB_ZIP_ROOT_PATTERN.matcher(firstSeg).matches()) {
                return norm.substring(slashIdx + 1);
            }
        }
        return norm;
    }

    public static String cleanServiceCandidate(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String trimmed = raw.trim();
        Matcher m = GITHUB_ZIP_ROOT_PATTERN.matcher(trimmed);
        if (m.matches() && !m.group(1).isBlank()) {
            trimmed = m.group(1);
        }
        trimmed = trimmed.replaceAll("[^a-zA-Z0-9_-]", "-").replaceAll("-+", "-").replaceAll("^-|-$", "");
        if (trimmed.length() > 62) trimmed = trimmed.substring(0, 62);
        return trimmed;
    }

    public static String matchDetectedService(String candidate, List<String> detectedServices) {
        if (candidate == null || candidate.isBlank() || detectedServices == null || detectedServices.isEmpty()) {
            return null;
        }
        String candLower = cleanServiceCandidate(candidate).toLowerCase(Locale.ROOT);
        if (candLower.isBlank()) return null;

        for (String svc : detectedServices) {
            if (svc.equalsIgnoreCase(candLower)) return svc;
        }
        String bestMatch = null;
        for (String svc : detectedServices) {
            String svcLower = svc.toLowerCase(Locale.ROOT);
            if (candLower.endsWith("-" + svcLower)
                    || svcLower.endsWith("-" + candLower)
                    || candLower.startsWith(svcLower + "-")
                    || svcLower.startsWith(candLower + "-")
                    || candLower.contains(svcLower)
                    || svcLower.contains(candLower)) {
                if (bestMatch == null || svc.length() > bestMatch.length()) {
                    bestMatch = svc;
                }
            }
        }
        return bestMatch;
    }

    private static String inferServiceFromPath(String relativePath, List<String> detectedServices) {
        String norm = relativePath.replace('\\', '/');
        String lowerNorm = norm.toLowerCase(Locale.ROOT);
        if (detectedServices != null) {
            for (String svc : detectedServices) {
                String ls = svc.toLowerCase(Locale.ROOT);
                if (lowerNorm.contains("/" + ls + "/") || lowerNorm.startsWith(ls + "/")) {
                    return svc;
                }
            }
        }
        String[] parts = norm.split("/");
        int startIdx = 0;
        if (parts.length > 1 && GITHUB_ZIP_ROOT_PATTERN.matcher(parts[0]).matches()) {
            startIdx = 1;
        }
        for (int i = startIdx; i < parts.length; i++) {
            if ("src".equalsIgnoreCase(parts[i]) && i > startIdx) {
                String moduleCandidate = cleanServiceCandidate(parts[i - 1]);
                if (!moduleCandidate.isBlank()) {
                    String matched = matchDetectedService(moduleCandidate, detectedServices);
                    return matched != null ? matched : moduleCandidate;
                }
            }
        }
        for (int i = startIdx; i < parts.length; i++) {
            String part = parts[i];
            if (!part.isBlank() && !part.equalsIgnoreCase("src") && !part.equalsIgnoreCase("main")
                    && !part.equalsIgnoreCase("java") && !part.equalsIgnoreCase("resources")
                    && !part.equalsIgnoreCase("controllers") && !part.equalsIgnoreCase("controller")
                    && !part.contains(".")) {
                String cleaned = cleanServiceCandidate(part);
                if (!cleaned.isBlank()) {
                    String matched = matchDetectedService(cleaned, detectedServices);
                    return matched != null ? matched : cleaned;
                }
            }
        }
        if (detectedServices != null && !detectedServices.isEmpty()) {
            return detectedServices.get(0);
        }
        if (parts.length > 0 && GITHUB_ZIP_ROOT_PATTERN.matcher(parts[0]).matches()) {
            String repoName = cleanServiceCandidate(parts[0]);
            if (!repoName.isBlank()) return repoName;
        }
        return "default-service";
    }

    private static String normalizeEndpointPath(String basePath, String subPath) {
        String b = basePath == null ? "" : basePath.trim();
        String s = subPath == null ? "" : subPath.trim();
        if (!b.isEmpty() && !b.startsWith("/")) b = "/" + b;
        if (b.endsWith("/")) b = b.substring(0, b.length() - 1);
        if (!s.isEmpty() && !s.startsWith("/")) s = "/" + s;
        String combined = (b + s).replaceAll("//+", "/");
        if (combined.startsWith("/owners/*/")) {
            combined = combined.replace("/owners/*/", "/owners/{ownerId}/");
        }
        if (combined.contains("/*/")) {
            combined = combined.replace("/*/", "/{id}/");
        }
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
        Integer exposed = firstPort(serviceConfig.get("expose"));
        if (exposed != null) return exposed;
        Integer published = firstPort(serviceConfig.get("ports"));
        if (published != null) return published;
        Integer fromEnv = portFromEnvironment(composeEnvironment(serviceConfig.get("environment")));
        return fromEnv != null ? fromEnv : 8080;
    }

    private static Integer firstPort(Object node) {
        if (!(node instanceof List<?> list)) return null;
        for (Object p : list) {
            if (p == null) continue;
            String str = p instanceof Map<?, ?> longSyntax ? String.valueOf(longSyntax.get("target")) : String.valueOf(p).trim();
            str = str.replaceAll("/(tcp|udp)$", "");
            String[] parts = str.split(":");
            String target = parts[parts.length - 1];
            if (target.contains("-")) target = target.substring(0, target.indexOf('-'));
            target = target.replaceAll("[^0-9]", "");
            try {
                int port = Integer.parseInt(target);
                if (port >= 1 && port <= 65535) return port;
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    private static Integer portFromEnvironment(Map<String, String> env) {
        for (String key : List.of("SERVER_PORT", "PORT", "HTTP_PORT", "ASPNETCORE_HTTP_PORTS")) {
            String value = env.get(key);
            if (value != null && value.trim().matches("\\d{2,5}")) return Integer.parseInt(value.trim());
        }
        String urls = env.get("ASPNETCORE_URLS");
        if (urls != null) {
            Matcher m = ASPNETCORE_URL_PORT_PATTERN.matcher(urls);
            if (m.find()) return Integer.parseInt(m.group(1));
        }
        return null;
    }

    static Map<String, String> composeEnvironment(Object envObj) {
        Map<String, String> env = new LinkedHashMap<>();
        if (envObj instanceof Map<?, ?> map) {
            map.forEach((k, v) -> env.put(String.valueOf(k).trim(), v == null ? "" : String.valueOf(v).trim()));
        } else if (envObj instanceof List<?> list) {
            for (Object item : list) {
                String raw = item == null ? "" : String.valueOf(item).trim();
                int idx = raw.indexOf('=');
                if (idx > 0) env.put(raw.substring(0, idx).trim(), raw.substring(idx + 1).trim());
            }
        }
        return env;
    }

    public static boolean isInfrastructureService(String serviceName, String image) {
        String name = serviceName == null ? "" : serviceName.toLowerCase(Locale.ROOT);
        String img = image == null ? "" : image.toLowerCase(Locale.ROOT);
        if (name.contains("service") || name.endsWith("-api") || name.endsWith("-app")) return false;
        if (isDatabaseContainer(name, img)) return true;
        String repo = img.contains("@") ? img.substring(0, img.indexOf('@')) : img;
        String lastSegment = repo.contains("/") ? repo.substring(repo.lastIndexOf('/') + 1) : repo;
        for (String keyword : INFRASTRUCTURE_KEYWORDS) {
            if (name.equals(keyword) || name.startsWith(keyword + "-") || name.endsWith("-" + keyword) || lastSegment.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    private static void collectDatabaseCredentials(String image, Map<?, ?> serviceConfig, Map<String, String> credentials) {
        Map<String, String> env = composeEnvironment(serviceConfig.get("environment"));
        List<String> keys = new ArrayList<>(DB_PASSWORD_KEYS);
        keys.addAll(DB_USER_KEYS);
        keys.addAll(DB_NAME_KEYS);
        for (String key : keys) {
            String value = env.get(key);
            if (value != null && !value.isBlank() && !value.contains("$")) credentials.putIfAbsent(key, value);
        }
        String img = image == null ? "" : image.toLowerCase(Locale.ROOT);
        // Image defaults used when Compose sets only the password.
        if (img.contains("postgres") && credentials.containsKey("POSTGRES_PASSWORD")) {
            credentials.putIfAbsent("POSTGRES_USER", "postgres");
            credentials.putIfAbsent("POSTGRES_DB", credentials.get("POSTGRES_USER"));
        }
        if ((img.contains("mysql") || img.contains("mariadb")) && !credentials.containsKey("MYSQL_USER") && !credentials.containsKey("MARIADB_USER")
                && (credentials.containsKey("MYSQL_ROOT_PASSWORD") || credentials.containsKey("MARIADB_ROOT_PASSWORD"))) {
            credentials.putIfAbsent("MYSQL_USER", "root");
        }
        if (img.contains("mssql") && (credentials.containsKey("MSSQL_SA_PASSWORD") || credentials.containsKey("SA_PASSWORD"))) {
            credentials.putIfAbsent("MSSQL_USER", "sa");
        }
    }

    private static String extractHealthcheckPath(Object healthcheck) {
        if (!(healthcheck instanceof Map<?, ?> hc)) return null;
        Object test = hc.get("test");
        String text = test instanceof List<?> parts ? String.join(" ", parts.stream().map(String::valueOf).toList()) : String.valueOf(test);
        Matcher m = HEALTHCHECK_URL_PATTERN.matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private static void pruneSpeculativeConnectionString(Map<String, RequiredEnvVarDTO> envMap, List<DatabaseCheckDTO> dbChecks) {
        RequiredEnvVarDTO conn = envMap.get("DB_CONNECTION_STRING");
        if (conn == null) return;
        String src = conn.getSource() == null ? "" : conn.getSource().toLowerCase(Locale.ROOT);
        boolean guessed = src.endsWith("pom.xml") || src.endsWith(".gradle") || src.endsWith(".kts") || src.endsWith(".csproj")
                || src.endsWith(".props") || src.endsWith(".java") || src.endsWith(".cs") || src.equals("static_model");
        boolean realDbVariables = envMap.values().stream().anyMatch(v -> v != conn && (v.getName().toUpperCase(Locale.ROOT).startsWith("DB_")
                || v.getName().toUpperCase(Locale.ROOT).contains("DATASOURCE") || "DB_SECRET".equals(v.getCategory())));
        // The guessed box is never read by the application when it already references its own DB variables.
        if (guessed && realDbVariables) {
            envMap.remove("DB_CONNECTION_STRING");
            for (DatabaseCheckDTO check : dbChecks) {
                if (check.getRequiredEnvVars() != null && check.getRequiredEnvVars().contains("DB_CONNECTION_STRING")) {
                    check.setRequiredEnvVars(new ArrayList<>(check.getRequiredEnvVars().stream().filter(n -> !"DB_CONNECTION_STRING".equals(n)).toList()));
                }
            }
        }
    }

    static List<String> runnerCompatibilityIssues(String yamlContent, Map<?, ?> rootMap) {
        List<String> issues = new ArrayList<>();
        if (yamlContent.length() > 1_048_576) issues.add("Compose file is larger than 1 MiB");
        for (Object key : rootMap.keySet()) {
            if (!RUNNER_ROOT_KEYS.contains(String.valueOf(key))) {
                issues.add("Top-level '" + key + "' is not supported; remove it (the runner creates its own isolated network)");
            }
        }
        String[] lines = yamlContent.split("\\r?\\n");
        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].trim().startsWith("#") && lines[i].contains("$")) {
                issues.add("Line " + (i + 1) + " uses '$' interpolation; use a literal value (changed values and secrets are injected per run)");
                break;
            }
        }
        Set<String> declaredVolumes = new HashSet<>();
        Object volumes = rootMap.get("volumes");
        if (volumes instanceof Map<?, ?> volumeMap) {
            for (Map.Entry<?, ?> v : volumeMap.entrySet()) {
                String name = String.valueOf(v.getKey());
                boolean plain = v.getValue() == null || (v.getValue() instanceof Map<?, ?> m && m.isEmpty());
                if (!RUNNER_NAME_PATTERN.matcher(name).matches() || name.startsWith("mavis-") || !plain) {
                    issues.add("Volume '" + name + "' must be a plain named volume (no driver, external or 'mavis-' prefix)");
                } else {
                    declaredVolumes.add(name);
                }
            }
        } else if (volumes != null) {
            issues.add("Top-level 'volumes' must be a mapping of named volumes");
        }
        if (!(rootMap.get("services") instanceof Map<?, ?> services) || services.isEmpty() || services.size() > 20) {
            issues.add("Compose must declare between 1 and 20 services");
            return issues;
        }
        for (Map.Entry<?, ?> entry : services.entrySet()) {
            String svc = String.valueOf(entry.getKey());
            if (!RUNNER_NAME_PATTERN.matcher(svc).matches()) issues.add("Service name '" + svc + "' must use letters, digits, '-' or '_' (max 63)");
            if (!(entry.getValue() instanceof Map<?, ?> config)) {
                issues.add("Service '" + svc + "' must be a mapping");
                continue;
            }
            for (Object rawKey : config.keySet()) {
                String key = String.valueOf(rawKey);
                if (RUNNER_SERVICE_KEYS.contains(key)) continue;
                issues.add(switch (key) {
                    case "build" -> "Service '" + svc + "' uses build:; the runner only runs published images, so push the image and reference it as name@sha256:<digest>";
                    case "ports" -> "Service '" + svc + "' uses ports:; replace it with expose: (the runner never publishes host ports)";
                    default -> "Service '" + svc + "' option '" + key + "' is not supported by the sandbox runner";
                });
            }
            Object image = config.get("image");
            if (image == null) {
                if (!config.containsKey("build")) issues.add("Service '" + svc + "' has no image");
            } else if (!String.valueOf(image).contains("$") && !PINNED_IMAGE_PATTERN.matcher(String.valueOf(image)).matches()) {
                issues.add("Service '" + svc + "' image '" + image + "' must be pinned by digest (e.g. " + String.valueOf(image).split(":")[0] + "@sha256:<64 hex>)");
            }
            Object environment = config.get("environment");
            if (environment != null && !(environment instanceof Map<?, ?>)) {
                issues.add("Service '" + svc + "' environment must use the 'KEY: value' map form, not a list");
            } else if (environment instanceof Map<?, ?> envMap && envMap.values().stream().anyMatch(Objects::isNull)) {
                issues.add("Service '" + svc + "' has environment variables without a value");
            }
            Object mounts = config.get("volumes");
            if (mounts != null) {
                boolean ok = mounts instanceof List<?> list && list.stream().allMatch(m -> m instanceof Map<?, ?> mount
                        && "volume".equals(String.valueOf(mount.get("type")))
                        && declaredVolumes.contains(String.valueOf(mount.get("source")))
                        && String.valueOf(mount.get("target")).startsWith("/")
                        && !String.valueOf(mount.get("target")).toLowerCase(Locale.ROOT).contains("docker.sock")
                        && Set.of("type", "source", "target", "read_only").containsAll(mount.keySet().stream().map(String::valueOf).toList()));
                if (!ok) issues.add("Service '" + svc + "' mounts a host path or short-form volume; only long-form named volumes are allowed");
            }
        }
        return issues;
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
