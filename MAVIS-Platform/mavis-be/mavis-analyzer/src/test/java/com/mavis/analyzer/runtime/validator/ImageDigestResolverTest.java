package com.mavis.analyzer.runtime.validator;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ImageDigestResolverTest {

    @Test
    void resolvesTaggedImageViaRegistryV2BearerChallengeAndRejectsUnknownTagWithoutFakeDigest() throws Exception {
        String realDigest = "sha256:" + "7c4b9f".repeat(10) + "abcd";
        HttpServer mockRegistry = HttpServer.create(new InetSocketAddress(0), 0);
        try {
            int port = mockRegistry.getAddress().getPort();
            String baseUrl = "http://127.0.0.1:" + port;

            mockRegistry.createContext("/token", exchange -> {
                byte[] body = "{\"token\":\"mock-registry-jwt\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });

            mockRegistry.createContext("/v2/library/postgres/manifests/16", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                if (!"Bearer mock-registry-jwt".equals(auth)) {
                    exchange.getResponseHeaders().add("WWW-Authenticate",
                            "Bearer realm=\"" + baseUrl + "/token\",service=\"registry.test\",scope=\"repository:library/postgres:pull\"");
                    exchange.sendResponseHeaders(401, -1);
                } else {
                    exchange.getResponseHeaders().add("Docker-Content-Digest", realDigest);
                    exchange.sendResponseHeaders(200, -1);
                }
                exchange.close();
            });

            mockRegistry.createContext("/v2/library/unknown-app/manifests/latest", exchange -> {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
            });

            mockRegistry.start();

            ImageDigestResolver resolver = new ImageDigestResolver(
                    HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
                    baseUrl,
                    false,
                    Map.of()
            );

            assertThat(resolver.resolve("postgres:16")).contains("postgres@" + realDigest);
            assertThat(resolver.resolve("unknown-app:latest")).isEmpty();
        } finally {
            mockRegistry.stop(0);
        }
    }

    @Test
    void authenticatesPrivateRegistryBearerTokenAndBasicManifestHeadWithRegistryAuthAndDockerConfigJson() throws Exception {
        String ghcrDigest = "sha256:" + "1a2b3c".repeat(10) + "9999";
        String basicDigest = "sha256:" + "4d5e6f".repeat(10) + "8888";
        HttpServer mockRegistry = HttpServer.create(new InetSocketAddress(0), 0);
        try {
            int port = mockRegistry.getAddress().getPort();
            String hostPort = "127.0.0.1:" + port;
            String baseUrl = "http://" + hostPort;
            String expectedBasic = "Basic " + java.util.Base64.getEncoder().encodeToString("deploy-user:ghp_secret".getBytes(StandardCharsets.UTF_8));

            mockRegistry.createContext("/token", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                if (!expectedBasic.equals(auth)) {
                    exchange.sendResponseHeaders(401, -1);
                } else {
                    byte[] body = "{\"access_token\":\"private-jwt\"}".getBytes(StandardCharsets.UTF_8);
                    exchange.getResponseHeaders().add("Content-Type", "application/json");
                    exchange.sendResponseHeaders(200, body.length);
                    exchange.getResponseBody().write(body);
                }
                exchange.close();
            });

            mockRegistry.createContext("/v2/acme/private-order/manifests/1.2.0", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                if (!"Bearer private-jwt".equals(auth)) {
                    exchange.getResponseHeaders().add("WWW-Authenticate",
                            "Bearer realm=\"" + baseUrl + "/token\",service=\"ghcr.io\",scope=\"repository:acme/private-order:pull\"");
                    exchange.sendResponseHeaders(401, -1);
                } else {
                    exchange.getResponseHeaders().add("Docker-Content-Digest", ghcrDigest);
                    exchange.sendResponseHeaders(200, -1);
                }
                exchange.close();
            });

            mockRegistry.createContext("/v2/acme/basic-only/manifests/v1", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                if (!expectedBasic.equals(auth)) {
                    exchange.getResponseHeaders().add("WWW-Authenticate", "Basic realm=\"Private Registry\"");
                    exchange.sendResponseHeaders(401, -1);
                } else {
                    exchange.getResponseHeaders().add("Docker-Content-Digest", basicDigest);
                    exchange.sendResponseHeaders(200, -1);
                }
                exchange.close();
            });

            mockRegistry.start();

            Map<String, String> parsed = ImageDigestResolver.parseRegistryAuth(
                    "ghcr.io=deploy-user:ghp_secret",
                    "{\"auths\":{\"https://private.registry.example/v2/\":{\"auth\":\"" +
                            java.util.Base64.getEncoder().encodeToString("deploy-user:ghp_secret".getBytes(StandardCharsets.UTF_8)) + "\"}}}"
            );
            assertThat(parsed)
                    .containsEntry("ghcr.io", "deploy-user:ghp_secret")
                    .containsEntry("private.registry.example", "deploy-user:ghp_secret");

            ImageDigestResolver resolver = new ImageDigestResolver(
                    HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
                    baseUrl,
                    false,
                    Map.of(),
                    parsed
            );

            assertThat(resolver.resolve("ghcr.io/acme/private-order:1.2.0"))
                    .contains("ghcr.io/acme/private-order@" + ghcrDigest);
            assertThat(resolver.resolve("private.registry.example/acme/basic-only:v1"))
                    .contains("private.registry.example/acme/basic-only@" + basicDigest);
        } finally {
            mockRegistry.stop(0);
        }
    }
}
