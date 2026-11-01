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

    /** Readiness path per application service (compose healthcheck > explicit route > actuator > /health). */
    @Builder.Default
    private Map<String, String> serviceHealthPaths = new HashMap<>();

    /** Literal credentials of sandbox database containers (e.g. POSTGRES_PASSWORD). Server-side only, never serialized. */
    @com.fasterxml.jackson.annotation.JsonIgnore
    @Builder.Default
    private Map<String, String> sandboxDatabaseCredentials = new HashMap<>();

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
