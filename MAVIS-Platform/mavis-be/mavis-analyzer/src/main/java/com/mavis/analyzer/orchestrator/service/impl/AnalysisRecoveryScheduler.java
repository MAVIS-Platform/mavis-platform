package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.common.repository.JobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.List;

@Component @RequiredArgsConstructor @Slf4j
public class AnalysisRecoveryScheduler {
    private final JobRepository jobs;private final JobControlService controls;
    @Scheduled(fixedDelayString="${mavis.worker.recovery-interval-ms:5000}")
    public void reconcile(){for(String status:List.of("PENDING","RUNNING","CANCELLING"))for(var job:jobs.findTop100ByStatusOrderByStartedAtAsc(status))try{controls.reconcile(job.getId());}catch(Exception e){log.warn("Analysis reconciliation pending for job {}",job.getId());}}
}
