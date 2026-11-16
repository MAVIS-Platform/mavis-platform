package com.mavis.analyzer.orchestrator.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service @RequiredArgsConstructor
public class JobControlService {
    private final JobRepository jobs;
    private final AnalysisAttemptRepository attempts;
    private final AnalysisExecutionRegistry executions;
    private final ApplicationEventPublisher events;
    private final ObjectMapper json;
    public record State(UUID jobId,String status){}
    public record AttemptView(UUID id,String status,OffsetDateTime startedAt,OffsetDateTime deadlineUtc,OffsetDateTime completedAt,String diagnosticCode){}
    @Transactional public State cancel(UUID id){var job=jobs.findLockedById(id).orElseThrow(()->missing());owner(job);
        if("PENDING".equals(job.getStatus())){job.setStatus("CANCELLED");job.setCompletedAt(OffsetDateTime.now());jobs.save(job);}
        else if("RUNNING".equals(job.getStatus())||"CANCELLING".equals(job.getStatus())){job.setStatus("CANCELLING");jobs.save(job);attempt(job).ifPresent(a->{a.setStatus("CANCELLING");attempts.save(a);});executions.interrupt(id);}
        return new State(id,job.getStatus());}
    @Transactional(readOnly=true) public List<AttemptView> history(UUID jobId){var job=jobs.findById(jobId).orElseThrow(()->missing());owner(job);return attempts.findByJobIdOrderByStartedAtAsc(jobId).stream().map(a->new AttemptView(a.getId(),a.getStatus(),a.getStartedAt(),a.getDeadlineUtc(),a.getCompletedAt(),a.getDiagnosticCode())).toList();}
    /** Internal bounded reconciliation; called by the scheduler on each instance. */
    @Transactional public void reconcile(UUID id){var job=jobs.findLockedById(id).orElse(null);if(job==null)return;Instant now=Instant.now();
        if("PENDING".equals(job.getStatus())&&job.getStartedAt()!=null&&job.getStartedAt().toInstant().isBefore(now.minusSeconds(30))){
            ObjectNode manifest=job.getResultManifest()!=null&&job.getResultManifest().isObject()?(ObjectNode)job.getResultManifest().deepCopy():json.createObjectNode();
            String dispatched=manifest.path("lastRecoveryDispatchUtc").asText();if(!dispatched.isEmpty()&&Instant.parse(dispatched).isAfter(now.minusSeconds(30)))return;
            manifest.put("lastRecoveryDispatchUtc",now.toString());job.setResultManifest(manifest);jobs.save(job);
            events.publishEvent(new AnalyzeRequestEvent(job.getProject().getId(),job.getSourceSnapshot().getId(),id,job.getSourceSnapshot().getStoragePath()));return;
        }
        if(!Set.of("RUNNING","CANCELLING").contains(job.getStatus()))return;
        if("CANCELLING".equals(job.getStatus()))executions.interrupt(id);
        var attempt=attempt(job);Instant deadline=attempt.map(a->a.getDeadlineUtc().toInstant()).orElseGet(()->job.getStartedAt().toInstant().plusSeconds(120));
        if(!now.isBefore(deadline)){
            String code="CANCELLING".equals(job.getStatus())?"CANCEL_OUTCOME_UNCONFIRMED":"ATTEMPT_DEADLINE_EXPIRED";
            job.setStatus("FAILED");job.setErrorDiagnostics(code);job.setCompletedAt(OffsetDateTime.now());jobs.save(job);attempt.ifPresent(a->{a.setStatus("FAILED");a.setDiagnosticCode(code);a.setCompletedAt(OffsetDateTime.now());attempts.save(a);});
            executions.interrupt(id);
        }
    }

    /**
     * Renew attempt lease for a running job if valid and alive.
     * Capped at maximum 1 renewal of at most 60 seconds.
     */
    @Transactional
    public boolean renewAttemptLease(UUID jobId, UUID attemptId, Duration extension) {
        var jobOpt = jobs.findLockedById(jobId);
        if (jobOpt.isEmpty()) {
            return false;
        }
        Job job = jobOpt.get();
        if (!"RUNNING".equals(job.getStatus())) {
            return false;
        }
        var attemptOpt = attempts.findById(attemptId);
        if (attemptOpt.isEmpty()) {
            return false;
        }
        AnalysisAttempt attempt = attemptOpt.get();
        if (attempt.getJob() == null || !jobId.equals(attempt.getJob().getId())) {
            return false;
        }
        if (!"RUNNING".equals(attempt.getStatus())) {
            return false;
        }

        ObjectNode manifest = job.getResultManifest() != null && job.getResultManifest().isObject()
                ? (ObjectNode) job.getResultManifest().deepCopy()
                : json.createObjectNode();

        int leaseRenewalCount = manifest.path("leaseRenewalCount").asInt(0);
        if (leaseRenewalCount >= 1) {
            return false;
        }

        long secondsToAdd = extension != null ? extension.toSeconds() : 60L;
        if (secondsToAdd <= 0) {
            return false;
        }
        secondsToAdd = Math.min(secondsToAdd, 60L);

        OffsetDateTime currentDeadline = attempt.getDeadlineUtc() != null ? attempt.getDeadlineUtc() : OffsetDateTime.now();
        attempt.setDeadlineUtc(currentDeadline.plusSeconds(secondsToAdd));
        attempts.save(attempt);

        manifest.put("leaseRenewalCount", leaseRenewalCount + 1);
        manifest.put("leaseRenewedAtUtc", Instant.now().toString());
        job.setResultManifest(manifest);
        jobs.save(job);

        return true;
    }

    private Optional<AnalysisAttempt> attempt(Job job){try{return attempts.findById(UUID.fromString(job.getResultManifest().path("attemptId").asText()));}catch(IllegalArgumentException|NullPointerException e){return Optional.empty();}}
    private void owner(Job job){if(!job.getProject().getOwner().getId().equals(SecurityUtils.getCurrentUserId()))throw new BusinessException(ErrorCode.FORBIDDEN,"Job access denied");}
    private static BusinessException missing(){return new BusinessException(ErrorCode.NOT_FOUND,"Job not found");}
}
