package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.utils.HashUtils;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.context.WebServerApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "MAVIS_MIGRATION_TEST_JDBC_URL",
        matches = "jdbc:postgresql://127\\.0\\.0\\.1:15438/[a-zA-Z0-9_]+")
class CourseHttpAcceptanceTest {
    private static final String PASSWORD = "Isolated-test-WF01-fixture!";
    @TempDir Path uploadRoot;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper json = new ObjectMapper();
    private String api;

    @Test
    void publishesAndEnrollsWhileIsolatingClassesAndLockedLabs() throws Exception {
        var settings = new MigrationUpgradeTest();
        String name = "mavis_wf01_http_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(settings.adminUrl, settings.user, settings.password);
             var admin = connection.createStatement()) {
            admin.execute("CREATE DATABASE " + name);
            try {
                String url = settings.adminUrl.substring(0, settings.adminUrl.lastIndexOf('/') + 1) + name;
                try (var app = new SpringApplicationBuilder(MavisBootstrapApplication.class).run(
                        "--server.port=0", "--server.address=127.0.0.1",
                        "--spring.datasource.url=" + url, "--spring.datasource.username=" + settings.user,
                        "--spring.datasource.password=" + settings.password,
                        "--spring.flyway.enabled=true", "--mavis.security.dev-bypass-enabled=false",
                        "--mavis.runner.auto-dispatch-enabled=false", "--mavis.storage.upload-dir=" + uploadRoot,
                        "--server.jwt.secret=isolated-WF01-signing-key-used-only-by-test",
                        "--spring.main.banner-mode=off", "--logging.level.root=WARN")) {
                    api = "http://127.0.0.1:" + ((WebServerApplicationContext) app).getWebServer().getPort() + "/api/v1/";
                    var db = app.getBean(JdbcTemplate.class);
                    var encoder = app.getBean(PasswordEncoder.class);
                    String hash = encoder.encode(PASSWORD);
                    checkCourseAndPermissions(db, hash);
                    checkOtpLifecycle(db, hash);
                }
            } finally {
                admin.execute("DROP DATABASE " + name + " WITH (FORCE)");
            }
        }
    }

    private void checkOtpLifecycle(JdbcTemplate db, String passwordHash) throws Exception {
        UUID user = account(db, "verify-learner", "STUDENT", passwordHash);
        String email = "verify-learner@example.invalid";
        db.update("UPDATE users SET status='PENDING_VERIFICATION' WHERE id=?", user);
        db.update("""
                INSERT INTO user_otps(user_id, otp_code, purpose, expiry_time) VALUES
                    (?, '123456', 'EMAIL_VERIFICATION', now() + interval '5 minutes'),
                    (?, '246810', 'EMAIL_VERIFICATION', now() + interval '5 minutes'),
                    (?, '654321', 'EMAIL_VERIFICATION', now() - interval '1 minute'),
                    (?, '789123', 'PASSWORD_RESET', now() + interval '5 minutes')
                """, user, user, user, user);
        send("POST", "auth/login", null, Map.of("email", email, "password", PASSWORD), 403);
        send("POST", "auth/verify-email", null, Map.of("email", email, "otpCode", "654321"), 400);
        send("POST", "auth/verify-email", null, Map.of("email", email, "otpCode", "789123"), 400);
        var verification = Map.of("email", email, "otpCode", "123456");
        assertOneOtpAccepted(db, user, request("POST", "auth/verify-email", null, verification).build(),
                request("POST", "auth/verify-email", null, Map.of("email", email, "otpCode", "246810")).build());
        send("POST", "auth/verify-email", null, verification, 400);
        assertFalse(login("verify-learner").isBlank());

        String newPassword = "Changed-isolated-WF01-password!";
        var reset = request("POST", "auth/reset-password", null,
                Map.of("email", email, "otpCode", "789123", "newPassword", newPassword)).build();
        assertOneOtpAccepted(db, user, reset, reset);
        send("POST", "auth/login", null, Map.of("email", email, "password", PASSWORD), 401);
        send("POST", "auth/login", null, Map.of("email", email, "password", newPassword), 200);
    }

    private void assertOneOtpAccepted(JdbcTemplate db, UUID user, HttpRequest firstRequest,
                                      HttpRequest secondRequest) throws Exception {
        try (var connection = db.getDataSource().getConnection();
             var lock = connection.prepareStatement("SELECT id FROM users WHERE id = ? FOR UPDATE")) {
            connection.setAutoCommit(false);
            lock.setObject(1, user);
            try (var locked = lock.executeQuery()) {
                assertTrue(locked.next());
            }
            var first = http.sendAsync(firstRequest, HttpResponse.BodyHandlers.discarding());
            var second = http.sendAsync(secondRequest, HttpResponse.BodyHandlers.discarding());
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            int waiting;
            do {
                waiting = db.queryForObject("""
                        SELECT count(*) FROM pg_stat_activity
                        WHERE datname = current_database() AND wait_event_type = 'Lock'
                        """, Integer.class);
                if (waiting < 2) Thread.sleep(25);
            } while (waiting < 2 && System.nanoTime() < deadline);
            connection.commit();
            assertEquals(2, waiting, "Both requests must be in flight before releasing the test lock");
            assertEquals(List.of(200, 400), List.of(first.get(15, TimeUnit.SECONDS).statusCode(),
                    second.get(15, TimeUnit.SECONDS).statusCode()).stream().sorted().toList());
        }
    }

    private void checkCourseAndPermissions(JdbcTemplate db, String passwordHash) throws Exception {
        UUID teacher = account(db, "teacher", "LECTURER", passwordHash);
        UUID otherTeacher = account(db, "other-teacher", "LECTURER", passwordHash);
        account(db, "learner", "STUDENT", passwordHash);
        UUID outsider = account(db, "other-learner", "STUDENT", passwordHash);
        account(db, "administrator", "SYSTEM_ADMIN", passwordHash);
        UUID classroom = workspace(db, "Architecture", teacher);
        UUID otherClassroom = workspace(db, "Other architecture", otherTeacher);
        db.update("INSERT INTO workspace_members(workspace_id,user_id,member_role) VALUES (?,?,'STUDENT')",
                otherClassroom, outsider);

        Path zip = uploadRoot.resolve("architecture.zip");
        try (var archive = new ZipOutputStream(Files.newOutputStream(zip))) {
            archive.putNextEntry(new ZipEntry("README.md"));
            archive.write("Course fixture".getBytes(java.nio.charset.StandardCharsets.UTF_8));
            archive.closeEntry();
            archive.putNextEntry(new ZipEntry("src/main/java/example/OrderController.java"));
            archive.write("""
                    package example;
                    import org.springframework.web.bind.annotation.GetMapping;
                    import org.springframework.web.bind.annotation.RestController;
                    @RestController
                    class OrderController {
                        @GetMapping("/orders") String orders() { return "orders"; }
                    }
                    """.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            archive.closeEntry();
        }
        UUID reference = id(db, """
                INSERT INTO projects(workspace_id, owner_id, name, project_type, is_reference_template)
                VALUES (?, ?, 'Reference', 'TEACHER_REFERENCE', true) RETURNING id
                """, classroom, teacher);
        UUID source = id(db, """
                INSERT INTO source_snapshots(project_id,source_type,artifact_hash,storage_path,is_published)
                VALUES (?,'ZIP_UPLOAD',?,?,true) RETURNING id
                """, reference, HashUtils.sha256Hex(zip), zip.toString());
        UUID model = id(db, """
                INSERT INTO model_versions(project_id,source_snapshot_id) VALUES (?,?) RETURNING id
                """, reference, source);
        UUID lab1 = lab(db, classroom, teacher, model, "Lab 1");
        UUID lab2 = lab(db, classroom, teacher, model, "Lab 2");
        String lecturer = login("teacher");
        String foreignLecturer = login("other-teacher");
        String student = login("learner");
        String foreignStudent = login("other-learner");
        String admin = login("administrator");
        String workspace = "workspaces/" + classroom;
        String publish = workspace + "/course-labs/";
        String roadmap = workspace + "/course-roadmap";
        String keyPath = workspace + "/course-passkey";

        send("GET", roadmap, null, null, 401);
        send("POST", publish + lab1 + "/publish", foreignLecturer, null, 403);
        send("POST", publish + lab1 + "/publish", student, null, 403);
        assertFalse(data(send("GET", roadmap, lecturer, null, 200)).path("guided").asBoolean());
        assertEquals(1, data(send("POST", publish + lab1 + "/publish", lecturer, null, 200)).path("position").asInt());
        assertEquals(2, data(send("POST", publish + lab2 + "/publish", lecturer, null, 200)).path("position").asInt());
        assertEquals(2, data(send("GET", roadmap, admin, null, 200)).path("labs").size());
        send("GET", roadmap, foreignStudent, null, 403);
        send("GET", roadmap, student, null, 403);
        send("POST", keyPath, foreignLecturer, Map.of("validHours", 1), 403);
        send("POST", keyPath, lecturer, Map.of("validHours", 0), 400);
        var issued = send("POST", keyPath, lecturer, Map.of("validHours", 1), 200);
        assertTrue(issued.headers().firstValue("Cache-Control").orElse("").contains("no-store"));
        String code = data(issued).path("code").asText();
        send("GET", keyPath, student, null, 403);
        send("POST", "course-enrollments/redeem", lecturer, Map.of("code", code), 403);
        send("POST", "course-enrollments/redeem", student, Map.of("code", "A".repeat(22)), 400);
        assertEquals(classroom.toString(), data(send("POST", "course-enrollments/redeem",
                student, Map.of("code", code), 200)).path("workspaceId").asText());
        send("POST", "course-enrollments/redeem", student, Map.of("code", code), 409);
        JsonNode state = data(send("GET", roadmap, student, null, 200));
        assertEquals("ENROLLED", state.path("enrollmentStatus").asText());
        assertEquals(List.of("UNLOCKED", "LOCKED"), List.of(
                state.path("labs").get(0).path("state").asText(),
                state.path("labs").get(1).path("state").asText()));
        checkVersionedQuiz(workspace, lab1, lab2, lecturer, student, foreignStudent);
        UUID workingProject = id(db, """
                INSERT INTO projects(workspace_id, owner_id, assignment_id, reference_snapshot_id, name, project_type)
                SELECT ?, id, ?, ?, 'Quiz gate fixture', 'STUDENT_WORKING' FROM users WHERE email = ? RETURNING id
                """, classroom, lab1, source, "learner@example.invalid");
        UUID workingSource = id(db, """
                INSERT INTO source_snapshots(project_id,source_type,artifact_hash,storage_path)
                SELECT ?, source_type, artifact_hash, storage_path FROM source_snapshots WHERE id = ? RETURNING id
                """, workingProject, source);
        String analysis = "analyzer/snapshots/" + workingSource + "/analyze";
        var denied = request("POST", analysis, foreignStudent, null).header("Idempotency-Key", "wf02-static").build();
        assertEquals(403, http.send(denied, HttpResponse.BodyHandlers.discarding()).statusCode());
        var analyze = request("POST", analysis, student, null).header("Idempotency-Key", "wf02-static").build();
        var accepted = http.send(analyze, HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(202, accepted.statusCode());
        String jobId = data(accepted).path("jobId").asText();
        assertFalse(jobId.isBlank());
        var retry = http.send(analyze, HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(202, retry.statusCode());
        assertEquals(jobId, data(retry).path("jobId").asText());
        JsonNode job = waitForStaticAnalysis(jobId, student);
        assertEquals(workingSource.toString(), job.path("sourceSnapshotId").asText());
        UUID workingModel = UUID.fromString(job.path("modelVersionId").asText());
        String analyzedModel = "analyzer/models/" + workingModel;
        assertEquals("3e-3", data(send("POST", analyzedModel + "/evaluate", student, null, 200))
                .path("ruleSetVersion").asText());
        JsonNode diagrams = data(send("GET", analyzedModel + "/diagrams", student, null, 200));
        var staticTypes = new java.util.HashSet<String>();
        var c4Diagrams = new java.util.ArrayList<UUID>();
        UUID workingDiagram = null;
        for (var diagram : diagrams) {
            String notation = diagram.path("notation").asText();
            String level = diagram.path("level").asText();
            staticTypes.add(notation + "/" + level);
            if ("C4".equals(notation)) c4Diagrams.add(UUID.fromString(diagram.path("id").asText()));
            if ("C4".equals(notation) && "CONTAINER".equals(level)) {
                workingDiagram = UUID.fromString(diagram.path("id").asText());
            }
        }
        assertEquals(java.util.Set.of("DEPENDENCY_GRAPH/SERVICE", "C4/CONTEXT", "C4/CONTAINER", "C4/COMPONENT"), staticTypes);
        assertNotNull(workingDiagram);
        for (String supported : List.of("context", "container", "component", "graph")) {
            send("GET", analyzedModel + "/documents/" + supported, student, null, 200);
        }
        for (String unsupported : List.of("uml-sequence", "uml-activity", "uml-state")) {
            send("GET", analyzedModel + "/documents/" + unsupported, student, null, 400);
        }
        send("POST", analyzedModel + "/diagrams/deployment", student, null, 400);
        String diagramPath = "analyzer/diagrams/" + workingDiagram;
        send("GET", diagramPath + "/export?format=JSON", student, null, 200);
        send("PUT", diagramPath + "/layout", student, Map.of("nodes", List.of()), 400);
        UUID legacyDeployment = id(db, """
                INSERT INTO diagram_versions(model_version_id,notation,level,layout_json)
                VALUES (?,'VIEW_4_PLUS_1','DEPLOYMENT','{}') RETURNING id
                """, workingModel);
        assertEquals(diagrams, data(send("GET", analyzedModel + "/diagrams", student, null, 200)));
        send("GET", "analyzer/diagrams/" + legacyDeployment, student, null, 400);
        send("GET", "analyzer/diagrams/" + legacyDeployment + "/export?format=JSON", student, null, 400);
        send("POST", analyzedModel + "/documents/freeze", student,
                Map.of("diagramVersionIds", List.of(legacyDeployment)), 400);
        db.update("UPDATE assignments SET required_diagram_types = '[\"C4_CONTEXT\",\"C4_CONTAINER\",\"C4_COMPONENT\"]'::jsonb WHERE id = ?", lab1);
        UUID bundle = UUID.fromString(data(send("POST", analyzedModel + "/documents/freeze", student,
                Map.of("diagramVersionIds", c4Diagrams), 200)).asText());
        db.update("UPDATE assignments SET require_runtime_trace = true WHERE id = ?", lab1);
        UUID verifiedRuntime = id(db, """
                INSERT INTO runtime_sessions(project_id, source_snapshot_id, model_version_id, scenario_status,
                                             execution_status, evidence_status, cleanup_status, trace_status,
                                             receipt_digest, runner_receipt_json, publication_gate_status, scenario_config, sandbox_enforcement_confirmed)
                VALUES (?, ?, ?, 'PASSED', 'COMPLETED', 'AVAILABLE', 'CONFIRMED', 'COMPLETE',
                        ?, '{"outcome":{"trace":{"spans":[{"spanId":"00f067aa0ba902b7"}]}},"infrastructureActions":[{"action":"SCALE","service":"orders","replicasBefore":1,"replicasAfter":4,"confirmed":true,"metricsBefore":{"runningReplicas":1},"metricsAfter":{"runningReplicas":4}}]}'::jsonb, 'NONE',
                        '{"infrastructureActions":[{"action":"SCALE","service":"orders","replicas":4}]}'::jsonb, true)
                RETURNING id
                """, workingProject, workingSource, workingModel, "sha256:" + "e".repeat(64));
        checkCurriculum(db, workspace, lab1, lab2, lecturer, student, workingProject,
                Map.of("assignmentId", lab1, "projectId", workingProject,
                        "modelVersionId", workingModel, "diagramVersionId", bundle,
                        "runtimeSessionId", verifiedRuntime,
                        "submissionNotes", "Verified 4-stage C1-C3 static and runtime submission evidence.",
                        "studentSnapshots", List.of(
                                Map.of("snapshotId", "STEP_1_STATIC", "step", "STEP_1_STATIC",
                                        "writtenExplanation", "The gateway routes requests to the order service."),
                                Map.of("snapshotId", "STEP_4_RUNTIME", "step", "STEP_4_RUNTIME",
                                        "writtenExplanation", "Running replicas changed from one to four."))));
        send("GET", "assignments/" + lab2, student, null, 200);
        send("GET", "assignments/" + lab2 + "/reference-source", student, null, 200);
        send("GET", "assignments/" + lab1 + "/reference-source", foreignStudent, null, 403);
        assertArrayEquals(Files.readAllBytes(zip),
                send("GET", "assignments/" + lab1 + "/reference-source", student, null, 200).body());
        db.update("UPDATE course_passkeys SET expires_at = now() - interval '1 minute' WHERE workspace_id = ?", classroom);
        send("POST", "course-enrollments/redeem", foreignStudent, Map.of("code", code), 400);
        send("POST", "auth/logout", student, null, 200);
        send("GET", roadmap, student, null, 401);
    }

    private String login(String user) throws Exception {
        return data(send("POST", "auth/login", null,
                Map.of("email", user + "@example.invalid", "password", PASSWORD), 200)).path("token").asText();
    }

    private JsonNode waitForStaticAnalysis(String jobId, String student) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
        JsonNode job;
        do {
            job = data(send("GET", "analyzer/jobs/" + jobId, student, null, 200));
            String state = job.path("status").asText();
            if ("COMPLETED".equals(state)) return job;
            assertTrue(List.of("PENDING", "RUNNING").contains(state),
                    () -> "Static analysis failed with status " + state);
            Thread.sleep(100);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("Static analysis did not complete before the test deadline");
    }

    private void checkCurriculum(JdbcTemplate db, String workspace, UUID lab1, UUID lab2, String lecturer, String student,
                                 UUID workingProject, Map<String, Object> submission)
            throws Exception {
        send("GET", "course-curriculum", null, null, 401);
        JsonNode catalog = data(send("GET", "course-curriculum", student, null, 200));
        assertEquals(30, catalog.size());
        int javaChapters = 0;
        int csharpChapters = 0;
        var stages = new java.util.HashSet<String>();
        for (JsonNode chapter : catalog) {
            assertFalse(chapter.has("questions"));
            assertFalse(chapter.path("sources").isEmpty());
            stages.add(chapter.path("track").asText() + "/" + chapter.path("phase").asText());
            if ("Java".equals(chapter.path("track").asText())) javaChapters++;
            if ("C#".equals(chapter.path("track").asText())) csharpChapters++;
        }
        assertEquals(18, javaChapters);
        assertEquals(12, csharpChapters);
        assertEquals(java.util.Set.of("Java/foundation", "Java/lab", "Java/advanced",
                "C#/foundation", "C#/lab", "C#/advanced"), stages);
        String quiz = workspace + "/course-labs/" + lab1 + "/quiz";
        var java = Map.of("chapterId", "java-01");
        send("POST", quiz + "/curriculum", student, java, 403);
        send("POST", quiz + "/curriculum", lecturer, Map.of("chapterId", "unknown"), 404);
        int javaVersion = data(send("POST", quiz + "/curriculum", lecturer, java, 200)).path("version").asInt();
        assertEquals(javaVersion, data(send("POST", quiz + "/curriculum", lecturer, java, 200)).path("version").asInt());
        JsonNode javaLesson = data(send("GET", quiz, student, null, 200));
        assertTrue(javaLesson.path("lesson").asText().contains("https://dev.java/learn/"));
        assertEquals(4, javaLesson.path("questions").size());
        assertFalse(javaLesson.path("questions").get(0).has("correctOption"));
        String runtime = "analyzer/runtime/sessions";
        var runtimeRequest = Map.of("projectId", workingProject, "sourceSnapshotId", UUID.randomUUID());
        send("POST", runtime, student, runtimeRequest, 403);
        send("POST", "submissions", student, submission, 403);

        String csharpQuiz = workspace + "/course-labs/" + lab2 + "/quiz";
        var csharp = Map.of("chapterId", "csharp-03");
        send("POST", csharpQuiz + "/curriculum", lecturer, csharp, 200);
        send("GET", csharpQuiz, student, null, 403);
        int csharpVersion = data(send("POST", quiz + "/curriculum", lecturer, csharp, 200)).path("version").asInt();
        assertEquals(javaVersion + 1, csharpVersion);
        JsonNode csharpLesson = data(send("GET", quiz, student, null, 200));
        assertTrue(csharpLesson.path("lesson").asText().contains("https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/"));
        assertEquals(4, csharpLesson.path("questions").size());
        var attempt = Map.of("attemptId", UUID.randomUUID(), "version", csharpVersion, "answers", List.of(1, 0, 2, 1));
        assertEquals("PASSED", data(send("POST", quiz + "/attempts", student, attempt, 200)).path("status").asText());
        send("POST", runtime, student, runtimeRequest, 404);
        db.update("""
                UPDATE evaluation_runs SET summary_metrics = jsonb_set(summary_metrics, '{complianceScore}', '30', true)
                WHERE model_version_id = ?
                """, submission.get("modelVersionId"));
        var incomplete = new java.util.HashMap<>(submission);
        incomplete.remove("runtimeSessionId");
        assertEquals("STEP_4_SIGNED_RUNTIME_RECEIPT", json.readTree(
                send("POST", "submissions", student, incomplete, 400).body()).path("message").asText());
        incomplete.put("runtimeSessionId", submission.get("runtimeSessionId"));
        incomplete.remove("studentSnapshots");
        send("POST", "submissions", student, incomplete, 400);
        var staticEvidence = Map.of("snapshotId", "STEP_1_STATIC", "step", "STEP_1_STATIC",
                "writtenExplanation", "The gateway routes orders.");
        incomplete.put("studentSnapshots", List.of(staticEvidence));
        send("POST", "submissions", student, incomplete, 400);
        incomplete.put("studentSnapshots", List.of(staticEvidence, staticEvidence));
        send("POST", "submissions", student, incomplete, 400);
        incomplete.put("studentSnapshots", List.of(staticEvidence, Map.of(
                "snapshotId", "STEP_4_RUNTIME", "step", "STEP_4_RUNTIME", "writtenExplanation", "   ")));
        send("POST", "submissions", student, incomplete, 400);
        incomplete.put("studentSnapshots", List.of(staticEvidence, Map.of(
                "snapshotId", "unknown", "step", "unknown", "writtenExplanation", "Fake evidence.")));
        send("POST", "submissions", student, incomplete, 400);

        db.update("UPDATE assignments SET require_runtime_trace = false WHERE id = ?", lab1);
        incomplete.remove("runtimeSessionId");
        incomplete.put("studentSnapshots", List.of(staticEvidence));
        JsonNode staticSubmission = data(send("POST", "submissions", student, incomplete, 200));
        assertEquals(1, staticSubmission.path("studentSnapshots").size());
        assertEquals("STEP_1_STATIC", staticSubmission.path("studentSnapshots").get(0).path("snapshotId").asText());
        assertTrue(staticSubmission.path("runtimeSessionId").isNull() || staticSubmission.path("runtimeSessionId").isMissingNode());
        db.update("UPDATE assignments SET require_runtime_trace = true WHERE id = ?", lab1);
        JsonNode saved = data(send("POST", "submissions", student, submission, 200));
        assertTrue(saved.path("evidencePackageDigest").asText().startsWith("sha256:"));
        assertEquals(30.0, saved.path("complianceScore").asDouble());
        assertEquals(2, saved.path("studentSnapshots").size());
        assertEquals(submission.get("modelVersionId").toString(),
                saved.path("studentSnapshots").get(0).path("targetViewOrService").asText());
        assertEquals(submission.get("runtimeSessionId").toString(),
                saved.path("studentSnapshots").get(1).path("targetViewOrService").asText());
        String review = "submissions/" + saved.path("id").asText() + "/review";
        send("PUT", review, lecturer, Map.of("expectedRevision", 0, "status", "GRADED",
                "score", 90, "summary", "Fixture feedback"), 400);
        send("PUT", review, lecturer, Map.of("expectedRevision", 0, "status", "GRADED",
                "summary", "Fixture feedback", "snapshotGrades", List.of(
                        Map.of("snapshotId", "wrong-snapshot", "score", 9))), 400);
        assertEquals("PENDING", data(send("GET", review, student, null, 200)).path("status").asText());
        JsonNode frozen = saved.path("courseQuizEvidence");
        assertEquals(attempt.get("attemptId").toString(), frozen.path("attemptId").asText());
        assertEquals(csharpVersion, frozen.path("quizVersion").asInt());
        assertFalse(frozen.has("answers"));
        var staticGrade = Map.of("snapshotId", "STEP_1_STATIC", "score", new java.math.BigDecimal("9.00"));
        var borderline = Map.of("snapshotId", "STEP_4_RUNTIME", "score", new java.math.BigDecimal("5.00"));
        var passedGrade = Map.of("snapshotId", "STEP_4_RUNTIME", "score", new java.math.BigDecimal("5.01"));
        send("PUT", review, lecturer, Map.of("expectedRevision", 0, "status", "DRAFT",
                "summary", "Draft", "snapshotGrades", List.of(Map.of("snapshotId", "wrong-snapshot", "score", 9))), 400);
        send("PUT", review, lecturer, Map.of("expectedRevision", 0, "status", "DRAFT",
                "summary", "Draft", "snapshotGrades", List.of(staticGrade)), 200);
        JsonNode draft = data(send("GET", review, lecturer, null, 200));
        assertEquals("DRAFT", draft.path("status").asText());
        assertEquals(1, draft.path("snapshotGrades").size());
        assertEquals(9.0, draft.path("snapshotGrades").get(0).path("score").asDouble());
        assertFalse(draft.hasNonNull("score"));
        assertEquals("PENDING", data(send("GET", review, student, null, 200)).path("status").asText());
        JsonNode failedReview = data(send("PUT", review, lecturer, Map.of("expectedRevision", 1, "status", "GRADED",
                "score", 99,
                "summary", "Explain the measured impact.", "snapshotGrades", List.of(staticGrade, borderline)), 200));
        assertEquals("NEEDS_REVISION", failedReview.path("labOutcome").asText());
        assertEquals(70.0, failedReview.path("score").asDouble());
        send("GET", "assignments/" + lab2, student, null, 403);
        var replacement = new java.util.HashMap<>(submission);
        replacement.put("submissionNotes", "Revised observations after lecturer feedback.");
        JsonNode resubmitted = data(send("POST", "submissions", student, replacement, 200));
        assertNotEquals(saved.path("id"), resubmitted.path("id"));
        assertNotEquals(saved.path("evidencePackageDigest"), resubmitted.path("evidencePackageDigest"));
        String revisedReview = "submissions/" + resubmitted.path("id").asText() + "/review";
        var gradeRequest = Map.of("expectedRevision", 0, "status", "GRADED",
                "summary", "Verified runtime and architecture.", "snapshotGrades", List.of(staticGrade, passedGrade));
        send("PUT", revisedReview, student, gradeRequest, 403);
        send("PUT", review, lecturer, Map.of("expectedRevision", 2, "status", "GRADED",
                "summary", "Older submission.", "snapshotGrades", List.of(staticGrade, passedGrade)), 409);
        var publication = request("PUT", revisedReview, lecturer, gradeRequest).build();
        var first = http.sendAsync(publication, HttpResponse.BodyHandlers.ofByteArray());
        var second = http.sendAsync(publication, HttpResponse.BodyHandlers.ofByteArray());
        var outcomes = List.of(first.get(15, TimeUnit.SECONDS).statusCode(), second.get(15, TimeUnit.SECONDS).statusCode());
        assertTrue(outcomes.containsAll(List.of(200, 409)), outcomes.toString());
        assertEquals("PASSED", data(send("GET", revisedReview, student, null, 200)).path("labOutcome").asText());
        send("PUT", revisedReview, lecturer, Map.of("expectedRevision", 1, "status", "RETURNED",
                "summary", "Cannot retract a completed result."), 409);
        var resultCountBeforeRetry = db.queryForObject(
                "SELECT count(*) FROM submission_snapshots WHERE assignment_id = ? AND submitted_by = ?",
                Integer.class, lab1, UUID.fromString(saved.path("submittedById").asText()));
        assertEquals("LAB_SUBMISSION_ALREADY_PASSED", json.readTree(
                send("POST", "submissions", student, replacement, 409).body()).path("message").asText());
        assertEquals(resultCountBeforeRetry, db.queryForObject(
                "SELECT count(*) FROM submission_snapshots WHERE assignment_id = ? AND submitted_by = ?",
                Integer.class, lab1, UUID.fromString(saved.path("submittedById").asText())));

        send("GET", "assignments/" + lab2, student, null, 200);
        assertEquals(1, db.queryForObject("""
                SELECT count(*) FROM user_notifications WHERE event_key = ? AND recipient_id = ?
                """, Integer.class, "course-lab-unlocked:" + lab2, UUID.fromString(saved.path("submittedById").asText())));
        assertEquals("NEEDS_REVISION", data(send("GET", review, student, null, 200)).path("labOutcome").asText());

        send("POST", quiz + "/curriculum", lecturer, java, 200);
        send("POST", runtime, student, runtimeRequest, 403);
        send("POST", "submissions", student, submission, 409);
        assertEquals(frozen, data(send("GET", "submissions/" + saved.path("id").asText(), lecturer, null, 200))
                .path("courseQuizEvidence"));
    }

    private void checkVersionedQuiz(String workspace, UUID lab1, UUID lab2,
                                    String lecturer, String student, String foreignStudent) throws Exception {
        String quiz = workspace + "/course-labs/" + lab1 + "/quiz";
        String lockedQuiz = workspace + "/course-labs/" + lab2 + "/quiz";
        var definition = Map.of("lesson", "Architecture and service boundaries", "questions", List.of(
                Map.of("prompt", "Which layer owns this boundary?", "options", List.of("API", "Database"), "correctOption", 0),
                Map.of("prompt", "Which service is upstream?", "options", List.of("Inventory", "Orders"), "correctOption", 1)));
        send("GET", quiz, student, null, 404);
        send("POST", quiz, student, definition, 403);
        send("GET", quiz, foreignStudent, null, 403);
        send("GET", lockedQuiz, student, null, 403);
        assertEquals(1, data(send("POST", quiz, lecturer, definition, 200)).path("version").asInt());
        JsonNode publicQuiz = data(send("GET", quiz, student, null, 200));
        assertEquals(70, publicQuiz.path("passPercent").asInt());
        assertFalse(publicQuiz.path("questions").get(0).has("correctOption"));
        var failed = Map.of("attemptId", UUID.randomUUID(), "version", 1, "answers", List.of(0, 0));
        var passed = Map.of("attemptId", UUID.randomUUID(), "version", 1, "answers", List.of(0, 1));
        assertEquals("NEEDS_RETRY", data(send("POST", quiz + "/attempts", student, failed, 200)).path("status").asText());
        var request = request("POST", quiz + "/attempts", student, passed).build();
        var firstResponse = http.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        var repeatedResponse = http.sendAsync(request, HttpResponse.BodyHandlers.ofByteArray());
        var firstReply = firstResponse.get(15, TimeUnit.SECONDS);
        var repeatedReply = repeatedResponse.get(15, TimeUnit.SECONDS);
        assertEquals(200, firstReply.statusCode());
        assertEquals(200, repeatedReply.statusCode());
        JsonNode first = data(firstReply);
        assertEquals("PASSED", first.path("status").asText());
        assertEquals(first, data(repeatedReply));
        assertEquals(first, data(send("POST", quiz + "/attempts", student, passed, 200)));
        send("POST", quiz + "/attempts", student,
                Map.of("attemptId", passed.get("attemptId"), "version", 1, "answers", List.of(1, 1)), 409);
        assertTrue(data(send("GET", quiz, student, null, 200)).path("passed").asBoolean());
        assertEquals(2, data(send("POST", quiz, lecturer, definition, 200)).path("version").asInt());
        send("POST", quiz + "/attempts", student,
                Map.of("attemptId", UUID.randomUUID(), "version", 1, "answers", List.of(0, 1)), 409);
        assertFalse(data(send("GET", quiz, student, null, 200)).path("passed").asBoolean());
    }

    private HttpResponse<byte[]> send(String method, String path, String token, Map<String, ?> body,
                                      int expectedStatus) throws IOException, InterruptedException {
        var response = http.send(request(method, path, token, body).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(expectedStatus, response.statusCode(), () -> method + " " + path);
        return response;
    }

    private HttpRequest.Builder request(String method, String path, String token, Map<String, ?> body) throws IOException {
        var request = HttpRequest.newBuilder(URI.create(api + path)).timeout(Duration.ofSeconds(10));
        if (token != null) request.header("Authorization", "Bearer " + token);
        var data = HttpRequest.BodyPublishers.noBody();
        if (body != null) {
            request.header("Content-Type", "application/json");
            data = HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body));
        }
        return request.method(method, data);
    }

    private JsonNode data(HttpResponse<byte[]> response) throws IOException {
        return json.readTree(response.body()).path("data");
    }

    private UUID account(JdbcTemplate db, String user, String role, String hash) {
        return id(db, """
                INSERT INTO users(role_id,email,password_hash,full_name)
                SELECT id,?,?,? FROM roles WHERE code=? RETURNING id
                """, user + "@example.invalid", hash, user, role);
    }

    private UUID workspace(JdbcTemplate db, String title, UUID owner) {
        return id(db, "INSERT INTO workspaces(name,created_by) VALUES (?,?) RETURNING id", title, owner);
    }

    private UUID lab(JdbcTemplate db, UUID workspace, UUID lecturer, UUID model, String title) {
        return id(db, """
                INSERT INTO assignments(workspace_id,created_by,reference_model_id,title)
                VALUES (?,?,?,?) RETURNING id
                """, workspace, lecturer, model, title);
    }

    private UUID id(JdbcTemplate db, String sql, Object... args) {
        return db.queryForObject(sql, UUID.class, args);
    }
}
