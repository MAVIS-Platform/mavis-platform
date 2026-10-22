package com.mavis.analyzer.workerclient.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DotnetEvidenceDTO {
    private String elementName;
    private String sourceElementName;
    private String targetElementName;
    private String relationType;
    private String locator;

    @Builder.Default
    private String adapterVersion = "ROSLYN_4.8";

    @Builder.Default
    private String sourceType = "STATIC_CODE";

    private String excerpt;
}
