package com.mavis.analyzer.runtime.service;

import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Controlled local sandbox image builder for repositories whose {@code docker-compose.yml}
 * declares {@code build:} services without published registry images.
 * Gated by {@code mavis.runner.allow-local-image-build}.
 */
@Service
@Slf4j
public class SandboxImageBuilderService {

    private static final Pattern IMAGE_ID_PATTERN = Pattern.compile("^sha256:[0-9a-fA-F]{64}$");
    private static final int MAX_ARCHIVE_FILES = 2_500;
    private static final long MAX_ARCHIVE_BYTES = 150L * 1024L * 1024L;
    private static final Set<String> COMPOSE_FILE_NAMES = Set.of(
            "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml");

    @Value("${mavis.runner.allow-local-image-build:true}")
    private boolean allowLocalImageBuild = true;

    private volatile long lastDockerCheckMillis = 0L;
    private volatile boolean cachedDockerAvailable = false;

    public record BuildImagesResult(Map<String, String> builtImages, List<String> errors) {}

    public boolean isLocalBuildAvailable() {
        if (!allowLocalImageBuild) return false;
        long now = System.currentTimeMillis();
        if (now - lastDockerCheckMillis < 30_000L) {
            return cachedDockerAvailable;
        }
        boolean ok = checkDockerDaemon();
        cachedDockerAvailable = ok;
        lastDockerCheckMillis = now;
        return ok;
    }

    public static String sandboxTag(UUID projectId, String serviceName) {
        String projPrefix = projectId.toString().replace("-", "").substring(0, 8).toLowerCase(Locale.ROOT);
        String safeSvc = serviceName.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "-");
        if (safeSvc.length() > 40) safeSvc = safeSvc.substring(0, 40);
        return "mavis-sandbox-" + projPrefix + "-" + safeSvc + ":latest";
    }

    public Map<String, String> discoverExistingBuiltImages(UUID projectId, java.util.Collection<String> services) {
        if (projectId == null || services == null || services.isEmpty() || !isLocalBuildAvailable()) {
            return Map.of();
        }
        Map<String, String> discovered = new LinkedHashMap<>();
        for (String svc : services) {
            if (svc == null || svc.isBlank() || ComposePreflightValidator.isInfrastructureService(svc, "")) continue;
            String imageId = inspectImageId(sandboxTag(projectId, svc));
            if (imageId != null) {
                discovered.put(svc, imageId);
            }
        }
        return discovered;
    }

    public BuildImagesResult buildSnapshotImages(UUID projectId, Path snapshotStoragePath, List<String> requestedServices) {
        if (!allowLocalImageBuild) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "Local sandbox image building is disabled by operator policy (mavis.runner.allow-local-image-build=false)");
        }
        if (snapshotStoragePath == null || !Files.exists(snapshotStoragePath)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Snapshot archive is not available on disk");
        }

        Path workspace = null;
        try {
            try {
                workspace = Files.createTempDirectory("mavis-imgbuild-");
                extractOrCopySnapshot(snapshotStoragePath, workspace);
            } catch (IOException firstIo) {
                deleteQuietly(workspace);
                pruneDockerDisk(true);
                workspace = Files.createTempDirectory("mavis-imgbuild-");
                extractOrCopySnapshot(snapshotStoragePath, workspace);
            }

            Set<String> filter = requestedServices != null && !requestedServices.isEmpty()
                    ? Set.copyOf(requestedServices)
                    : Set.of();

            Optional<Path> composeFileOpt = findComposeFile(workspace);
            Path baseDir;
            Map<String, BuildSpec> targetsToBuild = new LinkedHashMap<>();
            List<String> errors = new ArrayList<>();

            if (composeFileOpt.isPresent()) {
                Path composeFile = composeFileOpt.get();
                baseDir = composeFile.getParent();
                Path dotEnvPath = baseDir != null ? baseDir.resolve(".env") : null;
                Map<String, String> rootDotEnv = (dotEnvPath != null && Files.isRegularFile(dotEnvPath, LinkOption.NOFOLLOW_LINKS) && Files.size(dotEnvPath) <= 65_536)
                        ? ComposePreflightValidator.parseDotEnvContent(Files.readString(dotEnvPath, StandardCharsets.UTF_8))
                        : Map.of();

                Object loaded = new Yaml(new SafeConstructor(new LoaderOptions()))
                        .load(Files.readString(composeFile, StandardCharsets.UTF_8));
                if (!(loaded instanceof Map<?, ?> rootMap) || !(rootMap.get("services") instanceof Map<?, ?> servicesMap)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "docker-compose.yml does not contain a valid services mapping");
                }
                List<String> unpinnedNoBuildApps = new ArrayList<>();
                for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                    String svc = String.valueOf(entry.getKey());
                    if (!(entry.getValue() instanceof Map<?, ?> cfg) || cfg.containsKey("build")) continue;
                    String img = cfg.get("image") != null
                            ? ComposePreflightValidator.resolvePlaceholders(String.valueOf(cfg.get("image")).trim(), rootDotEnv)
                            : "";
                    if (!img.contains("@sha256:") && !ComposePreflightValidator.isInfrastructureService(svc, img)) {
                        unpinnedNoBuildApps.add(svc);
                    }
                }
                List<ComposePreflightValidator.DiscoveredDockerfile> discoveredFallback = null;
                for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                    String svc = String.valueOf(entry.getKey());
                    if (!filter.isEmpty() && !filter.contains(svc)) continue;
                    if (entry.getValue() instanceof Map<?, ?> cfg && cfg.containsKey("build")) {
                        targetsToBuild.put(svc, parseBuildSpec(cfg.get("build"), rootDotEnv));
                        continue;
                    }
                    if (filter.isEmpty() && !unpinnedNoBuildApps.contains(svc)) continue;
                    if (discoveredFallback == null) {
                        discoveredFallback = ComposePreflightValidator.discoverDockerfilesInDirectory(workspace);
                    }
                    ComposePreflightValidator.DiscoveredDockerfile matchedDf = matchDiscoveredDockerfile(
                            svc, discoveredFallback, unpinnedNoBuildApps.size() == 1);
                    if (matchedDf != null) {
                        Path dfDir = workspace.resolve(matchedDf.context()).normalize();
                        String relCtx = baseDir != null ? baseDir.relativize(dfDir).toString().replace('\\', '/') : matchedDf.context();
                        targetsToBuild.put(svc, new BuildSpec(relCtx.isEmpty() ? "." : relCtx, matchedDf.dockerfile(), null, Map.of()));
                    } else if (!filter.isEmpty()) {
                        errors.add("Service '" + svc + "': no build section or matching Dockerfile found in snapshot");
                    }
                }
                for (String reqSvc : filter) {
                    if (!servicesMap.containsKey(reqSvc)) {
                        errors.add("Service '" + reqSvc + "': service not found in docker-compose.yml");
                    }
                }
            } else {
                baseDir = workspace;
                List<ComposePreflightValidator.DiscoveredDockerfile> discovered = ComposePreflightValidator.discoverDockerfilesInDirectory(workspace);
                if (discovered.isEmpty()) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "No docker-compose.yml or Dockerfile found in snapshot");
                }
                for (ComposePreflightValidator.DiscoveredDockerfile d : discovered) {
                    String svc = d.serviceName();
                    if (discovered.size() == 1 && requestedServices != null && requestedServices.size() == 1) {
                        svc = requestedServices.get(0);
                    } else if (!filter.isEmpty() && !filter.contains(svc)) {
                        String matched = ComposePreflightValidator.matchDetectedService(svc, requestedServices);
                        if (matched == null) continue;
                        svc = matched;
                    }
                    targetsToBuild.put(svc, new BuildSpec(d.context(), d.dockerfile(), null, Map.of()));
                }
            }

            Map<String, String> builtImages = new LinkedHashMap<>();

            for (Map.Entry<String, BuildSpec> entry : targetsToBuild.entrySet()) {
                String svc = entry.getKey();
                BuildSpec spec = entry.getValue();
                Path contextDir = baseDir.resolve(spec.context()).normalize();
                Path dockerfile = contextDir.resolve(spec.dockerfile()).normalize();

                if (!contextDir.startsWith(workspace) || !dockerfile.startsWith(workspace)
                        || Files.isSymbolicLink(contextDir) || Files.isSymbolicLink(dockerfile)
                        || !Files.isDirectory(contextDir, LinkOption.NOFOLLOW_LINKS)
                        || !Files.isRegularFile(dockerfile, LinkOption.NOFOLLOW_LINKS)) {
                    errors.add("Service '" + svc + "': build context or Dockerfile is missing or outside snapshot root");
                    continue;
                }

                prepareAutoBuildDockerfile(dockerfile, contextDir);
                String tag = sandboxTag(projectId, svc);

                String buildErr = runDockerBuild(projectId, tag, dockerfile, contextDir, spec.target(), spec.args());
                if (buildErr != null && buildErr.toLowerCase(Locale.ROOT).contains("no space left on device")) {
                    pruneDockerDisk(true);
                    buildErr = runDockerBuild(projectId, tag, dockerfile, contextDir, spec.target(), spec.args());
                }
                if (buildErr != null) {
                    errors.add("Service '" + svc + "': " + buildErr);
                    continue;
                }

                String imageId = inspectImageId(tag);
                if (imageId != null) {
                    builtImages.put(svc, imageId);
                    pruneDockerDisk(false);
                } else {
                    errors.add("Service '" + svc + "': image built but content digest could not be inspected");
                }
            }

            return new BuildImagesResult(builtImages, errors);
        } catch (BusinessException e) {
            if (e.getErrorCode() == ErrorCode.FORBIDDEN || e.getErrorCode() == ErrorCode.NOT_FOUND) {
                throw e;
            }
            return new BuildImagesResult(Map.of(), List.of(SecretRedactor.redactString(String.valueOf(e.getMessage()))));
        } catch (Exception e) {
            log.warn("Sandbox image build failed for project {}: {}", projectId, e.getMessage());
            return new BuildImagesResult(Map.of(), List.of("Failed to build sandbox images: " + SecretRedactor.redactString(String.valueOf(e.getMessage()))));
        } finally {
            deleteQuietly(workspace);
        }
    }

    protected record BuildSpec(String context, String dockerfile, String target, Map<String, String> args) {}

    private static void prepareAutoBuildDockerfile(Path dockerfile, Path contextDir) {
        try {
            if (Files.isDirectory(contextDir.resolve("target")) || !Files.isRegularFile(contextDir.resolve("pom.xml"))) {
                return;
            }
            String content = Files.readString(dockerfile, StandardCharsets.UTF_8);
            String lower = content.toLowerCase(Locale.ROOT);
            if (lower.contains("--from=") || lower.contains("mvn ") || lower.contains("./mvnw")) {
                return;
            }
            if (Pattern.compile("(?im)^\\s*(?:COPY|ADD)\\s+(?:--chown=\\S+\\s+)?(?:\\./)?target/").matcher(content).find()) {
                String rewritten = content.replaceAll(
                        "(?im)^(\\s*(?:COPY|ADD)\\s+(?:--chown=\\S+\\s+)?)(?:\\./)?target/",
                        "$1--from=mavis_auto_builder /mavis_build/target/");
                String header = """
                        FROM maven:3.9.6-eclipse-temurin-21-alpine AS mavis_auto_builder
                        WORKDIR /mavis_build
                        COPY pom.xml .
                        COPY src ./src
                        RUN mvn clean package -DskipTests -B && rm -rf /root/.m2/repository

                        """;
                Files.writeString(dockerfile, header + rewritten, StandardCharsets.UTF_8);
            }
        } catch (IOException ignored) {}
    }

    private static ComposePreflightValidator.DiscoveredDockerfile matchDiscoveredDockerfile(
            String serviceName,
            List<ComposePreflightValidator.DiscoveredDockerfile> candidates,
            boolean singleUnpinnedApp) {
        if (candidates == null || candidates.isEmpty()) return null;
        for (ComposePreflightValidator.DiscoveredDockerfile d : candidates) {
            if (d.serviceName().equalsIgnoreCase(serviceName)
                    || ComposePreflightValidator.cleanServiceCandidate(d.serviceName()).equalsIgnoreCase(
                            ComposePreflightValidator.cleanServiceCandidate(serviceName))) {
                return d;
            }
        }
        for (ComposePreflightValidator.DiscoveredDockerfile d : candidates) {
            if (ComposePreflightValidator.matchDetectedService(d.serviceName(), List.of(serviceName)) != null) {
                return d;
            }
        }
        return (singleUnpinnedApp && candidates.size() == 1) ? candidates.get(0) : null;
    }

    static BuildSpec parseBuildSpec(Object buildNode, Map<String, String> rootDotEnv) {
        if (buildNode instanceof Map<?, ?> map) {
            String ctx = map.get("context") != null ? ComposePreflightValidator.resolvePlaceholders(String.valueOf(map.get("context")).trim(), rootDotEnv) : ".";
            String df = map.get("dockerfile") != null ? ComposePreflightValidator.resolvePlaceholders(String.valueOf(map.get("dockerfile")).trim(), rootDotEnv) : "Dockerfile";
            String target = null;
            if (map.get("target") != null) {
                String rawTarget = ComposePreflightValidator.resolvePlaceholders(String.valueOf(map.get("target")).trim(), rootDotEnv);
                if (rawTarget.matches("[A-Za-z0-9._-]{1,64}")) target = rawTarget;
            }
            Map<String, String> args = parseBuildArgs(map.get("args"), rootDotEnv);
            return new BuildSpec(ctx.isEmpty() ? "." : ctx, df.isEmpty() ? "Dockerfile" : df, target, args);
        }
        String ctx = buildNode != null ? ComposePreflightValidator.resolvePlaceholders(String.valueOf(buildNode).trim(), rootDotEnv) : ".";
        return new BuildSpec(ctx.isEmpty() ? "." : ctx, "Dockerfile", null, Map.of());
    }

    private static Map<String, String> parseBuildArgs(Object argsNode, Map<String, String> rootDotEnv) {
        if (argsNode == null) return Map.of();
        Map<String, String> raw = new LinkedHashMap<>();
        if (argsNode instanceof Map<?, ?> map) {
            map.forEach((k, v) -> {
                if (k != null) {
                    String key = String.valueOf(k).trim();
                    String val = v == null ? (rootDotEnv != null ? rootDotEnv.getOrDefault(key, "") : "") : String.valueOf(v).trim();
                    raw.put(key, val);
                }
            });
        } else if (argsNode instanceof List<?> list) {
            for (Object item : list) {
                if (item == null) continue;
                String s = String.valueOf(item).trim();
                int eq = s.indexOf('=');
                if (eq > 0) {
                    raw.put(s.substring(0, eq).trim(), s.substring(eq + 1).trim());
                } else if (!s.isEmpty() && rootDotEnv != null && rootDotEnv.containsKey(s)) {
                    raw.put(s, rootDotEnv.get(s));
                }
            }
        }
        Map<String, String> safe = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : raw.entrySet()) {
            String k = e.getKey();
            if (!k.matches("[A-Za-z_][A-Za-z0-9_]{0,63}")) continue;
            String v = ComposePreflightValidator.resolvePlaceholders(e.getValue(), rootDotEnv);
            if (v == null || v.contains("$") || v.length() > 1024 || v.indexOf('\r') >= 0 || v.indexOf('\n') >= 0 || v.indexOf('\0') >= 0) {
                continue;
            }
            safe.put(k, v);
        }
        return safe;
    }

    private void extractOrCopySnapshot(Path source, Path targetRoot) throws IOException {
        if (Files.isRegularFile(source) && source.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".zip")) {
            int fileCount = 0;
            long totalBytes = 0L;
            try (ZipFile zipFile = new ZipFile(source.toFile())) {
                Enumeration<? extends ZipEntry> entries = zipFile.entries();
                while (entries.hasMoreElements()) {
                    ZipEntry entry = entries.nextElement();
                    String name = entry.getName().replace('\\', '/');
                    if (name.contains("/.git/") || name.startsWith(".git/")) continue;
                    Path dest = targetRoot.resolve(name).normalize();
                    if (!dest.startsWith(targetRoot)) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot archive contains invalid path traversal entry");
                    }
                    if (entry.isDirectory()) {
                        Files.createDirectories(dest);
                        continue;
                    }
                    if (++fileCount > MAX_ARCHIVE_FILES) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot archive exceeds file count budget for local build");
                    }
                    Files.createDirectories(dest.getParent());
                    try (InputStream is = zipFile.getInputStream(entry)) {
                        byte[] buf = new byte[16_384];
                        int read;
                        try (var out = Files.newOutputStream(dest)) {
                            while ((read = is.read(buf)) > 0) {
                                totalBytes += read;
                                if (totalBytes > MAX_ARCHIVE_BYTES) {
                                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot archive exceeds size budget for local build");
                                }
                                out.write(buf, 0, read);
                            }
                        }
                    }
                }
            }
        } else {
            Path srcDir = Files.isDirectory(source) ? source : source.getParent();
            if (srcDir == null || !Files.isDirectory(srcDir)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot directory is invalid");
            }
            try (Stream<Path> walk = Files.walk(srcDir, 8)) {
                int[] count = {0};
                long[] bytes = {0L};
                for (Path p : walk.toList()) {
                    if (Files.isSymbolicLink(p)) continue;
                    Path rel = srcDir.relativize(p);
                    String relStr = rel.toString().replace('\\', '/');
                    if (relStr.contains("/.git/") || relStr.startsWith(".git/")) continue;
                    Path dest = targetRoot.resolve(relStr).normalize();
                    if (!dest.startsWith(targetRoot)) continue;
                    if (Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS)) {
                        Files.createDirectories(dest);
                    } else if (Files.isRegularFile(p, LinkOption.NOFOLLOW_LINKS)) {
                        if (++count[0] > MAX_ARCHIVE_FILES) break;
                        long size = Files.size(p);
                        if (bytes[0] + size > MAX_ARCHIVE_BYTES) break;
                        bytes[0] += size;
                        Files.createDirectories(dest.getParent());
                        Files.copy(p, dest);
                    }
                }
            }
        }
    }

    private Optional<Path> findComposeFile(Path root) throws IOException {
        try (Stream<Path> stream = Files.walk(root, 4)) {
            return stream.filter(p -> Files.isRegularFile(p, LinkOption.NOFOLLOW_LINKS))
                    .filter(p -> COMPOSE_FILE_NAMES.contains(p.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .min(Comparator.comparingInt(Path::getNameCount));
        }
    }

    protected String runDockerBuild(UUID projectId, String tag, Path dockerfile, Path contextDir) {
        return runDockerBuild(projectId, tag, dockerfile, contextDir, null, Map.of());
    }

    protected String runDockerBuild(
            UUID projectId,
            String tag,
            Path dockerfile,
            Path contextDir,
            String target,
            Map<String, String> buildArgs) {
        try {
            List<String> cmd = new ArrayList<>(List.of(
                    "docker", "build",
                    "--label", "mavis.sandbox.project=" + projectId,
                    "--tag", tag,
                    "--file", dockerfile.toString()
            ));
            if (target != null && !target.isBlank()) {
                cmd.add("--target");
                cmd.add(target);
            }
            if (buildArgs != null) {
                for (Map.Entry<String, String> arg : buildArgs.entrySet()) {
                    cmd.add("--build-arg");
                    cmd.add(arg.getKey() + "=" + arg.getValue());
                }
            }
            cmd.add(contextDir.toString());
            Process process = new ProcessBuilder(cmd)
                    .redirectErrorStream(true)
                    .start();
            var tail = new java.io.ByteArrayOutputStream();
            Thread reader = Thread.ofVirtual().start(() -> {
                try (InputStream in = process.getInputStream()) {
                    byte[] buf = new byte[4096];
                    int r;
                    while ((r = in.read(buf)) > 0) {
                        synchronized (tail) {
                            if (tail.size() > 32_768) tail.reset();
                            tail.write(buf, 0, r);
                        }
                    }
                } catch (IOException ignored) {}
            });
            boolean finished = process.waitFor(360, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return "docker build timed out after 360s";
            }
            reader.join(1000);
            if (process.exitValue() == 0) return null;
            byte[] outBytes;
            synchronized (tail) { outBytes = tail.toByteArray(); }
            String msg = SecretRedactor.redactString(new String(outBytes, StandardCharsets.UTF_8)).trim();
            if (msg.length() > 240) msg = msg.substring(msg.length() - 240);
            return "docker build exited with code " + process.exitValue() + (msg.isEmpty() ? "" : ": " + msg);
        } catch (Exception e) {
            return "Docker CLI unavailable: " + e.getMessage();
        }
    }

    protected String inspectImageId(String tag) {
        try {
            Process process = new ProcessBuilder("docker", "image", "inspect", "--format", "{{.Id}}", tag)
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(5, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return null;
            }
            if (process.exitValue() != 0) return null;
            String id = new String(process.getInputStream().readNBytes(512), StandardCharsets.UTF_8).trim();
            return IMAGE_ID_PATTERN.matcher(id).matches() ? id.toLowerCase(Locale.ROOT) : null;
        } catch (Exception e) {
            return null;
        }
    }

    protected boolean checkDockerDaemon() {
        try {
            Process process = new ProcessBuilder("docker", "info", "--format", "{{.OSType}}")
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return false;
            }
            return process.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    protected void pruneDockerDisk(boolean aggressive) {
        try {
            runQuietCommand(List.of("docker", "image", "prune", "-f"), 15);
            if (aggressive) {
                runQuietCommand(List.of("docker", "container", "prune", "-f"), 15);
                runQuietCommand(List.of("docker", "builder", "prune", "-af"), 30);
            } else {
                runQuietCommand(List.of("docker", "builder", "prune", "-f", "--keep-storage", "1500mb"), 20);
            }
        } catch (Exception ignored) {}
    }

    private static void runQuietCommand(List<String> cmd, int timeoutSeconds) {
        try {
            Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
            try (InputStream in = p.getInputStream()) {
                in.transferTo(java.io.OutputStream.nullOutputStream());
            } catch (IOException ignored) {}
            if (!p.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
                p.destroyForcibly();
            }
        } catch (Exception ignored) {}
    }

    private static void deleteQuietly(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
                try {
                    Files.deleteIfExists(p);
                } catch (IOException ignored) {}
            }
        } catch (IOException ignored) {}
    }
}
