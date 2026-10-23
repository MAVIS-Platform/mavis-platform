package com.mavis.bootstrap;

import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.platform.security.jwt.JwtUtil;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.MediaType;
import java.time.OffsetDateTime;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class Stage13ProfileApiIntegrationTest {
    @Autowired MockMvc mvc; @Autowired UserRepository users; @Autowired RoleRepository roles;
    @Autowired UserOtpRepository otps; @Autowired PasswordEncoder passwords; @Autowired JwtUtil jwt;
    @Autowired EntityManager em;
    @Test void authenticatedProfileUpdatesPersistAndOtpRoundTripsAsAnInstant() throws Exception {
        var user=users.saveAndFlush(User.builder().email("profile-"+UUID.randomUUID()+"@example.invalid").fullName("Before")
            .passwordHash(passwords.encode("current-secret")).status("ACTIVE").role(roles.findByCode("STUDENT").orElseThrow()).build());
        String token=jwt.generateToken(user.getEmail(),user.getId(),"STUDENT");
        mvc.perform(patch("/api/v1/auth/me").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fullName\":\"Updated\",\"currentPassword\":\"wrong\",\"newPassword\":\"new-secret\"}"))
            .andExpect(status().isBadRequest());
        assertThat(users.findById(user.getId()).orElseThrow().getFullName()).isEqualTo("Before");
        mvc.perform(put("/api/v1/auth/me").header("Authorization","Bearer "+token).contentType(MediaType.APPLICATION_JSON)
            .content("{\"fullName\":\"Updated\",\"currentPassword\":\"current-secret\",\"newPassword\":\"new-secret\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.fullName").value("Updated"))
            .andExpect(jsonPath("$.data.passwordHash").doesNotExist());
        em.flush();em.clear();var saved=users.findById(user.getId()).orElseThrow();
        assertThat(passwords.matches("new-secret",saved.getPasswordHash())).isTrue();
        var instant=OffsetDateTime.parse("2026-10-24T01:00:00+07:00");
        var otp=otps.saveAndFlush(UserOtp.builder().user(saved).otpCode("123456").purpose("EMAIL_VERIFICATION").expiryTime(instant).build());
        var otpId=otp.getId();em.clear();assertThat(otps.findById(otpId).orElseThrow().getExpiryTime().toInstant()).isEqualTo(instant.toInstant());
    }
}
