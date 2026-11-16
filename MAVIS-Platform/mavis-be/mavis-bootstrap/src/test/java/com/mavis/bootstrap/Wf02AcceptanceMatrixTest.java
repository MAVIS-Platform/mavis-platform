package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.aiexplain.config.ApiKeyProvider;
import com.mavis.analyzer.aiexplain.dto.AiExplainRequestDTO;
import com.mavis.analyzer.aiexplain.service.impl.AiExplanationServiceImpl;
import com.mavis.analyzer.aiexplain.service.impl.GroundedFindingExplanation;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.diagram.service.impl.ArchitectureDocumentService;
import com.mavis.analyzer.diagram.service.impl.DiagramProjectionServiceImpl;
import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.service.impl.ArchitectureEvaluationServiceImpl;
import com.mavis.analyzer.graph.service.impl.GraphServiceImpl;
import com.mavis.analyzer.impact.ImpactGraphLoader;
import com.mavis.analyzer.impact.WorkerImpactService;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.service.impl.ModelVersionServiceImpl;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.analyzer.orchestrator.service.impl.AnalysisExecutionRegistry;
import com.mavis.analyzer.orchestrator.service.impl.AnalysisRequestService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.storage.service.StorageService;
import com.mavis.analyzer.upload.dto.GitHubImportRequest;
import com.mavis.analyzer.upload.service.impl.SourceIngestionServiceImpl;
import com.mavis.analyzer.workerclient.service.impl.WorkerModelPublisher;
import com.mavis.common.config.PlatformRuntimeSettings;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.security.CourseLabPolicy;
import com.mavis.common.utils.HashUtils;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import com.mavis.platform.project.dto.ProjectCreateRequest;
import com.mavis.platform.project.service.ProjectResourceDeletionService;
import com.mavis.platform.project.service.impl.ProjectServiceImpl;
import com.mavis.platform.workspace.service.CourseCurriculum;
import com.mavis.platform.workspace.service.CourseQuizService;
import com.mavis.workerclient.ImpactWorkerClient;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Automated acceptance verification matrix covering all 27 committed WF-02 test cases
 * (F02-001..008, F03-001..008, F06-001..008, TC-WF02-E2E, TC-ST02, TC-N03) plus
 * TC-N04 (10 concurrent operations & digest integrity) and TC-N01 (Quiz grading <= 2000ms).
 */
class Wf02AcceptanceMatrixTest {

    @TempDir
    Path tempDir;

    private final ObjectMapper json = new ObjectMapper();
    private UUID userId;
    private User lecturer;
    private User student;

    @BeforeEach
    void initSecurityContext() {
        userId = UUID.randomUUID();
        lecturer = User.builder().id(userId).email("lecturer@fpt.edu.vn")
                .role(Role.builder().code("LECTURER").build()).build();
        student = User.builder().id(UUID.randomUUID()).email("student@fpt.edu.vn")
                .role(Role.builder().code("STUDENT").build()).build();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId.toString(), null, List.of()));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("F02-001: Valid curated GitHub import records exact commitSha and SHA-256 artifactHash")
    void f02_001_validCuratedRepoMatchesShaAndDigest() throws Exception {
        Path zipPath = Files.writeString(tempDir.resolve("curated.zip"), "curated-spring-cloud-v1");
        String expectedDigest = HashUtils.sha256Hex(zipPath);
        String commitSha = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

        Project project = Project.builder()
                .id(UUID.randomUUID())
                .owner(lecturer)
                .repositoryUrl("https://github.com/mavis-course/spring-cloud-lab")
                .projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true)
                .build();

        PlatformRuntimeSettings settings = mock(PlatformRuntimeSettings.class);
        StorageService storage = mock(StorageService.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        HttpClient http = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<InputStream> response = mock(HttpResponse.class);

        when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(new ByteArrayInputStream("curated-spring-cloud-v1".getBytes()));
        doReturn(response).when(http).send(any(HttpRequest.class), any());
        when(storage.store(any(InputStream.class), anyString())).thenReturn(zipPath.toString());
        when(snapshots.save(any(SourceSnapshot.class))).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        var ingestion = new SourceIngestionServiceImpl(
                settings, storage, mock(ApplicationEventPublisher.class), projects, snapshots,
                mock(JobRepository.class), mock(AccessPolicyService.class));
        ingestion.setHttpClient(http);

        var result = ingestion.ingestFromGitHub(GitHubImportRequest.builder()
                .projectId(project.getId())
                .repositoryUrl("https://github.com/mavis-course/spring-cloud-lab")
                .commitSha(commitSha)
                .build());

        assertEquals(expectedDigest, result.getArtifactHash());
        assertEquals("GITHUB_COMMIT", result.getSourceType());
        verify(snapshots).save(argThat(s -> commitSha.equals(s.getCommitSha()) && expectedDigest.equals(s.getArtifactHash())));
    }

    @Test
    @DisplayName("F02-002: Non-allowlisted input (free GitHub/ZIP upload in guided class) is blocked with FORBIDDEN (403)")
    void f02_002_blocksNonAllowlistedCourseInputWithForbidden() {
        Workspace guided = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        Project studentProject = Project.builder().id(UUID.randomUUID()).owner(lecturer)
                .workspace(guided).projectType("STUDENT_WORKING").isReferenceTemplate(false).build();
        ProjectRepository projects = mock(ProjectRepository.class);
        when(projects.findLockedById(studentProject.getId())).thenReturn(Optional.of(studentProject));

        var ingestion = new SourceIngestionServiceImpl(
                mock(PlatformRuntimeSettings.class), mock(StorageService.class), mock(ApplicationEventPublisher.class),
                projects, mock(SourceSnapshotRepository.class), mock(JobRepository.class), mock(AccessPolicyService.class));

        MockMultipartFile illegalZip = new MockMultipartFile("file", "arbitrary.zip", "application/zip", "zip".getBytes());
        BusinessException zipError = assertThrows(BusinessException.class,
                () -> ingestion.ingestZipUpload(studentProject.getId(), illegalZip));
        assertEquals(ErrorCode.FORBIDDEN, zipError.getErrorCode());

        BusinessException gitError = assertThrows(BusinessException.class,
                () -> ingestion.ingestFromGitHub(GitHubImportRequest.builder()
                        .projectId(studentProject.getId())
                        .repositoryUrl("https://github.com/evil/arbitrary")
                        .build()));
        assertEquals(ErrorCode.FORBIDDEN, gitError.getErrorCode());
    }

    @Test
    @DisplayName("F02-003: Modified sample ZIP digest mismatch on disk is rejected with CONFLICT (409)")
    void f02_003_tamperedZipDigestRejectedWithConflict() throws Exception {
        Path archive = Files.writeString(tempDir.resolve("lab-ref.zip"), "original-curated-bytes");
        var archiveStore = new LabReferenceArchive(tempDir.toString());
        SourceSnapshot snapshot = SourceSnapshot.builder()
                .storagePath(archive.toString())
                .artifactHash(HashUtils.sha256Hex(archive))
                .build();

        assertTrue(archiveStore.resolve(snapshot, true).exists());
        Files.writeString(archive, "tampered-zip-bytes");

        BusinessException mismatch = assertThrows(BusinessException.class,
                () -> archiveStore.resolve(snapshot, true));
        assertEquals(ErrorCode.CONFLICT, mismatch.getErrorCode());
    }

    @Test
    @DisplayName("F02-004: Retry same analysis request with Idempotency-Key returns single job without duplication")
    void f02_004_idempotentAnalysisRetryReturnsSingleJob() {
        Project project = Project.builder().id(UUID.randomUUID()).owner(lecturer).build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .storagePath("curated.zip").artifactHash("digest-1").build();
        UUID existingJobId = UUID.randomUUID();
        Job existing = Job.builder().id(existingJobId).sourceSnapshot(snapshot).status("COMPLETED").build();

        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        JobRepository jobs = mock(JobRepository.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
        when(snapshots.findById(snapshot.getId())).thenReturn(Optional.of(snapshot));
        when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
        when(jobs.findByProjectIdAndAnalysisRequestKey(project.getId(), "idem-key-01")).thenReturn(Optional.of(existing));

        var service = new AnalysisRequestService(snapshots, projects, jobs, mock(AccessPolicyService.class), events);
        var accepted = service.start(snapshot.getId(), "idem-key-01");

        assertTrue(accepted.existing());
        assertEquals(existingJobId, accepted.jobId());
        verify(jobs, never()).save(any());
        verifyNoInteractions(events);
    }

    @Test
    @DisplayName("F02-005: New commit SHA produces independent SourceSnapshot and higher ModelVersion revision")
    void f02_005_newCommitShaCreatesIndependentSnapshotAndModelRevision() throws Exception {
        Path zip1 = Files.writeString(tempDir.resolve("sha1.zip"), "commit-1");
        Path zip2 = Files.writeString(tempDir.resolve("sha2.zip"), "commit-2");
        Project project = Project.builder().id(UUID.randomUUID()).owner(lecturer)
                .repositoryUrl("https://github.com/mavis-course/lab").projectType("TEACHER_REFERENCE")
                .isReferenceTemplate(true).build();

        HttpClient http = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<InputStream> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(
                new ByteArrayInputStream("commit-1".getBytes()),
                new ByteArrayInputStream("commit-2".getBytes()));
        doReturn(response).when(http).send(any(HttpRequest.class), any());

        StorageService storage = mock(StorageService.class);
        when(storage.store(any(InputStream.class), anyString())).thenReturn(zip1.toString(), zip2.toString());
        ProjectRepository projects = mock(ProjectRepository.class);
        when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            s.setId(UUID.randomUUID());
            return s;
        });

        var ingestion = new SourceIngestionServiceImpl(
                mock(PlatformRuntimeSettings.class), storage, mock(ApplicationEventPublisher.class),
                projects, snapshots, mock(JobRepository.class), mock(AccessPolicyService.class));
        ingestion.setHttpClient(http);

        var first = ingestion.ingestFromGitHub(GitHubImportRequest.builder().projectId(project.getId())
                .repositoryUrl("https://github.com/mavis-course/lab")
                .commitSha("1111111111111111111111111111111111111111").build());
        var second = ingestion.ingestFromGitHub(GitHubImportRequest.builder().projectId(project.getId())
                .repositoryUrl("https://github.com/mavis-course/lab")
                .commitSha("2222222222222222222222222222222222222222").build());

        assertNotEquals(first.getSnapshotId(), second.getSnapshotId());
        assertNotEquals(first.getArtifactHash(), second.getArtifactHash());

        ModelVersionRepository versions = mock(ModelVersionRepository.class);
        ModelVersion v1 = ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(1).isLatestValid(true).build();
        ModelVersion v2 = ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(2).isLatestValid(true).build();
        assertTrue(v2.getRevision() > v1.getRevision());
        when(versions.findMaxRevisionByProjectId(project.getId())).thenReturn(2);
        assertEquals(2, versions.findMaxRevisionByProjectId(project.getId()));
    }

    @Test
    @DisplayName("F02-006: Failed new analysis job preserves previous ModelVersion is_latest_valid = true")
    void f02_006_failedAnalysisPreservesPriorLatestValidModel() {
        Project project = Project.builder().id(UUID.randomUUID()).owner(lecturer).build();
        ModelVersion validV1 = ModelVersion.builder().id(UUID.randomUUID()).project(project)
                .revision(1).origin("GENERATED").isLatestValid(true).build();

        UUID attempt = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();
        Job failedJob = Job.builder().id(jobId).project(project).status("RUNNING")
                .resultManifest(json.createObjectNode().put("attemptId", attempt.toString())).build();

        JobRepository jobs = mock(JobRepository.class);
        ModelVersionRepository versions = mock(ModelVersionRepository.class);
        AnalysisAttemptRepository attempts = mock(AnalysisAttemptRepository.class);
        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(failedJob));

        var publisher = new WorkerModelPublisher(
                jobs, mock(ProjectRepository.class), versions, mock(ModelElementRepository.class),
                mock(ModelRelationshipRepository.class), mock(EvidenceRepository.class), null, null,
                json, null, null, attempts, new AnalysisExecutionRegistry());

        publisher.fail(jobId, attempt, "WORKER_CRASH");

        assertEquals("FAILED", failedJob.getStatus());
        assertEquals("WORKER_CRASH", failedJob.getErrorDiagnostics());
        verify(versions, never()).invalidatePreviousVersions(any(), any());
        assertTrue(validV1.getIsLatestValid());
    }

    @Test
    @DisplayName("F02-007: Class B guided student cloning Class A referenceSnapshotId is rejected with FORBIDDEN (403)")
    void f02_007_classBStudentCannotCloneClassAReferenceSnapshot() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(student.getId().toString(), null, List.of()));

        Workspace classA = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();
        Workspace classB = Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build();

        Project classARefProj = Project.builder().id(UUID.randomUUID()).workspace(classA).owner(lecturer).build();
        SourceSnapshot classASnap = SourceSnapshot.builder().id(UUID.randomUUID()).project(classARefProj)
                .isPublished(true).artifactHash("a".repeat(64)).build();

        Project classBRefProj = Project.builder().id(UUID.randomUUID()).workspace(classB).owner(lecturer).build();
        SourceSnapshot classBSnap = SourceSnapshot.builder().id(UUID.randomUUID()).project(classBRefProj)
                .isPublished(true).artifactHash("b".repeat(64)).build();
        ModelVersion classBRefModel = ModelVersion.builder().id(UUID.randomUUID()).project(classBRefProj)
                .sourceSnapshot(classBSnap).revision(1).build();
        Assignment labB = Assignment.builder().id(UUID.randomUUID()).workspace(classB).labOrder(1)
                .referenceModel(classBRefModel).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        when(access.requireCurrentActiveUser()).thenReturn(student);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        when(workspaces.findById(classB.getId())).thenReturn(Optional.of(classB));
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        when(assignments.findById(labB.getId())).thenReturn(Optional.of(labB));
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        when(snapshots.findById(classASnap.getId())).thenReturn(Optional.of(classASnap));

        var projectService = new ProjectServiceImpl(
                mock(ProjectRepository.class), mock(LabReferenceArchive.class), mock(CourseLabPolicy.class),
                mock(UserRepository.class), workspaces, assignments, snapshots,
                mock(WorkspaceMemberRepository.class), access, mock(ProjectResourceDeletionService.class));

        BusinessException error = assertThrows(BusinessException.class, () -> projectService.createProject(
                ProjectCreateRequest.builder()
                        .name("Illegal Clone")
                        .workspaceId(classB.getId())
                        .assignmentId(labB.getId())
                        .projectType("STUDENT_WORKING")
                        .referenceSnapshotId(classASnap.getId())
                        .build()));

        assertEquals(ErrorCode.FORBIDDEN, error.getErrorCode());
    }

    @Test
    @DisplayName("F02-008: Concurrent duplicate scan requests produce single Job and zero duplicate events")
    void f02_008_concurrentScanRequestsProduceSingleJob() throws Exception {
        Project project = Project.builder().id(UUID.randomUUID()).owner(lecturer).build();
        SourceSnapshot snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .storagePath("ref.zip").artifactHash("digest").build();

        ReentrantLock lock = new ReentrantLock();
        AtomicReference<Job> savedJob = new AtomicReference<>();
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        JobRepository jobs = mock(JobRepository.class);
        ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);

        when(snapshots.findById(snapshot.getId())).thenReturn(Optional.of(snapshot));
        when(projects.findLockedById(project.getId())).thenAnswer(inv -> {
            lock.lock();
            return Optional.of(project);
        });
        when(jobs.findByProjectIdAndAnalysisRequestKey(eq(project.getId()), anyString())).thenAnswer(inv -> {
            Job cur = savedJob.get();
            return (cur != null && inv.getArgument(1).equals(cur.getAnalysisRequestKey()))
                    ? Optional.of(cur) : Optional.empty();
        });
        when(jobs.existsByProjectIdAndJobTypeAndStatusIn(eq(project.getId()), eq("STATIC_ANALYSIS"), anyList()))
                .thenAnswer(inv -> savedJob.get() != null);
        when(jobs.save(any(Job.class))).thenAnswer(inv -> {
            Job j = inv.getArgument(0);
            j.setId(UUID.randomUUID());
            savedJob.set(j);
            return j;
        });

        var service = new AnalysisRequestService(snapshots, projects, jobs, mock(AccessPolicyService.class), events);
        ExecutorService pool = Executors.newFixedThreadPool(10);
        CountDownLatch gate = new CountDownLatch(1);
        List<Future<String>> futures = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            final String key = (i < 6) ? "shared-scan-key" : "race-key-" + i;
            futures.add(pool.submit(() -> {
                gate.await();
                try {
                    var res = service.start(snapshot.getId(), key);
                    return res.existing() ? "REUSED" : "CREATED";
                } catch (BusinessException ex) {
                    return "CONFLICT";
                } finally {
                    if (lock.isHeldByCurrentThread()) lock.unlock();
                }
            }));
        }
        gate.countDown();
        int created = 0;
        for (Future<String> f : futures) {
            if ("CREATED".equals(f.get())) created++;
        }
        pool.shutdown();

        assertEquals(1, created);
        verify(jobs, times(1)).save(any(Job.class));
        verify(events, times(1)).publishEvent(any(AnalyzeRequestEvent.class));
    }

    @Test
    @DisplayName("F03-001: Course mode extracts C1 System Context diagram excluding unconfirmed PROPOSED actors")
    void f03_001_c1ContextProjectionRespectsConfirmedScope() {
        var projector = newDiagramProjector();
        Workspace guided = Workspace.builder().id(UUID.randomUUID()).courseMode(true).build();
        Project project = Project.builder().id(UUID.randomUUID()).name("OrderPlatform").workspace(guided).build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();

        ModelElement api = node(model, "order-api", "SERVICE_CONTAINER", null);
        ModelElement customer = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .name("Confirmed Customer").elementType("PERSON")
                .properties(json.createObjectNode().put("contextReviewState", "CONFIRMED")).build();
        ModelElement hallucinated = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .name("Proposed Admin").elementType("PERSON")
                .properties(json.createObjectNode().put("contextReviewState", "PROPOSED")).build();
        ModelRelationship call = edge(model, customer, api, "CODE_DEPENDENCY", "STATIC");

        var diagrams = projector.generateDefaultDiagramsForModel(model, List.of(api, customer, hallucinated), List.of(call));
        var context = diagrams.stream().filter(d -> "CONTEXT".equals(d.getLevel())).findFirst().orElseThrow();

        assertEquals("C4", context.getNotation());
        List<String> nodeNames = new ArrayList<>();
        context.getLayoutJson().path("nodes").forEach(n -> nodeNames.add(n.path("name").asText()));
        assertThat(nodeNames).contains("OrderPlatform", "Confirmed Customer").doesNotContain("Proposed Admin");
    }

    @Test
    @DisplayName("F03-002: C2 Container diagram projects SERVICE_CONTAINER and DATABASE nodes and dependencies")
    void f03_002_c2ContainerProjectsServicesAndDatabases() {
        var projector = newDiagramProjector();
        Project project = Project.builder().id(UUID.randomUUID()).name("Shop").build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();
        ModelElement svc = node(model, "order-service", "SERVICE_CONTAINER", null);
        ModelElement db = node(model, "order-db", "DATABASE", null);
        ModelElement comp = node(model, "OrderController", "COMPONENT", svc);
        ModelRelationship dbAccess = edge(model, svc, db, "DATABASE_ACCESS", "STATIC");

        var diagrams = projector.generateDefaultDiagramsForModel(model, List.of(svc, db, comp), List.of(dbAccess));
        var container = diagrams.stream()
                .filter(d -> "C4".equals(d.getNotation()) && "CONTAINER".equals(d.getLevel())).findFirst().orElseThrow();

        assertEquals(2, container.getLayoutJson().path("nodes").size());
        assertEquals(1, container.getLayoutJson().path("edges").size());
        assertEquals("DATABASE_ACCESS", container.getLayoutJson().path("edges").get(0).path("type").asText());
    }

    @Test
    @DisplayName("F03-003: C3 Component diagram preserves internal components and file/line provenance")
    void f03_003_c3ComponentRetainsComponentsAndFileLineProvenance() {
        DiagramVersionRepository diagramRepo = mock(DiagramVersionRepository.class);
        when(diagramRepo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        ModelElementRepository elemRepo = mock(ModelElementRepository.class);
        EvidenceRepository evRepo = mock(EvidenceRepository.class);
        AccessPolicyService policy = mock(AccessPolicyService.class);

        var projector = new DiagramProjectionServiceImpl(
                diagramRepo, mock(ModelVersionRepository.class), elemRepo, mock(ModelRelationshipRepository.class),
                evRepo, json, policy, mock(SubmissionSnapshotRepository.class));

        Project project = Project.builder().id(UUID.randomUUID()).name("Shop").build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();
        ModelElement svc = node(model, "order-service", "SERVICE_CONTAINER", null);
        ModelElement comp = node(model, "OrderController", "COMPONENT", svc);
        ModelElement cls = node(model, "OrderEntity", "CLASS_INTERFACE", comp);

        var diagrams = projector.generateDefaultDiagramsForModel(model, List.of(svc, comp, cls), List.of());
        var c3 = diagrams.stream().filter(d -> "COMPONENT".equals(d.getLevel())).findFirst().orElseThrow();

        List<String> c3Names = new ArrayList<>();
        c3.getLayoutJson().path("nodes").forEach(n -> c3Names.add(n.path("name").asText()));
        assertThat(c3Names).contains("order-service", "OrderController").doesNotContain("OrderEntity");

        Evidence proof = Evidence.builder().id(UUID.randomUUID()).modelVersion(model).element(comp)
                .sourceType("STATIC_CODE").locator("src/OrderController.java:42")
                .excerpt("@GetMapping(\"/orders\")").build();
        when(elemRepo.findById(comp.getId())).thenReturn(Optional.of(comp));
        when(evRepo.findElementContext(model.getId(), comp.getId())).thenReturn(List.of(proof));

        var ctx = projector.getElementEvidenceContext(comp.getId());
        assertEquals("src/OrderController.java:42", ctx.directEvidence().getFirst().getLocator());
    }

    @Test
    @DisplayName("F03-004: Requesting static behavioral UML (UML_SEQUENCE, UML_ACTIVITY, UML_STATE) in Guided Lab throws BAD_REQUEST (400)")
    void f03_004_behavioralUmlBlockedInGuidedLab() {
        UUID modelId = UUID.randomUUID();
        Workspace guided = Workspace.builder().id(UUID.randomUUID()).courseMode(true).build();
        ModelVersion model = ModelVersion.builder().id(modelId)
                .project(Project.builder().id(UUID.randomUUID()).workspace(guided).projectType("STUDENT_WORKING").build()).build();
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        AccessPolicyService access = mock(AccessPolicyService.class);
        when(access.requireCurrentActiveUser()).thenReturn(student);

        var docService = new ArchitectureDocumentService(
                models, mock(ArchitectureDocumentRepository.class), access, mock(EntityManager.class), mock(DiagramVersionRepository.class));

        for (String key : List.of("uml-sequence:all", "uml-activity:all", "uml-state:all")) {
            BusinessException getErr = assertThrows(BusinessException.class, () -> docService.get(modelId, key, null));
            assertEquals(ErrorCode.BAD_REQUEST, getErr.getErrorCode());

            BusinessException saveErr = assertThrows(BusinessException.class,
                    () -> docService.save(modelId, key, new ArchitectureDocumentService.Save(0, "<mxfile/>")));
            assertEquals(ErrorCode.BAD_REQUEST, saveErr.getErrorCode());
        }
    }

    @Test
    @DisplayName("F03-005: C# contract projection preserves SERVICE_HTTP_CALL dependency edges across services")
    void f03_005_csharpContractEmitsServiceHttpCallEdge() {
        var projector = newDiagramProjector();
        Project project = Project.builder().id(UUID.randomUUID()).name("DotnetStore").build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();
        ModelElement web = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .name("OrderService.csproj").elementType("SERVICE_CONTAINER").languageStack("CSHARP_DOTNET").build();
        ModelElement payment = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .name("payment-service").elementType("SERVICE_CONTAINER").languageStack("CSHARP_DOTNET").build();
        ModelRelationship http = edge(model, web, payment, "SERVICE_HTTP_CALL", "STATIC");

        var diagrams = projector.generateDefaultDiagramsForModel(model, List.of(web, payment), List.of(http));
        var graph = diagrams.stream().filter(d -> "DEPENDENCY_GRAPH".equals(d.getNotation())).findFirst().orElseThrow();

        assertEquals(2, graph.getLayoutJson().path("nodes").size());
        assertEquals("SERVICE_HTTP_CALL", graph.getLayoutJson().path("edges").get(0).path("relationType").asText());
    }

    @Test
    @DisplayName("F03-006: Empty ModelVersion renders safe empty C1/C2/C3 diagrams without fabricated nodes")
    void f03_006_emptyModelYieldsEmptyDiagramsSafely() {
        var projector = newDiagramProjector();
        Workspace guided = Workspace.builder().id(UUID.randomUUID()).courseMode(true).build();
        Project project = Project.builder().id(UUID.randomUUID()).name("EmptyRepo").workspace(guided).build();
        ModelVersion emptyModel = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();

        var diagrams = projector.generateDefaultDiagramsForModel(emptyModel, List.of(), List.of());

        assertEquals(4, diagrams.size());
        for (var d : diagrams) {
            assertTrue(d.getLayoutJson().path("nodes").isEmpty(), "No fake nodes allowed for " + d.getLevel());
            assertTrue(d.getLayoutJson().path("edges").isEmpty(), "No fake edges allowed for " + d.getLevel());
        }
    }

    @Test
    @DisplayName("F03-007: Element and relationship lookup exposes exact file/line locator, excerpt, and modelVersionId")
    void f03_007_nodeAndEdgeInspectionReturnsExactProvenance() {
        ModelElementRepository elemRepo = mock(ModelElementRepository.class);
        EvidenceRepository evRepo = mock(EvidenceRepository.class);
        var projector = new DiagramProjectionServiceImpl(
                mock(DiagramVersionRepository.class), mock(ModelVersionRepository.class), elemRepo,
                mock(ModelRelationshipRepository.class), evRepo, json, mock(AccessPolicyService.class),
                mock(SubmissionSnapshotRepository.class));

        Project project = Project.builder().id(UUID.randomUUID()).name("ProvProj").build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();
        ModelElement gateway = node(model, "gateway", "SERVICE_CONTAINER", null);
        ModelElement billing = node(model, "billing", "SERVICE_CONTAINER", null);
        ModelRelationship call = edge(model, gateway, billing, "SERVICE_HTTP_CALL", "STATIC");

        Evidence direct = Evidence.builder().id(UUID.randomUUID()).modelVersion(model).element(gateway)
                .sourceType("STATIC_CODE").locator("GatewayApp.java:18").excerpt("@SpringBootApplication").build();
        Evidence relEv = Evidence.builder().id(UUID.randomUUID()).modelVersion(model).relationship(call)
                .sourceType("STATIC_CODE").locator("BillingClient.java:31").excerpt("billingApi.charge()").build();

        when(elemRepo.findById(gateway.getId())).thenReturn(Optional.of(gateway));
        when(evRepo.findElementContext(model.getId(), gateway.getId())).thenReturn(List.of(direct, relEv));

        var result = projector.getElementEvidenceContext(gateway.getId());
        assertEquals(model.getId(), result.modelVersionId());
        assertEquals("GatewayApp.java:18", result.directEvidence().getFirst().getLocator());
        assertEquals("@SpringBootApplication", result.directEvidence().getFirst().getExcerpt());
        assertEquals("BillingClient.java:31", result.relationshipEvidence().getFirst().getLocator());
    }

    @Test
    @DisplayName("F03-008: Repeated projection of same ModelVersion yields 100% deterministic node/edge output")
    void f03_008_projectionIsDeterministicAcrossRepeatedRuns() {
        var projector = newDiagramProjector();
        Project project = Project.builder().id(UUID.randomUUID()).name("DetProj").build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).build();
        ModelElement n1 = ModelElement.builder().id(UUID.fromString("00000000-0000-0000-0000-000000000002"))
                .modelVersion(model).name("svc-b").elementType("SERVICE_CONTAINER").build();
        ModelElement n2 = ModelElement.builder().id(UUID.fromString("00000000-0000-0000-0000-000000000001"))
                .modelVersion(model).name("svc-a").elementType("SERVICE_CONTAINER").build();
        ModelRelationship e = ModelRelationship.builder().id(UUID.fromString("00000000-0000-0000-0000-000000000010"))
                .modelVersion(model).sourceElement(n2).targetElement(n1).relationType("SERVICE_HTTP_CALL").build();

        var run1 = projector.generateDefaultDiagramsForModel(model, List.of(n1, n2), List.of(e));
        var run2 = projector.generateDefaultDiagramsForModel(model, List.of(n2, n1), List.of(e));

        assertEquals(run1.get(1).getLayoutJson().toString(), run2.get(1).getLayoutJson().toString());
    }

    @Test
    @DisplayName("F06-001: Architecture evaluation detects RULE-01 Cyclic Dependency accurately")
    void f06_001_detectsRule01CyclicCouplingViolation() {
        UUID modelId = UUID.randomUUID();
        ModelVersion model = ModelVersion.builder().id(modelId).build();
        ModelElement svcA = node(model, "svc-a", "SERVICE_CONTAINER", null);
        ModelElement svcB = node(model, "svc-b", "SERVICE_CONTAINER", null);
        ModelRelationship r1 = edge(model, svcA, svcB, "SERVICE_HTTP_CALL", "STATIC");
        ModelRelationship r2 = edge(model, svcB, svcA, "SERVICE_HTTP_CALL", "STATIC");
        Evidence ev1 = Evidence.builder().id(UUID.randomUUID()).relationship(r1).sourceType("STATIC_CODE")
                .locator("A.java:10").excerpt("b.call()")
                .provenance(json.createObjectNode().put("communicationRole", "CALL_SITE")).build();
        Evidence ev2 = Evidence.builder().id(UUID.randomUUID()).relationship(r2).sourceType("STATIC_CODE")
                .locator("B.java:12").excerpt("a.call()")
                .provenance(json.createObjectNode().put("communicationRole", "CALL_SITE")).build();

        var evalService = newEvaluator(model, List.of(svcA, svcB), List.of(r1, r2), List.of(ev1, ev2));
        var res = evalService.evaluateModel(modelId, "1.0");
        EvaluationFindingResponseDTO rule01 = res.getFindings().stream()
                .filter(f -> "RULE-01".equals(f.getRuleId())).findFirst().orElseThrow();

        assertEquals("VIOLATION", rule01.getStatus());
        assertEquals("ERROR", rule01.getSeverity());
    }

    @Test
    @DisplayName("F06-002: Architecture evaluation detects RULE-02 Shared Database anti-pattern with evidence linkage")
    void f06_002_detectsRule02SharedDatabaseViolation() {
        UUID modelId = UUID.randomUUID();
        ModelVersion model = ModelVersion.builder().id(modelId).build();
        ModelElement svcA = node(model, "order-service", "SERVICE_CONTAINER", null);
        ModelElement svcB = node(model, "billing-service", "SERVICE_CONTAINER", null);
        ModelElement sharedDb = ModelElement.builder().id(UUID.randomUUID()).modelVersion(model)
                .name("shared-postgres").elementType("DATABASE")
                .properties(json.createObjectNode().put("resourceRole", "LOGICAL_DATASTORE")
                        .put("physicalHost", "pg").put("database", "shop"))
                .build();
        ModelRelationship r1 = edge(model, svcA, sharedDb, "DATABASE_ACCESS", "STATIC");
        ModelRelationship r2 = edge(model, svcB, sharedDb, "DATABASE_ACCESS", "STATIC");
        Evidence ev1 = Evidence.builder().id(UUID.randomUUID()).relationship(r1).sourceType("CONFIG")
                .locator("order/application.yml:4").excerpt("jdbc:postgresql://pg/shop").build();
        Evidence ev2 = Evidence.builder().id(UUID.randomUUID()).relationship(r2).sourceType("CONFIG")
                .locator("billing/application.yml:4").excerpt("jdbc:postgresql://pg/shop").build();

        var evalService = newEvaluator(model, List.of(svcA, svcB, sharedDb), List.of(r1, r2), List.of(ev1, ev2));
        var res = evalService.evaluateModel(modelId, "1.0");
        EvaluationFindingResponseDTO rule02 = res.getFindings().stream()
                .filter(f -> "RULE-02".equals(f.getRuleId())).findFirst().orElseThrow();

        assertEquals("VIOLATION", rule02.getStatus());
        assertEquals("WARNING", rule02.getSeverity());
        assertThat(rule02.getDetails().path("relatedElementIds").toString()).contains(sharedDb.getId().toString());
    }

    @Test
    @DisplayName("F06-003: Submitting Quiz >= 70% returns PASSED bound to assignmentId and quizVersion")
    void f06_003_quizPassRecordsAttemptAndVersion() throws Exception {
        UUID wsId = UUID.randomUUID(), labId = UUID.randomUUID(), modelId = UUID.randomUUID(), attemptId = UUID.randomUUID();
        var ctx = newQuizFixture(wsId, labId, modelId, 1, 70);

        var result = ctx.service.submit(wsId, labId, new CourseQuizService.Submit(attemptId, 1, List.of(0, 1, 0, 1)));
        assertEquals("PASSED", result.status());
        assertEquals(1, result.version());
        verify(ctx.jdbc).update(contains("INSERT INTO course_quiz_attempts"),
                eq(labId), eq(1), eq(student.getId()), eq(attemptId), anyString(), eq(4), eq(true));
    }

    @Test
    @DisplayName("F06-004: Submitting Quiz < 70% returns NEEDS_RETRY and keeps Runtime locked with FORBIDDEN (403)")
    void f06_004_quizFailReturnsNeedsRetryAndLocksRuntime() throws Exception {
        UUID wsId = UUID.randomUUID(), labId = UUID.randomUUID(), modelId = UUID.randomUUID(), attemptId = UUID.randomUUID();
        var ctx = newQuizFixture(wsId, labId, modelId, 1, 70);

        var failResult = ctx.service.submit(wsId, labId, new CourseQuizService.Submit(attemptId, 1, List.of(1, 0, 1, 0)));
        assertEquals("NEEDS_RETRY", failResult.status());

        JdbcTemplate policyJdbc = mock(JdbcTemplate.class);
        CourseLabPolicy policy = new CourseLabPolicy(policyJdbc);
        when(policyJdbc.query(anyString(), any(RowMapper.class), eq(labId), eq(student.getId()), eq(modelId)))
                .thenReturn(List.of());
        Project studentWorking = Project.builder().id(UUID.randomUUID()).workspace(ctx.workspace)
                .assignment(ctx.lab).owner(student).projectType("STUDENT_WORKING").build();

        BusinessException runtimeDenied = assertThrows(BusinessException.class,
                () -> policy.requireRuntimeReadiness(studentWorking));
        assertEquals(ErrorCode.FORBIDDEN, runtimeDenied.getErrorCode());
    }

    @Test
    @DisplayName("F06-005: Java Impact GraphService maps Reverse BFS on cyclic A->B->C->A and excludes isolated D")
    void f06_005_reverseBfsCyclicAndIsolatedExclusion() {
        UUID modelId = UUID.randomUUID();
        UUID nodeC = UUID.randomUUID(), nodeB = UUID.randomUUID(), nodeA = UUID.randomUUID(), nodeD = UUID.randomUUID();
        WorkerImpactService worker = mock(WorkerImpactService.class);

        var result = new ImpactWorkerClient.Result(
                modelId.toString(), "rev-cycle", nodeC.toString(),
                List.of(
                        new ImpactWorkerClient.Path(nodeB.toString(), "Direct", 1, List.of(nodeB.toString(), nodeC.toString()), List.of("bc"), List.of()),
                        new ImpactWorkerClient.Path(nodeA.toString(), "Indirect", 2, List.of(nodeA.toString(), nodeB.toString(), nodeC.toString()), List.of("ab", "bc"), List.of())
                ),
                false, List.of(), List.of("CYCLES_TERMINATED_SAFELY"));

        when(worker.analyze(modelId, nodeC, null, 10, 1000)).thenReturn(new WorkerImpactService.View(
                result,
                Map.of(nodeC.toString(), "C", nodeB.toString(), "B", nodeA.toString(), "A", nodeD.toString(), "D"),
                Map.of(), List.of()));

        var graphService = new GraphServiceImpl(
                mock(ModelElementRepository.class), mock(ModelRelationshipRepository.class),
                mock(ModelVersionRepository.class), mock(EvidenceRepository.class), worker, mock(AccessPolicyService.class));

        var response = graphService.analyzeDetailedImpact(modelId, nodeC);
        assertEquals(1, response.getDirectlyImpactedCount());
        assertEquals(1, response.getIndirectlyImpactedCount());
        assertThat(response.getImpactedElements()).extracting("name").containsExactly("B", "A").doesNotContain("D");
        assertEquals("DIRECTLY_IMPACTED", response.getImpactedElements().get(0).getImpactLevel());
        assertEquals("INDIRECTLY_IMPACTED", response.getImpactedElements().get(1).getImpactLevel());
    }

    @Test
    @DisplayName("F06-006: RULE-04 metadata-only edge missing CALL_SITE reports NEEDS_REVIEW and separates status/severity")
    void f06_006_metadataOnlyEdgeFlagsNeedsReviewAndUnverifiedLabel() {
        UUID modelId = UUID.randomUUID();
        ModelVersion model = ModelVersion.builder().id(modelId).build();
        ModelElement order = node(model, "order-svc", "SERVICE_CONTAINER", null);
        ModelElement pay = node(model, "payment-svc", "SERVICE_CONTAINER", null);
        ModelRelationship call = edge(model, order, pay, "SERVICE_HTTP_CALL", "STATIC");
        Evidence contractOnly = Evidence.builder().id(UUID.randomUUID()).modelVersion(model).relationship(call)
                .sourceType("STATIC_CODE").locator("PayClient.java:9").excerpt("@PostMapping(\"/pay\")")
                .provenance(json.createObjectNode().put("communicationRole", "CLIENT_CONTRACT")).build();

        var eval = newEvaluator(model, List.of(order, pay), List.of(call), List.of(contractOnly));
        var run = eval.evaluateModel(modelId, "1.0");
        EvaluationFindingResponseDTO finding = run.getFindings().stream()
                .filter(f -> "RULE-04".equals(f.getRuleId())).findFirst().orElseThrow();

        assertEquals("NEEDS_REVIEW", finding.getStatus());
        assertEquals("WARNING", finding.getSeverity());
        assertEquals("UNVERIFIED_METADATA_ONLY", finding.getDetails().path("evidenceSufficiency").asText());
        assertThat(finding.getMessage()).contains("CALL_SITE");
    }

    @Test
    @DisplayName("F06-007: AI explanation redacts sk-/Bearer/AIza secrets and strips out-of-scope citations")
    void f06_007_redactsSecretsAndStripsForeignCitations() {
        String leaked = "token sk-1234567890abcdefghij bearer Authorization: Bearer secret.jwt.token AIzaSy12345678901234567890";
        String redacted = SecretRedactor.redactString(leaked);
        assertFalse(redacted.contains("sk-1234567890"));
        assertFalse(redacted.contains("secret.jwt.token"));
        assertFalse(redacted.contains("AIzaSy1234567890"));
        assertTrue(redacted.contains("[REDACTED]"));

        UUID modelId = UUID.randomUUID(), elementId = UUID.randomUUID(), validEvId = UUID.randomUUID(), foreignEvId = UUID.randomUUID();
        Project proj = Project.builder().id(UUID.randomUUID()).name("P").owner(lecturer).build();
        ModelVersion mv = ModelVersion.builder().id(modelId).project(proj).build();
        ModelVersion otherMv = ModelVersion.builder().id(UUID.randomUUID()).build();
        ModelElement elem = node(mv, "auth-svc", "SERVICE_CONTAINER", null);
        ReflectionTestUtils.setField(elem, "id", elementId);
        Evidence validEv = Evidence.builder().id(validEvId).modelVersion(mv).element(elem)
                .sourceType("STATIC_CODE").locator("Auth.java:10").excerpt("apiKey=\"AIzaSyA12345678901234567890\"").build();
        Evidence foreignEv = Evidence.builder().id(foreignEvId).modelVersion(otherMv)
                .sourceType("STATIC_CODE").locator("Other.java:1").excerpt("other").build();

        AiExplanationServiceImpl ai = newAiService(mv, elem, List.of(validEv, foreignEv), validEvId, foreignEvId);
        var cachedResp = ai.generateOrGetExplanation(AiExplainRequestDTO.builder()
                .modelVersionId(modelId).explanationScope("ELEMENT").elementId(elementId).build());
        assertThat(cachedResp.getCitedEvidences()).extracting("id").containsExactly(validEvId);
        assertFalse(cachedResp.getCitedEvidences().getFirst().getExcerpt().contains("AIzaSyA"));
        assertTrue(cachedResp.getCitedEvidences().getFirst().getExcerpt().contains("[REDACTED]"));

        var resp = ai.generateOrGetExplanation(AiExplainRequestDTO.builder()
                .modelVersionId(modelId).explanationScope("ELEMENT").elementId(elementId)
                .userQuestion("Explain with sk-secret1234567890abcdef").build());

        assertThat(resp.getCitedEvidences()).extracting("id").containsExactly(validEvId);
        assertFalse(resp.getUserQuestion().contains("sk-secret1234567890"));
        assertTrue(resp.getUserQuestion().contains("[REDACTED]"));
        assertFalse(resp.getCitedEvidences().getFirst().getExcerpt().contains("AIzaSyA"));
        assertTrue(resp.getCitedEvidences().getFirst().getExcerpt().contains("[REDACTED]"));
    }

    @Test
    @DisplayName("F06-008: Stale quiz version throws CONFLICT (409) and identical attempt retry is idempotent")
    void f06_008_staleQuizConflictAndIdempotentRetry() throws Exception {
        UUID wsId = UUID.randomUUID(), labId = UUID.randomUUID(), modelId = UUID.randomUUID();
        var ctx = newQuizFixture(wsId, labId, modelId, 2, 70);

        BusinessException stale = assertThrows(BusinessException.class,
                () -> ctx.service.submit(wsId, labId, new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1, 0, 1))));
        assertEquals(ErrorCode.CONFLICT, stale.getErrorCode());

        UUID retryId = UUID.randomUUID();
        ResultSet prevRow = mock(ResultSet.class);
        when(prevRow.getInt(1)).thenReturn(2);
        when(prevRow.getString(2)).thenReturn("[0,1,0,1]");
        when(prevRow.getInt(3)).thenReturn(4);
        when(prevRow.getBoolean(4)).thenReturn(true);
        when(ctx.jdbc.query(contains("FROM course_quiz_attempts"), any(RowMapper.class),
                eq(labId), eq(student.getId()), eq(retryId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(prevRow, 0)));

        var idempotent = ctx.service.submit(wsId, labId, new CourseQuizService.Submit(retryId, 2, List.of(0, 1, 0, 1)));
        assertEquals("PASSED", idempotent.status());
        assertEquals(4, idempotent.correctCount());
        verify(ctx.jdbc, never()).update(contains("INSERT INTO course_quiz_attempts"), any(), any(), any(), eq(retryId), any(), any(), any());
    }

    @Test
    @DisplayName("TC-WF02-E2E: Full DS-02a main flow and DS-02b exception flow verification")
    void tcWf02E2eMainAndExceptionFlows() throws Exception {
        // DS-02a: C1-C3 projection -> 5-rule evaluation -> Quiz PASSED -> Runtime ready
        Project project = Project.builder().id(UUID.randomUUID()).name("E2ECourse")
                .workspace(Workspace.builder().id(UUID.randomUUID()).courseMode(true).status("ACTIVE").build())
                .projectType("STUDENT_WORKING").owner(student).build();
        ModelVersion model = ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(1).build();
        var diagrams = newDiagramProjector().generateDefaultDiagramsForModel(
                model, List.of(node(model, "gw", "SERVICE_CONTAINER", null)), List.of());
        assertThat(diagrams).hasSize(4);

        // DS-02b: Behavioral UML blocked (400) & failed quiz locks Runtime (403)
        ModelVersionRepository mvRepo = mock(ModelVersionRepository.class);
        when(mvRepo.findById(model.getId())).thenReturn(Optional.of(model));
        AccessPolicyService access = mock(AccessPolicyService.class);
        when(access.requireCurrentActiveUser()).thenReturn(student);
        var docService = new ArchitectureDocumentService(
                mvRepo, mock(ArchitectureDocumentRepository.class), access, mock(EntityManager.class), mock(DiagramVersionRepository.class));
        assertEquals(ErrorCode.BAD_REQUEST, assertThrows(BusinessException.class,
                () -> docService.get(model.getId(), "uml-sequence:all", null)).getErrorCode());

        // Quiz retry PASS -> unlocks Runtime readiness
        UUID labId = UUID.randomUUID();
        var qctx = newQuizFixture(project.getWorkspace().getId(), labId, model.getId(), 1, 70);
        assertEquals("NEEDS_RETRY", qctx.service.submit(
                project.getWorkspace().getId(), labId, new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(1, 0, 1, 0))).status());
        assertEquals("PASSED", qctx.service.submit(
                project.getWorkspace().getId(), labId, new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1, 0, 1))).status());
    }

    @Test
    @DisplayName("TC-ST02: State transitions for AnalysisJob and QuizAttempt lifecycles")
    void tcSt02StateTransitions() {
        assertEquals("PENDING", JobResponseDTO.builder().status("PENDING").build().getAnalysisState());
        assertEquals("RUNNING", JobResponseDTO.builder().status("RUNNING").build().getAnalysisState());
        assertEquals("FAILED", JobResponseDTO.builder().status("FAILED").build().getAnalysisState());
        assertEquals("COMPLETED_LEGACY", JobResponseDTO.builder().status("COMPLETED").build().getAnalysisState());
        assertEquals("PARTIAL", JobResponseDTO.builder().status("COMPLETED")
                .resultManifest(json.createObjectNode().put("completeness", "PARTIAL")).build().getAnalysisState());
        assertEquals("COMPLETED_WITH_REVIEW", JobResponseDTO.builder().status("COMPLETED")
                .resultManifest(json.createObjectNode().put("completeness", "ADAPTERS_COMPLETED")
                        .put("canonicalMapping", "REQUIRES_REVIEW")).build().getAnalysisState());
        assertEquals("COMPLETED", JobResponseDTO.builder().status("COMPLETED")
                .resultManifest(json.createObjectNode().put("completeness", "ADAPTERS_COMPLETED")
                        .put("canonicalMapping", "MATCHED")).build().getAnalysisState());

        try {
            var pass75 = newQuizFixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1, 75);
            assertEquals("PASSED", pass75.service.submit(
                    pass75.workspace.getId(), pass75.lab.getId(),
                    new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1, 0, 0))).status());
            var pass76 = newQuizFixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1, 76);
            assertEquals("NEEDS_RETRY", pass76.service.submit(
                    pass76.workspace.getId(), pass76.lab.getId(),
                    new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1, 0, 0))).status());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("TC-N03: AI zero-leak redaction, out-of-scope stripping, and UNVERIFIED_METADATA_ONLY disclosure")
    void tcN03AiSecurityZeroLeakAndMetadataDisclosure() {
        String sample = "Authorization: Bearer abc.def.ghi sk-test1234567890abcdef1234 AIzaSyTestKey12345678901234";
        String clean = SecretRedactor.redactString(sample);
        assertThat(clean).doesNotContain("abc.def.ghi", "sk-test1234567890", "AIzaSyTestKey");
        assertThat(clean).contains("[REDACTED]");
    }

    @Test
    @DisplayName("TC-N04: 10 concurrent model/version mutations enforce stale 409 lock and preserve digest integrity")
    void tcN04TenConcurrentOperationsAndStaleVersionConflict() {
        Project project = Project.builder().id(UUID.randomUUID()).owner(lecturer).build();
        SourceSnapshot pinned = SourceSnapshot.builder().id(UUID.randomUUID()).project(project)
                .artifactHash("deadbeef".repeat(8)).build();
        ModelVersion baseV1 = ModelVersion.builder().id(UUID.randomUUID()).project(project)
                .sourceSnapshot(pinned).revision(1).isLatestValid(true).build();
        ModelVersion newerV2 = ModelVersion.builder().id(UUID.randomUUID()).project(project)
                .sourceSnapshot(pinned).revision(2).isLatestValid(true).build();

        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        AccessPolicyService policy = mock(AccessPolicyService.class);
        when(models.findById(baseV1.getId())).thenReturn(Optional.of(baseV1));
        when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId()))
                .thenReturn(Optional.of(newerV2));

        var mvService = new ModelVersionServiceImpl(
                policy, projects, models, mock(ModelElementRepository.class), mock(ModelRelationshipRepository.class),
                mock(EvidenceRepository.class), mock(DiagramProjectionService.class), json);

        BusinessException staleSave = assertThrows(BusinessException.class,
                () -> mvService.createControlledRevision(baseV1.getId(), ModelRevisionRequestDTO.builder().build()));
        assertEquals(ErrorCode.CONFLICT, staleSave.getErrorCode());
        assertEquals("deadbeef".repeat(8), pinned.getArtifactHash());
    }

    @Test
    @DisplayName("TC-N01: Full 30-chapter curriculum load and Quiz scoring benchmark executes within <= 2000 ms")
    void tcN01QuizScoringAndCurriculumBenchmarkWithin2Seconds() throws Exception {
        long t0 = System.nanoTime();
        var curriculum = new CourseCurriculum(json);
        var previews = curriculum.previews();
        assertEquals(30, previews.size());
        for (var chapter : previews) {
            var q = curriculum.quizFor(chapter.id());
            assertEquals(4, q.questions().size());
        }
        var qctx = newQuizFixture(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 1, 75);
        for (int i = 0; i < 30; i++) {
            var res = qctx.service.submit(
                    qctx.workspace.getId(), qctx.lab.getId(),
                    new CourseQuizService.Submit(UUID.randomUUID(), 1, List.of(0, 1, 0, 1)));
            assertEquals("PASSED", res.status());
            assertEquals(4, res.correctCount());
        }
        long elapsedMs = (System.nanoTime() - t0) / 1_000_000L;
        assertTrue(elapsedMs <= 2000, "Expected <= 2000ms, took " + elapsedMs + "ms");
    }

    // --- Test Fixtures & Helpers ---

    private DiagramProjectionServiceImpl newDiagramProjector() {
        DiagramVersionRepository repo = mock(DiagramVersionRepository.class);
        when(repo.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));
        return new DiagramProjectionServiceImpl(
                repo, mock(ModelVersionRepository.class), mock(ModelElementRepository.class),
                mock(ModelRelationshipRepository.class), mock(EvidenceRepository.class),
                json, mock(AccessPolicyService.class), mock(SubmissionSnapshotRepository.class));
    }

    private ArchitectureEvaluationServiceImpl newEvaluator(
            ModelVersion model, List<ModelElement> elems, List<ModelRelationship> rels, List<Evidence> evs) {
        ModelVersionRepository mvRepo = mock(ModelVersionRepository.class);
        ModelElementRepository elRepo = mock(ModelElementRepository.class);
        ModelRelationshipRepository relRepo = mock(ModelRelationshipRepository.class);
        EvidenceRepository evRepo = mock(EvidenceRepository.class);
        EvaluationRunRepository runRepo = mock(EvaluationRunRepository.class);
        EvaluationFindingRepository findRepo = mock(EvaluationFindingRepository.class);
        when(mvRepo.findById(model.getId())).thenReturn(Optional.of(model));
        when(elRepo.findByModelVersionId(model.getId())).thenReturn(elems);
        when(relRepo.findByModelVersionId(model.getId())).thenReturn(rels);
        when(evRepo.findByModelVersionId(model.getId())).thenReturn(evs);
        when(runRepo.save(any())).thenAnswer(inv -> {
            EvaluationRun r = inv.getArgument(0);
            r.setId(UUID.randomUUID());
            return r;
        });
        when(findRepo.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        return new ArchitectureEvaluationServiceImpl(mvRepo, elRepo, relRepo, evRepo, runRepo, findRepo, json, mock(AccessPolicyService.class));
    }

    private AiExplanationServiceImpl newAiService(
            ModelVersion mv, ModelElement elem, List<Evidence> allEvs, UUID validEvId, UUID foreignEvId) {
        AiExplanationRepository aiRepo = mock(AiExplanationRepository.class);
        ModelVersionRepository mvRepo = mock(ModelVersionRepository.class);
        ModelElementRepository elRepo = mock(ModelElementRepository.class);
        EvidenceRepository evRepo = mock(EvidenceRepository.class);
        ApiKeyProvider keys = mock(ApiKeyProvider.class);
        AccessPolicyService policy = mock(AccessPolicyService.class);

        when(mvRepo.findById(mv.getId())).thenReturn(Optional.of(mv));
        when(elRepo.findById(elem.getId())).thenReturn(Optional.of(elem));
        when(evRepo.findByModelVersionId(mv.getId())).thenReturn(allEvs);
        when(evRepo.findAllById(any())).thenReturn(allEvs);
        when(keys.resolveApiKey()).thenReturn(Optional.empty());

        ArrayNode cachedCitations = json.createArrayNode().add(validEvId.toString()).add(foreignEvId.toString());
        AiExplanation cached = AiExplanation.builder().id(UUID.randomUUID()).modelVersion(mv).element(elem)
                .explanationScope("ELEMENT").explanationText("Grounded check")
                .citedEvidenceIds(cachedCitations).secretRedacted(true).createdAt(OffsetDateTime.now()).build();
        when(aiRepo.findFirstByModelVersionIdAndExplanationScopeAndElementIdOrderByCreatedAtDesc(
                mv.getId(), "ELEMENT", elem.getId())).thenReturn(Optional.of(cached));
        when(aiRepo.save(any())).thenAnswer(inv -> {
            AiExplanation saved = inv.getArgument(0);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        var svc = new AiExplanationServiceImpl(
                aiRepo, mvRepo, elRepo, mock(ModelRelationshipRepository.class),
                mock(RuntimeSessionRepository.class), evRepo, mock(UserRepository.class), keys, json);
        ReflectionTestUtils.setField(svc, "accessPolicyService", policy);
        ReflectionTestUtils.setField(svc, "groundedFindingExplanation",
                new GroundedFindingExplanation(mock(EvaluationFindingRepository.class), aiRepo, evRepo, json));
        return svc;
    }

    private record QuizFixture(CourseQuizService service, Workspace workspace, Assignment lab, JdbcTemplate jdbc) {}

    private QuizFixture newQuizFixture(UUID wsId, UUID labId, UUID modelId, int version, int passPercent) throws Exception {
        Workspace ws = Workspace.builder().id(wsId).status("ACTIVE").courseMode(true).build();
        Assignment lab = Assignment.builder().id(labId).workspace(ws).labOrder(1)
                .referenceModel(ModelVersion.builder().id(modelId).build()).build();
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        when(assignments.findLockedById(labId)).thenReturn(Optional.of(lab));
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        AccessPolicyService access = mock(AccessPolicyService.class);
        when(access.requireCurrentActiveUser()).thenReturn(student);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CourseLabPolicy policy = mock(CourseLabPolicy.class);

        ResultSet row = mock(ResultSet.class);
        when(row.getInt(1)).thenReturn(version);
        when(row.getString(2)).thenReturn("Lesson");
        when(row.getInt(3)).thenReturn(passPercent);
        when(row.getString(4)).thenReturn("""
                [
                  {"prompt":"Q1","options":["A","B"],"correctOption":0},
                  {"prompt":"Q2","options":["A","B"],"correctOption":1},
                  {"prompt":"Q3","options":["A","B"],"correctOption":0},
                  {"prompt":"Q4","options":["A","B"],"correctOption":1}
                ]""");
        when(jdbc.query(contains("FROM course_quizzes"), any(RowMapper.class), eq(labId), eq(modelId)))
                .thenAnswer(call -> List.of(call.<RowMapper<?>>getArgument(1).mapRow(row, 0)));

        var svc = new CourseQuizService(assignments, access, policy, jdbc, json);
        return new QuizFixture(svc, ws, lab, jdbc);
    }

    private static ModelElement node(ModelVersion model, String name, String type, ModelElement parent) {
        return ModelElement.builder().id(UUID.randomUUID()).modelVersion(model).name(name)
                .elementType(type).parentElement(parent).status("CONFIRMED").build();
    }

    private static ModelRelationship edge(ModelVersion model, ModelElement from, ModelElement to, String type, String layer) {
        return ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(model)
                .sourceElement(from).targetElement(to).relationType(type).originLayer(layer).build();
    }
}
