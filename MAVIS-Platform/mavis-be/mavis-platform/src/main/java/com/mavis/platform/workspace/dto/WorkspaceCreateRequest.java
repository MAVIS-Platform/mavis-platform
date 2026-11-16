package com.mavis.platform.workspace.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WorkspaceCreateRequest {

    @NotBlank(message = "Mã lớp học không được để trống")
    @Size(max = 50, message = "Mã lớp học không được vượt quá 50 ký tự")
    private String code;

    @NotBlank(message = "Tên lớp học không được để trống")
    @Size(max = 255, message = "Tên lớp học không được vượt quá 255 ký tự")
    private String name;

    private String description;
}
