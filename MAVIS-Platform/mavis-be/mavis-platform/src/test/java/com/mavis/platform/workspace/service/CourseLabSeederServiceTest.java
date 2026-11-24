package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.EvaluationRun;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.DiagramVersionRepository;
import com.mavis.common.repository.EvaluationRunRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.platform.assignment.service.LabReferenceArchive;
import com.mavis.platform.workspace.curriculum.CsharpCourseraCatalog;
import com.mavis.platform.workspace.curriculum.JavaCourseraCatalog;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CourseLabSeederServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void seedsCuratedLabsArchiveDiagramsEvaluationAndQuizzesIdempotently() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("lecturer@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder().id(workspaceId).name("SE181979").status("ACTIVE").courseMode(false).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });
        AtomicReference<SourceSnapshot> savedSnap = new AtomicReference<>();
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            savedSnap.set(s);
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        List<Assignment> savedAssignments = new java.util.ArrayList<>();
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            savedAssignments.add(a);
            return a;
        });

        CourseAccessService.Roadmap expectedRoadmap = new CourseAccessService.Roadmap(
                true,
                null,
                List.of(
                        new CourseAccessService.Lab(UUID.randomUUID(), 1, "Lab 01 · Static C1–C3 Architecture & OpenFeign Reverse BFS", "UNLOCKED", null),
                        new CourseAccessService.Lab(UUID.randomUUID(), 2, "Lab 02 · Runtime Resilience, Circuit Breaker & Stop/Scale Impact", "UNLOCKED", null),
                        new CourseAccessService.Lab(UUID.randomUUID(), 3, "Lab 03 · ASP.NET Core Microservices with Roslyn & OpenTelemetry", "UNLOCKED", null)
                )
        );
        when(courses.roadmap(workspaceId)).thenReturn(expectedRoadmap);

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        CourseAccessService.Roadmap seeded = seeder.seedCurated(workspaceId);
        assertThat(seeded.guided()).isTrue();
        assertThat(seeded.labs()).hasSize(3);
        assertThat(workspace.isCourseMode()).isTrue();
        assertThat(savedSnap.get()).isNotNull();

        LabReferenceArchive archiveResolver = new LabReferenceArchive(tempDir.toString());
        var resolvedArchive = archiveResolver.resolve(savedSnap.get(), true);
        assertThat(resolvedArchive.exists()).isTrue();
        try (var zip = new java.util.zip.ZipFile(resolvedArchive.getFile())) {
            assertThat(zip.getEntry("order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java")).isNotNull();
            assertThat(zip.getEntry("catalog-service/src/main/java/com/mochuong/catalog/controller/ProductController.java")).isNotNull();
            assertThat(zip.getEntry("Orders/Program.cs")).isNotNull();
            assertThat(zip.getEntry("Catalog/Program.cs")).isNotNull();
        }

        verify(diagrams, times(1)).saveAll(anyList());
        verify(evaluations, times(1)).save(any());
        verify(quizzes, times(3)).publishCurriculum(eq(workspaceId), any(UUID.class), any());
        assertThat(savedAssignments).hasSize(3);
        assertThat(savedAssignments.get(0).getLabMode()).isEqualTo("THEORY_QUIZ");
        assertThat(savedAssignments.get(0).getStudioTopologySnapshot()).isNull();
        assertThat(savedAssignments.get(1).getLabMode()).isEqualTo("THEORY_QUIZ_STUDIO");
        assertThat(savedAssignments.get(1).getStudioTopologySnapshot()).isNotNull();
        assertThat(savedAssignments.get(1).getStudioTopologySnapshot().path("blocks").size()).isEqualTo(6);
        assertThat(savedAssignments.get(1).getStudioTopologyRevision()).isEqualTo(1);
        assertThat(savedAssignments.get(2).getLabMode()).isEqualTo("THEORY_QUIZ_STUDIO");
        assertThat(savedAssignments.get(2).getStudioTopologySnapshot()).isNotNull();

        // Second call is idempotent when labs already exist, and upgrades legacy labs with no diagram submissions
        Assignment legacyRuntimeLab = Assignment.builder()
                .id(UUID.randomUUID())
                .labOrder(1)
                .labMode("LEGACY")
                .requireRuntimeTrace(true)
                .build();
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of(legacyRuntimeLab));
        CourseAccessService.Roadmap second = seeder.seedCurated(workspaceId);
        assertThat(second).isEqualTo(expectedRoadmap);
        assertThat(legacyRuntimeLab.getLabMode()).isEqualTo("THEORY_QUIZ_STUDIO");
        assertThat(legacyRuntimeLab.getStudioTopologySnapshot()).isNotNull();
        verify(projects, times(1)).save(any());
    }

    @Test
    void seedsFull13LabCurriculumWhenPresetIsFullCurriculum() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("lecturer@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder().id(workspaceId).name("SE181979-FULL").status("ACTIVE").courseMode(false).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        List<Assignment> savedAssignments = new java.util.ArrayList<>();
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            savedAssignments.add(a);
            return a;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "NOT_ENROLLED", List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_FULL_CURRICULUM);
        verify(assignments, times(13)).saveAndFlush(any(Assignment.class));
        verify(quizzes, times(13)).publishCurriculum(eq(workspaceId), any(UUID.class), any());
    }

    @Test
    void rejectsNonLecturerCallerWhenSeeding() {
        UUID workspaceId = UUID.randomUUID();
        AccessPolicyService access = mock(AccessPolicyService.class);
        when(access.requireCurrentActiveUser()).thenReturn(User.builder().id(UUID.randomUUID()).build());
        doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(access).requireWorkspaceLecturer(workspaceId);

        CourseLabSeederService seeder = new CourseLabSeederService(
                access,
                mock(WorkspaceRepository.class),
                mock(AssignmentRepository.class),
                mock(ProjectRepository.class),
                mock(SourceSnapshotRepository.class),
                mock(ModelVersionRepository.class),
                mock(ModelElementRepository.class),
                mock(ModelRelationshipRepository.class),
                mock(DiagramVersionRepository.class),
                mock(EvaluationRunRepository.class),
                mock(EvidenceRepository.class),
                mock(CourseCurriculum.class),
                mock(CourseQuizService.class),
                mock(CourseAccessService.class),
                mock(JdbcTemplate.class),
                new ObjectMapper(),
                tempDir.toString());

        assertThatThrownBy(() -> seeder.seedCurated(workspaceId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.FORBIDDEN);
    }

    @Test
    void seedsJavaCourseraPresetWithPostgresValidConstraintsAndOverwritesStaleDraft() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("gv.java@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder().id(workspaceId).code("JAVA-MS-2026").name("Java").status("ACTIVE").courseMode(false).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        CourseAuthoringService courseAuthoring = mock(CourseAuthoringService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of());
        AtomicReference<Project> savedProject = new AtomicReference<>();
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            savedProject.set(p);
            return p;
        });
        when(projects.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });

        List<ModelElement> savedElements = new ArrayList<>();
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            savedElements.add(e);
            return e;
        });
        List<ModelRelationship> savedRelationships = new ArrayList<>();
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            savedRelationships.add(r);
            return r;
        });
        List<Evidence> savedEvidences = new ArrayList<>();
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            savedEvidences.add(ev);
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });

        UUID courseId = UUID.randomUUID();
        CourseAuthoringService.CourseView staleDraft = new CourseAuthoringService.CourseView(
                courseId, workspaceId, "Java Mc", "Test", "DRAFT", 2, 0, List.of());
        when(courseAuthoring.findExistingForAuthoring(workspaceId)).thenReturn(Optional.of(staleDraft));
        AtomicInteger moduleCounter = new AtomicInteger(0);
        when(courseAuthoring.saveDraft(eq(workspaceId), any())).thenAnswer(inv -> {
            CourseAuthoringService.CourseRequest req = inv.getArgument(1);
            return new CourseAuthoringService.CourseView(
                    courseId, workspaceId, req.title(), req.description(), "DRAFT", 3, 0, List.of());
        });
        when(courseAuthoring.addModule(eq(workspaceId), any())).thenAnswer(inv -> {
            CourseAuthoringService.ModuleRequest req = inv.getArgument(1);
            int pos = moduleCounter.incrementAndGet();
            var m = new CourseAuthoringService.ModuleView(
                    UUID.randomUUID(), req.title(), req.description(), pos, req.prerequisiteModuleId(), List.of());
            return new CourseAuthoringService.CourseView(
                    courseId, workspaceId, JavaCourseraCatalog.COURSE_TITLE, JavaCourseraCatalog.COURSE_DESCRIPTION,
                    "DRAFT", 3, 0, List.of(m));
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "ENROLLED", List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());
        ReflectionTestUtils.setField(seeder, "courseAuthoring", courseAuthoring);

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_JAVA_COURSERA);

        Set<String> allowedStatuses = Set.of("DRAFT", "NEEDS_REVIEW", "VALIDATED", "STUDENT_CONFIRMED", "UNCERTAIN_MAPPING");
        Set<String> allowedRelationTypes = Set.of(
                "SERVICE_HTTP_CALL", "CODE_DEPENDENCY", "DATABASE_ACCESS", "RUNTIME_OBSERVED", "DECLARED_COMPOSE",
                "MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE", "DECLARED_LINK", "CONFIGURATION_DEPENDENCY",
                "SERVICE_DISCOVERY", "TRACING_EXPORT", "GATEWAY_ROUTE", "CONFIGURED_ENDPOINT");
        Set<String> allowedEvidenceSources = Set.of("STATIC_CODE", "CONFIG_FILE", "DOCKER_COMPOSE", "RUNTIME_TRACE");

        assertThat(savedElements.size()).isGreaterThanOrEqualTo(40);
        assertThat(savedElements).extracting(ModelElement::getName).contains(
                "service-discovery", "api-gateway", "identity-service",
                "catalog-service", "order-service", "notification-service");
        assertThat(savedElements).allSatisfy(el -> assertThat(allowedStatuses).contains(el.getStatus()));
        assertThat(savedRelationships.size()).isGreaterThanOrEqualTo(50);
        assertThat(savedRelationships).allSatisfy(rel -> assertThat(allowedRelationTypes).contains(rel.getRelationType()));
        assertThat(savedEvidences.size()).isGreaterThanOrEqualTo(20);
        assertThat(savedEvidences).allSatisfy(ev -> assertThat(allowedEvidenceSources).contains(ev.getSourceType()));
        assertThat(savedProject.get().getReferenceSnapshotId()).isNotNull();

        verify(assignments, times(5)).saveAndFlush(any(Assignment.class));
        verify(quizzes, times(5)).publishCurriculum(eq(workspaceId), any(UUID.class), any());
        verify(courseAuthoring).saveDraft(eq(workspaceId), eq(new CourseAuthoringService.CourseRequest(
                JavaCourseraCatalog.COURSE_TITLE, JavaCourseraCatalog.COURSE_DESCRIPTION)));
        verify(courseAuthoring, times(5)).addModule(eq(workspaceId), any());
        verify(courseAuthoring, times(27)).addItem(eq(workspaceId), any(UUID.class), any());
        verify(courseAuthoring).publish(workspaceId);
    }

    @Test
    void fallsBackToTempUploadsAndKeepsArchiveResolvableWhenPrimaryUploadDirIsUnwritable() throws Exception {
        Path blockedUploadDir = tempDir.resolve("blocked-upload-root");
        Files.writeString(blockedUploadDir, "regular-file-blocking-mkdir");

        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("lecturer@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).name("Java Unwritable Root").status("ACTIVE").courseMode(true).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)).thenReturn(List.of());
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });
        AtomicReference<SourceSnapshot> savedSnap = new AtomicReference<>();
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            savedSnap.set(s);
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, null, List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, blockedUploadDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_JAVA_COURSERA);

        assertThat(savedSnap.get()).isNotNull();
        var resolver = new LabReferenceArchive(blockedUploadDir.toString());
        var resolved = resolver.resolve(savedSnap.get(), true);
        assertThat(resolved.exists()).isTrue();
    }

    @Test
    void ensureJavaCourseraPopulatedQueriesCourseDefinitionsAndHealsPartialWorkspace() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("lecturer@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).name("Java Coursera").status("ACTIVE").createdBy(lecturer).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)).thenReturn(List.of());
        when(jdbc.queryForObject(
                org.mockito.ArgumentMatchers.contains("JOIN course_definitions"),
                eq(Integer.class),
                eq(workspaceId)))
                .thenReturn(0);
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            return p;
        });
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, null, List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.ensureJavaCourseraPopulated(workspaceId);

        verify(jdbc).queryForObject(
                org.mockito.ArgumentMatchers.contains("JOIN course_definitions"),
                eq(Integer.class),
                eq(workspaceId));
        verify(assignments, times(5)).saveAndFlush(any(Assignment.class));
    }

    @Test
    void realignsLegacyV1LabsAndUnlocksV2Lab01AtLabOrder1() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("gv.java@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).code("JAVA-MS-2026").name("Java V2").status("ACTIVE").courseMode(true).build();
        Project refProject = Project.builder().id(UUID.randomUUID()).workspace(workspace).build();
        SourceSnapshot refSnapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(refProject).build();
        ModelVersion refModel = ModelVersion.builder()
                .id(UUID.randomUUID()).project(refProject).sourceSnapshot(refSnapshot).build();

        List<Assignment> legacyV1Labs = new ArrayList<>();
        for (int i = 1; i <= 6; i++) {
            legacyV1Labs.add(Assignment.builder()
                    .id(UUID.randomUUID())
                    .workspace(workspace)
                    .title("Legacy V1 Lab 0" + i)
                    .labOrder(i)
                    .referenceModel(refModel)
                    .build());
        }

        List<Assignment> v2Labs = new ArrayList<>();
        var v2Modules = JavaCourseraCatalog.modules();
        for (int i = 0; i < v2Modules.size(); i++) {
            v2Labs.add(Assignment.builder()
                    .id(UUID.randomUUID())
                    .workspace(workspace)
                    .title(v2Modules.get(i).labTitle())
                    .labOrder(7 + i)
                    .referenceModel(refModel)
                    .build());
        }

        List<Assignment> corrupted11Labs = new ArrayList<>(legacyV1Labs);
        corrupted11Labs.addAll(v2Labs);
        List<UUID> expectedV2Ids = v2Labs.stream().map(Assignment::getId).toList();

        assertThat(CourseLabSeederService.isCourseraLabsAligned(corrupted11Labs, v2Modules)).isFalse();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(corrupted11Labs);
        when(jdbc.queryForObject(contains("FROM runtime_configurations"), eq(Integer.class), any()))
                .thenReturn(1);
        when(jdbc.queryForObject(contains("FROM runtime_scenarios"), eq(Integer.class), any()))
                .thenReturn(1);

        // Guard against any save violating unique index uq_workspace_lab_order (workspace_id, lab_order).
        Map<Integer, UUID> activeOrders = new HashMap<>();
        for (Assignment a : corrupted11Labs) {
            activeOrders.put(a.getLabOrder(), a.getId());
        }
        when(assignments.saveAndFlush(any(Assignment.class))).thenAnswer(inv -> {
            Assignment saved = inv.getArgument(0);
            activeOrders.entrySet().removeIf(entry -> saved.getId().equals(entry.getValue())
                    && !entry.getKey().equals(saved.getLabOrder()));
            if (saved.getLabOrder() != null) {
                UUID holder = activeOrders.get(saved.getLabOrder());
                if (holder != null && !holder.equals(saved.getId())) {
                    throw new AssertionError("Duplicate lab_order violation for order " + saved.getLabOrder());
                }
                activeOrders.put(saved.getLabOrder(), saved.getId());
            }
            return saved;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "IN_PROGRESS", List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments,
                mock(ProjectRepository.class), mock(SourceSnapshotRepository.class),
                mock(ModelVersionRepository.class), mock(ModelElementRepository.class),
                mock(ModelRelationshipRepository.class), mock(DiagramVersionRepository.class),
                mock(EvaluationRunRepository.class), mock(EvidenceRepository.class),
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_JAVA_COURSERA);

        assertThat(legacyV1Labs).allSatisfy(stale -> {
            assertThat(stale.getLabOrder()).isNull();
            assertThat(stale.getAiPolicy().path("archivedV1").asBoolean()).isTrue();
        });
        for (int i = 0; i < v2Modules.size(); i++) {
            assertThat(v2Labs.get(i).getId()).isEqualTo(expectedV2Ids.get(i));
            assertThat(v2Labs.get(i).getLabOrder()).isEqualTo(i + 1);
            assertThat(v2Labs.get(i).getTitle()).doesNotStartWith("Lab 0");
        }
        assertThat(CourseLabSeederService.isCourseraLabsAligned(v2Labs, v2Modules)).isTrue();
        verify(jdbc, times(6)).update(
                contains("DELETE FROM lab_prerequisites"), any(UUID.class), any(UUID.class));
        verify(quizzes, times(5)).publishCurriculum(eq(workspaceId), any(UUID.class), any());
    }

    @Test
    void upgradesOutdatedReferenceModelToImmutableR2WhenSubmissionSnapshotsExist() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("gv.java@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).code("JAVA-MS-2026").name("Java V2").status("ACTIVE").courseMode(true).build();
        Project refProject = Project.builder()
                .id(UUID.randomUUID())
                .workspace(workspace)
                .owner(lecturer)
                .name("Curated E-Commerce Reference")
                .build();
        SourceSnapshot r1Snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID()).project(refProject).build();
        ModelVersion r1Model = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(refProject)
                .sourceSnapshot(r1Snapshot)
                .revision(1)
                .isLatestValid(true)
                .createdBy(lecturer)
                .build();

        List<ModelElement> oldElements = List.of(
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("api-gateway").elementType("SERVICE_CONTAINER").build(),
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("order-service").elementType("SERVICE_CONTAINER").build(),
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("payment-service").elementType("SERVICE_CONTAINER").build(),
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("inventory-service").elementType("SERVICE_CONTAINER").build());

        var v2Modules = JavaCourseraCatalog.modules();
        List<Assignment> existingLabs = new ArrayList<>();
        for (int i = 0; i < v2Modules.size(); i++) {
            existingLabs.add(Assignment.builder()
                    .id(UUID.randomUUID())
                    .workspace(workspace)
                    .createdBy(lecturer)
                    .title(v2Modules.get(i).labTitle())
                    .description(v2Modules.get(i).labDescription())
                    .labOrder(i + 1)
                    .requireRuntimeTrace(v2Modules.get(i).visualLab() != null && v2Modules.get(i).visualLab().requireRuntimeTrace())
                    .referenceModel(r1Model)
                    .build());
        }

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)).thenReturn(existingLabs);
        when(assignments.saveAndFlush(any(Assignment.class))).thenAnswer(inv -> inv.getArgument(0));
        when(elements.findByModelVersionId(r1Model.getId())).thenReturn(oldElements);
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(refProject.getId()))
                .thenReturn(Optional.of(r1Model));
        when(models.findMaxRevisionByProjectId(refProject.getId())).thenReturn(1);
        when(projects.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        AtomicReference<SourceSnapshot> savedSnapshot = new AtomicReference<>();
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            savedSnapshot.set(s);
            return s;
        });
        AtomicReference<ModelVersion> savedNewModel = new AtomicReference<>();
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            savedNewModel.set(m);
            return m;
        });
        List<ModelElement> newElements = new ArrayList<>();
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            newElements.add(e);
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        when(jdbc.queryForObject(contains("FROM runtime_configurations"), eq(Integer.class), any())).thenReturn(1);
        when(jdbc.queryForObject(contains("FROM runtime_scenarios"), eq(Integer.class), any())).thenReturn(1);
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "IN_PROGRESS", List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_JAVA_COURSERA);

        ModelVersion r2 = savedNewModel.get();
        assertThat(r2).isNotNull();
        assertThat(r2.getId()).isNotEqualTo(r1Model.getId());
        assertThat(r2.getRevision()).isEqualTo(2);
        assertThat(r2.getIsLatestValid()).isTrue();
        assertThat(r1Model.getIsLatestValid()).isFalse();
        assertThat(refProject.getName()).isEqualTo(MocHuongReferenceArchitectureBuilder.SYSTEM_NAME);
        assertThat(refProject.getReferenceSnapshotId()).isEqualTo(savedSnapshot.get().getId());

        verify(models).invalidatePreviousVersions(refProject.getId(), r2.getId());
        verify(elements, never()).deleteAll(any());
        verify(diagrams, never()).deleteAll(any());
        verify(relationships, never()).deleteAll(any());
        verify(evidences, never()).deleteAll(any());

        assertThat(existingLabs).allSatisfy(lab -> assertThat(lab.getReferenceModel().getId()).isEqualTo(r2.getId()));
        assertThat(newElements).extracting(ModelElement::getName).contains(
                "service-discovery", "api-gateway", "identity-service",
                "catalog-service", "order-service", "notification-service",
                "IdentityDataSeeder", "PasswordEncoderConfig", "Admin", "Staff", "Customer");
    }

    @Test
    void seedsCsharpCourseraCourseWith5ActiveOrderedLabsAndFruitShopTopology() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("gv.java@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).code("CSHARP-MS-2026").name("C# .NET 8").status("ACTIVE").courseMode(false).build();

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(workspaces.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)).thenReturn(List.of());
        List<Project> savedProjects = new ArrayList<>();
        when(projects.save(any())).thenAnswer(inv -> {
            Project p = inv.getArgument(0);
            if (p.getId() == null) p.setId(UUID.randomUUID());
            savedProjects.add(p);
            return p;
        });
        when(projects.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            return s;
        });
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            return m;
        });
        List<Assignment> savedAssignments = new ArrayList<>();
        when(assignments.saveAndFlush(any(Assignment.class))).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            savedAssignments.add(a);
            return a;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "ENROLLED", List.of()));

        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        List<ModelElement> savedElements = new ArrayList<>();
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            savedElements.add(e);
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_CSHARP_COURSERA);

        assertThat(savedAssignments).hasSize(5);
        assertThat(savedAssignments).extracting(Assignment::getLabOrder).containsExactly(1, 2, 3, 4, 5);
        assertThat(savedAssignments).allSatisfy(a -> assertThat(a.getTitle()).doesNotStartWith("Lab 0"));
        assertThat(savedAssignments.get(2).getStudioTopologySnapshot().path("blocks").toString())
                .contains("FruitCatalog.API", "FruitOrdering.API");
        assertThat(savedProjects).singleElement()
                .extracting(Project::getName)
                .isEqualTo(FruitShopReferenceArchitectureBuilder.SYSTEM_NAME);
        assertThat(savedElements)
                .extracting(ModelElement::getName)
                .contains("ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API",
                        "Admin", "Staff", "Customer", "OrderSagaService", "OutboxRelayBackgroundService")
                .doesNotContain("order-service", "payment-service", "inventory-service", "service-discovery");
        verify(quizzes, times(5)).publishCurriculum(eq(workspaceId), any(UUID.class), any());
    }

    @Test
    void upgradesOutdatedCsharpModelToImmutableR2ToProjectTraiCay() throws Exception {
        UUID workspaceId = UUID.randomUUID();
        User lecturer = User.builder().id(UUID.randomUUID()).email("gv.csharp@mavis.edu.vn").build();
        Workspace workspace = Workspace.builder()
                .id(workspaceId).code("CSHARP-MS-2026").name("C# .NET 8").status("ACTIVE").courseMode(true).build();
        Project refProject = Project.builder()
                .id(UUID.randomUUID())
                .workspace(workspace)
                .owner(lecturer)
                .name("Curated E-Commerce Reference")
                .build();
        SourceSnapshot r1Snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID()).project(refProject).build();
        ModelVersion r1Model = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(refProject)
                .sourceSnapshot(r1Snapshot)
                .revision(1)
                .isLatestValid(true)
                .createdBy(lecturer)
                .build();

        List<ModelElement> oldElements = List.of(
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("api-gateway").elementType("SERVICE_CONTAINER").build(),
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("order-service").elementType("SERVICE_CONTAINER").build(),
                ModelElement.builder().id(UUID.randomUUID()).modelVersion(r1Model).name("payment-service").elementType("SERVICE_CONTAINER").build());

        var csModules = CsharpCourseraCatalog.modules();
        List<Assignment> existingLabs = new ArrayList<>();
        for (int i = 0; i < csModules.size(); i++) {
            existingLabs.add(Assignment.builder()
                    .id(UUID.randomUUID())
                    .workspace(workspace)
                    .createdBy(lecturer)
                    .title(csModules.get(i).labTitle())
                    .description(csModules.get(i).labDescription())
                    .labOrder(i + 1)
                    .requireRuntimeTrace(csModules.get(i).visualLab() != null && csModules.get(i).visualLab().requireRuntimeTrace())
                    .referenceModel(r1Model)
                    .build());
        }

        AccessPolicyService access = mock(AccessPolicyService.class);
        WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
        AssignmentRepository assignments = mock(AssignmentRepository.class);
        ProjectRepository projects = mock(ProjectRepository.class);
        SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
        ModelVersionRepository models = mock(ModelVersionRepository.class);
        ModelElementRepository elements = mock(ModelElementRepository.class);
        ModelRelationshipRepository relationships = mock(ModelRelationshipRepository.class);
        DiagramVersionRepository diagrams = mock(DiagramVersionRepository.class);
        EvaluationRunRepository evaluations = mock(EvaluationRunRepository.class);
        EvidenceRepository evidences = mock(EvidenceRepository.class);
        CourseQuizService quizzes = mock(CourseQuizService.class);
        CourseAccessService courses = mock(CourseAccessService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        ObjectMapper json = new ObjectMapper();
        CourseCurriculum curriculum = new CourseCurriculum(json);

        when(access.requireCurrentActiveUser()).thenReturn(lecturer);
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId)).thenReturn(existingLabs);
        when(assignments.saveAndFlush(any(Assignment.class))).thenAnswer(inv -> inv.getArgument(0));
        when(elements.findByModelVersionId(r1Model.getId())).thenReturn(oldElements);
        when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(refProject.getId()))
                .thenReturn(Optional.of(r1Model));
        when(models.findMaxRevisionByProjectId(refProject.getId())).thenReturn(1);
        when(projects.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        AtomicReference<SourceSnapshot> savedSnapshot = new AtomicReference<>();
        when(snapshots.save(any())).thenAnswer(inv -> {
            SourceSnapshot s = inv.getArgument(0);
            if (s.getId() == null) s.setId(UUID.randomUUID());
            savedSnapshot.set(s);
            return s;
        });
        AtomicReference<ModelVersion> savedNewModel = new AtomicReference<>();
        when(models.saveAndFlush(any())).thenAnswer(inv -> {
            ModelVersion m = inv.getArgument(0);
            if (m.getId() == null) m.setId(UUID.randomUUID());
            savedNewModel.set(m);
            return m;
        });
        List<ModelElement> newElements = new ArrayList<>();
        when(elements.save(any())).thenAnswer(inv -> {
            ModelElement e = inv.getArgument(0);
            if (e.getId() == null) e.setId(UUID.randomUUID());
            newElements.add(e);
            return e;
        });
        when(relationships.save(any())).thenAnswer(inv -> {
            ModelRelationship r = inv.getArgument(0);
            if (r.getId() == null) r.setId(UUID.randomUUID());
            return r;
        });
        when(evidences.save(any())).thenAnswer(inv -> {
            Evidence ev = inv.getArgument(0);
            if (ev.getId() == null) ev.setId(UUID.randomUUID());
            return ev;
        });
        when(diagrams.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(evaluations.save(any())).thenAnswer(inv -> {
            EvaluationRun run = inv.getArgument(0);
            if (run.getId() == null) run.setId(UUID.randomUUID());
            return run;
        });
        when(courses.roadmap(workspaceId)).thenReturn(new CourseAccessService.Roadmap(true, "ENROLLED", List.of()));

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        seeder.seedCurated(workspaceId, CourseLabSeederService.PRESET_CSHARP_COURSERA);

        assertThat(savedNewModel.get()).isNotNull();
        assertThat(savedNewModel.get().getRevision()).isEqualTo(2);
        assertThat(r1Model.getIsLatestValid()).isFalse();
        assertThat(savedSnapshot.get()).isNotNull();
        assertThat(refProject.getName()).isEqualTo(FruitShopReferenceArchitectureBuilder.SYSTEM_NAME);
        verify(models, never()).delete(any());
        assertThat(existingLabs).allSatisfy(lab -> assertThat(lab.getReferenceModel()).isSameAs(savedNewModel.get()));
        assertThat(existingLabs.stream()
                .filter(lab -> Boolean.TRUE.equals(lab.getRequireRuntimeTrace()))
                .toList())
                .allSatisfy(lab -> assertThat(lab.getStudioTopologySnapshot().path("blocks").toString())
                        .contains("ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API")
                        .doesNotContain("payment-service", "order-service"));
        assertThat(newElements).extracting(ModelElement::getName).contains(
                "ApiGateway", "FruitCatalog.API", "FruitBasket.API", "FruitOrdering.API",
                "Admin", "Staff", "Customer",
                "OrdersController", "OrderSagaService", "OutboxRelayBackgroundService",
                "OrderCreatedConsumer", "YarpReverseProxyPipeline");
    }
}
