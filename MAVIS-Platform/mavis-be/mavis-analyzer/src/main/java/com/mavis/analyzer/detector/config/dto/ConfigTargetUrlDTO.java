package com.mavis.analyzer.detector.config.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConfigTargetUrlDTO {
    private String configKey;
    private String targetUrl;
    private String relationType;
    private String profile;
    private Integer lineNumber;
}
