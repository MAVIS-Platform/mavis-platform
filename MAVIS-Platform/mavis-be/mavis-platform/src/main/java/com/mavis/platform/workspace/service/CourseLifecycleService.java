package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.UUID;

/** Coordinates the authoring-to-learner transition for a Lecturer course. */
@Service
@RequiredArgsConstructor
@Transactional(rollbackFor = Exception.class)
public class CourseLifecycleService {

    private final CourseAuthoringService authoring;
    private final CourseAccessService courseAccess;

    public void activate(UUID workspaceId) {
        CourseAuthoringService.CourseView course = authoring.findExistingForAuthoring(workspaceId)
                .orElseThrow(() -> new BusinessException(
                        ErrorCode.UNPROCESSABLE_ENTITY,
                        "Create the course roadmap before activating this course"));

        if ("ARCHIVED".equals(course.status())) {
            course = authoring.startDraft(workspaceId);
        }

        var assignmentIds = new LinkedHashSet<UUID>();
        course.modules().forEach(module -> module.items().forEach(item -> {
            if (item.assignmentId() != null) assignmentIds.add(item.assignmentId());
        }));
        assignmentIds.forEach(assignmentId -> courseAccess.publish(workspaceId, assignmentId));

        if (!"PUBLISHED".equals(course.status())) {
            authoring.publishForActivation(workspaceId);
        }
    }

    public void prepareAuthoring(UUID workspaceId) {
        authoring.findExistingForAuthoring(workspaceId).ifPresent(course -> {
            if ("PUBLISHED".equals(course.status()) || "ARCHIVED".equals(course.status())) {
                authoring.startDraft(workspaceId);
            }
        });
    }
}
