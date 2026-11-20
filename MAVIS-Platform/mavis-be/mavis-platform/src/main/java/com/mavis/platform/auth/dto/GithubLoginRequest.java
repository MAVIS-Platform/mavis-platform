package com.mavis.platform.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class GithubLoginRequest {
    @NotBlank(message = "Authorization code is required")
    private String code;

    private String redirectUri;
}
