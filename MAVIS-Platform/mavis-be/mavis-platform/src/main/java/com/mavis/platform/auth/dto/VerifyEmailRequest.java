package com.mavis.platform.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class VerifyEmailRequest {
    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "OTP code is required")
    @jakarta.validation.constraints.Pattern(regexp = "[0-9]{6}", message = "Enter exactly six digits")
    private String otpCode;
}
