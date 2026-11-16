package com.mavis.platform.auth.service;

public interface EmailService {
    void sendOtpEmail(String toEmail, String otpCode, String purpose);
    void requestOtpEmail(String toEmail, String otpCode, String purpose);
}
