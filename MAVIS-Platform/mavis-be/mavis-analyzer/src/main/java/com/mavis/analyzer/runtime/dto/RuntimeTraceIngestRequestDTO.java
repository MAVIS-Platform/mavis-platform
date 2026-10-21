package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeTraceIngestRequestDTO {

    @Builder.Default
    private String scenarioOutcome = "PASSED"; // "PASSED" hoặc "FAILED"

    @Builder.Default
    private List<OtelSpanDTO> spans = new ArrayList<>();
}
