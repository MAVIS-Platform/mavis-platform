package com.mavis.analyzer.workerclient.service.impl;

import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.analyzer.orchestrator.service.impl.AnalyzerOrchestratorServiceImpl;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.workerclient.WorkerContract;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.mockito.Mockito.*;

class WorkerOrchestrationTest {
    @TempDir Path temp;
    @Test void dispatchPrecedesPublicationAndUsesStoredSnapshotRatherThanEventPath()throws Exception {
        Path zip=temp.resolve("snapshot.zip");
        try(var out=new java.util.zip.ZipOutputStream(Files.newOutputStream(zip))){out.putNextEntry(new java.util.zip.ZipEntry("App.csproj"));out.write("<Project />".getBytes());out.closeEntry();}
        var projects=mock(ProjectRepository.class);var snapshots=mock(SourceSnapshotRepository.class);var jobs=mock(JobRepository.class);
        var docker=mock(DockerDetector.class);var parser=mock(JavaSourceParser.class);var worker=mock(DotnetWorkerClientService.class);var publisher=mock(WorkerModelPublisher.class);
        UUID projectId=UUID.randomUUID(),snapshotId=UUID.randomUUID(),jobId=UUID.randomUUID();
        Project project=Project.builder().id(projectId).build();SourceSnapshot snapshot=SourceSnapshot.builder().id(snapshotId).project(project).storagePath(zip.toString()).artifactHash(com.mavis.common.utils.HashUtils.sha256Hex(zip)).build();Job job=Job.builder().id(jobId).project(project).sourceSnapshot(snapshot).build();
        when(projects.findWithDetailsById(projectId)).thenReturn(Optional.of(project));when(snapshots.findById(snapshotId)).thenReturn(Optional.of(snapshot));when(jobs.findById(jobId)).thenReturn(Optional.of(job));when(publisher.begin(eq(jobId),any(),any())).thenReturn(true);
        when(parser.parseProject(anyString())).thenReturn(List.of());when(docker.detectServices(anyString())).thenReturn(List.of());
        var execution=new DotnetWorkerClientService.Execution(null,WorkerContract.Outcome.failure(WorkerContract.Status.FAILED,"UNAVAILABLE"));when(worker.analyze(eq(projectId),eq(snapshotId),eq(jobId),any(),anyString(),any())).thenReturn(execution);
        new AnalyzerOrchestratorServiceImpl(projects,snapshots,jobs,docker,parser,worker,publisher,new com.mavis.analyzer.orchestrator.service.impl.AnalysisExecutionRegistry()).handleAnalyzeRequest(new AnalyzeRequestEvent(projectId,snapshotId,jobId,"/not/the/snapshot.zip"));
        var order=inOrder(worker,publisher);order.verify(publisher).begin(eq(jobId),any(),any());order.verify(worker).analyze(eq(projectId),eq(snapshotId),eq(jobId),any(),eq(temp.resolve("snapshot_extracted").toAbsolutePath().toString()),any());
        order.verify(publisher).publish(eq(jobId),any(),any(),anyString(),eq(List.of()),eq(List.of()),eq(false),same(execution));
        verify(publisher,never()).fail(any(),any(),anyString());
    }
}
