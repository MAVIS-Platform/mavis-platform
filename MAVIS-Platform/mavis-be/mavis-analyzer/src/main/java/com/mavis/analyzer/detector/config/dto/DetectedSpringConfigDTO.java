package com.mavis.analyzer.detector.config.dto;

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
public class DetectedSpringConfigDTO {

    private String serviceName;
    private String applicationName;
    private Integer serverPort;
    private String configFilePath;

    private String datasourceUrl;
    private String datasourceHost;
    private String datasourceDatabase;
    private Integer datasourceLineNumber;

    @Builder.Default
    private List<ConfigTargetUrlDTO> targetServiceUrls = new ArrayList<>();

    @Builder.Default
    private List<ConfigEvidenceDTO> evidences = new ArrayList<>();
}
