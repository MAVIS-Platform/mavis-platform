package com.mavis.analyzer.orchestrator.service;

import com.mavis.common.contract.AnalyzeRequestEvent;

public interface AnalyzerOrchestratorService {

    void handleAnalyzeRequest(AnalyzeRequestEvent event);
}
