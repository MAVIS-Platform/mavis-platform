package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CourseLifecycleServiceTest {

    @Mock CourseAuthoringService authoring;
    @Mock CourseAccessService courseAccess;
    @InjectMocks CourseLifecycleService lifecycle;

    @Test
    void activationPublishesLinkedLabsBeforeCourseSnapshot() {
        UUID workspaceId = UUID.randomUUID();
        UUID assignmentId = UUID.randomUUID();
        var item = new CourseAuthoringService.ItemView(UUID.randomUUID(), "STATIC_LAB", "Lab", null,
                1, assignmentId, JsonNodeFactory.instance.objectNode(), true);
        var module = new CourseAuthoringService.ModuleView(UUID.randomUUID(), "Module", null,
                1, null, List.of(item));
        var course = new CourseAuthoringService.CourseView(UUID.randomUUID(), workspaceId, "Course", null,
                "DRAFT", 1, 0, List.of(module));
        when(authoring.findExistingForAuthoring(workspaceId)).thenReturn(Optional.of(course));

        lifecycle.activate(workspaceId);

        var order = inOrder(courseAccess, authoring);
        order.verify(courseAccess).publish(workspaceId, assignmentId);
        order.verify(authoring).publishForActivation(workspaceId);
    }

    @Test
    void activationStopsBeforeCoursePublishWhenLabPublishFails() {
        UUID workspaceId = UUID.randomUUID();
        UUID assignmentId = UUID.randomUUID();
        var item = new CourseAuthoringService.ItemView(UUID.randomUUID(), "RUNTIME_LAB", "Lab", null,
                1, assignmentId, JsonNodeFactory.instance.objectNode(), true);
        var module = new CourseAuthoringService.ModuleView(UUID.randomUUID(), "Module", null,
                1, null, List.of(item));
        var course = new CourseAuthoringService.CourseView(UUID.randomUUID(), workspaceId, "Course", null,
                "DRAFT", 1, 0, List.of(module));
        when(authoring.findExistingForAuthoring(workspaceId)).thenReturn(Optional.of(course));
        when(courseAccess.publish(workspaceId, assignmentId))
                .thenThrow(new BusinessException(ErrorCode.CONFLICT, "Lab is not ready"));

        assertThrows(BusinessException.class, () -> lifecycle.activate(workspaceId));
        verify(authoring, never()).publishForActivation(workspaceId);
    }
}
