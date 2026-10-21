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
public class DotnetElementDTO {
    private String name;

    @Builder.Default
    private String elementType = "COMPONENT";

    @Builder.Default
    private String languageStack = "CSHARP_DOTNET";

    private String parentElementName;
    private String scope;
    private Map<String, Object> properties;
}
