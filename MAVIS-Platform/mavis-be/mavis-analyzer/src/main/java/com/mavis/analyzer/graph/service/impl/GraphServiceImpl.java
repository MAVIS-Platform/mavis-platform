package com.mavis.analyzer.graph.service.impl;

import com.mavis.analyzer.graph.dto.EdgeDTO;
import com.mavis.analyzer.graph.dto.GraphDataDTO;
import com.mavis.analyzer.graph.dto.NodeDTO;
import com.mavis.analyzer.graph.service.GraphService;
import com.mavis.common.entity.DependencyEdge;
import com.mavis.common.entity.ServiceNode;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.DependencyEdgeRepository;
import com.mavis.common.repository.ServiceNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GraphServiceImpl implements GraphService {

    private final ServiceNodeRepository serviceNodeRepository;
    private final DependencyEdgeRepository dependencyEdgeRepository;

    @Override
    public GraphDataDTO getGraphDataBySessionId(UUID sessionId) {
        log.info("Fetching graph data for session ID: {}", sessionId);

        List<ServiceNode> serviceNodes = serviceNodeRepository.findBySessionId(sessionId);
        
        if (serviceNodes.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dữ liệu đồ thị cho session ID này");
        }

        List<DependencyEdge> dependencyEdges = dependencyEdgeRepository.findBySessionId(sessionId);

        List<NodeDTO> nodeDTOs = serviceNodes.stream()
                .map(node -> NodeDTO.builder()
                        .id(node.getId())
                        .name(node.getName())
                        .type(node.getNodeType())
                        .sourcePath(node.getSourcePath())
                        .build())
                .collect(Collectors.toList());

        List<EdgeDTO> edgeDTOs = dependencyEdges.stream()
                .map(edge -> EdgeDTO.builder()
                        .id(edge.getId())
                        .sourceNodeId(edge.getSourceNode().getId())
                        .targetNodeId(edge.getTargetNode().getId())
                        .kind(edge.getDependencyKind())
                        .description(edge.getDescription())
                        .build())
                .collect(Collectors.toList());

        return GraphDataDTO.builder()
                .nodes(nodeDTOs)
                .edges(edgeDTOs)
                .build();
    }
}
