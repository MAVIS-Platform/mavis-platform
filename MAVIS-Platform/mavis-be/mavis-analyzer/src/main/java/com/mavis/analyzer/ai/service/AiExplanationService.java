package com.mavis.analyzer.ai.service;

import java.util.UUID;

public interface AiExplanationService {
    String generateExplanationText(UUID sessionId, UUID nodeId);
}
