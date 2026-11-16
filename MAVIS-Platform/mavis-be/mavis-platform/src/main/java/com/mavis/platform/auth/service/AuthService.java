package com.mavis.platform.auth.service;

import com.mavis.platform.auth.dto.AuthResponse;
import com.mavis.platform.auth.dto.GoogleLoginRequest;
import com.mavis.platform.auth.dto.LoginRequest;
import com.mavis.platform.auth.dto.RegisterRequest;
import com.mavis.platform.auth.dto.RegisterResponse;
import com.mavis.platform.auth.dto.VerifyEmailRequest;

public interface AuthService {
    RegisterResponse register(RegisterRequest request);
    void verifyEmail(VerifyEmailRequest request);
    AuthResponse login(LoginRequest request);
    AuthResponse googleLogin(GoogleLoginRequest request);
    void forgotPassword(com.mavis.platform.auth.dto.ForgotPasswordRequest request);
    void resetPassword(com.mavis.platform.auth.dto.ResetPasswordRequest request);
    void resendOtp(String email);
}
