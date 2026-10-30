package com.mavis.platform.auth.controller;

import com.mavis.common.exception.*;
import com.mavis.platform.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthControllerErrorTest {
    final AuthService auth = mock(AuthService.class);
    final MockMvc mvc = MockMvcBuilders.standaloneSetup(new AuthController(auth))
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @Test void loginUsesAdditiveStableCodeWithoutReplacingNumericContract() throws Exception {
        when(auth.login(any())).thenThrow(new AuthException(AuthErrorCode.LOGIN_CREDENTIALS));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"fixture@example.invalid\",\"password\":\"candidate\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.errorCode").value("LOGIN_CREDENTIALS"))
                .andExpect(jsonPath("$.message").value("Email or password is incorrect."));
    }
    @Test void passwordPolicyAndMalformedOtpAreDistinctSafeValidationErrors() throws Exception {
        mvc.perform(post("/api/v1/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"fixture@example.invalid\",\"otpCode\":\"123456\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("AUTH_PASSWORD_POLICY"));
        mvc.perform(post("/api/v1/auth/verify-email").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"fixture@example.invalid\",\"otpCode\":\"12345x\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("AUTH_INPUT_INVALID"));
        verifyNoInteractions(auth);
    }
    @Test void publicRecoveryResponsesAreNeutralAndNeverClaimDelivery() throws Exception {
        mvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"fixture@example.invalid\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.message").value("If this email is registered, you will receive a password reset code."))
                .andExpect(jsonPath("$.errorCode").doesNotExist());
        mvc.perform(post("/api/v1/auth/resend-otp").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"fixture@example.invalid\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("If this email needs verification, you will receive a new code."));
    }
}
