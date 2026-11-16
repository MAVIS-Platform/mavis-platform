package com.mavis.analyzer.detector.config.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConfigEvidenceDTO {
    private String configKey;
    private String configValue;
    private String filePath;
    private Integer lineNumber;
    @Builder.Default
    private String sourceType = "CONFIG_FILE";
}
