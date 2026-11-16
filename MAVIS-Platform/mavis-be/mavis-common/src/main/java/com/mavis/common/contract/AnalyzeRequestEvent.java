package com.mavis.common.contract;

import java.util.UUID;

public record AnalyzeRequestEvent(
        UUID projectId,
        UUID snapshotId,
        UUID jobId,
        String zipFilePath
) {
    public AnalyzeRequestEvent(UUID projectId, String zipFilePath) {
        this(projectId, null, null, zipFilePath);
    }
}
