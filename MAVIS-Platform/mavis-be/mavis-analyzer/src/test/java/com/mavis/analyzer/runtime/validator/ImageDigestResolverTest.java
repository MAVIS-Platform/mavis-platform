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
}
