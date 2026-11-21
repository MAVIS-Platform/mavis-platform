package com.mavis.platform.auth.controller;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.file.Path;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CurrentUserAvatarTest {

    @TempDir
    Path tempDir;

    private User sampleUser() {
        Role role = Role.builder().code("STUDENT").name("Student").build();
        return User.builder()
                .id(UUID.randomUUID())
                .email("learner@mavis.edu.vn")
                .fullName("Coursera Learner")
                .role(role)
                .status("ACTIVE")
                .passwordHash("hashed")
                .build();
    }

    @Test
    void uploadServeAndDeleteAvatarValidatesMagicBytesAndPersistsSafely() throws Exception {
        var policy = mock(AccessPolicyService.class);
        var repo = mock(UserRepository.class);
        var encoder = mock(PasswordEncoder.class);
        var user = sampleUser();
        when(policy.requireCurrentActiveUser()).thenReturn(user);

        var controller = new CurrentUserController(policy, repo, encoder, tempDir.toString());

        byte[] pngHeader = new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01};
        var pngFile = new MockMultipartFile("file", "photo.png", "image/png", pngHeader);

        var uploaded = controller.uploadAvatar(pngFile);
        assertEquals(ErrorCode.SUCCESS.getCode(), uploaded.getCode());
        assertNotNull(uploaded.getData().avatarUrl());
        assertTrue(uploaded.getData().avatarUrl().startsWith("/api/backend/auth/avatars/" + user.getId() + "?v="));

        var served = controller.getAvatar(user.getId());
        assertEquals(HttpStatus.OK, served.getStatusCode());
        assertEquals(MediaType.IMAGE_PNG, served.getHeaders().getContentType());
        assertEquals("nosniff", served.getHeaders().getFirst("X-Content-Type-Options"));
        assertArrayEquals(pngHeader, served.getBody().getContentAsByteArray());

        // Spoofed SVG pretending to be PNG must be rejected by magic-byte inspection.
        var fakeSvg = new MockMultipartFile("file", "evil.png", "image/png", "<svg onload=alert(1)/>".getBytes());
        var rejected = assertThrows(BusinessException.class, () -> controller.uploadAvatar(fakeSvg));
        assertEquals(ErrorCode.BAD_REQUEST, rejected.getErrorCode());

        // Unsafe javascript: URL in profile update must be rejected.
        var badUrlReq = new CurrentUserController.UpdateProfileRequest("Coursera Learner", null, null, "javascript:alert(1)", "en", null);
        var urlRejected = assertThrows(BusinessException.class, () -> controller.update(badUrlReq));
        assertEquals(ErrorCode.BAD_REQUEST, urlRejected.getErrorCode());

        // Deleting avatar clears avatarUrl and returns 404 when fetched afterward.
        var deleted = controller.deleteAvatar();
        assertNull(deleted.getData().avatarUrl());
        assertEquals(HttpStatus.NOT_FOUND, controller.getAvatar(user.getId()).getStatusCode());
    }
}
