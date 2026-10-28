package com.mavis.analyzer.graph.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NodeDTO {
    private UUID id;
    private String name;
    private String type;
    private String sourcePath;
    // Additive metadata passed through from ModelElement.properties (S2a). Null when the key is
    // missing, non-textual, or blank; never inferred from name/languageStack/kind; no defaults.
    private String protocol;
    private String transportAuthority;
    private String resolutionIssue;
    private String status;
    private String languageStack;
}
