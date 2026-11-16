package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import com.mavis.common.entity.CourseDefinition;
import com.mavis.common.entity.CourseModule;
import com.mavis.common.entity.CourseItem;
import com.mavis.common.entity.User;
import com.mavis.common.entity.Workspace;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.AssignmentRepository;
import com.mavis.common.repository.CourseDefinitionRepository;
import com.mavis.common.repository.CourseItemRepository;
import com.mavis.common.repository.CourseModuleRepository;
import com.mavis.common.repository.CourseVersionRepository;
import com.mavis.common.repository.UserRepository;
import com.mavis.common.repository.WorkspaceRepository;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CourseAuthoringServiceTest {
    private final UUID workspaceId = UUID.randomUUID();
    private final UUID lecturerId = UUID.randomUUID();
    private final UUID moduleId = UUID.randomUUID();
    private final AccessPolicyService access = mock(AccessPolicyService.class);
    private final WorkspaceRepository workspaces = mock(WorkspaceRepository.class);
    private final CourseDefinitionRepository courses = mock(CourseDefinitionRepository.class);
    private final CourseModuleRepository modules = mock(CourseModuleRepository.class);
    private final CourseItemRepository items = mock(CourseItemRepository.class);
    private final CourseVersionRepository versions = mock(CourseVersionRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final AssignmentRepository assignments = mock(AssignmentRepository.class);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final CourseAuthoringService service = new CourseAuthoringService(
            access, workspaces, courses, modules, items, versions, users, mapper, assignments, jdbc);
    private Workspace workspace;
    private CourseDefinition course;
    private CourseModule module;

    @BeforeEach
    void setup() {
        workspace = Workspace.builder().id(workspaceId).name("Architecture").courseMode(false).build();
        course = CourseDefinition.builder().id(UUID.randomUUID()).workspace(workspace).title("Microservices")
                .status("DRAFT").draftRevision(2).publishedVersion(0).build();
        module = CourseModule.builder().id(moduleId).course(course).title("Fundamentals").position(1).build();
        when(workspaces.findLockedById(workspaceId)).thenReturn(Optional.of(workspace));
        when(courses.findByWorkspaceId(workspaceId)).thenReturn(Optional.of(course));
        when(courses.findLockedByWorkspaceId(workspaceId)).thenReturn(Optional.of(course));
        when(modules.findByCourseIdOrderByPositionAsc(course.getId())).thenReturn(List.of(module));
        when(modules.findById(moduleId)).thenReturn(Optional.of(module));
        when(items.findByModuleIdOrderByPositionAsc(moduleId)).thenReturn(List.of(
                CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY").title("Boundaries")
                        .position(1).content(JsonNodeFactory.instance.objectNode().put("body", "text")).required(true).build()));
        when(assignments.existsByIdAndWorkspaceId(any(), eq(workspaceId))).thenReturn(true);
        when(users.findById(lecturerId)).thenReturn(Optional.of(User.builder().id(lecturerId).build()));
    }

    @Test
    void savingDraftCreatesCourseAndEnablesCourseMode() {
        when(courses.findByWorkspaceId(workspaceId)).thenReturn(Optional.empty());
        when(courses.save(any(CourseDefinition.class))).thenAnswer(invocation -> {
            CourseDefinition saved = invocation.getArgument(0);
            saved.setId(UUID.randomUUID());
            return saved;
        });
        var result = service.saveDraft(workspaceId, new CourseAuthoringService.CourseRequest("  Java Course ", "Description"));
        assertEquals("Java Course", result.title());
        assertTrue(workspace.isCourseMode());
        assertEquals(1, result.draftRevision());
    }

    @Test
    void modulePrerequisiteMustBelongToAnEarlierModule() {
        var request = new CourseAuthoringService.ModuleRequest("Advanced", null, UUID.randomUUID());
        assertThrows(BusinessException.class, () -> service.addModule(workspaceId, request));
        verify(modules, never()).save(any());
    }

    @Test
    void itemMustReferenceLabInSameWorkspace() {
        UUID foreignAssignment = UUID.randomUUID();
        when(assignments.existsByIdAndWorkspaceId(foreignAssignment, workspaceId)).thenReturn(false);
        var request = new CourseAuthoringService.ItemRequest("RUNTIME_LAB", "Runtime", null,
                foreignAssignment, JsonNodeFactory.instance.objectNode(), true);
        assertThrows(BusinessException.class, () -> service.addItem(workspaceId, moduleId, request));
        verify(items, never()).save(any());
    }

    @Test
    void publishWritesImmutableVersionWithSha256Digest() {
        when(items.findByModuleIdOrderByPositionAsc(moduleId)).thenReturn(List.of(
                CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY").title("Boundaries")
                        .position(1).content(JsonNodeFactory.instance.objectNode().put("body", "text")).required(true).build()));
        when(versions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        try (MockedStatic<SecurityUtils> security = mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getCurrentUserId).thenReturn(lecturerId);
            var published = service.publish(workspaceId);
            assertEquals(1, published.version());
            assertTrue(published.snapshotDigest().matches("sha256:[a-f0-9]{64}"));
            assertEquals("PUBLISHED", course.getStatus());
            assertEquals(1, course.getPublishedVersion());
            verify(versions).save(argThat(version -> version.getSnapshot().has("modules")
                    && version.getSnapshotDigest().equals(published.snapshotDigest())));
        }
    }

    @Test
    void essayNeedsPromptAndRubricBeforePublication() {
        CourseItem essay = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("ESSAY").title("Explain tradeoffs")
                .position(1).content(JsonNodeFactory.instance.objectNode().put("prompt", "Explain the design")).required(true).build();
        when(items.findByModuleIdOrderByPositionAsc(moduleId)).thenReturn(List.of(essay));
        try (MockedStatic<SecurityUtils> security = mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getCurrentUserId).thenReturn(lecturerId);
            assertThrows(BusinessException.class, () -> service.publish(workspaceId));
        }
        verify(versions, never()).save(any());
    }

    @Test
    void runtimeItemRequiresRuntimeTraceLab() {
        UUID assignmentId = UUID.randomUUID();
        when(assignments.existsByIdAndWorkspaceId(assignmentId, workspaceId)).thenReturn(true);
        when(assignments.findWithDetailsById(assignmentId)).thenReturn(Optional.empty());
        when(items.findByModuleIdOrderByPositionAsc(moduleId)).thenReturn(List.of(
                CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("RUNTIME_LAB").title("Runtime")
                        .position(1).assignmentId(assignmentId).content(JsonNodeFactory.instance.objectNode()).required(true).build()));
        try (MockedStatic<SecurityUtils> security = mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getCurrentUserId).thenReturn(lecturerId);
            assertThrows(BusinessException.class, () -> service.publish(workspaceId));
        }
        verify(versions, never()).save(any());
    }

    @Test
    void publishingExactSameContentTwiceIsRejected() {
        when(versions.existsByCourseIdAndSnapshotDigest(eq(course.getId()), anyString())).thenReturn(true);
        try (MockedStatic<SecurityUtils> security = mockStatic(SecurityUtils.class)) {
            security.when(SecurityUtils::getCurrentUserId).thenReturn(lecturerId);
            assertThrows(BusinessException.class, () -> service.publish(workspaceId));
        }
        verify(versions, never()).save(any());
    }

    @Test
    void publishedCourseCannotBeModifiedThroughAddModule() {
        course.setStatus("PUBLISHED");
        assertThrows(BusinessException.class, () -> service.addModule(workspaceId,
                new CourseAuthoringService.ModuleRequest("New", null, null)));
    }

    @Test
    void updateModuleWritesEditableFieldsAndBumpsDraft() {
        var result = service.updateModule(workspaceId, moduleId,
                new CourseAuthoringService.ModuleRequest("  Advanced  ", "Deep dive", null));

        assertEquals("Advanced", module.getTitle());
        assertEquals("Deep dive", module.getDescription());
        assertEquals(3, course.getDraftRevision());
        assertTrue(result.modules().stream().anyMatch(view -> view.id().equals(moduleId)
                && view.title().equals("Advanced")));
        verify(modules).save(module);
    }

    @Test
    void updateItemReplacesTheoryBodyAndKeepsModuleScope() {
        CourseItem item = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("Old").position(1).content(JsonNodeFactory.instance.objectNode().put("body", "old"))
                .required(true).build();
        when(items.findById(item.getId())).thenReturn(Optional.of(item));

        service.updateItem(workspaceId, moduleId, item.getId(), new CourseAuthoringService.ItemRequest(
                "THEORY", " New title ", "Description", null,
                JsonNodeFactory.instance.objectNode().put("body", "new body"), false));

        assertEquals("New title", item.getTitle());
        assertEquals("new body", item.getContent().path("body").asText());
        assertFalse(item.isRequired());
        verify(items).save(item);
    }

    @Test
    void moveItemSwapsPositionsThroughTemporarySlots() {
        CourseItem first = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("First").position(1).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        CourseItem second = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("Second").position(2).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        when(items.findByModuleIdOrderByPositionAsc(moduleId)).thenReturn(new java.util.ArrayList<>(List.of(first, second)));

        service.moveItem(workspaceId, moduleId, first.getId(), "DOWN");

        assertEquals(2, first.getPosition());
        assertEquals(1, second.getPosition());
        verify(items, times(2)).saveAndFlush(first);
        verify(items).saveAndFlush(second);
    }

    @Test
    void deleteItemFlushesAndRenumbersRemainingItems() {
        CourseItem first = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("First").position(1).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        CourseItem second = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("Second").position(2).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        CourseItem third = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("Third").position(3).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        when(items.findById(second.getId())).thenReturn(Optional.of(second));
        when(items.findByModuleIdOrderByPositionAsc(moduleId))
                .thenReturn(new java.util.ArrayList<>(List.of(first, third)));

        service.deleteItem(workspaceId, moduleId, second.getId());

        verify(items).delete(second);
        verify(items).flush();
        assertEquals(1, first.getPosition());
        assertEquals(2, third.getPosition());
        verify(items).saveAndFlush(third);
    }

    @Test
    void moveModuleRejectsBreakingPrerequisiteOrder() {
        CourseModule second = CourseModule.builder().id(UUID.randomUUID()).course(course).title("Advanced")
                .position(2).prerequisiteModuleId(moduleId).build();
        when(modules.findByCourseIdOrderByPositionAsc(course.getId()))
                .thenReturn(new java.util.ArrayList<>(List.of(module, second)));

        assertThrows(BusinessException.class, () -> service.moveModule(workspaceId, second.getId(), "UP"));
        verify(modules, never()).saveAndFlush(any());
    }

    @Test
    void publishedCourseRejectsItemUpdate() {
        course.setStatus("PUBLISHED");
        CourseItem item = CourseItem.builder().id(UUID.randomUUID()).module(module).itemType("THEORY")
                .title("Old").position(1).content(JsonNodeFactory.instance.objectNode()).required(true).build();
        when(items.findById(item.getId())).thenReturn(Optional.of(item));

        assertThrows(BusinessException.class, () -> service.updateItem(workspaceId, moduleId, item.getId(),
                new CourseAuthoringService.ItemRequest("THEORY", "New", null, null,
                        JsonNodeFactory.instance.objectNode().put("body", "new"), true)));
        verify(items, never()).save(any());
    }
}
