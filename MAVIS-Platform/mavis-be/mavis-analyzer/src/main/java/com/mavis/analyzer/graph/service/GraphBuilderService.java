package com.mavis.analyzer.graph.service;

import com.mavis.common.entity.AnalysisSession;
import com.mavis.common.entity.ServiceNode;
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
}
