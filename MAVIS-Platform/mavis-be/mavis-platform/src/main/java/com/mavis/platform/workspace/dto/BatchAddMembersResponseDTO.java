package com.mavis.platform.workspace.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchAddMembersResponseDTO {
    private int addedCount;
    private List<String> addedEmails;
    private List<String> alreadyMemberEmails;
    private List<String> notFoundEmails;
}
