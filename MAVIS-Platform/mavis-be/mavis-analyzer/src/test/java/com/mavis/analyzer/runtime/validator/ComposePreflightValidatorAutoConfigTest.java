package com.mavis.analyzer.runtime.validator;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.RequiredEnvVarDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComposePreflightValidatorAutoConfigTest {

    private final ComposePreflightValidator validator = new ComposePreflightValidator(
            new ImageDigestResolver(null, null, false, Map.of(
                    "postgres", "postgres@sha256:" + "9".repeat(64)
            ))
    );

    @Test
    void runnerReadyComposeHasNoIssuesAndUsesExposeAndHealthcheck() {
        PreflightCheckResponseDTO dto = validator.validate("""
                services:
                  order-service:
                    image: eclipse-temurin:21-jdk@sha256:%s
                    expose:
                      - "8081"
                    healthcheck:
                      test: ["CMD", "wget", "-qO-", "http://localhost:8081/actuator/health/readiness"]
                    environment:
                      SERVER_PORT: "8081"
                """.formatted("a".repeat(64)));

        assertThat(dto.getRunnerIssues()).isEmpty();
        assertThat(dto.getServicePorts()).containsEntry("order-service", 8081);
        assertThat(dto.getServiceHealthPaths()).containsEntry("order-service", "/actuator/health/readiness");
        assertThat(dto.getServiceHealthConfidence()).containsEntry("order-service", "DETECTED");
        assertThat(dto.getInfrastructureServices()).isEmpty();
    }

    @Test
    void typicalDeveloperComposeExplainsIssuesAndGeneratesRunnerReadySandboxCompose() {
        String rawCompose = """
                version: "3.8"
                services:
                  order-service:
                    build: ./order-service
                    ports:
                      - "9090:8080"
                    environment:
                      - DB_PASSWORD=${DB_PASSWORD}
                      - SPRING_PROFILES_ACTIVE=${PROFILE:-docker}
                  orders-db:
                    image: postgres:16
                    environment:
                      POSTGRES_PASSWORD: local-dev-password
                networks:
                  default: {}
                """;
        PreflightCheckResponseDTO dto = validator.validate(rawCompose);

        assertThat(dto.isCompatible()).isTrue();
        assertThat(dto.getRunnerIssues())
                .anyMatch(i -> i.contains("'version'"))
                .anyMatch(i -> i.contains("'networks'"))
                .anyMatch(i -> i.contains("uses build:"))
                .anyMatch(i -> i.contains("replace it with expose:"))
                .anyMatch(i -> i.contains("'$' interpolation"))
                .anyMatch(i -> i.contains("map form"))
                .anyMatch(i -> i.contains("postgres:16") && i.contains("pinned by digest"));
        assertThat(dto.getServicePorts()).containsEntry("order-service", 8080);
        assertThat(dto.getInfrastructureServices()).containsExactly("orders-db");
        assertThat(dto.getSandboxComposeChanges()).isNotEmpty();
        assertThat(dto.getRelocatedComposeSecrets()).containsKey("orders-db");
        assertThat(dto.getRelocatedComposeSecrets().get("orders-db")).containsEntry("POSTGRES_PASSWORD", "local-dev-password");
        // Only build: remains unresolvable without a user image override; ports, version, networks, list env, ${}, stateful volumes, and postgres:16 are auto-fixed!
        assertThat(dto.getUnresolvableRunnerIssues()).singleElement().satisfies(i -> assertThat(i).contains("uses build:"));

        // Providing the published image for order-service produces a 100% Runner-compatible Compose file
        PreflightCheckResponseDTO remediated = validator.validate(rawCompose, Map.of(
                "order-service", "example/order-service@sha256:" + "f".repeat(64)
        ));
        assertThat(remediated.getUnresolvableRunnerIssues()).isEmpty();
        assertThat(remediated.getSandboxComposeYaml())
                .isNotBlank()
                .doesNotContain("$")
                .doesNotContain("networks:")
                .doesNotContain("local-dev-password")
                .contains("user: postgres")
                .contains("orders-db_data")
                .contains("/var/lib/postgresql/data")
                .contains("/var/run/postgresql");
        PreflightCheckResponseDTO recheck = validator.validate(remediated.getSandboxComposeYaml());
        assertThat(recheck.getRunnerIssues()).isEmpty();
    }

    @Test
    void databaseContainerCredentialsAreMatchedPerServiceInMultiDbTopologies() {
        PreflightCheckResponseDTO dto = validator.validate("""
                services:
                  order-service:
                    image: example/order@sha256:%s
                    depends_on:
                      - orders-db
                  catalog-service:
                    image: example/catalog@sha256:%s
                    environment:
                      SPRING_DATASOURCE_URL: jdbc:postgresql://catalog-db:5432/catalog
                  orders-db:
                    image: postgres@sha256:%s
                    environment:
                      POSTGRES_PASSWORD: orders-secret-pw
                  catalog-db:
                    image: postgres@sha256:%s
                    environment:
                      POSTGRES_PASSWORD: catalog-secret-pw
                """.formatted("1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)));

        assertThat(ComposePreflightValidator.databaseCredentialFor("DB_PASSWORD", "order-service", dto)).isEqualTo("orders-secret-pw");
        assertThat(ComposePreflightValidator.databaseCredentialFor("DB_PASSWORD", "catalog-service", dto)).isEqualTo("catalog-secret-pw");
        assertThat(ComposePreflightValidator.databaseCredentialFor("SPRING_DATASOURCE_USERNAME", "catalog-service", dto)).isEqualTo("postgres");
        assertThat(ComposePreflightValidator.databaseCredentialFor("JWT_SECRET", "order-service", dto)).isNull();
        assertThat(ComposePreflightValidator.isInfrastructureService("payment-service", "redis:7")).isFalse();
    }

    @Test
    void contextPathUnifiedActuatorPortAlpineDotnetAndTrueStacksAreDetectedFromSource(@TempDir Path tempDir) throws Exception {
        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .detectedServices(List.of("order-service", "gateway-service", "auth-service", "legacy-service"))
                .servicePorts(new LinkedHashMap<>(Map.of("order-service", 8080, "gateway-service", 8080, "auth-service", 8080, "legacy-service", 8080)))
                .serviceStacks(new LinkedHashMap<>(Map.of("order-service", "java", "gateway-service", "java", "auth-service", "dotnet", "legacy-service", "java")))
                .build();

        Path orderRes = Files.createDirectories(tempDir.resolve("order-service/src/main/resources"));
        Files.writeString(orderRes.resolve("application.properties"), """
                server.port=8085
                management.server.port=9091
                server.servlet.context-path=/orders
                management.endpoints.web.base-path=/mgmt
                """);
        Files.writeString(tempDir.resolve("order-service/pom.xml"), "<project><dependencies><dependency><artifactId>spring-boot-starter-actuator</artifactId></dependency></dependencies></project>");
        Path orderJava = Files.createDirectories(tempDir.resolve("order-service/src/main/java/demo"));
        Files.writeString(orderJava.resolve("OrderController.java"), """
                @RestController
                @RequestMapping("/api")
                public class OrderController {
                    @GetMapping("/items")
                    public String items() { return "ok"; }
                }
                """);

        Path gatewayDir = Files.createDirectories(tempDir.resolve("gateway-service"));
        Files.writeString(gatewayDir.resolve("package.json"), "{\"name\":\"gateway-service\"}");
        Files.writeString(gatewayDir.resolve("server.js"), "app.get('/healthz', (req, res) => res.send('ok'));");

        Path authDir = Files.createDirectories(tempDir.resolve("auth-service"));
        Files.writeString(authDir.resolve("Auth.csproj"), "<Project Sdk=\"Microsoft.NET.Sdk.Web\"></Project>");
        Files.writeString(authDir.resolve("Dockerfile"), "FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine\nCOPY . /app\n");

        validator.inspectSnapshotSource(tempDir, dto);

        // Main traffic port 8085 is preserved (never overwritten by management.server.port=9091), and unifiedManagementPorts records 8085
        assertThat(dto.getServicePorts()).containsEntry("order-service", 8085);
        assertThat(dto.getUnifiedManagementPorts()).containsEntry("order-service", 8085);
        assertThat(dto.getServiceHealthPaths()).containsEntry("order-service", "/orders/mgmt/health");
        assertThat(dto.getServiceHealthConfidence()).containsEntry("order-service", "DETECTED");
        assertThat(dto.getDetectedEndpoints()).anyMatch(ep -> "order-service".equals(ep.getService()) && "/orders/api/items".equals(ep.getPath()));

        assertThat(dto.getServiceStacks()).containsEntry("gateway-service", "node");
        assertThat(dto.getServiceHealthPaths()).containsEntry("gateway-service", "/healthz");
        assertThat(dto.getServiceHealthConfidence()).containsEntry("gateway-service", "DETECTED");

        assertThat(dto.getServiceStacks()).containsEntry("auth-service", "dotnet-musl");

        assertThat(dto.getServiceHealthPaths()).containsEntry("legacy-service", "/");
        assertThat(dto.getServiceHealthConfidence()).containsEntry("legacy-service", "ASSUMED");
    }

    @Test
    void twoPassPriorityScanDiscoversLateAlphabeticalMicroserviceInLargeMonorepo(@TempDir Path tempDir) throws Exception {
        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .detectedServices(List.of("a-core-service", "z-payment-service"))
                .servicePorts(new LinkedHashMap<>(Map.of("a-core-service", 8080, "z-payment-service", 8080)))
                .serviceStacks(new LinkedHashMap<>(Map.of("a-core-service", "java", "z-payment-service", "java")))
                .build();

        Path noisyDir = Files.createDirectories(tempDir.resolve("a-core-service/src/main/java/model"));
        for (int i = 0; i < 600; i++) {
            Files.writeString(noisyDir.resolve("Entity" + String.format("%04d", i) + ".java"), "package model; public class Entity" + i + " {}");
        }

        Path paymentRes = Files.createDirectories(tempDir.resolve("z-payment-service/src/main/resources"));
        Files.writeString(paymentRes.resolve("application.properties"), "server.port=8095\njwt.secret=${JWT_SECRET}\n");
        Path paymentCtrl = Files.createDirectories(tempDir.resolve("z-payment-service/src/main/java/pay"));
        Files.writeString(paymentCtrl.resolve("PaymentController.java"), """
                @RestController
                public class PaymentController {
                    @PostMapping("/api/payments/charge")
                    public String charge() { return "ok"; }
                }
                """);

        validator.inspectSnapshotSource(tempDir, dto);

        assertThat(dto.getServicePorts()).containsEntry("z-payment-service", 8095);
        assertThat(dto.getDetectedEndpoints())
                .anyMatch(ep -> "z-payment-service".equals(ep.getService()) && "/api/payments/charge".equals(ep.getPath()));
    }

    @Test
    void secretsAreClassifiedMergedAcrossServicesAndDefaultsMeanNoInputNeeded() {
        Map<String, RequiredEnvVarDTO> env = new LinkedHashMap<>();
        ComposePreflightValidator.registerEnvVar(env, "OPENAI_API_KEY", "payment-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "JWT_SECRET", "api-gateway", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "JWT_SECRET", "order-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "JWT_SECRET", "catalog-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DB_PASSWORD", "catalog-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DB_PASSWORD", "order-service", "postgres", "application-dev.yml");

        assertThat(env.get("OPENAI_API_KEY").getScope()).isEqualTo("EXTERNAL");
        assertThat(env.get("JWT_SECRET").getScope()).isEqualTo("SANDBOX");
        assertThat(env.get("JWT_SECRET").getServices()).containsExactly("api-gateway", "order-service", "catalog-service");
        assertThat(env.get("JWT_SECRET").isDefaultPresent()).isFalse();
        assertThat(env.get("DB_PASSWORD").getServices()).containsExactly("catalog-service", "order-service");
        assertThat(env.get("DB_PASSWORD").isDefaultPresent()).isTrue();
        assertThat(env.get("DB_PASSWORD").getDefaultValue()).isNull(); // secret values never leak into the DTO
        assertThat(ComposePreflightValidator.isGeneratableSandboxSecret("JWT_SECRET")).isTrue();
        assertThat(ComposePreflightValidator.isGeneratableSandboxSecret("DB_CONNECTION_STRING")).isFalse();
    }
}
