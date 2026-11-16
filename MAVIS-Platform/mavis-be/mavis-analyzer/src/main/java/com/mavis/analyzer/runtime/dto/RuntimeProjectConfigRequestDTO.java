package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeProjectConfigRequestDTO {

    private String profileId;
    private Integer expectedRevision;
    private Map<String, String> confirmedServiceMappings;
    private Map<String, String> environmentVariables;
    private List<String> secretReferences;
    private Map<String, String> secretValues;
}
