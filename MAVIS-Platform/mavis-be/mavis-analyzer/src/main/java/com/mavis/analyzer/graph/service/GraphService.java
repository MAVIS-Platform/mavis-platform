package com.mavis.analyzer.graph.service;

import com.mavis.analyzer.graph.dto.GraphDataDTO;

import java.util.UUID;

public interface GraphService {
    GraphDataDTO getGraphDataBySessionId(UUID sessionId);
}
