package com.mavis.common.event;

import java.util.UUID;

/** Published when a lecturer publishes a Lab to a class; triggers async sandbox image pre-pull (Phase E2). */
public record LabPublishedEvent(UUID assignmentId, UUID projectId, UUID snapshotId) {}
