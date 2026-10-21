package com.mavis.platform.workspace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkspaceUpdateRequest {

    @NotBlank(message = "Tên lớp học không được để trống")
    @Size(max = 255, message = "Tên lớp học không được vượt quá 255 ký tự")
    private String name;

    private String description;

    @Pattern(regexp = "^(ACTIVE|ARCHIVED)?$", message = "Trạng thái chỉ có thể là ACTIVE hoặc ARCHIVED")
    private String status;
}
