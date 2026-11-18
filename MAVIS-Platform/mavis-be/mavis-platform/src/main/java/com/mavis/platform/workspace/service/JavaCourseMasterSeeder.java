package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Idempotent startup seeder that provisions:
 * 1. Ready-to-test accounts (gv.java@mavis.edu.vn, sv.java@mavis.edu.vn, admin@mavis.edu.vn)
 *    with valid BCrypt password hashes, plus fixes legacy placeholder hashes in V1.
 * 2. Flagship workspace JAVA-MS-2026 with Passkeys JAVA2026 & SE1819JAVA.
 * 3. Full published 6-module Coursera Java Microservices course (18 lessons, 60 quiz questions, 6 essays).
 */
@Component
@ConditionalOnProperty(name = "mavis.seed.java-coursera.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
@Slf4j
public class JavaCourseMasterSeeder implements ApplicationRunner {
    public static final String LECTURER_EMAIL = "gv.java@mavis.edu.vn";
    public static final String STUDENT_EMAIL = "sv.java@mavis.edu.vn";
    public static final String ADMIN_EMAIL = "admin@mavis.edu.vn";
    public static final String DEFAULT_PASSWORD = "Java@123456";
    public static final String ADMIN_PASSWORD = "Admin@123456";
    public static final String PASSKEY_MAIN = "JAVA2026";
    public static final String PASSKEY_BACKUP = "SE1819JAVA";

    private final RoleRepository roles;
    private final UserRepository users;
    private final WorkspaceRepository workspaces;
    private final PasswordEncoder passwordEncoder;
    private final JdbcTemplate jdbc;
    private final CourseLabSeederService seeder;

    @Override
    public void run(ApplicationArguments args) {
        try {
            Role lecturerRole = roles.findByCode("LECTURER").orElse(null);
            Role studentRole = roles.findByCode("STUDENT").orElse(null);
            Role adminRole = roles.findByCode("SYSTEM_ADMIN").orElse(null);
            if (lecturerRole == null || studentRole == null || adminRole == null) {
                return;
            }

            User gvJava = ensureUser(LECTURER_EMAIL, DEFAULT_PASSWORD,
                    "Thầy Hoàng · Giảng Viên Java Microservices", lecturerRole);
            User svJava = ensureUser(STUDENT_EMAIL, DEFAULT_PASSWORD,
                    "Lê Minh Triết · Sinh Viên SE181979", studentRole);
            ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD,
                    "Quản Trị Viên Hệ Thống MAVIS", adminRole);

            repairPlaceholderHash("hoangnt@fpt.edu.vn", DEFAULT_PASSWORD);
            repairPlaceholderHash("trietlmse181979@fpt.edu.vn", DEFAULT_PASSWORD);

            Workspace workspace = workspaces.findByCode(JavaCourseraCatalog.COURSE_CODE)
                    .orElseGet(() -> workspaces.saveAndFlush(Workspace.builder()
                            .code(JavaCourseraCatalog.COURSE_CODE)
                            .name(JavaCourseraCatalog.COURSE_TITLE)
                            .description(JavaCourseraCatalog.COURSE_DESCRIPTION)
                            .createdBy(gvJava)
                            .status("ACTIVE")
                            .courseMode(true)
                            .maxStudents(200)
                            .build()));

            if (!workspace.isCourseMode()) {
                workspace.setCourseMode(true);
                workspace.setMaxStudents(200);
                workspaces.saveAndFlush(workspace);
            }

            ensureMember(workspace.getId(), gvJava.getId(), "LECTURER");
            ensureMember(workspace.getId(), svJava.getId(), "STUDENT");
            users.findByEmail("hoangnt@fpt.edu.vn")
                    .ifPresent(u -> ensureMember(workspace.getId(), u.getId(), "LECTURER"));
            users.findByEmail("trietlmse181979@fpt.edu.vn")
                    .ifPresent(u -> ensureMember(workspace.getId(), u.getId(), "STUDENT"));

            ensurePasskey(workspace.getId(), PASSKEY_MAIN,
                    "Mã vào lớp Java Microservices Chính Thức", 365 * 24, 200);
            ensurePasskey(workspace.getId(), PASSKEY_BACKUP,
                    "Mã dự phòng cho sinh viên thực hành Lab", 180 * 24, 100);

            var auth = new UsernamePasswordAuthenticationToken(
                    gvJava.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_LECTURER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            try {
                seeder.seedCurated(workspace.getId(), CourseLabSeederService.PRESET_JAVA_COURSERA);
            } finally {
                SecurityContextHolder.clearContext();
            }
            log.info("JavaCourseMasterSeeder ready: workspace={} passkey={}", JavaCourseraCatalog.COURSE_CODE, PASSKEY_MAIN);
        } catch (Exception ex) {
            log.debug("Skipped JavaCourseMasterSeeder initialization: {}", ex.getMessage());
        }
    }

    private User ensureUser(String email, String rawPassword, String fullName, Role role) {
        return users.findByEmail(email).map(existing -> {
            if (!"ACTIVE".equalsIgnoreCase(existing.getStatus())
                    || (existing.getPasswordHash() != null && existing.getPasswordHash().contains("hashed_pwd"))) {
                existing.setStatus("ACTIVE");
                existing.setPasswordHash(passwordEncoder.encode(rawPassword));
                existing.setPreferredLocale("vi");
                return users.saveAndFlush(existing);
            }
            return existing;
        }).orElseGet(() -> users.saveAndFlush(User.builder()
                .email(email)
                .fullName(fullName)
                .role(role)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .preferredLocale("vi")
                .status("ACTIVE")
                .build()));
    }

    private void repairPlaceholderHash(String email, String rawPassword) {
        users.findByEmail(email).ifPresent(user -> {
            if (user.getPasswordHash() != null && user.getPasswordHash().contains("hashed_pwd")) {
                user.setPasswordHash(passwordEncoder.encode(rawPassword));
                user.setStatus("ACTIVE");
                users.saveAndFlush(user);
            }
        });
    }

    private void ensureMember(UUID workspaceId, UUID userId, String role) {
        jdbc.update("""
                INSERT INTO workspace_members (workspace_id, user_id, member_role)
                VALUES (?, ?, ?)
                ON CONFLICT (workspace_id, user_id) DO NOTHING
                """, workspaceId, userId, role);
    }

    private void ensurePasskey(UUID workspaceId, String code, String label, int validHours, int maxUses) {
        String digest = HashUtils.sha256Hex(code.getBytes(StandardCharsets.UTF_8));
        List<UUID> existing = jdbc.queryForList(
                "SELECT id FROM course_passkeys WHERE digest = ?", UUID.class, digest);
        if (!existing.isEmpty()) {
            return;
        }
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("""
                INSERT INTO course_passkeys (id, workspace_id, code, label, digest, expires_at, max_uses, used_count, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, TRUE, ?)
                """, UUID.randomUUID(), workspaceId, code, label, digest, now.plusHours(validHours), maxUses, now);
    }
}
