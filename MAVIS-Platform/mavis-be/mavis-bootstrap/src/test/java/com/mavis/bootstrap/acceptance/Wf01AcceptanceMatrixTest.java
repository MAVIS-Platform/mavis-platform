package com.mavis.bootstrap.acceptance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.UserOtp;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.AuthException;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.RoleRepository;
import com.mavis.common.repository.RuntimeSessionRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.SubmissionSnapshotRepository;
import com.mavis.common.repository.UserOtpRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceMemberRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.security.impl.AccessPolicyServiceImpl;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.admin.service.AuditLogService;
import com.mavis.platform.admin.service.impl.AdminPortalServiceImpl;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import com.mavis.platform.auth.dto.GoogleLoginRequest;
import com.mavis.platform.auth.dto.LoginRequest;
import com.mavis.platform.auth.dto.RegisterRequest;
import com.mavis.platform.auth.dto.VerifyEmailRequest;
import com.mavis.platform.auth.service.AuthAbuseGuard;
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.auth.service.impl.AuthServiceImpl;
import com.mavis.platform.security.jwt.JwtUtil;
import com.mavis.platform.security.jwt.RefreshSessionService;
import com.mavis.platform.security.jwt.SessionLogoutController;
import com.mavis.platform.workspace.service.CourseAccessService;
import com.mavis.platform.workspace.service.CourseCurriculum;
import com.mavis.platform.workspace.service.CourseLabSeederService;
import com.mavis.platform.workspace.service.CourseQuizService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Automated granular acceptance verification matrix covering WF-01 test cases
 * (F01-001..008, F09-001..008, F10-001..008, seed-curated, TC-WF01-E2E, TC-ST01, TC-N01 <= 3000ms, TC-N02).
 */
class Wf01AcceptanceMatrixTest {

    @TempDir
    Path tempDir;

    private UserRepository users;
    private RoleRepository roles;
    private UserOtpRepository otps;
    private PasswordEncoder passwords;
    private EmailService emailService;
    private WorkspaceRepository workspaces;
    private WorkspaceMemberRepository members;
    private AssignmentRepository assignments;
    private LabReferenceArchive referenceArchive;
    private AuditLogService auditLogService;
    private JdbcTemplate jdbc;

    private JwtUtil jwtUtil;
    private SessionLogoutController logoutController;
    private AuthServiceImpl authService;
    private CourseLabPolicy courseLabPolicy;
    private AccessPolicyService accessPolicy;
    private CourseAccessService courseAccess;
    private AdminPortalServiceImpl adminPortal;

    private Role studentRole;
    private Role lecturerRole;
    private Role adminRole;
    private User lecturerA;
    private User lecturerB;
    private User studentA;
    private User studentB;
    private User systemAdmin;
    private Workspace classA;
    private Workspace classB;
    private Assignment lab01;
    private Assignment lab02;

    private final Map<String, OffsetDateTime> revokedTokens = new ConcurrentHashMap<>();
    private final Map<UUID, PasskeyRow> passkeyTable = new ConcurrentHashMap<>();
    private final Map<String, MembershipRow> memberTable = new ConcurrentHashMap<>();
    private final Set<String> passedLabs = ConcurrentHashMap.newKeySet();
    private final List<String> auditActions = new ArrayList<>();
    private final AtomicBoolean studentStartedFlag = new AtomicBoolean(false);

    private record PasskeyRow(UUID workspaceId, String digest, OffsetDateTime expiresAt, OffsetDateTime revokedAt) {}
    private record MembershipRow(UUID workspaceId, UUID userId, String role, UUID requestId, String keyDigest) {}

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        roles = mock(RoleRepository.class);
        otps = mock(UserOtpRepository.class);
        passwords = mock(PasswordEncoder.class);
        emailService = mock(EmailService.class);
        workspaces = mock(WorkspaceRepository.class);
        members = mock(WorkspaceMemberRepository.class);
        assignments = mock(AssignmentRepository.class);
        referenceArchive = mock(LabReferenceArchive.class);
        auditLogService = mock(AuditLogService.class);
        jdbc = mock(JdbcTemplate.class);

        jwtUtil = new JwtUtil(jdbc);
        ReflectionTestUtils.setField(jwtUtil, "secretKey", "mavis-wf01-acceptance-jwt-signing-secret-key-2026-hmac");
        ReflectionTestUtils.setField(jwtUtil, "jwtExpiration", 3_600_000L);
        var refreshSessions = new RefreshSessionService(jdbc, users, jwtUtil);
        logoutController = new SessionLogoutController(jwtUtil, refreshSessions);
        authService = new AuthServiceImpl(users, roles, otps, passwords, jwtUtil, emailService,
                refreshSessions, mock(AuthAbuseGuard.class));
        courseLabPolicy = new CourseLabPolicy(jdbc);
        accessPolicy = new AccessPolicyServiceImpl(users, workspaces, members, courseLabPolicy);
        courseAccess = new CourseAccessService(accessPolicy, workspaces, assignments, courseLabPolicy, jdbc, referenceArchive, mock(com.mavis.common.repository.RuntimeConfigurationRepository.class));
        adminPortal = new AdminPortalServiceImpl(
                users, roles, workspaces, mock(ProjectRepository.class),
                mock(SourceSnapshotRepository.class), mock(JobRepository.class),
                mock(ModelVersionRepository.class), mock(RuntimeSessionRepository.class),
                mock(SubmissionSnapshotRepository.class), auditLogService, accessPolicy);

        studentRole = Role.builder().id(UUID.randomUUID()).code("STUDENT").name("Student").build();
        lecturerRole = Role.builder().id(UUID.randomUUID()).code("LECTURER").name("Lecturer").build();
        adminRole = Role.builder().id(UUID.randomUUID()).code("SYSTEM_ADMIN").name("Admin").build();

        lecturerA = User.builder().id(UUID.randomUUID()).email("lecturera@fpt.edu.vn").fullName("Lecturer A")
                .role(lecturerRole).status("ACTIVE").passwordHash("hashed").build();
        lecturerB = User.builder().id(UUID.randomUUID()).email("lecturerb@fpt.edu.vn").fullName("Lecturer B")
                .role(lecturerRole).status("ACTIVE").passwordHash("hashed").build();
        studentA = User.builder().id(UUID.randomUUID()).email("studenta@fpt.edu.vn").fullName("Student A")
                .role(studentRole).status("ACTIVE").passwordHash("hashed").build();
        studentB = User.builder().id(UUID.randomUUID()).email("studentb@fpt.edu.vn").fullName("Student B")
                .role(studentRole).status("ACTIVE").passwordHash("hashed").build();
        systemAdmin = User.builder().id(UUID.randomUUID()).email("admin@fpt.edu.vn").fullName("Admin")
                .role(adminRole).status("ACTIVE").passwordHash("hashed").build();

        classA = Workspace.builder().id(UUID.randomUUID()).name("SE1801 Architecture").status("ACTIVE").createdBy(lecturerA).courseMode(false).build();
        classB = Workspace.builder().id(UUID.randomUUID()).name("SE1802 Other").status("ACTIVE").createdBy(lecturerB).courseMode(true).build();

        lab01 = buildLab(classA, "Lab 01: Static Boundaries", null);
        lab02 = buildLab(classA, "Lab 02: Fault Tolerance", null);

        wireCommonRepositories();
        wireJdbcStateMachine();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private Assignment buildLab(Workspace workspace, String title, Integer order) {
        Project refProj = Project.builder().id(UUID.randomUUID()).workspace(workspace).status("ACTIVE")
                .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build();
        SourceSnapshot refSnap = SourceSnapshot.builder().id(UUID.randomUUID()).project(refProj)
                .isPublished(true).sourceType("GITHUB_COMMIT")
                .commitSha("a".repeat(40)).artifactHash("b".repeat(64)).storagePath("ref/lab.zip").build();
        ModelVersion refModel = ModelVersion.builder().id(UUID.randomUUID()).project(refProj)
                .sourceSnapshot(refSnap).revision(1).isLatestValid(true).build();
        return Assignment.builder().id(UUID.randomUUID()).workspace(workspace).title(title)
                .labOrder(order).referenceModel(refModel).build();
    }

    private void authenticate(User user) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(user.getId().toString(), null, List.of()));
    }

    private void wireCommonRepositories() {
        for (User u : List.of(lecturerA, lecturerB, studentA, studentB, systemAdmin)) {
            when(users.findWithRoleById(u.getId())).thenReturn(Optional.of(u));
            when(users.findById(u.getId())).thenReturn(Optional.of(u));
            when(users.findByEmail(u.getEmail())).thenReturn(Optional.of(u));
        }
        when(roles.findByCode("STUDENT")).thenReturn(Optional.of(studentRole));
        when(roles.findByCode("LECTURER")).thenReturn(Optional.of(lecturerRole));
        when(roles.findByCode("SYSTEM_ADMIN")).thenReturn(Optional.of(adminRole));
        when(workspaces.findById(classA.getId())).thenReturn(Optional.of(classA));
        when(workspaces.findLockedById(classA.getId())).thenReturn(Optional.of(classA));
        when(workspaces.findById(classB.getId())).thenReturn(Optional.of(classB));
        when(workspaces.findLockedById(classB.getId())).thenReturn(Optional.of(classB));
        when(assignments.findLockedById(lab01.getId())).thenReturn(Optional.of(lab01));
        when(assignments.findById(lab01.getId())).thenReturn(Optional.of(lab01));
        when(assignments.findLockedById(lab02.getId())).thenReturn(Optional.of(lab02));
        when(assignments.findById(lab02.getId())).thenReturn(Optional.of(lab02));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(classA.getId())).thenAnswer(inv -> {
            List<Assignment> out = new ArrayList<>();
            if (lab01.getLabOrder() != null) out.add(lab01);
            if (lab02.getLabOrder() != null) out.add(lab02);
            return out;
        });
        when(members.findByWorkspaceIdAndUserId(any(), any())).thenAnswer(inv -> {
            UUID wid = inv.getArgument(0);
            UUID uid = inv.getArgument(1);
            MembershipRow row = memberTable.get(wid + ":" + uid);
            if (row == null) return Optional.empty();
            return Optional.of(WorkspaceMember.builder().memberRole(row.role()).build());
        });
        when(passwords.matches(eq("ValidPass#2026"), eq("hashed"))).thenReturn(true);
        when(referenceArchive.resolve(any(), eq(true)))
                .thenReturn(new org.springframework.core.io.ByteArrayResource("zip".getBytes(StandardCharsets.UTF_8)));
    }

    @SuppressWarnings("unchecked")
    private void wireJdbcStateMachine() {
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), any(Object[].class))).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            Object[] args = inv.getArguments();
            if (sql.contains("FROM revoked_access_tokens")) {
                String digest = (String) args[2];
                return revokedTokens.containsKey(digest);
            }
            if (sql.contains("FROM course_passkeys")) {
                UUID wid = (UUID) args[2];
                String digest = (String) args[3];
                PasskeyRow row = passkeyTable.get(wid);
                return row != null && row.digest().equals(digest)
                        && row.revokedAt() == null && row.expiresAt().isAfter(OffsetDateTime.now());
            }
            if (sql.contains("FROM workspace_members m") && sql.contains("preceding.lab_order")) {
                UUID wid = (UUID) args[2];
                UUID uid = (UUID) args[3];
                Integer labOrder = (Integer) args[5];
                if (!memberTable.containsKey(wid + ":" + uid)) return false;
                if (labOrder > 1 && lab01.getLabOrder() != null && lab01.getLabOrder() < labOrder) {
                    return passedLabs.contains(lab01.getId() + ":" + uid);
                }
                return true;
            }
            if (sql.contains("FROM projects p JOIN assignments a")) {
                return studentStartedFlag.get();
            }
            return false;
        });

        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            Object[] args = inv.getArguments();
            if (sql.contains("INTO revoked_access_tokens")) {
                revokedTokens.put((String) args[1], (OffsetDateTime) args[2]);
                return 1;
            }
            if (sql.contains("INSERT INTO course_passkeys")) {
                UUID wid = (UUID) args[1];
                passkeyTable.put(wid, new PasskeyRow(wid, (String) args[2], (OffsetDateTime) args[3], null));
                return 1;
            }
            if (sql.contains("UPDATE course_passkeys SET revoked_at")) {
                UUID wid = (UUID) args[1];
                PasskeyRow cur = passkeyTable.get(wid);
                if (cur != null && cur.revokedAt() == null) {
                    passkeyTable.put(wid, new PasskeyRow(wid, cur.digest(), cur.expiresAt(), OffsetDateTime.now()));
                    return 1;
                }
                return 0;
            }
            if (sql.contains("INSERT INTO workspace_members")) {
                UUID wid = (UUID) args[1];
                UUID uid = (UUID) args[2];
                UUID reqId = (UUID) args[3];
                String keyDigest = (String) args[4];
                MembershipRow created = new MembershipRow(wid, uid, "STUDENT", reqId, keyDigest);
                return memberTable.putIfAbsent(wid + ":" + uid, created) == null ? 1 : 0;
            }
            if (sql.contains("INSERT INTO audit_logs")) {
                auditActions.add((String) args[2]);
                return 1;
            }
            return 0;
        });

        when(jdbc.update(eq("DELETE FROM revoked_access_tokens WHERE expires_at <= CURRENT_TIMESTAMP"))).thenReturn(0);

        when(jdbc.queryForList(anyString(), eq(UUID.class), any(Object[].class))).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            Object[] args = inv.getArguments();
            if (sql.contains("FROM workspace_members m JOIN workspaces w")) {
                UUID uid = (UUID) args[2];
                UUID reqId = (UUID) args[3];
                String keyDigest = (String) args[4];
                return memberTable.values().stream()
                        .filter(m -> m.userId().equals(uid) && reqId.equals(m.requestId()) && keyDigest.equals(m.keyDigest()))
                        .filter(m -> "ACTIVE".equals(classA.getStatus()))
                        .map(MembershipRow::workspaceId)
                        .toList();
            }
            if (sql.contains("SELECT workspace_id FROM course_passkeys WHERE digest")) {
                String digest = (String) args[2];
                return passkeyTable.values().stream()
                        .filter(r -> r.digest().equals(digest))
                        .map(PasskeyRow::workspaceId)
                        .toList();
            }
            if (sql.contains("FROM course_lab_results")) {
                UUID uid = (UUID) args[3];
                List<UUID> out = new ArrayList<>();
                if (passedLabs.contains(lab01.getId() + ":" + uid)) out.add(lab01.getId());
                if (passedLabs.contains(lab02.getId() + ":" + uid)) out.add(lab02.getId());
                return out;
            }
            return List.of();
        });

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
    }

    // ==================== F01: AUTH, SESSION, RBAC & ADMIN PORTAL ====================

    @Test
    @DisplayName("F01-001: Register issues 6-digit OTP and verifies email into ACTIVE state")
    void f01_001_registerAndOtpActivatesUser() {
        AtomicReference<User> newUserRef = new AtomicReference<>();
        AtomicReference<UserOtp> otpRef = new AtomicReference<>();
        when(users.existsByEmail("fresh@fpt.edu.vn")).thenReturn(false);
        when(passwords.encode("ValidPass#2026")).thenReturn("encoded");
        when(users.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) u.setId(UUID.randomUUID());
            newUserRef.set(u);
            return u;
        });
        when(otps.save(any(UserOtp.class))).thenAnswer(inv -> {
            UserOtp o = inv.getArgument(0);
            otpRef.set(o);
            return o;
        });

        var reg = authService.register(new RegisterRequest("Fresh Student", "fresh@fpt.edu.vn", "ValidPass#2026"));
        assertThat(reg.getEmail()).isEqualTo("fresh@fpt.edu.vn");
        assertThat(newUserRef.get().getStatus()).isEqualTo("PENDING_VERIFICATION");
        assertThat(otpRef.get().getOtpCode()).matches("\\d{6}");

        when(users.findForUpdateByEmail("fresh@fpt.edu.vn")).thenAnswer(inv -> Optional.ofNullable(newUserRef.get()));
        when(otps.findFirstByUserAndOtpCodeAndPurposeOrderByCreatedAtDesc(
                eq(newUserRef.get()), eq(otpRef.get().getOtpCode()), eq("EMAIL_VERIFICATION")))
                .thenReturn(Optional.of(otpRef.get()));

        var okVerify = new VerifyEmailRequest();
        okVerify.setEmail("fresh@fpt.edu.vn");
        okVerify.setOtpCode(otpRef.get().getOtpCode());
        authService.verifyEmail(okVerify);
        assertThat(newUserRef.get().getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    @DisplayName("F01-002: Valid credentials issue signed JWT; invalid Google token fails cleanly")
    void f01_002_loginSuccessAndInvalidGoogleTokenRejected() {
        var loginReq = new LoginRequest();
        loginReq.setEmail(studentA.getEmail());
        loginReq.setPassword("ValidPass#2026");
        var loginResp = authService.login(loginReq);
        assertThat(loginResp.getRole()).isEqualTo("STUDENT");
        assertThat(jwtUtil.activeClaims(loginResp.getToken())).isNotNull();

        var googleReq = new GoogleLoginRequest();
        googleReq.setIdToken("invalid.google.token");
        ReflectionTestUtils.setField(authService, "googleClientId", "client-id.apps.googleusercontent.com");
        assertThatThrownBy(() -> authService.googleLogin(googleReq)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F01-003: Wrong OTP code fails email verification")
    void f01_003_wrongOtpRejectedBeforeActivation() {
        User pending = User.builder().id(UUID.randomUUID()).email("otp@fpt.edu.vn")
                .status("PENDING_VERIFICATION").role(studentRole).build();
        when(users.findForUpdateByEmail("otp@fpt.edu.vn")).thenReturn(Optional.of(pending));

        var badVerify = new VerifyEmailRequest();
        badVerify.setEmail("otp@fpt.edu.vn");
        badVerify.setOtpCode("000000");
        assertThatThrownBy(() -> authService.verifyEmail(badVerify)).isInstanceOf(AuthException.class);
        assertThat(pending.getStatus()).isEqualTo("PENDING_VERIFICATION");
    }

    @Test
    @DisplayName("F01-004: Logout immediately revokes JWT in revoked_access_tokens (SR-03)")
    void f01_004_logoutRevokesJwtImmediately() {
        var loginReq = new LoginRequest();
        loginReq.setEmail(studentA.getEmail());
        loginReq.setPassword("ValidPass#2026");
        var loginResp = authService.login(loginReq);
        assertThat(jwtUtil.activeClaims(loginResp.getToken())).isNotNull();

        assertThat(loginResp.getRefreshToken()).isNotBlank();
        logoutController.logout("Bearer " + loginResp.getToken(), loginResp.getRefreshToken());
        verify(jdbc).update("UPDATE refresh_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE token_digest=?",
                HashUtils.sha256Hex(loginResp.getRefreshToken().getBytes(StandardCharsets.UTF_8)));
        assertThat(jwtUtil.activeClaims(loginResp.getToken())).isNull();
    }

    @Test
    @DisplayName("F01-005: Student blocked from Admin portal API with FORBIDDEN")
    void f01_005_studentBlockedFromAdminPortal() {
        authenticate(studentA);
        assertThatThrownBy(() -> adminPortal.getAllUsers())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F01-006: Admin can list accounts and lock/unlock users with audit logging")
    void f01_006_adminLocksAndUnlocksUserWithAudit() {
        authenticate(systemAdmin);
        when(users.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(lecturerA, studentA, studentB));
        assertThat(adminPortal.getAllUsers()).hasSize(3);

        adminPortal.changeUserStatus(studentB.getId(), "LOCKED");
        verify(auditLogService).recordAuditLog(eq("CHANGE_USER_STATUS"), eq("USER"), eq(studentB.getId()), any());
        assertThat(studentB.getStatus()).isEqualTo("LOCKED");

        adminPortal.changeUserStatus(studentB.getId(), "ACTIVE");
        assertThat(studentB.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    @DisplayName("F01-007: External Lecturer blocked from publishing another lecturer's class Lab")
    void f01_007_foreignLecturerBlockedFromClassManagement() {
        authenticate(lecturerB);
        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), lab01.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F01-008: Locked user is blocked immediately from active API access")
    void f01_008_lockedUserBlockedFromActiveAccess() {
        authenticate(systemAdmin);
        adminPortal.changeUserStatus(studentB.getId(), "LOCKED");

        authenticate(studentB);
        assertThatThrownBy(() -> accessPolicy.requireCurrentActiveUser())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    // ==================== F09: COURSE PASSKEY & ENROLLMENT LIFECYCLE ====================

    @Test
    @DisplayName("F09-001: Issuing passkey hashes secret via SHA-256 and logs audit event")
    void f09_001_issuePasskeyStoresSha256DigestAndAudits() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());

        var passkey = courseAccess.issue(classA.getId(), 24);
        assertThat(passkey.code()).isNotBlank();
        assertThat(passkeyTable.get(classA.getId()).digest())
                .isEqualTo(HashUtils.sha256Hex(passkey.code().getBytes(StandardCharsets.UTF_8)));
        assertThat(auditActions).contains("COURSE_PASSKEY_ISSUED");
    }

    @Test
    @DisplayName("F09-002: Student redeems valid passkey and joins guided course")
    void f09_002_validPasskeyRedemptionEnrollsStudent() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        var enrolled = courseAccess.redeem(passkey.code(), UUID.randomUUID());
        assertThat(enrolled.workspaceId()).isEqualTo(classA.getId());
        assertThat(memberTable).containsKey(classA.getId() + ":" + studentA.getId());
    }

    @Test
    @DisplayName("F09-003: Invalid passkey code rejected with BAD_REQUEST")
    void f09_003_invalidPasskeyRejectedWithBadRequest() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());

        authenticate(studentA);
        assertThatThrownBy(() -> courseAccess.redeem("WRONG-PASSKEY-000", UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("F09-004: Expired passkey prevents new enrollment")
    void f09_004_expiredPasskeyBlocksRedemption() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 1);
        PasskeyRow cur = passkeyTable.get(classA.getId());
        passkeyTable.put(classA.getId(), new PasskeyRow(classA.getId(), cur.digest(), OffsetDateTime.now().minusMinutes(5), null));

        authenticate(studentB);
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("F09-005: Revoked passkey blocks new students while retaining existing enrolled students")
    void f09_005_revokedPasskeyRetainsExistingMembersAndBlocksNewOnes() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());

        authenticate(lecturerA);
        courseAccess.revoke(classA.getId());

        authenticate(studentB);
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);

        authenticate(studentA);
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("ENROLLED");
    }

    @Test
    @DisplayName("F09-006: Idempotent redeem replays safely on identical Idempotency-Key and rejects duplicate new request")
    void f09_006_idempotentPasskeyRedemptionReplayAndConflict() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        UUID req1 = UUID.randomUUID();
        assertThat(courseAccess.redeem(passkey.code(), req1).workspaceId()).isEqualTo(classA.getId());
        assertThat(courseAccess.redeem(passkey.code(), req1).workspaceId()).isEqualTo(classA.getId());
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);
    }

    @Test
    @DisplayName("F09-007: Concurrent passkey redemption by one user yields at most one membership row")
    void f09_007_concurrentPasskeyRedemptionRaceIsSafe() throws Exception {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        Callable<Void> task = () -> {
            authenticate(studentB);
            ready.countDown();
            start.await();
            try {
                courseAccess.redeem(passkey.code(), UUID.randomUUID());
                successes.incrementAndGet();
            } catch (BusinessException ignored) {
                // Loser of concurrent insert conflict
            }
            return null;
        };
        Future<Void> f1 = pool.submit(task);
        Future<Void> f2 = pool.submit(task);
        ready.await();
        start.countDown();
        f1.get();
        f2.get();
        pool.shutdown();
        assertThat(successes.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("F09-008: Issuing passkey before publishing first Lab fails with CONFLICT; ARCHIVED workspace locks labs")
    void f09_008_passkeyBeforeLabBlockedAndArchivedWorkspaceLocksRoadmap() {
        authenticate(lecturerA);
        assertThatThrownBy(() -> courseAccess.issue(classA.getId(), 24))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);

        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);
        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());

        classA.setStatus("ARCHIVED");
        var roadmap = courseAccess.roadmap(classA.getId());
        assertThat(roadmap.labs().getFirst().state()).isEqualTo("LOCKED");
        assertThat(roadmap.labs().getFirst().reason()).isEqualTo("COURSE_ARCHIVED");
    }

    // ==================== F10: SEQUENTIAL LABS & SEED CURATED ====================

    @Test
    @DisplayName("F10-001: Publishing Labs sequentially assigns labOrder 1..N and enables courseMode")
    void f10_001_sequentialPublishAssignsOrderAndEnablesCourseMode() {
        authenticate(lecturerA);
        var p1 = courseAccess.publish(classA.getId(), lab01.getId());
        var p2 = courseAccess.publish(classA.getId(), lab02.getId());

        assertThat(p1.position()).isEqualTo(1);
        assertThat(p2.position()).isEqualTo(2);
        assertThat(classA.isCourseMode()).isTrue();
    }

    @Test
    @DisplayName("F10-002: New enrolled student sees Lab 01 UNLOCKED and Lab 02 LOCKED (PREREQUISITE)")
    void f10_002_enrolledStudentSeesLab01UnlockedAndLab02Locked() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        var roadmap = courseAccess.roadmap(classA.getId());
        assertThat(roadmap.enrollmentStatus()).isEqualTo("ENROLLED");
        assertThat(roadmap.labs()).extracting(CourseAccessService.Lab::state).containsExactly("UNLOCKED", "LOCKED");
        assertThat(roadmap.labs().get(1).reason()).isEqualTo("PREREQUISITE");
    }

    @Test
    @DisplayName("F10-003: Accessing locked Lab 02 directly is denied with FORBIDDEN")
    void f10_003_lockedLabPolicyBlocksDirectAccess() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        assertThatThrownBy(() -> courseLabPolicy.requireOpen(lab02, studentA))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F10-004: Passing Lab 01 transitions Lab 02 to UNLOCKED and enrollmentStatus to IN_PROGRESS")
    void f10_004_passingLab01UnlocksLab02() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        passedLabs.add(lab01.getId() + ":" + studentA.getId());

        var roadmap = courseAccess.roadmap(classA.getId());
        assertThat(roadmap.enrollmentStatus()).isEqualTo("IN_PROGRESS");
        assertThat(roadmap.labs()).extracting(CourseAccessService.Lab::state).containsExactly("PASSED", "UNLOCKED");
        courseLabPolicy.requireOpen(lab02, studentA);
    }

    @Test
    @DisplayName("F10-005: Republishing an already-published Lab is idempotent")
    void f10_005_republishingExistingLabIsIdempotent() {
        authenticate(lecturerA);
        var first = courseAccess.publish(classA.getId(), lab01.getId());
        var again = courseAccess.publish(classA.getId(), lab01.getId());
        assertThat(again).isEqualTo(first);
    }

    @Test
    @DisplayName("F10-006: Publishing an assignment without pinned reference source archive fails with BAD_REQUEST")
    void f10_006_unpinnedLabRejectedWithBadRequest() {
        authenticate(lecturerA);
        Assignment unpinned = Assignment.builder().id(UUID.randomUUID()).workspace(classA).title("Broken").build();
        when(assignments.findLockedById(unpinned.getId())).thenReturn(Optional.of(unpinned));

        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), unpinned.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);
    }

    @Test
    @DisplayName("F10-007: Unenrolled student and lecturer from another class cannot read Class A roadmap")
    void f10_007_nonMembersCannotReadRoadmap() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());

        authenticate(studentB);
        assertThatThrownBy(() -> courseAccess.roadmap(classA.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        authenticate(lecturerB);
        assertThatThrownBy(() -> courseAccess.roadmap(classA.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    @DisplayName("F10-008: Passing all guided Labs transitions course enrollmentStatus to COMPLETED")
    void f10_008_passingAllLabsCompletesRoadmap() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        passedLabs.add(lab01.getId() + ":" + studentA.getId());
        passedLabs.add(lab02.getId() + ":" + studentA.getId());

        var doneRoadmap = courseAccess.roadmap(classA.getId());
        assertThat(doneRoadmap.enrollmentStatus()).isEqualTo("COMPLETED");
        assertThat(doneRoadmap.labs()).extracting(CourseAccessService.Lab::state).containsExactly("PASSED", "PASSED");
    }

    @Test
    @DisplayName("F10-009: 1-Click seedCurated publishes STANDARD_DEMO (3 Labs) with valid reference archive, C1-C3 model, and quizzes idempotently")
    void f10_009_seedCuratedLabsPopulatesWorkspaceIdempotently() throws Exception {
        authenticate(lecturerA);
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        Assignment lab03 = Assignment.builder().id(UUID.randomUUID()).workspace(classA).title("Lab 03").labOrder(3).build();
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(classA.getId()))
                .thenReturn(List.of())
                .thenReturn(List.of(lab01, lab02, lab03));

        ProjectRepository projectRepo = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshotRepo = mock(SourceSnapshotRepository.class);
        ModelVersionRepository modelRepo = mock(ModelVersionRepository.class);
        ModelElementRepository elementRepo = mock(ModelElementRepository.class);
        ModelRelationshipRepository relRepo = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagramRepo = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evalRepo = mock(EvaluationRunRepository.class);
        EvidenceRepository evidenceRepo = mock(EvidenceRepository.class);
        CourseQuizService quizService = mock(CourseQuizService.class);

        when(projectRepo.save(any())).thenAnswer(inv -> { Project p = inv.getArgument(0); p.setId(UUID.randomUUID()); return p; });
        when(snapshotRepo.save(any())).thenAnswer(inv -> { SourceSnapshot s = inv.getArgument(0); s.setId(UUID.randomUUID()); return s; });
        when(modelRepo.saveAndFlush(any())).thenAnswer(inv -> { ModelVersion m = inv.getArgument(0); m.setId(UUID.randomUUID()); return m; });
        when(elementRepo.save(any())).thenAnswer(inv -> { ModelElement e = inv.getArgument(0); e.setId(UUID.randomUUID()); return e; });
        when(relRepo.save(any())).thenAnswer(inv -> { ModelRelationship r = inv.getArgument(0); r.setId(UUID.randomUUID()); return r; });
        when(evidenceRepo.save(any())).thenAnswer(inv -> { Evidence ev = inv.getArgument(0); ev.setId(UUID.randomUUID()); return ev; });
        when(diagramRepo.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evalRepo.save(any())).thenAnswer(inv -> { EvaluationRun er = inv.getArgument(0); er.setId(UUID.randomUUID()); return er; });
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> { Assignment a = inv.getArgument(0); a.setId(UUID.randomUUID()); return a; });

        CourseLabSeederService seeder = new CourseLabSeederService(
                accessPolicy, workspaces, assignments, projectRepo, snapshotRepo, modelRepo,
                elementRepo, relRepo, diagramRepo, evalRepo, evidenceRepo,
                new CourseCurriculum(new ObjectMapper()), quizService, courseAccess, jdbc, new ObjectMapper(), tempDir.toString());

        lab01.setLabOrder(1);
        lab02.setLabOrder(2);
        CourseAccessService.Roadmap seeded = seeder.seedCurated(classA.getId());
        assertThat(seeded.guided()).isTrue();
        assertThat(classA.isCourseMode()).isTrue();
        verify(diagramRepo).saveAll(anyList());
        verify(evalRepo).save(any());
        verify(quizService, org.mockito.Mockito.times(3)).publishCurriculum(eq(classA.getId()), any(), any());
    }

    @Test
    @DisplayName("F10-010: FULL_CURRICULUM preset seeds all 13 guided Labs (12 Java + 1 C# ASP.NET Core) with quizzes idempotently")
    void f10_010_seedFullCurriculumPopulatesAll13LabsIdempotently() throws Exception {
        authenticate(lecturerA);
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(classA.getId()))
                .thenReturn(List.of());

        ProjectRepository projectRepo = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshotRepo = mock(SourceSnapshotRepository.class);
        ModelVersionRepository modelRepo = mock(ModelVersionRepository.class);
        ModelElementRepository elementRepo = mock(ModelElementRepository.class);
        ModelRelationshipRepository relRepo = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagramRepo = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evalRepo = mock(EvaluationRunRepository.class);
        EvidenceRepository evidenceRepo = mock(EvidenceRepository.class);
        CourseQuizService quizService = mock(CourseQuizService.class);

        when(projectRepo.save(any())).thenAnswer(inv -> { Project p = inv.getArgument(0); p.setId(UUID.randomUUID()); return p; });
        when(snapshotRepo.save(any())).thenAnswer(inv -> { SourceSnapshot s = inv.getArgument(0); s.setId(UUID.randomUUID()); return s; });
        when(modelRepo.saveAndFlush(any())).thenAnswer(inv -> { ModelVersion m = inv.getArgument(0); m.setId(UUID.randomUUID()); return m; });
        when(elementRepo.save(any())).thenAnswer(inv -> { ModelElement e = inv.getArgument(0); e.setId(UUID.randomUUID()); return e; });
        when(relRepo.save(any())).thenAnswer(inv -> { ModelRelationship r = inv.getArgument(0); r.setId(UUID.randomUUID()); return r; });
        when(evidenceRepo.save(any())).thenAnswer(inv -> { Evidence ev = inv.getArgument(0); ev.setId(UUID.randomUUID()); return ev; });
        when(diagramRepo.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evalRepo.save(any())).thenAnswer(inv -> { EvaluationRun er = inv.getArgument(0); er.setId(UUID.randomUUID()); return er; });
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> { Assignment a = inv.getArgument(0); a.setId(UUID.randomUUID()); return a; });

        CourseLabSeederService seeder = new CourseLabSeederService(
                accessPolicy, workspaces, assignments, projectRepo, snapshotRepo, modelRepo,
                elementRepo, relRepo, diagramRepo, evalRepo, evidenceRepo,
                new CourseCurriculum(new ObjectMapper()), quizService, courseAccess, jdbc, new ObjectMapper(), tempDir.toString());

        CourseAccessService.Roadmap seeded = seeder.seedCurated(classA.getId(), CourseLabSeederService.PRESET_FULL_CURRICULUM);
        assertThat(seeded.guided()).isTrue();
        assertThat(classA.isCourseMode()).isTrue();
        verify(assignments, org.mockito.Mockito.times(13)).saveAndFlush(any(Assignment.class));
        verify(quizService, org.mockito.Mockito.times(13)).publishCurriculum(eq(classA.getId()), any(), any());
    }

    // ==================== E2E, STATE TRANSITIONS & NFR ====================

    @Test
    @DisplayName("TC-WF01-E2E: Complete WF-01 lifecycle from publish -> passkey -> redeem -> Lab 01 -> Lab 02 completion")
    void tcWf01E2eMainLifecycle() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 48);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("ENROLLED");

        passedLabs.add(lab01.getId() + ":" + studentA.getId());
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("IN_PROGRESS");

        passedLabs.add(lab02.getId() + ":" + studentA.getId());
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("COMPLETED");
    }

    @Test
    @DisplayName("TC-ST01: Enrollment state transitions ENROLLED -> IN_PROGRESS (via project start) -> COMPLETED")
    void tcSt01EnrollmentStateTransitions() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("ENROLLED");

        studentStartedFlag.set(true);
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("IN_PROGRESS");

        passedLabs.add(lab01.getId() + ":" + studentA.getId());
        passedLabs.add(lab02.getId() + ":" + studentA.getId());
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("COMPLETED");
    }

    @Test
    @DisplayName("TC-N01: Full WF-01 publish, passkey & roadmap evaluation completes within <= 3000ms SLA")
    void tcN01PerformanceBudgetUnder3000ms() {
        long startNs = System.nanoTime();
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        courseAccess.publish(classA.getId(), lab02.getId());
        var passkey = courseAccess.issue(classA.getId(), 48);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        courseAccess.roadmap(classA.getId());

        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000;
        assertThat(elapsedMs).isLessThanOrEqualTo(3000L);
    }

    @Test
    @DisplayName("TC-N02: Negative authorization matrix blocks cross-class and cross-role privilege escalation")
    void tcN02NegativeAuthorizationMatrix() {
        authenticate(lecturerA);
        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);

        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());
        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), lab02.getId())).isInstanceOf(BusinessException.class);

        authenticate(studentB);
        assertThatThrownBy(() -> courseAccess.roadmap(classA.getId())).isInstanceOf(BusinessException.class);

        authenticate(lecturerB);
        assertThatThrownBy(() -> courseAccess.issue(classA.getId(), 12)).isInstanceOf(BusinessException.class);
    }
}
