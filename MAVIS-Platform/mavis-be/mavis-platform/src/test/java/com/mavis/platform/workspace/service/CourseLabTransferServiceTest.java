package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Assignment;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseLabTransferServiceTest {

    private final UUID workspaceId = UUID.randomUUID();
    private final UUID labId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final UUID actorId = UUID.randomUUID();

    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final CourseDefinitionRepository courses = mock(CourseDefinitionRepository.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final CourseAuthoringService authoring = mock(CourseAuthoringService.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ObjectMapper json = new ObjectMapper();
    private final CourseLabTransferService service =
            new CourseLabTransferService(assignments, courses, workspaces, access, authoring, jdbc, json);

    @Test
    void rejectsFilesThatAreNotMavisLabBundles() {
        var bundle = new CourseLabTransferService.Bundle("other.format", 1, null,
                new CourseLabTransferService.LabInfo("Lab", "", "THEORY_QUIZ", false, List.of(), null),
                null, List.of(), null);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.importLab(workspaceId, bundle));

        assertEquals(ErrorCode.BAD_REQUEST, error.getErrorCode());
        verifyNoInteractions(assignments, courses, workspaces, authoring, jdbc);
    }

    @Test
    void rejectsBundlesWithTooManyTheoryLessons() {
        List<CourseLabTransferService.TheoryItem> theory = new ArrayList<>();
        for (int index = 0; index < 51; index++) {
            theory.add(new CourseLabTransferService.TheoryItem("Lesson " + index, "Body"));
        }
        var bundle = new CourseLabTransferService.Bundle(CourseLabTransferService.FORMAT, 1, null,
                new CourseLabTransferService.LabInfo("Lab", "", "THEORY_QUIZ", false, List.of(), null),
                null, theory, null);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.importLab(workspaceId, bundle));

        assertEquals(ErrorCode.BAD_REQUEST, error.getErrorCode());
        verifyNoInteractions(assignments, authoring, jdbc);
    }

    @Test
    void importsLabTheoryAndQuizDraftIntoTheWorkspace() {
        var workspace = Workspace.builder().id(workspaceId).name("Software Architecture").status("ACTIVE").build();
        var actor = User.builder().id(actorId).build();
        when(workspaces.findById(workspaceId)).thenReturn(Optional.of(workspace));
        when(access.requireCurrentActiveUser()).thenReturn(actor);
        when(courses.findByWorkspaceId(workspaceId)).thenReturn(Optional.empty());
        when(assignments.save(any(Assignment.class))).thenAnswer(invocation -> {
            Assignment saved = invocation.getArgument(0);
            saved.setId(labId);
            return saved;
        });
        var moduleView = new CourseAuthoringService.ModuleView(moduleId, "Imported", null, 1, null, List.of());
        when(authoring.addModule(eq(workspaceId), any())).thenReturn(new CourseAuthoringService.CourseView(
                UUID.randomUUID(), workspaceId, "Course", "", "DRAFT", 2, 0, List.of(moduleView)));

        var question = new CourseQuizService.Question(null, "Who owns payment state?",
                "SINGLE_CHOICE", List.of("orders", "payment"), 1, null, "Theory says payment.", 1);
        var bundle = new CourseLabTransferService.Bundle(
                CourseLabTransferService.FORMAT, 1, "2026-11-17T00:00:00Z",
                new CourseLabTransferService.LabInfo("Payment resilience", "Investigate retries",
                        "THEORY_QUIZ", false, List.of("CONTEXT"), "SWD_DEFAULT_V1"),
                new CourseLabTransferService.SourceInfo("https://github.com/org/repo", "main", "abc123", 3),
                List.of(new CourseLabTransferService.TheoryItem("Payment state", "Payment owns its state.")),
                new CourseLabTransferService.Quiz("Lesson", 80, List.of(question)));

        var result = service.importLab(workspaceId, bundle);

        assertEquals(labId, result.assignmentId());
        assertEquals("Payment resilience", result.title());
        assertEquals(1, result.theoryCount());
        assertTrue(result.quizImported());
        assertTrue(result.notes().stream().anyMatch(note -> note.contains("https://github.com/org/repo")));

        var saved = org.mockito.ArgumentCaptor.forClass(Assignment.class);
        verify(assignments).save(saved.capture());
        assertEquals("Payment resilience", saved.getValue().getTitle());
        assertEquals("THEORY_QUIZ", saved.getValue().getLabMode());
        assertEquals(workspaceId, saved.getValue().getWorkspace().getId());

        verify(authoring).saveDraft(eq(workspaceId), any());
        verify(authoring).addItem(eq(workspaceId), eq(moduleId), argThat(item ->
                "THEORY".equals(item.type()) && labId.equals(item.assignmentId())));
        verify(jdbc).update(contains("course_quiz_drafts"), eq(labId), eq("Lesson"), eq(80),
                anyString(), eq(actorId));
    }
}
