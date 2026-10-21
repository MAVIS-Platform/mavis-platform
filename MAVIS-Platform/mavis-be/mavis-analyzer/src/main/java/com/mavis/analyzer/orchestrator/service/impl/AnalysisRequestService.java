package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.Job;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class AnalysisRequestService {
    private final SourceSnapshotRepository snapshots;
    private final ProjectRepository projects;
    private final JobRepository jobs;
    private final ApplicationEventPublisher events;
    public record Accepted(UUID jobId,UUID snapshotId,String status,boolean existing){}
    @Transactional
    public Accepted start(UUID snapshotId,String key){
        if(key==null||!key.matches("[A-Za-z0-9_-]{1,128}"))throw new BusinessException(ErrorCode.BAD_REQUEST,"A bounded Idempotency-Key is required");
        var snapshot=snapshots.findById(snapshotId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Snapshot not found"));
        var project=projects.findLockedById(snapshot.getProject().getId()).orElseThrow();
        if(!project.getOwner().getId().equals(SecurityUtils.getCurrentUserId()))throw new BusinessException(ErrorCode.FORBIDDEN,"Snapshot analysis access denied");
        var previous=jobs.findByProjectIdAndAnalysisRequestKey(project.getId(),key);
        if(previous.isPresent()){
            var job=previous.get();if(!job.getSourceSnapshot().getId().equals(snapshotId))throw new BusinessException(ErrorCode.CONFLICT,"Idempotency key belongs to another snapshot");
            return new Accepted(job.getId(),snapshotId,job.getStatus(),true);
        }
        if(snapshot.getStoragePath()==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"Snapshot artifact unavailable");
        var job=jobs.save(Job.builder().project(project).sourceSnapshot(snapshot).jobType("STATIC_ANALYSIS").status("PENDING").analysisRequestKey(key).build());
        events.publishEvent(new AnalyzeRequestEvent(project.getId(),snapshotId,job.getId(),snapshot.getStoragePath()));
        return new Accepted(job.getId(),snapshotId,"PENDING",false);
    }
}
