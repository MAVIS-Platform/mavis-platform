package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.SourceSnapshot;

import java.util.List;

public interface GraphBuilderService {

    List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices);

    List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices, String sourcePath);

    List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices);

    List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices, String sourcePath);

    void buildEdgesAndEvidences(ModelVersion modelVersion, List<ModelElement> elements, List<CodeEvidenceDTO> evidences);

    void buildRelationshipsAndEvidences(SourceSnapshot sourceSnapshot, ModelVersion modelVersion,
                                        List<ModelElement> elements, List<CodeEvidenceDTO> evidences);
}
