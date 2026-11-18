package com.mavis.platform.workspace.service;

import com.mavis.common.entity.Role;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AuthorizationRequestCache;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Idempotent startup & 1-click bootstrap seeder that provisions in 5 isolated phases:
 * 0. Self-healing schema DDL for multi-passkey columns and course_item_submissions.
 * 1. Ready-to-test accounts (gv.java@mavis.edu.vn, sv.java@mavis.edu.vn, admin@mavis.edu.vn)
 *    with valid BCrypt password hashes, plus repairing legacy placeholder hashes.
 * 2. Flagship workspace JAVA-MS-2026 with Lecturer/Student memberships.
 * 3. Active passkeys JAVA2026 & SE1819JAVA.
 * 4. Full published 6-module Coursera Java Microservices course (18 lessons, 60 quizzes, 6 essays, 6 labs).
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
        bootstrapJavaCourseraWorkspace(null);
    }

    public Workspace bootstrapJavaCourseraWorkspace() {
        return bootstrapJavaCourseraWorkspace(null);
    }

    public Workspace bootstrapJavaCourseraWorkspace(User caller) {
        // Phase 0: Self-healing schema guard
        ensureSchemaReady();

        // Phase 1: 3 Core Role Accounts + legacy hash repair
        User gvJava = ensureThreeRoleAccounts();
        if (gvJava == null) {
            log.warn("JavaCourseMasterSeeder phase 1 aborted: LECTURER/STUDENT/SYSTEM_ADMIN roles or gv.java user unavailable");
            return caller != null ? workspaces.findByCode(JavaCourseraCatalog.COURSE_CODE).orElse(null) : null;
        }

        // Phase 2: Flagship workspace JAVA-MS-2026 & memberships
        Workspace workspace = ensureJavaWorkspaceAndMembers(gvJava, caller);
        if (workspace == null) {
            return null;
        }

        // Phase 3: Active Passkeys JAVA2026 & SE1819JAVA
        ensureJavaPasskeys(workspace.getId());

        // Phase 4: Curated 6-Module Coursera course, outline, 18 theory assets & publish
        User ownerForSeed = caller != null ? caller : gvJava;
        ensureCuratedCourseAndOutline(workspace.getId(), ownerForSeed);

        return workspaces.findById(workspace.getId()).orElse(workspace);
    }

    private void ensureSchemaReady() {
        try {
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS id UUID");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS code VARCHAR(32)");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS label VARCHAR(120) NOT NULL DEFAULT 'Class Passkey'");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS max_uses INTEGER");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE");
            jdbc.execute("ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()");
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS course_item_submissions (
                        id UUID PRIMARY KEY,
                        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                        course_item_id UUID NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
                        student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        answer_markdown TEXT NOT NULL,
                        status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
                        score INTEGER,
                        feedback TEXT,
                        graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
                        submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        graded_at TIMESTAMPTZ,
                        CONSTRAINT uq_course_item_student_submission UNIQUE (course_item_id, student_id)
                    )
                    """);
            String dbVersion = null;
            try {
                dbVersion = jdbc.queryForObject("SELECT version()", String.class);
            } catch (Exception ignored) {
                // Unit test mock or non-Postgres datasource
            }
            if (dbVersion != null && dbVersion.contains("PostgreSQL")) {
                jdbc.execute("""
                        DO $$
                        BEGIN
                            ALTER TABLE model_elements DROP CONSTRAINT IF EXISTS model_elements_element_type_check;
                            ALTER TABLE model_elements ADD CONSTRAINT model_elements_element_type_check
                                CHECK (element_type IN ('SYSTEM','SERVICE_CONTAINER','COMPONENT','CLASS_INTERFACE','DATABASE','EXTERNAL_SYSTEM','QUEUE_BROKER','MESSAGE_CHANNEL','PERSON'));
                            ALTER TABLE model_elements DROP CONSTRAINT IF EXISTS model_elements_status_check;
                            ALTER TABLE model_elements ADD CONSTRAINT model_elements_status_check
                                CHECK (status IN ('DRAFT','NEEDS_REVIEW','VALIDATED','STUDENT_CONFIRMED','UNCERTAIN_MAPPING'));
                            ALTER TABLE model_relationships DROP CONSTRAINT IF EXISTS model_relationships_relation_type_check;
                            ALTER TABLE model_relationships ADD CONSTRAINT model_relationships_relation_type_check
                                CHECK (relation_type IN ('SERVICE_HTTP_CALL','CODE_DEPENDENCY','DATABASE_ACCESS','RUNTIME_OBSERVED','DECLARED_COMPOSE','MESSAGE_PUBLISH','MESSAGE_SUBSCRIBE','DECLARED_LINK','CONFIGURATION_DEPENDENCY','SERVICE_DISCOVERY','TRACING_EXPORT','GATEWAY_ROUTE','CONFIGURED_ENDPOINT'));
                            ALTER TABLE evidences DROP CONSTRAINT IF EXISTS evidences_source_type_check;
                            ALTER TABLE evidences ADD CONSTRAINT evidences_source_type_check
                                CHECK (source_type IN ('STATIC_CODE','CONFIG_FILE','DOCKER_COMPOSE','RUNTIME_TRACE'));
                        EXCEPTION WHEN OTHERS THEN NULL;
                        END $$;
                        """);
            }
            log.info("JavaCourseMasterSeeder Phase 0 complete: schema self-heal verified");
        } catch (Exception ex) {
            log.warn("JavaCourseMasterSeeder Phase 0 skipped/partial schema check: {}", ex.getMessage());
        }
    }

    private User ensureThreeRoleAccounts() {
        try {
            Role lecturerRole = roles.findByCode("LECTURER").orElse(null);
            Role studentRole = roles.findByCode("STUDENT").orElse(null);
            Role adminRole = roles.findByCode("SYSTEM_ADMIN").orElse(null);
            if (lecturerRole == null || studentRole == null || adminRole == null) {
                log.warn("JavaCourseMasterSeeder Phase 1 skipped: core roles missing in DB");
                return null;
            }
            User gvJava = ensureUser(LECTURER_EMAIL, DEFAULT_PASSWORD,
                    "Thầy Hoàng · Giảng Viên Java Microservices", lecturerRole);
            ensureUser(STUDENT_EMAIL, DEFAULT_PASSWORD,
                    "Lê Minh Triết · Sinh Viên SE181979", studentRole);
            ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD,
                    "Quản Trị Viên Hệ Thống MAVIS", adminRole);

            repairPlaceholderHash("hoangnt@fpt.edu.vn", DEFAULT_PASSWORD);
            repairPlaceholderHash("trietlmse181979@fpt.edu.vn", DEFAULT_PASSWORD);
            log.info("JavaCourseMasterSeeder Phase 1 complete: seeded 3 role accounts ({}, {}, {})",
                    LECTURER_EMAIL, STUDENT_EMAIL, ADMIN_EMAIL);
            return gvJava;
        } catch (Exception ex) {
            log.warn("JavaCourseMasterSeeder Phase 1 failed to seed accounts: {}", ex.getMessage(), ex);
            return users.findByEmail(LECTURER_EMAIL).orElse(null);
        }
    }

    private Workspace ensureJavaWorkspaceAndMembers(User gvJava, User caller) {
        try {
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

            if (!workspace.isCourseMode() || !"ACTIVE".equalsIgnoreCase(workspace.getStatus())) {
                workspace.setCourseMode(true);
                workspace.setStatus("ACTIVE");
                workspace.setMaxStudents(200);
                workspace = workspaces.saveAndFlush(workspace);
            }

            UUID workspaceId = workspace.getId();
            ensureMember(workspaceId, gvJava.getId(), "LECTURER");
            if (caller != null && !caller.getId().equals(gvJava.getId())) {
                ensureMember(workspaceId, caller.getId(), "LECTURER");
            }
            users.findByEmail(STUDENT_EMAIL)
                    .ifPresent(u -> ensureMember(workspaceId, u.getId(), "STUDENT"));
            users.findByEmail("hoangnt@fpt.edu.vn")
                    .ifPresent(u -> ensureMember(workspaceId, u.getId(), "LECTURER"));
            users.findByEmail("trietlmse181979@fpt.edu.vn")
                    .ifPresent(u -> ensureMember(workspaceId, u.getId(), "STUDENT"));

            log.info("JavaCourseMasterSeeder Phase 2 complete: workspace {} ({}) ready",
                    JavaCourseraCatalog.COURSE_CODE, workspaceId);
            return workspace;
        } catch (Exception ex) {
            log.warn("JavaCourseMasterSeeder Phase 2 failed for workspace {}: {}",
                    JavaCourseraCatalog.COURSE_CODE, ex.getMessage(), ex);
            return workspaces.findByCode(JavaCourseraCatalog.COURSE_CODE).orElse(null);
        }
    }

    private void ensureJavaPasskeys(UUID workspaceId) {
        try {
            ensurePasskey(workspaceId, PASSKEY_MAIN,
                    "Mã vào lớp Java Microservices Chính Thức", 365 * 24, 200);
            ensurePasskey(workspaceId, PASSKEY_BACKUP,
                    "Mã dự phòng cho sinh viên thực hành Lab", 180 * 24, 100);
            log.info("JavaCourseMasterSeeder Phase 3 complete: passkeys {} & {} active",
                    PASSKEY_MAIN, PASSKEY_BACKUP);
        } catch (Exception ex) {
            log.warn("JavaCourseMasterSeeder Phase 3 failed to ensure passkeys: {}", ex.getMessage(), ex);
        }
    }

    private void ensureCuratedCourseAndOutline(UUID workspaceId, User actor) {
        Authentication previous = SecurityContextHolder.getContext().getAuthentication();
        try {
            var auth = new UsernamePasswordAuthenticationToken(
                    actor.getId().toString(), null, List.of(new SimpleGrantedAuthority("ROLE_LECTURER")));
            SecurityContextHolder.getContext().setAuthentication(auth);
            seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_JAVA_COURSERA);
            log.info("JavaCourseMasterSeeder Phase 4 complete: Java Coursera 6-module outline & labs ready for {}", workspaceId);
        } catch (Exception ex) {
            log.warn("JavaCourseMasterSeeder Phase 4 failed to seed 6-module curriculum for {}: {}",
                    workspaceId, ex.getMessage(), ex);
        } finally {
            if (previous != null) {
                SecurityContextHolder.getContext().setAuthentication(previous);
            } else {
                SecurityContextHolder.clearContext();
            }
        }
    }

    private User ensureUser(String email, String rawPassword, String fullName, Role role) {
        return users.findByEmail(email).map(existing -> {
            if (!"ACTIVE".equalsIgnoreCase(existing.getStatus())
                    || (existing.getPasswordHash() != null
                    && (existing.getPasswordHash().contains("hashed_pwd")
                    || existing.getPasswordHash().contains("YourHashedPasswordHere")))) {
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
            if (user.getPasswordHash() != null
                    && (user.getPasswordHash().contains("hashed_pwd")
                    || user.getPasswordHash().contains("YourHashedPasswordHere"))) {
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
        AuthorizationRequestCache.evictMembership(workspaceId, userId);
    }

    private void ensurePasskey(UUID workspaceId, String code, String label, int validHours, int maxUses) {
        String digest = HashUtils.sha256Hex(code.getBytes(StandardCharsets.UTF_8));
        List<UUID> existing = jdbc.queryForList(
                "SELECT id FROM course_passkeys WHERE digest = ?", UUID.class, digest);
        if (!existing.isEmpty()) {
            jdbc.update("""
                    UPDATE course_passkeys
                    SET is_active = TRUE, revoked_at = NULL,
                        expires_at = GREATEST(expires_at, ?)
                    WHERE id = ?
                    """, OffsetDateTime.now().plusHours(validHours), existing.getFirst());
            return;
        }
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update("""
                INSERT INTO course_passkeys (id, workspace_id, code, label, digest, expires_at, max_uses, used_count, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, TRUE, ?)
                """, UUID.randomUUID(), workspaceId, code, label, digest, now.plusHours(validHours), maxUses, now);
    }
}
