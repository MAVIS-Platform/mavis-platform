package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PreflightCheckResponseDTO {

    @Builder.Default
    private boolean compatible = true;

    @Builder.Default
    private List<String> detectedServices = new ArrayList<>();

    @Builder.Default
    private List<String> securityWarnings = new ArrayList<>();

    @Builder.Default
    private String recommendedProfile = "SPRING_BOOT_DOTNET_COMPOSE_V1";

    @Builder.Default
    private Map<String, Integer> servicePorts = new HashMap<>();

    @Builder.Default
    private Map<String, String> serviceStacks = new HashMap<>();

    @Builder.Default
    private List<DetectedEndpointDTO> detectedEndpoints = new ArrayList<>();

    @Builder.Default
    private List<DatabaseCheckDTO> databaseChecks = new ArrayList<>();

    @Builder.Default
    private List<RequiredEnvVarDTO> requiredEnvVars = new ArrayList<>();

    /** Reasons MAVIS.Runner's ComposePreflight would reject this Compose file. Empty = runnable by the sandbox runner. */
    @Builder.Default
    private List<String> runnerIssues = new ArrayList<>();

    /** Compose services that are databases, brokers or proxies: started by Compose but not instrumented or health-checked. */
    @Builder.Default
    private List<String> infrastructureServices = new ArrayList<>();

    /** Readiness path per application service (compose healthcheck > explicit route > actuator > /). */
    @Builder.Default
    private Map<String, String> serviceHealthPaths = new HashMap<>();

    /** DETECTED when backed by Compose healthcheck, Actuator or explicit route; ASSUMED when falling back. */
    @Builder.Default
    private Map<String, String> serviceHealthConfidence = new HashMap<>();

    /** Short explanation for each service's readiness probe source. */
    @Builder.Default
    private Map<String, String> serviceHealthReasons = new HashMap<>();

    /** Services physically declared in docker-compose.yml (excludes model-only services). */
    @Builder.Default
    private List<String> composeServices = new ArrayList<>();

    /** Auto-remediated MAVIS.Runner-compatible docker-compose.yml when raw Compose has fixable runnerIssues. */
    private String sandboxComposeYaml;

    /** Human-readable transformations applied to produce sandboxComposeYaml. */
    @Builder.Default
    private List<String> sandboxComposeChanges = new ArrayList<>();

    /** Runner issues that remain even after automatic sandbox compose remediation (e.g. build: without image override). */
    @Builder.Default
    private List<String> unresolvableRunnerIssues = new ArrayList<>();

    /** Recommended Compose service -> ModelElement UUID mappings matched against SERVICE_CONTAINER elements. */
    @Builder.Default
    private Map<String, String> recommendedServiceMappings = new HashMap<>();

    /** ModelElement UUID -> friendly element name for SERVICE_CONTAINER dropdowns in Step 1. */
    @Builder.Default
    private Map<String, String> modelServiceNames = new HashMap<>();

    /** True when local sandbox image building from snapshot Dockerfiles is enabled and Docker daemon is reachable. */
    @Builder.Default
    private boolean localImageBuildAvailable = false;

    /** Literal credentials of sandbox database containers (e.g. POSTGRES_PASSWORD). Server-side only, never serialized. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, String> sandboxDatabaseCredentials = new HashMap<>();

    /** Per-DB-container credentials keyed by DB service name. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, Map<String, String>> serviceDatabaseCredentials = new HashMap<>();

    /** Service dependencies (depends_on and JDBC host references) keyed by app service name. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, List<String>> serviceDependencies = new HashMap<>();

    /** Compose environment variable aliases where container env key differs from ${PLACEHOLDER} name. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, Map<String, String>> composeEnvAliases = new HashMap<>();

    /** Sensitive literal env values stripped from sandboxComposeYaml so they can be re-injected via encrypted per-run bindings. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, Map<String, String>> relocatedComposeSecrets = new HashMap<>();

    /** Services whose Spring Boot management.server.port differed from server.port and must be unified to main port in sandbox. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, Integer> unifiedManagementPorts = new HashMap<>();

    /** Composite Compose environment templates containing unresolved ${VAR} placeholders (e.g. jdbc:postgresql://db:5432/${DB_NAME}). Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, Map<String, String>> composeEnvTemplates = new HashMap<>();

    /** Safe absolute container writable paths declared via VOLUME in service Dockerfiles. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, List<String>> serviceDockerfileVolumes = new HashMap<>();

    /** Services managing their own DB schema via Flyway or Liquibase migrations. Server-side only. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private java.util.Set<String> migrationManagedServices = new java.util.HashSet<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public static class DetectedEndpointDTO {
        private String service;
        private String method;
        private String path;
        private String source;
        private Integer expectedStatus;
        private String requestBodyType;
        private String sampleJsonBody;
        private Boolean requiresAuth;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DatabaseCheckDTO {
        private String service;
        private String dbType;
        private String configKey;
        private String connectionUrl;
        @Builder.Default
        private List<String> requiredEnvVars = new ArrayList<>();
        private String status;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RequiredEnvVarDTO {
        private String name;
        private String service;
        @Builder.Default
        private List<String> services = new ArrayList<>();
        private String category;
        private String defaultValue;
        private boolean required;
        private String source;
        /** For secrets: SANDBOX (internal, can be provided per run) or EXTERNAL (third-party service). */
        private String scope;
        /** True when source or Compose already provides a value/default, so no input is needed. */
        private boolean defaultPresent;
        /** Backend-owned outcome: SANDBOX_INFRA, DEFAULT, GENERATED, USER_REQUIRED or ENV. Never carries a value. */
        private String resolution;
    }
}
