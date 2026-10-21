package com.mavis.platform.workspace.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AddWorkspaceMemberRequest {

    @NotBlank(message = "Email không được để trống")
    @Email(message = "Email không đúng định dạng")
    private String email;

    @Builder.Default
    @Pattern(regexp = "^(LECTURER|STUDENT)?$", message = "Vai trò chỉ có thể là LECTURER hoặc STUDENT")
    private String memberRole = "STUDENT";
}
