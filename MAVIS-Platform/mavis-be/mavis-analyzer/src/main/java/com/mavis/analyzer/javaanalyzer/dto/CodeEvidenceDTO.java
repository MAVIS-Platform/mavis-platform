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
}
