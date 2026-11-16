package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import org.junit.jupiter.api.*;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AnalysisRequestServiceTest {
    final SourceSnapshotRepository snapshots=mock(SourceSnapshotRepository.class);
    final ProjectRepository projects=mock(ProjectRepository.class);
    final JobRepository jobs=mock(JobRepository.class);
    final AccessPolicyService accessPolicy=mock(AccessPolicyService.class);
    final ApplicationEventPublisher events=mock(ApplicationEventPublisher.class);
    final AnalysisRequestService service=new AnalysisRequestService(snapshots,projects,jobs,accessPolicy,events);
    final UUID owner=UUID.randomUUID();
    final Project project=Project.builder().id(UUID.randomUUID()).owner(User.builder().id(owner).build()).build();
    final SourceSnapshot snapshot=SourceSnapshot.builder().id(UUID.randomUUID()).project(project).storagePath("stored/pinned.zip").artifactHash("immutable-digest").build();
    @BeforeEach void setup(){
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(owner.toString(),null,List.of()));
        when(snapshots.findById(snapshot.getId())).thenReturn(Optional.of(snapshot));
        when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
    }
    @AfterEach void cleanup(){SecurityContextHolder.clearContext();}
    @Test void freshRequestsCreateSeparateJobsUsingSameStoredSource(){
        when(jobs.save(any(Job.class))).thenAnswer(c->{Job j=c.getArgument(0);j.setId(UUID.randomUUID());return j;});
        var first=service.start(snapshot.getId(),"first");var second=service.start(snapshot.getId(),"reanalyze");
        assertThat(second.jobId()).isNotEqualTo(first.jobId());assertThat(second.snapshotId()).isEqualTo(snapshot.getId());
        verify(events,times(2)).publishEvent(argThat((Object e)->e instanceof AnalyzeRequestEvent r && snapshot.getId().equals(r.snapshotId()) && snapshot.getStoragePath().equals(r.zipFilePath())));
        verify(snapshots,never()).save(any());assertThat(snapshot.getArtifactHash()).isEqualTo("immutable-digest");
    }
    @Test void identicalRequestReturnsCompletedJobWithoutPublishingAgain(){
        var job=Job.builder().id(UUID.randomUUID()).sourceSnapshot(snapshot).status("COMPLETED").build();
        when(jobs.findByProjectIdAndAnalysisRequestKey(project.getId(),"same")).thenReturn(Optional.of(job));
        var result=service.start(snapshot.getId(),"same");assertThat(result.existing()).isTrue();assertThat(result.jobId()).isEqualTo(job.getId());
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
    @Test void activeProjectJobBlocksNewKey(){
        when(jobs.existsByProjectIdAndJobTypeAndStatusIn(eq(project.getId()),eq("STATIC_ANALYSIS"),eq(List.of("PENDING","RUNNING","CANCELLING")))).thenReturn(true);
        assertThatThrownBy(()->service.start(snapshot.getId(),"new-key")).isInstanceOf(BusinessException.class).hasMessageContaining("already has an analysis");
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
    @Test void keyCannotCrossSnapshots(){
        var previous=Job.builder().sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build()).build();
        when(jobs.findByProjectIdAndAnalysisRequestKey(project.getId(),"wrong")).thenReturn(Optional.of(previous));
        assertThatThrownBy(()->service.start(snapshot.getId(),"wrong")).isInstanceOf(BusinessException.class).hasMessageContaining("another snapshot");
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
    @Test void missingSourceCannotStart(){
        snapshot.setStoragePath(null);
        assertThatThrownBy(()->service.start(snapshot.getId(),"missing")).isInstanceOf(BusinessException.class).hasMessageContaining("artifact unavailable");
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
    @Test void otherUserCannotStart(){
        doThrow(new BusinessException(ErrorCode.FORBIDDEN, "access denied")).when(accessPolicy).requireProjectWriteAccess(project);
        assertThatThrownBy(()->service.start(snapshot.getId(),"forbidden")).isInstanceOf(BusinessException.class).hasMessageContaining("access denied");
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
    @Test void deletedProjectCannotStartAnotherAnalysis(){project.setStatus("DELETED");assertThatThrownBy(()->service.start(snapshot.getId(),"deleted-project")).isInstanceOf(BusinessException.class).hasMessageContaining("Project not found");verify(jobs,never()).save(any());verifyNoInteractions(events);}

    @Test
    @DisplayName("F02-004, F02-008 & TC-N04: 10 concurrent analyze requests serialize on lock and save at most one job")
    void tenConcurrentStartRequestsCreateSingleJobAndReuseIdempotentKey() throws Exception {
        java.util.concurrent.atomic.AtomicReference<Job> savedJob = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.locks.ReentrantLock dbRowLock = new java.util.concurrent.locks.ReentrantLock();

        when(projects.findLockedById(project.getId())).thenAnswer(inv -> {
            dbRowLock.lock();
            return Optional.of(project);
        });
        when(jobs.findByProjectIdAndAnalysisRequestKey(eq(project.getId()), anyString())).thenAnswer(inv -> {
            Job existing = savedJob.get();
            String key = inv.getArgument(1);
            if (existing != null && key.equals(existing.getAnalysisRequestKey())) {
                return Optional.of(existing);
            }
            return Optional.empty();
        });
        when(jobs.existsByProjectIdAndJobTypeAndStatusIn(eq(project.getId()), eq("STATIC_ANALYSIS"), anyList()))
                .thenAnswer(inv -> savedJob.get() != null);
        when(jobs.save(any(Job.class))).thenAnswer(inv -> {
            Job j = inv.getArgument(0);
            j.setId(UUID.randomUUID());
            savedJob.set(j);
            return j;
        });

        var pool = java.util.concurrent.Executors.newFixedThreadPool(10);
        var gate = new java.util.concurrent.CountDownLatch(1);
        java.util.List<java.util.concurrent.Future<String>> results = new java.util.ArrayList<>();
        for (int i = 0; i < 10; i++) {
            final String key = (i < 5) ? "same-key" : "other-key-" + i;
            results.add(pool.submit(() -> {
                gate.await();
                try {
                    var accepted = service.start(snapshot.getId(), key);
                    return (accepted.existing() ? "EXISTING:" : "NEW:") + accepted.jobId();
                } catch (BusinessException conflict) {
                    return "CONFLICT:" + conflict.getErrorCode();
                } finally {
                    if (dbRowLock.isHeldByCurrentThread()) {
                        dbRowLock.unlock();
                    }
                }
            }));
        }
        gate.countDown();
        int newCount = 0;
        int conflicts = 0;
        for (var f : results) {
            String r = f.get();
            if (r.startsWith("NEW:")) newCount++;
            else if (r.startsWith("CONFLICT:")) conflicts++;
        }
        pool.shutdown();

        assertThat(newCount).isEqualTo(1);
        assertThat(conflicts).isGreaterThanOrEqualTo(4);
        verify(jobs, times(1)).save(any(Job.class));
        verify(events, times(1)).publishEvent(any(AnalyzeRequestEvent.class));
    }
}
