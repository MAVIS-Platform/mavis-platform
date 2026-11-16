package com.mavis.platform.auth.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
import com.mavis.platform.auth.dto.VerifyEmailRequest;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.*;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthVerificationTest {
    final UserRepository users=mock(UserRepository.class);
    final UserOtpRepository otps=mock(UserOtpRepository.class);
    final AuthServiceImpl service=new AuthServiceImpl(users,mock(RoleRepository.class),otps,mock(PasswordEncoder.class),mock(JwtUtil.class),mock(EmailService.class));
    final User user=User.builder().email("fixture@example.invalid").status("PENDING_VERIFICATION").build();
    VerifyEmailRequest request(){var r=new VerifyEmailRequest();r.setEmail(user.getEmail());r.setOtpCode("123456");when(users.findForUpdateByEmail(user.getEmail())).thenReturn(Optional.of(user));return r;}
    UserOtp otp(String purpose,OffsetDateTime expiry){var o=UserOtp.builder().user(user).otpCode("123456").purpose(purpose).expiryTime(expiry).isUsed(false).build();when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user,"123456",purpose)).thenReturn(Optional.of(o));return o;}
    @ParameterizedTest @ValueSource(strings={"LOCKED","INACTIVE","ACTIVE"})
    void verificationCannotReactivateBlockedOrVerifiedAccounts(String status){var r=request();user.setStatus(status);assertThrows(BusinessException.class,()->service.verifyEmail(r));assertEquals(status,user.getStatus());if(!"ACTIVE".equals(status))verifyNoInteractions(otps);verify(users,never()).save(any());}
    @Test void passwordResetCodeCannotVerifyEmail(){var r=request();var o=otp("PASSWORD_RESET",OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5));assertThrows(BusinessException.class,()->service.verifyEmail(r));assertFalse(o.isUsed());assertEquals("PENDING_VERIFICATION",user.getStatus());verify(otps,never()).save(any());}
    @Test void expiredCodeCannotActivateUser(){var r=request();otp("EMAIL_VERIFICATION",OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1));assertThrows(BusinessException.class,()->service.verifyEmail(r));verify(users,never()).save(any());}
    @Test void usedOrUnknownCodeIsRejected(){var r=request();when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(user,"123456","EMAIL_VERIFICATION")).thenReturn(Optional.empty());assertThrows(BusinessException.class,()->service.verifyEmail(r));verify(users,never()).save(any());}
    @Test void validVerificationConsumesCodeAndActivatesUser(){var r=request();var o=otp("EMAIL_VERIFICATION",OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5));service.verifyEmail(r);assertTrue(o.isUsed());assertEquals("ACTIVE",user.getStatus());verify(otps).save(o);verify(users).save(user);}
}
