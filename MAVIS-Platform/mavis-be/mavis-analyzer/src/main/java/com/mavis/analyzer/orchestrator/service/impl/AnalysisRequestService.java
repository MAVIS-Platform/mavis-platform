package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AnalysisRequestService {
    private final SourceSnapshotRepository snapshots;
    private final ProjectRepository projects;
    private final JobRepository jobs;
    private final AccessPolicyService accessPolicy;
    private final ApplicationEventPublisher events;

    public record Accepted(UUID jobId, UUID snapshotId, String status, boolean existing) {}

    @Transactional
    public Accepted start(UUID snapshotId, String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,128}")) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "A bounded Idempotency-Key is required");
        }
        var snapshot = snapshots.findById(snapshotId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Snapshot not found"));
        var project = projects.findLockedById(snapshot.getProject().getId()).orElseThrow();
        accessPolicy.requireProjectWriteAccess(project);

        if("DELETED".equalsIgnoreCase(project.getStatus()))throw new BusinessException(ErrorCode.NOT_FOUND,"Project not found");
        var previous = jobs.findByProjectIdAndAnalysisRequestKey(project.getId(), key);
        if (previous.isPresent()) {
            var job = previous.get();
            if (!job.getSourceSnapshot().getId().equals(snapshotId)) {
                throw new BusinessException(ErrorCode.CONFLICT, "Idempotency key belongs to another snapshot");
            }
            return new Accepted(job.getId(), snapshotId, job.getStatus(), true);
        }

        // Auto-fail stale jobs older than 10 minutes to prevent permanent 409 Conflict locks
        OffsetDateTime tenMinutesAgo = OffsetDateTime.now().minusMinutes(10);
        List<Job> activeJobs = jobs.findByProjectIdAndJobTypeAndStatusIn(
                project.getId(), "STATIC_ANALYSIS", List.of("PENDING", "RUNNING", "CANCELLING"));
        for (Job activeJob : activeJobs) {
            OffsetDateTime startTime = activeJob.getStartedAt();
            if (startTime != null && startTime.isBefore(tenMinutesAgo)) {
                activeJob.setStatus("FAILED");
                activeJob.setErrorDiagnostics("Timed out or interrupted by server restart");
                activeJob.setCompletedAt(OffsetDateTime.now());
                jobs.save(activeJob);
            }
        }

        // The project lock serializes requests with different idempotency keys as well.
        if (jobs.existsByProjectIdAndJobTypeAndStatusIn(project.getId(), "STATIC_ANALYSIS", List.of("PENDING", "RUNNING", "CANCELLING"))) {
            throw new BusinessException(ErrorCode.CONFLICT, "This project already has an analysis in progress. Wait for it to finish before starting another analysis.");
        }
        if (snapshot.getStoragePath() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Snapshot artifact unavailable");
        }
        var job = jobs.save(Job.builder()
                .project(project)
                .sourceSnapshot(snapshot)
                .jobType("STATIC_ANALYSIS")
                .status("PENDING")
                .analysisRequestKey(key)
                .build());
        events.publishEvent(new AnalyzeRequestEvent(project.getId(), snapshotId, job.getId(), snapshot.getStoragePath()));
        return new Accepted(job.getId(), snapshotId, "PENDING", false);
    }
}
