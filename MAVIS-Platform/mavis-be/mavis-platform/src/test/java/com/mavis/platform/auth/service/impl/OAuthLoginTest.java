package com.mavis.platform.auth.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.exception.AuthErrorCode;
import com.mavis.common.exception.AuthException;
import com.mavis.common.exception.GlobalExceptionHandler;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserOtpRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.platform.auth.controller.AuthController;
import com.mavis.platform.auth.dto.GithubLoginRequest;
import com.mavis.platform.auth.dto.GoogleLoginRequest;
import com.mavis.platform.auth.service.AuthService;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.auth.service.GithubOAuthClient;
import com.mavis.platform.security.jwt.JwtUtil;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class OAuthLoginTest {

    private final UserRepository users = mock(UserRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserOtpRepository otps = mock(UserOtpRepository.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final JwtUtil jwt = mock(JwtUtil.class);
    private final EmailService mail = mock(EmailService.class);
    private final GithubOAuthClient githubClient = mock(GithubOAuthClient.class);

    private final AuthServiceImpl service = new AuthServiceImpl(users, roles, otps, passwords, jwt, mail, githubClient);

    @Test
    void githubLoginCreatesActiveStudentUserWithVerifiedEmailAndAvatar() {
        var studentRole = Role.builder().code("STUDENT").build();
        when(githubClient.exchangeCodeForProfile("gh-code", "http://localhost:3000/api/auth/github/callback"))
                .thenReturn(new GithubOAuthClient.GithubUserProfile(
                        "Student.Dev@Example.com", "Nguyen Van A", "nguyenvana", "https://avatars.example/u/1"));
        when(users.findByEmail("student.dev@example.com")).thenReturn(Optional.empty());
        when(users.findByEmailIgnoreCase("student.dev@example.com")).thenReturn(Optional.empty());
        when(roles.findByCode("STUDENT")).thenReturn(Optional.of(studentRole));
        when(passwords.encode(anyString())).thenReturn("random-hash");
        when(users.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) u.setId(UUID.randomUUID());
            return u;
        });
        when(jwt.generateToken(eq("student.dev@example.com"), any(UUID.class), eq("STUDENT"))).thenReturn("jwt-gh");

        var req = new GithubLoginRequest();
        req.setCode("gh-code");
        req.setRedirectUri("http://localhost:3000/api/auth/github/callback");
        var res = service.githubLogin(req);

        assertEquals("jwt-gh", res.getToken());
        assertEquals("student.dev@example.com", res.getEmail());
        assertEquals("Nguyen Van A", res.getFullName());
        assertEquals("STUDENT", res.getRole());

        var captor = ArgumentCaptor.forClass(User.class);
        verify(users).save(captor.capture());
        assertEquals("ACTIVE", captor.getValue().getStatus());
        assertEquals("https://avatars.example/u/1", captor.getValue().getAvatarUrl());
    }

    @Test
    void githubLoginPromotesPendingVerificationAndBlocksLockedAccounts() {
        var existing = User.builder()
                .id(UUID.randomUUID())
                .email("pending@example.com")
                .fullName("Pending User")
                .passwordHash("hash")
                .status("PENDING_VERIFICATION")
                .role(Role.builder().code("LECTURER").build())
                .build();
        when(githubClient.exchangeCodeForProfile("code-1", null))
                .thenReturn(new GithubOAuthClient.GithubUserProfile("pending@example.com", "Pending", "pending", "https://avatars.example/u/2"));
        when(users.findByEmail("pending@example.com")).thenReturn(Optional.of(existing));
        when(jwt.generateToken(eq("pending@example.com"), eq(existing.getId()), eq("LECTURER"))).thenReturn("jwt-promoted");

        var req = new GithubLoginRequest();
        req.setCode("code-1");
        var res = service.githubLogin(req);
        assertEquals("jwt-promoted", res.getToken());
        assertEquals("ACTIVE", existing.getStatus());
        assertEquals("https://avatars.example/u/2", existing.getAvatarUrl());
        verify(users).save(existing);

        existing.setStatus("LOCKED");
        var locked = assertThrows(AuthException.class, () -> service.githubLogin(req));
        assertEquals(AuthErrorCode.LOGIN_LOCKED, locked.getAuthErrorCode());
    }

    @Test
    void googleLoginRejectsUnconfiguredClientId() {
        ReflectionTestUtils.setField(service, "googleClientId", "");
        var req = new GoogleLoginRequest();
        req.setIdToken("fake-token");
        var ex = assertThrows(AuthException.class, () -> service.googleLogin(req));
        assertEquals(AuthErrorCode.AUTH_OAUTH_UNCONFIGURED, ex.getAuthErrorCode());
    }

    @Test
    void githubOAuthClientExchangesCodeAndSelectsPrimaryVerifiedEmail() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        try {
            server.createContext("/login/oauth/access_token", exchange -> {
                byte[] body = "{\"access_token\":\"gho_test_token\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.createContext("/user", exchange -> {
                assertEquals("Bearer gho_test_token", exchange.getRequestHeaders().getFirst("Authorization"));
                byte[] body = "{\"login\":\"octocat\",\"name\":\"The Octocat\",\"avatar_url\":\"https://avatars.example/octocat\"}"
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.createContext("/user/emails", exchange -> {
                byte[] body = ("[{\"email\":\"unverified@example.com\",\"primary\":false,\"verified\":false}," +
                        "{\"email\":\"primary@example.com\",\"primary\":true,\"verified\":true}]")
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.start();

            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            var client = new GithubOAuthClient(
                    HttpClient.newHttpClient(), new ObjectMapper(),
                    "gh-client-id", "gh-client-secret",
                    base + "/login/oauth/access_token", base);

            var profile = client.exchangeCodeForProfile("valid-code", "http://localhost:3000/api/auth/github/callback");
            assertEquals("primary@example.com", profile.email());
            assertEquals("The Octocat", profile.name());
            assertEquals("octocat", profile.login());
            assertEquals("https://avatars.example/octocat", profile.avatarUrl());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void githubOAuthClientRejectsWhenUnconfiguredOrEmailUnverified() throws Exception {
        var unconfigured = new GithubOAuthClient(
                HttpClient.newHttpClient(), new ObjectMapper(), "", "", "http://127.0.0.1:1/token", "http://127.0.0.1:1");
        assertEquals(AuthErrorCode.AUTH_OAUTH_UNCONFIGURED,
                assertThrows(AuthException.class, () -> unconfigured.exchangeCodeForProfile("code", null)).getAuthErrorCode());

        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        try {
            server.createContext("/login/oauth/access_token", exchange -> {
                byte[] body = "{\"access_token\":\"gho_test\"}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.createContext("/user", exchange -> {
                byte[] body = "{\"login\":\"noemail\"}".getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.createContext("/user/emails", exchange -> {
                byte[] body = "[{\"email\":\"raw@example.com\",\"primary\":true,\"verified\":false}]"
                        .getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) { out.write(body); }
            });
            server.start();

            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            var client = new GithubOAuthClient(
                    HttpClient.newHttpClient(), new ObjectMapper(),
                    "id", "secret", base + "/login/oauth/access_token", base);

            assertEquals(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED,
                    assertThrows(AuthException.class, () -> client.exchangeCodeForProfile("code", null)).getAuthErrorCode());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void githubControllerValidatesInputAndExposesStableErrorCodes() throws Exception {
        AuthService mockAuth = mock(AuthService.class);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new AuthController(mockAuth, null))
                .setControllerAdvice(new GlobalExceptionHandler()).build();

        mvc.perform(post("/api/v1/auth/github").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("AUTH_INPUT_INVALID"));

        when(mockAuth.githubLogin(any())).thenThrow(new AuthException(AuthErrorCode.AUTH_OAUTH_EMAIL_UNVERIFIED));
        mvc.perform(post("/api/v1/auth/github").contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"abc\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("AUTH_OAUTH_EMAIL_UNVERIFIED"));
    }
}
