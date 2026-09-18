package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.DependencyEdge;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.repository.DependencyEdgeRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ServiceNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphBuilderService {

    private final ServiceNodeRepository serviceNodeRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;
    private final EvidenceRepository evidenceRepository;

    public List<ServiceNode> buildAndSaveNodes(AnalysisSession session, List<String> detectedServices) {
        String sourcePath = null;
        if (session != null && session.getProject() != null && session.getProject().getStoragePath() != null) {
            String sp = session.getProject().getStoragePath();
            if (sp.toLowerCase().endsWith(".zip")) {
                int dotIndex = sp.lastIndexOf('.');
                sourcePath = sp.substring(0, dotIndex) + "_extracted";
            } else {
                sourcePath = sp;
            }
        }
        return buildAndSaveNodes(session, detectedServices, sourcePath);
    }

    public List<ServiceNode> buildAndSaveNodes(AnalysisSession session, List<String> detectedServices, String sourcePath) {
        List<ServiceNode> nodes = new ArrayList<>();

        if (detectedServices == null || detectedServices.isEmpty()) {
            String projectName = (session != null && session.getProject() != null)
                    ? session.getProject().getName()
                    : "default-service";
            log.info("No Docker services detected. Creating fallback ServiceNode with project name: {}", projectName);

            ServiceNode fallbackNode = ServiceNode.builder()
                    .session(session)
                    .name(projectName)
                    .nodeType("JAVA_SPRING")
                    .sourcePath(sourcePath)
                    .build();
            nodes.add(fallbackNode);
        } else {
            log.info("Detected {} Docker services. Creating ServiceNodes: {}", detectedServices.size(), detectedServices);
            for (String serviceName : detectedServices) {
                ServiceNode node = ServiceNode.builder()
                        .session(session)
                        .name(serviceName)
                        .nodeType("JAVA_SPRING")
                        .sourcePath(sourcePath)
                        .build();
                nodes.add(node);
            }
        }

        List<ServiceNode> savedNodes = serviceNodeRepository.saveAll(nodes);
        log.info("Successfully persisted {} service nodes for session ID: {}",
                savedNodes.size(), session != null ? session.getId() : null);
        return savedNodes;
    }

    public void buildEdgesAndEvidences(AnalysisSession session, List<ServiceNode> nodes, List<CodeEvidenceDTO> evidences) {
        if (nodes == null || nodes.isEmpty() || evidences == null || evidences.isEmpty()) {
            log.info("Nodes or evidences list is empty. Skipping edge and evidence building.");
            return;
        }

        // Logic Step 1 - Process Evidences for REST_API
        for (CodeEvidenceDTO evidenceDto : evidences) {
            if ("REST_API".equalsIgnoreCase(evidenceDto.getElementType())) {
                ServiceNode owningNode = findOwningNode(nodes, evidenceDto.getFilePath());
                Evidence evidence = Evidence.builder()
                        .node(owningNode)
                        .edge(null)
                        .filePath(evidenceDto.getFilePath() != null ? evidenceDto.getFilePath() : "")
                        .lineNumber(evidenceDto.getLineNumber())
                        .codeSnippet(evidenceDto.getCodeSnippet())
                        .evidenceType("REST_API")
                        .build();
                evidenceRepository.save(evidence);
                log.debug("Saved REST_API evidence for node: {}", owningNode != null ? owningNode.getName() : "unknown");
            }
        }

        // Logic Step 2 - Match Edges (Feign Clients)
        for (CodeEvidenceDTO feignDto : evidences) {
            if ("FEIGN_CLIENT".equalsIgnoreCase(feignDto.getElementType())) {
                String targetServiceName = feignDto.getIdentifier();
                if (targetServiceName == null || targetServiceName.isBlank()) {
                    continue;
                }

                ServiceNode targetNode = matchTargetNode(nodes, targetServiceName);
                if (targetNode != null) {
                    ServiceNode sourceNode = findOwningNode(nodes, feignDto.getFilePath());

                    DependencyEdge edge = DependencyEdge.builder()
                            .session(session)
                            .sourceNode(sourceNode)
                            .targetNode(targetNode)
                            .dependencyKind("REST_HTTP")
                            .build();

                    DependencyEdge savedEdge = dependencyEdgeRepository.save(edge);
                    log.info("Created DependencyEdge: {} -> {} [REST_HTTP]",
                            sourceNode != null ? sourceNode.getName() : "unknown", targetNode.getName());

                    Evidence feignEvidence = Evidence.builder()
                            .edge(savedEdge)
                            .node(null)
                            .filePath(feignDto.getFilePath() != null ? feignDto.getFilePath() : "")
                            .lineNumber(feignDto.getLineNumber())
                            .codeSnippet(feignDto.getCodeSnippet())
                            .evidenceType("FEIGN_CLIENT")
                            .build();
                    evidenceRepository.save(feignEvidence);
                    log.debug("Saved FEIGN_CLIENT evidence for edge ID: {}", savedEdge.getId());
                } else {
                    log.warn("Could not find matching target ServiceNode for FeignClient target service: {}", targetServiceName);
                }
            }
        }
    }

    private ServiceNode findOwningNode(List<ServiceNode> nodes, String filePath) {
        if (nodes == null || nodes.isEmpty()) {
            return null;
        }
        if (filePath != null) {
            for (ServiceNode node : nodes) {
                if (node.getSourcePath() != null && filePath.startsWith(node.getSourcePath())) {
                    return node;
                }
                if (node.getName() != null && filePath.contains(node.getName())) {
                    return node;
                }
            }
        }
        return nodes.get(0);
    }

    private ServiceNode matchTargetNode(List<ServiceNode> nodes, String targetServiceName) {
        // 1. Exact match (case-insensitive)
        for (ServiceNode node : nodes) {
            if (node.getName() != null && node.getName().equalsIgnoreCase(targetServiceName)) {
                return node;
            }
        }
        // 2. Contains match (case-insensitive)
        for (ServiceNode node : nodes) {
            if (node.getName() != null) {
                String nodeNameLower = node.getName().toLowerCase();
                String targetLower = targetServiceName.toLowerCase();
                if (nodeNameLower.contains(targetLower) || targetLower.contains(nodeNameLower)) {
                    return node;
                }
            }
        }
        return null;
    }
}
