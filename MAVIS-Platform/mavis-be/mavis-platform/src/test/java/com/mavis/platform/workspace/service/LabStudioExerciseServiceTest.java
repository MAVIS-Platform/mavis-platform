package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.LabStudioExercise;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.LabStudioExerciseRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import com.mavis.common.repository.SourceSnapshotRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LabStudioExerciseServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID labId = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final Workspace workspace = Workspace.builder().id(workspaceId).name("Class").status("ACTIVE").build();
    private final Assignment lab = Assignment.builder().id(labId).workspace(workspace).title("Lab").build();

    private final LabStudioExerciseRepository exercises = mock(LabStudioExerciseRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final ProjectRepository projects = mock(ProjectRepository.class);
    private final ModelVersionRepository models = mock(ModelVersionRepository.class);
    private final SourceSnapshotRepository snapshots = mock(SourceSnapshotRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final ObjectMapper json = new ObjectMapper();
    private final LabStudioExerciseService service = new LabStudioExerciseService(exercises, assignments,
            projects, models, snapshots, access, json);

    @Test
    void rejectsCodeEditingOrNonReadBaselineRequests() {
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        var request = new LabStudioExerciseService.ExerciseRequest(null, null, null,
                List.of(new LabStudioExerciseService.BaselineRequest("POST", "/orders", 200)),
                null, null, null, "Do it");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.save(workspaceId, labId, request));

        assertEquals("STUDIO_EXERCISE_INVALID", error.getStableCode());
        verify(exercises, never()).save(any());
    }

    @Test
    void rejectsUnsupportedStudentActions() {
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        var request = new LabStudioExerciseService.ExerciseRequest(null, null, null,
                List.of(), null, List.of("DELETE_CODE"), null, "Do it");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.save(workspaceId, labId, request));

        assertEquals("STUDIO_EXERCISE_INVALID", error.getStableCode());
    }

    @Test
    void rejectsRuntimeRepositoryFromAnotherWorkspace() {
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(projects.findById(projectId)).thenReturn(Optional.of(Project.builder().id(projectId)
                .workspace(Workspace.builder().id(UUID.randomUUID()).build()).status("ACTIVE").build()));
        var request = new LabStudioExerciseService.ExerciseRequest(projectId, UUID.randomUUID(),
                UUID.randomUUID(), List.of(), null, null, null, "Do it");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.save(workspaceId, labId, request));

        assertEquals("STUDIO_EXERCISE_INVALID", error.getStableCode());
    }

    @Test
    void savesExerciseAndIncrementsRevision() {
        var actor = User.builder().id(UUID.randomUUID()).fullName("Lecturer").build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        when(exercises.findByAssignmentId(labId)).thenReturn(Optional.empty());
        when(exercises.save(any(LabStudioExercise.class))).thenAnswer(invocation -> {
            LabStudioExercise saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        var request = new LabStudioExerciseService.ExerciseRequest(null, null, null,
                List.of(new LabStudioExerciseService.BaselineRequest("GET", "/health", 200)),
                new LabStudioExerciseService.InitialState(List.of("payment"), List.of("orders-payment-route")),
                List.of("START", "STOP", "SCALE"),
                new LabStudioExerciseService.SuccessCriteria(0, 400,
                        new LabStudioExerciseService.TraceEdge("orders", "payment"),
                        List.of(new LabStudioExerciseService.ReplicaTarget("orders", 2))),
                "Bring the payment path back to 0% errors.");

        var view = service.save(workspaceId, labId, request);

        assertEquals(1, view.revision());
        assertEquals(List.of("START", "STOP", "SCALE"), view.allowedActions());
        assertEquals("orders", view.successCriteria().requiredTraceEdge().from());
        assertEquals(List.of("payment"), view.initialState().stoppedServices());
        verify(access).requireWorkspaceLecturer(workspaceId);
    }
}
