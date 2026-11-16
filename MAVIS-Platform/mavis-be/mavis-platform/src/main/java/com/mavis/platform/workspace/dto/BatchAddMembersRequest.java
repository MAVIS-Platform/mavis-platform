package com.mavis.platform.workspace.dto;

import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BatchAddMembersRequest {

    @NotEmpty(message = "Danh sách email không được để trống")
    private List<String> emails;
}
