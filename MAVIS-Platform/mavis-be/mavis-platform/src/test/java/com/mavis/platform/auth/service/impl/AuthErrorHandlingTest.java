package com.mavis.platform.auth.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import com.mavis.platform.auth.dto.*;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthErrorHandlingTest {
    final UserRepository users = mock(UserRepository.class);
    final UserOtpRepository otps = mock(UserOtpRepository.class);
    final PasswordEncoder passwords = mock(PasswordEncoder.class);
    final JwtUtil jwt = mock(JwtUtil.class);
    final EmailService mail = mock(EmailService.class);
    final AuthServiceImpl service = new AuthServiceImpl(users, mock(RoleRepository.class), otps, passwords, jwt, mail);
    final User user = User.builder().id(UUID.randomUUID()).email("fixture@example.invalid").fullName("Fixture")
            .passwordHash("hashed").status("ACTIVE").role(Role.builder().code("STUDENT").build()).build();

    void existing() { when(users.findByEmail(user.getEmail())).thenReturn(Optional.of(user)); }
    LoginRequest loginRequest() { var r = new LoginRequest(); r.setEmail(user.getEmail()); r.setPassword("candidate"); return r; }
    void error(AuthErrorCode expected, Runnable action) {
        assertEquals(expected, assertThrows(AuthException.class, action::run).getAuthErrorCode());
    }
    @ParameterizedTest @ValueSource(strings={"ACTIVE","PENDING_VERIFICATION","LOCKED","INACTIVE"})
    void wrongPasswordNeverDisclosesAccountState(String status) {
        existing(); user.setStatus(status);
        error(AuthErrorCode.LOGIN_CREDENTIALS, () -> service.login(loginRequest()));
        verifyNoInteractions(jwt);
    }
    @Test void missingEmailUsesSameCredentialsCode() {
        error(AuthErrorCode.LOGIN_CREDENTIALS, () -> service.login(loginRequest())); verifyNoInteractions(jwt);
    }
    @Test void validCredentialsIdentifyVerificationAndLockAndAllowActiveLogin() {
        existing(); when(passwords.matches("candidate", "hashed")).thenReturn(true);
        user.setStatus("PENDING_VERIFICATION"); error(AuthErrorCode.LOGIN_VERIFICATION, () -> service.login(loginRequest()));
        user.setStatus("LOCKED"); error(AuthErrorCode.LOGIN_LOCKED, () -> service.login(loginRequest()));
        user.setStatus("ACTIVE"); when(jwt.generateToken(anyString(), any(), anyString())).thenReturn("signed-fixture");
        assertEquals("signed-fixture", service.login(loginRequest()).getToken());
    }
    @ParameterizedTest @ValueSource(strings={"MISSING","PENDING_VERIFICATION","LOCKED","INACTIVE","ACTIVE"})
    void recoveryAndResendReturnNeutralForAllAccountStates(String status) {
        var r = new ForgotPasswordRequest(); r.setEmail(user.getEmail());
        if (!status.equals("MISSING")) { existing(); user.setStatus(status); }
        assertDoesNotThrow(() -> service.forgotPassword(r));
        assertDoesNotThrow(() -> service.resendOtp(user.getEmail()));
        if (status.equals("ACTIVE")) verify(mail).requestOtpEmail(eq(user.getEmail()), matches("[0-9]{6}"), eq("PASSWORD_RESET"));
        else if (status.equals("PENDING_VERIFICATION")) verify(mail).requestOtpEmail(eq(user.getEmail()), matches("[0-9]{6}"), eq("EMAIL_VERIFICATION"));
        else verifyNoInteractions(mail, otps);
    }
    @Test void otpErrorsAreScopedAndUsedCodesCannotMutateAccounts() {
        existing(); user.setStatus("PENDING_VERIFICATION");
        var verify = new VerifyEmailRequest(); verify.setEmail(user.getEmail()); verify.setOtpCode("123456");
        var reset = new ResetPasswordRequest(); reset.setEmail(user.getEmail()); reset.setOtpCode("123456"); reset.setNewPassword("candidate");
        for (String purpose : List.of("EMAIL_VERIFICATION", "PASSWORD_RESET")) {
            boolean passwordReset = purpose.equals("PASSWORD_RESET");
            Runnable action = passwordReset ? () -> service.resetPassword(reset) : () -> service.verifyEmail(verify);
            when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user,"123456",purpose)).thenReturn(Optional.empty());
            error(passwordReset ? AuthErrorCode.AUTH_RESET_INVALID : AuthErrorCode.AUTH_CODE_INVALID, action);
            var otp = UserOtp.builder().user(user).otpCode("123456").purpose(purpose).isUsed(false).expiryTime(OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1)).build();
            when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user,"123456",purpose)).thenReturn(Optional.of(otp));
            error(passwordReset ? AuthErrorCode.AUTH_RESET_EXPIRED : AuthErrorCode.AUTH_CODE_EXPIRED, action);
            otp.setUsed(true);
            error(passwordReset ? AuthErrorCode.AUTH_RESET_USED : AuthErrorCode.AUTH_CODE_USED, action);
        }
        verify(users, never()).save(any()); verify(otps, never()).save(any()); verifyNoInteractions(passwords);
    }
    @Test void validResetConsumesOnlyResetCodeAndHashesPassword() {
        existing(); var r = new ResetPasswordRequest(); r.setEmail(user.getEmail()); r.setOtpCode("123456"); r.setNewPassword("candidate");
        var otp = UserOtp.builder().user(user).purpose("PASSWORD_RESET").isUsed(false).expiryTime(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5)).build();
        when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user,"123456","PASSWORD_RESET")).thenReturn(Optional.of(otp));
        when(passwords.encode("candidate")).thenReturn("new-hash"); service.resetPassword(r);
        assertTrue(otp.isUsed()); assertEquals("new-hash",user.getPasswordHash()); verify(otps).save(otp); verify(users).save(user);
    }
}
