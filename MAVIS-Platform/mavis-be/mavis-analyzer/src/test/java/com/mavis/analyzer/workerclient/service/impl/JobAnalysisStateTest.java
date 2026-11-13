package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class JobAnalysisStateTest {
    @Test void uiProjectionNeverConfusesPartialAndLegacyWithCompleteAnalysis()throws Exception {
        var json=new ObjectMapper();
        var partial=JobResponseDTO.builder().status("COMPLETED").resultManifest(json.readTree("{\"completeness\":\"PARTIAL\",\"modelVersionId\":\"model\",\"dotnetAdapter\":{\"status\":\"FAILED\"}}" )).build();
        assertEquals("PARTIAL",partial.getAnalysisState());assertFalse(partial.isPromotedLatest());assertEquals("FAILED",partial.getDotnetStatus());assertEquals("model",partial.getModelVersionId());
        assertEquals("COMPLETED_LEGACY",JobResponseDTO.builder().status("COMPLETED").resultManifest(json.createObjectNode()).build().getAnalysisState());
        assertEquals("FAILED",JobResponseDTO.builder().status("FAILED").build().getAnalysisState());
        var complete=JobResponseDTO.builder().status("COMPLETED").resultManifest(json.readTree("{\"completeness\":\"ADAPTERS_COMPLETED\",\"canonicalMapping\":\"REQUIRES_REVIEW\",\"promotedLatest\":true}")).build();
        assertEquals("COMPLETED_WITH_REVIEW",complete.getAnalysisState());assertTrue(complete.isPromotedLatest());

        var verifiedComplete=JobResponseDTO.builder().status("COMPLETED").resultManifest(json.readTree("{\"completeness\":\"ADAPTERS_COMPLETED\",\"canonicalMapping\":\"VERIFIED\",\"promotedLatest\":true}")).build();
        assertEquals("COMPLETED",verifiedComplete.getAnalysisState());assertTrue(verifiedComplete.isPromotedLatest());

        assertEquals("PENDING",JobResponseDTO.builder().status("PENDING").build().getAnalysisState());
        assertEquals("RUNNING",JobResponseDTO.builder().status("RUNNING").build().getAnalysisState());
        assertEquals("CANCELLED",JobResponseDTO.builder().status("CANCELLED").build().getAnalysisState());
        assertEquals("TIMED_OUT",JobResponseDTO.builder().status("TIMED_OUT").build().getAnalysisState());
    }
}
