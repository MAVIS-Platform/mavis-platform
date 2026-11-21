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
public class WorkspaceMemberResponseDTO {
    private UUID id;
    private UUID workspaceId;
    private UUID userId;
    private String email;
    private String fullName;
    private String avatarUrl;
    private String globalRole;
    private String memberRole;
    private OffsetDateTime joinedAt;
}
