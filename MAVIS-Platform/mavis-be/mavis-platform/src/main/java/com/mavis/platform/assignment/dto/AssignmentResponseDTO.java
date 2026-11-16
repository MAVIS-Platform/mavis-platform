package com.mavis.platform.assignment.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignmentResponseDTO {
    private UUID id;
    private UUID workspaceId;
    private String workspaceName;
    private UUID createdById;
    private String createdByName;
    private String title;
    private String description;
    private List<String> requiredDiagramTypes;
    private String ruleSetVersion;
    private Boolean requireRuntimeTrace;
    private JsonNode aiPolicy;
    private Integer labOrder;
    private java.util.Map<String, Object> referenceSource;
    private OffsetDateTime dueAt;
    private long submissionCount;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
