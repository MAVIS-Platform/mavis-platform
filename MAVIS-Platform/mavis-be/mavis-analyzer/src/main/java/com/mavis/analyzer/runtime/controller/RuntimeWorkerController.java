package com.mavis.analyzer.runtime.controller;

import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.impl.RuntimeQueueCoordinator;
import com.mavis.common.dto.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/analyzer/runtime/workers")
@RequiredArgsConstructor
public class RuntimeWorkerController {

    private final RunnerServiceAuthGuard runnerServiceAuthGuard;
    private final RuntimeQueueCoordinator runtimeQueueCoordinator;

    public record WorkerClaimRequest(String workerId, String isolationRuntime) {}

    @PostMapping("/claim")
    public ApiResponse<RuntimeQueueCoordinator.WorkerClaimResult> claimNextJob(
            @RequestBody(required = false) WorkerClaimRequest request) {
        runnerServiceAuthGuard.requireRunnerService();
        String workerId = request != null ? request.workerId() : null;
        String runtime = request != null ? request.isolationRuntime() : null;
        RuntimeQueueCoordinator.WorkerClaimResult claimed =
                runtimeQueueCoordinator.claimNextQueuedForRemoteWorker(workerId, runtime);
        return ApiResponse.success("Worker claim processed", claimed);
    }
}
