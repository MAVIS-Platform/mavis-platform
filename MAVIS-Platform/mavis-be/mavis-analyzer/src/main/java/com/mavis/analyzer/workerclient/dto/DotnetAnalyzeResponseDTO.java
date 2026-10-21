package com.mavis.analyzer.workerclient.dto;

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
public class DotnetAnalyzeResponseDTO {

    @Builder.Default
    private List<DotnetElementDTO> elements = new ArrayList<>();

    @Builder.Default
    private List<DotnetRelationDTO> relationships = new ArrayList<>();

    @Builder.Default
    private List<DotnetEvidenceDTO> evidences = new ArrayList<>();

    @Builder.Default
    private List<String> warnings = new ArrayList<>();
}
