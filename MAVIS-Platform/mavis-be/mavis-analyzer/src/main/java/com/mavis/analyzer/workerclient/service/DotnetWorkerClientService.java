package com.mavis.analyzer.workerclient.service;

import com.mavis.workerclient.WorkerContract;
import java.time.Instant;
import java.util.UUID;

public interface DotnetWorkerClientService {
    record Execution(WorkerContract.Context context, WorkerContract.Outcome outcome) {}
    Execution analyze(UUID projectId, UUID snapshotId, UUID jobId, UUID attemptId, String extractedPath, Instant deadline);
    boolean hasDotnetFiles(String extractedPath);

    /** Old name-based/raw-path contract is deliberately disabled during migration. */
    @Deprecated
    default com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO analyzeDotnetIfPresent(UUID projectId, UUID snapshotId, String path) {
        throw new UnsupportedOperationException("LEGACY_DOTNET_CONTRACT_DISABLED");
    }
}