package com.mavis.analyzer.runtime.validator;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves unpinned container image tags (e.g. {@code postgres:16}, {@code ghcr.io/org/app:1.0})
 * to real content-addressed digests ({@code repo@sha256:<64-hex>}) via:
 * 1) Operator-configured pins ({@code mavis.runner.pinned-images})
 * 2) OCI / Docker Registry HTTP API v2 manifest HEAD request
 * 3) Local Docker daemon {@code docker image inspect} fallback
 */
@Component
@Slf4j
public class ImageDigestResolver {

    private static final Pattern ALREADY_PINNED = Pattern.compile("^(.+@)?sha256:([0-9a-fA-F]{64})$");
    private static final Pattern DIGEST_VALUE = Pattern.compile("^sha256:[0-9a-fA-F]{64}$");
    private static final Pattern SAFE_IMAGE_REF = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$");
    private static final Pattern BEARER_PARAM = Pattern.compile("([a-zA-Z]+)=\"([^\"]+)\"");
    private static final String MANIFEST_ACCEPT = String.join(", ",
            "application/vnd.oci.image.index.v1+json",
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json");

    private final HttpClient httpClient;
    private final String registryBaseOverride;
    private final boolean allowLocalDockerFallback;
    private final Map<String, String> operatorPins;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, String> resolvedCache = new ConcurrentHashMap<>();

    public ImageDigestResolver() {
        this("");
    }

    @Autowired
    public ImageDigestResolver(@Value("${mavis.runner.pinned-images:}") String configuredPins) {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NORMAL).build(),
                null, true, parseOperatorPins(configuredPins));
    }

    public ImageDigestResolver(
            HttpClient httpClient,
            String registryBaseOverride,
            boolean allowLocalDockerFallback,
            Map<String, String> operatorPins) {
        this.httpClient = httpClient;
        this.registryBaseOverride = registryBaseOverride;
        this.allowLocalDockerFallback = allowLocalDockerFallback;
        this.operatorPins = operatorPins != null ? Map.copyOf(operatorPins) : Map.of();
    }

    public Optional<String> resolve(String rawImage) {
        if (rawImage == null || rawImage.isBlank()) return Optional.empty();
        String trimmed = rawImage.trim();
        if (!SAFE_IMAGE_REF.matcher(trimmed).matches()) return Optional.empty();

        if (ALREADY_PINNED.matcher(trimmed).matches()) {
            int idx = trimmed.indexOf("sha256:");
            return Optional.of(trimmed.substring(0, idx) + trimmed.substring(idx).toLowerCase(Locale.ROOT));
        }

        String cached = resolvedCache.get(trimmed);
        if (cached != null) return Optional.of(cached);

        String pinned = matchOperatorPin(trimmed);
        if (pinned != null) {
            cache(trimmed, pinned);
            return Optional.of(pinned);
        }

        Optional<String> fromRegistry = resolveFromRegistryV2(trimmed);
        if (fromRegistry.isPresent()) {
            cache(trimmed, fromRegistry.get());
            return fromRegistry;
        }

        if (allowLocalDockerFallback) {
            Optional<String> fromLocal = resolveFromLocalDocker(trimmed);
            if (fromLocal.isPresent()) {
                cache(trimmed, fromLocal.get());
                return fromLocal;
            }
        }
        return Optional.empty();
    }

    private void cache(String key, String resolved) {
        if (resolvedCache.size() < 512) {
            resolvedCache.put(key, resolved);
        }
    }

    private String matchOperatorPin(String image) {
        if (operatorPins.isEmpty()) return null;
        if (operatorPins.containsKey(image)) return operatorPins.get(image);
        String withoutTag = stripTag(image);
        if (operatorPins.containsKey(withoutTag)) return operatorPins.get(withoutTag);
        String shortName = withoutTag.contains("/") ? withoutTag.substring(withoutTag.lastIndexOf('/') + 1) : withoutTag;
        return operatorPins.get(shortName);
    }

    private Optional<String> resolveFromRegistryV2(String imageRef) {
        if (httpClient == null) return Optional.empty();
        try {
            ParsedImage parsed = parseImage(imageRef);
            if (parsed == null) return Optional.empty();

            String baseUrl;
            if (registryBaseOverride != null && !registryBaseOverride.isBlank()) {
                baseUrl = registryBaseOverride.endsWith("/")
                        ? registryBaseOverride.substring(0, registryBaseOverride.length() - 1)
                        : registryBaseOverride;
            } else {
                if ("localhost".equalsIgnoreCase(parsed.registry()) || parsed.registry().startsWith("127.")) {
                    return Optional.empty();
                }
                baseUrl = "https://" + parsed.registry();
            }

            URI manifestUri = URI.create(baseUrl + "/v2/" + parsed.apiRepository() + "/manifests/" + parsed.tag());
            HttpResponse<Void> resp = sendManifestHead(manifestUri, null);

            if (resp.statusCode() == 401) {
                Optional<String> wwwAuth = resp.headers().firstValue("WWW-Authenticate");
                if (wwwAuth.isPresent()) {
                    String token = fetchBearerToken(wwwAuth.get());
                    if (token != null && !token.isBlank()) {
                        resp = sendManifestHead(manifestUri, token);
                    }
                }
            }

            if (resp.statusCode() >= 200 && resp.statusCode() < 300) {
                Optional<String> digestHeader = resp.headers().firstValue("Docker-Content-Digest");
                if (digestHeader.isPresent() && DIGEST_VALUE.matcher(digestHeader.get().trim()).matches()) {
                    return Optional.of(parsed.displayRepository() + "@" + digestHeader.get().trim().toLowerCase(Locale.ROOT));
                }
            }
        } catch (Exception e) {
            log.debug("Registry v2 digest lookup skipped for {}: {}", imageRef, e.getMessage());
        }
        return Optional.empty();
    }

    private HttpResponse<Void> sendManifestHead(URI uri, String bearerToken) throws Exception {
        HttpRequest.Builder req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(4))
                .header("Accept", MANIFEST_ACCEPT)
                .method("HEAD", HttpRequest.BodyPublishers.noBody());
        if (bearerToken != null && !bearerToken.isBlank()) {
            req.header("Authorization", "Bearer " + bearerToken);
        }
        return httpClient.send(req.build(), HttpResponse.BodyHandlers.discarding());
    }

    private String fetchBearerToken(String challenge) {
        if (!challenge.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
        Map<String, String> params = new LinkedHashMap<>();
        Matcher m = BEARER_PARAM.matcher(challenge);
        while (m.find()) {
            params.put(m.group(1).toLowerCase(Locale.ROOT), m.group(2));
        }
        String realm = params.get("realm");
        if (realm == null || realm.isBlank()) return null;
        boolean allowedRealm = realm.startsWith("https://")
                || (registryBaseOverride != null && (realm.startsWith("http://127.0.0.1:") || realm.startsWith("http://localhost:")));
        if (!allowedRealm) return null;

        StringBuilder url = new StringBuilder(realm);
        char sep = realm.contains("?") ? '&' : '?';
        for (String key : new String[]{"service", "scope"}) {
            if (params.containsKey(key)) {
                url.append(sep).append(key).append('=').append(URLEncoder.encode(params.get(key), StandardCharsets.UTF_8));
                sep = '&';
            }
        }
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url.toString()))
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() >= 200 && resp.statusCode() < 300 && resp.body() != null) {
                JsonNode node = objectMapper.readTree(resp.body());
                String token = node.path("token").asText("");
                if (token.isBlank()) token = node.path("access_token").asText("");
                return token.isBlank() ? null : token;
            }
        } catch (Exception e) {
            log.debug("Registry bearer token request failed: {}", e.getMessage());
        }
        return null;
    }

    private Optional<String> resolveFromLocalDocker(String imageRef) {
        try {
            Process process = new ProcessBuilder("docker", "image", "inspect",
                    "--format", "{{range .RepoDigests}}{{.}}\n{{end}}ID={{.Id}}", imageRef)
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(3, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                return Optional.empty();
            }
            if (process.exitValue() != 0) return Optional.empty();
            String output = new String(process.getInputStream().readNBytes(16_384), StandardCharsets.UTF_8);
            String fallbackId = null;
            for (String rawLine : output.split("\\r?\\n")) {
                String line = rawLine.trim();
                if (line.isEmpty()) continue;
                if (line.startsWith("ID=")) {
                    String id = line.substring(3).trim();
                    if (DIGEST_VALUE.matcher(id).matches()) fallbackId = id.toLowerCase(Locale.ROOT);
                } else if (ALREADY_PINNED.matcher(line).matches()) {
                    int idx = line.indexOf("sha256:");
                    return Optional.of(line.substring(0, idx) + line.substring(idx).toLowerCase(Locale.ROOT));
                }
            }
            return Optional.ofNullable(fallbackId);
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private record ParsedImage(String registry, String apiRepository, String displayRepository, String tag) {}

    private static ParsedImage parseImage(String imageRef) {
        String withoutTag = stripTag(imageRef);
        String tag = imageRef.length() > withoutTag.length() ? imageRef.substring(withoutTag.length() + 1) : "latest";
        if (withoutTag.isBlank() || tag.isBlank()) return null;

        int slash = withoutTag.indexOf('/');
        String firstSegment = slash > 0 ? withoutTag.substring(0, slash) : "";
        boolean explicitRegistry = slash > 0 && (firstSegment.contains(".") || firstSegment.contains(":") || "localhost".equalsIgnoreCase(firstSegment));

        if (!explicitRegistry) {
            String repoPath = withoutTag.contains("/") ? withoutTag : "library/" + withoutTag;
            return new ParsedImage("registry-1.docker.io", repoPath, withoutTag, tag);
        }
        String registry = "docker.io".equalsIgnoreCase(firstSegment) ? "registry-1.docker.io" : firstSegment;
        String remainder = withoutTag.substring(slash + 1);
        if ("registry-1.docker.io".equals(registry) && !remainder.contains("/")) {
            remainder = "library/" + remainder;
        }
        return new ParsedImage(registry, remainder, withoutTag, tag);
    }

    private static String stripTag(String imageRef) {
        int lastSlash = imageRef.lastIndexOf('/');
        int lastColon = imageRef.lastIndexOf(':');
        return lastColon > lastSlash ? imageRef.substring(0, lastColon) : imageRef;
    }

    private static Map<String, String> parseOperatorPins(String configuredPins) {
        Map<String, String> map = new LinkedHashMap<>();
        if (configuredPins == null || configuredPins.isBlank()) return map;
        for (String entry : configuredPins.split("[,;]")) {
            String trimmed = entry.trim();
            int eq = trimmed.indexOf('=');
            if (eq > 0) {
                String k = trimmed.substring(0, eq).trim();
                String v = trimmed.substring(eq + 1).trim();
                if (!k.isEmpty() && ALREADY_PINNED.matcher(v).matches()) {
                    map.put(k, v);
                }
            }
        }
        return map;
    }
}
