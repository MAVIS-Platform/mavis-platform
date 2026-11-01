package com.mavis.analyzer.runtime.validator;

import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO;
import com.mavis.analyzer.runtime.dto.PreflightCheckResponseDTO.RequiredEnvVarDTO;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ComposePreflightValidatorAutoConfigTest {

    private final ComposePreflightValidator validator = new ComposePreflightValidator();

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
        assertThat(dto.getInfrastructureServices()).isEmpty();
    }

    @Test
    void typicalDeveloperComposeExplainsEveryRunnerRejection() {
        PreflightCheckResponseDTO dto = validator.validate("""
                version: "3.8"
                services:
                  order-service:
                    build: ./order-service
                    ports:
                      - "9090:8080"
                    environment:
                      - DB_PASSWORD=${DB_PASSWORD}
                  orders-db:
                    image: postgres:16
                networks:
                  default: {}
                """);

        assertThat(dto.isCompatible()).isTrue(); // no privileged/host/socket risk
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
    }

    @Test
    void databaseContainerCredentialsAreCapturedServerSideAndReusedForApplicationVariables() {
        PreflightCheckResponseDTO dto = validator.validate("""
                services:
                  catalog-service:
                    image: example/catalog@sha256:%s
                  catalog-db:
                    image: postgres@sha256:%s
                    environment:
                      POSTGRES_PASSWORD: sandbox-pg
                """.formatted("b".repeat(64), "c".repeat(64)));

        Map<String, String> credentials = dto.getSandboxDatabaseCredentials();
        assertThat(credentials).containsEntry("POSTGRES_PASSWORD", "sandbox-pg").containsEntry("POSTGRES_USER", "postgres");
        assertThat(ComposePreflightValidator.databaseCredentialFor("DB_PASSWORD", credentials)).isEqualTo("sandbox-pg");
        assertThat(ComposePreflightValidator.databaseCredentialFor("SPRING_DATASOURCE_USERNAME", credentials)).isEqualTo("postgres");
        assertThat(ComposePreflightValidator.databaseCredentialFor("JWT_SECRET", credentials)).isNull();
        assertThat(ComposePreflightValidator.isInfrastructureService("payment-service", "redis:7")).isFalse();
    }

    @Test
    void secretsAreClassifiedAndDefaultsMeanNoInputNeeded() {
        Map<String, RequiredEnvVarDTO> env = new LinkedHashMap<>();
        ComposePreflightValidator.registerEnvVar(env, "OPENAI_API_KEY", "payment-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "JWT_SECRET", "api-gateway", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DB_PASSWORD", "catalog-service", null, "application.yml");
        ComposePreflightValidator.registerEnvVar(env, "DB_PASSWORD", "catalog-service", "postgres", "application-dev.yml");

        assertThat(env.get("OPENAI_API_KEY").getScope()).isEqualTo("EXTERNAL");
        assertThat(env.get("JWT_SECRET").getScope()).isEqualTo("SANDBOX");
        assertThat(env.get("JWT_SECRET").isDefaultPresent()).isFalse();
        assertThat(env.get("DB_PASSWORD").isDefaultPresent()).isTrue();
        assertThat(env.get("DB_PASSWORD").getDefaultValue()).isNull(); // secret values never leak into the DTO
        assertThat(ComposePreflightValidator.isGeneratableSandboxSecret("JWT_SECRET")).isTrue();
        assertThat(ComposePreflightValidator.isGeneratableSandboxSecret("DB_CONNECTION_STRING")).isFalse();
    }
}
