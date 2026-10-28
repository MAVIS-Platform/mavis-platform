package com.mavis.analyzer.graph.service.impl;

import com.mavis.analyzer.graph.dto.EdgeDTO;
import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphServiceImpl implements GraphService {

    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final EvidenceRepository evidenceRepository;
    private final com.mavis.analyzer.impact.WorkerImpactService workerImpact;
    private final com.mavis.common.security.AccessPolicyService accessPolicy;

    @Override
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public GraphDataDTO getGraphDataBySessionId(UUID sessionId) {
        log.info("Fetching graph data for session / modelVersion ID: {}", sessionId);

        ModelVersion target = modelVersionRepository.findById(sessionId)
                .orElseGet(() -> modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(sessionId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Model not found")));
        accessPolicy.requireProjectReadAccess(target.getProject());
        UUID targetModelVersionId = target.getId();
        List<ModelElement> modelElements = modelElementRepository.findByModelVersionId(targetModelVersionId);
        List<ModelRelationship> relationships = modelRelationshipRepository.findByModelVersionId(targetModelVersionId);

        // O(1) single batch query for all relationship evidence in this model version
        Map<UUID, List<UUID>> evidenceMap = new HashMap<>();
        List<Object[]> evidenceRows = evidenceRepository.findRelationshipEvidenceIdsByModelVersionId(targetModelVersionId);
        if (evidenceRows != null) {
            for (Object[] row : evidenceRows) {
                if (row != null && row.length >= 2 && row[0] instanceof UUID relId && row[1] instanceof UUID evId) {
                    evidenceMap.computeIfAbsent(relId, k -> new ArrayList<>()).add(evId);
                }
            }
        }

        List<NodeDTO> nodeDTOs = modelElements.stream()
                .map(el -> NodeDTO.builder()
                        .id(el.getId())
                        .name(el.getName())
                        .type(el.getElementType())
                        .sourcePath(extractSourcePath(el))
                        .protocol(extractTextProperty(el, "protocol"))
                        .transportAuthority(extractTextProperty(el, "transportAuthority"))
                        .resolutionIssue(extractTextProperty(el, "resolutionIssue"))
                        .status(el.getStatus())
                        .languageStack(el.getLanguageStack())
                        .build())
                .collect(Collectors.toList());

        List<EdgeDTO> edgeDTOs = relationships.stream()
                .map(rel -> {
                    List<UUID> evIds = evidenceMap.get(rel.getId());
                    return EdgeDTO.builder()
                            .id(rel.getId())
                            .sourceNodeId(rel.getSourceElement().getId())
                            .targetNodeId(rel.getTargetElement().getId())
                            .kind(rel.getRelationType())
                            .originLayer(rel.getOriginLayer() != null ? rel.getOriginLayer() : "STATIC")
                            .direction(rel.getDirection())
                            .resolutionStatus(rel.getProperties() == null ? "UNKNOWN" : rel.getProperties().path("resolutionStatus").asText("UNKNOWN"))
                            .description(extractDescription(rel))
                            .evidenceCount(evIds != null ? (long) evIds.size() : 0L)
                            .evidenceIds(evIds != null ? evIds : List.of())
                            .properties(rel.getProperties())
                            .build();
                })
                .collect(Collectors.toList());

        return GraphDataDTO.builder()
                .nodes(nodeDTOs)
                .edges(edgeDTOs)
                .build();
    }

    private String extractSourcePath(ModelElement el) {
        if (el.getProperties() != null && el.getProperties().has("sourcePath")) {
            return el.getProperties().get("sourcePath").asText();
        }
        return el.getScope();
    }

    // Metadata passthrough from ModelElement.properties (S2a): only JSON text values are kept;
    // missing key, JSON null, blank strings and non-textual values map to null — never coerced,
    // never defaulted, so a bad value cannot corrupt the graph response.
    private String extractTextProperty(ModelElement el, String key) {
        if (el.getProperties() != null && el.getProperties().has(key)) {
            var value = el.getProperties().get(key);
            if (value != null && value.isTextual() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }

    private String extractDescription(ModelRelationship rel) {
        if (rel.getProperties() != null && rel.getProperties().has("description")) {
            return rel.getProperties().get("description").asText();
        }
        return rel.getRelationType();
    }

    @Override
    public List<NodeDTO> analyzeImpact(UUID modelVersionId, UUID sourceNodeId) {
        var result=workerImpact.analyze(modelVersionId,sourceNodeId,null,10,1000);
        return result.impact().affectedServices().stream().map(p->NodeDTO.builder().id(UUID.fromString(p.serviceId()))
                .name(result.serviceNames().get(p.serviceId())).type("SERVICE_CONTAINER").build()).toList();
    }
    @Override
    public com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO analyzeDetailedImpact(UUID model,UUID target){
        var view=workerImpact.analyze(model,target,null,10,1000);var result=view.impact();
        var nodes=new ArrayList<com.mavis.analyzer.graph.dto.ImpactedElementDTO>();
        for(var path:result.affectedServices()){
            var supporting=new ArrayList<com.mavis.analyzer.graph.dto.EvidenceSummaryDTO>();
            for(String id:path.evidenceIds()){var ev=view.evidence().get(id);if(ev!=null)supporting.add(com.mavis.analyzer.graph.dto.EvidenceSummaryDTO.builder().evidenceId(UUID.fromString(id)).sourceType(ev.sourceType()).locator(ev.locator()).adapterVersion(ev.adapterVersion()).build());}
            nodes.add(com.mavis.analyzer.graph.dto.ImpactedElementDTO.builder().elementId(UUID.fromString(path.serviceId())).name(view.serviceNames().get(path.serviceId())).elementType("SERVICE_CONTAINER").impactLevel(path.distance()==1?"DIRECTLY_IMPACTED":"INDIRECTLY_IMPACTED").hopDistance(path.distance()).dependencyPathNames(path.hops().stream().map(view.serviceNames()::get).toList()).supportingEvidences(supporting).build());
        }
        var warnings=new ArrayList<>(result.warnings());warnings.addAll(view.adapterWarnings());
        int direct=(int)nodes.stream().filter(n->n.getHopDistance()==1).count();
        return com.mavis.analyzer.graph.dto.ImpactAnalysisResponseDTO.builder().modelVersionId(model).targetElementId(target).targetElementName(view.serviceNames().get(target.toString())).graphRevisionId(result.graphRevisionId()).truncated(result.truncated()).warnings(warnings).totalImpactedCount(nodes.size()).directlyImpactedCount(direct).indirectlyImpactedCount(nodes.size()-direct).impactedElements(nodes).build();
    }
}
