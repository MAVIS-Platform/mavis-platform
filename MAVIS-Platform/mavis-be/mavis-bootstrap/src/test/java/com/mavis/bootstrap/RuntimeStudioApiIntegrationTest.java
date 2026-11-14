package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.util.Map;
import java.util.UUID;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class RuntimeStudioApiIntegrationTest extends ApiIntegrationContext {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired WorkspaceRepository workspaces;
    @Autowired AssignmentRepository assignments;
    @Autowired ProjectRepository projects;
    @Autowired SourceSnapshotRepository snapshots;
    @Autowired ModelVersionRepository models;
    @Autowired ModelElementRepository elements;
    @Autowired ModelRelationshipRepository relationships;
    @Autowired DiagramVersionRepository diagrams;
    @Autowired EvaluationRunRepository evaluations;
    @Autowired RuntimeSessionRepository sessions;
    @Autowired com.mavis.analyzer.runtime.service.RunnerReceiptIngestService receiptIngest;

    @Test void authenticatedOwnerQueuesActionAndRunnerConfirmsBeforeFinishing() throws Exception {
        var role = roles.findByCode("STUDENT").orElseGet(() -> roles.save(Role.builder().code("STUDENT").name("Student").build()));
        var user = users.save(User.builder().email("studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Studio test").role(role).build());
        var project = projects.save(Project.builder().name("Studio API fixture").owner(user).build());
        var snapshot = snapshots.save(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD")
            .artifactHash("a".repeat(64)).storagePath("test-source.zip").build());
        var session = sessions.saveAndFlush(RuntimeSession.builder().project(project).sourceSnapshot(snapshot).triggeredBy(user)
            .executionStatus("RUNNING").resourceProject("mavisrun-" + "a".repeat(32))
            .confirmedServiceMappings(Map.of("orders", UUID.randomUUID().toString()))
            .scenarioConfig(mapper.createObjectNode().put("interactiveStudio",true)).build());
        String url = "/api/v1/analyzer/runtime/sessions/" + session.getId() + "/studio";
        String auth = testAuthorization(user.getEmail());
        var outsider = users.save(User.builder().email("outside-studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Outside student").role(role).build());
        mvc.perform(get(url).header("Authorization",testAuthorization(outsider.getEmail()))).andExpect(status().isForbidden());
        String actionId = UUID.randomUUID().toString();
        String command = mapper.writeValueAsString(Map.of("actionId",actionId,"action","SCALE","service","orders","replicas",4));
        for (int i=0;i<2;i++)
            mvc.perform(post(url+"/actions").header("Authorization",auth).contentType(MediaType.APPLICATION_JSON).content(command))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.actions.length()").value(1));
        mvc.perform(post(url+"/finish").header("Authorization",auth)).andExpect(status().isConflict());
        mvc.perform(get(url+"/commands").param("resourceProject",session.getResourceProject()))
            .andExpect(status().isForbidden());
        mvc.perform(get(url+"/commands").param("resourceProject",session.getResourceProject())
            .header("X-Mavis-Runner-Key","mavis-runner-secret-key-test"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.command.actionId").value(actionId));
        var result = mapper.createObjectNode().put("action","SCALE").put("service","orders").put("confirmed",true)
            .put("replicasBefore",1).put("replicasAfter",4);
        result.putObject("metricsBefore").put("replicas",1);
        result.putObject("metricsAfter").put("replicas",4);
        String ack=mapper.writeValueAsString(Map.of("sessionId",session.getId(),"resourceProject",session.getResourceProject(),
            "actionId",actionId,"status","CONFIRMED","result",result));
        for (int i=0;i<2;i++)
            mvc.perform(post(url+"/ack").header("X-Mavis-Runner-Key","mavis-runner-secret-key-test")
                .contentType(MediaType.APPLICATION_JSON).content(ack)).andExpect(status().isOk());
        var telemetry=mapper.createObjectNode().put("observedAt","2026-11-14T00:00:00Z");
        telemetry.putArray("services");telemetry.putArray("spans");telemetry.putArray("interactions");
        mvc.perform(post(url+"/telemetry").header("X-Mavis-Runner-Key","mavis-runner-secret-key-test")
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of(
                "sessionId",session.getId(),"resourceProject",session.getResourceProject(),"telemetry",telemetry))))
            .andExpect(status().isOk());
        mvc.perform(post(url+"/snapshots").header("Authorization",auth).contentType(MediaType.APPLICATION_JSON)
            .content("{\"explanation\":\"Observed order replica scaling\"}")).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.sourceSnapshotId").value(snapshot.getId().toString()))
            .andExpect(jsonPath("$.data.digest").isString());
        mvc.perform(post(url+"/finish").header("Authorization",auth)).andExpect(status().isOk());
        mvc.perform(get(url).header("Authorization",auth)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.finishRequested").value(true))
            .andExpect(jsonPath("$.data.actions[0].status").value("CONFIRMED"));
    }

    @Test void fullStackCourseLabQuizStudioSnapshotsHmacReceiptSubmissionAndGradingUnlocksNextLab(
            @org.junit.jupiter.api.io.TempDir java.nio.file.Path tempDir) throws Exception {
        String png1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        var studentRole = roles.findByCode("STUDENT").orElseGet(() -> roles.save(Role.builder().code("STUDENT").name("Student").build()));
        var lecturerRole = roles.findByCode("LECTURER").orElseGet(() -> roles.save(Role.builder().code("LECTURER").name("Lecturer").build()));
        var lecturer = users.saveAndFlush(User.builder().email("lecturer-studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Lecturer Studio").role(lecturerRole).build());
        var student = users.saveAndFlush(User.builder().email("student-studio-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Student Studio").role(studentRole).build());
        String lecturerAuth = testAuthorization(lecturer.getEmail());
        String studentAuth = testAuthorization(student.getEmail());

        var uploadRoot = java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads", "studio-test");
        java.nio.file.Files.createDirectories(uploadRoot);
        var composeFile = uploadRoot.resolve("docker-compose-" + UUID.randomUUID() + ".yml");
        java.nio.file.Files.writeString(composeFile, """
                services:
                  orders:
                    image: mavis-poc-orders@sha256:c82d84d84291016906480c09dd016a115a0ad71379ec72bed18fd911e0536923
                    environment:
                      PAYMENT_URL: http://payment:8080
                  payment:
                    image: mavis-poc-payment@sha256:59e83a27ecd7e8184a6f2147db117a31ad09a0faf76e427b9c131a01b545ff96
                """);
        composeFile.toFile().deleteOnExit();
        String artifactHash = com.mavis.common.utils.HashUtils.sha256Hex(composeFile);

        var workspace = workspaces.saveAndFlush(Workspace.builder()
            .name("Microservices Studio Cohort").code("SE18_ST_" + UUID.randomUUID().toString().substring(0, 4))
            .status("ACTIVE").createdBy(lecturer).build());
        var refProject = projects.saveAndFlush(Project.builder()
            .workspace(workspace).owner(lecturer).name("Reference E-Commerce")
            .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build());
        var refSnapshot = snapshots.saveAndFlush(SourceSnapshot.builder()
            .project(refProject).sourceType("ZIP_UPLOAD").artifactHash(artifactHash)
            .storagePath(composeFile.toString()).isPublished(true).build());
        var refModel = models.saveAndFlush(ModelVersion.builder()
            .project(refProject).sourceSnapshot(refSnapshot).revision(1).origin("GENERATED")
            .isLatestValid(true).createdBy(lecturer).build());

        var lab1 = assignments.saveAndFlush(Assignment.builder()
            .workspace(workspace).createdBy(lecturer).referenceModel(refModel)
            .title("Lab 1: Service Resilience & Scaling").requireRuntimeTrace(true).build());
        var lab2 = assignments.saveAndFlush(Assignment.builder()
            .workspace(workspace).createdBy(lecturer).referenceModel(refModel)
            .title("Lab 2: Distributed Tracing Deep Dive").requireRuntimeTrace(true).build());

        String wsPath = "/api/v1/workspaces/" + workspace.getId();
        mvc.perform(post(wsPath + "/course-labs/" + lab1.getId() + "/publish").header("Authorization", lecturerAuth))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.position").value(1));
        mvc.perform(post(wsPath + "/course-labs/" + lab2.getId() + "/publish").header("Authorization", lecturerAuth))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.position").value(2));

        var passkeyRes = mvc.perform(post(wsPath + "/course-passkey").header("Authorization", lecturerAuth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"validHours\":2}"))
            .andExpect(status().isOk()).andReturn();
        String passkey = mapper.readTree(passkeyRes.getResponse().getContentAsString()).path("data").path("code").asText();

        mvc.perform(post("/api/v1/course-enrollments/redeem").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("code", passkey))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.workspaceId").value(workspace.getId().toString()));

        String quizPath = wsPath + "/course-labs/" + lab1.getId() + "/quiz";
        mvc.perform(post(quizPath + "/curriculum").header("Authorization", lecturerAuth)
                .contentType(MediaType.APPLICATION_JSON).content("{\"chapterId\":\"java-f01\"}"))
            .andExpect(status().isOk());
        mvc.perform(post(quizPath + "/attempts").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("attemptId", UUID.randomUUID(), "version", 1, "answers", java.util.List.of(0, 2, 1, 0)))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PASSED"));

        var studentProject = projects.saveAndFlush(Project.builder()
            .workspace(workspace).owner(student).assignment(lab1).referenceSnapshotId(refSnapshot.getId())
            .name("Student Lab 1 Working Project").projectType("STUDENT_WORKING").build());
        var studentSnapshot = snapshots.saveAndFlush(SourceSnapshot.builder()
            .project(studentProject).sourceType("ZIP_UPLOAD").artifactHash(artifactHash)
            .storagePath(composeFile.toString()).build());
        var studentModel = models.saveAndFlush(ModelVersion.builder()
            .project(studentProject).sourceSnapshot(studentSnapshot).revision(1).origin("USER_CONFIRMED")
            .isLatestValid(true).createdBy(student).build());
        var elOrders = elements.saveAndFlush(ModelElement.builder()
            .modelVersion(studentModel).name("orders").elementType("SERVICE_CONTAINER").status("VALIDATED").build());
        var elPayment = elements.saveAndFlush(ModelElement.builder()
            .modelVersion(studentModel).name("payment").elementType("SERVICE_CONTAINER").status("VALIDATED").build());
        relationships.saveAndFlush(ModelRelationship.builder()
            .modelVersion(studentModel).sourceElement(elOrders).targetElement(elPayment)
            .relationType("SERVICE_HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        var diagram = diagrams.saveAndFlush(DiagramVersion.builder()
            .modelVersion(studentModel).notation("C4").level("CONTAINER").layoutJson(mapper.createObjectNode()).build());
        var evalMetrics = mapper.createObjectNode().put("complianceScore", 95.0).put("passedRules", 4).put("failedRules", 0);
        var evalRun = evaluations.saveAndFlush(EvaluationRun.builder()
            .modelVersion(studentModel).ruleSetVersion("3e-3").summaryMetrics(evalMetrics).build());

        var scenarioConfig = mapper.createObjectNode().put("interactiveStudio", true);
        var profile = scenarioConfig.putObject("profile")
            .put("collectorImage", "otel/opentelemetry-collector-contrib@sha256:1175b03003053962012f5a231f5567f66a3e8fdb960c7835c0e48f7aa1555806")
            .put("instrumentationVolume", "mavis-poc-agents-ca65939a")
            .put("memoryMiB", 512).put("cpus", 1).put("timeoutSeconds", 290).put("approvedForLocalPoc", true)
            .put("scenarioRunnerImage", "sha256:404e8ec20021c0efc870ee1d206d54bb19005ce27beb38ad04fe096db40cd06a");
        var apps = profile.putObject("applications");
        apps.putObject("orders").put("runtime", "dotnet8-linux-x64-glibc").put("containerPort", 8080);
        apps.putObject("payment").put("runtime", "java").put("containerPort", 8080);
        var steps = scenarioConfig.putObject("scenario").putArray("steps");
        steps.addObject().put("id", "request").put("service", "orders").put("method", "GET").put("path", "/orders").put("expectedStatus", 200);

        String resourceProject = "mavisrun-" + UUID.randomUUID().toString().replace("-", "");
        var session = sessions.saveAndFlush(RuntimeSession.builder()
            .project(studentProject).sourceSnapshot(studentSnapshot).modelVersion(studentModel).triggeredBy(student)
            .resourceProject(resourceProject).profileVersionId("local-poc-profile/1.0")
            .runConfigurationVersionId("run-config/1.0").scenarioVersionId("scenario/1.0")
            .scenarioConfig(scenarioConfig)
            .confirmedServiceMappings(Map.of("orders", elOrders.getId().toString(), "payment", elPayment.getId().toString()))
            .scenarioStatus("APPROVED").executionStatus("READY_FOR_DISPATCH").build());

        String sessionBase = "/api/v1/analyzer/runtime/sessions/" + session.getId();
        String studioUrl = sessionBase + "/studio";

        // Runner fetches run-definition using ONLY X-Mavis-Runner-Key (no user JWT)
        mvc.perform(get(sessionBase + "/run-definition").header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.interactiveStudio").value(true))
            .andExpect(jsonPath("$.data.resourceProject").value(resourceProject));

        for (String stage : java.util.List.of("ALLOCATED", "RUNNING")) {
            mvc.perform(post(sessionBase + "/lifecycle-ack").header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of("sessionId", session.getId(), "resourceProject", resourceProject, "stage", stage))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.executionStatus").value(stage));
        }

        // Initial telemetry sample & Before Snapshot capture
        var telemetryBefore = mapper.createObjectNode().put("observedAt", "2026-11-14T09:30:00Z");
        telemetryBefore.putArray("services").addObject().put("service", "orders").put("replicas", 1).put("runningReplicas", 1);
        telemetryBefore.putArray("spans").addObject().put("traceId", "4bf92f3577b34da6a3ce929d0e0e4736").put("spanId", "00f067aa0ba902b7").put("runtimeService", "orders");
        telemetryBefore.putArray("interactions");
        mvc.perform(post(studioUrl + "/telemetry").header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("sessionId", session.getId(), "resourceProject", resourceProject, "telemetry", telemetryBefore))))
            .andExpect(status().isOk());

        var snapBeforeRes = mvc.perform(post(studioUrl + "/snapshots").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "explanation", "Baseline before scaling orders service: 1 replica running at p95 42ms.",
                    "imageData", png1x1,
                    "observedAt", "2026-11-14T09:30:00Z"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.digest").isString()).andReturn();
        String snapBeforeId = mapper.readTree(snapBeforeRes.getResponse().getContentAsString()).path("data").path("id").asText();

        // Queue and confirm SCALE action (orders 1 -> 2 replicas) with Before/After workload latency
        UUID scaleActionId = UUID.randomUUID();
        mvc.perform(post(studioUrl + "/actions").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("actionId", scaleActionId, "action", "SCALE", "service", "orders", "replicas", 2))))
            .andExpect(status().isOk());
        mvc.perform(get(studioUrl + "/commands").param("resourceProject", resourceProject)
                .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.command.actionId").value(scaleActionId.toString()));

        var actionResult = mapper.createObjectNode().put("action", "SCALE").put("service", "orders")
            .put("confirmed", true).put("replicasBefore", 1).put("replicasAfter", 2);
        actionResult.putObject("metricsBefore").put("replicas", 1).put("runningReplicas", 1).put("requestCount", 1).put("p95LatencyMs", 42).put("errorRatePercent", 0.0);
        actionResult.putObject("metricsAfter").put("replicas", 2).put("runningReplicas", 2).put("requestCount", 1).put("p95LatencyMs", 19).put("errorRatePercent", 0.0);
        mvc.perform(post(studioUrl + "/ack").header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("sessionId", session.getId(), "resourceProject", resourceProject,
                    "actionId", scaleActionId, "status", "CONFIRMED", "result", actionResult))))
            .andExpect(status().isOk());

        // Post-action telemetry sample & After Snapshot capture
        var telemetryAfter = mapper.createObjectNode().put("observedAt", "2026-11-14T09:30:08Z");
        telemetryAfter.putArray("services").addObject().put("service", "orders").put("replicas", 2).put("runningReplicas", 2);
        telemetryAfter.putArray("spans").addObject().put("traceId", "4bf92f3577b34da6a3ce929d0e0e4736").put("spanId", "5fb397be34d23b7a").put("runtimeService", "payment");
        telemetryAfter.putArray("interactions");
        mvc.perform(post(studioUrl + "/telemetry").header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("sessionId", session.getId(), "resourceProject", resourceProject, "telemetry", telemetryAfter))))
            .andExpect(status().isOk());

        var snapAfterRes = mvc.perform(post(studioUrl + "/snapshots").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                    "explanation", "After scaling orders to 2 replicas: load balanced and p95 latency improved from 42ms to 19ms.",
                    "imageData", png1x1,
                    "observedAt", "2026-11-14T09:30:08Z"))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.digest").isString()).andReturn();
        String snapAfterId = mapper.readTree(snapAfterRes.getResponse().getContentAsString()).path("data").path("id").asText();

        mvc.perform(post(studioUrl + "/finish").header("Authorization", studentAuth)).andExpect(status().isOk());

        // Deliver HMAC-SHA256 signed receipt
        var span1 = com.mavis.analyzer.runtime.dto.RunnerCorrelatedSpanDTO.builder()
            .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("00f067aa0ba902b7")
            .runtimeService("orders").modelServiceId(elOrders.getId().toString()).build();
        var span2 = com.mavis.analyzer.runtime.dto.RunnerCorrelatedSpanDTO.builder()
            .traceId("4bf92f3577b34da6a3ce929d0e0e4736").spanId("5fb397be34d23b7a").parentSpanId("00f067aa0ba902b7")
            .runtimeService("payment").modelServiceId(elPayment.getId().toString()).durationNanoseconds("19000000").httpStatusCode(200).build();
        var trace = com.mavis.analyzer.runtime.dto.RunnerTraceCorrelationDTO.builder()
            .sessionId(session.getId().toString()).modelVersionId(studentModel.getId().toString())
            .spans(java.util.List.of(span1, span2))
            .causalEdges(java.util.List.of(new com.mavis.analyzer.runtime.dto.RunnerCausalEdgeDTO("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", "5fb397be34d23b7a")))
            .warnings(java.util.List.of()).build();
        var infraAction = com.mavis.analyzer.runtime.dto.RuntimeInfrastructureActionDTO.builder()
            .action("SCALE").service("orders").replicasBefore(1).replicasAfter(2).confirmed(true)
            .performedAt("2026-11-14T09:30:05Z")
            .metricsBefore(actionResult.path("metricsBefore")).metricsAfter(actionResult.path("metricsAfter")).build();
        var outcome = com.mavis.analyzer.runtime.dto.RunnerOutcomeDTO.builder()
            .executionStatus("Completed").scenarioStatus("Passed").evidenceStatus("Available").cleanupStatus("Confirmed")
            .traceQuality("CompleteForCapturedData").mappingStatus("Mapped").trace(trace)
            .infrastructureActions(java.util.List.of(infraAction)).build();
        var receiptDto = com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO.builder()
            .sessionId(session.getId().toString()).sourceSnapshotId(studentSnapshot.getId().toString())
            .modelVersionId(studentModel.getId().toString()).profileVersionId("local-poc-profile/1.0")
            .runConfigurationVersionId("run-config/1.0").scenarioVersionId("scenario/1.0")
            .resourceProject(resourceProject).imageSourceCorrespondence("Verified").profileAcceptance("Verified")
            .sandboxEnforcementConfirmed(true).infrastructureActions(java.util.List.of(infraAction)).outcome(outcome).build();

        String receiptBody = mapper.writeValueAsString(receiptDto);
        String canonicalDigest = com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils.computeDigest(mapper.valueToTree(receiptDto));
        var mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec("mavis-runner-secret-key-test".getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
        String hmacSig = "hmac-sha256:" + java.util.HexFormat.of().formatHex(mac.doFinal(canonicalDigest.getBytes(java.nio.charset.StandardCharsets.UTF_8)));

        mvc.perform(post(sessionBase + "/ingest-receipt-ack")
                .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test")
                .header("X-Mavis-Receipt-Signature", hmacSig)
                .contentType(MediaType.APPLICATION_JSON).content(receiptBody))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.persistenceStatus").value("COMMITTED"))
            .andExpect(jsonPath("$.data.receiptDigest").value(canonicalDigest));

        mvc.perform(get(studioUrl + "/receipt").header("Authorization", studentAuth))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.digest").value(canonicalDigest))
            .andExpect(jsonPath("$.data.signature").value(hmacSig));

        // Submit Course Lab 1 with both captured Studio snapshots
        var submitBody = Map.of(
            "assignmentId", lab1.getId(),
            "projectId", studentProject.getId(),
            "modelVersionId", studentModel.getId(),
            "diagramVersionId", diagram.getId(),
            "evaluationRunId", evalRun.getId(),
            "runtimeSessionId", session.getId(),
            "submissionNotes", "Completed 4-stage Lab 1 with Before/After Studio scaling snapshots.",
            "studentSnapshots", java.util.List.of(
                Map.of("snapshotId", "STEP_1_STATIC", "step", "STEP_1_STATIC", "writtenExplanation", "Orders calls Payment.")
            )
        );
        var submitRes = mvc.perform(post("/api/v1/submissions").header("Authorization", studentAuth)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(submitBody)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.evidencePackageDigest").isString())
            .andReturn();
        String submissionId = mapper.readTree(submitRes.getResponse().getContentAsString()).path("data").path("id").asText();

        // The backend adds both server-captured Snapshot IDs after the static explanation.
        var saved = mapper.readTree(submitRes.getResponse().getContentAsString()).path("data").path("studentSnapshots");
        org.junit.jupiter.api.Assertions.assertEquals(3, saved.size());
        org.junit.jupiter.api.Assertions.assertEquals(snapBeforeId, saved.get(1).path("snapshotId").asText());
        org.junit.jupiter.api.Assertions.assertEquals(snapAfterId, saved.get(2).path("snapshotId").asText());

        // Lecturer grades all frozen snapshots (> 5.0) and approves Lab 1 -> unlocks Lab 2
        var reviewBody = Map.of(
            "expectedRevision", 0,
            "status", "GRADED",
            "score", 88.0,
            "summary", "Verified Before/After Studio scaling snapshots and OTel trace correlation.",
            "snapshotGrades", java.util.List.of(
                Map.of("snapshotId", "STEP_1_STATIC", "score", 9.0),
                Map.of("snapshotId", snapBeforeId, "title", "Baseline 1 Replica", "score", 8.5, "comment", "Clear baseline capture"),
                Map.of("snapshotId", snapAfterId, "title", "Scaled 2 Replicas", "score", 9.0, "comment", "Accurate latency comparison")
            )
        );
        mvc.perform(put("/api/v1/submissions/" + submissionId + "/review").header("Authorization", lecturerAuth)
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(reviewBody)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.status").value("GRADED"))
            .andExpect(jsonPath("$.data.labOutcome").value("PASSED"));

        mvc.perform(get("/api/v1/submissions/" + submissionId + "/export").header("Authorization", studentAuth))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.studioEvidence.receiptDigest").value(canonicalDigest))
            .andExpect(jsonPath("$.data.studioEvidence.snapshots.length()").value(2))
            .andExpect(jsonPath("$.data.labOutcome").value("PASSED"));

        mvc.perform(get(wsPath + "/course-roadmap").header("Authorization", studentAuth))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.labs[0].state").value("PASSED"))
            .andExpect(jsonPath("$.data.labs[1].state").value("UNLOCKED"));

        // Verify trusted local outbox recovery (/sync-outbox) compatibility bypass on an interactive Studio session
        org.springframework.test.util.ReflectionTestUtils.setField(receiptIngest, "runnerStateRoot", tempDir.toString());
        String recoveryResource = "mavisrun-" + UUID.randomUUID().toString().replace("-", "");
        var outboxDir = tempDir.resolve("receipts");
        java.nio.file.Files.createDirectories(outboxDir);
        UUID recoveryActionId = UUID.randomUUID();
        var recoveryControl = mapper.createObjectNode().put("finishRequested", true);
        recoveryControl.putArray("actions").addObject().put("actionId", recoveryActionId.toString())
            .put("action", "SCALE").put("service", "orders").put("replicas", 2).put("status", "CONFIRMED");
        var recoverySession = sessions.saveAndFlush(RuntimeSession.builder()
            .project(studentProject).sourceSnapshot(studentSnapshot).modelVersion(studentModel).triggeredBy(student)
            .resourceProject(recoveryResource).profileVersionId("local-poc-profile/1.0")
            .runConfigurationVersionId("run-config/1.0").scenarioVersionId("scenario/1.0")
            .scenarioConfig(scenarioConfig).studioControl(recoveryControl)
            .confirmedServiceMappings(Map.of("orders", elOrders.getId().toString(), "payment", elPayment.getId().toString()))
            .scenarioStatus("RUNNING").executionStatus("RUNNING").build());
        var recoveryReceipt = com.mavis.analyzer.runtime.dto.RunnerReceiptIngestRequestDTO.builder()
            .sessionId(recoverySession.getId().toString()).sourceSnapshotId(studentSnapshot.getId().toString())
            .modelVersionId(studentModel.getId().toString()).profileVersionId("local-poc-profile/1.0")
            .runConfigurationVersionId("run-config/1.0").scenarioVersionId("scenario/1.0")
            .resourceProject(recoveryResource).imageSourceCorrespondence("Verified").profileAcceptance("Verified")
            .sandboxEnforcementConfirmed(true).infrastructureActions(java.util.List.of(infraAction))
            .outcome(outcome).build();
        java.nio.file.Files.writeString(outboxDir.resolve(recoveryResource + ".json"), mapper.writeValueAsString(recoveryReceipt));
        mvc.perform(post("/api/v1/analyzer/runtime/sessions/" + recoverySession.getId() + "/sync-outbox")
                .param("resourceProject", recoveryResource)
                .header("X-Mavis-Runner-Key", "mavis-runner-secret-key-test"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.data.executionStatus").value("COMPLETED"))
            .andExpect(jsonPath("$.data.cleanupStatus").value("CONFIRMED"));
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named = "MAVIS_MANAGED_DOCKER_TEST_ROOT", matches = ".+")
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.NOT_SUPPORTED)
    void realManagedDotnetRunnerAndDockerFullStackStudioFlow(@org.junit.jupiter.api.io.TempDir java.nio.file.Path tempDir) throws Exception {
        var pocDir = java.nio.file.Path.of(System.getenv("MAVIS_MANAGED_DOCKER_TEST_ROOT")).toAbsolutePath();
        var manifest = mapper.readTree(java.nio.file.Files.readString(pocDir.resolve("artifacts/manifest.json")));
        var images = manifest.path("images");
        String png1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        var studentRole = roles.findByCode("STUDENT").orElseGet(() -> roles.save(Role.builder().code("STUDENT").name("Student").build()));
        var lecturerRole = roles.findByCode("LECTURER").orElseGet(() -> roles.save(Role.builder().code("LECTURER").name("Lecturer").build()));
        var lecturer = users.saveAndFlush(User.builder().email("live-lecturer-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Live Lecturer").role(lecturerRole).build());
        var student = users.saveAndFlush(User.builder().email("live-student-" + UUID.randomUUID() + "@mavis.edu.vn")
            .passwordHash("test-only-hash").fullName("Live Student").role(studentRole).build());
        String lecturerAuth = testAuthorization(lecturer.getEmail());
        String studentAuth = testAuthorization(student.getEmail());

        String composeYaml = "services:\n  orders:\n    image: " + images.path("orders").asText()
            + "\n    environment:\n      PAYMENT_URL: http://payment:8080\n  payment:\n    image: "
            + images.path("payment").asText() + "\n";
        var uploadRoot = java.nio.file.Path.of(System.getProperty("java.io.tmpdir"), "mavis-uploads", "studio-test");
        java.nio.file.Files.createDirectories(uploadRoot);
        var composeFile = uploadRoot.resolve("docker-compose-live-" + UUID.randomUUID() + ".yml");
        java.nio.file.Files.writeString(composeFile, composeYaml);
        composeFile.toFile().deleteOnExit();
        String artifactHash = com.mavis.common.utils.HashUtils.sha256Hex(composeFile);

        var workspace = workspaces.saveAndFlush(Workspace.builder()
            .name("Live Docker Studio Cohort").code("LIVE_" + UUID.randomUUID().toString().substring(0, 4))
            .status("ACTIVE").createdBy(lecturer).build());
        var refProject = projects.saveAndFlush(Project.builder()
            .workspace(workspace).owner(lecturer).name("Live Reference Repo")
            .projectType("TEACHER_REFERENCE").isReferenceTemplate(true).build());
        var refSnapshot = snapshots.saveAndFlush(SourceSnapshot.builder()
            .project(refProject).sourceType("ZIP_UPLOAD").artifactHash(artifactHash)
            .storagePath(composeFile.toString()).isPublished(true).build());
        var refModel = models.saveAndFlush(ModelVersion.builder()
            .project(refProject).sourceSnapshot(refSnapshot).revision(1).origin("GENERATED")
            .isLatestValid(true).createdBy(lecturer).build());
        var lab1 = assignments.saveAndFlush(Assignment.builder()
            .workspace(workspace).createdBy(lecturer).referenceModel(refModel)
            .title("Live Lab 1: Docker Stop/Start/Scale").requireRuntimeTrace(true).build());
        var lab2 = assignments.saveAndFlush(Assignment.builder()
            .workspace(workspace).createdBy(lecturer).referenceModel(refModel)
            .title("Live Lab 2: Unlocked Next Lab").requireRuntimeTrace(true).build());

        String wsPath = "/api/v1/workspaces/" + workspace.getId();
        mvc.perform(post(wsPath + "/course-labs/" + lab1.getId() + "/publish").header("Authorization", lecturerAuth)).andExpect(status().isOk());
        mvc.perform(post(wsPath + "/course-labs/" + lab2.getId() + "/publish").header("Authorization", lecturerAuth)).andExpect(status().isOk());
        var passkeyRes = mvc.perform(post(wsPath + "/course-passkey").header("Authorization", lecturerAuth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"validHours\":2}")).andExpect(status().isOk()).andReturn();
        String passkey = mapper.readTree(passkeyRes.getResponse().getContentAsString()).path("data").path("code").asText();
        mvc.perform(post("/api/v1/course-enrollments/redeem").header("Authorization", studentAuth)
            .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("code", passkey)))).andExpect(status().isOk());

        String quizPath = wsPath + "/course-labs/" + lab1.getId() + "/quiz";
        mvc.perform(post(quizPath + "/curriculum").header("Authorization", lecturerAuth)
            .contentType(MediaType.APPLICATION_JSON).content("{\"chapterId\":\"java-f01\"}")).andExpect(status().isOk());
        long quizStartNs = System.nanoTime();
        mvc.perform(post(quizPath + "/attempts").header("Authorization", studentAuth)
            .contentType(MediaType.APPLICATION_JSON)
            .content(mapper.writeValueAsString(Map.of("attemptId", UUID.randomUUID(), "version", 1, "answers", java.util.List.of(0, 2, 1, 0)))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PASSED"));
        long quizGradingMs = java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - quizStartNs);

        var studentProject = projects.saveAndFlush(Project.builder()
            .workspace(workspace).owner(student).assignment(lab1).referenceSnapshotId(refSnapshot.getId())
            .name("Live Student Working Project").projectType("STUDENT_WORKING").build());
        var studentSnapshot = snapshots.saveAndFlush(SourceSnapshot.builder()
            .project(studentProject).sourceType("ZIP_UPLOAD").artifactHash(artifactHash)
            .storagePath(composeFile.toString()).build());
        var studentModel = models.saveAndFlush(ModelVersion.builder()
            .project(studentProject).sourceSnapshot(studentSnapshot).revision(1).origin("USER_CONFIRMED")
            .isLatestValid(true).createdBy(student).build());
        var elOrders = elements.saveAndFlush(ModelElement.builder()
            .modelVersion(studentModel).name("orders").elementType("SERVICE_CONTAINER").status("VALIDATED").build());
        var elPayment = elements.saveAndFlush(ModelElement.builder()
            .modelVersion(studentModel).name("payment").elementType("SERVICE_CONTAINER").status("VALIDATED").build());
        relationships.saveAndFlush(ModelRelationship.builder()
            .modelVersion(studentModel).sourceElement(elOrders).targetElement(elPayment)
            .relationType("SERVICE_HTTP_CALL").originLayer("STATIC").direction("DIRECTED").build());
        var diagram = diagrams.saveAndFlush(DiagramVersion.builder()
            .modelVersion(studentModel).notation("C4").level("CONTAINER").layoutJson(mapper.createObjectNode()).build());
        var evalRun = evaluations.saveAndFlush(EvaluationRun.builder()
            .modelVersion(studentModel).ruleSetVersion("3e-3")
            .summaryMetrics(mapper.createObjectNode().put("complianceScore", 96.0).put("passedRules", 4).put("failedRules", 0)).build());

        var scenarioConfig = mapper.createObjectNode().put("interactiveStudio", true);
        var profile = scenarioConfig.putObject("profile")
            .put("sandboxCompose", composeYaml)
            .put("collectorImage", manifest.path("collectorImage").asText())
            .put("instrumentationVolume", manifest.path("instrumentationVolume").asText())
            .put("memoryMiB", 512).put("cpus", 1).put("timeoutSeconds", 290).put("approvedForLocalPoc", true)
            .put("scenarioRunnerImage", images.path("runner").asText());
        var apps = profile.putObject("applications");
        apps.putObject("orders").put("runtime", "dotnet8-linux-x64-glibc").put("containerPort", 8080);
        apps.putObject("payment").put("runtime", "java").put("containerPort", 8080);
        var steps = scenarioConfig.putObject("scenario").putArray("steps");
        steps.addObject().put("id", "request").put("service", "orders").put("method", "GET").put("path", "/orders").put("expectedStatus", 200);

        String resourceProject = "mavisrun-" + UUID.randomUUID().toString().replace("-", "");
        var session = sessions.saveAndFlush(RuntimeSession.builder()
            .project(studentProject).sourceSnapshot(studentSnapshot).modelVersion(studentModel).triggeredBy(student)
            .resourceProject(resourceProject).profileVersionId("local-poc-profile/1.0")
            .runConfigurationVersionId("run-config/1.0").scenarioVersionId("scenario/1.0")
            .scenarioConfig(scenarioConfig)
            .confirmedServiceMappings(Map.of("orders", elOrders.getId().toString(), "payment", elPayment.getId().toString()))
            .scenarioStatus("APPROVED").executionStatus("READY_FOR_DISPATCH").build());

        // Start lightweight loopback HTTP bridge forwarding MAVIS.Runner requests to MockMvc
        var bridge = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        bridge.createContext("/", exchange -> {
            try {
                String method = exchange.getRequestMethod();
                java.net.URI uri = exchange.getRequestURI();
                byte[] bodyBytes = exchange.getRequestBody().readAllBytes();
                var reqBuilder = org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                    .request(org.springframework.http.HttpMethod.valueOf(method), uri);
                exchange.getRequestHeaders().forEach((k, vals) -> {
                    if (!"Host".equalsIgnoreCase(k) && !"Content-Length".equalsIgnoreCase(k)) {
                        for (String v : vals) reqBuilder.header(k, v);
                    }
                });
                if (bodyBytes.length > 0) {
                    reqBuilder.contentType(MediaType.APPLICATION_JSON).content(bodyBytes);
                }
                var mvcRes = mvc.perform(reqBuilder).andReturn().getResponse();
                byte[] respBytes = mvcRes.getContentAsByteArray();
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(mvcRes.getStatus(), respBytes.length);
                try (var os = exchange.getResponseBody()) { os.write(respBytes); }
            } catch (Exception ex) {
                byte[] err = ("{\"code\":500,\"message\":\"" + ex.getMessage() + "\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(500, err.length);
                try (var os = exchange.getResponseBody()) { os.write(err); }
            }
        });
        bridge.start();
        String baseUrl = "http://127.0.0.1:" + bridge.getAddress().getPort();
        var stateRoot = tempDir.resolve("runner-state").toAbsolutePath();
        java.nio.file.Files.createDirectories(stateRoot);

        try {
            var runnerDll = pocDir.resolve("artifacts/runner-publish/MAVIS.Runner.dll").toString();
            var collectorYaml = pocDir.resolve("collector.yaml").toString();
            var pb = new ProcessBuilder("dotnet", runnerDll, "managed", baseUrl, session.getId().toString(), collectorYaml, stateRoot.toString());
            pb.environment().put("MAVIS_RUNNER_ALLOW_LOCAL_POC", "1");
            pb.environment().put("MAVIS_RUNNER_SERVICE_KEY", "mavis-runner-secret-key-test");
            pb.redirectErrorStream(true);
            Process runnerProc = pb.start();

            String studioUrl = "/api/v1/analyzer/runtime/sessions/" + session.getId() + "/studio";

            // Wait for Runner to reach RUNNING and publish initial telemetry sample
            String observedBefore = null;
            long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(120);
            while (System.nanoTime() < deadline && runnerProc.isAlive()) {
                var stateRes = mvc.perform(get(studioUrl).header("Authorization", studentAuth)).andReturn();
                var stateData = mapper.readTree(stateRes.getResponse().getContentAsString()).path("data");
                if ("RUNNING".equals(stateData.path("executionStatus").asText())
                        && stateData.path("telemetry").hasNonNull("observedAt")) {
                    observedBefore = stateData.path("telemetry").path("observedAt").asText();
                    break;
                }
                Thread.sleep(500);
            }
            org.junit.jupiter.api.Assertions.assertNotNull(observedBefore, "Runner did not publish initial Studio telemetry in time");

            // Capture BEFORE snapshot
            var snapBeforeRes = mvc.perform(post(studioUrl + "/snapshots").header("Authorization", studentAuth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of(
                        "explanation", "Before intervention: orders=1, payment=1 running on Docker with live OTel spans.",
                        "imageData", png1x1,
                        "observedAt", observedBefore))))
                .andExpect(status().isOk()).andReturn();
            String snapBeforeId = mapper.readTree(snapBeforeRes.getResponse().getContentAsString()).path("data").path("id").asText();

            // Execute STOP payment -> START payment -> SCALE orders (1 -> 2)
            for (var cmd : java.util.List.of(
                    Map.<String, Object>of("actionId", UUID.randomUUID().toString(), "action", "STOP", "service", "payment"),
                    Map.<String, Object>of("actionId", UUID.randomUUID().toString(), "action", "START", "service", "payment"),
                    Map.<String, Object>of("actionId", UUID.randomUUID().toString(), "action", "SCALE", "service", "orders", "replicas", 2))) {
                String aid = (String) cmd.get("actionId");
                mvc.perform(post(studioUrl + "/actions").header("Authorization", studentAuth)
                        .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(cmd)))
                    .andExpect(status().isOk());
                while (System.nanoTime() < deadline && runnerProc.isAlive()) {
                    var stateData = mapper.readTree(mvc.perform(get(studioUrl).header("Authorization", studentAuth))
                        .andReturn().getResponse().getContentAsString()).path("data");
                    boolean confirmed = false;
                    for (var act : stateData.path("actions")) {
                        if (aid.equals(act.path("actionId").asText()) && "CONFIRMED".equals(act.path("status").asText())) {
                            confirmed = true;
                            break;
                        }
                    }
                    if (confirmed) break;
                    Thread.sleep(500);
                }
            }

            // Wait for fresh post-SCALE telemetry sample
            String observedAfter = null;
            while (System.nanoTime() < deadline && runnerProc.isAlive()) {
                var stateData = mapper.readTree(mvc.perform(get(studioUrl).header("Authorization", studentAuth))
                    .andReturn().getResponse().getContentAsString()).path("data");
                String obs = stateData.path("telemetry").path("observedAt").asText("");
                if (!obs.isBlank() && !obs.equals(observedBefore)) {
                    observedAfter = obs;
                    break;
                }
                Thread.sleep(400);
            }
            org.junit.jupiter.api.Assertions.assertNotNull(observedAfter, "Runner did not publish post-action Studio telemetry in time");

            // Capture AFTER snapshot
            var snapAfterRes = mvc.perform(post(studioUrl + "/snapshots").header("Authorization", studentAuth)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsString(Map.of(
                        "explanation", "After STOP/START payment and SCALE orders to 2 replicas on live Docker.",
                        "imageData", png1x1,
                        "observedAt", observedAfter))))
                .andExpect(status().isOk()).andReturn();
            String snapAfterId = mapper.readTree(snapAfterRes.getResponse().getContentAsString()).path("data").path("id").asText();

            // Finish Studio and wait for Runner teardown + HMAC receipt ingest while draining output
            mvc.perform(post(studioUrl + "/finish").header("Authorization", studentAuth)).andExpect(status().isOk());
            var runnerStdout = new java.io.ByteArrayOutputStream();
            var gobbler = java.util.concurrent.CompletableFuture.runAsync(() -> {
                try { runnerProc.getInputStream().transferTo(runnerStdout); } catch (Exception ignored) {}
            });
            boolean exited = runnerProc.waitFor(120, java.util.concurrent.TimeUnit.SECONDS);
            gobbler.get(5, java.util.concurrent.TimeUnit.SECONDS);
            String runnerOutput = runnerStdout.toString(java.nio.charset.StandardCharsets.UTF_8);
            org.junit.jupiter.api.Assertions.assertTrue(exited, "Runner process timed out: " + runnerOutput);
            org.junit.jupiter.api.Assertions.assertEquals(0, runnerProc.exitValue(), "Runner process failed: " + runnerOutput);

            var receiptRes = mvc.perform(get(studioUrl + "/receipt").header("Authorization", studentAuth))
                .andExpect(status().isOk()).andReturn();
            var receiptData = mapper.readTree(receiptRes.getResponse().getContentAsString()).path("data");
            String receiptDigest = receiptData.path("digest").asText();
            String receiptSig = receiptData.path("signature").asText();

            // Submit Course Lab 1 and grade both snapshots (> 5.0) to unlock Lab 2
            var submitBody = Map.of(
                "assignmentId", lab1.getId(),
                "projectId", studentProject.getId(),
                "modelVersionId", studentModel.getId(),
                "diagramVersionId", diagram.getId(),
                "evaluationRunId", evalRun.getId(),
                "runtimeSessionId", session.getId(),
                "submissionNotes", "Full-stack live Docker Studio run with STOP/START/SCALE and Before/After snapshots.",
                "studentSnapshots", java.util.List.of(
                    Map.of("snapshotId", "STEP_1_STATIC", "step", "STEP_1_STATIC", "writtenExplanation", "Orders calls Payment.")
                )
            );
            var submitRes = mvc.perform(post("/api/v1/submissions").header("Authorization", studentAuth)
                    .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(submitBody)))
                .andExpect(status().isOk()).andReturn();
            var submitData = mapper.readTree(submitRes.getResponse().getContentAsString()).path("data");
            String submissionId = submitData.path("id").asText();
            String packageDigest = submitData.path("evidencePackageDigest").asText();

            var reviewBody = Map.of(
                "expectedRevision", 0,
                "status", "GRADED",
                "score", 92.5,
                "summary", "Full-stack live Docker & OpenTelemetry Studio submission verified.",
                "snapshotGrades", java.util.List.of(
                    Map.of("snapshotId", "STEP_1_STATIC", "score", 9.0),
                    Map.of("snapshotId", snapBeforeId, "title", "Live Baseline", "score", 9.0, "comment", "Verified baseline"),
                    Map.of("snapshotId", snapAfterId, "title", "Live Scaled 2 Replicas", "score", 9.5, "comment", "Verified scale to 2 replicas")
                )
            );
            mvc.perform(put("/api/v1/submissions/" + submissionId + "/review").header("Authorization", lecturerAuth)
                    .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(reviewBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.labOutcome").value("PASSED"));

            mvc.perform(get(wsPath + "/course-roadmap").header("Authorization", studentAuth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.labs[0].state").value("PASSED"))
                .andExpect(jsonPath("$.data.labs[1].state").value("UNLOCKED"));

            var summary = mapper.createObjectNode()
                .put("sessionId", session.getId().toString())
                .put("resourceProject", resourceProject)
                .put("snapshotBeforeId", snapBeforeId)
                .put("snapshotAfterId", snapAfterId)
                .put("receiptDigest", receiptDigest)
                .put("receiptSignature", receiptSig)
                .put("submissionId", submissionId)
                .put("evidencePackageDigest", packageDigest)
                .put("quizGradingMs", quizGradingMs)
                .put("cleanupStatus", "CONFIRMED");
            summary.set("infrastructureActions", receiptData.path("receipt").path("infrastructureActions"));
            System.out.println("FULL_STACK_STUDIO_EVIDENCE=" + mapper.writeValueAsString(summary));
        } finally {
            bridge.stop(0);
        }
    }
}
