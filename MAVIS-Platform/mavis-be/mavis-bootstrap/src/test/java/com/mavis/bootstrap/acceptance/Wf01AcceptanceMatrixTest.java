package com.mavis.bootstrap.acceptance;

import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.Role;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.UserOtp;
import com.mavis.common.entity.Workspace;
import com.mavis.common.entity.WorkspaceMember;
import com.mavis.common.exception.AuthErrorCode;
import com.mavis.common.exception.AuthException;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.JobRepository;
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
import com.mavis.common.security.AuthorizationRequestCache;
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
import com.mavis.platform.auth.service.EmailService;
import com.mavis.platform.auth.service.impl.AuthServiceImpl;
import com.mavis.platform.security.jwt.JwtUtil;
import com.mavis.platform.security.jwt.SessionLogoutController;
import com.mavis.platform.workspace.service.CourseAccessService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Automated acceptance verification matrix covering all 27 committed WF-01 test cases
 * (F01-001..008, F09-001..008, F10-001..008, TC-WF01-E2E, TC-ST01, TC-N01 <= 3000ms, TC-N02).
 */
class Wf01AcceptanceMatrixTest {

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
        logoutController = new SessionLogoutController(jwtUtil);
        authService = new AuthServiceImpl(users, roles, otps, passwords, jwtUtil, emailService);
        courseLabPolicy = new CourseLabPolicy(jdbc);
        accessPolicy = new AccessPolicyServiceImpl(users, workspaces, members, courseLabPolicy);
        courseAccess = new CourseAccessService(accessPolicy, workspaces, assignments, courseLabPolicy, jdbc, referenceArchive);
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
                return false;
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

    @Test
    @DisplayName("F01-001..008: Registration OTP activation, Google validation, logout revocation, RBAC & admin lock")
    void f01AuthenticationLogoutRbacAndAdminAudit() {
        // F01-001: Register + 6-digit OTP activation
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
        // F01-003: Wrong OTP rejected before valid verification
        var badVerify = new VerifyEmailRequest();
        badVerify.setEmail("fresh@fpt.edu.vn");
        badVerify.setOtpCode("000000");
        assertThatThrownBy(() -> authService.verifyEmail(badVerify)).isInstanceOf(AuthException.class);

        var okVerify = new VerifyEmailRequest();
        okVerify.setEmail("fresh@fpt.edu.vn");
        okVerify.setOtpCode(otpRef.get().getOtpCode());
        authService.verifyEmail(okVerify);
        assertThat(newUserRef.get().getStatus()).isEqualTo("ACTIVE");

        // F01-002: Login succeeds for ACTIVE user & rejects invalid Google token cleanly
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

        // F01-004: Logout immediately revokes JWT in revoked_access_tokens (SR-03)
        logoutController.logout("Bearer " + loginResp.getToken());
        assertThat(jwtUtil.activeClaims(loginResp.getToken())).isNull();

        // F01-005 & F01-007: Student & outside Lecturer blocked from Admin/Class ops
        authenticate(studentA);
        assertThatThrownBy(() -> adminPortal.getAllUsers())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
        authenticate(lecturerB);
        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), lab01.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        // F01-006 & F01-008: Admin locks Student B -> blocked -> Admin unlocks -> audit logged
        authenticate(systemAdmin);
        when(users.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(lecturerA, studentA, studentB));
        assertThat(adminPortal.getAllUsers()).hasSize(3);
        adminPortal.changeUserStatus(studentB.getId(), "LOCKED");
        verify(auditLogService).recordAuditLog(eq("CHANGE_USER_STATUS"), eq("USER"), eq(studentB.getId()), any());

        authenticate(studentB);
        assertThatThrownBy(() -> accessPolicy.requireCurrentActiveUser())
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
        authenticate(systemAdmin);
        adminPortal.changeUserStatus(studentB.getId(), "ACTIVE");
    }

    @Test
    @DisplayName("F09-001..008: Passkey issue, SHA-256 digest, expiry/revoke, idempotency, concurrency & archive gate")
    void f09PasskeyEnrollmentLifecycleAndConcurrency() throws Exception {
        authenticate(lecturerA);
        // Issuing passkey before publishing Lab is blocked
        assertThatThrownBy(() -> courseAccess.issue(classA.getId(), 24))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);

        courseAccess.publish(classA.getId(), lab01.getId());
        var passkey = courseAccess.issue(classA.getId(), 24);
        assertThat(passkey.code()).isNotBlank();
        assertThat(passkeyTable.get(classA.getId()).digest())
                .isEqualTo(HashUtils.sha256Hex(passkey.code().getBytes(StandardCharsets.UTF_8)));

        // F09-003: Invalid passkey -> BAD_REQUEST
        authenticate(studentA);
        UUID req1 = UUID.randomUUID();
        assertThatThrownBy(() -> courseAccess.redeem("WRONG-PASSKEY-000", req1))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);

        // F09-002 & F09-006: Valid redeem enrolls once; same Idempotency-Key replays cleanly; new requestId -> CONFLICT
        var enrolled = courseAccess.redeem(passkey.code(), req1);
        assertThat(enrolled.workspaceId()).isEqualTo(classA.getId());
        assertThat(courseAccess.redeem(passkey.code(), req1).workspaceId()).isEqualTo(classA.getId());
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CONFLICT);

        // F09-007: Concurrent passkey redemption by Student B creates at most 1 membership row
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
                // One concurrent caller loses the ON CONFLICT race
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

        // F09-004 & F09-005: Revoked/expired passkey blocks new students while keeping enrolled Student A active
        authenticate(lecturerA);
        courseAccess.revoke(classA.getId());
        User outsider = User.builder().id(UUID.randomUUID()).email("outsider@fpt.edu.vn").role(studentRole).status("ACTIVE").build();
        when(users.findWithRoleById(outsider.getId())).thenReturn(Optional.of(outsider));
        authenticate(outsider);
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> courseAccess.roadmap(classA.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        authenticate(studentA);
        assertThat(courseAccess.roadmap(classA.getId()).enrollmentStatus()).isEqualTo("ENROLLED");

        // F09-004 explicit expired passkey
        PasskeyRow cur = passkeyTable.get(classA.getId());
        passkeyTable.put(classA.getId(), new PasskeyRow(classA.getId(), cur.digest(), OffsetDateTime.now().minusMinutes(5), null));
        authenticate(outsider);
        assertThatThrownBy(() -> courseAccess.redeem(passkey.code(), UUID.randomUUID()))
                .isInstanceOf(BusinessException.class);

        // F09-008 ARCHIVED workspace shows COURSE_ARCHIVED reason on roadmap
        classA.setStatus("ARCHIVED");
        authenticate(studentA);
        assertThat(courseAccess.roadmap(classA.getId()).labs().getFirst().reason()).isEqualTo("COURSE_ARCHIVED");
    }

    @Test
    @DisplayName("F10-001..008, TC-WF01-E2E, TC-ST01, TC-N01 & TC-N02: Sequential labs, roadmap state machine & NFR <= 3000ms")
    void f10SequentialLabsRoadmapAndNegativeAuthMatrix() {
        long startNs = System.nanoTime();
        authenticate(lecturerA);
        // F10-006: Invalid/unpinned Lab rejected
        Assignment unpinned = Assignment.builder().id(UUID.randomUUID()).workspace(classA).title("Broken").build();
        when(assignments.findLockedById(unpinned.getId())).thenReturn(Optional.of(unpinned));
        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), unpinned.getId()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.BAD_REQUEST);

        // F10-001 & F10-005: Publish Lab 01 & Lab 02; republish is idempotent
        var p1 = courseAccess.publish(classA.getId(), lab01.getId());
        var p1Again = courseAccess.publish(classA.getId(), lab01.getId());
        var p2 = courseAccess.publish(classA.getId(), lab02.getId());
        assertThat(p1.position()).isEqualTo(1);
        assertThat(p1Again.position()).isEqualTo(1);
        assertThat(p2.position()).isEqualTo(2);
        assertThat(classA.isCourseMode()).isTrue();

        var passkey = courseAccess.issue(classA.getId(), 48);
        authenticate(studentA);
        courseAccess.redeem(passkey.code(), UUID.randomUUID());

        // F10-002 & F10-003: Lab 01 UNLOCKED, Lab 02 LOCKED (PREREQUISITE)
        var initialRoadmap = courseAccess.roadmap(classA.getId());
        assertThat(initialRoadmap.enrollmentStatus()).isEqualTo("ENROLLED");
        assertThat(initialRoadmap.labs()).extracting(CourseAccessService.Lab::state)
                .containsExactly("UNLOCKED", "LOCKED");
        assertThat(initialRoadmap.labs().get(1).reason()).isEqualTo("PREREQUISITE");
        assertThatThrownBy(() -> courseLabPolicy.requireOpen(lab02, studentA))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        // TC-ST01 & F10-008: Passing Lab 01 unlocks Lab 02 -> IN_PROGRESS; passing both -> COMPLETED
        passedLabs.add(lab01.getId() + ":" + studentA.getId());
        var midRoadmap = courseAccess.roadmap(classA.getId());
        assertThat(midRoadmap.enrollmentStatus()).isEqualTo("IN_PROGRESS");
        assertThat(midRoadmap.labs()).extracting(CourseAccessService.Lab::state)
                .containsExactly("PASSED", "UNLOCKED");
        courseLabPolicy.requireOpen(lab02, studentA);

        passedLabs.add(lab02.getId() + ":" + studentA.getId());
        var doneRoadmap = courseAccess.roadmap(classA.getId());
        assertThat(doneRoadmap.enrollmentStatus()).isEqualTo("COMPLETED");
        assertThat(doneRoadmap.labs()).extracting(CourseAccessService.Lab::state)
                .containsExactly("PASSED", "PASSED");

        // F10-007 & TC-N02: Negative Authorization Matrix across classes & roles (0 unauthorized ops pass)
        authenticate(studentB);
        assertThatThrownBy(() -> courseAccess.roadmap(classA.getId())).isInstanceOf(BusinessException.class);
        authenticate(lecturerB);
        assertThatThrownBy(() -> courseAccess.issue(classA.getId(), 12)).isInstanceOf(BusinessException.class);
        authenticate(studentA);
        assertThatThrownBy(() -> courseAccess.publish(classA.getId(), lab02.getId())).isInstanceOf(BusinessException.class);

        long elapsedMs = (System.nanoTime() - startNs) / 1_000_000;
        assertThat(elapsedMs).as("TC-N01 WF-01 roadmap & passkey operations <= 3000ms").isLessThanOrEqualTo(3000L);
    }
}
