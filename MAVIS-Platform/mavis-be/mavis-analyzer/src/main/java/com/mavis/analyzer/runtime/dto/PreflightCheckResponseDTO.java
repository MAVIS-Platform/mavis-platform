package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

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
}
