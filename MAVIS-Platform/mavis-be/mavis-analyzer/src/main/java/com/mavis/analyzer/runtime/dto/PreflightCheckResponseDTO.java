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
    }
}
