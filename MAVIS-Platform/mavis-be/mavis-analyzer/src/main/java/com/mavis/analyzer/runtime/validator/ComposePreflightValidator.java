package com.mavis.analyzer.runtime.validator;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DatabaseCheckDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.DetectedEndpointDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.RequiredEnvVarDTO;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.DumperOptions;
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
    private static final Pattern MAP_HEALTH_CHECKS_PATTERN = Pattern.compile("\\.(?:MapHealthChecks|UseHealthChecks)\\s*\\(\\s*\"(/[^\"]*)\"");
    private static final Pattern JAVA_HEALTH_ROUTE_PATTERN = Pattern.compile("(?:@(?:GetMapping|RequestMapping)\\s*\\(\\s*(?:value\\s*=\\s*|path\\s*=\\s*)?|createContext\\s*\\(\\s*)\"(/health[A-Za-z/]*)\"");
    private static final Pattern EXPRESS_FASTAPI_GIN_ROUTE_PATTERN = Pattern.compile("(?:@?(?:app|router|r|group)\\.(get|post|put|delete|patch|GET|POST|PUT|DELETE|PATCH))\\s*\\(\\s*[\"'](/[^\"']*)[\"']");
    private static final Pattern HEALTHCHECK_URL_PATTERN = Pattern.compile("https?://(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?(/[^\\s\"'|;&]*)");
    private static final Pattern ASPNETCORE_URL_PORT_PATTERN = Pattern.compile(":(\\d{2,5})");
    private static final Pattern PINNED_IMAGE_PATTERN = Pattern.compile(".+@sha256:[0-9a-fA-F]{64}|sha256:[0-9a-fA-F]{64}");
    private static final Pattern RUNNER_NAME_PATTERN = Pattern.compile("[A-Za-z0-9_-]{1,63}");
    private static final Pattern JDBC_HOST_PATTERN = Pattern.compile("(?:jdbc:[a-z0-9]+://|r2dbc:[a-z0-9]+://|mongodb(?:\\+srv)?://|redis://|postgres(?:ql)?://|mysql://)([A-Za-z0-9_.-]+)");
    private static final Pattern KV_HOST_PATTERN = Pattern.compile("(?i)(?:host|server|data source)\\s*=\\s*([A-Za-z0-9_.-]+)");
    private static final Pattern URL_DB_NAME_PATTERN = Pattern.compile("(?:jdbc:[a-z0-9]+://|r2dbc:[a-z0-9]+://|mongodb(?:\\+srv)?://|postgres(?:ql)?://|mysql://)[^/?;\\s]+/([A-Za-z0-9_-]{1,48})");
    private static final Pattern KV_DB_NAME_PATTERN = Pattern.compile("(?i)(?:database|initial catalog)\\s*=\\s*([A-Za-z0-9_-]{1,48})");
    private static final Pattern DOCKERFILE_EXPOSE_PATTERN = Pattern.compile("(?im)^\\s*EXPOSE\\s+(\\d{2,5})(?:/tcp)?\\b");
    private static final Pattern DOCKERFILE_VOLUME_LINE_PATTERN = Pattern.compile("(?im)^\\s*VOLUME\\s+(.+)$");
    private static final Pattern URI_USERINFO_SECRET_PATTERN = Pattern.compile("[a-zA-Z][a-zA-Z0-9+.-]*://[^/\\s]*:[^@/\\s]+@");
    private static final Pattern JAVA_RECORD_PATTERN = Pattern.compile("\\brecord\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:<[^>]+>)?\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)");
    private static final Pattern JAVA_ENUM_PATTERN = Pattern.compile("\\benum\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:implements[^{]+)?\\{\\s*(?:/\\*[\\s\\S]*?\\*/\\s*|//[^\\n]*\\n\\s*)*([A-Z_][A-Z0-9_]*)");
    private static final Pattern JAVA_CLASS_NAME_PATTERN = Pattern.compile("\\bclass\\s+([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern JAVA_FIELD_PATTERN = Pattern.compile("(?m)^[ \\t]*((?:@[A-Za-z0-9_.]+(?:\\([^)\\n]*\\))?[ \\t\\r\\n]*)*)(?:private|protected)[ \\t]+(?!static\\b|final\\b)([A-Za-z_][A-Za-z0-9_<>, ?.\\[\\]]*?)[ \\t]+([a-zA-Z_][A-Za-z0-9_]*)[ \\t]*(?:=[^;\\n]+)?;");
    private static final Pattern JAVA_REQUEST_BODY_PATTERN = Pattern.compile("@RequestBody\\b(?:\\s+@[A-Za-z0-9_.]+(?:\\([^)]*\\))?)*(?:\\s+final)?\\s+([A-Za-z_][A-Za-z0-9_<>, ?.\\[\\]]*)\\s+[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern CSHARP_ENUM_PATTERN = Pattern.compile("\\benum\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?::[^{]+)?\\{\\s*([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern CSHARP_RECORD_PATTERN = Pattern.compile("\\brecord\\s+(?:class\\s+|struct\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)");
    private static final Pattern CSHARP_CLASS_NAME_PATTERN = Pattern.compile("\\bclass\\s+([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern CSHARP_PROP_PATTERN = Pattern.compile("(?m)^[ \\t]*((?:\\[[^\\]\\n]+\\][ \\t\\r\\n]*)*)public[ \\t]+(?!static\\b|const\\b|class\\b|record\\b|interface\\b|enum\\b|override\\b|virtual\\s+ICollection)([A-Za-z_][A-Za-z0-9_<>?.\\[\\]]*)[ \\t]+([A-Za-z_][A-Za-z0-9_]*)[ \\t]*\\{[ \\t]*get;");
    private static final Pattern CSHARP_FROM_BODY_PATTERN = Pattern.compile("\\[FromBody\\]\\s*([A-Za-z_][A-Za-z0-9_<>?.\\[\\]]*)\\s+[A-Za-z_][A-Za-z0-9_]*");
    private static final com.fasterxml.jackson.databind.ObjectMapper DTO_JSON_MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();
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
    private static final List<String> REDIS_PASSWORD_VARS = List.of("REDIS_PASSWORD", "SPRING_DATA_REDIS_PASSWORD", "SPRING_REDIS_PASSWORD");
    private static final List<String> DB_NAME_KEYS = List.of("POSTGRES_DB", "MYSQL_DATABASE", "MARIADB_DATABASE", "MONGO_INITDB_DATABASE");
    private static final List<String> EXTERNAL_SECRET_MARKERS = List.of("OPENAI", "GEMINI", "ANTHROPIC", "CLAUDE", "AZURE", "AWS_",
            "GOOGLE", "GCP", "STRIPE", "PAYPAL", "TWILIO", "SENDGRID", "MAILGUN", "SLACK", "GITHUB", "DISCORD",
            "FIREBASE", "CLOUDINARY", "S3_", "MAPS", "OAUTH", "CLIENT_SECRET", "API_KEY", "APIKEY", "ACCESS_KEY", "DASHSCOPE",
            "HUGGINGFACE", "DEEPSEEK", "MISTRAL", "COHERE");

    private final ImageDigestResolver imageDigestResolver;
    private final java.security.SecureRandom secureRandom = new java.security.SecureRandom();

    public ComposePreflightValidator() {
        this(new ImageDigestResolver());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ComposePreflightValidator(ImageDigestResolver imageDigestResolver) {
        this.imageDigestResolver = imageDigestResolver != null ? imageDigestResolver : new ImageDigestResolver();
    }

    public PreflightCheckResponseDTO validate(String yamlContent) {
        return validate(yamlContent, Map.of(), Map.of());
    }

    public PreflightCheckResponseDTO validate(String yamlContent, Map<String, String> imageOverrides) {
        return validate(yamlContent, imageOverrides, Map.of());
    }

    public PreflightCheckResponseDTO validate(String yamlContent, Map<String, String> imageOverrides, Map<String, String> envFiles) {
        Map<String, String> safeEnvFiles = envFiles != null ? envFiles : Map.of();
        Map<String, String> rootDotEnv = parseDotEnvContent(safeEnvFiles.get(".env"));
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
        Map<String, String> healthConfidence = new HashMap<>();
        Map<String, String> healthReasons = new HashMap<>();
        Map<String, String> databaseCredentials = new HashMap<>();
        Map<String, Map<String, String>> serviceDbCredentials = new LinkedHashMap<>();
        Map<String, List<String>> serviceDependencies = new LinkedHashMap<>();
        Map<String, Map<String, String>> composeEnvAliases = new LinkedHashMap<>();
        Map<String, Map<String, String>> composeEnvTemplates = new LinkedHashMap<>();
        Map<String, Map<String, String>> relocatedComposeSecrets = new LinkedHashMap<>();
        String sandboxComposeYaml = null;
        List<String> sandboxComposeChanges = new ArrayList<>();
        List<String> unresolvableRunnerIssues = new ArrayList<>();

        if (yamlContent == null || yamlContent.isBlank()) {
            securityWarnings.add("Nội dung docker-compose rỗng hoặc không tồn tại");
            runnerIssues.add("No docker-compose.yml content was found; the sandbox runner needs a Compose file");
            unresolvableRunnerIssues.addAll(runnerIssues);
        } else {
            try {
                LoaderOptions options = new LoaderOptions();
                Yaml yaml = new Yaml(new SafeConstructor(options));
                Object loaded = yaml.load(yamlContent);

                if (!(loaded instanceof Map<?, ?> rootMap)) {
                    securityWarnings.add("Cấu trúc docker-compose không phải là YAML hợp lệ");
                    runnerIssues.add("docker-compose.yml is not a YAML mapping");
                    unresolvableRunnerIssues.addAll(runnerIssues);
                } else {
                    Object servicesObj = rootMap.get("services");
                    if (servicesObj instanceof Map<?, ?> servicesMap) {
                        for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                            String serviceName = String.valueOf(entry.getKey());
                            detectedServices.add(serviceName);

                            if (entry.getValue() instanceof Map<?, ?> serviceConfig) {
                                checkServiceSecurity(serviceName, serviceConfig, securityWarnings);
                                servicePorts.put(serviceName, extractTargetPort(serviceConfig, safeEnvFiles, rootDotEnv));
                                String stack = extractStack(serviceName, serviceConfig);
                                serviceStacks.put(serviceName, stack);
                                List<String> deps = extractServiceDependencies(serviceConfig);
                                if (!deps.isEmpty()) serviceDependencies.put(serviceName, deps);
                                inspectComposeServiceEnvironmentAndDb(serviceName, serviceConfig, databaseChecks, envVarMap,
                                        serviceDependencies, composeEnvAliases, composeEnvTemplates, safeEnvFiles, rootDotEnv);
                                String image = serviceConfig.get("image") != null ? String.valueOf(serviceConfig.get("image")) : "";
                                if (isInfrastructureService(serviceName, image)) {
                                    infrastructureServices.add(serviceName);
                                    Map<String, String> svcCreds = new LinkedHashMap<>();
                                    collectDatabaseCredentials(image, serviceConfig, svcCreds, safeEnvFiles, rootDotEnv);
                                    if (!svcCreds.isEmpty()) {
                                        serviceDbCredentials.put(serviceName, svcCreds);
                                        svcCreds.forEach(databaseCredentials::putIfAbsent);
                                    }
                                } else {
                                    String healthPath = extractHealthcheckPath(serviceConfig.get("healthcheck"));
                                    if (healthPath != null) {
                                        healthPaths.put(serviceName, healthPath);
                                        healthConfidence.put(serviceName, "DETECTED");
                                        healthReasons.put(serviceName, "Docker Compose healthcheck");
                                    } else {
                                        healthConfidence.put(serviceName, "ASSUMED");
                                        healthReasons.put(serviceName, "No Compose healthcheck declared");
                                    }
                                }
                            } else {
                                servicePorts.put(serviceName, 8080);
                                serviceStacks.put(serviceName, "java");
                            }
                        }
                    } else {
                        securityWarnings.add("Không tìm thấy khối 'services:' trong docker-compose.yml");
                    }
                    runnerIssues.addAll(runnerCompatibilityIssues(yamlContent, rootMap));
                    if ((!runnerIssues.isEmpty() || needsSandboxRemediation(rootMap, imageOverrides)) && securityWarnings.isEmpty()) {
                        SandboxComposeResult rem = generateSandboxCompose(
                                rootMap,
                                imageOverrides != null ? imageOverrides : Map.of(),
                                imageDigestResolver,
                                safeEnvFiles,
                                Map.of());
                        sandboxComposeYaml = rem.yaml();
                        sandboxComposeChanges.addAll(rem.changes());
                        unresolvableRunnerIssues.addAll(rem.unresolvableIssues());
                        relocatedComposeSecrets.putAll(rem.relocatedSecrets());
                    }
                }
            } catch (Exception e) {
                log.error("Lỗi khi phân tích cú pháp docker-compose YAML", e);
                securityWarnings.add("Lỗi cú pháp YAML: " + e.getMessage());
                runnerIssues.add("docker-compose.yml could not be parsed");
                unresolvableRunnerIssues.addAll(runnerIssues);
            }
        }

        boolean compatible = securityWarnings.isEmpty();

        return PreflightCheckResponseDTO.builder()
                .compatible(compatible)
                .detectedServices(detectedServices)
                .composeServices(new ArrayList<>(detectedServices))
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
                .serviceHealthConfidence(healthConfidence)
                .serviceHealthReasons(healthReasons)
                .sandboxComposeYaml(sandboxComposeYaml)
                .sandboxComposeChanges(sandboxComposeChanges)
                .unresolvableRunnerIssues(unresolvableRunnerIssues)
                .sandboxDatabaseCredentials(databaseCredentials)
                .serviceDatabaseCredentials(serviceDbCredentials)
                .serviceDependencies(serviceDependencies)
                .composeEnvAliases(composeEnvAliases)
                .composeEnvTemplates(composeEnvTemplates)
                .relocatedComposeSecrets(relocatedComposeSecrets)
                .build();
    }

    public PreflightCheckResponseDTO validate(Path composeFile) {
        if (composeFile == null || !Files.isRegularFile(composeFile)) {
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(Collections.emptyList())
                    .securityWarnings(List.of("Không tìm thấy file docker-compose tại đường dẫn: " + composeFile))
                    .runnerIssues(new ArrayList<>(List.of("No docker-compose.yml was found; the sandbox runner needs a Compose file")))
                    .unresolvableRunnerIssues(new ArrayList<>(List.of("No docker-compose.yml was found; the sandbox runner needs a Compose file")))
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .build();
        }

        try {
            String content = Files.readString(composeFile, StandardCharsets.UTF_8);
            Map<String, String> siblingEnvFiles = collectDirectoryEnvFiles(composeFile.getParent());
            return validate(content, Map.of(), siblingEnvFiles);
        } catch (IOException e) {
            log.error("Không thể đọc file docker-compose: {}", composeFile, e);
            return PreflightCheckResponseDTO.builder()
                    .compatible(false)
                    .detectedServices(Collections.emptyList())
                    .securityWarnings(List.of("Lỗi I/O khi đọc file compose: " + e.getMessage()))
                    .runnerIssues(new ArrayList<>(List.of("docker-compose.yml could not be read")))
                    .unresolvableRunnerIssues(new ArrayList<>(List.of("docker-compose.yml could not be read")))
                    .recommendedProfile("SPRING_BOOT_DOTNET_COMPOSE_V1")
                    .build();
        }
    }

    public record SandboxComposeResult(
            String yaml,
            List<String> changes,
            List<String> unresolvableIssues,
            Map<String, Map<String, String>> relocatedSecrets) {
        public SandboxComposeResult(String yaml, List<String> changes, List<String> unresolvableIssues) {
            this(yaml, changes, unresolvableIssues, Map.of());
        }
    }

    private record StatefulInfraSpec(String defaultUser, List<String> writablePaths) {}
    public record DiscoveredDockerfile(String serviceName, String context, String dockerfile) {}

    public SandboxComposeResult remediateCompose(String yamlContent, Map<String, String> imageOverrides) {
        if (yamlContent == null || yamlContent.isBlank()) {
            return new SandboxComposeResult("", List.of(), List.of("No docker-compose.yml content was found"));
        }
        try {
            LoaderOptions options = new LoaderOptions();
            Yaml yaml = new Yaml(new SafeConstructor(options));
            Object loaded = yaml.load(yamlContent);
            if (!(loaded instanceof Map<?, ?> rootMap)) {
                return new SandboxComposeResult("", List.of(), List.of("docker-compose.yml is not a YAML mapping"));
            }
            return generateSandboxCompose(rootMap, imageOverrides != null ? imageOverrides : Map.of(), imageDigestResolver, Map.of(), Map.of());
        } catch (Exception e) {
            return new SandboxComposeResult("", List.of(), List.of("docker-compose.yml could not be parsed"));
        }
    }

    public static SandboxComposeResult generateSandboxCompose(Map<?, ?> rootMap, Map<String, String> imageOverrides) {
        return generateSandboxCompose(rootMap, imageOverrides, new ImageDigestResolver(), Map.of(), Map.of());
    }

    public static SandboxComposeResult generateSandboxCompose(
            Map<?, ?> rootMap,
            Map<String, String> imageOverrides,
            ImageDigestResolver resolver) {
        return generateSandboxCompose(rootMap, imageOverrides, resolver, Map.of(), Map.of());
    }

    @SuppressWarnings("unchecked")
    public static SandboxComposeResult generateSandboxCompose(
            Map<?, ?> rootMap,
            Map<String, String> imageOverrides,
            ImageDigestResolver resolver,
            Map<String, String> envFiles,
            Map<String, List<String>> dockerfileVolumes) {
        List<String> changes = new ArrayList<>();
        Map<String, Object> outRoot = new LinkedHashMap<>();
        Map<String, Map<String, String>> relocatedSecrets = new LinkedHashMap<>();

        for (Object k : rootMap.keySet()) {
            String key = String.valueOf(k);
            if (!RUNNER_ROOT_KEYS.contains(key)) {
                changes.add("Removed unsupported top-level '" + key + "' section");
            }
        }

        Set<String> validVolumes = new LinkedHashSet<>();
        Map<String, Object> outVolumes = new LinkedHashMap<>();
        if (rootMap.get("volumes") instanceof Map<?, ?> volMap) {
            for (Map.Entry<?, ?> v : volMap.entrySet()) {
                String vName = String.valueOf(v.getKey());
                if (RUNNER_NAME_PATTERN.matcher(vName).matches() && !vName.startsWith("mavis-")) {
                    validVolumes.add(vName);
                    outVolumes.put(vName, new LinkedHashMap<>());
                    if (v.getValue() instanceof Map<?, ?> m && !m.isEmpty()) {
                        changes.add("Normalized volume '" + vName + "' to plain sandbox volume");
                    }
                } else {
                    changes.add("Removed unsupported volume '" + vName + "'");
                }
            }
        }

        Map<String, String> safeEnvFiles = envFiles != null ? envFiles : Map.of();
        Map<String, String> rootDotEnv = parseDotEnvContent(safeEnvFiles.get(".env"));
        Map<String, List<String>> safeDockerfileVols = dockerfileVolumes != null ? dockerfileVolumes : Map.of();

        Map<String, Object> outServices = new LinkedHashMap<>();
        if (rootMap.get("services") instanceof Map<?, ?> services) {
            for (Map.Entry<?, ?> entry : services.entrySet()) {
                String svc = String.valueOf(entry.getKey());
                if (!(entry.getValue() instanceof Map<?, ?> cfg)) continue;
                Map<String, Object> outSvc = new LinkedHashMap<>();

                // 1. Image & build remediation (using real digest resolution — never fake digests)
                String overrideImg = imageOverrides != null ? imageOverrides.get(svc) : null;
                Object rawImage = cfg.get("image");
                String imgStr = rawImage != null ? String.valueOf(rawImage).trim() : "";
                if (overrideImg != null && !overrideImg.isBlank()) {
                    String trimmedOverride = overrideImg.trim();
                    String finalOverride = trimmedOverride;
                    if (!PINNED_IMAGE_PATTERN.matcher(trimmedOverride).matches() && resolver != null) {
                        finalOverride = resolver.resolve(trimmedOverride).orElse(trimmedOverride);
                    }
                    outSvc.put("image", finalOverride);
                    changes.add("Applied image override for '" + svc + "'");
                } else if (!imgStr.isEmpty()) {
                    String resolvedImg = resolvePlaceholders(imgStr, rootDotEnv);
                    if (!PINNED_IMAGE_PATTERN.matcher(resolvedImg).matches() && resolver != null) {
                        Optional<String> pinned = resolver.resolve(resolvedImg);
                        if (pinned.isPresent()) {
                            outSvc.put("image", pinned.get());
                            changes.add("Pinned image '" + resolvedImg + "' on '" + svc + "' to verified digest");
                        } else {
                            outSvc.put("image", resolvedImg);
                        }
                    } else {
                        outSvc.put("image", resolvedImg);
                    }
                } else if (cfg.containsKey("build")) {
                    outSvc.put("build", cfg.get("build"));
                }

                // 2. Ports -> expose conversion
                List<String> exposedPorts = new ArrayList<>();
                if (cfg.get("expose") instanceof List<?> expList) {
                    for (Object p : expList) {
                        if (p != null) {
                            String ep = resolvePlaceholders(String.valueOf(p).trim(), rootDotEnv);
                            if (!ep.contains("$") && !ep.isBlank()) exposedPorts.add(ep);
                        }
                    }
                }
                if (cfg.containsKey("ports")) {
                    Integer targetPort = firstPort(cfg.get("ports"), rootDotEnv);
                    String portStr = String.valueOf(targetPort != null ? targetPort : 8080);
                    if (!exposedPorts.contains(portStr)) exposedPorts.add(portStr);
                    changes.add("Converted host 'ports' to internal 'expose: [\"" + portStr + "\"]' on '" + svc + "'");
                }
                if (!exposedPorts.isEmpty()) {
                    outSvc.put("expose", exposedPorts);
                }

                // 3. Environment & env_file normalization (env_file -> base map, list -> map, ${VAR:-default} / .env -> value, secrets -> relocatedSecrets)
                boolean hasEnvFile = cfg.containsKey("env_file");
                if (hasEnvFile || cfg.containsKey("environment")) {
                    Map<String, String> rawEnv = mergedServiceEnvironment(cfg, safeEnvFiles);
                    Map<String, String> cleanEnv = new LinkedHashMap<>();
                    boolean listConverted = cfg.get("environment") instanceof List<?>;
                    if (hasEnvFile) {
                        changes.add("Merged env_file entries on '" + svc + "' into sandbox environment");
                    }
                    for (Map.Entry<String, String> e : rawEnv.entrySet()) {
                        String k = e.getKey();
                        String v = e.getValue() == null ? "" : e.getValue();
                        if (v.contains("$")) {
                            String resolved = resolvePlaceholders(v, rootDotEnv);
                            if (resolved.contains("$") || resolved.isBlank()) {
                                changes.add("Moved unresolved interpolation on '" + svc + "." + k + "' to per-run encrypted binding");
                                continue;
                            }
                            changes.add("Inlined default value for '" + svc + "." + k + "'");
                            v = resolved;
                        }
                        if (!v.isBlank() && v.equals(SecretRedactor.redactString(v))
                                && !SecretRedactor.isSensitiveKey(k) && !URI_USERINFO_SECRET_PATTERN.matcher(v).find()) {
                            cleanEnv.put(k, v);
                        } else if (!v.isBlank()) {
                            relocatedSecrets.computeIfAbsent(svc, s -> new LinkedHashMap<>()).put(k, v);
                            changes.add("Moved sensitive environment variable '" + svc + "." + k + "' to per-run encrypted binding");
                        }
                    }
                    if (listConverted) {
                        changes.add("Converted list 'environment' to map format on '" + svc + "'");
                    }
                    if (cleanEnv.containsKey("EUREKA_CLIENT_SERVICEURL_DEFAULTZONE") && !cleanEnv.containsKey("EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE")) {
                        cleanEnv.put("EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE", cleanEnv.get("EUREKA_CLIENT_SERVICEURL_DEFAULTZONE"));
                        changes.add("Mirrored EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE on '" + svc + "' for Spring Boot relaxed-binding compatibility");
                    } else if (cleanEnv.containsKey("EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE") && !cleanEnv.containsKey("EUREKA_CLIENT_SERVICEURL_DEFAULTZONE")) {
                        cleanEnv.put("EUREKA_CLIENT_SERVICEURL_DEFAULTZONE", cleanEnv.get("EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE"));
                        changes.add("Mirrored EUREKA_CLIENT_SERVICEURL_DEFAULTZONE on '" + svc + "' for Spring Boot relaxed-binding compatibility");
                    }
                    if ("false".equalsIgnoreCase(cleanEnv.get("EUREKA_CLIENT_REGISTER_WITH_EUREKA"))) {
                        cleanEnv.putIfAbsent("EUREKA_SERVER_RESPONSE_CACHE_UPDATE_INTERVAL_MS", "1000");
                        cleanEnv.putIfAbsent("EUREKA_SERVER_ENABLE_SELF_PRESERVATION", "false");
                    }
                    if (cleanEnv.containsKey("EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE")) {
                        cleanEnv.putIfAbsent("EUREKA_CLIENT_REGISTRY_FETCH_INTERVAL_SECONDS", "2");
                        cleanEnv.putIfAbsent("EUREKA_INSTANCE_LEASE_RENEWAL_INTERVAL_IN_SECONDS", "3");
                        cleanEnv.putIfAbsent("SPRING_CLOUD_LOADBALANCER_CACHE_TTL", "1s");
                    }
                    if (cleanEnv.containsKey("SPRING_KAFKA_BOOTSTRAP_SERVERS") || cleanEnv.containsKey("KAFKA_BOOTSTRAP_SERVERS")) {
                        cleanEnv.putIfAbsent("SPRING_KAFKA_TEMPLATE_OBSERVATION_ENABLED", "true");
                        cleanEnv.putIfAbsent("SPRING_KAFKA_LISTENER_OBSERVATION_ENABLED", "true");
                    }
                    if (!cleanEnv.isEmpty()) {
                        outSvc.put("environment", cleanEnv);
                    }
                }

                // 4. Volumes normalization (convert short-form named volume to long-form, drop bind mounts)
                List<Map<String, Object>> cleanMounts = new ArrayList<>();
                if (cfg.get("volumes") instanceof List<?> mounts) {
                    for (Object m : mounts) {
                        if (m instanceof Map<?, ?> mapMount) {
                            String type = String.valueOf(mapMount.get("type"));
                            String source = String.valueOf(mapMount.get("source"));
                            String target = String.valueOf(mapMount.get("target"));
                            if ("volume".equals(type) && validVolumes.contains(source) && target.startsWith("/") && !target.contains("$")) {
                                Map<String, Object> cm = new LinkedHashMap<>();
                                cm.put("type", "volume");
                                cm.put("source", source);
                                cm.put("target", target);
                                if (mapMount.containsKey("read_only")) cm.put("read_only", Boolean.TRUE.equals(mapMount.get("read_only")));
                                cleanMounts.add(cm);
                            } else {
                                changes.add("Removed unsupported volume mount on '" + svc + "'");
                            }
                        } else if (m instanceof String strMount) {
                            String[] parts = strMount.trim().split(":");
                            if (parts.length >= 2 && validVolumes.contains(parts[0].trim()) && parts[1].trim().startsWith("/") && !strMount.contains("$")) {
                                Map<String, Object> cm = new LinkedHashMap<>();
                                cm.put("type", "volume");
                                cm.put("source", parts[0].trim());
                                cm.put("target", parts[1].trim());
                                if (parts.length >= 3 && "ro".equalsIgnoreCase(parts[2].trim())) cm.put("read_only", true);
                                cleanMounts.add(cm);
                                changes.add("Converted short-form volume '" + parts[0].trim() + "' on '" + svc + "' to long-form");
                            } else {
                                changes.add("Removed host bind mount '" + strMount.trim() + "' on '" + svc + "'");
                            }
                        }
                    }
                }

                // 5. Copy remaining allowed keys (stripping any '$' interpolation)
                for (String key : List.of("command", "entrypoint", "depends_on", "healthcheck", "user", "working_dir", "init", "stop_grace_period")) {
                    if (cfg.containsKey(key) && cfg.get(key) != null) {
                        Object sanitized = sanitizeYamlNode(cfg.get(key), rootDotEnv);
                        if (sanitized != null) outSvc.put(key, sanitized);
                    }
                }

                // 5b. Stateful infra & Dockerfile VOLUME compatibility under read_only: true + cap_drop: ALL
                String effectiveImg = String.valueOf(outSvc.getOrDefault("image", imgStr));
                StatefulInfraSpec infraSpec = statefulInfraSpec(svc, effectiveImg);
                int volIdx = 0;
                if (infraSpec != null) {
                    for (String targetPath : infraSpec.writablePaths()) {
                        boolean covered = cleanMounts.stream().anyMatch(m -> targetPath.equals(m.get("target")));
                        if (!covered) {
                            String volName = safeSandboxVolumeName(svc, volIdx);
                            validVolumes.add(volName);
                            outVolumes.putIfAbsent(volName, new LinkedHashMap<>());
                            Map<String, Object> cm = new LinkedHashMap<>();
                            cm.put("type", "volume");
                            cm.put("source", volName);
                            cm.put("target", targetPath);
                            cleanMounts.add(cm);
                            changes.add("Added ephemeral sandbox volume '" + volName + "' -> '" + targetPath + "' on '" + svc + "'");
                        }
                        volIdx++;
                    }
                    if (!outSvc.containsKey("user") && infraSpec.defaultUser() != null && !infraSpec.defaultUser().isBlank()) {
                        outSvc.put("user", infraSpec.defaultUser());
                        changes.add("Configured non-root user '" + infraSpec.defaultUser() + "' on '" + svc + "' for cap_drop: ALL compatibility");
                    }
                }
                for (String appVolTarget : safeDockerfileVols.getOrDefault(svc, List.of())) {
                    if (!isSafeWritableVolumeTarget(appVolTarget)) continue;
                    boolean covered = cleanMounts.stream().anyMatch(m -> appVolTarget.equals(m.get("target")));
                    if (!covered) {
                        String volName = safeSandboxVolumeName(svc, Math.max(volIdx, 2));
                        validVolumes.add(volName);
                        outVolumes.putIfAbsent(volName, new LinkedHashMap<>());
                        Map<String, Object> cm = new LinkedHashMap<>();
                        cm.put("type", "volume");
                        cm.put("source", volName);
                        cm.put("target", appVolTarget);
                        cleanMounts.add(cm);
                        changes.add("Mounted Dockerfile VOLUME '" + volName + "' -> '" + appVolTarget + "' on '" + svc + "' for read_only rootfs compatibility");
                        volIdx++;
                    }
                }

                if (!cleanMounts.isEmpty()) {
                    outSvc.put("volumes", cleanMounts);
                }

                // 6. Log stripped unsupported service options
                for (Object rawKey : cfg.keySet()) {
                    String k = String.valueOf(rawKey);
                    if (!RUNNER_SERVICE_KEYS.contains(k) && !"ports".equals(k) && !"build".equals(k) && !"env_file".equals(k)) {
                        changes.add("Removed unsupported option '" + k + "' on '" + svc + "'");
                    }
                }

                outServices.put(svc, outSvc);
            }
        }

        outRoot.put("services", outServices);
        if (!outVolumes.isEmpty()) {
            outRoot.put("volumes", outVolumes);
        }

        DumperOptions dumperOptions = new DumperOptions();
        dumperOptions.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        dumperOptions.setPrettyFlow(true);
        String generatedYaml = new Yaml(dumperOptions).dump(outRoot);
        List<String> remainingIssues = runnerCompatibilityIssues(generatedYaml, outRoot);
        return new SandboxComposeResult(generatedYaml, changes, remainingIssues, relocatedSecrets);
    }

    private static boolean isSafeWritableVolumeTarget(String target) {
        if (target == null || !target.startsWith("/") || target.equals("/") || target.equals("/tmp")
                || target.startsWith("/tmp/") || target.startsWith("/mavis-otel") || target.contains("$") || target.contains("..")) {
            return false;
        }
        String lower = target.toLowerCase(Locale.ROOT);
        if (lower.contains("docker.sock")) return false;
        for (String dangerous : DANGEROUS_MOUNT_PREFIXES) {
            if (target.equals(dangerous) || target.startsWith(dangerous + "/")) return false;
        }
        return true;
    }

    private static boolean needsSandboxRemediation(Map<?, ?> rootMap, Map<String, String> imageOverrides) {
        if (imageOverrides != null && !imageOverrides.isEmpty()) return true;
        if (!(rootMap.get("services") instanceof Map<?, ?> services)) return false;
        for (Map.Entry<?, ?> entry : services.entrySet()) {
            String svc = String.valueOf(entry.getKey());
            if (!(entry.getValue() instanceof Map<?, ?> cfg)) continue;
            if (cfg.containsKey("env_file")) return true;
            Map<String, String> env = composeEnvironment(cfg.get("environment"));
            for (Map.Entry<String, String> e : env.entrySet()) {
                String v = e.getValue() == null ? "" : e.getValue();
                if (!v.isBlank() && (!v.equals(SecretRedactor.redactString(v))
                        || SecretRedactor.isSensitiveKey(e.getKey())
                        || URI_USERINFO_SECRET_PATTERN.matcher(v).find())) {
                    return true;
                }
            }
            String img = cfg.get("image") != null ? String.valueOf(cfg.get("image")) : "";
            StatefulInfraSpec spec = statefulInfraSpec(svc, img);
            if (spec != null) {
                if (spec.defaultUser() != null && !cfg.containsKey("user")) return true;
                List<?> mounts = cfg.get("volumes") instanceof List<?> l ? l : List.of();
                for (String targetPath : spec.writablePaths()) {
                    boolean covered = mounts.stream().anyMatch(m -> m instanceof Map<?, ?> mm && targetPath.equals(String.valueOf(mm.get("target"))));
                    if (!covered) return true;
                }
            }
        }
        return false;
    }

    private static StatefulInfraSpec statefulInfraSpec(String serviceName, String image) {
        if (!isInfrastructureService(serviceName, image)) return null;
        String lower = (image == null || image.isBlank() ? serviceName : image).toLowerCase(Locale.ROOT);
        String repo = lower.contains("@") ? lower.substring(0, lower.indexOf('@')) : (lower.contains(":") ? lower.substring(0, lower.indexOf(':')) : lower);
        String shortName = repo.contains("/") ? repo.substring(repo.lastIndexOf('/') + 1) : repo;
        if (shortName.contains("postgres") || shortName.contains("postgis")) {
            return new StatefulInfraSpec("postgres", List.of("/var/lib/postgresql/data", "/var/run/postgresql"));
        }
        if (shortName.contains("mysql") || shortName.contains("mariadb")) {
            return new StatefulInfraSpec("mysql", List.of("/var/lib/mysql", "/var/run/mysqld"));
        }
        if (shortName.equals("mongo") || shortName.startsWith("mongo-") || shortName.contains("mongodb")) {
            return new StatefulInfraSpec("mongodb", List.of("/data/db", "/data/configdb"));
        }
        if (shortName.equals("redis") || shortName.startsWith("redis-")) {
            return new StatefulInfraSpec("redis", List.of("/data"));
        }
        if (shortName.contains("rabbitmq")) {
            return new StatefulInfraSpec("rabbitmq", List.of("/var/lib/rabbitmq", "/var/log/rabbitmq"));
        }
        if (shortName.contains("kafka")) {
            return new StatefulInfraSpec("1000:1000", List.of("/var/lib/kafka/data", "/bitnami/kafka", "/opt/kafka/config"));
        }
        if (shortName.contains("zookeeper")) {
            return new StatefulInfraSpec("1000:1000", List.of("/data", "/datalog", "/logs", "/bitnami/zookeeper"));
        }
        if (shortName.contains("mssql") || shortName.contains("sqlserver")) {
            return new StatefulInfraSpec("10001:0", List.of("/var/opt/mssql"));
        }
        if (shortName.contains("elasticsearch")) {
            return new StatefulInfraSpec("1000:1000", List.of("/usr/share/elasticsearch/data", "/usr/share/elasticsearch/logs"));
        }
        if (shortName.contains("opensearch")) {
            return new StatefulInfraSpec("1000:1000", List.of("/usr/share/opensearch/data", "/usr/share/opensearch/logs"));
        }
        if (shortName.contains("minio")) {
            return new StatefulInfraSpec("1000:1000", List.of("/data"));
        }
        if (shortName.contains("keycloak")) {
            return new StatefulInfraSpec("1000:1000", List.of("/opt/keycloak/data"));
        }
        if (shortName.contains("nginx")) {
            return new StatefulInfraSpec("101:101", List.of("/var/cache/nginx", "/var/run"));
        }
        if (shortName.contains("memcached")) {
            return new StatefulInfraSpec("11211:11211", List.of());
        }
        if (shortName.contains("nats")) {
            return new StatefulInfraSpec("1000:1000", List.of("/data"));
        }
        if (shortName.contains("consul")) {
            return new StatefulInfraSpec("100:1000", List.of("/consul/data"));
        }
        return null;
    }

    private static String safeSandboxVolumeName(String serviceName, int index) {
        String base = serviceName == null ? "infra" : serviceName.replaceAll("[^A-Za-z0-9_-]", "_");
        if (base.isBlank()) base = "infra";
        if (base.toLowerCase(Locale.ROOT).startsWith("mavis-") || base.toLowerCase(Locale.ROOT).startsWith("mavis_")) {
            base = "db_" + base;
        }
        if (base.length() > 50) base = base.substring(0, 50);
        String suffix = index == 0 ? "_data" : (index == 1 ? "_run" : "_vol" + index);
        return base + suffix;
    }

    public static String resolveDefaultPlaceholders(String input) {
        return resolvePlaceholders(input, Map.of());
    }

    public static String resolvePlaceholders(String input, Map<String, String> dotEnv) {
        if (input == null || !input.contains("${")) return input;
        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String varName = m.group(1);
            String defVal = m.group(2);
            String envVal = dotEnv != null ? dotEnv.get(varName) : null;
            if (envVal != null && !envVal.isBlank()) {
                m.appendReplacement(sb, Matcher.quoteReplacement(envVal));
            } else if (defVal != null && !defVal.isBlank()) {
                m.appendReplacement(sb, Matcher.quoteReplacement(defVal));
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private static Object sanitizeYamlNode(Object node, Map<String, String> dotEnv) {
        if (node == null) return null;
        if (node instanceof String s) {
            return resolvePlaceholders(s, dotEnv).replace("$$", "").replaceAll("\\$[A-Za-z_][A-Za-z0-9_]*", "").replace("$", "");
        }
        if (node instanceof List<?> list) {
            List<Object> copy = new ArrayList<>();
            for (Object item : list) {
                Object c = sanitizeYamlNode(item, dotEnv);
                if (c != null) copy.add(c);
            }
            return copy;
        }
        if (node instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                Object c = sanitizeYamlNode(e.getValue(), dotEnv);
                if (c != null) copy.put(String.valueOf(e.getKey()), c);
            }
            return copy;
        }
        return node;
    }

    private static List<String> extractServiceDependencies(Map<?, ?> serviceConfig) {
        List<String> deps = new ArrayList<>();
        Object depObj = serviceConfig.get("depends_on");
        if (depObj instanceof List<?> list) {
            for (Object item : list) {
                if (item != null) deps.add(String.valueOf(item).trim());
            }
        } else if (depObj instanceof Map<?, ?> map) {
            for (Object key : map.keySet()) {
                if (key != null) deps.add(String.valueOf(key).trim());
            }
        }
        return deps;
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
        Set<String> springSecurityServices = new HashSet<>();
        Set<String> actuatorPermittedServices = new HashSet<>();
        Map<String, String> contextPaths = new HashMap<>();
        Map<String, String> actuatorBasePaths = new HashMap<>();
        Map<String, Integer> actuatorPorts = new HashMap<>();
        Map<String, Integer> sourcePorts = new HashMap<>();
        Map<String, Map<String, String>> dtoSchemas = new LinkedHashMap<>();
        Map<String, Map<String, String>> responseSchemas = new LinkedHashMap<>();
        Map<String, List<String>> dtoValidationHints = new LinkedHashMap<>();
        Map<String, String> enumFirstValues = new LinkedHashMap<>();
        List<GatewayRouteRule> gatewayRoutes = new ArrayList<>();
        Map<String, Set<String>> serviceOutboundTargets = new LinkedHashMap<>();

        try {
            if (Files.isRegularFile(storagePath) && storagePath.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".zip")) {
                try (ZipFile zipFile = new ZipFile(storagePath.toFile())) {
                    List<ZipEntry> candidates = new ArrayList<>();
                    Enumeration<? extends ZipEntry> entries = zipFile.entries();
                    while (entries.hasMoreElements() && candidates.size() < 10_000) {
                        ZipEntry entry = entries.nextElement();
                        if (entry.isDirectory() || entry.getSize() > 512_000) continue;
                        String entryName = entry.getName().replace('\\', '/');
                        if (isIgnoredArchiveEntry(entryName) || !isInspectableSourceOrConfig(entryName)) continue;
                        candidates.add(entry);
                    }
                    candidates.sort(Comparator
                            .comparingInt((ZipEntry e) -> sourceScanPriority(e.getName().replace('\\', '/')))
                            .thenComparing(e -> e.getName().replace('\\', '/')));
                    int limit = Math.min(candidates.size(), 1_000);
                    for (int i = 0; i < limit; i++) {
                        ZipEntry entry = candidates.get(i);
                        String entryName = entry.getName().replace('\\', '/');
                        try (InputStream is = zipFile.getInputStream(entry)) {
                            String content = new String(is.readNBytes(256_000), StandardCharsets.UTF_8);
                            inspectFileContent(entryName, content, dto, envMap, dbChecks, endpoints, endpointKeys,
                                    explicitHealth, actuatorServices, springSecurityServices, actuatorPermittedServices,
                                    contextPaths, actuatorBasePaths, actuatorPorts, sourcePorts,
                                    dtoSchemas, responseSchemas, dtoValidationHints, enumFirstValues, gatewayRoutes, serviceOutboundTargets);
                        }
                    }
                }
            } else {
                Path dirToScan = Files.isDirectory(storagePath) ? storagePath : storagePath.getParent();
                if (dirToScan != null && Files.isDirectory(dirToScan)) {
                    List<Path> candidates;
                    try (Stream<Path> stream = Files.walk(dirToScan, 8)) {
                        candidates = stream.filter(Files::isRegularFile)
                                .filter(p -> !isIgnoredArchiveEntry(dirToScan.relativize(p).toString().replace('\\', '/')))
                                .filter(p -> isInspectableSourceOrConfig(dirToScan.relativize(p).toString().replace('\\', '/')))
                                .limit(10_000)
                                .sorted(Comparator
                                        .comparingInt((Path p) -> sourceScanPriority(dirToScan.relativize(p).toString().replace('\\', '/')))
                                        .thenComparing(p -> dirToScan.relativize(p).toString().replace('\\', '/')))
                                .limit(1_000)
                                .toList();
                    }
                    for (Path file : candidates) {
                        try {
                            if (Files.size(file) <= 256_000) {
                                String rel = dirToScan.relativize(file).toString().replace('\\', '/');
                                String content = Files.readString(file, StandardCharsets.UTF_8);
                                inspectFileContent(rel, content, dto, envMap, dbChecks, endpoints, endpointKeys,
                                        explicitHealth, actuatorServices, springSecurityServices, actuatorPermittedServices,
                                        contextPaths, actuatorBasePaths, actuatorPorts, sourcePorts,
                                        dtoSchemas, responseSchemas, dtoValidationHints, enumFirstValues, gatewayRoutes, serviceOutboundTargets);
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Không thể quét bổ sung source snapshot tại {}: {}", storagePath, e.getMessage());
        }

        // Apply context-path to discovered endpoints before gateway projection
        for (DetectedEndpointDTO ep : endpoints) {
            String ctx = contextPaths.get(ep.getService());
            if (ctx != null && !ctx.isBlank() && !"/".equals(ctx) && !ep.getPath().startsWith(ctx + "/") && !ep.getPath().equals(ctx)) {
                ep.setPath(normalizeEndpointPath(ctx, ep.getPath()));
            }
        }

        // Project downstream endpoints through discovered API Gateway route rules (Top-Down entrypoints)
        projectGatewayEntryEndpoints(endpoints, endpointKeys, gatewayRoutes, dto.getDetectedServices());

        for (DetectedEndpointDTO ep : endpoints) {
            if (ep.getSampleJsonBody() == null && ep.getRequestBodyType() != null
                    && ep.getMethod() != null && Set.of("POST", "PUT", "PATCH").contains(ep.getMethod())) {
                String synthesized = synthesizeDtoJson(ep.getRequestBodyType(), dtoSchemas, enumFirstValues);
                if (synthesized != null && !synthesized.isBlank()) {
                    ep.setSampleJsonBody(synthesized);
                }
            }
            enrichEndpointContractAndTopology(ep, responseSchemas, dtoValidationHints, serviceOutboundTargets, dto);
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

        // Apply source-configured ports when Compose fell back to default 8080 or was absent
        for (Map.Entry<String, Integer> sp : sourcePorts.entrySet()) {
            if (!ports.containsKey(sp.getKey()) || Objects.equals(ports.get(sp.getKey()), 8080)) {
                ports.put(sp.getKey(), sp.getValue());
            }
        }

        Map<String, String> health = new HashMap<>(dto.getServiceHealthPaths() != null ? dto.getServiceHealthPaths() : Map.of());
        Map<String, String> confidence = new HashMap<>(dto.getServiceHealthConfidence() != null ? dto.getServiceHealthConfidence() : Map.of());
        Map<String, String> reasons = new HashMap<>(dto.getServiceHealthReasons() != null ? dto.getServiceHealthReasons() : Map.of());
        Set<String> infra = new HashSet<>(dto.getInfrastructureServices() != null ? dto.getInfrastructureServices() : List.of());

        for (String svc : services) {
            if (infra.contains(svc)) continue;
            if (health.containsKey(svc)) {
                confidence.put(svc, "DETECTED");
                reasons.putIfAbsent(svc, "Docker Compose healthcheck");
            } else if (explicitHealth.containsKey(svc)) {
                String hp = normalizeEndpointPath(contextPaths.getOrDefault(svc, ""), explicitHealth.get(svc));
                health.put(svc, hp);
                confidence.put(svc, "DETECTED");
                reasons.put(svc, "Explicit health endpoint in source (" + hp + ")");
            } else if (actuatorServices.contains(svc)) {
                int mainPort = ports.getOrDefault(svc, 8080);
                if (actuatorPorts.containsKey(svc) && !Objects.equals(actuatorPorts.get(svc), mainPort)) {
                    dto.getUnifiedManagementPorts().put(svc, mainPort);
                }
                String base = actuatorBasePaths.getOrDefault(svc, "/actuator");
                String ctx = contextPaths.getOrDefault(svc, "");
                String hp = normalizeEndpointPath(ctx, normalizeEndpointPath(base, "/health"));
                health.put(svc, hp);
                confidence.put(svc, "DETECTED");
                reasons.put(svc, "Spring Boot Actuator (" + hp + ")");
                if (springSecurityServices.contains(svc) && !actuatorPermittedServices.contains(svc)
                        && dto.getSecuredActuatorServices() != null) {
                    dto.getSecuredActuatorServices().add(svc);
                }
            } else {
                health.put(svc, "/");
                confidence.put(svc, "ASSUMED");
                reasons.put(svc, "No health endpoint detected; probing '/' (add Actuator or Compose healthcheck)");
            }
        }
        dto.setServicePorts(ports);
        dto.setServiceHealthPaths(health);
        dto.setServiceHealthConfidence(confidence);
        dto.setServiceHealthReasons(reasons);
        pruneSpeculativeConnectionString(envMap, dbChecks);
        dto.setRequiredEnvVars(new ArrayList<>(envMap.values()));
        dto.setDatabaseChecks(dbChecks);
        dto.setDetectedEndpoints(endpoints);
    }

    private static boolean isIgnoredArchiveEntry(String path) {
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

    static int sourceScanPriority(String path) {
        String lower = path.replace('\\', '/').toLowerCase(Locale.ROOT);
        String base = lower.contains("/") ? lower.substring(lower.lastIndexOf('/') + 1) : lower;
        if (base.equals("pom.xml") || base.equals("build.gradle") || base.equals("build.gradle.kts")
                || base.endsWith(".csproj") || base.equals("directory.packages.props")
                || base.equals("package.json") || base.equals("go.mod")
                || base.equals("requirements.txt") || base.equals("pyproject.toml")
                || base.equals("dockerfile") || base.startsWith("dockerfile.")
                || (base.startsWith("application") && (base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".properties")))
                || (base.startsWith("bootstrap") && (base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".properties")))
                || (base.startsWith("appsettings") && base.endsWith(".json"))
                || base.endsWith(".sql") || lower.contains("db/migration/") || lower.contains("db/changelog/") || lower.contains("changelog")
                || base.equals(".env") || base.equals(".env.example")) {
            return 0;
        }
        if (lower.contains("controller") || lower.contains("router") || lower.contains("route")
                || lower.contains("endpoint") || lower.contains("handler") || lower.contains("resource")
                || base.equals("program.cs") || base.equals("startup.cs")
                || base.startsWith("main.") || base.startsWith("app.") || base.startsWith("server.") || base.startsWith("index.")
                || base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".properties")) {
            return 1;
        }
        return 2;
    }

    private boolean isInspectableSourceOrConfig(String path) {
        String lower = path.toLowerCase(Locale.ROOT);
        String baseName = lower.contains("/") ? lower.substring(lower.lastIndexOf('/') + 1) : lower;
        return lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".properties")
                || lower.endsWith(".json") || lower.endsWith(".env") || lower.endsWith(".env.example")
                || lower.endsWith("pom.xml") || lower.endsWith("build.gradle") || lower.endsWith("build.gradle.kts")
                || lower.endsWith(".csproj") || lower.endsWith("directory.packages.props")
                || lower.endsWith("go.mod") || lower.endsWith("requirements.txt") || lower.endsWith("pyproject.toml")
                || lower.endsWith(".sql") || lower.contains("changelog")
                || baseName.equals("dockerfile") || baseName.startsWith("dockerfile.")
                || lower.endsWith(".java") || lower.endsWith(".cs")
                || lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".py") || lower.endsWith(".go");
    }

    record GatewayRouteRule(
            String gatewayService,
            String pathPrefix,
            boolean wildcard,
            String targetService,
            int stripPrefix,
            String rewriteFromPrefix,
            String rewriteToPrefix
    ) {}

    private void inspectFileContent(
            String relativePath,
            String content,
            PreflightCheckResponseDTO dto,
            Map<String, RequiredEnvVarDTO> envMap,
            List<DatabaseCheckDTO> dbChecks,
            List<DetectedEndpointDTO> endpoints,
            Set<String> endpointKeys,
            Map<String, String> explicitHealth,
            Set<String> actuatorServices,
            Set<String> springSecurityServices,
            Set<String> actuatorPermittedServices,
            Map<String, String> contextPaths,
            Map<String, String> actuatorBasePaths,
            Map<String, Integer> actuatorPorts,
            Map<String, Integer> sourcePorts,
            Map<String, Map<String, String>> dtoSchemas,
            Map<String, Map<String, String>> responseSchemas,
            Map<String, List<String>> dtoValidationHints,
            Map<String, String> enumFirstValues,
            List<GatewayRouteRule> gatewayRoutes,
            Map<String, Set<String>> serviceOutboundTargets) {

        String cleanRelPath = stripGitHubRootPrefix(relativePath);
        String lowerPath = cleanRelPath.toLowerCase(Locale.ROOT);
        String baseName = lowerPath.contains("/") ? lowerPath.substring(lowerPath.lastIndexOf('/') + 1) : lowerPath;
        String inferredService = inferServiceFromPath(relativePath, dto.getDetectedServices());
        String lowerContent = content.toLowerCase(Locale.ROOT);

        if (inferredService != null) {
            extractOutboundCallsFromFile(inferredService, content, lowerContent, dto.getDetectedServices(), serviceOutboundTargets);
            extractGatewayRoutesFromFile(inferredService, lowerPath, content, dto.getDetectedServices(), gatewayRoutes);
        }

        // OpenAPI / Swagger specification support (YAML or JSON)
        if ((lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml") || lowerPath.endsWith(".json"))
                && (lowerContent.contains("openapi:") || lowerContent.contains("\"openapi\"")
                || lowerContent.contains("swagger:") || lowerContent.contains("\"swagger\""))) {
            extractOpenApiEndpointsAndSchemas(inferredService, cleanRelPath, content, endpoints, endpointKeys, dtoSchemas, responseSchemas);
        }

        // True stack refinement from manifests and Dockerfiles (P1.3)
        if (dto.getServiceStacks() != null && inferredService != null) {
            if (baseName.equals("package.json")) {
                dto.getServiceStacks().put(inferredService, "node");
            } else if (baseName.equals("requirements.txt") || baseName.equals("pyproject.toml")) {
                dto.getServiceStacks().put(inferredService, "python");
            } else if (baseName.equals("go.mod")) {
                dto.getServiceStacks().put(inferredService, "go");
            } else if (lowerPath.endsWith(".csproj")) {
                if (!"dotnet-musl".equals(dto.getServiceStacks().get(inferredService))) {
                    dto.getServiceStacks().put(inferredService, "dotnet");
                }
            } else if (baseName.equals("dockerfile") || baseName.startsWith("dockerfile.")) {
                if (lowerContent.contains("from node") || lowerContent.contains("from oven/bun")) dto.getServiceStacks().put(inferredService, "node");
                else if (lowerContent.contains("from python")) dto.getServiceStacks().put(inferredService, "python");
                else if (lowerContent.contains("from golang")) dto.getServiceStacks().put(inferredService, "go");
                else if (lowerContent.contains("microsoft.com/dotnet")) {
                    dto.getServiceStacks().put(inferredService, lowerContent.contains("alpine") ? "dotnet-musl" : "dotnet");
                }
            }
        }
        if ((baseName.equals("dockerfile") || baseName.startsWith("dockerfile.")) && inferredService != null) {
            Matcher exposeMatcher = DOCKERFILE_EXPOSE_PATTERN.matcher(content);
            if (exposeMatcher.find()) {
                Integer p = parseConfigPort(exposeMatcher.group(1));
                if (p != null) sourcePorts.putIfAbsent(inferredService, p);
            }
            List<String> vols = parseDockerfileVolumes(content);
            if (!vols.isEmpty() && dto.getServiceDockerfileVolumes() != null) {
                List<String> targetList = dto.getServiceDockerfileVolumes().computeIfAbsent(inferredService, k -> new ArrayList<>());
                for (String v : vols) {
                    if (!targetList.contains(v)) targetList.add(v);
                }
            }
        }
        if (inferredService != null && dto.getMigrationManagedServices() != null) {
            if (lowerPath.contains("db/migration/") || lowerPath.contains("db/changelog/")
                    || ((lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts"))
                    && (lowerContent.contains("flyway") || lowerContent.contains("liquibase")))) {
                dto.getMigrationManagedServices().add(inferredService);
            }
        }

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

            String topYamlKey = "";
            String secondYamlKey = "";
            int secondYamlIndent = -1;
            for (String rawLine : content.split("\r?\n")) {
                int indent = 0;
                while (indent < rawLine.length() && rawLine.charAt(indent) == ' ') indent++;
                String line = rawLine.trim();
                if (line.isEmpty() || line.startsWith("#") || line.startsWith("//")) continue;
                String lowerLine = line.toLowerCase(Locale.ROOT);
                if (lowerLine.endsWith(":")) {
                    String sectionKey = lowerLine.substring(0, lowerLine.length() - 1).trim();
                    if (indent == 0) {
                        topYamlKey = sectionKey;
                        secondYamlKey = "";
                        secondYamlIndent = -1;
                    } else if (secondYamlIndent < 0 || indent <= secondYamlIndent) {
                        secondYamlKey = sectionKey;
                        secondYamlIndent = indent;
                    }
                    if ("management".equals(topYamlKey) && ("endpoints".equals(secondYamlKey) || "endpoint".equals(secondYamlKey))) {
                        actuatorServices.add(inferredService);
                    }
                } else if (indent == 0) {
                    topYamlKey = "";
                    secondYamlKey = "";
                    secondYamlIndent = -1;
                }

                // P1.1 Context-path, actuator base-path, actuator port, and server port
                if (lowerLine.startsWith("server.servlet.context-path") || lowerLine.startsWith("spring.webflux.base-path") || lowerLine.startsWith("context-path:")) {
                    String val = extractConfigScalarValue(line);
                    if (val != null && val.startsWith("/")) contextPaths.put(inferredService, val);
                } else if (lowerLine.startsWith("management.endpoints.web.base-path") || ("management".equals(topYamlKey) && lowerLine.startsWith("base-path:"))) {
                    actuatorServices.add(inferredService);
                    String val = extractConfigScalarValue(line);
                    if (val != null && val.startsWith("/")) actuatorBasePaths.put(inferredService, val);
                } else if (lowerLine.startsWith("management.server.port")
                        || ("management".equals(topYamlKey) && "server".equals(secondYamlKey) && indent > secondYamlIndent && lowerLine.matches("port\\s*[:=].*"))) {
                    actuatorServices.add(inferredService);
                    Integer p = parseConfigPort(extractConfigScalarValue(line));
                    if (p != null) actuatorPorts.put(inferredService, p);
                } else if (lowerLine.startsWith("server.port")
                        || ("server".equals(topYamlKey) && secondYamlKey.isEmpty() && indent > 0 && lowerLine.matches("port\\s*[:=].*"))) {
                    Integer p = parseConfigPort(extractConfigScalarValue(line));
                    if (p != null) sourcePorts.putIfAbsent(inferredService, p);
                }
                if (lowerLine.startsWith("management.endpoints.") || lowerLine.startsWith("management.endpoint.health")) {
                    actuatorServices.add(inferredService);
                }

                if (lowerLine.contains("datasource.url") || lowerLine.contains("jdbc:") || lowerLine.contains("r2dbc:")
                        || lowerLine.contains("connectionstrings") || lowerLine.contains("defaultconnection")
                        || lowerLine.contains("mongodb.uri") || lowerLine.contains("database_url")) {
                    List<String> lineVars = extractPlaceholderNames(line);
                    String dbType = inferDbTypeFromLine(lowerLine);
                    if (lineVars.isEmpty()) {
                        registerEnvVar(envMap, "DB_CONNECTION_STRING", inferredService, null, cleanRelPath);
                        lineVars.add("DB_CONNECTION_STRING");
                    }
                    recordHostDependency(inferredService, line, dto.getServiceDependencies());
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
                boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService) && !isCacheOrBrokerType(d.getDbType()));
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
        // 1B'. Cache/broker clients the sandbox can provision when Compose does not declare them.
        if (isDependencyManifestOrConfig(lowerPath)) {
            for (String infraType : detectCacheAndBrokerTypes(lowerContent)) {
                boolean exists = dbChecks.stream().anyMatch(d -> Objects.equals(d.getService(), inferredService) && infraType.equals(d.getDbType()));
                if (!exists) {
                    dbChecks.add(DatabaseCheckDTO.builder()
                            .service(inferredService)
                            .dbType(infraType)
                            .configKey(cleanRelPath)
                            .connectionUrl("Detected " + infraType + " client in " + cleanRelPath)
                            .requiredEnvVars(new ArrayList<>())
                            .status("DETECTED_IN_SOURCE")
                            .build());
                }
            }
        }
        // 1C. Readiness signals: actuator dependency, explicit /health routes, ASP.NET MapHealthChecks / UseHealthChecks
        if ((lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts"))
                && lowerContent.contains("spring-boot-starter-actuator")) {
            actuatorServices.add(inferredService);
        }
        if ((lowerPath.endsWith("pom.xml") || lowerPath.endsWith("build.gradle") || lowerPath.endsWith("build.gradle.kts"))
                && lowerContent.contains("spring-boot-starter-security") && inferredService != null) {
            springSecurityServices.add(inferredService);
        }
        if ((lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml") || lowerPath.endsWith(".properties"))
                && lowerContent.contains("management.security.enabled") && lowerContent.contains("false") && inferredService != null) {
            actuatorPermittedServices.add(inferredService);
        }
        if (lowerPath.endsWith(".java")) {
            Matcher healthRoute = JAVA_HEALTH_ROUTE_PATTERN.matcher(content);
            if (healthRoute.find()) explicitHealth.putIfAbsent(inferredService, healthRoute.group(1));
            if (inferredService != null && (content.contains("SecurityFilterChain") || content.contains("SecurityWebFilterChain")
                    || content.contains("@EnableWebSecurity") || content.contains("@EnableWebFluxSecurity"))) {
                springSecurityServices.add(inferredService);
                if ((lowerContent.contains("\"/actuator") || lowerContent.contains("endpointrequest.toanyendpoint") || lowerContent.contains("endpointrequest.to("))
                        && (content.contains("permitAll") || content.contains("ignoring()"))) {
                    actuatorPermittedServices.add(inferredService);
                }
            }
        }
        if (lowerPath.endsWith(".cs")) {
            Matcher healthChecks = MAP_HEALTH_CHECKS_PATTERN.matcher(content);
            if (healthChecks.find()) explicitHealth.putIfAbsent(inferredService, healthChecks.group(1));
        }
        if (lowerPath.endsWith(".js") || lowerPath.endsWith(".ts") || lowerPath.endsWith(".py") || lowerPath.endsWith(".go")) {
            extractPolyglotDtoSchemas(lowerPath, content, dtoSchemas, responseSchemas);
            extractNestJsControllerEndpoints(inferredService, cleanRelPath, lowerPath, content, endpoints, endpointKeys, explicitHealth);
            Matcher routeMatcher = EXPRESS_FASTAPI_GIN_ROUTE_PATTERN.matcher(content);
            while (routeMatcher.find()) {
                String method = routeMatcher.group(1).toUpperCase(Locale.ROOT);
                String fullPath = normalizeEndpointPath("", routeMatcher.group(2));
                if (fullPath.startsWith("/health") || fullPath.equals("/ready") || fullPath.equals("/readyz")) {
                    explicitHealth.putIfAbsent(inferredService, fullPath);
                }
                String key = (inferredService + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    String handlerWindow = extractHandlerWindow(content, routeMatcher.start(), routeMatcher.end(), EXPRESS_FASTAPI_GIN_ROUTE_PATTERN);
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(cleanRelPath)
                            .expectedStatus(inferPolyglotHttpStatus(method, handlerWindow))
                            .requestBodyType(extractPolyglotRequestBodyType(lowerPath, handlerWindow))
                            .responseBodyType(extractPolyglotResponseBodyType(lowerPath, handlerWindow))
                            .responseFields(extractInlineResponseFields(handlerWindow))
                            .requiresAuth(detectEndpointAuth("", handlerWindow))
                            .requiredRoles(extractRequiredRoles("", handlerWindow))
                            .build());
                }
            }
        }

        if (lowerPath.endsWith(".java")) {
            extractJavaDtoSchemas(content, dtoSchemas, responseSchemas, dtoValidationHints, enumFirstValues);
        } else if (lowerPath.endsWith(".cs")) {
            extractCsharpDtoSchemas(content, dtoSchemas, responseSchemas, dtoValidationHints, enumFirstValues);
        }

        // 2. Java Controller endpoints (skip @FeignClient / @HttpExchange client interfaces)
        if (lowerPath.endsWith(".java") && content.contains("Mapping") && !content.contains("@FeignClient") && !content.contains("@HttpExchange")) {
            int classDeclIdx = content.indexOf("class ");
            if (classDeclIdx < 0) classDeclIdx = content.indexOf("interface ");
            String classHeader = classDeclIdx > 0 ? content.substring(0, classDeclIdx) : "";
            String basePath = "";
            Matcher classMapping = Pattern.compile("@RequestMapping\\s*\\(\\s*(?:(?:value|path)\\s*=\\s*)?\\{?\\s*\"([^\"]+)\"").matcher(content);
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
                String handlerWindow = extractHandlerWindow(content, matcher.start(), matcher.end(), SPRING_MAPPING_PATTERN);
                String upperArgs = args.toUpperCase(Locale.ROOT);
                boolean isMultipartOnly = (upperArgs.contains("MULTIPART_FORM_DATA") && !upperArgs.contains("APPLICATION_JSON"))
                        || ((handlerWindow.contains("@RequestPart") || handlerWindow.contains("MultipartFile")) && !handlerWindow.contains("@RequestBody"));
                if (isMultipartOnly && Set.of("POST", "PUT", "PATCH").contains(method)) {
                    continue;
                }
                String fullPathWithQuery = appendRequiredQueryParams(fullPath, handlerWindow);
                String key = (inferredService + ":" + method + ":" + fullPathWithQuery).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPathWithQuery)
                            .source(cleanRelPath)
                            .expectedStatus(inferExpectedHttpStatus(method, handlerWindow))
                            .requestBodyType(extractJavaRequestBodyType(handlerWindow))
                            .responseBodyType(extractJavaResponseBodyType(handlerWindow))
                            .responseFields(extractInlineResponseFields(handlerWindow))
                            .requiresAuth(detectEndpointAuth(classHeader, handlerWindow))
                            .requiredRoles(extractRequiredRoles(classHeader, handlerWindow))
                            .build());
                }
            }
        }

        // 3. C# Controller / Minimal API endpoints
        if (lowerPath.endsWith(".cs")) {
            int csClassIdx = content.indexOf("class ");
            String csClassHeader = csClassIdx > 0 ? content.substring(0, csClassIdx) : "";
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
                    String handlerWindow = extractHandlerWindow(content, attrMatcher.start(), attrMatcher.end(), DOTNET_ROUTE_ATTR_PATTERN);
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(cleanRelPath)
                            .expectedStatus(inferExpectedHttpStatus(method, handlerWindow))
                            .requestBodyType(extractCsharpRequestBodyType(handlerWindow))
                            .responseBodyType(extractCsharpResponseBodyType(handlerWindow))
                            .responseFields(extractInlineResponseFields(handlerWindow))
                            .requiresAuth(detectEndpointAuth(csClassHeader, handlerWindow))
                            .requiredRoles(extractRequiredRoles(csClassHeader, handlerWindow))
                            .build());
                }
            }
            Matcher minimalMatcher = DOTNET_MINIMAL_API_PATTERN.matcher(content);
            while (minimalMatcher.find()) {
                String method = minimalMatcher.group(1).toUpperCase(Locale.ROOT);
                String fullPath = normalizeEndpointPath("", minimalMatcher.group(2));
                String key = (inferredService + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    String handlerWindow = extractHandlerWindow(content, minimalMatcher.start(), minimalMatcher.end(), DOTNET_MINIMAL_API_PATTERN);
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(inferredService)
                            .method(method)
                            .path(fullPath)
                            .source(cleanRelPath)
                            .expectedStatus(inferExpectedHttpStatus(method, handlerWindow))
                            .requestBodyType(extractCsharpRequestBodyType(handlerWindow))
                            .responseBodyType(extractCsharpResponseBodyType(handlerWindow))
                            .responseFields(extractInlineResponseFields(handlerWindow))
                            .requiresAuth(detectEndpointAuth("", handlerWindow))
                            .requiredRoles(extractRequiredRoles("", handlerWindow))
                            .build());
                }
            }
        }
    }

    private static String extractHandlerWindow(String content, int matchStart, int matchEnd, Pattern nextEndpointPattern) {
        int preStart = Math.max(0, matchStart - 160);
        int lastBrace = content.lastIndexOf('}', matchStart);
        if (lastBrace >= preStart) preStart = lastBrace + 1;
        int end = Math.min(content.length(), matchEnd + 900);
        Matcher next = nextEndpointPattern.matcher(content);
        if (next.find(matchEnd) && next.start() < end) {
            end = next.start();
        }
        return content.substring(preStart, end);
    }

    private static Integer inferExpectedHttpStatus(String method, String window) {
        if (window == null || window.isEmpty()) return null;
        if (window.contains("HttpStatus.CREATED") || window.contains("ResponseEntity.created(")
                || window.contains(".status(201)") || window.contains("Status201Created")
                || window.contains("CreatedAtAction(") || window.contains("CreatedAtRoute(")
                || window.contains("Results.Created(") || window.contains("TypedResults.Created(")) {
            return 201;
        }
        if ("DELETE".equals(method) && (window.contains("HttpStatus.NO_CONTENT")
                || window.contains(".noContent()") || window.contains("NoContent(")
                || window.contains("Status204NoContent") || window.contains("Results.NoContent("))) {
            return 204;
        }
        if (window.contains("HttpStatus.ACCEPTED") || window.contains(".accepted()") || window.contains("Status202Accepted")) {
            return 202;
        }
        return null;
    }

    private static Boolean detectEndpointAuth(String classHeader, String handlerWindow) {
        String combined = (classHeader == null ? "" : classHeader) + "\n" + (handlerWindow == null ? "" : handlerWindow);
        if (handlerWindow != null && (handlerWindow.contains("PermitAll") || handlerWindow.contains("AllowAnonymous") || handlerWindow.contains("@Public"))) {
            return null;
        }
        if (combined.contains("@PreAuthorize") || combined.contains("@Secured") || combined.contains("@RolesAllowed")
                || combined.contains("[Authorize") || combined.contains(".RequireAuthorization(")
                || combined.contains("@UseGuards") || combined.contains("JwtAuthGuard") || combined.contains("AuthGuard")
                || combined.contains("Depends(get_current_user") || combined.contains("Depends(require_auth")
                || combined.contains("Security(") || combined.contains("HTTPBearer")
                || combined.contains("SecurityUtils.") || combined.contains("SecurityContextHolder.")
                || combined.contains("@AuthenticationPrincipal")) {
            return Boolean.TRUE;
        }
        return null;
    }

    private static List<String> extractRequiredRoles(String classHeader, String handlerWindow) {
        String combined = (classHeader == null ? "" : classHeader) + "\n" + (handlerWindow == null ? "" : handlerWindow);
        Set<String> roles = new LinkedHashSet<>();
        Matcher m1 = Pattern.compile("(?:hasRole|hasAnyRole|hasAuthority|hasAnyAuthority)\\s*\\(([^)]+)\\)").matcher(combined);
        while (m1.find()) {
            Matcher q = Pattern.compile("['\"]([A-Za-z0-9_:-]+)['\"]").matcher(m1.group(1));
            while (q.find()) roles.add(q.group(1).replaceFirst("^ROLE_", ""));
        }
        Matcher m2 = Pattern.compile("(?:@RolesAllowed|@Secured|@Roles|Roles\\s*=)\\s*\\(?\\s*\\{?([^)}\\]\\n]+)").matcher(combined);
        while (m2.find()) {
            Matcher q = Pattern.compile("['\"]([A-Za-z0-9_,-]+)['\"]").matcher(m2.group(1));
            while (q.find()) {
                for (String part : q.group(1).split(",")) {
                    String clean = part.trim().replaceFirst("^ROLE_", "");
                    if (!clean.isEmpty()) roles.add(clean);
                }
            }
        }
        return roles.isEmpty() ? null : new ArrayList<>(roles);
    }

    private static String appendRequiredQueryParams(String path, String window) {
        if (path == null || window == null || path.contains("?")) return path;
        Matcher m = Pattern.compile("@RequestParam\\s*(?:\\(([^)]*)\\))?\\s*(?:@[A-Za-z0-9_.]+\\s*)*(?:final\\s+)?([A-Za-z0-9_<>?]+)\\s+([A-Za-z_][A-Za-z0-9_]*)").matcher(window);
        List<String> params = new ArrayList<>();
        while (m.find() && params.size() < 3) {
            String annArgs = m.group(1) != null ? m.group(1) : "";
            if (annArgs.contains("required = false") || annArgs.contains("required=false") || annArgs.contains("defaultValue")) continue;
            String type = m.group(2);
            if (type.startsWith("Optional") || type.startsWith("Map") || type.startsWith("MultiValueMap")) continue;
            String paramName = m.group(3);
            Matcher explicitName = Pattern.compile("(?:(?:value|name)\\s*=\\s*)?\"([A-Za-z0-9_.-]+)\"").matcher(annArgs);
            if (explicitName.find()) paramName = explicitName.group(1);
            String lowParam = paramName.toLowerCase(Locale.ROOT);
            String val = (type.matches("(?i).*(int|long|short|double|float|decimal|number).*") || lowParam.endsWith("id") || lowParam.equals("page") || lowParam.equals("size") || lowParam.equals("limit")) ? "1"
                    : type.matches("(?i).*bool.*") ? "true"
                    : (lowParam.contains("code") || lowParam.contains("sku")) ? "SKU-LAPTOP-01"
                    : "sample";
            params.add(paramName + "=" + val);
        }
        return params.isEmpty() ? path : path + "?" + String.join("&", params);
    }

    private static String extractJavaRequestBodyType(String window) {
        if (window == null) return null;
        Matcher m = JAVA_REQUEST_BODY_PATTERN.matcher(window);
        if (m.find()) return simplifyDtoTypeName(m.group(1));
        Matcher om = Pattern.compile("readValue\\s*\\([^,]+,\\s*([A-Z][A-Za-z0-9_]*)\\.class\\s*\\)").matcher(window);
        return om.find() ? simplifyDtoTypeName(om.group(1)) : null;
    }

    private static String extractJavaResponseBodyType(String window) {
        if (window == null) return null;
        Matcher re = Pattern.compile("ResponseEntity\\s*<\\s*([A-Za-z_][A-Za-z0-9_<>., ?]*)\\s*>\\s+[a-zA-Z_][A-Za-z0-9_]*\\s*\\(").matcher(window);
        if (!re.find()) {
            re = Pattern.compile("ResponseEntity\\s*<\\s*([A-Za-z_][A-Za-z0-9_<>., ?]*?)\\s*>").matcher(window);
            if (!re.find()) re = null;
        }
        if (re != null) {
            String inner = re.group(1).trim();
            while (inner.matches("(?i)(?:ApiResponse|Result|DataResponse|BaseResponse|PageResponse|List|Set|Collection|Page)\\s*<.*")) {
                int lt = inner.indexOf('<'), gt = inner.lastIndexOf('>');
                if (lt > 0 && gt > lt) inner = inner.substring(lt + 1, gt).trim();
                else if (lt > 0) inner = inner.substring(lt + 1).replace(">", "").trim();
                else break;
            }
            return simplifyDtoTypeName(inner);
        }
        Matcher sig = Pattern.compile("(?:public|protected)\\s+(?:CompletableFuture<|Mono<|Flux<)?([A-Za-z_][A-Za-z0-9_.]*)\\s+[a-zA-Z_][A-Za-z0-9_]*\\s*\\(").matcher(window);
        return sig.find() ? simplifyDtoTypeName(sig.group(1)) : null;
    }

    private static String extractCsharpRequestBodyType(String window) {
        if (window == null) return null;
        Matcher fb = CSHARP_FROM_BODY_PATTERN.matcher(window);
        if (fb.find()) return simplifyDtoTypeName(fb.group(1));
        Matcher lambdaParam = Pattern.compile("\\(\\s*(?:\\[FromServices\\]\\s+[^,)]+,\\s*)*([A-Z][A-Za-z0-9_]*)(?:Request|Dto|DTO|Command|Payload|Input|Model)\\b").matcher(window);
        if (lambdaParam.find()) {
            Matcher full = Pattern.compile("\\b([A-Z][A-Za-z0-9_]*(?:Request|Dto|DTO|Command|Payload|Input|Model))\\b").matcher(lambdaParam.group(0));
            if (full.find()) return full.group(1);
        }
        return null;
    }

    private static String extractCsharpResponseBodyType(String window) {
        if (window == null) return null;
        Matcher ar = Pattern.compile("(?:ActionResult|Task<ActionResult|IResult|TypedResults)\\s*<\\s*([A-Za-z_][A-Za-z0-9_.]*)\\s*>").matcher(window);
        if (ar.find()) return simplifyDtoTypeName(ar.group(1));
        Matcher newDto = Pattern.compile("(?:Ok|Created|CreatedAtAction|CreatedAtRoute)\\s*\\([^;]*?new\\s+([A-Z][A-Za-z0-9_]*(?:Response|Dto|DTO|Result|View))\\b").matcher(window);
        return newDto.find() ? simplifyDtoTypeName(newDto.group(1)) : null;
    }

    private static List<String> extractInlineResponseFields(String window) {
        if (window == null || window.isEmpty()) return null;
        Set<String> pointers = new LinkedHashSet<>();
        // Java Map.of("token", ..., "orderId", ...)
        Matcher mapOf = Pattern.compile("Map\\.of\\s*\\(([^)]+)\\)").matcher(window);
        while (mapOf.find()) {
            Matcher q = Pattern.compile("\"([a-zA-Z_][a-zA-Z0-9_]*)\"\\s*,").matcher(mapOf.group(1));
            while (q.find() && pointers.size() < 6) pointers.add("/" + q.group(1));
        }
        // C# anonymous object new { id = ..., accessToken = ... } or JS/Python dict {"id": ..., "access_token": ...}
        Matcher anon = Pattern.compile("(?:Ok|Created|CreatedAtAction|Results\\.Ok|Results\\.Created|res(?:ponse)?\\.(?:status\\([^)]*\\)\\.)?json|return)\\s*\\(?\\s*(?:new\\s*)?\\{([^}]{1,320})\\}").matcher(window);
        while (anon.find()) {
            String body = anon.group(1);
            Matcher kv = Pattern.compile("(?:[\"']([a-zA-Z_][a-zA-Z0-9_]*)[\"']\\s*:|\\b([a-zA-Z_][a-zA-Z0-9_]*)\\s*=)").matcher(body);
            while (kv.find() && pointers.size() < 6) {
                String k = kv.group(1) != null ? kv.group(1) : kv.group(2);
                if (k != null && !Set.of("return", "new", "true", "false", "null", "await").contains(k)) {
                    pointers.add("/" + k);
                }
            }
        }
        return pointers.isEmpty() ? null : new ArrayList<>(pointers);
    }

    private static String simplifyDtoTypeName(String rawType) {
        if (rawType == null) return null;
        String t = rawType.trim().replace("?", "").replace("[]", "");
        int lt = t.indexOf('<');
        if (lt > 0) t = t.substring(0, lt).trim();
        int dot = t.lastIndexOf('.');
        if (dot >= 0) t = t.substring(dot + 1).trim();
        return t.isEmpty() || Set.of("String", "string", "Object", "object", "void", "Void", "ResponseEntity", "IActionResult", "ActionResult", "IResult", "Task", "JsonNode", "JsonElement", "Map", "Dictionary", "List", "Set").contains(t)
                ? null : t;
    }

    private static void extractJavaDtoSchemas(
            String content,
            Map<String, Map<String, String>> dtoSchemas,
            Map<String, Map<String, String>> responseSchemas,
            Map<String, List<String>> dtoValidationHints,
            Map<String, String> enumFirstValues) {
        Matcher em = JAVA_ENUM_PATTERN.matcher(content);
        while (em.find()) {
            String enumName = em.group(1);
            String firstConst = em.group(2);
            if (!enumName.isBlank() && !firstConst.isBlank()) enumFirstValues.putIfAbsent(enumName, firstConst);
        }
        Matcher rm = JAVA_RECORD_PATTERN.matcher(content);
        while (rm.find()) {
            String recName = rm.group(1);
            List<String> hints = new ArrayList<>();
            Map<String, String> fields = parseRecordComponents(rm.group(2), false, hints);
            if (!fields.isEmpty()) {
                dtoSchemas.putIfAbsent(recName, fields);
                responseSchemas.putIfAbsent(recName, fields);
                if (!hints.isEmpty()) dtoValidationHints.putIfAbsent(recName, hints);
            }
        }
        if (content.contains("@RestController") || content.contains("@Controller") || content.contains("@Service")
                || content.contains("@Repository") || content.contains("@Configuration")) {
            return;
        }
        Matcher cm = JAVA_CLASS_NAME_PATTERN.matcher(content);
        List<String> classNames = new ArrayList<>();
        List<Integer> classStarts = new ArrayList<>();
        while (cm.find()) {
            classNames.add(cm.group(1));
            classStarts.add(cm.start());
        }
        if (classNames.isEmpty()) return;
        for (int ci = 0; ci < classNames.size(); ci++) {
            String className = classNames.get(ci);
            if (className.endsWith("Application") || className.endsWith("Exception") || className.endsWith("Test")) continue;
            String classSlice = content.substring(classStarts.get(ci), ci + 1 < classStarts.size() ? classStarts.get(ci + 1) : content.length());
            Map<String, String> reqFields = new LinkedHashMap<>();
            Map<String, String> respFields = new LinkedHashMap<>();
            List<String> hints = new ArrayList<>();
            Matcher fm = JAVA_FIELD_PATTERN.matcher(classSlice);
            while (fm.find() && respFields.size() < 20) {
                String annotations = fm.group(1) != null ? fm.group(1) : "";
                String fieldType = fm.group(2).trim();
                String fieldName = fm.group(3).trim();
                if ("serialVersionUID".equals(fieldName) || annotations.contains("@JsonIgnore") || annotations.contains("@Transient")) continue;
                if (annotations.contains("@OneToMany") || annotations.contains("@ManyToMany") || annotations.contains("@ManyToOne") || annotations.contains("@OneToOne")) continue;
                respFields.putIfAbsent(fieldName, fieldType);
                if (annotations.contains("@GeneratedValue") || (annotations.contains("@Id") && "id".equalsIgnoreCase(fieldName))) continue;
                String constraintSuffix = extractFieldValidationConstraint(fieldName, annotations, hints);
                if (reqFields.size() < 16) {
                    reqFields.putIfAbsent(fieldName, constraintSuffix.isEmpty() ? fieldType : fieldType + constraintSuffix);
                }
            }
            if (!reqFields.isEmpty()) dtoSchemas.putIfAbsent(className, reqFields);
            if (!respFields.isEmpty()) responseSchemas.putIfAbsent(className, respFields);
            if (!hints.isEmpty()) dtoValidationHints.putIfAbsent(className, hints);
        }
    }

    private static void extractCsharpDtoSchemas(
            String content,
            Map<String, Map<String, String>> dtoSchemas,
            Map<String, Map<String, String>> responseSchemas,
            Map<String, List<String>> dtoValidationHints,
            Map<String, String> enumFirstValues) {
        Matcher em = CSHARP_ENUM_PATTERN.matcher(content);
        while (em.find()) {
            enumFirstValues.putIfAbsent(em.group(1), em.group(2));
        }
        Matcher rm = CSHARP_RECORD_PATTERN.matcher(content);
        while (rm.find()) {
            List<String> hints = new ArrayList<>();
            Map<String, String> fields = parseRecordComponents(rm.group(2), true, hints);
            if (!fields.isEmpty()) {
                dtoSchemas.putIfAbsent(rm.group(1), fields);
                responseSchemas.putIfAbsent(rm.group(1), fields);
                if (!hints.isEmpty()) dtoValidationHints.putIfAbsent(rm.group(1), hints);
            }
        }
        if (content.contains("ControllerBase") || content.contains(": Controller") || content.contains(": DbContext")) return;
        Matcher cm = CSHARP_CLASS_NAME_PATTERN.matcher(content);
        if (!cm.find()) return;
        String className = cm.group(1);
        if (className.endsWith("Program") || className.endsWith("Startup") || className.endsWith("Middleware")) return;
        Map<String, String> reqFields = new LinkedHashMap<>();
        Map<String, String> respFields = new LinkedHashMap<>();
        List<String> hints = new ArrayList<>();
        Matcher pm = CSHARP_PROP_PATTERN.matcher(content);
        while (pm.find() && respFields.size() < 20) {
            String attrs = pm.group(1) != null ? pm.group(1) : "";
            String propType = pm.group(2).trim();
            String rawName = pm.group(3).trim();
            if (attrs.contains("JsonIgnore")) continue;
            String camelName = Character.toLowerCase(rawName.charAt(0)) + rawName.substring(1);
            respFields.putIfAbsent(camelName, propType);
            if ("Id".equals(rawName) && !className.endsWith("Request") && !className.endsWith("Dto") && !className.endsWith("DTO") && !className.endsWith("Command")) continue;
            String constraintSuffix = extractFieldValidationConstraint(camelName, attrs, hints);
            if (reqFields.size() < 16) {
                reqFields.putIfAbsent(camelName, constraintSuffix.isEmpty() ? propType : propType + constraintSuffix);
            }
        }
        if (!reqFields.isEmpty()) dtoSchemas.putIfAbsent(className, reqFields);
        if (!respFields.isEmpty()) responseSchemas.putIfAbsent(className, respFields);
        if (!hints.isEmpty()) dtoValidationHints.putIfAbsent(className, hints);
    }

    private static String extractFieldValidationConstraint(String fieldName, String annotations, List<String> hints) {
        if (annotations == null || annotations.isBlank()) return "";
        StringBuilder meta = new StringBuilder();
        if (annotations.contains("@Email") || annotations.contains("EmailAddress")) {
            meta.append("|email");
            hints.add(fieldName + ":email");
        }
        Matcher minM = Pattern.compile("(?:@(?:Min|DecimalMin)\\s*\\(\\s*(?:value\\s*=\\s*)?\"?(\\d+)|\\[Range\\s*\\(\\s*(\\d+))").matcher(annotations);
        if (minM.find()) {
            String v = minM.group(1) != null ? minM.group(1) : minM.group(2);
            meta.append("|min=").append(v);
            hints.add(fieldName + ">=min(" + v + ")");
        } else if (annotations.contains("@Positive")) {
            meta.append("|min=1");
            hints.add(fieldName + ":positive");
        }
        Matcher sizeM = Pattern.compile("(?:@Size\\s*\\([^)]*min\\s*=\\s*(\\d+)|\\[(?:MinLength|StringLength)\\s*\\([^)]*(?:MinimumLength\\s*=\\s*)?(\\d+))").matcher(annotations);
        if (sizeM.find()) {
            String v = sizeM.group(1) != null ? sizeM.group(1) : sizeM.group(2);
            meta.append("|minLen=").append(v);
            hints.add(fieldName + ":minLen(" + v + ")");
        }
        if (annotations.contains("@Future")) {
            meta.append("|future");
            hints.add(fieldName + ":futureDate");
        }
        if (annotations.contains("@NotBlank") || annotations.contains("@NotEmpty") || annotations.contains("@NotNull") || annotations.contains("[Required")) {
            meta.append("|required");
            hints.add(fieldName + ":required");
        }
        return meta.toString();
    }

    private static Map<String, String> parseRecordComponents(String rawParams, boolean camelCaseNames) {
        return parseRecordComponents(rawParams, camelCaseNames, new ArrayList<>());
    }

    private static Map<String, String> parseRecordComponents(String rawParams, boolean camelCaseNames, List<String> hints) {
        Map<String, String> fields = new LinkedHashMap<>();
        if (rawParams == null || rawParams.isBlank()) return fields;
        List<String> parts = new ArrayList<>();
        int depth = 0;
        int start = 0;
        for (int i = 0; i < rawParams.length(); i++) {
            char c = rawParams.charAt(i);
            if (c == '<' || c == '(' || c == '[') depth++;
            else if (c == '>' || c == ')' || c == ']') depth = Math.max(0, depth - 1);
            else if (c == ',' && depth == 0) {
                parts.add(rawParams.substring(start, i));
                start = i + 1;
            }
        }
        parts.add(rawParams.substring(start));
        for (String part : parts) {
            if (fields.size() >= 16) break;
            String cleaned = part.replaceAll("@[A-Za-z0-9_.]+(?:\\([^)]*\\))?", "")
                    .replaceAll("\\[[^\\]]+\\]", "")
                    .replaceAll("=.*$", "")
                    .trim();
            if (cleaned.isEmpty()) continue;
            int lastSpace = cleaned.lastIndexOf(' ');
            if (lastSpace <= 0) continue;
            String type = cleaned.substring(0, lastSpace).replaceAll("\\bfinal\\b", "").trim();
            String name = cleaned.substring(lastSpace + 1).trim();
            if (type.isEmpty() || !name.matches("[A-Za-z_][A-Za-z0-9_]*")) continue;
            if (camelCaseNames) name = Character.toLowerCase(name.charAt(0)) + name.substring(1);
            String constraintSuffix = extractFieldValidationConstraint(name, part, hints);
            fields.putIfAbsent(name, constraintSuffix.isEmpty() ? type : type + constraintSuffix);
        }
        return fields;
    }

    static String synthesizeDtoJson(String dtoTypeName, Map<String, Map<String, String>> dtoSchemas, Map<String, String> enumFirstValues) {
        Map<String, Object> obj = synthesizeDtoMap(dtoTypeName, dtoSchemas, enumFirstValues, 0);
        if (obj == null || obj.isEmpty()) return null;
        try {
            return DTO_JSON_MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, Object> synthesizeDtoMap(String dtoTypeName, Map<String, Map<String, String>> dtoSchemas, Map<String, String> enumFirstValues, int depth) {
        if (dtoTypeName == null || depth > 2 || dtoSchemas == null) return null;
        Map<String, String> fields = dtoSchemas.get(dtoTypeName);
        if (fields == null || fields.isEmpty()) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        String lowDto = dtoTypeName.toLowerCase(Locale.ROOT);
        boolean isCouponDto = lowDto.contains("coupon") || lowDto.contains("voucher") || lowDto.contains("promo") || lowDto.contains("discount");
        int count = 0;
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            if (count >= 16) break;
            String fName = entry.getKey();
            String fType = entry.getValue();
            String lowField = fName == null ? "" : fName.toLowerCase(Locale.ROOT);
            boolean isRequiredField = fType != null && fType.contains("|required");
            if (!isRequiredField) {
                if (!isCouponDto && (lowField.contains("coupon") || lowField.contains("voucher") || lowField.contains("promo"))) {
                    continue;
                }
                if (lowField.startsWith("parent") && lowField.endsWith("id")) {
                    continue;
                }
                if (isCouponDto && lowField.startsWith("applicable")) {
                    continue;
                }
            }
            Object val = synthesizeFieldValue(fName, fType, dtoSchemas, enumFirstValues, depth);
            if (isCouponDto && lowField.contains("code") && "SKU-LAPTOP-01".equals(val)) {
                val = "SAVE10";
            }
            if (val != null) {
                out.put(fName, val);
                count++;
            }
        }
        return out;
    }

    private static Object synthesizeFieldValue(String fieldName, String rawTypeWithMeta, Map<String, Map<String, String>> dtoSchemas, Map<String, String> enumFirstValues, int depth) {
        String rawType = rawTypeWithMeta == null ? "String" : rawTypeWithMeta;
        String meta = "";
        int pipeIdx = rawType.indexOf('|');
        if (pipeIdx >= 0) {
            meta = rawType.substring(pipeIdx);
            rawType = rawType.substring(0, pipeIdx);
        }
        String type = rawType.trim().replace("?", "");
        String lowerName = fieldName == null ? "" : fieldName.toLowerCase(Locale.ROOT);
        if (type.endsWith("[]") || type.startsWith("List<") || type.startsWith("Set<") || type.startsWith("Collection<")
                || type.startsWith("IList<") || type.startsWith("IEnumerable<") || type.startsWith("ICollection<") || type.startsWith("list[")) {
            String elemType = type.endsWith("[]") ? type.substring(0, type.length() - 2)
                    : (type.contains("<") && type.endsWith(">") ? type.substring(type.indexOf('<') + 1, type.length() - 1).trim()
                    : (type.contains("[") && type.endsWith("]") ? type.substring(type.indexOf('[') + 1, type.length() - 1).trim() : "String"));
            Object elem = synthesizeFieldValue(fieldName, elemType, dtoSchemas, enumFirstValues, depth + 1);
            return elem != null ? List.of(elem) : List.of();
        }
        if (type.startsWith("Map<") || type.startsWith("Dictionary<") || type.startsWith("IDictionary<") || type.startsWith("dict[")) {
            if (lowerName.contains("address")) {
                return Map.of("recipientName", "Nguyen Van A", "recipientPhone", "0901234567", "streetAddress", "123 Le Loi, Quan 1, TP.HCM");
            }
            return Map.of();
        }
        String simple = type.contains(".") ? type.substring(type.lastIndexOf('.') + 1) : type;
        if (enumFirstValues != null && enumFirstValues.containsKey(simple)) {
            return enumFirstValues.get(simple);
        }
        Integer minConstraint = null;
        Matcher minM = Pattern.compile("\\|min=(\\d+)").matcher(meta);
        if (minM.find()) {
            try { minConstraint = Integer.parseInt(minM.group(1)); } catch (NumberFormatException ignored) {}
        }
        Integer minLenConstraint = null;
        Matcher minLenM = Pattern.compile("\\|minLen=(\\d+)").matcher(meta);
        if (minLenM.find()) {
            try { minLenConstraint = Integer.parseInt(minLenM.group(1)); } catch (NumberFormatException ignored) {}
        }
        return switch (simple) {
            case "boolean", "Boolean", "bool" -> !lowerName.contains("deleted") && !lowerName.contains("disabled");
            case "int", "Integer", "long", "Long", "short", "Short", "byte", "Byte", "Int32", "Int64", "BigInteger", "number", "int64", "int32", "uint" -> {
                int baseVal = lowerName.contains("age") ? 28
                        : lowerName.contains("port") ? 8080
                        : lowerName.contains("year") ? 2026
                        : (lowerName.contains("stock") || lowerName.contains("inventory") || lowerName.contains("quantity")) ? 20
                        : 1;
                yield minConstraint != null ? Math.max(baseVal, minConstraint) : baseVal;
            }
            case "double", "Double", "float", "Float", "BigDecimal", "decimal", "Decimal", "float64", "float32" -> {
                double baseVal = (lowerName.contains("rate") || lowerName.contains("discount")) ? 0.1 : 99.5;
                yield minConstraint != null ? Math.max(baseVal, (double) minConstraint) : baseVal;
            }
            case "UUID", "Guid" -> "00000000-0000-0000-0000-000000000001";
            case "LocalDate", "DateOnly", "date" -> (meta.contains("|future") || lowerName.contains("expir") || lowerName.contains("end") || lowerName.contains("until") || lowerName.contains("validto")) ? "2027-06-15" : "2026-01-15";
            case "LocalTime", "TimeOnly" -> "10:00:00";
            case "Instant", "OffsetDateTime", "ZonedDateTime", "Date", "DateTime", "DateTimeOffset", "datetime" -> (meta.contains("|future") || lowerName.contains("expir") || lowerName.contains("end") || lowerName.contains("until") || lowerName.contains("validto")) ? "2027-06-15T10:00:00Z" : "2026-01-15T10:00:00Z";
            case "LocalDateTime" -> (meta.contains("|future") || lowerName.contains("expir") || lowerName.contains("end") || lowerName.contains("until") || lowerName.contains("validto")) ? "2027-06-15T10:00:00" : "2026-01-15T10:00:00";
            case "String", "string", "CharSequence", "str" -> {
                String candidate;
                if (meta.contains("|email") || lowerName.contains("email")) candidate = "alice@example.org";
                else if (lowerName.contains("phone") || lowerName.contains("mobile")) candidate = "+84901234567";
                else if (lowerName.contains("url") || lowerName.contains("uri") || lowerName.contains("website")) candidate = "https://example.org";
                else if (lowerName.contains("uuid") || lowerName.contains("guid")) candidate = "00000000-0000-0000-0000-000000000001";
                else if (lowerName.contains("paymentmethod")) candidate = "COD";
                else if (lowerName.contains("code") || lowerName.contains("sku")) candidate = "SKU-LAPTOP-01";
                else if (lowerName.contains("currency")) candidate = "USD";
                else if (lowerName.contains("country")) candidate = "VN";
                else if (lowerName.contains("status")) candidate = "ACTIVE";
                else if (lowerName.contains("role")) candidate = "USER";
                else if (lowerName.contains("password") || lowerName.contains("pwd")) candidate = "SandboxPass123!";
                else if (lowerName.contains("username") || lowerName.contains("login")) candidate = "alice";
                else if (lowerName.contains("name")) candidate = "Sample " + Character.toUpperCase(fieldName.charAt(0)) + fieldName.substring(1);
                else candidate = "sample-" + fieldName;
                if (minLenConstraint != null && minLenConstraint > candidate.length() && minLenConstraint <= 128) {
                    candidate = candidate + "-".repeat(1) + "x".repeat(minLenConstraint - candidate.length() - 1);
                }
                yield candidate;
            }
            default -> depth < 2 ? synthesizeDtoMap(simple, dtoSchemas, enumFirstValues, depth + 1) : null;
        };
    }

    private static void extractPolyglotDtoSchemas(
            String lowerPath,
            String content,
            Map<String, Map<String, String>> dtoSchemas,
            Map<String, Map<String, String>> responseSchemas) {
        if (lowerPath.endsWith(".ts")) {
            Matcher m = Pattern.compile("(?:export\\s+)?(?:class|interface)\\s+([A-Z][A-Za-z0-9_]*(?:Dto|DTO|Request|Response|Input|Payload|Entity)?)\\s*(?:extends\\s+[^{]+)?\\{([^}]{1,1500})\\}").matcher(content);
            while (m.find()) {
                String name = m.group(1);
                Map<String, String> fields = new LinkedHashMap<>();
                Matcher prop = Pattern.compile("(?m)^\\s*(?:readonly\\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\\??\\s*:\\s*([a-zA-Z0-9_\\[\\]<>]+)").matcher(m.group(2));
                while (prop.find() && fields.size() < 16) {
                    fields.putIfAbsent(prop.group(1), prop.group(2));
                }
                if (!fields.isEmpty()) {
                    dtoSchemas.putIfAbsent(name, fields);
                    responseSchemas.putIfAbsent(name, fields);
                }
            }
        } else if (lowerPath.endsWith(".py")) {
            Matcher m = Pattern.compile("class\\s+([A-Z][A-Za-z0-9_]*)\\s*\\(\\s*(?:BaseModel|SQLModel|Schema)[^)]*\\)\\s*:([\\s\\S]{1,1200}?)(?=\\n(?:class|def|@)|\\z)").matcher(content);
            while (m.find()) {
                String name = m.group(1);
                Map<String, String> fields = new LinkedHashMap<>();
                Matcher prop = Pattern.compile("(?m)^[ \\t]{2,8}([a-zA-Z_][a-zA-Z0-9_]*)\\s*:\\s*(?:Optional\\[)?([a-zA-Z0-9_\\[\\]]+)").matcher(m.group(2));
                while (prop.find() && fields.size() < 16) {
                    String fName = prop.group(1);
                    if (!fName.startsWith("_") && !"model_config".equals(fName)) {
                        fields.putIfAbsent(fName, prop.group(2));
                    }
                }
                if (!fields.isEmpty()) {
                    dtoSchemas.putIfAbsent(name, fields);
                    responseSchemas.putIfAbsent(name, fields);
                }
            }
        } else if (lowerPath.endsWith(".go")) {
            Matcher m = Pattern.compile("type\\s+([A-Z][A-Za-z0-9_]*)\\s+struct\\s*\\{([^}]{1,1500})\\}").matcher(content);
            while (m.find()) {
                String name = m.group(1);
                Map<String, String> fields = new LinkedHashMap<>();
                Matcher prop = Pattern.compile("(?m)^\\s*([A-Z][A-Za-z0-9_]*)\\s+([*\\[\\]a-zA-Z0-9_.]+)\\s+`[^`]*json:\"([a-zA-Z0-9_]+)").matcher(m.group(2));
                while (prop.find() && fields.size() < 16) {
                    String jsonTag = prop.group(3);
                    if (!"-".equals(jsonTag)) fields.putIfAbsent(jsonTag, prop.group(2).replace("*", ""));
                }
                if (!fields.isEmpty()) {
                    dtoSchemas.putIfAbsent(name, fields);
                    responseSchemas.putIfAbsent(name, fields);
                }
            }
        }
    }

    private static void extractNestJsControllerEndpoints(
            String service,
            String cleanRelPath,
            String lowerPath,
            String content,
            List<DetectedEndpointDTO> endpoints,
            Set<String> endpointKeys,
            Map<String, String> explicitHealth) {
        if (!lowerPath.endsWith(".ts") || !content.contains("@Controller")) return;
        Matcher ctrl = Pattern.compile("@Controller\\s*\\(\\s*(?:['\"]([^'\"]*)['\"])?\\s*\\)").matcher(content);
        if (!ctrl.find()) return;
        String basePath = ctrl.group(1) != null ? ctrl.group(1) : "";
        String classHeader = content.substring(0, Math.min(content.length(), ctrl.end() + 120));
        Pattern nestRoute = Pattern.compile("@(Get|Post|Put|Delete|Patch)\\s*\\(\\s*(?:['\"]([^'\"]*)['\"])?\\s*\\)");
        Matcher m = nestRoute.matcher(content);
        while (m.find()) {
            String method = m.group(1).toUpperCase(Locale.ROOT);
            String sub = m.group(2) != null ? m.group(2) : "";
            String fullPath = normalizeEndpointPath(basePath, sub).replaceAll(":([a-zA-Z_][a-zA-Z0-9_]*)", "{$1}");
            if (fullPath.startsWith("/health") || fullPath.equals("/ready")) explicitHealth.putIfAbsent(service, fullPath);
            String key = (service + ":" + method + ":" + fullPath).toLowerCase(Locale.ROOT);
            if (endpointKeys.add(key)) {
                String window = extractHandlerWindow(content, m.start(), m.end(), nestRoute);
                endpoints.add(DetectedEndpointDTO.builder()
                        .service(service)
                        .method(method)
                        .path(fullPath)
                        .source(cleanRelPath)
                        .expectedStatus(inferPolyglotHttpStatus(method, window))
                        .requestBodyType(extractPolyglotRequestBodyType(lowerPath, window))
                        .responseBodyType(extractPolyglotResponseBodyType(lowerPath, window))
                        .responseFields(extractInlineResponseFields(window))
                        .requiresAuth(detectEndpointAuth(classHeader, window))
                        .requiredRoles(extractRequiredRoles(classHeader, window))
                        .build());
            }
        }
    }

    private static Integer inferPolyglotHttpStatus(String method, String window) {
        if (window == null) return null;
        Matcher sc = Pattern.compile("(?:status_code\\s*=\\s*|@HttpCode\\s*\\(\\s*|\\.status\\s*\\(\\s*|http\\.StatusCreated|201)(\\d{3})?").matcher(window);
        if (window.contains("status_code=201") || window.contains("status_code = 201") || window.contains("HTTP_201_CREATED")
                || window.contains("@HttpCode(201)") || window.contains(".status(201)") || window.contains("StatusCreated")) {
            return 201;
        }
        if ("DELETE".equals(method) && (window.contains("204") || window.contains("HTTP_204_NO_CONTENT") || window.contains("StatusNoContent"))) {
            return 204;
        }
        return inferExpectedHttpStatus(method, window);
    }

    private static String extractPolyglotRequestBodyType(String lowerPath, String window) {
        if (window == null) return null;
        if (lowerPath.endsWith(".ts")) {
            Matcher m = Pattern.compile("@Body\\s*\\([^)]*\\)\\s*[a-zA-Z_][a-zA-Z0-9_]*\\s*:\\s*([A-Z][A-Za-z0-9_]*)").matcher(window);
            if (m.find()) return simplifyDtoTypeName(m.group(1));
        } else if (lowerPath.endsWith(".py")) {
            Matcher m = Pattern.compile("\\([^)]*\\b[a-zA-Z_][a-zA-Z0-9_]*\\s*:\\s*([A-Z][A-Za-z0-9_]*)").matcher(window);
            if (m.find() && !Set.of("Request", "Response", "Session", "BackgroundTasks").contains(m.group(1))) {
                return simplifyDtoTypeName(m.group(1));
            }
        } else if (lowerPath.endsWith(".go")) {
            Matcher m = Pattern.compile("var\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s+([A-Z][A-Za-z0-9_]*)").matcher(window);
            if (m.find()) return simplifyDtoTypeName(m.group(1));
        }
        return null;
    }

    private static String extractPolyglotResponseBodyType(String lowerPath, String window) {
        if (window == null) return null;
        if (lowerPath.endsWith(".py")) {
            Matcher m = Pattern.compile("response_model\\s*=\\s*(?:List\\[)?([A-Z][A-Za-z0-9_]*)").matcher(window);
            if (m.find()) return simplifyDtoTypeName(m.group(1));
        } else if (lowerPath.endsWith(".ts")) {
            Matcher m = Pattern.compile("\\)\\s*:\\s*(?:Promise<)?([A-Z][A-Za-z0-9_]*)").matcher(window);
            if (m.find()) return simplifyDtoTypeName(m.group(1));
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static void extractOpenApiEndpointsAndSchemas(
            String service,
            String cleanRelPath,
            String content,
            List<DetectedEndpointDTO> endpoints,
            Set<String> endpointKeys,
            Map<String, Map<String, String>> dtoSchemas,
            Map<String, Map<String, String>> responseSchemas) {
        try {
            Yaml yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
            Object rootObj = yaml.load(content);
            if (!(rootObj instanceof Map<?, ?> root)) return;
            Map<?, ?> schemas = null;
            if (root.get("components") instanceof Map<?, ?> comp && comp.get("schemas") instanceof Map<?, ?> s) {
                schemas = s;
            } else if (root.get("definitions") instanceof Map<?, ?> defs) {
                schemas = defs;
            }
            if (schemas != null) {
                for (Map.Entry<?, ?> entry : schemas.entrySet()) {
                    String schemaName = String.valueOf(entry.getKey());
                    if (!(entry.getValue() instanceof Map<?, ?> schemaDef)) continue;
                    if (!(schemaDef.get("properties") instanceof Map<?, ?> props)) continue;
                    Map<String, String> fields = new LinkedHashMap<>();
                    for (Map.Entry<?, ?> propEntry : props.entrySet()) {
                        if (fields.size() >= 16 || !(propEntry.getValue() instanceof Map<?, ?> propDef)) continue;
                        String pName = String.valueOf(propEntry.getKey());
                        String pType = propDef.get("type") != null ? String.valueOf(propDef.get("type")) : "String";
                        if ("integer".equals(pType)) pType = "int";
                        else if ("number".equals(pType)) pType = "double";
                        else if ("boolean".equals(pType)) pType = "boolean";
                        else pType = "String";
                        fields.putIfAbsent(pName, pType);
                    }
                    if (!fields.isEmpty()) {
                        dtoSchemas.putIfAbsent(schemaName, fields);
                        responseSchemas.putIfAbsent(schemaName, fields);
                    }
                }
            }
            if (!(root.get("paths") instanceof Map<?, ?> paths)) return;
            for (Map.Entry<?, ?> pathEntry : paths.entrySet()) {
                String rawPath = normalizeEndpointPath("", String.valueOf(pathEntry.getKey()));
                if (!(pathEntry.getValue() instanceof Map<?, ?> ops)) continue;
                for (String verb : List.of("get", "post", "put", "patch", "delete")) {
                    if (!(ops.get(verb) instanceof Map<?, ?> op)) continue;
                    String upperVerb = verb.toUpperCase(Locale.ROOT);
                    String key = (service + ":" + upperVerb + ":" + rawPath).toLowerCase(Locale.ROOT);
                    if (!endpointKeys.add(key)) continue;
                    String reqRef = extractOpenApiRefName(op.get("requestBody"));
                    String respRef = extractOpenApiRefName(op.get("responses"));
                    Integer status = (op.get("responses") instanceof Map<?, ?> rMap && (rMap.containsKey("201") || rMap.containsKey(201))) ? 201 : 200;
                    Boolean reqAuth = (op.containsKey("security") || root.containsKey("security")) ? Boolean.TRUE : null;
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(service)
                            .method(upperVerb)
                            .path(rawPath)
                            .source(cleanRelPath)
                            .expectedStatus(status)
                            .requestBodyType(reqRef)
                            .responseBodyType(respRef)
                            .requiresAuth(reqAuth)
                            .build());
                }
            }
        } catch (Exception ignored) {}
    }

    private static String extractOpenApiRefName(Object node) {
        if (node == null) return null;
        String text = String.valueOf(node);
        Matcher m = Pattern.compile("#/(?:components/schemas|definitions)/([A-Za-z0-9_.-]+)").matcher(text);
        return m.find() ? m.group(1) : null;
    }

    private static void extractOutboundCallsFromFile(
            String service,
            String content,
            String lowerContent,
            List<String> detectedServices,
            Map<String, Set<String>> serviceOutboundTargets) {
        Set<String> targets = serviceOutboundTargets.computeIfAbsent(service, k -> new LinkedHashSet<>());
        Matcher feign = Pattern.compile("@FeignClient\\s*\\([^)]*(?:name|value|url)\\s*=\\s*\"(?:https?://)?([a-zA-Z0-9_.-]+)").matcher(content);
        while (feign.find()) {
            String matched = matchDetectedService(feign.group(1), detectedServices);
            targets.add(matched != null ? matched : cleanServiceCandidate(feign.group(1)));
        }
        if (detectedServices != null) {
            for (String candidate : detectedServices) {
                if (candidate.equalsIgnoreCase(service)) continue;
                String lowCand = candidate.toLowerCase(Locale.ROOT);
                if (lowerContent.contains("://" + lowCand) || lowerContent.contains("lb://" + lowCand)
                        || lowerContent.contains("\"" + lowCand + "\"")) {
                    targets.add(candidate);
                }
            }
        }
        if (lowerContent.contains("kafkatemplate") || lowerContent.contains("kafka.produce") || lowerContent.contains("confluent.kafka")) {
            targets.add("kafka");
        }
        if (lowerContent.contains("rabbittemplate") || lowerContent.contains("basicpublish") || lowerContent.contains("ipublishendpoint")) {
            targets.add("rabbitmq");
        }
    }

    private static void extractGatewayRoutesFromFile(
            String service,
            String lowerPath,
            String content,
            List<String> detectedServices,
            List<GatewayRouteRule> gatewayRoutes) {
        // 1. Spring Cloud Gateway YAML / Properties: parse each route definition independently so predicates/filters never bleed across routes
        if (lowerPath.endsWith(".yml") || lowerPath.endsWith(".yaml")) {
            int before = gatewayRoutes.size();
            try {
                Yaml yaml = new Yaml(new SafeConstructor(new LoaderOptions()));
                for (Object doc : yaml.loadAll(content)) {
                    collectYamlGatewayRoutes(doc, service, detectedServices, gatewayRoutes);
                }
            } catch (Exception ignored) {}
            if (gatewayRoutes.size() == before && content.contains("Path=")) {
                for (String block : content.split("(?m)^[ \\t]*-[ \\t]+")) {
                    parseIsolatedGatewayRouteBlock(service, block, detectedServices, gatewayRoutes);
                }
            }
        } else if (lowerPath.endsWith(".properties") && content.contains("Path=")) {
            Map<String, StringBuilder> byIndex = new LinkedHashMap<>();
            Matcher idxLine = Pattern.compile("(?m)^\\s*[^#\\r\\n]*routes\\[(\\d+)]\\.(.+)$").matcher(content);
            while (idxLine.find()) {
                byIndex.computeIfAbsent(idxLine.group(1), k -> new StringBuilder()).append(idxLine.group(2)).append('\n');
            }
            if (!byIndex.isEmpty()) {
                for (StringBuilder sb : byIndex.values()) {
                    parseIsolatedGatewayRouteBlock(service, sb.toString(), detectedServices, gatewayRoutes);
                }
            } else {
                parseIsolatedGatewayRouteBlock(service, content, detectedServices, gatewayRoutes);
            }
        }
        // 2. Nginx proxy_pass: location /api/orders/ { proxy_pass http://order-service:8080/; }
        Matcher nginx = Pattern.compile("location\\s+(?:~\\*?\\s+)?([/a-zA-Z0-9_.-]+)\\s*\\{[^}]*proxy_pass\\s+https?://([a-zA-Z0-9_.-]+)(?::\\d+)?(/[^;\\s}]*)?").matcher(content);
        while (nginx.find()) {
            String cleanPrefix = stripTrailingSlashExceptRoot(nginx.group(1));
            String rawTarget = nginx.group(2);
            String targetUri = nginx.group(3);
            String matchedTarget = matchDetectedService(rawTarget, detectedServices);
            String targetSvc = matchedTarget != null ? matchedTarget : cleanServiceCandidate(rawTarget);
            if (!targetSvc.isBlank() && !targetSvc.equalsIgnoreCase(service) && cleanPrefix.startsWith("/")) {
                if (targetUri != null && !targetUri.isBlank()) {
                    gatewayRoutes.add(new GatewayRouteRule(service, cleanPrefix, true, targetSvc, 0, cleanPrefix, stripTrailingSlashExceptRoot(targetUri.trim())));
                } else {
                    gatewayRoutes.add(new GatewayRouteRule(service, cleanPrefix, true, targetSvc, 0, null, null));
                }
            }
        }
    }

    private static void collectYamlGatewayRoutes(
            Object node,
            String service,
            List<String> detectedServices,
            List<GatewayRouteRule> gatewayRoutes) {
        if (node instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if ("routes".equals(String.valueOf(entry.getKey())) && entry.getValue() instanceof List<?> routeList) {
                    for (Object item : routeList) {
                        if (item instanceof Map<?, ?> routeMap) {
                            parseYamlGatewayRouteMap(service, routeMap, detectedServices, gatewayRoutes);
                        }
                    }
                } else {
                    collectYamlGatewayRoutes(entry.getValue(), service, detectedServices, gatewayRoutes);
                }
            }
        } else if (node instanceof Iterable<?> it) {
            for (Object child : it) {
                collectYamlGatewayRoutes(child, service, detectedServices, gatewayRoutes);
            }
        }
    }

    private static void parseYamlGatewayRouteMap(
            String service,
            Map<?, ?> routeMap,
            List<String> detectedServices,
            List<GatewayRouteRule> gatewayRoutes) {
        Object uriObj = routeMap.get("uri");
        if (uriObj == null) return;
        Matcher uriM = Pattern.compile("(?:lb|https?)://([a-zA-Z0-9_.-]+)(?::\\d+)?").matcher(String.valueOf(uriObj).trim());
        if (!uriM.find()) return;
        String matchedTarget = matchDetectedService(uriM.group(1), detectedServices);
        String targetSvc = matchedTarget != null ? matchedTarget : cleanServiceCandidate(uriM.group(1));
        if (targetSvc.isBlank() || targetSvc.equalsIgnoreCase(service)) return;

        List<String> rawPredPaths = new ArrayList<>();
        if (routeMap.get("predicates") instanceof Iterable<?> preds) {
            for (Object pred : preds) {
                if (pred instanceof String ps) {
                    Matcher pm = Pattern.compile("(?<![A-Za-z0-9_.-])Path\\s*=\\s*(.+)").matcher(ps.trim());
                    if (pm.find()) {
                        for (String part : pm.group(1).split(",")) {
                            if (!part.isBlank()) rawPredPaths.add(part.trim());
                        }
                    }
                } else if (pred instanceof Map<?, ?> pm) {
                    if ("Path".equalsIgnoreCase(String.valueOf(pm.get("name"))) && pm.get("args") != null) {
                        Object args = pm.get("args");
                        if (args instanceof Map<?, ?> am) {
                            for (Object v : am.values()) {
                                for (String part : String.valueOf(v).split(",")) {
                                    if (!part.isBlank()) rawPredPaths.add(part.trim());
                                }
                            }
                        } else {
                            for (String part : String.valueOf(args).split(",")) {
                                if (!part.isBlank()) rawPredPaths.add(part.trim());
                            }
                        }
                    } else if (pm.get("Path") != null) {
                        for (String part : String.valueOf(pm.get("Path")).split(",")) {
                            if (!part.isBlank()) rawPredPaths.add(part.trim());
                        }
                    }
                }
            }
        }

        int strip = 0;
        String rewriteFrom = null;
        String rewriteTo = null;
        if (routeMap.get("filters") instanceof Iterable<?> filters) {
            for (Object filt : filters) {
                if (filt instanceof String fs) {
                    Matcher sm = Pattern.compile("StripPrefix\\s*=\\s*(\\d+)").matcher(fs);
                    if (sm.find()) strip = Integer.parseInt(sm.group(1));
                    Matcher rm = Pattern.compile("RewritePath\\s*=\\s*([^,]+),\\s*(.+)").matcher(fs);
                    if (rm.find()) {
                        String[] rw = parseRewritePathPrefixes(rm.group(1), rm.group(2));
                        if (rw != null) {
                            rewriteFrom = rw[0];
                            rewriteTo = rw[1];
                        }
                    }
                } else if (filt instanceof Map<?, ?> fm) {
                    String fName = String.valueOf(fm.get("name"));
                    if ("StripPrefix".equalsIgnoreCase(fName) && fm.get("args") != null) {
                        Matcher sm = Pattern.compile("(\\d+)").matcher(String.valueOf(fm.get("args")));
                        if (sm.find()) strip = Integer.parseInt(sm.group(1));
                    } else if ("RewritePath".equalsIgnoreCase(fName) && fm.get("args") instanceof Map<?, ?> am) {
                        Object rx = am.get("regexp");
                        Object rep = am.get("replacement");
                        if (rx != null && rep != null) {
                            String[] rw = parseRewritePathPrefixes(String.valueOf(rx), String.valueOf(rep));
                            if (rw != null) {
                                rewriteFrom = rw[0];
                                rewriteTo = rw[1];
                            }
                        }
                    }
                }
            }
        }

        for (String rawPath : rawPredPaths) {
            addParsedGatewayRoute(service, targetSvc, rawPath, strip, rewriteFrom, rewriteTo, gatewayRoutes);
        }
    }

    private static void parseIsolatedGatewayRouteBlock(
            String service,
            String block,
            List<String> detectedServices,
            List<GatewayRouteRule> gatewayRoutes) {
        Matcher uriM = Pattern.compile("uri\\s*[:=]\\s*['\"]?(?:lb|https?)://([a-zA-Z0-9_.-]+)(?::\\d+)?['\"]?").matcher(block);
        if (!uriM.find()) return;
        String matchedTarget = matchDetectedService(uriM.group(1), detectedServices);
        String targetSvc = matchedTarget != null ? matchedTarget : cleanServiceCandidate(uriM.group(1));
        if (targetSvc.isBlank() || targetSvc.equalsIgnoreCase(service)) return;

        int strip = 0;
        Matcher sm = Pattern.compile("StripPrefix\\s*=\\s*(\\d+)").matcher(block);
        if (sm.find()) strip = Integer.parseInt(sm.group(1));

        String rewriteFrom = null;
        String rewriteTo = null;
        Matcher rm = Pattern.compile("RewritePath\\s*=\\s*([^,\\r\\n]+),\\s*([^\\r\\n#]+)").matcher(block);
        if (rm.find()) {
            String[] rw = parseRewritePathPrefixes(rm.group(1), rm.group(2));
            if (rw != null) {
                rewriteFrom = rw[0];
                rewriteTo = rw[1];
            }
        }

        Matcher pm = Pattern.compile("(?<![A-Za-z0-9_.-])Path\\s*=\\s*([^\\r\\n#]+)").matcher(block);
        while (pm.find()) {
            for (String part : pm.group(1).split(",")) {
                String cleanPart = part.trim().replaceAll("^['\"]|['\"]$", "");
                if (!cleanPart.isBlank()) {
                    addParsedGatewayRoute(service, targetSvc, cleanPart, strip, rewriteFrom, rewriteTo, gatewayRoutes);
                }
            }
        }
    }

    private static void addParsedGatewayRoute(
            String gatewayService,
            String targetService,
            String rawPathPattern,
            int stripPrefix,
            String rewriteFromPrefix,
            String rewriteToPrefix,
            List<GatewayRouteRule> gatewayRoutes) {
        if (rawPathPattern == null) return;
        String p = rawPathPattern.trim().replaceAll("^['\"]|['\"]$", "");
        if (!p.startsWith("/")) return;
        boolean wildcard = p.endsWith("/**") || p.endsWith("/*");
        String prefix = stripTrailingSlashExceptRoot(p.replaceAll("/\\*\\*$", "").replaceAll("/\\*$", ""));
        gatewayRoutes.add(new GatewayRouteRule(gatewayService, prefix, wildcard, targetService, stripPrefix, rewriteFromPrefix, rewriteToPrefix));
    }

    private static String[] parseRewritePathPrefixes(String rawRegex, String rawReplacement) {
        if (rawRegex == null || rawReplacement == null) return null;
        String lhs = rawRegex.trim().replaceAll("^['\"]|['\"]$", "");
        String rhs = rawReplacement.trim().replaceAll("^['\"]|['\"]$", "");
        String from = lhs.replaceFirst("[(\\[*+?\\\\$].*$", "");
        String to = rhs.replaceFirst("[\\\\$].*$", "");
        from = stripTrailingSlashExceptRoot(from);
        to = stripTrailingSlashExceptRoot(to);
        if (!from.startsWith("/") || !to.startsWith("/")) return null;
        return new String[]{from, to};
    }

    private static String stripTrailingSlashExceptRoot(String path) {
        if (path == null || path.isBlank()) return "";
        String t = path.trim();
        while (t.length() > 1 && t.endsWith("/")) {
            t = t.substring(0, t.length() - 1);
        }
        return t;
    }

    static String projectGatewayPath(GatewayRouteRule rule, String fullEpPath) {
        if (rule == null || fullEpPath == null || !fullEpPath.startsWith("/")) return null;
        int qIdx = fullEpPath.indexOf('?');
        String epPath = qIdx >= 0 ? fullEpPath.substring(0, qIdx) : fullEpPath;
        String query = qIdx >= 0 ? fullEpPath.substring(qIdx) : "";
        String prefix = rule.pathPrefix();
        if (prefix == null || !prefix.startsWith("/")) return null;

        if (rule.rewriteFromPrefix() != null && rule.rewriteToPrefix() != null) {
            String from = rule.rewriteFromPrefix();
            String to = rule.rewriteToPrefix();
            if (!rule.wildcard()) {
                return epPath.equals(to) ? from + query : null;
            }
            if ("/".equals(to)) {
                return normalizeEndpointPath(from, epPath) + query;
            }
            if (epPath.equals(to)) {
                return from + query;
            }
            if (epPath.startsWith(to + "/")) {
                return normalizeEndpointPath(from, epPath.substring(to.length())) + query;
            }
            return null;
        }

        if (rule.stripPrefix() > 0) {
            List<String> segs = new ArrayList<>();
            for (String s : prefix.split("/")) {
                if (!s.isEmpty()) segs.add(s);
            }
            int n = Math.min(rule.stripPrefix(), segs.size());
            String strippedPart = n == 0 ? "" : "/" + String.join("/", segs.subList(0, n));
            String forwardedPrefix = n < segs.size() ? "/" + String.join("/", segs.subList(n, segs.size())) : "";
            if (forwardedPrefix.isEmpty()) {
                return normalizeEndpointPath(strippedPart, epPath) + query;
            }
            if (!rule.wildcard()) {
                return epPath.equals(forwardedPrefix) ? normalizeEndpointPath(strippedPart, epPath) + query : null;
            }
            if (epPath.equals(forwardedPrefix) || epPath.startsWith(forwardedPrefix + "/")) {
                return normalizeEndpointPath(strippedPart, epPath) + query;
            }
            return null;
        }

        if (!rule.wildcard()) {
            return epPath.equals(prefix) ? epPath + query : null;
        }
        if ("/".equals(prefix) || epPath.equals(prefix) || epPath.startsWith(prefix + "/")) {
            return epPath + query;
        }
        return null;
    }

    private static void projectGatewayEntryEndpoints(
            List<DetectedEndpointDTO> endpoints,
            Set<String> endpointKeys,
            List<GatewayRouteRule> gatewayRoutes,
            List<String> detectedServices) {
        if (gatewayRoutes == null || gatewayRoutes.isEmpty() || endpoints.isEmpty()) return;
        List<DetectedEndpointDTO> snapshot = new ArrayList<>(endpoints);
        Set<String> projectedDownstreamByGateway = new HashSet<>();
        for (GatewayRouteRule rule : gatewayRoutes) {
            for (DetectedEndpointDTO ep : snapshot) {
                if (!rule.targetService().equalsIgnoreCase(ep.getService()) || isHealthEndpointPath(ep.getPath())) continue;
                String gwPath = projectGatewayPath(rule, ep.getPath());
                if (gwPath == null) continue;
                String downstreamKey = (rule.gatewayService() + "->" + ep.getService() + ":" + ep.getMethod() + ":" + ep.getPath()).toLowerCase(Locale.ROOT);
                if (!projectedDownstreamByGateway.add(downstreamKey)) continue;
                String key = (rule.gatewayService() + ":" + ep.getMethod() + ":" + gwPath).toLowerCase(Locale.ROOT);
                if (endpointKeys.add(key)) {
                    List<String> down = new ArrayList<>();
                    down.add(ep.getService());
                    if (ep.getDownstreamTargets() != null) {
                        for (String t : ep.getDownstreamTargets()) if (!down.contains(t)) down.add(t);
                    }
                    endpoints.add(DetectedEndpointDTO.builder()
                            .service(rule.gatewayService())
                            .method(ep.getMethod())
                            .path(gwPath)
                            .source("Gateway Route -> " + ep.getService() + " (" + ep.getSource() + ")")
                            .expectedStatus(ep.getExpectedStatus())
                            .requestBodyType(ep.getRequestBodyType())
                            .responseBodyType(ep.getResponseBodyType())
                            .sampleJsonBody(ep.getSampleJsonBody())
                            .requiresAuth(ep.getRequiresAuth())
                            .requiredRoles(ep.getRequiredRoles())
                            .responseFields(ep.getResponseFields())
                            .validationHints(ep.getValidationHints())
                            .downstreamTargets(down)
                            .build());
                }
            }
        }
    }

    private static boolean isHealthEndpointPath(String path) {
        if (path == null) return false;
        String low = path.toLowerCase(Locale.ROOT);
        return low.equals("/health") || low.equals("/healthz") || low.equals("/ready") || low.equals("/readyz")
                || low.startsWith("/actuator/health") || low.startsWith("/actuator/info");
    }

    private static void enrichEndpointContractAndTopology(
            DetectedEndpointDTO ep,
            Map<String, Map<String, String>> responseSchemas,
            Map<String, List<String>> dtoValidationHints,
            Map<String, Set<String>> serviceOutboundTargets,
            PreflightCheckResponseDTO dto) {
        if (ep == null) return;
        // 1. Validation hints from request DTO
        if (ep.getValidationHints() == null && ep.getRequestBodyType() != null && dtoValidationHints != null) {
            List<String> hints = dtoValidationHints.get(ep.getRequestBodyType());
            if (hints != null && !hints.isEmpty()) ep.setValidationHints(new ArrayList<>(hints));
        }
        // 2. Verifiable response JSON pointers from response DTO schema
        Set<String> respPtrs = new LinkedHashSet<>();
        if (ep.getResponseFields() != null) respPtrs.addAll(ep.getResponseFields());
        if (ep.getResponseBodyType() != null && responseSchemas != null) {
            Map<String, String> rFields = responseSchemas.get(ep.getResponseBodyType());
            String ptrPrefix = (!"ApiResponse".equals(ep.getResponseBodyType())
                    && responseSchemas.containsKey("ApiResponse")
                    && responseSchemas.get("ApiResponse").containsKey("data")) ? "/data/" : "/";
            if (rFields != null) {
                for (String f : rFields.keySet()) {
                    String low = f.toLowerCase(Locale.ROOT);
                    if (low.equals("id") || low.endsWith("id") || low.equals("uuid") || low.contains("code") || low.contains("sku")
                            || low.contains("token") || low.equals("jwt") || (low.equals("status") && !"ApiResponse".equals(ep.getResponseBodyType()))
                            || low.contains("number") || low.equals("key")) {
                        respPtrs.add(ptrPrefix + f);
                    }
                }
                if (respPtrs.isEmpty() && !rFields.isEmpty()) {
                    String firstKey = rFields.keySet().iterator().next();
                    if (!"status".equalsIgnoreCase(firstKey) && !"message".equalsIgnoreCase(firstKey)) {
                        respPtrs.add(ptrPrefix + firstKey);
                    }
                }
            }
        }
        if (!respPtrs.isEmpty()) ep.setResponseFields(new ArrayList<>(respPtrs));

        // 3. Downstream targets & Top-Down Journey Role + Fan-out Score
        Set<String> targets = new LinkedHashSet<>();
        if (ep.getDownstreamTargets() != null) targets.addAll(ep.getDownstreamTargets());
        if (serviceOutboundTargets != null && ep.getService() != null) {
            targets.addAll(serviceOutboundTargets.getOrDefault(ep.getService(), Set.of()));
        }
        if (dto != null && dto.getServiceDependencies() != null && ep.getService() != null) {
            Set<String> infra = new HashSet<>(dto.getInfrastructureServices() != null ? dto.getInfrastructureServices() : List.of());
            for (String dep : dto.getServiceDependencies().getOrDefault(ep.getService(), List.of())) {
                if (!infra.contains(dep) && !dep.equalsIgnoreCase(ep.getService())) targets.add(dep);
            }
        }
        if (!targets.isEmpty()) ep.setDownstreamTargets(new ArrayList<>(targets));

        String lowPath = (ep.getPath() != null ? ep.getPath() : "").toLowerCase(Locale.ROOT);
        String verb = ep.getMethod() != null ? ep.getMethod().toUpperCase(Locale.ROOT) : "GET";
        String lowSvc = (ep.getService() != null ? ep.getService() : "").toLowerCase(Locale.ROOT);
        boolean isGateway = lowSvc.contains("gateway") || lowSvc.contains("bff") || lowSvc.equals("edge") || lowSvc.startsWith("edge-")
                || (ep.getSource() != null && ep.getSource().startsWith("Gateway Route"));
        boolean isAuth = "POST".equals(verb) && (lowPath.contains("/auth/") || lowPath.endsWith("/login") || lowPath.endsWith("/signin")
                || lowPath.endsWith("/register") || lowPath.endsWith("/signup") || lowPath.endsWith("/token"));
        boolean isWorkflowAction = Set.of("POST", "PUT", "PATCH").contains(verb) && (lowPath.contains("checkout") || lowPath.contains("order")
                || lowPath.contains("pay") || lowPath.contains("charge") || lowPath.contains("transfer") || lowPath.contains("reserve")
                || lowPath.contains("confirm") || lowPath.contains("approve") || lowPath.contains("process") || lowPath.contains("submit")
                || lowPath.contains("dispatch") || lowPath.contains("fulfill") || lowPath.contains("assign") || lowPath.contains("booking")
                || !targets.isEmpty());

        boolean isAuxiliary = lowPath.contains("/ai/") || lowPath.endsWith("/chat") || lowPath.contains("/generate-")
                || lowPath.contains("/suggest-") || lowPath.endsWith("/inactive") || lowPath.endsWith("/invoice-pdf")
                || lowPath.endsWith("/forgot-password") || lowPath.endsWith("/reset-password") || lowPath.endsWith("/logout");
        String role;
        if (isHealthEndpointPath(lowPath)) role = "HEALTH_FALLBACK";
        else if (isAuth) role = "AUTH_ENTRY";
        else if (isAuxiliary) role = "STATE_VERIFICATION";
        else if (isWorkflowAction) role = "CROSS_SERVICE_WORKFLOW";
        else if ("POST".equals(verb) && !lowPath.contains("{")) role = "PREREQUISITE_SEED";
        else if ("GET".equals(verb)) role = "STATE_VERIFICATION";
        else if ("DELETE".equals(verb)) role = "CLEANUP_COMPENSATION";
        else role = "CROSS_SERVICE_WORKFLOW";
        ep.setJourneyRole(role);

        int score = 10;
        if (isGateway) score += 35;
        score += targets.size() * 25;
        if (isAuxiliary) score -= 8;
        else if ("AUTH_ENTRY".equals(role)) score += 30;
        else if ("CROSS_SERVICE_WORKFLOW".equals(role)) score += 25;
        else if ("PREREQUISITE_SEED".equals(role)) score += 20;
        else if ("STATE_VERIFICATION".equals(role)) score += (lowPath.contains("{") ? 12 : 6);
        else if ("CLEANUP_COMPENSATION".equals(role)) score -= 15;
        else if ("HEALTH_FALLBACK".equals(role)) score = 1;
        ep.setFanOutScore(Math.max(1, score));
    }

    private static String extractConfigScalarValue(String line) {
        if (line == null) return null;
        int sep = line.indexOf('=');
        if (sep < 0) sep = line.indexOf(':');
        if (sep < 0) return null;
        String raw = line.substring(sep + 1).trim().replaceAll("^[\"']|[\"']$", "");
        String resolved = resolveDefaultPlaceholders(raw);
        return resolved.contains("$") || resolved.isEmpty() ? null : resolved;
    }

    private static Integer parseConfigPort(String val) {
        if (val == null || !val.matches("\\d{2,5}")) return null;
        int p = Integer.parseInt(val);
        return (p >= 1 && p <= 65535) ? p : null;
    }

    private static void recordHostDependency(String serviceName, String text, Map<String, List<String>> serviceDependencies) {
        if (serviceName == null || text == null || serviceDependencies == null) return;
        for (Pattern p : List.of(JDBC_HOST_PATTERN, KV_HOST_PATTERN)) {
            Matcher m = p.matcher(text);
            while (m.find()) {
                String host = m.group(1).trim();
                if (!host.isEmpty() && !host.equalsIgnoreCase("localhost") && !host.equals("127.0.0.1")) {
                    List<String> deps = serviceDependencies.computeIfAbsent(serviceName, k -> new ArrayList<>());
                    if (!deps.contains(host)) deps.add(host);
                }
            }
        }
    }

    private void inspectComposeServiceEnvironmentAndDb(
            String serviceName,
            Map<?, ?> serviceConfig,
            List<DatabaseCheckDTO> databaseChecks,
            Map<String, RequiredEnvVarDTO> envVarMap,
            Map<String, List<String>> serviceDependencies,
            Map<String, Map<String, String>> composeEnvAliases,
            Map<String, Map<String, String>> composeEnvTemplates,
            Map<String, String> envFiles,
            Map<String, String> rootDotEnv) {

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

        Map<String, String> merged = mergedServiceEnvironment(serviceConfig, envFiles);
        for (Map.Entry<String, String> e : merged.entrySet()) {
            processComposeEnvEntry(serviceName, e.getKey(), e.getValue(), databaseChecks, envVarMap,
                    serviceDependencies, composeEnvAliases, composeEnvTemplates, rootDotEnv);
        }
        if (serviceConfig.get("environment") instanceof List<?> envList) {
            for (Object item : envList) {
                if (item == null) continue;
                String raw = String.valueOf(item).trim();
                if (!raw.isEmpty() && raw.indexOf('=') < 0) {
                    String dotVal = rootDotEnv != null ? rootDotEnv.get(raw) : null;
                    registerEnvVar(envVarMap, raw, serviceName, dotVal, "docker-compose.yml");
                }
            }
        }
    }

    private void processComposeEnvEntry(
            String serviceName,
            String key,
            String val,
            List<DatabaseCheckDTO> databaseChecks,
            Map<String, RequiredEnvVarDTO> envVarMap,
            Map<String, List<String>> serviceDependencies,
            Map<String, Map<String, String>> composeEnvAliases,
            Map<String, Map<String, String>> composeEnvTemplates,
            Map<String, String> rootDotEnv) {

        recordHostDependency(serviceName, resolvePlaceholders(val, rootDotEnv), serviceDependencies);
        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(val);
        List<String> placeholders = new ArrayList<>();
        while (m.find()) {
            String pName = m.group(1);
            String defVal = m.group(2);
            String dotVal = rootDotEnv != null ? rootDotEnv.get(pName) : null;
            String effectiveDef = (dotVal != null && !dotVal.isBlank()) ? dotVal : defVal;
            placeholders.add(pName);
            registerEnvVar(envVarMap, pName, serviceName, effectiveDef, "docker-compose.yml");
        }
        if (!placeholders.isEmpty()) {
            String partiallyResolved = resolvePlaceholders(val, rootDotEnv);
            if (partiallyResolved.contains("${")) {
                if (placeholders.size() == 1 && !key.equals(placeholders.get(0)) && val.trim().equals("${" + placeholders.get(0) + "}")) {
                    composeEnvAliases.computeIfAbsent(serviceName, k -> new LinkedHashMap<>()).put(key, placeholders.get(0));
                } else {
                    composeEnvTemplates.computeIfAbsent(serviceName, k -> new LinkedHashMap<>()).put(key, partiallyResolved);
                }
            }
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
            String resolvedVal = resolvePlaceholders(val, rootDotEnv);
            databaseChecks.add(DatabaseCheckDTO.builder()
                    .service(serviceName)
                    .dbType(dbType)
                    .configKey("docker-compose.yml:" + key)
                    .connectionUrl(sanitizeConnectionPreview(val))
                    .requiredEnvVars(placeholders)
                    .status(!resolvedVal.contains("${") ? "CONFIGURED_IN_COMPOSE" : "REQUIRES_ENV_OR_SECRET")
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
        if (!secret && (defaultValue == null || defaultValue.isBlank())) {
            defaultValue = sandboxFallbackEnvDefault(cleanName);
        }
        boolean hasDefault = defaultValue != null && !defaultValue.isBlank();
        String cleanService = service != null && !service.isBlank() ? service.trim() : "global";
        RequiredEnvVarDTO existing = envVarMap.get(cleanName);
        if (existing != null) {
            List<String> svcs = existing.getServices();
            if (svcs == null) {
                svcs = new ArrayList<>();
                if (existing.getService() != null && !existing.getService().isBlank() && !"global".equalsIgnoreCase(existing.getService())) {
                    svcs.add(existing.getService());
                }
                existing.setServices(svcs);
            }
            if (!"global".equalsIgnoreCase(cleanService) && !svcs.contains(cleanService)) {
                svcs.add(cleanService);
                if (existing.getService() == null || "global".equalsIgnoreCase(existing.getService())) {
                    existing.setService(cleanService);
                }
            }
            // A later reference with a default (e.g. ${DB_PASSWORD:postgres}) means no input is needed.
            if (hasDefault && !existing.isDefaultPresent()) {
                existing.setDefaultPresent(true);
                existing.setRequired(false);
                if (!secret && existing.getDefaultValue() == null) existing.setDefaultValue(defaultValue);
            }
            return;
        }
        List<String> initialServices = new ArrayList<>();
        if (!"global".equalsIgnoreCase(cleanService)) {
            initialServices.add(cleanService);
        }
        envVarMap.put(cleanName, RequiredEnvVarDTO.builder()
                .name(cleanName)
                .service(cleanService)
                .services(initialServices)
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

    public static String sandboxFallbackEnvDefault(String name) {
        if (name == null) return null;
        return switch (name.trim().toUpperCase(Locale.ROOT)) {
            case "MAIL_HOST", "SMTP_HOST", "SPRING_MAIL_HOST" -> "localhost";
            case "MAIL_PORT", "SMTP_PORT", "SPRING_MAIL_PORT" -> "1025";
            case "MAIL_USERNAME", "SMTP_USERNAME", "SPRING_MAIL_USERNAME", "MAIL_FROM", "SMTP_FROM" -> "sandbox@mavis.local";
            case "APP_URL", "FRONTEND_URL", "CLIENT_URL", "ALLOWED_ORIGINS", "CORS_ALLOWED_ORIGINS" -> "http://localhost:3000";
            default -> null;
        };
    }

    /** Sandbox secrets that are plain random material (passwords, signing keys), never URLs or connection strings. */
    public static boolean isGeneratableSandboxSecret(String name) {
        String u = name == null ? "" : name.toUpperCase(Locale.ROOT);
        return "SANDBOX".equals(classifySecretScope(u))
                && !(u.contains("CONNECTION") || u.contains("URL") || u.contains("URI") || u.contains("DSN") || u.contains("HOST"));
    }

    /** Single source of truth for how each variable is satisfied at run time; the UI only renders this. */
    public static void assignEnvResolutions(PreflightCheckResponseDTO dto) {
        if (dto == null || dto.getRequiredEnvVars() == null) return;
        for (RequiredEnvVarDTO v : dto.getRequiredEnvVars()) {
            if (v == null || v.getName() == null || v.getResolution() != null) continue;
            List<String> owners = v.getServices() != null && !v.getServices().isEmpty()
                    ? v.getServices()
                    : (v.getService() != null ? List.of(v.getService()) : List.of());
            boolean secret = "SECRET".equals(v.getCategory()) || "DB_SECRET".equals(v.getCategory());
            boolean fromInfra = secret && owners.stream().anyMatch(s -> databaseCredentialFor(v.getName(), s, dto) != null);
            v.setResolution(fromInfra ? "SANDBOX_INFRA"
                    : v.isDefaultPresent() ? "DEFAULT"
                    : !secret ? "ENV"
                    : isGeneratableSandboxSecret(v.getName()) ? "GENERATED"
                    : "USER_REQUIRED");
        }
    }

    /** Reuses a sandbox database container credential for an application variable, matching the specific DB container for the service first. */
    public static String databaseCredentialFor(String name, String appService, PreflightCheckResponseDTO pre) {
        if (name == null || pre == null) return null;
        return databaseCredentialFor(name, appService, pre.getServiceDatabaseCredentials(), pre.getServiceDependencies(), pre.getSandboxDatabaseCredentials());
    }

    public static String databaseCredentialFor(
            String name,
            String appService,
            Map<String, Map<String, String>> perService,
            Map<String, List<String>> serviceDependencies,
            Map<String, String> fallbackCredentials) {
        if (name == null) return null;
        if (appService != null && perService != null && !perService.isEmpty()) {
            List<String> deps = serviceDependencies != null ? serviceDependencies.getOrDefault(appService, List.of()) : List.of();
            for (String dep : deps) {
                Map<String, String> exact = perService.get(dep);
                if (exact != null) {
                    String val = databaseCredentialFor(name, exact);
                    if (val != null) return val;
                }
            }
            String appStem = appService.toLowerCase(Locale.ROOT).replaceAll("-(service|api|app|backend|server)$", "");
            for (Map.Entry<String, Map<String, String>> entry : perService.entrySet()) {
                String dbLower = entry.getKey().toLowerCase(Locale.ROOT);
                if (!appStem.isEmpty() && (dbLower.startsWith(appStem) || appStem.startsWith(dbLower.replaceAll("-(db|postgres|mysql|mongo)$", "")))) {
                    String val = databaseCredentialFor(name, entry.getValue());
                    if (val != null) return val;
                }
            }
        }
        return databaseCredentialFor(name, fallbackCredentials);
    }

    /** Reuses a sandbox database container credential for an application variable such as DB_PASSWORD or DB_USERNAME. */
    public static String databaseCredentialFor(String name, Map<String, String> credentials) {
        if (name == null || credentials == null || credentials.isEmpty()) return null;
        String u = name.toUpperCase(Locale.ROOT);
        boolean rabbit = u.contains("RABBIT") || u.contains("AMQP");
        if (u.contains("REDIS") || rabbit) {
            // Cache/broker credentials never leak into DB_* variables and vice versa.
            String key = u.contains("PASS") ? (rabbit ? "RABBITMQ_PASSWORD" : "REDIS_PASSWORD")
                    : (rabbit && u.contains("USER")) ? "RABBITMQ_DEFAULT_USER" : null;
            return key == null ? null : credentials.get(key);
        }
        if (!u.matches(".*(DB|DATASOURCE|DATABASE|POSTGRES|MYSQL|MARIADB|MONGO|SQL|PG).*")) return null;
        List<String> keys = u.contains("PASS") ? DB_PASSWORD_KEYS
                : u.contains("USER") ? DB_USER_KEYS
                : (u.endsWith("_NAME") || u.endsWith("_DB") || u.endsWith("DATABASE")) ? DB_NAME_KEYS
                : List.of();
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

    private static final Pattern PY_REDIS_REQ = Pattern.compile("(?m)^\\s*redis\\s*([=<>~!]|$)");
    private static final Pattern PY_PIKA_REQ = Pattern.compile("(?m)^\\s*pika\\s*([=<>~!]|$)");

    public static boolean isCacheOrBrokerType(String dbType) {
        return "Redis".equals(dbType) || "Kafka".equals(dbType) || "RabbitMQ".equals(dbType);
    }

    private static boolean isDependencyManifestOrConfig(String lowerPath) {
        if (lowerPath.contains("docker-compose") || lowerPath.endsWith("compose.yml") || lowerPath.endsWith("compose.yaml")) return false;
        String base = lowerPath.contains("/") ? lowerPath.substring(lowerPath.lastIndexOf('/') + 1) : lowerPath;
        return base.equals("pom.xml") || base.equals("build.gradle") || base.equals("build.gradle.kts") || base.equals("package.json")
                || base.endsWith(".csproj") || base.equals("directory.packages.props") || base.equals("requirements.txt")
                || base.equals("pyproject.toml") || base.equals("go.mod") || base.startsWith("appsettings")
                || base.endsWith(".yml") || base.endsWith(".yaml") || base.endsWith(".properties") || base.endsWith(".env");
    }

    /** Client libraries / config keys that prove an app talks to Redis, Kafka or RabbitMQ. */
    static List<String> detectCacheAndBrokerTypes(String lower) {
        List<String> out = new ArrayList<>();
        if (lower.contains("spring-boot-starter-data-redis") || lower.contains("spring.data.redis") || lower.contains("spring.redis")
                || lower.contains("redis://") || lower.contains("\"ioredis\"") || lower.contains("\"redis\":") || lower.contains("stackexchange.redis")
                || lower.contains("go-redis") || lower.contains("redis_host") || lower.contains("redis_url") || PY_REDIS_REQ.matcher(lower).find()) {
            out.add("Redis");
        }
        if (lower.contains("spring-kafka") || lower.contains("spring.kafka") || lower.contains("\"kafkajs\"") || lower.contains("confluent.kafka")
                || lower.contains("confluent-kafka") || lower.contains("kafka-python") || lower.contains("segmentio/kafka-go")
                || lower.contains("kafka_bootstrap_servers") || lower.contains("kafka_brokers")) {
            out.add("Kafka");
        }
        if (lower.contains("spring-boot-starter-amqp") || lower.contains("spring.rabbitmq") || lower.contains("\"amqplib\"")
                || lower.contains("rabbitmq.client") || lower.contains("masstransit.rabbitmq") || lower.contains("amqp://")
                || lower.contains("rabbitmq_host") || lower.contains("amqp_url") || PY_PIKA_REQ.matcher(lower).find()) {
            out.add("RabbitMQ");
        }
        return out;
    }

    private static String inferDbTypeFromLine(String lower) {
        if (lower.contains("h2:") || lower.contains("com.h2database") || lower.contains(">h2<")) return "H2 In-Memory";
        if (lower.contains("postgres") || lower.contains("npgsql")) return "PostgreSQL";
        if (lower.contains("mariadb")) return "MariaDB";
        if (lower.contains("mysql")) return "MySQL";
        if (lower.contains("mongo")) return "MongoDB";
        if (lower.contains("redis")) return "Redis";
        if (lower.contains("sqlserver") || lower.contains("mssql") || lower.contains("sqlclient")) return "SQL Server";
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
        String cleaned = SecretRedactor.redactString(raw)
                .replaceAll("(?i)(password|pwd)\\s*[:=]\\s*[^;&\\s\"']+", "$1=***");
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
        String candAlpha = candLower.replaceAll("[^a-z0-9]", "");
        if (!candAlpha.isEmpty()) {
            for (String svc : detectedServices) {
                if (candAlpha.equals(svc.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", ""))) {
                    return svc;
                }
            }
        }
        String candStem = serviceAlphanumericStem(candLower);
        if (candStem.length() >= 3) {
            String uniqueStemMatch = null;
            int stemMatches = 0;
            for (String svc : detectedServices) {
                if (candStem.equals(serviceAlphanumericStem(svc))) {
                    uniqueStemMatch = svc;
                    stemMatches++;
                }
            }
            if (stemMatches == 1) return uniqueStemMatch;
        }
        String bestMatch = null;
        for (String svc : detectedServices) {
            String svcLower = svc.toLowerCase(Locale.ROOT);
            String svcAlpha = svcLower.replaceAll("[^a-z0-9]", "");
            boolean alphaContains = candAlpha.length() >= 4 && svcAlpha.length() >= 4
                    && (candAlpha.contains(svcAlpha) || svcAlpha.contains(candAlpha));
            if (candLower.endsWith("-" + svcLower)
                    || svcLower.endsWith("-" + candLower)
                    || candLower.startsWith(svcLower + "-")
                    || svcLower.startsWith(candLower + "-")
                    || candLower.contains(svcLower)
                    || svcLower.contains(candLower)
                    || alphaContains) {
                if (bestMatch == null || svc.length() > bestMatch.length()) {
                    bestMatch = svc;
                }
            }
        }
        return bestMatch;
    }

    private static String serviceAlphanumericStem(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String lower = cleanServiceCandidate(raw).toLowerCase(Locale.ROOT)
                .replaceFirst("^fruit[-_]", "")
                .replaceAll("[^a-z0-9]", "")
                .replaceFirst("(services|service|api|app|svc|server|backend|container)$", "");
        return lower;
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
        for (int i = startIdx; i < parts.length - 1; i++) {
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

    private Integer extractTargetPort(Map<?, ?> serviceConfig, Map<String, String> envFiles, Map<String, String> rootDotEnv) {
        Integer exposed = firstPort(serviceConfig.get("expose"), rootDotEnv);
        if (exposed != null) return exposed;
        Integer published = firstPort(serviceConfig.get("ports"), rootDotEnv);
        if (published != null) return published;
        Map<String, String> resolvedEnv = new LinkedHashMap<>();
        mergedServiceEnvironment(serviceConfig, envFiles).forEach((k, v) -> resolvedEnv.put(k, resolvePlaceholders(v, rootDotEnv)));
        Integer fromEnv = portFromEnvironment(resolvedEnv);
        return fromEnv != null ? fromEnv : 8080;
    }

    private static Integer firstPort(Object node, Map<String, String> dotEnv) {
        if (!(node instanceof List<?> list)) return null;
        for (Object p : list) {
            if (p == null) continue;
            String str = p instanceof Map<?, ?> longSyntax ? String.valueOf(longSyntax.get("target")) : String.valueOf(p).trim();
            str = resolvePlaceholders(str, dotEnv).replaceAll("/(tcp|udp)$", "");
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

    private static void collectDatabaseCredentials(
            String image,
            Map<?, ?> serviceConfig,
            Map<String, String> credentials,
            Map<String, String> envFiles,
            Map<String, String> rootDotEnv) {
        Map<String, String> env = mergedServiceEnvironment(serviceConfig, envFiles);
        List<String> keys = new ArrayList<>(DB_PASSWORD_KEYS);
        keys.addAll(DB_USER_KEYS);
        keys.addAll(DB_NAME_KEYS);
        for (String key : keys) {
            String raw = env.get(key);
            String value = raw != null ? resolvePlaceholders(raw, rootDotEnv) : null;
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

    public static void pruneSpeculativeConnectionString(Map<String, RequiredEnvVarDTO> envMap, List<DatabaseCheckDTO> dbChecks) {
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
        String lowerName = serviceName.toLowerCase(Locale.ROOT);
        Object imageObj = serviceConfig.get("image");
        String img = imageObj != null ? String.valueOf(imageObj).toLowerCase(Locale.ROOT) : "";
        Object buildObj = serviceConfig.get("build");
        String build = buildObj != null ? String.valueOf(buildObj).toLowerCase(Locale.ROOT) : "";

        if (lowerName.contains("dotnet") || lowerName.contains("csharp") || img.contains("dotnet") || img.contains("aspnet") || build.contains("dotnet")) {
            return img.contains("alpine") ? "dotnet-musl" : "dotnet";
        }
        if (img.contains("node") || img.contains("bun") || img.contains("deno") || build.contains("node")) {
            return "node";
        }
        if (img.contains("python") || img.contains("uvicorn") || img.contains("fastapi") || build.contains("python")) {
            return "python";
        }
        if (img.contains("golang") || img.startsWith("go:") || build.contains("golang")) {
            return "go";
        }
        return "java";
    }

    public static Map<String, String> parseDotEnvContent(String content) {
        if (content == null || content.isBlank()) return Map.of();
        Map<String, String> out = new LinkedHashMap<>();
        for (String rawLine : content.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            if (line.startsWith("export ") && line.length() > 7) {
                line = line.substring(7).trim();
            }
            int eq = line.indexOf('=');
            if (eq <= 0) continue;
            String key = line.substring(0, eq).trim();
            if (!key.matches("[A-Za-z_][A-Za-z0-9_]*")) continue;
            String val = line.substring(eq + 1).trim();
            if (val.length() >= 2 && ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'")))) {
                val = val.substring(1, val.length() - 1);
            } else {
                int hashIdx = val.indexOf(" #");
                if (hashIdx >= 0) val = val.substring(0, hashIdx).trim();
            }
            out.put(key, val);
        }
        return out;
    }

    static String normalizeRelativeEnvPath(String rawPath) {
        if (rawPath == null) return null;
        String norm = rawPath.trim().replace('\\', '/');
        while (norm.startsWith("./")) norm = norm.substring(2);
        if (norm.isEmpty() || norm.startsWith("/") || norm.contains("../") || norm.equals("..")) {
            return null;
        }
        return norm;
    }

    static List<String> extractEnvFilePaths(Object envFileNode) {
        if (envFileNode == null) return List.of();
        List<String> paths = new ArrayList<>();
        if (envFileNode instanceof String s) {
            String norm = normalizeRelativeEnvPath(s);
            if (norm != null) paths.add(norm);
        } else if (envFileNode instanceof List<?> list) {
            for (Object item : list) {
                String raw = null;
                if (item instanceof String s) raw = s;
                else if (item instanceof Map<?, ?> m && m.get("path") != null) raw = String.valueOf(m.get("path"));
                String norm = normalizeRelativeEnvPath(raw);
                if (norm != null && !paths.contains(norm)) paths.add(norm);
            }
        }
        return paths;
    }

    static Map<String, String> mergedServiceEnvironment(Map<?, ?> serviceConfig, Map<String, String> envFiles) {
        Map<String, String> merged = new LinkedHashMap<>();
        if (serviceConfig == null) return merged;
        if (envFiles != null && !envFiles.isEmpty()) {
            for (String relPath : extractEnvFilePaths(serviceConfig.get("env_file"))) {
                String fileContent = envFiles.get(relPath);
                if (fileContent != null) {
                    merged.putAll(parseDotEnvContent(fileContent));
                }
            }
        }
        merged.putAll(composeEnvironment(serviceConfig.get("environment")));
        return merged;
    }

    private static boolean isDotEnvFileName(String baseName) {
        if (baseName == null) return false;
        String lower = baseName.toLowerCase(Locale.ROOT);
        return lower.equals(".env") || lower.startsWith(".env.") || lower.endsWith(".env");
    }

    public Map<String, String> collectDirectoryEnvFiles(Path baseDir) {
        if (baseDir == null || !Files.isDirectory(baseDir)) return Map.of();
        Map<String, String> out = new LinkedHashMap<>();
        try (Stream<Path> stream = Files.walk(baseDir, 4)) {
            List<Path> files = stream.filter(Files::isRegularFile)
                    .filter(p -> isDotEnvFileName(p.getFileName().toString()))
                    .filter(p -> !isIgnoredArchiveEntry(baseDir.relativize(p).toString()))
                    .limit(32)
                    .toList();
            for (Path f : files) {
                try {
                    if (Files.size(f) <= 65_536) {
                        String rel = normalizeRelativeEnvPath(baseDir.relativize(f).toString());
                        if (rel != null) out.put(rel, Files.readString(f, StandardCharsets.UTF_8));
                    }
                } catch (IOException ignored) {}
            }
        } catch (IOException ignored) {}
        return out;
    }

    public Map<String, String> collectSnapshotEnvFiles(Path storagePath, String composeEntryDir) {
        if (storagePath == null || !Files.exists(storagePath)) return Map.of();
        if (Files.isDirectory(storagePath)) {
            Path targetDir = (composeEntryDir == null || composeEntryDir.isBlank())
                    ? storagePath
                    : storagePath.resolve(composeEntryDir).normalize();
            return (targetDir.startsWith(storagePath) && Files.isDirectory(targetDir))
                    ? collectDirectoryEnvFiles(targetDir)
                    : collectDirectoryEnvFiles(storagePath);
        }
        String fileName = storagePath.getFileName().toString().toLowerCase(Locale.ROOT);
        if (fileName.endsWith(".yml") || fileName.endsWith(".yaml")) {
            return collectDirectoryEnvFiles(storagePath.getParent());
        }
        if (!fileName.endsWith(".zip")) return Map.of();
        Map<String, String> out = new LinkedHashMap<>();
        String prefix = (composeEntryDir == null || composeEntryDir.isBlank())
                ? ""
                : (composeEntryDir.replace('\\', '/').replaceAll("/+$", "") + "/");
        try (ZipFile zipFile = new ZipFile(storagePath.toFile())) {
            Enumeration<? extends ZipEntry> entries = zipFile.entries();
            while (entries.hasMoreElements() && out.size() < 32) {
                ZipEntry entry = entries.nextElement();
                if (entry.isDirectory() || entry.getSize() > 65_536) continue;
                String entryName = entry.getName().replace('\\', '/');
                if (isIgnoredArchiveEntry(entryName)) continue;
                String baseName = entryName.contains("/") ? entryName.substring(entryName.lastIndexOf('/') + 1) : entryName;
                if (!isDotEnvFileName(baseName)) continue;
                String rel;
                if (!prefix.isEmpty()) {
                    if (!entryName.startsWith(prefix)) continue;
                    rel = normalizeRelativeEnvPath(entryName.substring(prefix.length()));
                } else {
                    rel = normalizeRelativeEnvPath(stripGitHubRootPrefix(entryName));
                }
                if (rel == null) continue;
                try (InputStream is = zipFile.getInputStream(entry)) {
                    out.put(rel, new String(is.readNBytes(65_536), StandardCharsets.UTF_8));
                }
            }
        } catch (Exception ignored) {}
        return out;
    }

    static List<String> parseDockerfileVolumes(String dockerfileContent) {
        if (dockerfileContent == null || dockerfileContent.isBlank()) return List.of();
        List<String> vols = new ArrayList<>();
        Matcher m = DOCKERFILE_VOLUME_LINE_PATTERN.matcher(dockerfileContent);
        while (m.find()) {
            String spec = m.group(1).trim();
            if (spec.startsWith("[") && spec.contains("]")) {
                Matcher qm = Pattern.compile("[\"']([^\"']+)[\"']").matcher(spec);
                while (qm.find()) {
                    String candidate = qm.group(1).trim();
                    if (isSafeWritableVolumeTarget(candidate) && !vols.contains(candidate)) vols.add(candidate);
                }
            } else {
                for (String token : spec.split("[\\s,]+")) {
                    String candidate = token.replaceAll("^[\"']|[\"']$", "").trim();
                    if (isSafeWritableVolumeTarget(candidate) && !vols.contains(candidate)) vols.add(candidate);
                }
            }
        }
        return vols;
    }

    private static boolean isCandidateDockerfileName(String baseName) {
        if (baseName == null) return false;
        String lower = baseName.toLowerCase(Locale.ROOT);
        if (lower.equals("dockerfile")) return true;
        if (!lower.startsWith("dockerfile.")) return false;
        return !lower.endsWith(".bak") && !lower.endsWith(".orig") && !lower.contains("test");
    }

    private static boolean isBuildableManifestName(String baseName) {
        if (baseName == null) return false;
        String lower = baseName.toLowerCase(Locale.ROOT);
        if (lower.equals("pom.xml") || lower.equals("build.gradle") || lower.equals("build.gradle.kts")) return true;
        return lower.endsWith(".csproj") && !lower.contains("test");
    }

    public static List<DiscoveredDockerfile> discoverDockerfilesInDirectory(Path root) {
        if (root == null || !Files.isDirectory(root)) return List.of();
        List<String> relPaths = new ArrayList<>();
        List<String> manifestDirs = new ArrayList<>();
        try (Stream<Path> stream = Files.walk(root, 6)) {
            stream.filter(Files::isRegularFile)
                    .forEach(p -> {
                        String rel = root.relativize(p).toString().replace('\\', '/');
                        String fileName = p.getFileName().toString();
                        if (isIgnoredArchiveEntry(rel)) return;
                        if (isCandidateDockerfileName(fileName)) {
                            relPaths.add(rel);
                        } else if (isBuildableManifestName(fileName)) {
                            Path parent = p.getParent();
                            if (parent != null && (fileName.toLowerCase(Locale.ROOT).endsWith(".csproj") || Files.isDirectory(parent.resolve("src")))) {
                                String relDir = root.relativize(parent).toString().replace('\\', '/');
                                manifestDirs.add(relDir.isEmpty() ? "Dockerfile" : relDir + "/Dockerfile");
                            }
                        }
                    });
        } catch (IOException ignored) {}
        appendMissingManifestDockerfiles(relPaths, manifestDirs);
        return buildDiscoveredDockerfiles(relPaths, false);
    }

    public List<DiscoveredDockerfile> discoverDockerfilesInSnapshot(Path storagePath) {
        if (storagePath == null || !Files.exists(storagePath)) return List.of();
        if (Files.isDirectory(storagePath)) {
            return discoverDockerfilesInDirectory(storagePath);
        }
        if (!storagePath.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".zip")) {
            return List.of();
        }
        List<String> relPaths = new ArrayList<>();
        List<String> manifestFiles = new ArrayList<>();
        Set<String> dirsWithSrc = new HashSet<>();
        try (ZipFile zipFile = new ZipFile(storagePath.toFile())) {
            Enumeration<? extends ZipEntry> entries = zipFile.entries();
            while (entries.hasMoreElements() && relPaths.size() < 200) {
                ZipEntry entry = entries.nextElement();
                String entryName = entry.getName().replace('\\', '/');
                if (isIgnoredArchiveEntry(entryName)) continue;
                int srcIdx = entryName.indexOf("/src/");
                if (srcIdx > 0) dirsWithSrc.add(entryName.substring(0, srcIdx));
                else if (entryName.startsWith("src/")) dirsWithSrc.add(".");
                if (entry.isDirectory()) continue;
                String baseName = entryName.contains("/") ? entryName.substring(entryName.lastIndexOf('/') + 1) : entryName;
                if (isCandidateDockerfileName(baseName)) {
                    relPaths.add(entryName);
                } else if (isBuildableManifestName(baseName)) {
                    manifestFiles.add(entryName);
                }
            }
        } catch (Exception ignored) {}
        List<String> manifestDirs = new ArrayList<>();
        for (String mf : manifestFiles) {
            int slash = mf.lastIndexOf('/');
            String dir = slash >= 0 ? mf.substring(0, slash) : ".";
            String base = slash >= 0 ? mf.substring(slash + 1) : mf;
            if (base.toLowerCase(Locale.ROOT).endsWith(".csproj") || dirsWithSrc.contains(dir)) {
                manifestDirs.add(".".equals(dir) ? "Dockerfile" : dir + "/Dockerfile");
            }
        }
        appendMissingManifestDockerfiles(relPaths, manifestDirs);
        return buildDiscoveredDockerfiles(relPaths, true);
    }

    private static void appendMissingManifestDockerfiles(List<String> relPaths, List<String> manifestDockerfiles) {
        if (manifestDockerfiles == null || manifestDockerfiles.isEmpty()) return;
        Set<String> coveredDirs = new HashSet<>();
        for (String p : relPaths) {
            int slash = p.lastIndexOf('/');
            coveredDirs.add(slash >= 0 ? p.substring(0, slash) : ".");
        }
        for (String cand : manifestDockerfiles) {
            int slash = cand.lastIndexOf('/');
            String dir = slash >= 0 ? cand.substring(0, slash) : ".";
            if (coveredDirs.add(dir)) {
                relPaths.add(cand);
            }
        }
    }

    private static List<DiscoveredDockerfile> buildDiscoveredDockerfiles(List<String> rawRelPaths, boolean stripArchiveRootFromContext) {
        if (rawRelPaths == null || rawRelPaths.isEmpty()) return List.of();
        List<String> sorted = new ArrayList<>(rawRelPaths);
        sorted.sort(Comparator.comparingInt((String p) -> p.split("/").length).thenComparing(Comparator.naturalOrder()));

        Set<String> dirsWithPlainDockerfile = new HashSet<>();
        for (String p : sorted) {
            int slash = p.lastIndexOf('/');
            String dir = slash >= 0 ? p.substring(0, slash) : ".";
            String base = slash >= 0 ? p.substring(slash + 1) : p;
            if ("dockerfile".equalsIgnoreCase(base)) dirsWithPlainDockerfile.add(dir);
        }

        List<DiscoveredDockerfile> out = new ArrayList<>();
        Set<String> usedNames = new HashSet<>();
        for (String p : sorted) {
            if (out.size() >= 20) break;
            int slash = p.lastIndexOf('/');
            String rawDir = slash >= 0 ? p.substring(0, slash) : ".";
            String base = slash >= 0 ? p.substring(slash + 1) : p;
            if (!"dockerfile".equalsIgnoreCase(base) && dirsWithPlainDockerfile.contains(rawDir)) {
                continue;
            }
            String cleanRel = stripGitHubRootPrefix(p);
            int cleanSlash = cleanRel.lastIndexOf('/');
            String cleanDir = cleanSlash >= 0 ? cleanRel.substring(0, cleanSlash) : ".";
            String svcCandidate;
            if (!".".equals(cleanDir)) {
                String lastFolder = cleanDir.contains("/") ? cleanDir.substring(cleanDir.lastIndexOf('/') + 1) : cleanDir;
                svcCandidate = cleanServiceCandidate(lastFolder);
            } else {
                int firstSlash = p.indexOf('/');
                String firstSeg = firstSlash > 0 ? p.substring(0, firstSlash) : "";
                svcCandidate = (!firstSeg.isEmpty() && GITHUB_ZIP_ROOT_PATTERN.matcher(firstSeg).matches())
                        ? cleanServiceCandidate(firstSeg)
                        : "default-service";
            }
            if (svcCandidate.isBlank() || !RUNNER_NAME_PATTERN.matcher(svcCandidate).matches()) {
                svcCandidate = "default-service";
            }
            if (!"dockerfile".equalsIgnoreCase(base) && base.indexOf('.') > 0) {
                String suffix = cleanServiceCandidate(base.substring(base.indexOf('.') + 1));
                if (!suffix.isBlank() && !"prod".equalsIgnoreCase(suffix) && !"production".equalsIgnoreCase(suffix)
                        && usedNames.contains(svcCandidate.toLowerCase(Locale.ROOT))) {
                    svcCandidate = cleanServiceCandidate(svcCandidate + "-" + suffix);
                }
            }
            String uniqueName = svcCandidate;
            int idx = 2;
            while (!usedNames.add(uniqueName.toLowerCase(Locale.ROOT))) {
                uniqueName = cleanServiceCandidate(svcCandidate + "-" + (idx++));
            }
            String context = stripArchiveRootFromContext ? cleanDir : rawDir;
            out.add(new DiscoveredDockerfile(uniqueName, context.isEmpty() ? "." : context, base));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public void finalizeSandboxTopology(
            Path storagePath,
            PreflightCheckResponseDTO dto,
            String rawComposeYaml,
            Map<String, String> imageOverrides,
            Map<String, String> envFiles) {
        if (dto == null) return;
        List<String> warnings = dto.getSecurityWarnings() != null ? new ArrayList<>(dto.getSecurityWarnings()) : new ArrayList<>();
        boolean hasHardSecurityViolation = warnings.stream().anyMatch(w ->
                !w.contains("chưa có file docker-compose.yml")
                && !w.contains("Không tìm thấy file docker-compose")
                && !w.contains("Nội dung docker-compose rỗng"));
        if (hasHardSecurityViolation) {
            return;
        }

        Map<String, String> safeOverrides = imageOverrides != null ? imageOverrides : Map.of();
        Map<String, String> safeEnvFiles = envFiles != null ? envFiles : Map.of();
        Map<String, Object> rootMap = null;
        boolean synthesizedFromDockerfiles = false;
        List<String> topologyChanges = new ArrayList<>();

        if (rawComposeYaml == null || rawComposeYaml.isBlank()) {
            List<DiscoveredDockerfile> discovered = discoverDockerfilesInSnapshot(storagePath);
            if (discovered.isEmpty()) {
                return;
            }
            rootMap = new LinkedHashMap<>();
            Map<String, Object> synthServices = new LinkedHashMap<>();
            Set<String> infraSet = new HashSet<>(dto.getInfrastructureServices() != null ? dto.getInfrastructureServices() : List.of());
            List<String> existingApps = (dto.getDetectedServices() != null ? dto.getDetectedServices() : List.<String>of())
                    .stream().filter(s -> !infraSet.contains(s)).toList();

            List<String> finalDetected = new ArrayList<>();
            for (DiscoveredDockerfile df : discovered) {
                String canonicalName = df.serviceName();
                if (discovered.size() == 1 && existingApps.size() == 1) {
                    canonicalName = existingApps.get(0);
                } else {
                    String matched = matchDetectedService(df.serviceName(), existingApps);
                    if (matched != null && !synthServices.containsKey(matched)) {
                        canonicalName = matched;
                    }
                }
                if (!canonicalName.equals(df.serviceName())) {
                    migrateServiceMetadata(dto, df.serviceName(), canonicalName);
                }
                if (!"default-service".equals(canonicalName) && discovered.size() == 1) {
                    migrateServiceMetadata(dto, "default-service", canonicalName);
                }

                int port = dto.getServicePorts() != null ? dto.getServicePorts().getOrDefault(canonicalName, 8080) : 8080;
                Map<String, Object> buildNode = new LinkedHashMap<>();
                buildNode.put("context", df.context());
                buildNode.put("dockerfile", df.dockerfile());
                Map<String, Object> svcNode = new LinkedHashMap<>();
                svcNode.put("build", buildNode);
                svcNode.put("expose", new ArrayList<>(List.of(String.valueOf(port))));
                synthServices.put(canonicalName, svcNode);
                finalDetected.add(canonicalName);

                dto.getServicePorts().putIfAbsent(canonicalName, port);
                dto.getServiceStacks().putIfAbsent(canonicalName, "java");
                if (!dto.getServiceHealthPaths().containsKey(canonicalName)) {
                    dto.getServiceHealthPaths().put(canonicalName, "/");
                    dto.getServiceHealthConfidence().put(canonicalName, "ASSUMED");
                    dto.getServiceHealthReasons().put(canonicalName, "Synthesized from Dockerfile; probing '/'");
                }
            }
            for (String existing : existingApps) {
                if (!finalDetected.contains(existing) && !"default-service".equals(existing)) {
                    finalDetected.add(existing);
                }
            }
            rootMap.put("services", synthServices);
            synthesizedFromDockerfiles = true;
            topologyChanges.add("Synthesized sandbox Compose topology from " + synthServices.size() + " discovered Dockerfile(s)");

            warnings.removeIf(w -> w.contains("chưa có file docker-compose.yml")
                    || w.contains("Không tìm thấy file docker-compose")
                    || w.contains("Nội dung docker-compose rỗng"));
            dto.setSecurityWarnings(warnings);
            dto.setCompatible(warnings.isEmpty());
            dto.setDetectedServices(finalDetected);
            dto.setComposeServices(new ArrayList<>(synthServices.keySet()));
        } else {
            try {
                Object loaded = new Yaml(new SafeConstructor(new LoaderOptions())).load(rawComposeYaml);
                if (loaded instanceof Map<?, ?> parsed) {
                    rootMap = deepCopyYamlMap(parsed);
                }
            } catch (Exception ignored) {}
        }

        if (rootMap == null || !(rootMap.get("services") instanceof Map<?, ?> rawServices)) {
            return;
        }
        Map<String, Object> servicesMap = (Map<String, Object>) rawServices;
        Set<String> replacedDbContainers = new LinkedHashSet<>();
        boolean provisionedDb = autoProvisionMissingSandboxDatabases(dto, servicesMap, safeEnvFiles, replacedDbContainers, topologyChanges);
        boolean normalizedInfra = normalizeSandboxComposeInfra(dto, rootMap, servicesMap, replacedDbContainers, topologyChanges);

        boolean hasDockerfileVols = dto.getServiceDockerfileVolumes() != null && !dto.getServiceDockerfileVolumes().isEmpty();
        if (synthesizedFromDockerfiles || provisionedDb || normalizedInfra || hasDockerfileVols || !safeOverrides.isEmpty()) {
            if (synthesizedFromDockerfiles) {
                DumperOptions rawDumpOpts = new DumperOptions();
                rawDumpOpts.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
                String rawSynthYaml = new Yaml(rawDumpOpts).dump(rootMap);
                dto.setRunnerIssues(new ArrayList<>(runnerCompatibilityIssues(rawSynthYaml, rootMap)));
            }
            SandboxComposeResult rem = generateSandboxCompose(
                    rootMap,
                    safeOverrides,
                    imageDigestResolver,
                    safeEnvFiles,
                    dto.getServiceDockerfileVolumes());
            dto.setSandboxComposeYaml(rem.yaml());
            List<String> mergedChanges = new ArrayList<>(topologyChanges);
            mergedChanges.addAll(rem.changes());
            dto.setSandboxComposeChanges(mergedChanges);
            dto.setUnresolvableRunnerIssues(new ArrayList<>(rem.unresolvableIssues()));
            dto.setRelocatedComposeSecrets(new LinkedHashMap<>(rem.relocatedSecrets()));
        }
    }

    @SuppressWarnings("unchecked")
    private boolean autoProvisionMissingSandboxDatabases(
            PreflightCheckResponseDTO dto,
            Map<String, Object> servicesMap,
            Map<String, String> envFiles,
            Set<String> replacedDbContainers,
            List<String> topologyChanges) {
        List<DatabaseCheckDTO> checks = dto.getDatabaseChecks();
        if (checks == null || checks.isEmpty() || servicesMap.isEmpty()) return false;

        Set<String> infraSet = new LinkedHashSet<>(dto.getInfrastructureServices() != null ? dto.getInfrastructureServices() : List.of());
        Map<String, RequiredEnvVarDTO> envByName = new LinkedHashMap<>();
        if (dto.getRequiredEnvVars() != null) {
            for (RequiredEnvVarDTO v : dto.getRequiredEnvVars()) envByName.put(v.getName(), v);
        }

        Map<String, List<DatabaseCheckDTO>> missingByFamily = new LinkedHashMap<>();
        for (DatabaseCheckDTO check : checks) {
            if (check == null || check.getService() == null || infraSet.contains(check.getService())) continue;
            if (!servicesMap.containsKey(check.getService())) continue;
            if ("DETECTED_CONTAINER".equals(check.getStatus())) continue;
            String family = dbFamilyForType(check.getDbType());
            if (family == null || hasDbContainerForFamily(servicesMap, family)) continue;
            missingByFamily.computeIfAbsent(family, k -> new ArrayList<>()).add(check);
        }

        if (missingByFamily.isEmpty()) return false;
        boolean provisionedAny = false;
        Set<String> autoWiredServices = new HashSet<>();

        for (Map.Entry<String, List<DatabaseCheckDTO>> entry : missingByFamily.entrySet()) {
            if (servicesMap.size() >= 20) break;
            String family = entry.getKey();
            List<DatabaseCheckDTO> familyChecks = entry.getValue();
            String containerName = "sandbox-" + family;
            if (servicesMap.containsKey(containerName)) continue;

            String dbName = inferProvisionedDbName(familyChecks, envByName);
            String dbUser = "rabbitmq".equals(family) ? "mavis" : inferProvisionedDbUser(family, familyChecks, servicesMap, envFiles, envByName);
            boolean redisAuth = "redis".equals(family) && REDIS_PASSWORD_VARS.stream().anyMatch(envByName::containsKey);
            String dbPass = ("redis".equals(family) && !redisAuth) || "kafka".equals(family) ? null : randomAlphanumeric(28);

            Map<String, Object> dbNode = new LinkedHashMap<>();
            Map<String, String> dbEnv = new LinkedHashMap<>();
            Map<String, String> creds = new LinkedHashMap<>();
            int port;

            switch (family) {
                case "postgres" -> {
                    port = 5432;
                    dbNode.put("image", "postgres:16-alpine");
                    dbEnv.put("POSTGRES_USER", dbUser);
                    dbEnv.put("POSTGRES_DB", dbName);
                    dbEnv.put("POSTGRES_PASSWORD", dbPass);
                    creds.put("POSTGRES_USER", dbUser);
                    creds.put("POSTGRES_DB", dbName);
                    creds.put("POSTGRES_PASSWORD", dbPass);
                }
                case "mysql" -> {
                    port = 3306;
                    dbNode.put("image", "mysql:8.4");
                    dbEnv.put("MYSQL_DATABASE", dbName);
                    dbEnv.put("MYSQL_ROOT_PASSWORD", dbPass);
                    if (!"root".equalsIgnoreCase(dbUser)) {
                        dbEnv.put("MYSQL_USER", dbUser);
                        dbEnv.put("MYSQL_PASSWORD", dbPass);
                    }
                    creds.put("MYSQL_USER", dbUser);
                    creds.put("MYSQL_DATABASE", dbName);
                    creds.put("MYSQL_PASSWORD", dbPass);
                    creds.put("MYSQL_ROOT_PASSWORD", dbPass);
                }
                case "mariadb" -> {
                    port = 3306;
                    dbNode.put("image", "mariadb:11");
                    dbEnv.put("MARIADB_DATABASE", dbName);
                    dbEnv.put("MARIADB_ROOT_PASSWORD", dbPass);
                    if (!"root".equalsIgnoreCase(dbUser)) {
                        dbEnv.put("MARIADB_USER", dbUser);
                        dbEnv.put("MARIADB_PASSWORD", dbPass);
                    }
                    creds.put("MARIADB_USER", dbUser);
                    creds.put("MARIADB_DATABASE", dbName);
                    creds.put("MARIADB_PASSWORD", dbPass);
                    creds.put("MARIADB_ROOT_PASSWORD", dbPass);
                }
                case "mongo" -> {
                    port = 27017;
                    dbNode.put("image", "mongo:7");
                    dbEnv.put("MONGO_INITDB_ROOT_USERNAME", dbUser);
                    dbEnv.put("MONGO_INITDB_ROOT_PASSWORD", dbPass);
                    dbEnv.put("MONGO_INITDB_DATABASE", dbName);
                    creds.put("MONGO_INITDB_ROOT_USERNAME", dbUser);
                    creds.put("MONGO_INITDB_ROOT_PASSWORD", dbPass);
                    creds.put("MONGO_INITDB_DATABASE", dbName);
                }
                case "redis" -> {
                    port = 6379;
                    dbNode.put("image", "redis:7-alpine");
                    if (redisAuth) {
                        // Password stays in a relocated env var; '$' interpolation is stripped from sandbox Compose.
                        dbEnv.put("REDIS_PASSWORD", dbPass);
                        dbNode.put("command", new ArrayList<>(List.of("sh", "-c", "printenv REDIS_PASSWORD | xargs redis-server --requirepass")));
                        creds.put("REDIS_PASSWORD", dbPass);
                    }
                }
                case "kafka" -> {
                    port = 9092;
                    dbNode.put("image", "apache/kafka-native:3.9.0");
                    dbEnv.put("KAFKA_NODE_ID", "1");
                    dbEnv.put("KAFKA_PROCESS_ROLES", "broker,controller");
                    dbEnv.put("KAFKA_LISTENERS", "PLAINTEXT://:9092,CONTROLLER://:9093");
                    dbEnv.put("KAFKA_ADVERTISED_LISTENERS", "PLAINTEXT://" + containerName + ":9092");
                    dbEnv.put("KAFKA_CONTROLLER_LISTENER_NAMES", "CONTROLLER");
                    dbEnv.put("KAFKA_LISTENER_SECURITY_PROTOCOL_MAP", "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT");
                    dbEnv.put("KAFKA_CONTROLLER_QUORUM_VOTERS", "1@" + containerName + ":9093");
                    dbEnv.put("KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR", "1");
                    dbEnv.put("KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR", "1");
                    dbEnv.put("KAFKA_TRANSACTION_STATE_LOG_MIN_ISR", "1");
                    dbEnv.put("KAFKA_AUTO_CREATE_TOPICS_ENABLE", "true");
                    // kafka-native only ships /opt/kafka/config owned by appuser; a fresh mount elsewhere is root-owned under cap_drop ALL.
                    dbEnv.put("KAFKA_LOG_DIRS", "/opt/kafka/config/kraft-logs");
                }
                case "rabbitmq" -> {
                    port = 5672;
                    dbNode.put("image", "rabbitmq:4-alpine");
                    dbEnv.put("RABBITMQ_DEFAULT_USER", dbUser);
                    // RABBITMQ_DEFAULT_PASS is not a "sensitive" key name, so the value travels as RABBITMQ_PASSWORD (relocated) instead.
                    dbEnv.put("RABBITMQ_PASSWORD", dbPass);
                    dbNode.put("command", new ArrayList<>(List.of("sh", "-c", "RABBITMQ_DEFAULT_PASS=`printenv RABBITMQ_PASSWORD` exec docker-entrypoint.sh rabbitmq-server")));
                    creds.put("RABBITMQ_DEFAULT_USER", dbUser);
                    creds.put("RABBITMQ_PASSWORD", dbPass);
                }
                default -> {
                    continue;
                }
            }

            dbNode.put("expose", new ArrayList<>(List.of(String.valueOf(port))));
            if (!dbEnv.isEmpty()) dbNode.put("environment", dbEnv);
            servicesMap.put(containerName, dbNode);
            provisionedAny = true;

            infraSet.add(containerName);
            if (dto.getInfrastructureServices() != null && !dto.getInfrastructureServices().contains(containerName)) {
                dto.getInfrastructureServices().add(containerName);
            }
            if (!dto.getDetectedServices().contains(containerName)) dto.getDetectedServices().add(containerName);
            if (!dto.getComposeServices().contains(containerName)) dto.getComposeServices().add(containerName);
            dto.getServicePorts().put(containerName, port);
            if (!creds.isEmpty()) {
                dto.getServiceDatabaseCredentials().put(containerName, creds);
                creds.forEach(dto.getSandboxDatabaseCredentials()::putIfAbsent);
            }

            Set<String> localReplacedDbs = new LinkedHashSet<>();
            if (Set.of("postgres", "mysql", "mariadb").contains(family)) {
                for (Map.Entry<String, Object> se : servicesMap.entrySet()) {
                    String cand = se.getKey();
                    if (cand.equals(containerName)) continue;
                    String candImg = (se.getValue() instanceof Map<?, ?> m && m.get("image") != null)
                            ? String.valueOf(m.get("image")).toLowerCase(Locale.ROOT) : "";
                    String candLow = cand.toLowerCase(Locale.ROOT);
                    if (isInfrastructureService(candLow, candImg)
                            && (candLow.contains("mysql") || candLow.contains("mariadb") || candLow.contains("postgres")
                            || candImg.contains("mysql") || candImg.contains("mariadb") || candImg.contains("postgres"))) {
                        localReplacedDbs.add(cand);
                        if (replacedDbContainers != null) replacedDbContainers.add(cand);
                    }
                }
            }

            Set<String> targetServices = new LinkedHashSet<>();
            for (DatabaseCheckDTO c : familyChecks) targetServices.add(c.getService());

            for (String appSvc : targetServices) {
                if (!(servicesMap.get(appSvc) instanceof Map<?, ?> rawAppCfg)) continue;
                Map<String, Object> appCfg = (Map<String, Object>) rawAppCfg;
                List<String> depList = dto.getServiceDependencies().computeIfAbsent(appSvc, k -> new ArrayList<>());
                for (String oldDb : localReplacedDbs) {
                    removeServiceDependency(appCfg, oldDb);
                    depList.remove(oldDb);
                }
                addServiceDependency(appCfg, containerName);
                depList.remove(containerName);
                depList.add(0, containerName);

                Map<String, String> appEnv = composeEnvironment(appCfg.get("environment"));
                String stack = dto.getServiceStacks() != null ? dto.getServiceStacks().getOrDefault(appSvc, "java") : "java";
                String previewUrl = wireAppServiceToSandboxDb(dto, appSvc, stack, family, containerName, port, dbName, dbUser, dbPass, appEnv, envByName);
                appCfg.put("environment", appEnv);
                autoWiredServices.add(appSvc);

                for (DatabaseCheckDTO c : familyChecks) {
                    if (appSvc.equals(c.getService())) {
                        c.setStatus("AUTO_PROVISIONED_SANDBOX_DB");
                        c.setConnectionUrl(previewUrl);
                    }
                }
            }
            topologyChanges.add("Auto-provisioned ephemeral '" + containerName + "' container and wired " + String.join(", ", targetServices) + " for air-gapped sandbox execution");
        }

        if (provisionedAny) {
            dto.setInfrastructureServices(new ArrayList<>(infraSet));
            Set<String> autoSatisfiedUrlVars = Set.of("DB_CONNECTION_STRING", "SPRING_DATASOURCE_URL", "DATABASE_URL",
                    "CONNECTIONSTRINGS__DEFAULTCONNECTION", "MONGODB_URI", "SPRING_DATA_MONGODB_URI", "REDIS_URL",
                    "SPRING_KAFKA_BOOTSTRAP_SERVERS", "KAFKA_BOOTSTRAP_SERVERS", "KAFKA_BROKERS", "AMQP_URL", "RABBITMQ_URL", "CLOUDAMQP_URL",
                    "REDIS_HOST", "RABBITMQ_HOST");
            if (dto.getRequiredEnvVars() != null) {
                for (RequiredEnvVarDTO v : dto.getRequiredEnvVars()) {
                    if (autoSatisfiedUrlVars.contains(v.getName().toUpperCase(Locale.ROOT))) {
                        List<String> owners = (v.getServices() != null && !v.getServices().isEmpty())
                                ? v.getServices()
                                : (v.getService() != null ? List.of(v.getService()) : List.of());
                        if (owners.isEmpty() || autoWiredServices.containsAll(owners)) {
                            v.setDefaultPresent(true);
                            v.setRequired(false);
                            v.setResolution("SANDBOX_INFRA");
                        }
                    }
                }
            }
        }
        return provisionedAny;
    }

    private static String wireAppServiceToSandboxDb(
            PreflightCheckResponseDTO dto,
            String appSvc,
            String stack,
            String family,
            String host,
            int port,
            String dbName,
            String dbUser,
            String dbPass,
            Map<String, String> appEnv,
            Map<String, RequiredEnvVarDTO> envByName) {
        Set<String> clearedKeys = new HashSet<>();
        String previewUrl;
        if ("redis".equals(family)) {
            previewUrl = "redis://" + host + ":" + port;
            String authUrl = dbPass == null ? previewUrl : "redis://:" + dbPass + "@" + host + ":" + port;
            if (stack.startsWith("dotnet")) {
                appEnv.put("CONNECTIONSTRINGS__REDIS", host + ":" + port + (dbPass == null ? "" : ",password=" + dbPass));
                clearedKeys.add("CONNECTIONSTRINGS__REDIS");
            } else if ("node".equals(stack) || "python".equals(stack) || "go".equals(stack)) {
                appEnv.put("REDIS_URL", authUrl);
                clearedKeys.add("REDIS_URL");
            } else {
                appEnv.put("SPRING_DATA_REDIS_HOST", host);
                appEnv.put("SPRING_DATA_REDIS_PORT", String.valueOf(port));
                clearedKeys.addAll(List.of("SPRING_DATA_REDIS_HOST", "SPRING_DATA_REDIS_PORT"));
                if (dbPass != null) {
                    appEnv.put("SPRING_DATA_REDIS_PASSWORD", dbPass);
                    clearedKeys.add("SPRING_DATA_REDIS_PASSWORD");
                }
            }
            if (envByName.containsKey("REDIS_HOST")) appEnv.put("REDIS_HOST", host);
            if (envByName.containsKey("REDIS_PORT")) appEnv.put("REDIS_PORT", String.valueOf(port));
            if (envByName.containsKey("REDIS_URL")) appEnv.put("REDIS_URL", authUrl);
            if (dbPass != null) {
                for (String k : REDIS_PASSWORD_VARS) {
                    if (envByName.containsKey(k)) {
                        appEnv.put(k, dbPass);
                        clearedKeys.add(k);
                    }
                }
            }
        } else if ("kafka".equals(family)) {
            previewUrl = host + ":" + port;
            if (stack.startsWith("dotnet")) appEnv.put("KAFKA__BOOTSTRAPSERVERS", previewUrl);
            else if ("node".equals(stack) || "python".equals(stack) || "go".equals(stack)) appEnv.put("KAFKA_BROKERS", previewUrl);
            else appEnv.put("SPRING_KAFKA_BOOTSTRAP_SERVERS", previewUrl);
            for (String k : List.of("KAFKA_BOOTSTRAP_SERVERS", "KAFKA_BROKERS", "KAFKA_BROKER", "KAFKA_HOST", "SPRING_KAFKA_BOOTSTRAP_SERVERS", "EVENTUATELOCAL_KAFKA_BOOTSTRAP_SERVERS")) {
                if (envByName.containsKey(k)) appEnv.put(k, previewUrl);
            }
            clearedKeys.addAll(List.of("KAFKA__BOOTSTRAPSERVERS", "KAFKA_BROKERS", "SPRING_KAFKA_BOOTSTRAP_SERVERS", "KAFKA_BOOTSTRAP_SERVERS", "KAFKA_BROKER", "KAFKA_HOST", "EVENTUATELOCAL_KAFKA_BOOTSTRAP_SERVERS"));
        } else if ("rabbitmq".equals(family)) {
            previewUrl = "amqp://" + host + ":" + port;
            String authUrl = "amqp://" + dbUser + ":" + dbPass + "@" + host + ":" + port;
            if (stack.startsWith("dotnet")) {
                appEnv.put("RABBITMQ__HOST", host);
                appEnv.put("RABBITMQ__USERNAME", dbUser);
                appEnv.put("RABBITMQ__PASSWORD", dbPass);
                appEnv.put("CONNECTIONSTRINGS__RABBITMQ", authUrl);
            } else if ("node".equals(stack) || "python".equals(stack) || "go".equals(stack)) {
                appEnv.put("AMQP_URL", authUrl);
                appEnv.put("RABBITMQ_URL", authUrl);
            } else {
                appEnv.put("SPRING_RABBITMQ_HOST", host);
                appEnv.put("SPRING_RABBITMQ_PORT", String.valueOf(port));
                appEnv.put("SPRING_RABBITMQ_USERNAME", dbUser);
                appEnv.put("SPRING_RABBITMQ_PASSWORD", dbPass);
            }
            if (envByName.containsKey("RABBITMQ_HOST")) appEnv.put("RABBITMQ_HOST", host);
            if (envByName.containsKey("RABBITMQ_PORT")) appEnv.put("RABBITMQ_PORT", String.valueOf(port));
            for (String k : List.of("RABBITMQ_USER", "RABBITMQ_USERNAME", "RABBITMQ_DEFAULT_USER")) if (envByName.containsKey(k)) appEnv.put(k, dbUser);
            for (String k : List.of("RABBITMQ_PASS", "RABBITMQ_PASSWORD", "RABBITMQ_DEFAULT_PASS")) if (envByName.containsKey(k)) appEnv.put(k, dbPass);
            for (String k : List.of("AMQP_URL", "RABBITMQ_URL", "CLOUDAMQP_URL")) if (envByName.containsKey(k)) appEnv.put(k, authUrl);
            clearedKeys.addAll(List.of("RABBITMQ__HOST", "RABBITMQ__USERNAME", "RABBITMQ__PASSWORD", "CONNECTIONSTRINGS__RABBITMQ", "AMQP_URL", "RABBITMQ_URL",
                    "CLOUDAMQP_URL", "SPRING_RABBITMQ_HOST", "SPRING_RABBITMQ_PORT", "SPRING_RABBITMQ_USERNAME", "SPRING_RABBITMQ_PASSWORD",
                    "RABBITMQ_HOST", "RABBITMQ_PORT", "RABBITMQ_USER", "RABBITMQ_USERNAME", "RABBITMQ_DEFAULT_USER", "RABBITMQ_PASS", "RABBITMQ_PASSWORD", "RABBITMQ_DEFAULT_PASS"));
        } else if ("mongo".equals(family)) {
            String authUri = "mongodb://" + dbUser + ":" + dbPass + "@" + host + ":" + port + "/" + dbName + "?authSource=admin";
            previewUrl = "mongodb://" + host + ":" + port + "/" + dbName;
            if (stack.startsWith("dotnet")) {
                appEnv.put("CONNECTIONSTRINGS__MONGODB", authUri);
                clearedKeys.add("CONNECTIONSTRINGS__MONGODB");
            } else if ("node".equals(stack) || "python".equals(stack) || "go".equals(stack)) {
                appEnv.put("MONGODB_URI", authUri);
                appEnv.put("DATABASE_URL", authUri);
                clearedKeys.addAll(List.of("MONGODB_URI", "DATABASE_URL"));
            } else {
                appEnv.put("SPRING_DATA_MONGODB_URI", authUri);
                clearedKeys.add("SPRING_DATA_MONGODB_URI");
            }
        } else {
            String jdbcScheme = "postgres".equals(family) ? "postgresql" : family;
            String jdbcParams = "mysql".equals(family) ? "?useSSL=false&allowPublicKeyRetrieval=true" : "";
            String jdbcUrl = "jdbc:" + jdbcScheme + "://" + host + ":" + port + "/" + dbName + jdbcParams;
            String uriScheme = "postgres".equals(family) ? "postgresql" : "mysql";
            String authUri = uriScheme + "://" + dbUser + ":" + dbPass + "@" + host + ":" + port + "/" + dbName;
            String dotnetConn = "postgres".equals(family)
                    ? "Host=" + host + ";Port=" + port + ";Database=" + dbName + ";Username=" + dbUser + ";Password=" + dbPass
                    : "Server=" + host + ";Port=" + port + ";Database=" + dbName + ";Uid=" + dbUser + ";Pwd=" + dbPass;

            if (stack.startsWith("dotnet")) {
                appEnv.put("CONNECTIONSTRINGS__DEFAULTCONNECTION", dotnetConn);
                clearedKeys.add("CONNECTIONSTRINGS__DEFAULTCONNECTION");
                previewUrl = "Host=" + host + ";Port=" + port + ";Database=" + dbName;
            } else if ("node".equals(stack) || "python".equals(stack) || "go".equals(stack)) {
                appEnv.put("DATABASE_URL", authUri);
                clearedKeys.add("DATABASE_URL");
                previewUrl = uriScheme + "://" + host + ":" + port + "/" + dbName;
            } else {
                appEnv.put("SPRING_DATASOURCE_URL", jdbcUrl);
                appEnv.put("SPRING_DATASOURCE_USERNAME", dbUser);
                appEnv.put("SPRING_DATASOURCE_PASSWORD", dbPass);
                if (dto.getMigrationManagedServices() == null || !dto.getMigrationManagedServices().contains(appSvc)) {
                    appEnv.putIfAbsent("SPRING_JPA_HIBERNATE_DDL_AUTO", "update");
                }
                clearedKeys.addAll(List.of("SPRING_DATASOURCE_URL", "SPRING_DATASOURCE_USERNAME", "SPRING_DATASOURCE_PASSWORD"));
                previewUrl = jdbcUrl;
            }
            if (envByName.containsKey("DB_HOST")) appEnv.put("DB_HOST", host);
            if (envByName.containsKey("DB_PORT")) appEnv.put("DB_PORT", String.valueOf(port));
            if (envByName.containsKey("DB_NAME")) appEnv.put("DB_NAME", dbName);
            if (envByName.containsKey("DB_USER")) appEnv.put("DB_USER", dbUser);
            if (envByName.containsKey("DB_USERNAME")) appEnv.put("DB_USERNAME", dbUser);
        }
        if (dto.getComposeEnvAliases() != null && dto.getComposeEnvAliases().containsKey(appSvc)) {
            clearedKeys.forEach(dto.getComposeEnvAliases().get(appSvc)::remove);
        }
        if (dto.getComposeEnvTemplates() != null && dto.getComposeEnvTemplates().containsKey(appSvc)) {
            clearedKeys.forEach(dto.getComposeEnvTemplates().get(appSvc)::remove);
        }
        return previewUrl;
    }

    @SuppressWarnings("unchecked")
    private static void addServiceDependency(Map<String, Object> appCfg, String depName) {
        Object existing = appCfg.get("depends_on");
        if (existing instanceof List<?> list) {
            List<Object> copy = new ArrayList<>(list);
            if (copy.stream().noneMatch(x -> depName.equals(String.valueOf(x)))) copy.add(depName);
            appCfg.put("depends_on", copy);
        } else if (existing instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>((Map<String, Object>) map);
            copy.putIfAbsent(depName, Map.of("condition", "service_started"));
            appCfg.put("depends_on", copy);
        } else {
            appCfg.put("depends_on", new ArrayList<>(List.of(depName)));
        }
    }

    @SuppressWarnings("unchecked")
    private static void removeServiceDependency(Map<String, Object> appCfg, String depName) {
        Object existing = appCfg.get("depends_on");
        if (existing instanceof List<?> list) {
            List<Object> copy = new ArrayList<>(list);
            copy.removeIf(x -> depName.equals(String.valueOf(x)));
            if (copy.isEmpty()) appCfg.remove("depends_on");
            else appCfg.put("depends_on", copy);
        } else if (existing instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>((Map<String, Object>) map);
            copy.remove(depName);
            if (copy.isEmpty()) appCfg.remove("depends_on");
            else appCfg.put("depends_on", copy);
        }
    }

    private static String findInfraServiceForFamily(Map<String, Object> servicesMap, String family) {
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String name = e.getKey();
            String low = name.toLowerCase(Locale.ROOT);
            String img = (e.getValue() instanceof Map<?, ?> m && m.get("image") != null)
                    ? String.valueOf(m.get("image")).toLowerCase(Locale.ROOT) : "";
            if (!isInfrastructureService(low, img)) continue;
            boolean match = switch (family) {
                case "redis" -> low.contains("redis") || img.contains("redis");
                case "kafka" -> low.contains("kafka") || img.contains("kafka") || low.contains("redpanda") || img.contains("redpanda");
                default -> false;
            };
            if (match) return name;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private boolean normalizeSandboxComposeInfra(
            PreflightCheckResponseDTO dto,
            Map<String, Object> rootMap,
            Map<String, Object> servicesMap,
            Set<String> replacedDbContainers,
            List<String> topologyChanges) {
        if (servicesMap == null || servicesMap.isEmpty()) return false;
        boolean changed = false;

        // 1. Upgrade ZooKeeper-bound Kafka (cp-kafka / wurstmeister / KAFKA_ZOOKEEPER_CONNECT) to lightweight KRaft apache/kafka-native listening on 9092 & 29092
        Set<String> zookeeperNames = new LinkedHashSet<>();
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String low = e.getKey().toLowerCase(Locale.ROOT);
            String img = (e.getValue() instanceof Map<?, ?> m && m.get("image") != null) ? String.valueOf(m.get("image")).toLowerCase(Locale.ROOT) : "";
            if (isInfrastructureService(low, img) && (low.contains("zookeeper") || img.contains("zookeeper"))) {
                zookeeperNames.add(e.getKey());
            }
        }
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String svc = e.getKey();
            if (!(e.getValue() instanceof Map<?, ?> rawCfg)) continue;
            Map<String, Object> cfg = (Map<String, Object>) rawCfg;
            String img = cfg.get("image") != null ? String.valueOf(cfg.get("image")).toLowerCase(Locale.ROOT) : "";
            Map<String, String> env = composeEnvironment(cfg.get("environment"));
            if (isInfrastructureService(svc, img)
                    && (img.contains("cp-kafka") || img.contains("wurstmeister/kafka") || env.containsKey("KAFKA_ZOOKEEPER_CONNECT"))) {
                cfg.put("image", "apache/kafka-native:3.9.0");
                cfg.put("expose", new ArrayList<>(List.of("9092", "29092")));
                cfg.remove("ports");
                for (String zk : zookeeperNames) {
                    removeServiceDependency(cfg, zk);
                    if (dto.getServiceDependencies() != null && dto.getServiceDependencies().containsKey(svc)) {
                        dto.getServiceDependencies().get(svc).remove(zk);
                    }
                }
                Map<String, String> kraftEnv = new LinkedHashMap<>();
                kraftEnv.put("KAFKA_NODE_ID", "1");
                kraftEnv.put("KAFKA_PROCESS_ROLES", "broker,controller");
                kraftEnv.put("KAFKA_LISTENERS", "PLAINTEXT://:9092,PLAINTEXT_INTERNAL://:29092,CONTROLLER://:9093");
                kraftEnv.put("KAFKA_ADVERTISED_LISTENERS", "PLAINTEXT://" + svc + ":9092,PLAINTEXT_INTERNAL://" + svc + ":29092");
                kraftEnv.put("KAFKA_CONTROLLER_LISTENER_NAMES", "CONTROLLER");
                kraftEnv.put("KAFKA_LISTENER_SECURITY_PROTOCOL_MAP", "CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,PLAINTEXT_INTERNAL:PLAINTEXT");
                kraftEnv.put("KAFKA_CONTROLLER_QUORUM_VOTERS", "1@" + svc + ":9093");
                kraftEnv.put("KAFKA_INTER_BROKER_LISTENER_NAME", "PLAINTEXT_INTERNAL");
                kraftEnv.put("KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR", "1");
                kraftEnv.put("KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR", "1");
                kraftEnv.put("KAFKA_TRANSACTION_STATE_LOG_MIN_ISR", "1");
                kraftEnv.put("KAFKA_AUTO_CREATE_TOPICS_ENABLE", "true");
                kraftEnv.put("KAFKA_LOG_DIRS", "/opt/kafka/config/kraft-logs");
                cfg.put("environment", kraftEnv);
                if (dto.getServicePorts() != null) dto.getServicePorts().put(svc, 9092);
                topologyChanges.add("Normalized '" + svc + "' to ZooKeeper-free KRaft 'apache/kafka-native:3.9.0' (ports 9092, 29092)");
                changed = true;
            }
        }

        // 2. Wire missing SPRING_DATA_REDIS_HOST / SPRING_KAFKA_BOOTSTRAP_SERVERS onto services whose source uses Redis/Kafka when Compose already has the container
        if (dto.getDatabaseChecks() != null) {
            String redisSvc = findInfraServiceForFamily(servicesMap, "redis");
            String kafkaSvc = findInfraServiceForFamily(servicesMap, "kafka");
            for (DatabaseCheckDTO check : dto.getDatabaseChecks()) {
                if (check == null || !"DETECTED_IN_SOURCE".equals(check.getStatus()) || check.getService() == null) continue;
                String appSvc = check.getService();
                if (!(servicesMap.get(appSvc) instanceof Map<?, ?> rawApp)) continue;
                Map<String, Object> appCfg = (Map<String, Object>) rawApp;
                String stack = dto.getServiceStacks() != null ? dto.getServiceStacks().getOrDefault(appSvc, "java") : "java";
                if (!"java".equals(stack)) continue;
                Map<String, String> appEnv = composeEnvironment(appCfg.get("environment"));
                if ("Redis".equals(check.getDbType()) && redisSvc != null
                        && !appEnv.containsKey("SPRING_DATA_REDIS_HOST") && !appEnv.containsKey("SPRING_REDIS_HOST") && !appEnv.containsKey("REDIS_HOST")) {
                    int rPort = dto.getServicePorts() != null ? dto.getServicePorts().getOrDefault(redisSvc, 6379) : 6379;
                    appEnv.put("SPRING_DATA_REDIS_HOST", redisSvc);
                    appEnv.putIfAbsent("SPRING_DATA_REDIS_PORT", String.valueOf(rPort));
                    appCfg.put("environment", appEnv);
                    addServiceDependency(appCfg, redisSvc);
                    List<String> deps = dto.getServiceDependencies().computeIfAbsent(appSvc, k -> new ArrayList<>());
                    if (!deps.contains(redisSvc)) deps.add(redisSvc);
                    check.setStatus("DETECTED_CONTAINER");
                    topologyChanges.add("Wired missing Redis host '" + redisSvc + "' on '" + appSvc + "'");
                    changed = true;
                } else if ("Kafka".equals(check.getDbType()) && kafkaSvc != null
                        && !appEnv.containsKey("SPRING_KAFKA_BOOTSTRAP_SERVERS") && !appEnv.containsKey("KAFKA_BOOTSTRAP_SERVERS")) {
                    appEnv.put("SPRING_KAFKA_BOOTSTRAP_SERVERS", kafkaSvc + ":9092");
                    appCfg.put("environment", appEnv);
                    addServiceDependency(appCfg, kafkaSvc);
                    List<String> deps = dto.getServiceDependencies().computeIfAbsent(appSvc, k -> new ArrayList<>());
                    if (!deps.contains(kafkaSvc)) deps.add(kafkaSvc);
                    check.setStatus("DETECTED_CONTAINER");
                    topologyChanges.add("Wired missing Kafka bootstrap '" + kafkaSvc + ":9092' on '" + appSvc + "'");
                    changed = true;
                }
            }
        }

        // 2b. When a DB container has a stripped host .sql / docker-entrypoint-initdb.d bind-mount, auto-enable JPA schema creation on dependent Java services
        Set<String> dbsWithInitSqlMount = new LinkedHashSet<>();
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String svc = e.getKey();
            if (!(e.getValue() instanceof Map<?, ?> cfg) || !(cfg.get("volumes") instanceof List<?> vols)) continue;
            String img = cfg.get("image") != null ? String.valueOf(cfg.get("image")).toLowerCase(Locale.ROOT) : "";
            if (!isDatabaseContainer(svc.toLowerCase(Locale.ROOT), img)) continue;
            for (Object v : vols) {
                String vs = String.valueOf(v).toLowerCase(Locale.ROOT);
                if (vs.contains("docker-entrypoint-initdb.d") || vs.contains(".sql")) {
                    dbsWithInitSqlMount.add(svc);
                    break;
                }
            }
        }
        if (!dbsWithInitSqlMount.isEmpty()) {
            for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
                String appSvc = e.getKey();
                if (dbsWithInitSqlMount.contains(appSvc) || !(e.getValue() instanceof Map<?, ?> rawApp)) continue;
                String stack = dto.getServiceStacks() != null ? dto.getServiceStacks().getOrDefault(appSvc, "java") : "java";
                if (!"java".equals(stack)) continue;
                if (dto.getMigrationManagedServices() != null && dto.getMigrationManagedServices().contains(appSvc)) continue;
                Map<String, Object> appCfg = (Map<String, Object>) rawApp;
                List<String> deps = new ArrayList<>(extractServiceDependencies(appCfg));
                if (dto.getServiceDependencies() != null) deps.addAll(dto.getServiceDependencies().getOrDefault(appSvc, List.of()));
                if (deps.stream().anyMatch(dbsWithInitSqlMount::contains)) {
                    Map<String, String> appEnv = composeEnvironment(appCfg.get("environment"));
                    if (!appEnv.containsKey("SPRING_JPA_HIBERNATE_DDL_AUTO")) {
                        appEnv.put("SPRING_JPA_HIBERNATE_DDL_AUTO", "update");
                        appCfg.put("environment", appEnv);
                        topologyChanges.add("Enabled SPRING_JPA_HIBERNATE_DDL_AUTO=update on '" + appSvc + "' to replace stripped host SQL init mount");
                        changed = true;
                    }
                }
            }
        }

        // 3. Prune completely unreferenced replaced DB, ZooKeeper, and external tracing/UI collector containers
        Set<String> pruneCandidates = new LinkedHashSet<>();
        if (replacedDbContainers != null) pruneCandidates.addAll(replacedDbContainers);
        pruneCandidates.addAll(zookeeperNames);
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String cand = e.getKey();
            String low = cand.toLowerCase(Locale.ROOT);
            String img = (e.getValue() instanceof Map<?, ?> m && m.get("image") != null) ? String.valueOf(m.get("image")).toLowerCase(Locale.ROOT) : "";
            if (isInfrastructureService(low, img)
                    && (low.equals("zipkin") || img.contains("zipkin") || low.equals("jaeger") || img.contains("jaeger")
                    || low.equals("kibana") || img.contains("kibana") || low.equals("pgadmin") || img.contains("pgadmin")
                    || low.equals("adminer") || img.contains("adminer"))) {
                pruneCandidates.add(cand);
            }
        }

        Set<String> pruned = new LinkedHashSet<>();
        for (String cand : pruneCandidates) {
            if (!servicesMap.containsKey(cand)) continue;
            String candLow = cand.toLowerCase(Locale.ROOT);
            boolean referenced = false;
            for (Map.Entry<String, Object> otherEntry : servicesMap.entrySet()) {
                if (cand.equals(otherEntry.getKey()) || pruned.contains(otherEntry.getKey())) continue;
                if (!(otherEntry.getValue() instanceof Map<?, ?> otherCfg)) continue;
                if (extractServiceDependencies(otherCfg).contains(cand)) {
                    referenced = true;
                    break;
                }
                for (String ev : composeEnvironment(otherCfg.get("environment")).values()) {
                    String evLow = ev == null ? "" : ev.toLowerCase(Locale.ROOT);
                    if (evLow.equals(candLow) || evLow.contains("://" + candLow) || evLow.contains(candLow + ":")) {
                        referenced = true;
                        break;
                    }
                }
                if (referenced) break;
            }
            if (!referenced) {
                servicesMap.remove(cand);
                pruned.add(cand);
                topologyChanges.add("Pruned unreferenced sandbox infrastructure container '" + cand + "'");
                changed = true;
            }
        }

        if (!pruned.isEmpty()) {
            if (dto.getDetectedServices() != null) dto.getDetectedServices().removeAll(pruned);
            if (dto.getComposeServices() != null) dto.getComposeServices().removeAll(pruned);
            if (dto.getInfrastructureServices() != null) dto.getInfrastructureServices().removeAll(pruned);
            if (dto.getServicePorts() != null) pruned.forEach(dto.getServicePorts()::remove);
            if (dto.getServiceStacks() != null) pruned.forEach(dto.getServiceStacks()::remove);
            if (dto.getRelocatedComposeSecrets() != null) pruned.forEach(dto.getRelocatedComposeSecrets()::remove);
            if (dto.getServiceDependencies() != null) {
                pruned.forEach(dto.getServiceDependencies()::remove);
                dto.getServiceDependencies().values().forEach(deps -> deps.removeAll(pruned));
            }
            if (dto.getServiceDatabaseCredentials() != null) {
                pruned.forEach(dto.getServiceDatabaseCredentials()::remove);
                Map<String, String> rebuiltCreds = new LinkedHashMap<>();
                dto.getServiceDatabaseCredentials().values().forEach(m -> {
                    if (m != null) m.forEach(rebuiltCreds::putIfAbsent);
                });
                dto.setSandboxDatabaseCredentials(rebuiltCreds);
            }
            if (dto.getRequiredEnvVars() != null) {
                List<RequiredEnvVarDTO> keptVars = new ArrayList<>();
                for (RequiredEnvVarDTO v : dto.getRequiredEnvVars()) {
                    if (v.getServices() != null && !v.getServices().isEmpty()) {
                        List<String> remOwners = new ArrayList<>(v.getServices().stream().filter(s -> !pruned.contains(s)).toList());
                        if (remOwners.isEmpty()) continue;
                        v.setServices(remOwners);
                        if (pruned.contains(v.getService())) v.setService(remOwners.get(0));
                    } else if (v.getService() != null && pruned.contains(v.getService())) {
                        continue;
                    }
                    keptVars.add(v);
                }
                dto.setRequiredEnvVars(keptVars);
            }
            if (rootMap.get("volumes") instanceof Map<?, ?> rawVols) {
                Set<String> mountedVols = new HashSet<>();
                for (Object svcObj : servicesMap.values()) {
                    if (!(svcObj instanceof Map<?, ?> sc) || !(sc.get("volumes") instanceof List<?> mounts)) continue;
                    for (Object m : mounts) {
                        if (m instanceof Map<?, ?> mm && mm.get("source") != null) mountedVols.add(String.valueOf(mm.get("source")));
                        else if (m instanceof String sm && sm.contains(":")) mountedVols.add(sm.substring(0, sm.indexOf(':')).trim());
                    }
                }
                Map<String, Object> volCopy = new LinkedHashMap<>((Map<String, Object>) rawVols);
                volCopy.keySet().removeIf(k -> !mountedVols.contains(String.valueOf(k)));
                if (volCopy.isEmpty()) rootMap.remove("volumes");
                else rootMap.put("volumes", volCopy);
            }
        }
        return changed;
    }

    private static String dbFamilyForType(String dbType) {
        if (dbType == null || dbType.isBlank()) return null;
        String u = dbType.toUpperCase(Locale.ROOT);
        if (u.contains("H2")) return null;
        if (u.contains("POSTGRES")) return "postgres";
        if (u.contains("MARIADB")) return "mariadb";
        if (u.contains("MYSQL")) return "mysql";
        if (u.contains("MONGO")) return "mongo";
        if (u.contains("REDIS")) return "redis";
        if (u.contains("KAFKA")) return "kafka";
        if (u.contains("RABBIT")) return "rabbitmq";
        return null;
    }

    private static boolean hasDbContainerForFamily(Map<String, Object> servicesMap, String family) {
        for (Map.Entry<String, Object> e : servicesMap.entrySet()) {
            String name = e.getKey().toLowerCase(Locale.ROOT);
            String img = (e.getValue() instanceof Map<?, ?> m && m.get("image") != null)
                    ? String.valueOf(m.get("image")).toLowerCase(Locale.ROOT)
                    : "";
            if (!isInfrastructureService(name, img)) continue;
            boolean match = switch (family) {
                case "postgres" -> name.contains("postgres") || name.equals("db") || name.endsWith("-db") || img.contains("postgres") || img.contains("postgis");
                case "mysql", "mariadb" -> name.contains("mysql") || name.contains("mariadb") || name.equals("db") || name.endsWith("-db") || img.contains("mysql") || img.contains("mariadb");
                case "mongo" -> name.contains("mongo") || img.contains("mongo");
                case "redis" -> name.contains("redis") || img.contains("redis");
                case "kafka" -> name.contains("kafka") || img.contains("kafka") || name.contains("redpanda") || img.contains("redpanda");
                case "rabbitmq" -> name.contains("rabbit") || img.contains("rabbitmq");
                default -> false;
            };
            if (match) return true;
        }
        return false;
    }

    private static String inferProvisionedDbName(List<DatabaseCheckDTO> checks, Map<String, RequiredEnvVarDTO> envByName) {
        for (String key : List.of("DB_NAME", "POSTGRES_DB", "MYSQL_DATABASE", "MARIADB_DATABASE", "MONGO_INITDB_DATABASE")) {
            RequiredEnvVarDTO v = envByName.get(key);
            if (v != null && v.getDefaultValue() != null && v.getDefaultValue().matches("[A-Za-z0-9_-]{1,48}")) {
                return v.getDefaultValue();
            }
        }
        for (DatabaseCheckDTO c : checks) {
            String url = c.getConnectionUrl();
            if (url == null) continue;
            for (Pattern p : List.of(URL_DB_NAME_PATTERN, KV_DB_NAME_PATTERN)) {
                Matcher m = p.matcher(url);
                if (m.find() && m.group(1).matches("[A-Za-z0-9_-]{1,48}")) {
                    return m.group(1);
                }
            }
        }
        return "mavis_sandbox";
    }

    private static String inferProvisionedDbUser(
            String family,
            List<DatabaseCheckDTO> checks,
            Map<String, Object> servicesMap,
            Map<String, String> envFiles,
            Map<String, RequiredEnvVarDTO> envByName) {
        for (String key : List.of("DB_USERNAME", "DB_USER", "SPRING_DATASOURCE_USERNAME", "POSTGRES_USER", "MYSQL_USER", "MARIADB_USER", "MONGO_INITDB_ROOT_USERNAME")) {
            RequiredEnvVarDTO v = envByName.get(key);
            if (v != null && v.getDefaultValue() != null && v.getDefaultValue().matches("[A-Za-z_][A-Za-z0-9_-]{0,30}")) {
                return v.getDefaultValue();
            }
        }
        Map<String, String> rootDotEnv = parseDotEnvContent(envFiles.get(".env"));
        for (DatabaseCheckDTO c : checks) {
            if (servicesMap.get(c.getService()) instanceof Map<?, ?> cfg) {
                Map<String, String> env = mergedServiceEnvironment(cfg, envFiles);
                for (String key : List.of("SPRING_DATASOURCE_USERNAME", "DB_USERNAME", "DB_USER")) {
                    String val = env.get(key);
                    if (val != null) {
                        String resolved = resolvePlaceholders(val, rootDotEnv);
                        if (resolved.matches("[A-Za-z_][A-Za-z0-9_-]{0,30}")) return resolved;
                    }
                }
            }
        }
        return switch (family) {
            case "postgres" -> "postgres";
            case "mongo" -> "mongo";
            default -> "root";
        };
    }

    private String randomAlphanumeric(int len) {
        final String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(alphabet.charAt(secureRandom.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    private static void migrateServiceMetadata(PreflightCheckResponseDTO dto, String fromSvc, String toSvc) {
        if (fromSvc == null || toSvc == null || fromSvc.equals(toSvc)) return;
        if (dto.getServicePorts() != null && dto.getServicePorts().containsKey(fromSvc)) {
            Integer p = dto.getServicePorts().remove(fromSvc);
            if (!dto.getServicePorts().containsKey(toSvc) || Objects.equals(dto.getServicePorts().get(toSvc), 8080)) {
                dto.getServicePorts().put(toSvc, p);
            }
        }
        if (dto.getServiceStacks() != null && dto.getServiceStacks().containsKey(fromSvc)) {
            dto.getServiceStacks().put(toSvc, dto.getServiceStacks().remove(fromSvc));
        }
        if (dto.getServiceDockerfileVolumes() != null && dto.getServiceDockerfileVolumes().containsKey(fromSvc)) {
            List<String> vols = dto.getServiceDockerfileVolumes().remove(fromSvc);
            List<String> dest = dto.getServiceDockerfileVolumes().computeIfAbsent(toSvc, k -> new ArrayList<>());
            for (String v : vols) if (!dest.contains(v)) dest.add(v);
        }
        if (dto.getServiceHealthPaths() != null && dto.getServiceHealthPaths().containsKey(fromSvc)) {
            dto.getServiceHealthPaths().putIfAbsent(toSvc, dto.getServiceHealthPaths().remove(fromSvc));
        }
        if (dto.getServiceHealthConfidence() != null && dto.getServiceHealthConfidence().containsKey(fromSvc)) {
            dto.getServiceHealthConfidence().putIfAbsent(toSvc, dto.getServiceHealthConfidence().remove(fromSvc));
        }
        if (dto.getServiceHealthReasons() != null && dto.getServiceHealthReasons().containsKey(fromSvc)) {
            dto.getServiceHealthReasons().putIfAbsent(toSvc, dto.getServiceHealthReasons().remove(fromSvc));
        }
        if (dto.getMigrationManagedServices() != null && dto.getMigrationManagedServices().remove(fromSvc)) {
            dto.getMigrationManagedServices().add(toSvc);
        }
        if (dto.getDatabaseChecks() != null) {
            for (DatabaseCheckDTO c : dto.getDatabaseChecks()) {
                if (fromSvc.equals(c.getService())) c.setService(toSvc);
            }
        }
        if (dto.getDetectedEndpoints() != null) {
            for (DetectedEndpointDTO ep : dto.getDetectedEndpoints()) {
                if (fromSvc.equals(ep.getService())) ep.setService(toSvc);
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deepCopyYamlMap(Map<?, ?> src) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : src.entrySet()) {
            out.put(String.valueOf(e.getKey()), deepCopyYamlValue(e.getValue()));
        }
        return out;
    }

    private static Object deepCopyYamlValue(Object val) {
        if (val instanceof Map<?, ?> m) return deepCopyYamlMap(m);
        if (val instanceof List<?> l) {
            List<Object> out = new ArrayList<>(l.size());
            for (Object item : l) out.add(deepCopyYamlValue(item));
            return out;
        }
        return val;
    }
}
