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

    @Test
    void publishesRuntimeSnapshotAndAttachesMissingLabReferenceOnSave() {
        var actor = User.builder().id(UUID.randomUUID()).fullName("Lecturer").build();
        UUID modelId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        var project = Project.builder().id(projectId).workspace(workspace).status("ACTIVE").build();
        var snapshot = com.mavis.common.entity.SourceSnapshot.builder()
                .id(snapshotId).project(project).isPublished(false).build();
        var model = com.mavis.common.entity.ModelVersion.builder()
                .id(modelId).project(project).sourceSnapshot(snapshot).revision(1).build();

        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(projects.findById(projectId)).thenReturn(Optional.of(project));
        when(models.findById(modelId)).thenReturn(Optional.of(model));
        when(snapshots.findById(snapshotId)).thenReturn(Optional.of(snapshot));
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        when(exercises.findByAssignmentId(labId)).thenReturn(Optional.empty());
        when(exercises.save(any(LabStudioExercise.class))).thenAnswer(inv -> inv.getArgument(0));

        var request = new LabStudioExerciseService.ExerciseRequest(
                projectId, modelId, snapshotId,
                List.of(new LabStudioExerciseService.BaselineRequest("GET", "/orders", 200)),
                new LabStudioExerciseService.InitialState(List.of("payment"), List.of("orders-payment-route")),
                List.of("START", "STOP", "SCALE"),
                null,
                "Fix the payment route.");

        service.save(workspaceId, labId, request);

        assertTrue(Boolean.TRUE.equals(snapshot.getIsPublished()));
        assertEquals("TEACHER_REFERENCE", project.getProjectType());
        assertTrue(Boolean.TRUE.equals(project.getIsReferenceTemplate()));
        assertEquals(model, lab.getReferenceModel());
        verify(snapshots).save(snapshot);
        verify(projects).save(project);
        verify(assignments).save(lab);
    }

    @Test
    void savesChangeImpactTemplateWithFaultActionsAndDeclarativeRules() {
        var actor = User.builder().id(UUID.randomUUID()).fullName("Lecturer").build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        when(exercises.findByAssignmentId(labId)).thenReturn(Optional.empty());
        when(exercises.save(any(LabStudioExercise.class))).thenAnswer(inv -> inv.getArgument(0));

        var criteria = new LabStudioExerciseService.SuccessCriteria(
                null, 500, null, List.of(),
                "CHANGE_IMPACT", true, 0.75,
                new LabStudioExerciseService.ChangeAction("PAUSE", "payment-service", null, null, null),
                List.of(new LabStudioExerciseService.DeclarativeRule("EDGE_ERROR_RATE", "order-service->payment-service", "GT", 50.0, "Edge fails")));
        var request = new LabStudioExerciseService.ExerciseRequest(
                null, null, null,
                List.of(new LabStudioExerciseService.BaselineRequest("GET", "/orders", 200)),
                new LabStudioExerciseService.InitialState(List.of(), List.of()),
                List.of("PAUSE", "RESUME", "THROTTLE_CPU", "SET_LOAD"),
                criteria,
                "Predict affected services before pausing payment-service.");

        var view = service.save(workspaceId, labId, request);

        assertEquals("CHANGE_IMPACT", view.successCriteria().exerciseType());
        assertEquals(Boolean.TRUE, view.successCriteria().predictionRequired());
        assertEquals(0.75, view.successCriteria().minImpactF1());
        assertEquals("PAUSE", view.successCriteria().targetChangeAction().action());
        assertEquals(1, view.successCriteria().rules().size());
        assertEquals(List.of("PAUSE", "RESUME", "THROTTLE_CPU", "SET_LOAD"), view.allowedActions());

        // Reject unsupported declarative rule metric
        var badRule = new LabStudioExerciseService.SuccessCriteria(
                null, null, null, List.of(), "CUSTOM", false, null, null,
                List.of(new LabStudioExerciseService.DeclarativeRule("BOGUS_METRIC", "ALL", "LTE", 10.0, null)));
        assertThrows(BusinessException.class, () -> service.save(workspaceId, labId,
                new LabStudioExerciseService.ExerciseRequest(null, null, null, List.of(), null, null, badRule, "bad")));

        // Reject replica targets and SCALE targetChangeAction above 3
        var tooManyReplicas = new LabStudioExerciseService.SuccessCriteria(
                0, null, null, List.of(new LabStudioExerciseService.ReplicaTarget("orders", 4)));
        assertThrows(BusinessException.class, () -> service.save(workspaceId, labId,
                new LabStudioExerciseService.ExerciseRequest(null, null, null, List.of(), null, null, tooManyReplicas, "bad")));

        var badScaleAction = new LabStudioExerciseService.SuccessCriteria(
                0, null, null, List.of(), "SCALE_UNDER_LOAD", false, null,
                new LabStudioExerciseService.ChangeAction("SCALE", "orders", 4, null, null), List.of());
        assertThrows(BusinessException.class, () -> service.save(workspaceId, labId,
                new LabStudioExerciseService.ExerciseRequest(null, null, null, List.of(), null, null, badScaleAction, "bad")));
    }

    @Test
    void getPrefersFrozenStudioExerciseSnapshotOnPublishedActiveCourseLab() throws Exception {
        workspace.setCourseMode(true);
        workspace.setStatus("ACTIVE");
        lab.setLabOrder(3);
        lab.setStudioExerciseSnapshot(json.readTree("""
                {
                  "initialState": { "stoppedServices": ["inventory-service"], "stoppedControllers": [] },
                  "allowedActions": ["START", "STOP"],
                  "successCriteria": {
                    "exerciseType": "CIRCUIT_BREAKER",
                    "maxErrorRatePercent": 0,
                    "targetChangeAction": { "action": "START", "service": "inventory-service" }
                  },
                  "instructions": "Khôi phục sự cố",
                  "revision": 2
                }
                """));
        LabStudioExercise staleDraft = LabStudioExercise.builder()
                .assignment(lab)
                .initialState(json.readTree("""
                        { "stoppedServices": ["payment-service"], "stoppedControllers": [] }
                        """))
                .revision(5)
                .build();
        when(assignments.findById(labId)).thenReturn(Optional.of(lab));
        when(exercises.findByAssignmentId(labId)).thenReturn(Optional.of(staleDraft));

        var view = service.get(workspaceId, labId);
        assertEquals(List.of("inventory-service"), view.initialState().stoppedServices());
        assertEquals("inventory-service", view.successCriteria().targetChangeAction().service());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.save(
                workspaceId, labId,
                new LabStudioExerciseService.ExerciseRequest(
                        null, null, null, List.of(), null, List.of("START"), null, "Edited while active")));
        assertTrue(ex.getMessage().contains("frozen"));
    }
}
