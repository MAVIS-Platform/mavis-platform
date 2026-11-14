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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
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
        when(assignments.saveAndFlush(any())).thenAnswer(inv -> {
            Assignment a = inv.getArgument(0);
            if (a.getId() == null) a.setId(UUID.randomUUID());
            return a;
        });

        CourseAccessService.Roadmap expectedRoadmap = new CourseAccessService.Roadmap(
                true,
                null,
                List.of(
                        new CourseAccessService.Lab(UUID.randomUUID(), 1, "Lab 01 · Static C1–C3 Architecture & OpenFeign Reverse BFS", "UNLOCKED", null),
                        new CourseAccessService.Lab(UUID.randomUUID(), 2, "Lab 02 · Runtime Resilience, Circuit Breaker & Stop/Scale Impact", "UNLOCKED", null)
                )
        );
        when(courses.roadmap(workspaceId)).thenReturn(expectedRoadmap);

        CourseLabSeederService seeder = new CourseLabSeederService(
                access, workspaces, assignments, projects, snapshots, models,
                elements, relationships, diagrams, evaluations, evidences,
                curriculum, quizzes, courses, jdbc, json, tempDir.toString());

        CourseAccessService.Roadmap seeded = seeder.seedCurated(workspaceId);
        assertThat(seeded.guided()).isTrue();
        assertThat(seeded.labs()).hasSize(2);
        assertThat(workspace.isCourseMode()).isTrue();
        assertThat(savedSnap.get()).isNotNull();

        LabReferenceArchive archiveResolver = new LabReferenceArchive(tempDir.toString());
        assertThat(archiveResolver.resolve(savedSnap.get(), true).exists()).isTrue();

        verify(diagrams, times(1)).saveAll(anyList());
        verify(evaluations, times(1)).save(any());
        verify(quizzes, times(2)).publishCurriculum(eq(workspaceId), any(UUID.class), any());

        // Second call is idempotent when labs already exist
        when(assignments.findByWorkspaceIdAndLabOrderIsNotNullOrderByLabOrderAsc(workspaceId))
                .thenReturn(List.of(Assignment.builder().id(UUID.randomUUID()).labOrder(1).build()));
        CourseAccessService.Roadmap second = seeder.seedCurated(workspaceId);
        assertThat(second).isEqualTo(expectedRoadmap);
        verify(projects, times(1)).save(any());
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
}
