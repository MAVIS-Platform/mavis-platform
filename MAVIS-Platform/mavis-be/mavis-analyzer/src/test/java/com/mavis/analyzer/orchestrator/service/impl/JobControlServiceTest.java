package com.mavis.analyzer.orchestrator.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.common.entity.AnalysisAttempt;
import com.mavis.common.entity.Job;
import com.mavis.common.repository.AnalysisAttemptRepository;
import com.mavis.common.repository.JobRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobControlServiceTest {

    @Mock
    private JobRepository jobs;

    @Mock
    private AnalysisAttemptRepository attempts;

    @Mock
    private AnalysisExecutionRegistry executions;

    @Mock
    private ApplicationEventPublisher events;

    @Spy
    private ObjectMapper json = new ObjectMapper();

    @InjectMocks
    private JobControlService jobControlService;

    private UUID jobId;
    private UUID attemptId;
    private Job job;
    private AnalysisAttempt attempt;

    @BeforeEach
    void setUp() {
        jobId = UUID.randomUUID();
        attemptId = UUID.randomUUID();

        job = Job.builder()
                .id(jobId)
                .status("RUNNING")
                .startedAt(OffsetDateTime.now().minusMinutes(1))
                .build();

        attempt = AnalysisAttempt.builder()
                .id(attemptId)
                .job(job)
                .status("RUNNING")
                .ownerInstance(UUID.randomUUID())
                .startedAt(OffsetDateTime.now().minusMinutes(1))
                .deadlineUtc(OffsetDateTime.now().plusSeconds(30))
                .build();
    }

    @Test
    @DisplayName("renewAttemptLease gia hạn thành công khi job và attempt đang RUNNING")
    void testRenewAttemptLease_Success() {
        OffsetDateTime originalDeadline = attempt.getDeadlineUtc();

        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));
        when(attempts.findById(attemptId)).thenReturn(Optional.of(attempt));

        boolean renewed = jobControlService.renewAttemptLease(jobId, attemptId, Duration.ofSeconds(45));

        assertThat(renewed).isTrue();
        assertThat(attempt.getDeadlineUtc()).isAfterOrEqualTo(originalDeadline.plusSeconds(44));
        verify(attempts).save(attempt);
        verify(jobs).save(job);
        assertThat(job.getResultManifest().path("leaseRenewalCount").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("renewAttemptLease giới hạn tối đa 60s dù extension yêu cầu lớn hơn 60s")
    void testRenewAttemptLease_CappedAt60s() {
        OffsetDateTime originalDeadline = attempt.getDeadlineUtc();

        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));
        when(attempts.findById(attemptId)).thenReturn(Optional.of(attempt));

        boolean renewed = jobControlService.renewAttemptLease(jobId, attemptId, Duration.ofSeconds(120));

        assertThat(renewed).isTrue();
        assertThat(attempt.getDeadlineUtc()).isEqualTo(originalDeadline.plusSeconds(60));
    }

    @Test
    @DisplayName("renewAttemptLease từ chối gia hạn lần thứ 2 (chỉ cho phép tối đa 1 lần)")
    void testRenewAttemptLease_SecondRenewal_ReturnsFalse() {
        ObjectNode manifest = json.createObjectNode();
        manifest.put("leaseRenewalCount", 1);
        job.setResultManifest(manifest);

        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));
        when(attempts.findById(attemptId)).thenReturn(Optional.of(attempt));

        boolean renewed = jobControlService.renewAttemptLease(jobId, attemptId, Duration.ofSeconds(30));

        assertThat(renewed).isFalse();
    }

    @Test
    @DisplayName("renewAttemptLease thất bại nếu Job không ở trạng thái RUNNING")
    void testRenewAttemptLease_JobNotRunning_ReturnsFalse() {
        job.setStatus("COMPLETED");
        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));

        boolean renewed = jobControlService.renewAttemptLease(jobId, attemptId, Duration.ofSeconds(30));

        assertThat(renewed).isFalse();
    }

    @Test
    @DisplayName("renewAttemptLease thất bại nếu Attempt không thuộc về Job")
    void testRenewAttemptLease_AttemptJobMismatch_ReturnsFalse() {
        Job otherJob = Job.builder().id(UUID.randomUUID()).build();
        attempt.setJob(otherJob);

        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));
        when(attempts.findById(attemptId)).thenReturn(Optional.of(attempt));

        boolean renewed = jobControlService.renewAttemptLease(jobId, attemptId, Duration.ofSeconds(30));

        assertThat(renewed).isFalse();
    }
}
