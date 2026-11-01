package com.mavis.analyzer.runtime.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class SandboxImageBuilderServiceTest {

    @Test
    void buildsMultiStageTargetAndBuildArgsFromComposeAndDotEnv(@TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve(".env"), "JAVA_VER=21\n");
        Files.writeString(tempDir.resolve("docker-compose.yml"), """
                services:
                  order-service:
                    build:
                      context: ./order-service
                      dockerfile: Dockerfile.multi
                      target: production-runtime
                      args:
                        JAVA_VERSION: ${JAVA_VER}
                        APP_ENV: ${BUILD_ENV:-sandbox}
                        UNRESOLVED_SECRET: ${MISSING_SECRET}
                """);
        Path svcDir = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(svcDir.resolve("Dockerfile.multi"), "FROM eclipse-temurin:21-jre AS production-runtime\n");

        List<String> capturedTargets = new ArrayList<>();
        Map<String, String> capturedArgs = new LinkedHashMap<>();
        String fakeDigest = "sha256:" + "c".repeat(64);

        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projectId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                capturedTargets.add(target);
                capturedArgs.putAll(buildArgs);
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return fakeDigest;
            }
        };

        SandboxImageBuilderService.BuildImagesResult res = builder.buildSnapshotImages(UUID.randomUUID(), tempDir, List.of("order-service"));
        assertThat(res.errors()).isEmpty();
        assertThat(res.builtImages()).containsEntry("order-service", fakeDigest);
        assertThat(capturedTargets).containsExactly("production-runtime");
        assertThat(capturedArgs)
                .containsEntry("JAVA_VERSION", "21")
                .containsEntry("APP_ENV", "sandbox")
                .doesNotContainKey("UNRESOLVED_SECRET");
    }

    @Test
    void buildsStandaloneDockerfileZipSnapshotWithoutDockerCompose(@TempDir Path tempDir) throws Exception {
        Path zipPath = tempDir.resolve("standalone-microservices.zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zipPath))) {
            zos.putNextEntry(new ZipEntry("demo-repo-abcdef1234/order-service/Dockerfile"));
            zos.write("FROM eclipse-temurin:21-jre\nEXPOSE 8081\n".getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
            zos.putNextEntry(new ZipEntry("demo-repo-abcdef1234/catalog-service/Dockerfile"));
            zos.write("FROM eclipse-temurin:21-jre\nEXPOSE 8082\n".getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
        }

        String digestA = "sha256:" + "a".repeat(64);
        String digestB = "sha256:" + "b".repeat(64);
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projectId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                assertThat(Files.isRegularFile(dockerfile)).isTrue();
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return tag.contains("order-service") ? digestA : digestB;
            }
        };

        SandboxImageBuilderService.BuildImagesResult res = builder.buildSnapshotImages(UUID.randomUUID(), zipPath, List.of());
        assertThat(res.errors()).isEmpty();
        assertThat(res.builtImages())
                .containsEntry("order-service", digestA)
                .containsEntry("catalog-service", digestB);
    }

    @Test
    void buildsComposeServiceWithUnpinnedImageUsingDiscoveredDockerfileAndReportsMissingOnes(@TempDir Path tempDir) throws Exception {
        Files.writeString(tempDir.resolve("docker-compose.yml"), """
                services:
                  postgres:
                    image: postgres:16-alpine
                  order-service:
                    image: myorg/order-service:latest
                  closed-vendor-api:
                    image: vendor/closed-api:latest
                """);
        Path svcDir = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(svcDir.resolve("Dockerfile"), "FROM eclipse-temurin:21-jre\nEXPOSE 8080\n");

        String fakeDigest = "sha256:" + "d".repeat(64);
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projectId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                assertThat(Files.isRegularFile(dockerfile)).isTrue();
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return fakeDigest;
            }
        };

        SandboxImageBuilderService.BuildImagesResult built = builder.buildSnapshotImages(
                UUID.randomUUID(), tempDir, List.of("order-service"));
        assertThat(built.errors()).isEmpty();
        assertThat(built.builtImages()).containsEntry("order-service", fakeDigest);

        SandboxImageBuilderService.BuildImagesResult missing = builder.buildSnapshotImages(
                UUID.randomUUID(), tempDir, List.of("closed-vendor-api"));
        assertThat(missing.builtImages()).isEmpty();
        assertThat(missing.errors()).anyMatch(e -> e.contains("closed-vendor-api") && e.contains("no build section or matching Dockerfile"));
    }
}
