package com.mavis.analyzer.runtime.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SequenceStepDTO {

    private int stepOrder;
    private String callerService;
    private String calleeService;
    private String operation;
    private String httpMethod;
    private Integer httpStatusCode;
    private Long durationMs;
    private String traceId;
    private String spanId;
    private String parentSpanId;

    // M3 additive UML Sequence contract fields
    private String messageId;
    private String callerParticipantId;
    private String calleeParticipantId;
    private UUID callerElementId;
    private UUID calleeElementId;
    private UUID callerBaseElementId;
    private UUID calleeBaseElementId;
    private String callerResolutionStatus;
    private String calleeResolutionStatus;
    private String messageSort;
    private UUID relationshipId;
    private UUID baseRelationshipId;
    private List<UUID> candidateRelationshipIds;
    private UUID evidenceId;
    private String provenanceType;
    private List<String> causalParentMessageIds;
}
