package com.mavis.platform.workspace.dto;

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
public class WorkspaceResponseDTO {
    private UUID id;
    private String code;
    private String name;
    private String description;
    private UUID createdById;
    private String createdByName;
    private String status;
    private long memberCount;
    private long assignmentCount;
    private String myRoleInWorkspace;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
