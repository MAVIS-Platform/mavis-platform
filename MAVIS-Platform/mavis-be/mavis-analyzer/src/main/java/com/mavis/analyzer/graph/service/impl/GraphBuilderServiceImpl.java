package com.mavis.analyzer.graph.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphBuilderServiceImpl implements GraphBuilderService {

    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices) {
        return buildAndSaveElements(modelVersion, detectedServices);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices, String sourcePath) {
        return buildAndSaveElements(modelVersion, detectedServices, sourcePath);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices) {
        String sourcePath = null;
        if (modelVersion != null && modelVersion.getSourceSnapshot() != null && modelVersion.getSourceSnapshot().getStoragePath() != null) {
            String sp = modelVersion.getSourceSnapshot().getStoragePath();
            if (sp.toLowerCase().endsWith(".zip")) {
                int dotIndex = sp.lastIndexOf('.');
                sourcePath = sp.substring(0, dotIndex) + "_extracted";
            } else {
                sourcePath = sp;
            }
        }
        return buildAndSaveElements(modelVersion, detectedServices, sourcePath);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices, String sourcePath) {
        List<ModelElement> elements = new ArrayList<>();

        if (detectedServices == null || detectedServices.isEmpty()) {
            String projectName = (modelVersion != null && modelVersion.getProject() != null)
                    ? modelVersion.getProject().getName()
                    : "default-service";
            log.info("No Docker services detected. Creating fallback ModelElement with project name: {}", projectName);

            ModelElement fallbackElement = ModelElement.builder()
                    .modelVersion(modelVersion)
                    .name(projectName)
                    .elementType("SERVICE_CONTAINER")
                    .languageStack("JAVA_SPRING")
                    .scope(sourcePath)
                    .properties(createPropertiesNode(sourcePath))
                    .status("VALIDATED")
                    .build();
            elements.add(fallbackElement);
        } else {
            log.info("Detected {} Docker services. Creating ModelElements: {}", detectedServices.size(), detectedServices);
            for (String serviceName : detectedServices) {
                ModelElement element = ModelElement.builder()
                        .modelVersion(modelVersion)
                        .name(serviceName)
                        .elementType("SERVICE_CONTAINER")
                        .languageStack("JAVA_SPRING")
                        .scope(sourcePath)
                        .properties(createPropertiesNode(sourcePath))
                        .status("VALIDATED")
                        .build();
                elements.add(element);
            }
        }

        List<ModelElement> savedElements = modelElementRepository.saveAll(elements);
        log.info("Successfully persisted {} model elements for model version ID: {}",
                savedElements.size(), modelVersion != null ? modelVersion.getId() : null);
        return savedElements;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void buildEdgesAndEvidences(ModelVersion modelVersion, List<ModelElement> elements, List<CodeEvidenceDTO> evidences) {
        SourceSnapshot snapshot = modelVersion != null ? modelVersion.getSourceSnapshot() : null;
        buildRelationshipsAndEvidences(snapshot, modelVersion, elements, evidences);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void buildRelationshipsAndEvidences(SourceSnapshot sourceSnapshot, ModelVersion modelVersion,
                                              List<ModelElement> elements, List<CodeEvidenceDTO> evidences) {
        if (elements == null || elements.isEmpty() || evidences == null || evidences.isEmpty()) {
            log.info("Elements or evidences list is empty. Skipping relationship and evidence building.");
            return;
        }

        // Logic Step 1 - Process Evidences for REST_API in batch
        List<Evidence> apiEvidences = new ArrayList<>();
        for (CodeEvidenceDTO evidenceDto : evidences) {
            if ("REST_API".equalsIgnoreCase(evidenceDto.getElementType())) {
                ModelElement owningElement = findOwningElement(elements, evidenceDto.getFilePath());
                String locator = (evidenceDto.getFilePath() != null ? evidenceDto.getFilePath() : "")
                        + ":" + evidenceDto.getLineNumber();

                Evidence evidence = Evidence.builder()
                        .sourceSnapshot(sourceSnapshot)
                        .modelVersion(modelVersion)
                        .element(owningElement)
                        .relationship(null)
                        .locator(locator)
                        .adapterVersion("JAVAPARSER_3.25")
                        .sourceType("STATIC_CODE")
                        .excerpt(evidenceDto.getCodeSnippet())
                        .build();
                apiEvidences.add(evidence);
            }
        }
        if (!apiEvidences.isEmpty()) {
            evidenceRepository.saveAll(apiEvidences);
            log.info("Successfully batch saved {} REST_API evidences", apiEvidences.size());
        }

        // Logic Step 2 - Match Relationships (Feign Clients) in batch
        List<ModelRelationship> relationshipsToSave = new ArrayList<>();
        List<CodeEvidenceDTO> matchedFeignDtos = new ArrayList<>();

        for (CodeEvidenceDTO feignDto : evidences) {
            if ("FEIGN_CLIENT".equalsIgnoreCase(feignDto.getElementType())) {
                String targetServiceName = feignDto.getIdentifier();
                if (targetServiceName == null || targetServiceName.isBlank()) {
                    continue;
                }

                ModelElement targetElement = matchTargetElement(elements, targetServiceName);
                if (targetElement != null) {
                    ModelElement sourceElement = findOwningElement(elements, feignDto.getFilePath());

                    ModelRelationship relationship = ModelRelationship.builder()
                            .modelVersion(modelVersion)
                            .sourceElement(sourceElement)
                            .targetElement(targetElement)
                            .relationType("SERVICE_HTTP_CALL")
                            .originLayer("STATIC")
                            .direction("DIRECTED")
                            .build();

                    relationshipsToSave.add(relationship);
                    matchedFeignDtos.add(feignDto);
                } else {
                    log.warn("Could not find matching target ModelElement for FeignClient target service: {}", targetServiceName);
                }
            }
        }

        if (!relationshipsToSave.isEmpty()) {
            List<ModelRelationship> savedRelationships = modelRelationshipRepository.saveAll(relationshipsToSave);
            log.info("Successfully batch saved {} model relationships", savedRelationships.size());

            List<Evidence> feignEvidences = new ArrayList<>();
            for (int i = 0; i < savedRelationships.size(); i++) {
                ModelRelationship savedRel = savedRelationships.get(i);
                CodeEvidenceDTO feignDto = matchedFeignDtos.get(i);

                String locator = (feignDto.getFilePath() != null ? feignDto.getFilePath() : "")
                        + ":" + feignDto.getLineNumber();

                Evidence feignEvidence = Evidence.builder()
                        .sourceSnapshot(sourceSnapshot)
                        .modelVersion(modelVersion)
                        .relationship(savedRel)
                        .element(null)
                        .locator(locator)
                        .adapterVersion("JAVAPARSER_3.25")
                        .sourceType("STATIC_CODE")
                        .excerpt(feignDto.getCodeSnippet())
                        .build();
                feignEvidences.add(feignEvidence);
            }

            if (!feignEvidences.isEmpty()) {
                evidenceRepository.saveAll(feignEvidences);
                log.info("Successfully batch saved {} FEIGN_CLIENT evidences", feignEvidences.size());
            }
        }
    }

    private ObjectNode createPropertiesNode(String sourcePath) {
        ObjectNode node = objectMapper.createObjectNode();
        if (sourcePath != null) {
            node.put("sourcePath", sourcePath);
        }
        return node;
    }

    private ModelElement findOwningElement(List<ModelElement> elements, String filePath) {
        if (elements == null || elements.isEmpty()) {
            return null;
        }
        if (filePath != null) {
            for (ModelElement el : elements) {
                if (el.getScope() != null && filePath.startsWith(el.getScope())) {
                    return el;
                }
                if (el.getName() != null && filePath.contains(el.getName())) {
                    return el;
                }
            }
        }
        return elements.get(0);
    }

    private ModelElement matchTargetElement(List<ModelElement> elements, String targetServiceName) {
        // 1. Exact match (case-insensitive)
        for (ModelElement el : elements) {
            if (el.getName() != null && el.getName().equalsIgnoreCase(targetServiceName)) {
                return el;
            }
        }
        // 2. Contains match (case-insensitive)
        for (ModelElement el : elements) {
            if (el.getName() != null) {
                String nodeNameLower = el.getName().toLowerCase();
                String targetLower = targetServiceName.toLowerCase();
                if (nodeNameLower.contains(targetLower) || targetLower.contains(nodeNameLower)) {
                    return el;
                }
            }
        }
        return null;
    }
}
