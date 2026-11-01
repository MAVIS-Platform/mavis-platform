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

    @Test
    void resolutionIsBackendOwnedPerVariable() {
        Map<String, RequiredEnvVarDTO> env = new LinkedHashMap<>();
        ComposePreflightValidator.registerEnvVar(env, "JWT_SECRET", "order-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "OPENAI_API_KEY", "order-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DB_PASSWORD", "order-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DATABASE_URL", "billing-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "MAIL_FROM_NAME", "order-service", "MAVIS", "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "SESSION_SECRET", "order-service", "dev-only", "application.yml");

        PreflightCheckResponseDTO dto = new PreflightCheckResponseDTO();
        dto.setRequiredEnvVars(new java.util.ArrayList<>(env.values()));
        dto.setServiceDatabaseCredentials(new LinkedHashMap<>(Map.of("sandbox-postgres", Map.of("POSTGRES_PASSWORD", "generated"))));
        dto.setServiceDependencies(new LinkedHashMap<>(Map.of("order-service", List.of("sandbox-postgres"))));
        dto.setSandboxDatabaseCredentials(new LinkedHashMap<>());

        ComposePreflightValidator.assignEnvResolutions(dto);

        assertThat(env.get("JWT_SECRET").getResolution()).isEqualTo("GENERATED");
        assertThat(env.get("OPENAI_API_KEY").getResolution()).isEqualTo("USER_REQUIRED");
        assertThat(env.get("DB_PASSWORD").getResolution()).isEqualTo("SANDBOX_INFRA");
        // A connection URL with no sandbox database cannot be generated, so the UI must ask instead of claiming "auto".
        assertThat(env.get("DATABASE_URL").getResolution()).isEqualTo("USER_REQUIRED");
        assertThat(env.get("MAIL_FROM_NAME").getResolution()).isEqualTo("DEFAULT");
        assertThat(env.get("SESSION_SECRET").getResolution()).isEqualTo("DEFAULT");
    }

    @Test
    void redisKafkaRabbitDetectedFromSourceAreProvisionedWithCredentialParityAndNoLeakedSecrets(@TempDir Path tempDir) throws Exception {
        ComposePreflightValidator infraValidator = new ComposePreflightValidator(new ImageDigestResolver(null, null, false, Map.of(
                "redis", "redis@sha256:" + "4".repeat(64),
                "apache/kafka-native", "apache/kafka-native@sha256:" + "5".repeat(64),
                "rabbitmq", "rabbitmq@sha256:" + "6".repeat(64))));
        String rawCompose = """
                services:
                  order-service:
                    image: demo/order@sha256:%s
                    ports: ["8081:8081"]
                  notify-service:
                    image: demo/notify@sha256:%s
                    ports: ["3000:3000"]
                """.formatted("1".repeat(64), "2".repeat(64));
        Files.writeString(tempDir.resolve("docker-compose.yml"), rawCompose);
        Path order = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(order.resolve("pom.xml"), """
                <project><dependencies>
                  <dependency><artifactId>spring-boot-starter-data-redis</artifactId></dependency>
                  <dependency><artifactId>spring-kafka</artifactId></dependency>
                </dependencies></project>
                """);
        Files.createDirectories(order.resolve("src/main/resources"));
        Files.writeString(order.resolve("src/main/resources/application.properties"), """
                spring.data.redis.password=${REDIS_PASSWORD}
                app.jwt.secret=${JWT_SECRET}
                """);
        Path notify = Files.createDirectories(tempDir.resolve("notify-service"));
        Files.writeString(notify.resolve("package.json"), """
                {"name":"notify","dependencies":{"amqplib":"^0.10.4","express":"^4.19.0"}}
                """);
        Files.writeString(notify.resolve("index.js"), "const url = process.env.AMQP_URL;");

        PreflightCheckResponseDTO dto = infraValidator.validate(rawCompose);
        infraValidator.inspectSnapshotSource(tempDir, dto);
        dto.getServiceStacks().put("notify-service", "node");
        infraValidator.finalizeSandboxTopology(tempDir, dto, rawCompose, Map.of(), Map.of());
        ComposePreflightValidator.assignEnvResolutions(dto);

        assertThat(dto.getComposeServices()).contains("sandbox-redis", "sandbox-kafka", "sandbox-rabbitmq");
        assertThat(dto.getUnresolvableRunnerIssues()).isEmpty();
        String yaml = dto.getSandboxComposeYaml();
        assertThat(yaml)
                .contains("requirepass")
                .contains("SPRING_KAFKA_BOOTSTRAP_SERVERS: sandbox-kafka:9092")
                .contains("KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://sandbox-kafka:9092")
                .contains("SPRING_DATA_REDIS_HOST: sandbox-redis")
                .contains("RABBITMQ_DEFAULT_USER: mavis")
                .doesNotContain("$");

        String redisPw = dto.getRelocatedComposeSecrets().get("sandbox-redis").get("REDIS_PASSWORD");
        String rabbitPw = dto.getRelocatedComposeSecrets().get("sandbox-rabbitmq").get("RABBITMQ_PASSWORD");
        assertThat(redisPw).hasSize(28);
        assertThat(rabbitPw).hasSize(28);
        assertThat(yaml).doesNotContain(redisPw).doesNotContain(rabbitPw);
        assertThat(dto.getRelocatedComposeSecrets().get("order-service"))
                .containsEntry("SPRING_DATA_REDIS_PASSWORD", redisPw)
                .containsEntry("REDIS_PASSWORD", redisPw);
        assertThat(dto.getRelocatedComposeSecrets().get("notify-service"))
                .containsEntry("AMQP_URL", "amqp://mavis:" + rabbitPw + "@sandbox-rabbitmq:5672");
        // Redis password never satisfies a DB_* variable and vice versa.
        assertThat(ComposePreflightValidator.databaseCredentialFor("DB_PASSWORD", "order-service", dto)).isNull();
        assertThat(ComposePreflightValidator.databaseCredentialFor("REDIS_PASSWORD", "order-service", dto)).isEqualTo(redisPw);

        Map<String, String> resolutions = new LinkedHashMap<>();
        dto.getRequiredEnvVars().forEach(v -> resolutions.put(v.getName(), v.getResolution()));
        assertThat(resolutions)
                .containsEntry("REDIS_PASSWORD", "SANDBOX_INFRA")
                .containsEntry("JWT_SECRET", "GENERATED");
        assertThat(resolutions).doesNotContainValue("USER_REQUIRED");
    }

    @Test
    void cacheAndBrokerClientsAreDetectedWithoutSqlFalsePositives() {
        assertThat(ComposePreflightValidator.detectCacheAndBrokerTypes("<artifactid>spring-kafka</artifactid> \"amqplib\": \"1\"\nredis==5.0"))
                .containsExactly("Redis", "Kafka", "RabbitMQ");
        assertThat(ComposePreflightValidator.detectCacheAndBrokerTypes("spring.datasource.url=jdbc:postgresql://db/app")).isEmpty();
    }

    @Test
    void cloudExternalPostgresRepoAutoProvisionsEphemeralSandboxDbWithInferredDbNameAndUser(@TempDir Path tempDir) throws Exception {
        String rawCompose = """
                services:
                  api-gateway:
                    image: demo/gateway@sha256:%s
                    ports: ["8080:8080"]
                  order-service:
                    image: demo/order@sha256:%s
                    ports: ["8081:8081"]
                    environment:
                      DB_PASSWORD: ${DB_PASSWORD}
                  catalog-service:
                    image: demo/catalog@sha256:%s
                    ports: ["8082:8082"]
                    environment:
                      DB_PASSWORD: ${DB_PASSWORD}
                """.formatted("1".repeat(64), "2".repeat(64), "3".repeat(64));
        Files.writeString(tempDir.resolve("docker-compose.yml"), rawCompose);

        Path orderRes = Files.createDirectories(tempDir.resolve("order-service/src/main/resources"));
        Files.writeString(orderRes.resolve("application.yml"), """
                spring:
                  datasource:
                    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://dpg-cloud.oregon-postgres.render.com:5432/testseed}
                    username: ${DB_USERNAME:testseed_user}
                    password: ${DB_PASSWORD}
                """);
        Path catalogRes = Files.createDirectories(tempDir.resolve("catalog-service/src/main/resources"));
        Files.writeString(catalogRes.resolve("application.yml"), """
                spring:
                  datasource:
                    url: jdbc:postgresql://dpg-cloud.oregon-postgres.render.com:5432/testseed
                    username: ${DB_USERNAME:testseed_user}
                    password: ${DB_PASSWORD}
                """);
        Files.createDirectories(tempDir.resolve("catalog-service/src/main/resources/db/migration"));
        Files.writeString(tempDir.resolve("catalog-service/src/main/resources/db/migration/V1__init.sql"), "CREATE TABLE items(id INT);");

        PreflightCheckResponseDTO dto = validator.validate(rawCompose);
        validator.inspectSnapshotSource(tempDir, dto);
        validator.finalizeSandboxTopology(tempDir, dto, rawCompose, Map.of(), Map.of());

        assertThat(dto.getInfrastructureServices()).contains("sandbox-postgres");
        assertThat(dto.getComposeServices()).contains("sandbox-postgres");
        assertThat(dto.getUnresolvableRunnerIssues()).isEmpty();
        assertThat(dto.getSandboxComposeYaml())
                .contains("sandbox-postgres:")
                .contains("POSTGRES_USER: testseed_user")
                .contains("POSTGRES_DB: testseed")
                .contains("jdbc:postgresql://sandbox-postgres:5432/testseed")
                .contains("SPRING_JPA_HIBERNATE_DDL_AUTO: update")
                .doesNotContain("dpg-cloud.oregon-postgres.render.com")
                .doesNotContain("POSTGRES_PASSWORD")
                .doesNotContain("$");
        // Flyway-managed catalog-service does not force hibernate ddl-auto=update, while non-Flyway order-service gets it
        assertThat(dto.getMigrationManagedServices()).contains("catalog-service").doesNotContain("order-service");
        assertThat(dto.getRelocatedComposeSecrets().get("sandbox-postgres")).containsKey("POSTGRES_PASSWORD");
        String generatedPw = dto.getRelocatedComposeSecrets().get("sandbox-postgres").get("POSTGRES_PASSWORD");
        assertThat(generatedPw).hasSize(28);
        assertThat(dto.getRelocatedComposeSecrets().get("order-service")).containsEntry("SPRING_DATASOURCE_PASSWORD", generatedPw);
        assertThat(ComposePreflightValidator.databaseCredentialFor("DB_PASSWORD", "order-service", dto)).isEqualTo(generatedPw);
        assertThat(dto.getDatabaseChecks())
                .filteredOn(c -> "order-service".equals(c.getService()))
                .allSatisfy(c -> assertThat(c.getStatus()).isEqualTo("AUTO_PROVISIONED_SANDBOX_DB"));
    }

    @Test
    void standaloneDockerfileOnlySnapshotSynthesizesSandboxComposeAndMountsDockerfileVolumes(@TempDir Path tempDir) throws Exception {
        Path orderDir = Files.createDirectories(tempDir.resolve("order-service"));
        Files.writeString(orderDir.resolve("Dockerfile"), """
                FROM eclipse-temurin:21-jre
                EXPOSE 8089
                VOLUME ["/app/uploads", "/tmp"]
                ENTRYPOINT ["java", "-jar", "/app.jar"]
                """);
        Path gatewayDir = Files.createDirectories(tempDir.resolve("gateway-service"));
        Files.writeString(gatewayDir.resolve("Dockerfile"), """
                FROM node:20-alpine
                EXPOSE 3000
                VOLUME /var/cache/gateway
                CMD ["node", "index.js"]
                """);

        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .compatible(false)
                .securityWarnings(new java.util.ArrayList<>(List.of("Thư mục snapshot chưa có file docker-compose.yml")))
                .runnerIssues(new java.util.ArrayList<>(List.of("No docker-compose.yml was found in the snapshot")))
                .build();

        validator.inspectSnapshotSource(tempDir, dto);
        validator.finalizeSandboxTopology(tempDir, dto, null, Map.of(
                "order-service", "local/order@sha256:" + "a".repeat(64),
                "gateway-service", "local/gateway@sha256:" + "b".repeat(64)
        ), Map.of());

        assertThat(dto.isCompatible()).isTrue();
        assertThat(dto.getSecurityWarnings()).isEmpty();
        assertThat(dto.getComposeServices()).containsExactlyInAnyOrder("order-service", "gateway-service");
        assertThat(dto.getServicePorts()).containsEntry("order-service", 8089).containsEntry("gateway-service", 3000);
        assertThat(dto.getServiceStacks()).containsEntry("gateway-service", "node");
        assertThat(dto.getUnresolvableRunnerIssues()).isEmpty();
        assertThat(dto.getSandboxComposeYaml())
                .contains("/app/uploads")
                .contains("/var/cache/gateway")
                .doesNotContain("target: /tmp");
        assertThat(validator.validate(dto.getSandboxComposeYaml()).getRunnerIssues()).isEmpty();
    }

    @Test
    void envFileDotEnvAndCompositeTemplatesMergeInlineDefaultsRelocateSecretsAndExpandInfraSpecs() {
        String rawCompose = """
                services:
                  order-service:
                    image: demo/order@sha256:%s
                    env_file:
                      - ./config/app.env
                    environment:
                      SPRING_DATASOURCE_URL: jdbc:postgresql://orders-db:5432/${DB_NAME}
                      EXTERNAL_DB_URI: postgresql://admin:SuperSecret123@legacy-db:5432/app
                  kafka:
                    image: bitnami/kafka@sha256:%s
                  nginx:
                    image: nginx@sha256:%s
                """.formatted("1".repeat(64), "2".repeat(64), "3".repeat(64));

        Map<String, String> envFiles = Map.of(
                ".env", "LOG_LEVEL=INFO\n",
                "config/app.env", "APP_REGION=ap-southeast-1\nSTRIPE_API_KEY=sk_test_999\nLOG_OVERRIDE=${LOG_LEVEL}\n"
        );

        PreflightCheckResponseDTO dto = validator.validate(rawCompose, Map.of(), envFiles);

        assertThat(dto.getUnresolvableRunnerIssues()).isEmpty();
        assertThat(dto.getComposeEnvTemplates().get("order-service"))
                .containsEntry("SPRING_DATASOURCE_URL", "jdbc:postgresql://orders-db:5432/${DB_NAME}");
        assertThat(dto.getRelocatedComposeSecrets().get("order-service"))
                .containsEntry("STRIPE_API_KEY", "sk_test_999")
                .containsEntry("EXTERNAL_DB_URI", "postgresql://admin:SuperSecret123@legacy-db:5432/app");
        assertThat(dto.getSandboxComposeYaml())
                .contains("APP_REGION: ap-southeast-1")
                .contains("LOG_OVERRIDE: INFO")
                .contains("/var/lib/kafka/data")
                .contains("/var/cache/nginx")
                .contains("user: 101:101")
                .doesNotContain("sk_test_999")
                .doesNotContain("SuperSecret123");
        assertThat(validator.validate(dto.getSandboxComposeYaml()).getRunnerIssues()).isEmpty();
    }

    @Test
    void javaAndCsharpDtoSchemasExpectedStatusAndAuthMetadataAreSynthesizedFromSource(@TempDir Path tempDir) throws Exception {
        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .detectedServices(List.of("reservation-service", "payment-service"))
                .servicePorts(new LinkedHashMap<>(Map.of("reservation-service", 8080, "payment-service", 8081)))
                .serviceStacks(new LinkedHashMap<>(Map.of("reservation-service", "java", "payment-service", "dotnet")))
                .build();

        Path resJava = Files.createDirectories(tempDir.resolve("reservation-service/src/main/java/hotel"));
        Files.writeString(resJava.resolve("RoomType.java"), """
                package hotel;
                public enum RoomType { SUITE, DELUXE, STANDARD }
                """);
        Files.writeString(resJava.resolve("GuestProfile.java"), """
                package hotel;
                public record GuestProfile(String fullName, String phone) {}
                """);
        Files.writeString(resJava.resolve("CreateReservationRequest.java"), """
                package hotel;
                import java.math.BigDecimal;
                public record CreateReservationRequest(
                        String guestEmail,
                        RoomType roomType,
                        int nights,
                        BigDecimal totalAmount,
                        GuestProfile primaryGuest
                ) {}
                """);
        Files.writeString(resJava.resolve("ReservationController.java"), """
                package hotel;
                import org.springframework.http.HttpStatus;
                import org.springframework.http.ResponseEntity;
                import org.springframework.security.access.prepost.PreAuthorize;
                import org.springframework.web.bind.annotation.*;

                @RestController
                @RequestMapping("/api/reservations")
                @PreAuthorize("hasRole('USER')")
                public class ReservationController {
                    @PostMapping
                    @ResponseStatus(HttpStatus.CREATED)
                    public ResponseEntity<?> create(@Valid @RequestBody CreateReservationRequest request) {
                        return ResponseEntity.status(HttpStatus.CREATED).build();
                    }

                    @DeleteMapping("/{id}")
                    public ResponseEntity<Void> cancel(@PathVariable Long id) {
                        return ResponseEntity.noContent().build();
                    }
                }
                """);

        Path payCs = Files.createDirectories(tempDir.resolve("payment-service/Controllers"));
        Files.writeString(payCs.resolve("ChargePaymentDto.cs"), """
                using System;
                namespace PaymentService.Models;
                public record ChargePaymentDto(Guid OrderId, decimal Amount, string Currency, bool CaptureImmediately);
                """);
        Files.writeString(payCs.resolve("PaymentsController.cs"), """
                using Microsoft.AspNetCore.Authorization;
                using Microsoft.AspNetCore.Mvc;
                using PaymentService.Models;

                [ApiController]
                [Route("api/[controller]")]
                [Authorize]
                public class PaymentsController : ControllerBase {
                    [HttpPost("charge")]
                    public IActionResult Charge([FromBody] ChargePaymentDto dto) {
                        return CreatedAtAction(nameof(Charge), new { id = 1 }, dto);
                    }
                }
                """);

        validator.inspectSnapshotSource(tempDir, dto);

        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();

        var javaCreate = dto.getDetectedEndpoints().stream()
                .filter(ep -> "reservation-service".equals(ep.getService()) && "POST".equals(ep.getMethod()) && "/api/reservations".equals(ep.getPath()))
                .findFirst().orElseThrow();
        assertThat(javaCreate.getExpectedStatus()).isEqualTo(201);
        assertThat(javaCreate.getRequiresAuth()).isTrue();
        assertThat(javaCreate.getRequestBodyType()).isEqualTo("CreateReservationRequest");
        var javaBody = mapper.readTree(javaCreate.getSampleJsonBody());
        assertThat(javaBody.path("guestEmail").asText()).contains("@");
        assertThat(javaBody.path("roomType").asText()).isEqualTo("SUITE");
        assertThat(javaBody.path("nights").isNumber()).isTrue();
        assertThat(javaBody.path("totalAmount").isNumber()).isTrue();
        assertThat(javaBody.path("primaryGuest").path("fullName").asText()).isNotBlank();

        var javaDelete = dto.getDetectedEndpoints().stream()
                .filter(ep -> "reservation-service".equals(ep.getService()) && "DELETE".equals(ep.getMethod()))
                .findFirst().orElseThrow();
        assertThat(javaDelete.getExpectedStatus()).isEqualTo(204);
        assertThat(javaDelete.getRequiresAuth()).isTrue();

        var csCharge = dto.getDetectedEndpoints().stream()
                .filter(ep -> "payment-service".equals(ep.getService()) && "POST".equals(ep.getMethod()) && "/api/payments/charge".equals(ep.getPath()))
                .findFirst().orElseThrow();
        assertThat(csCharge.getExpectedStatus()).isEqualTo(201);
        assertThat(csCharge.getRequiresAuth()).isTrue();
        assertThat(csCharge.getRequestBodyType()).isEqualTo("ChargePaymentDto");
        var csBody = mapper.readTree(csCharge.getSampleJsonBody());
        assertThat(csBody.path("orderId").asText()).hasSize(36);
        assertThat(csBody.path("amount").isNumber()).isTrue();
        assertThat(csBody.path("currency").asText()).isNotBlank();
        assertThat(csBody.path("captureImmediately").isBoolean()).isTrue();
    }

    @Test
    void openApiSpecsSpringGatewayRoutesValidationConstraintsAndResponseFieldsAreProjectedTopDown(@TempDir Path tempDir) throws Exception {
        PreflightCheckResponseDTO dto = PreflightCheckResponseDTO.builder()
                .detectedServices(List.of("api-gateway", "order-service", "inventory-service"))
                .servicePorts(new LinkedHashMap<>(Map.of("api-gateway", 8080, "order-service", 8081, "inventory-service", 8082)))
                .serviceStacks(new LinkedHashMap<>(Map.of("api-gateway", "java", "order-service", "java", "inventory-service", "node")))
                .build();

        // 1. Spring Cloud Gateway routing /gw/orders/** (StripPrefix=1) -> lb://order-service
        Path gwRes = Files.createDirectories(tempDir.resolve("api-gateway/src/main/resources"));
        Files.writeString(gwRes.resolve("application.yml"), """
                spring:
                  cloud:
                    gateway:
                      routes:
                        - id: orders-route
                          uri: lb://order-service
                          predicates:
                            - Path=/gw/orders/**
                          filters:
                            - StripPrefix=1
                """);

        // 2. Order Service with validation constraints (@Min(5), @Size(min=12)), @RequestParam, Feign call to inventory-service, and OrderResponse DTO
        Path orderJava = Files.createDirectories(tempDir.resolve("order-service/src/main/java/orders"));
        Files.writeString(orderJava.resolve("InventoryClient.java"), """
                package orders;
                import org.springframework.cloud.openfeign.FeignClient;
                @FeignClient(name = "inventory-service")
                public interface InventoryClient {}
                """);
        Files.writeString(orderJava.resolve("CreateOrderReq.java"), """
                package orders;
                import jakarta.validation.constraints.*;
                public record CreateOrderReq(
                        @Size(min = 12, max = 30) String referenceCode,
                        @Min(5) int quantity
                ) {}
                """);
        Files.writeString(orderJava.resolve("OrderResponse.java"), """
                package orders;
                public record OrderResponse(Long id, String referenceCode, String status) {}
                """);
        Files.writeString(orderJava.resolve("OrderController.java"), """
                package orders;
                import org.springframework.http.ResponseEntity;
                import org.springframework.security.access.prepost.PreAuthorize;
                import org.springframework.web.bind.annotation.*;
                @RestController
                @RequestMapping("/orders")
                public class OrderController {
                    @PostMapping
                    @PreAuthorize("hasAuthority('ORDER_WRITE')")
                    public ResponseEntity<OrderResponse> create(@RequestBody CreateOrderReq req, @RequestParam String tenantId) {
                        return ResponseEntity.status(201).build();
                    }
                }
                """);

        // 3. Inventory Service with OpenAPI spec
        Path invDir = Files.createDirectories(tempDir.resolve("inventory-service"));
        Files.writeString(invDir.resolve("openapi.yaml"), """
                openapi: 3.0.3
                paths:
                  /api/stock/reserve:
                    post:
                      security:
                        - bearerAuth: []
                      requestBody:
                        content:
                          application/json:
                            schema:
                              $ref: '#/components/schemas/ReserveStockInput'
                      responses:
                        '201':
                          content:
                            application/json:
                              schema:
                                $ref: '#/components/schemas/ReserveStockOutput'
                components:
                  schemas:
                    ReserveStockInput:
                      type: object
                      properties:
                        sku:
                          type: string
                        qty:
                          type: integer
                    ReserveStockOutput:
                      type: object
                      properties:
                        reservationId:
                          type: string
                """);

        validator.inspectSnapshotSource(tempDir, dto);

        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();

        // Verify OrderController endpoint has @RequestParam appended, validation constraints respected, responseFields & downstreamTargets populated
        var orderPost = dto.getDetectedEndpoints().stream()
                .filter(ep -> "order-service".equals(ep.getService()) && "POST".equals(ep.getMethod()) && ep.getPath().startsWith("/orders"))
                .findFirst().orElseThrow();
        assertThat(orderPost.getPath()).isEqualTo("/orders?tenantId=1");
        assertThat(orderPost.getRequiredRoles()).contains("ORDER_WRITE");
        assertThat(orderPost.getResponseFields()).contains("/id", "/referenceCode", "/status");
        assertThat(orderPost.getDownstreamTargets()).contains("inventory-service");
        var orderJson = mapper.readTree(orderPost.getSampleJsonBody());
        assertThat(orderJson.path("referenceCode").asText().length()).isGreaterThanOrEqualTo(12);
        assertThat(orderJson.path("quantity").asInt()).isGreaterThanOrEqualTo(5);

        // Verify Gateway projected endpoint /gw/orders?tenantId=1 on api-gateway!
        var gwProjected = dto.getDetectedEndpoints().stream()
                .filter(ep -> "api-gateway".equals(ep.getService()) && "POST".equals(ep.getMethod()) && ep.getPath().startsWith("/gw/orders"))
                .findFirst().orElseThrow();
        assertThat(gwProjected.getDownstreamTargets()).contains("order-service");
        assertThat(gwProjected.getResponseFields()).contains("/id");
        assertThat(gwProjected.getFanOutScore()).isGreaterThan(orderPost.getFanOutScore());

        // Verify OpenAPI endpoint on inventory-service
        var invOpenApi = dto.getDetectedEndpoints().stream()
                .filter(ep -> "inventory-service".equals(ep.getService()) && "/api/stock/reserve".equals(ep.getPath()))
                .findFirst().orElseThrow();
        assertThat(invOpenApi.getExpectedStatus()).isEqualTo(201);
        assertThat(invOpenApi.getRequiresAuth()).isTrue();
        assertThat(invOpenApi.getResponseFields()).contains("/reservationId");
    }
}
