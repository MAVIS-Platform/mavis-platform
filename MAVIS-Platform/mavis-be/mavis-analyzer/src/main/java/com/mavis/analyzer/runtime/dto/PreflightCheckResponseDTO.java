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
}
