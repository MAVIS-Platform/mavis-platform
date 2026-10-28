package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.repository.*;
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
    final ApplicationEventPublisher events=mock(ApplicationEventPublisher.class);
    final AnalysisRequestService service=new AnalysisRequestService(snapshots,projects,jobs,events);
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
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(UUID.randomUUID().toString(),null,List.of()));
        assertThatThrownBy(()->service.start(snapshot.getId(),"forbidden")).isInstanceOf(BusinessException.class).hasMessageContaining("access denied");
        verify(jobs,never()).save(any());verifyNoInteractions(events);
    }
}
