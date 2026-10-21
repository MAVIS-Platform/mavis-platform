package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.analyzer.detector.docker.DockerDetector;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.analyzer.orchestrator.service.AnalyzerOrchestratorService;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.analyzer.workerclient.service.impl.WorkerModelPublisher;
import com.mavis.common.contract.AnalyzeRequestEvent;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.utils.HashUtils;
import com.mavis.common.utils.ZipUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.nio.file.*;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalyzerOrchestratorServiceImpl implements AnalyzerOrchestratorService {
    private final ProjectRepository projects;
    private final SourceSnapshotRepository snapshots;
    private final JobRepository jobs;
    private final DockerDetector docker;
    private final JavaSourceParser javaParser;
    private final DotnetWorkerClientService worker;
    private final WorkerModelPublisher publisher;
    private final AnalysisExecutionRegistry executions;

    @Async("mavisAnalysisExecutor") @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT, fallbackExecution=true) @Override
    public void handleAnalyzeRequest(AnalyzeRequestEvent event) {
        UUID attempt=UUID.randomUUID();UUID jobId=null;boolean started=false;
        try {
            Project project=projects.findWithDetailsById(event.projectId()).orElseThrow();
            SourceSnapshot snapshot=event.snapshotId()==null?null:snapshots.findById(event.snapshotId()).orElseThrow();
            if(snapshot==null) snapshot=snapshots.save(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD")
                    .artifactHash(HashUtils.sha256Hex(Paths.get(event.zipFilePath()))).storagePath(event.zipFilePath()).createdBy(project.getOwner()).build());
            if(!snapshot.getProject().getId().equals(project.getId()))throw new IllegalArgumentException("Snapshot project mismatch");
            Job job=event.jobId()==null?jobs.save(Job.builder().project(project).sourceSnapshot(snapshot).jobType("STATIC_ANALYSIS").status("PENDING").build()):jobs.findById(event.jobId()).orElseThrow();
            if(!job.getProject().getId().equals(project.getId()) || !job.getSourceSnapshot().getId().equals(snapshot.getId()))throw new IllegalArgumentException("Job snapshot mismatch");
            jobId=job.getId();Instant deadline=Instant.now().plusSeconds(120);
            if(!publisher.begin(jobId,attempt,deadline))return;started=true;executions.register(jobId);
            // Stored snapshot artifact is authoritative; event paths cannot select another source.
            String extracted=ZipUtils.extract(snapshot.getStoragePath(),snapshot.getArtifactHash());
            var javaFindings=javaParser.parseProject(extracted);
            boolean hasJava=hasJava(Path.of(extracted));
            // Network/staging/validation completes before entering the publication transaction.
            var execution=worker.analyze(project.getId(),snapshot.getId(),jobId,attempt,extracted,deadline);
            publisher.publish(jobId,attempt,deadline,extracted,docker.detectServices(extracted),javaFindings,hasJava,execution);
        }catch(Exception exception) {
            Thread.interrupted();
            log.warn("Analysis attempt {} failed; no latest model promotion",attempt);
            if(started && jobId!=null)publisher.fail(jobId,attempt,"ANALYSIS_OR_PUBLICATION_FAILED");
        }finally{
            if(started&&jobId!=null){Thread.interrupted();executions.unregister(jobId);publisher.acknowledgeCancellation(jobId,attempt);}
        }
    }
    private boolean hasJava(Path root) throws java.io.IOException {
        var present=new java.util.concurrent.atomic.AtomicBoolean();
        Files.walkFileTree(root,new SimpleFileVisitor<>(){
            int entries;
            private void count() throws java.io.IOException {if(++entries>50000)throw new java.io.IOException("Source entry budget");}
            @Override public FileVisitResult preVisitDirectory(Path directory,java.nio.file.attribute.BasicFileAttributes attrs)throws java.io.IOException {
                count();return !directory.equals(root) && java.util.Set.of("test","target","build",".git","bin","obj","node_modules").contains(directory.getFileName().toString().toLowerCase(java.util.Locale.ROOT))?FileVisitResult.SKIP_SUBTREE:FileVisitResult.CONTINUE;
            }
            @Override public FileVisitResult visitFile(Path file,java.nio.file.attribute.BasicFileAttributes attrs)throws java.io.IOException {
                count();if(attrs.isRegularFile() && !attrs.isSymbolicLink() && file.getFileName().toString().endsWith(".java")){present.set(true);return FileVisitResult.TERMINATE;}return FileVisitResult.CONTINUE;
            }
        });return present.get();
    }
}
