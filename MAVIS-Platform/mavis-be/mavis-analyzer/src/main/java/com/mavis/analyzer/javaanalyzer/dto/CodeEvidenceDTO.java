package com.mavis.analyzer.javaanalyzer.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CodeEvidenceDTO {
    private String elementType;
    private String identifier;
    private String filePath;
    private Integer lineNumber;
    private String codeSnippet;
    private String sourceComponent;
    private String targetComponent;
    private String endpointAlias;
    private String qualifiedName;
    @Builder.Default
    private java.util.List<String> symbolCandidates = new java.util.ArrayList<>();
    @Builder.Default
    private java.util.Map<String, Object> metadata = new java.util.LinkedHashMap<>();
}
