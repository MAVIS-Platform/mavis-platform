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
                    checkCourseAndPermissions(db, encoder.encode(PASSWORD));
                }
            } finally {
                admin.execute("DROP DATABASE " + name + " WITH (FORCE)");
            }
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
        send("GET", "assignments/" + lab2, student, null, 403);
        send("GET", "assignments/" + lab2 + "/reference-source", student, null, 403);
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

    private HttpResponse<byte[]> send(String method, String path, String token, Map<String, ?> body,
                                      int expectedStatus) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(URI.create(api + path)).timeout(Duration.ofSeconds(10));
        if (token != null) request.header("Authorization", "Bearer " + token);
        var data = HttpRequest.BodyPublishers.noBody();
        if (body != null) {
            request.header("Content-Type", "application/json");
            data = HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(body));
        }
        var response = http.send(request.method(method, data).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(expectedStatus, response.statusCode(), () -> method + " " + path);
        return response;
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
