package com.mavis.analyzer.workerclient.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DotnetRelationDTO {
    private String sourceElementName;
    private String targetElementName;

    @Builder.Default
    private String relationType = "SERVICE_HTTP_CALL";

    @Builder.Default
    private String originLayer = "STATIC";

    @Builder.Default
    private String direction = "DIRECTED";

    private Map<String, Object> properties;
}
