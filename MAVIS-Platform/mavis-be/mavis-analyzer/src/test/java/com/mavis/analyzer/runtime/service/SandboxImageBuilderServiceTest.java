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
    private final UUID snapshotId = UUID.randomUUID();

    @Test
    void diskExhaustionReturnsBuildErrorWithoutRetryingHostCleanup(@TempDir Path root) throws Exception {
        Files.writeString(root.resolve("docker-compose.yml"), "services:\n  orders:\n    build: .\n");
        Files.writeString(root.resolve("Dockerfile"), "FROM scratch\n");
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projectId, String tag, Path dockerfile, Path context,
                                            String target, Map<String, String> args) {
                attempts.incrementAndGet();
                return "no space left on device";
            }
        };
        var result = builder.buildSnapshotImages(UUID.randomUUID(), snapshotId, root, List.of("orders"));
        assertThat(result.builtImages()).isEmpty();
        assertThat(result.errors()).containsExactly("Service 'orders': no space left on device");
        assertThat(attempts.get()).isEqualTo(1);
        assertThat(Files.exists(root.resolve("Dockerfile"))).isTrue();
    }

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

        SandboxImageBuilderService.BuildImagesResult res = builder.buildSnapshotImages(UUID.randomUUID(), snapshotId, tempDir, List.of("order-service"));
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

        SandboxImageBuilderService.BuildImagesResult res = builder.buildSnapshotImages(UUID.randomUUID(), snapshotId, zipPath, List.of());
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

        SandboxImageBuilderService.BuildImagesResult built = builder.buildSnapshotImages(UUID.randomUUID(), snapshotId, tempDir, List.of("order-service"));
        assertThat(built.errors()).isEmpty();
        assertThat(built.builtImages()).containsEntry("order-service", fakeDigest);

        SandboxImageBuilderService.BuildImagesResult missing = builder.buildSnapshotImages(UUID.randomUUID(), snapshotId, tempDir, List.of("closed-vendor-api"));
        assertThat(missing.builtImages()).isEmpty();
        assertThat(missing.errors()).anyMatch(e -> e.contains("closed-vendor-api") && e.contains("no build section or matching Dockerfile"));
    }

    @Test
    void autoWrapsSingleStageMavenDockerfileWithoutTargetDirAndDiscoversExistingImages(@TempDir Path tempDir) throws Exception {
        UUID projectId = UUID.fromString("2f24c1fb-7978-48f5-8c62-e239f357aaff");
        Files.writeString(tempDir.resolve("docker-compose.yml"), """
                services:
                  catalog-service:
                    build: ./catalog-service
                """);
        Path svcDir = Files.createDirectories(tempDir.resolve("catalog-service"));
        Files.writeString(svcDir.resolve("pom.xml"), "<project/>");
        Files.writeString(svcDir.resolve("Dockerfile"), """
                FROM eclipse-temurin:21-jre-alpine
                WORKDIR /app
                COPY target/*.jar app.jar
                ENTRYPOINT ["java", "-jar", "app.jar"]
                """);

        List<String> builtDockerfiles = new ArrayList<>();
        String fakeDigest = "sha256:" + "e".repeat(64);
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            public boolean isLocalBuildAvailable() {
                return true;
            }

            @Override
            protected String runDockerBuild(UUID projId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                try {
                    builtDockerfiles.add(Files.readString(dockerfile));
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return tag.equals(SandboxImageBuilderService.sandboxTag(projectId, snapshotId, "catalog-service")) ? fakeDigest : null;
            }
        };

        SandboxImageBuilderService.BuildImagesResult built = builder.buildSnapshotImages(projectId, snapshotId, tempDir, List.of("catalog-service"));
        assertThat(built.errors()).isEmpty();
        assertThat(built.builtImages()).containsEntry("catalog-service", fakeDigest);
        assertThat(builtDockerfiles).singleElement().satisfies(df -> {
            assertThat(df).contains("FROM maven:3.9.6-eclipse-temurin-21-alpine AS mavis_auto_builder");
            assertThat(df).contains("COPY --from=mavis_auto_builder /mavis_build/target/*.jar app.jar");
        });

        Map<String, String> discovered = builder.discoverExistingBuiltImages(projectId, snapshotId, List.of("catalog-service", "missing-svc"));
        assertThat(discovered).containsOnlyKeys("catalog-service").containsEntry("catalog-service", fakeDigest);
        assertThat(builder.discoverExistingBuiltImages(projectId, UUID.randomUUID(), List.of("catalog-service"))).isEmpty();
        assertThat(builder.discoverExistingBuiltImages(UUID.randomUUID(), snapshotId, List.of("catalog-service"))).isEmpty();
    }

    @Test
    void autoSynthesizesMissingDockerfileInMultiModuleMavenReactor(@TempDir Path tempDir) throws Exception {
        UUID projectId = UUID.randomUUID();
        Files.writeString(tempDir.resolve("pom.xml"), "<project><modules><module>order-service</module></modules></project>");
        Path orderDir = Files.createDirectories(tempDir.resolve("order-service/src/main/java"));
        Files.writeString(tempDir.resolve("order-service/pom.xml"), "<project><parent><groupId>demo</groupId><artifactId>root</artifactId><version>1.0</version></parent></project>");
        Files.writeString(orderDir.resolve("App.java"), "class App {}");

        List<String> builtDockerfiles = new ArrayList<>();
        List<Path> builtContexts = new ArrayList<>();
        String fakeDigest = "sha256:" + "9".repeat(64);
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                try {
                    builtDockerfiles.add(Files.readString(dockerfile));
                    builtContexts.add(contextDir);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return fakeDigest;
            }
        };

        SandboxImageBuilderService.BuildImagesResult built = builder.buildSnapshotImages(projectId, snapshotId, tempDir, List.of("order-service"));
        assertThat(built.errors()).isEmpty();
        assertThat(built.builtImages()).containsEntry("order-service", fakeDigest);
        assertThat(builtDockerfiles).singleElement().satisfies(df -> {
            assertThat(df).contains("mvn clean package -pl order-service -am -DskipTests -B");
            assertThat(df).contains("/mavis_build/order-service/target/*.jar");
        });
    }

    @Test
    void findMissingLocalImageServicesDetectsAbsentSha256ImagesAndIgnoresRegistryPins() {
        String presentDigest = "sha256:" + "1".repeat(64);
        String missingDigest = "sha256:" + "2".repeat(64);
        String registryDigest = "postgres@sha256:" + "3".repeat(64);
        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            public boolean isLocalBuildAvailable() {
                return true;
            }

            @Override
            protected String inspectImageId(String tag) {
                return presentDigest.equals(tag) ? presentDigest : null;
            }
        };

        String compose = """
                services:
                  api-gateway:
                    image: %s
                  order-service:
                    image: %s
                  sandbox-postgres:
                    image: %s
                """.formatted(presentDigest, missingDigest, registryDigest);

        assertThat(builder.findMissingLocalImageServices(compose)).containsExactly("order-service");
    }

    @Test
    void buildSnapshotImagesPublishesImmutableRegistryDigestWhenSharedRegistryConfigured(@TempDir Path tempDir) throws Exception {
        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        Path svcDir = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(svcDir.resolve("Dockerfile"), "FROM eclipse-temurin:21-jre\n");

        String localId = "sha256:" + "4".repeat(64);
        String remoteDigest = "ghcr.io/mavis-platform/mavis-sandbox/order-service@sha256:" + "5".repeat(64);

        SandboxImageBuilderService builder = new SandboxImageBuilderService() {
            @Override
            protected String runDockerBuild(UUID projId, String tag, Path dockerfile, Path contextDir, String target, Map<String, String> buildArgs) {
                return null;
            }

            @Override
            protected String inspectImageId(String tag) {
                return localId;
            }

            @Override
            protected String publishToSharedRegistry(String localTag) {
                return remoteDigest;
            }
        };
        org.springframework.test.util.ReflectionTestUtils.setField(builder, "sandboxRegistry", "ghcr.io/mavis-platform/mavis-sandbox");

        var result = builder.buildSnapshotImages(projectId, snapshotId, tempDir, List.of("order-service"));
        assertThat(result.errors()).isEmpty();
        assertThat(result.builtImages()).containsEntry("order-service", remoteDigest);
    }
}
