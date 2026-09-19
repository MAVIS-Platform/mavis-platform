package com.mavis.analyzer.ai.service;

import java.util.UUID;

public interface AiExplanationService {
    String generateExplanationText(UUID sessionId, UUID nodeId);
    
    com.mavis.common.entity.AiExplanation explainNode(UUID sessionId, UUID nodeId, UUID requestedByUserId);
}
