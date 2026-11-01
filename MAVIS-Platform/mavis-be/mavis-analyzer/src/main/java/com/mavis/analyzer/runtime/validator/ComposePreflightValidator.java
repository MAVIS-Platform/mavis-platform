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

    private final ImageDigestResolver imageDigestResolver;

    public ComposePreflightValidator() {
        this(new ImageDigestResolver());
    }

    @org.springframework.beans.factory.annotation.Autowired
    public ComposePreflightValidator(ImageDigestResolver imageDigestResolver) {
        this.imageDigestResolver = imageDigestResolver != null ? imageDigestResolver : new ImageDigestResolver();
    }

    public PreflightCheckResponseDTO validate(String yamlContent) {
        return validate(yamlContent, Map.of());
    }

    public PreflightCheckResponseDTO validate(String yamlContent, Map<String, String> imageOverrides) {
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
                                servicePorts.put(serviceName, extractTargetPort(serviceConfig));
                                String stack = extractStack(serviceName, serviceConfig);
                                serviceStacks.put(serviceName, stack);
                                List<String> deps = extractServiceDependencies(serviceConfig);
                                if (!deps.isEmpty()) serviceDependencies.put(serviceName, deps);
                                inspectComposeServiceEnvironmentAndDb(serviceName, serviceConfig, databaseChecks, envVarMap, serviceDependencies, composeEnvAliases);
                                String image = serviceConfig.get("image") != null ? String.valueOf(serviceConfig.get("image")) : "";
                                if (isInfrastructureService(serviceName, image)) {
                                    infrastructureServices.add(serviceName);
                                    Map<String, String> svcCreds = new LinkedHashMap<>();
                                    collectDatabaseCredentials(image, serviceConfig, svcCreds);
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
                        SandboxComposeResult rem = generateSandboxCompose(rootMap, imageOverrides != null ? imageOverrides : Map.of(), imageDigestResolver);
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
            return validate(content);
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
            return generateSandboxCompose(rootMap, imageOverrides != null ? imageOverrides : Map.of(), imageDigestResolver);
        } catch (Exception e) {
            return new SandboxComposeResult("", List.of(), List.of("docker-compose.yml could not be parsed"));
        }
    }

    public static SandboxComposeResult generateSandboxCompose(Map<?, ?> rootMap, Map<String, String> imageOverrides) {
        return generateSandboxCompose(rootMap, imageOverrides, new ImageDigestResolver());
    }

    @SuppressWarnings("unchecked")
    public static SandboxComposeResult generateSandboxCompose(
            Map<?, ?> rootMap,
            Map<String, String> imageOverrides,
            ImageDigestResolver resolver) {
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
                    String resolvedImg = resolveDefaultPlaceholders(imgStr);
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
                    outSvc.put("build", String.valueOf(cfg.get("build")));
                }

                // 2. Ports -> expose conversion
                List<String> exposedPorts = new ArrayList<>();
                if (cfg.get("expose") instanceof List<?> expList) {
                    for (Object p : expList) {
                        if (p != null) exposedPorts.add(String.valueOf(p).trim());
                    }
                }
                if (cfg.containsKey("ports")) {
                    Integer targetPort = firstPort(cfg.get("ports"));
                    String portStr = String.valueOf(targetPort != null ? targetPort : 8080);
                    if (!exposedPorts.contains(portStr)) exposedPorts.add(portStr);
                    changes.add("Converted host 'ports' to internal 'expose: [\"" + portStr + "\"]' on '" + svc + "'");
                }
                if (!exposedPorts.isEmpty()) {
                    outSvc.put("expose", exposedPorts);
                }

                // 3. Environment normalization (list -> map, ${VAR:-default} -> default, sensitive literals -> relocatedSecrets)
                if (cfg.containsKey("environment")) {
                    Map<String, String> rawEnv = composeEnvironment(cfg.get("environment"));
                    Map<String, String> cleanEnv = new LinkedHashMap<>();
                    boolean listConverted = cfg.get("environment") instanceof List<?>;
                    for (Map.Entry<String, String> e : rawEnv.entrySet()) {
                        String k = e.getKey();
                        String v = e.getValue() == null ? "" : e.getValue();
                        if (v.contains("$")) {
                            String resolved = resolveDefaultPlaceholders(v);
                            if (resolved.contains("$") || resolved.isBlank()) {
                                changes.add("Moved unresolved interpolation on '" + svc + "." + k + "' to per-run encrypted binding");
                                continue;
                            }
                            changes.add("Inlined default value for '" + svc + "." + k + "'");
                            v = resolved;
                        }
                        if (!v.isBlank() && v.equals(SecretRedactor.redactString(v)) && !SecretRedactor.isSensitiveKey(k)) {
                            cleanEnv.put(k, v);
                        } else if (!v.isBlank()) {
                            relocatedSecrets.computeIfAbsent(svc, s -> new LinkedHashMap<>()).put(k, v);
                            changes.add("Moved sensitive environment variable '" + svc + "." + k + "' to per-run encrypted binding");
                        }
                    }
                    if (listConverted) {
                        changes.add("Converted list 'environment' to map format on '" + svc + "'");
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
                        Object sanitized = sanitizeYamlNode(cfg.get(key));
                        if (sanitized != null) outSvc.put(key, sanitized);
                    }
                }

                // 5b. Stateful infra compatibility under read_only: true + cap_drop: ALL (ephemeral named volumes + non-root user)
                String effectiveImg = String.valueOf(outSvc.getOrDefault("image", imgStr));
                StatefulInfraSpec infraSpec = statefulInfraSpec(svc, effectiveImg);
                if (infraSpec != null) {
                    int volIdx = 0;
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
                    if (!outSvc.containsKey("user")) {
                        outSvc.put("user", infraSpec.defaultUser());
                        changes.add("Configured non-root user '" + infraSpec.defaultUser() + "' on '" + svc + "' for cap_drop: ALL compatibility");
                    }
                }

                if (!cleanMounts.isEmpty()) {
                    outSvc.put("volumes", cleanMounts);
                }

                // 6. Log stripped unsupported service options
                for (Object rawKey : cfg.keySet()) {
                    String k = String.valueOf(rawKey);
                    if (!RUNNER_SERVICE_KEYS.contains(k) && !"ports".equals(k) && !"build".equals(k)) {
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

    private static boolean needsSandboxRemediation(Map<?, ?> rootMap, Map<String, String> imageOverrides) {
        if (imageOverrides != null && !imageOverrides.isEmpty()) return true;
        if (!(rootMap.get("services") instanceof Map<?, ?> services)) return false;
        for (Map.Entry<?, ?> entry : services.entrySet()) {
            String svc = String.valueOf(entry.getKey());
            if (!(entry.getValue() instanceof Map<?, ?> cfg)) continue;
            Map<String, String> env = composeEnvironment(cfg.get("environment"));
            for (Map.Entry<String, String> e : env.entrySet()) {
                String v = e.getValue() == null ? "" : e.getValue();
                if (!v.isBlank() && (!v.equals(SecretRedactor.redactString(v)) || SecretRedactor.isSensitiveKey(e.getKey()))) {
                    return true;
                }
            }
            String img = cfg.get("image") != null ? String.valueOf(cfg.get("image")) : "";
            StatefulInfraSpec spec = statefulInfraSpec(svc, img);
            if (spec != null) {
                if (!cfg.containsKey("user")) return true;
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

    private static String resolveDefaultPlaceholders(String input) {
        if (input == null || !input.contains("${")) return input;
        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String defVal = m.group(2);
            if (defVal != null && !defVal.isBlank()) {
                m.appendReplacement(sb, Matcher.quoteReplacement(defVal));
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

    private static Object sanitizeYamlNode(Object node) {
        if (node == null) return null;
        if (node instanceof String s) {
            String clean = resolveDefaultPlaceholders(s).replace("$$", "").replaceAll("\\$[A-Za-z_][A-Za-z0-9_]*", "").replace("$", "");
            return clean;
        }
        if (node instanceof List<?> list) {
            List<Object> copy = new ArrayList<>();
            for (Object item : list) {
                Object c = sanitizeYamlNode(item);
                if (c != null) copy.add(c);
            }
            return copy;
        }
        if (node instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : map.entrySet()) {
                Object c = sanitizeYamlNode(e.getValue());
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
        Map<String, String> contextPaths = new HashMap<>();
        Map<String, String> actuatorBasePaths = new HashMap<>();
        Map<String, Integer> actuatorPorts = new HashMap<>();
        Map<String, Integer> sourcePorts = new HashMap<>();

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
                                    explicitHealth, actuatorServices, contextPaths, actuatorBasePaths, actuatorPorts, sourcePorts);
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
                                .filter(p -> isInspectableSourceOrConfig(p.getFileName().toString()))
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
                                        explicitHealth, actuatorServices, contextPaths, actuatorBasePaths, actuatorPorts, sourcePorts);
                            }
                        } catch (Exception ignored) {}
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

        // Apply context-path to discovered endpoints
        for (DetectedEndpointDTO ep : endpoints) {
            String ctx = contextPaths.get(ep.getService());
            if (ctx != null && !ctx.isBlank() && !"/".equals(ctx) && !ep.getPath().startsWith(ctx + "/") && !ep.getPath().equals(ctx)) {
                ep.setPath(normalizeEndpointPath(ctx, ep.getPath()));
            }
        }

        // Apply source-configured ports when Compose fell back to default 8080
        for (Map.Entry<String, Integer> sp : sourcePorts.entrySet()) {
            if (Objects.equals(ports.get(sp.getKey()), 8080)) {
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
                || baseName.equals("dockerfile") || baseName.startsWith("dockerfile.")
                || lower.endsWith(".java") || lower.endsWith(".cs")
                || lower.endsWith(".js") || lower.endsWith(".ts") || lower.endsWith(".py") || lower.endsWith(".go");
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
            Set<String> actuatorServices,
            Map<String, String> contextPaths,
            Map<String, String> actuatorBasePaths,
            Map<String, Integer> actuatorPorts,
            Map<String, Integer> sourcePorts) {

        String cleanRelPath = stripGitHubRootPrefix(relativePath);
        String lowerPath = cleanRelPath.toLowerCase(Locale.ROOT);
        String baseName = lowerPath.contains("/") ? lowerPath.substring(lowerPath.lastIndexOf('/') + 1) : lowerPath;
        String inferredService = inferServiceFromPath(relativePath, dto.getDetectedServices());
        String lowerContent = content.toLowerCase(Locale.ROOT);

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

                // P1.1 Context-path, actuator base-path, actuator port, and server port
                if (lowerLine.startsWith("server.servlet.context-path") || lowerLine.startsWith("spring.webflux.base-path") || lowerLine.startsWith("context-path:")) {
                    String val = extractConfigScalarValue(line);
                    if (val != null && val.startsWith("/")) contextPaths.put(inferredService, val);
                } else if (lowerLine.startsWith("management.endpoints.web.base-path") || (lowerContent.contains("management:") && lowerLine.startsWith("base-path:"))) {
                    String val = extractConfigScalarValue(line);
                    if (val != null && val.startsWith("/")) actuatorBasePaths.put(inferredService, val);
                } else if (lowerLine.startsWith("management.server.port")) {
                    Integer p = parseConfigPort(extractConfigScalarValue(line));
                    if (p != null) actuatorPorts.put(inferredService, p);
                } else if (lowerLine.startsWith("server.port") || (lowerContent.contains("server:") && lowerLine.matches("port\\s*[:=].*"))) {
                    Integer p = parseConfigPort(extractConfigScalarValue(line));
                    if (p != null) sourcePorts.putIfAbsent(inferredService, p);
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
        // 1C. Readiness signals: actuator dependency, explicit /health routes, ASP.NET MapHealthChecks / UseHealthChecks
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
        if (lowerPath.endsWith(".js") || lowerPath.endsWith(".ts") || lowerPath.endsWith(".py") || lowerPath.endsWith(".go")) {
            Matcher routeMatcher = EXPRESS_FASTAPI_GIN_ROUTE_PATTERN.matcher(content);
            while (routeMatcher.find()) {
                String method = routeMatcher.group(1).toUpperCase(Locale.ROOT);
                String fullPath = normalizeEndpointPath("", routeMatcher.group(2));
                if (fullPath.startsWith("/health") || fullPath.equals("/ready") || fullPath.equals("/readyz")) {
                    explicitHealth.putIfAbsent(inferredService, fullPath);
                }
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

        // 2. Java Controller endpoints (skip @FeignClient / @HttpExchange client interfaces)
        if (lowerPath.endsWith(".java") && content.contains("Mapping") && !content.contains("@FeignClient") && !content.contains("@HttpExchange")) {
            int classDeclIdx = content.indexOf("class ");
            if (classDeclIdx < 0) classDeclIdx = content.indexOf("interface ");
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
            Map<String, Map<String, String>> composeEnvAliases) {

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
                processComposeEnvEntry(serviceName, key, val, databaseChecks, envVarMap, serviceDependencies, composeEnvAliases);
            }
        } else if (envObj instanceof List<?> envList) {
            for (Object item : envList) {
                if (item == null) continue;
                String raw = String.valueOf(item).trim();
                int idx = raw.indexOf('=');
                if (idx > 0) {
                    String key = raw.substring(0, idx).trim();
                    String val = raw.substring(idx + 1).trim();
                    processComposeEnvEntry(serviceName, key, val, databaseChecks, envVarMap, serviceDependencies, composeEnvAliases);
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
            Map<String, RequiredEnvVarDTO> envVarMap,
            Map<String, List<String>> serviceDependencies,
            Map<String, Map<String, String>> composeEnvAliases) {

        recordHostDependency(serviceName, val, serviceDependencies);
        Matcher m = ENV_PLACEHOLDER_PATTERN.matcher(val);
        List<String> placeholders = new ArrayList<>();
        while (m.find()) {
            String pName = m.group(1);
            String defVal = m.group(2);
            placeholders.add(pName);
            registerEnvVar(envVarMap, pName, serviceName, defVal, "docker-compose.yml");
            if (!key.equals(pName) && val.trim().equals("${" + pName + "}")) {
                composeEnvAliases.computeIfAbsent(serviceName, k -> new LinkedHashMap<>()).put(key, pName);
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

    /** Sandbox secrets that are plain random material (passwords, signing keys), never URLs or connection strings. */
    public static boolean isGeneratableSandboxSecret(String name) {
        String u = name == null ? "" : name.toUpperCase(Locale.ROOT);
        return "SANDBOX".equals(classifySecretScope(u))
                && !(u.contains("CONNECTION") || u.contains("URL") || u.contains("URI") || u.contains("DSN") || u.contains("HOST"));
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
}
