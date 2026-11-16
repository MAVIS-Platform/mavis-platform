package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeSessionLifecycleAckDTO {

    private UUID sessionId;
    private String resourceProject;
    private String stage;
    private String executionStatus;
    private String scenarioStatus;
    private OffsetDateTime acknowledgedAt;
}
