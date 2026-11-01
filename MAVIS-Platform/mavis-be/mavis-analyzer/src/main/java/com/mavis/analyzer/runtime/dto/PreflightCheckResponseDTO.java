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

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DetectedEndpointDTO {
        private String service;
        private String method;
        private String path;
        private String source;
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
        private String category;
        private String defaultValue;
        private boolean required;
        private String source;
        /** For secrets: SANDBOX (internal, can be provided per run) or EXTERNAL (third-party service). */
        private String scope;
        /** True when source or Compose already provides a value/default, so no input is needed. */
        private boolean defaultPresent;
    }
}
