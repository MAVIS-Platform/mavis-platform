package com.mavis.platform.auth.controller;

import com.mavis.common.dto.ApiResponse;
import com.mavis.common.entity.User;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.security.AccessPolicyService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@RestController
public class CurrentUserController {
    private static final long MAX_AVATAR_BYTES = 2L * 1024 * 1024;
    private static final List<String> AVATAR_EXTENSIONS = List.of("png", "jpg", "webp");

    private final AccessPolicyService accessPolicy;
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final Path avatarRoot;

    @Autowired
    public CurrentUserController(
            AccessPolicyService accessPolicy,
            UserRepository users,
            PasswordEncoder passwords,
            @Value("${mavis.storage.upload-dir:${java.io.tmpdir}/mavis-uploads}") String uploadDir) {
        this.accessPolicy = accessPolicy;
        this.users = users;
        this.passwords = passwords;
        this.avatarRoot = Path.of(uploadDir).toAbsolutePath().normalize().resolve("avatars");
    }

    public CurrentUserController(
            AccessPolicyService accessPolicy,
            UserRepository users,
            PasswordEncoder passwords) {
        this(accessPolicy, users, passwords, System.getProperty("java.io.tmpdir") + "/mavis-uploads");
    }

    public record CurrentUser(UUID id, String email, String fullName, String role, String avatarUrl, String preferredLocale) {}

    public record UpdateProfileRequest(
            @NotBlank @Size(max = 255) String fullName,
            @Size(max = 100) String currentPassword,
            @Size(min = 6, max = 100) String newPassword,
            @Size(max = 1000) String avatarUrl,
            @Pattern(regexp = "en|vi") String preferredLocale,
            Boolean clearAvatar) {
        public UpdateProfileRequest(String fullName, String currentPassword, String newPassword) {
            this(fullName, currentPassword, newPassword, null, null, null);
        }

        public UpdateProfileRequest(String fullName, String currentPassword, String newPassword, String avatarUrl, String preferredLocale) {
            this(fullName, currentPassword, newPassword, avatarUrl, preferredLocale, null);
        }
    }

    @GetMapping("/api/v1/auth/me")
    public ApiResponse<CurrentUser> me() {
        var user = accessPolicy.requireCurrentActiveUser();
        return ApiResponse.success(view(user));
    }

    @RequestMapping(value = "/api/v1/auth/me", method = {RequestMethod.PATCH, RequestMethod.PUT})
    @Transactional
    public ApiResponse<CurrentUser> update(@Valid @RequestBody UpdateProfileRequest request) {
        var user = accessPolicy.requireCurrentActiveUser();
        // Verify before mutating the managed entity, so a rejected password changes nothing.
        if (request.newPassword() != null) {
            if (request.currentPassword() == null || !passwords.matches(request.currentPassword(), user.getPasswordHash())) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Current password is incorrect");
            }
            user.setPasswordHash(passwords.encode(request.newPassword()));
        }
        user.setFullName(request.fullName().trim());
        if (Boolean.TRUE.equals(request.clearAvatar())) {
            deleteLocalAvatarFiles(user.getId());
            user.setAvatarUrl(null);
        } else if (request.avatarUrl() != null) {
            String trimmed = request.avatarUrl().trim();
            if (trimmed.isEmpty()) {
                deleteLocalAvatarFiles(user.getId());
                user.setAvatarUrl(null);
            } else {
                validateSafeAvatarUrl(trimmed);
                user.setAvatarUrl(trimmed);
            }
        }
        if (request.preferredLocale() != null) {
            user.setPreferredLocale(request.preferredLocale());
        }
        users.save(user);
        return ApiResponse.success(view(user));
    }

    @PostMapping(value = "/api/v1/auth/me/avatar", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ApiResponse<CurrentUser> uploadAvatar(@RequestParam("file") MultipartFile file) {
        var user = accessPolicy.requireCurrentActiveUser();
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Please select an image file to upload.");
        }
        if (file.getSize() > MAX_AVATAR_BYTES) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Avatar image must be 2 MB or smaller.");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Could not read uploaded image.");
        }
        if (bytes.length == 0 || bytes.length > MAX_AVATAR_BYTES) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Avatar image must be between 1 byte and 2 MB.");
        }
        String ext = detectImageExtension(bytes);
        if (ext == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Only PNG, JPEG, or WebP images are supported.");
        }
        try {
            Files.createDirectories(avatarRoot);
            Path target = resolveSafeAvatarPath(user.getId(), ext);
            Path temp = Files.createTempFile(avatarRoot, "avatar-", "." + ext);
            try {
                Files.write(temp, bytes);
                deleteLocalAvatarFiles(user.getId());
                Files.move(temp, target, StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(temp);
            }
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Unable to store avatar image.");
        }
        String url = "/api/backend/auth/avatars/" + user.getId() + "?v=" + Instant.now().toEpochMilli();
        user.setAvatarUrl(url);
        users.save(user);
        return ApiResponse.success(view(user));
    }

    @DeleteMapping("/api/v1/auth/me/avatar")
    @Transactional
    public ApiResponse<CurrentUser> deleteAvatar() {
        var user = accessPolicy.requireCurrentActiveUser();
        deleteLocalAvatarFiles(user.getId());
        user.setAvatarUrl(null);
        users.save(user);
        return ApiResponse.success(view(user));
    }

    @GetMapping("/api/v1/auth/avatars/{userId}")
    public ResponseEntity<Resource> getAvatar(@PathVariable UUID userId) {
        for (String ext : AVATAR_EXTENSIONS) {
            Path file = resolveSafeAvatarPath(userId, ext);
            if (Files.isRegularFile(file)) {
                try {
                    byte[] bytes = Files.readAllBytes(file);
                    MediaType mediaType = switch (ext) {
                        case "png" -> MediaType.IMAGE_PNG;
                        case "jpg" -> MediaType.IMAGE_JPEG;
                        default -> MediaType.parseMediaType("image/webp");
                    };
                    return ResponseEntity.ok()
                            .contentType(mediaType)
                            .cacheControl(CacheControl.maxAge(Duration.ofDays(1)).cachePrivate())
                            .header("X-Content-Type-Options", "nosniff")
                            .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(bytes.length))
                            .body(new ByteArrayResource(bytes));
                } catch (IOException ex) {
                    throw new BusinessException(ErrorCode.INTERNAL_SERVER_ERROR, "Unable to read avatar image.");
                }
            }
        }
        return ResponseEntity.notFound().build();
    }

    private Path resolveSafeAvatarPath(UUID userId, String ext) {
        Path resolved = avatarRoot.resolve(userId + "." + ext).normalize();
        if (!resolved.startsWith(avatarRoot)) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Invalid avatar path.");
        }
        return resolved;
    }

    private void deleteLocalAvatarFiles(UUID userId) {
        for (String ext : AVATAR_EXTENSIONS) {
            try {
                Files.deleteIfExists(resolveSafeAvatarPath(userId, ext));
            } catch (IOException ignored) {
                // Best-effort cleanup of stale local image variants.
            }
        }
    }

    private static void validateSafeAvatarUrl(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        boolean safeHttp = lower.startsWith("https://") || lower.startsWith("http://");
        boolean safeInternal = lower.startsWith("/api/backend/auth/avatars/");
        if (!safeHttp && !safeInternal) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Avatar URL must use http(s) or an uploaded MAVIS avatar path.");
        }
    }

    private static String detectImageExtension(byte[] bytes) {
        if (bytes.length >= 8
                && (bytes[0] & 0xFF) == 0x89
                && bytes[1] == 0x50
                && bytes[2] == 0x4E
                && bytes[3] == 0x47
                && bytes[4] == 0x0D
                && bytes[5] == 0x0A
                && bytes[6] == 0x1A
                && bytes[7] == 0x0A) {
            return "png";
        }
        if (bytes.length >= 3
                && (bytes[0] & 0xFF) == 0xFF
                && (bytes[1] & 0xFF) == 0xD8
                && (bytes[2] & 0xFF) == 0xFF) {
            return "jpg";
        }
        if (bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "webp";
        }
        return null;
    }

    private CurrentUser view(User user) {
        return new CurrentUser(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole().getCode(),
                user.getAvatarUrl(),
                user.getPreferredLocale());
    }
}
