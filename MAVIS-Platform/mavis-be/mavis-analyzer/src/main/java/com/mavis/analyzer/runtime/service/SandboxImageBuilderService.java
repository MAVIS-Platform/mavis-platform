package com.mavis.analyzer.runtime.service;

import com.mavis.analyzer.runtime.util.SecretRedactor;
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
            workspace = Files.createTempDirectory("mavis-imgbuild-");
            extractOrCopySnapshot(snapshotStoragePath, workspace);

            Path composeFile = findComposeFile(workspace)
                    .orElseThrow(() -> new BusinessException(ErrorCode.BAD_REQUEST, "No docker-compose.yml found in snapshot"));
            Path composeDir = composeFile.getParent();

            Object loaded = new Yaml(new SafeConstructor(new LoaderOptions()))
                    .load(Files.readString(composeFile, StandardCharsets.UTF_8));
            if (!(loaded instanceof Map<?, ?> rootMap) || !(rootMap.get("services") instanceof Map<?, ?> servicesMap)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "docker-compose.yml does not contain a valid services mapping");
            }

            Set<String> filter = requestedServices != null && !requestedServices.isEmpty()
                    ? Set.copyOf(requestedServices)
                    : Set.of();

            Map<String, String> builtImages = new LinkedHashMap<>();
            List<String> errors = new ArrayList<>();
            String projPrefix = projectId.toString().replace("-", "").substring(0, 8).toLowerCase(Locale.ROOT);

            for (Map.Entry<?, ?> entry : servicesMap.entrySet()) {
                String svc = String.valueOf(entry.getKey());
                if (!filter.isEmpty() && !filter.contains(svc)) continue;
                if (!(entry.getValue() instanceof Map<?, ?> cfg) || !cfg.containsKey("build")) continue;

                BuildSpec spec = parseBuildSpec(cfg.get("build"));
                Path contextDir = composeDir.resolve(spec.context()).normalize();
                Path dockerfile = contextDir.resolve(spec.dockerfile()).normalize();

                if (!contextDir.startsWith(workspace) || !dockerfile.startsWith(workspace)
                        || Files.isSymbolicLink(contextDir) || Files.isSymbolicLink(dockerfile)
                        || !Files.isDirectory(contextDir, LinkOption.NOFOLLOW_LINKS)
                        || !Files.isRegularFile(dockerfile, LinkOption.NOFOLLOW_LINKS)) {
                    errors.add("Service '" + svc + "': build context or Dockerfile is missing or outside snapshot root");
                    continue;
                }

                String safeSvc = svc.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_-]", "-");
                if (safeSvc.length() > 40) safeSvc = safeSvc.substring(0, 40);
                String tag = "mavis-sandbox-" + projPrefix + "-" + safeSvc + ":latest";

                String buildErr = runDockerBuild(projectId, tag, dockerfile, contextDir);
                if (buildErr != null) {
                    errors.add("Service '" + svc + "': " + buildErr);
                    continue;
                }

                String imageId = inspectImageId(tag);
                if (imageId != null) {
                    builtImages.put(svc, imageId);
                } else {
                    errors.add("Service '" + svc + "': image built but content digest could not be inspected");
                }
            }

            return new BuildImagesResult(builtImages, errors);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Sandbox image build failed for project {}: {}", projectId, e.getMessage());
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Failed to build sandbox images: " + SecretRedactor.redactString(String.valueOf(e.getMessage())));
        } finally {
            deleteQuietly(workspace);
        }
    }

    private record BuildSpec(String context, String dockerfile) {}

    private static BuildSpec parseBuildSpec(Object buildNode) {
        if (buildNode instanceof Map<?, ?> map) {
            String ctx = map.get("context") != null ? String.valueOf(map.get("context")).trim() : ".";
            String df = map.get("dockerfile") != null ? String.valueOf(map.get("dockerfile")).trim() : "Dockerfile";
            return new BuildSpec(ctx.isEmpty() ? "." : ctx, df.isEmpty() ? "Dockerfile" : df);
        }
        String ctx = buildNode != null ? String.valueOf(buildNode).trim() : ".";
        return new BuildSpec(ctx.isEmpty() ? "." : ctx, "Dockerfile");
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
        try {
            Process process = new ProcessBuilder(
                    "docker", "build",
                    "--label", "mavis.sandbox.project=" + projectId,
                    "--tag", tag,
                    "--file", dockerfile.toString(),
                    contextDir.toString())
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
            boolean finished = process.waitFor(180, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return "docker build timed out after 180s";
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
