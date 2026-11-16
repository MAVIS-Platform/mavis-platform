package com.mavis.analyzer.workerclient.service.impl;

import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.workerclient.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;
import static com.mavis.workerclient.WorkerContract.*;

@Service
public class DotnetWorkerClientServiceImpl implements DotnetWorkerClientService {
    private final boolean enabled;
    private final String url, serviceKey, keyId, grantKey, snapshotsRoot, artifactsRoot;
    private final Clock clock;

    @Autowired
    public DotnetWorkerClientServiceImpl(@Value("${mavis.worker.enabled:false}") boolean enabled,
            @Value("${mavis.worker.dotnet-url:http://localhost:5050}") String url,
            @Value("${mavis.worker.service-key:}") String serviceKey, @Value("${mavis.worker.grant-key-id:}") String keyId,
            @Value("${mavis.worker.grant-key:}") String grantKey, @Value("${mavis.worker.snapshot-root:}") String snapshotsRoot,
            @Value("${mavis.worker.artifact-root:}") String artifactsRoot) {
        this(enabled,url,serviceKey,keyId,grantKey,snapshotsRoot,artifactsRoot,Clock.systemUTC());
    }
    public DotnetWorkerClientServiceImpl(boolean enabled,String url,String serviceKey,String keyId,String grantKey,String snapshotsRoot,String artifactsRoot,Clock clock) {
        this.enabled=enabled;this.url=url;this.serviceKey=serviceKey;this.keyId=keyId;this.grantKey=grantKey;this.snapshotsRoot=snapshotsRoot;this.artifactsRoot=artifactsRoot;this.clock=clock;
    }
    @Override public Execution analyze(UUID projectId,UUID snapshotId,UUID jobId,UUID attemptId,String extractedPath,Instant deadline) {
        if(projectId==null || snapshotId==null || jobId==null || attemptId==null || deadline==null) return failure(Status.REJECTED,"INVALID_SCOPE");
        if(!clock.instant().isBefore(deadline)) return failure(Status.TIMED_OUT,"DEADLINE_EXCEEDED");
        try {
            Path source=Path.of(extractedPath).toAbsolutePath().normalize();
            if(!enabled) { boolean present=InputFingerprint.inspect(source).hasDotnet(); return failure(present?Status.REJECTED:Status.NOT_APPLICABLE,present?"WORKER_NOT_CONFIGURED":"NO_DOTNET_INPUT"); }
            var stager=new SharedArtifactStager(Path.of(snapshotsRoot),Path.of(artifactsRoot));
            var prepared=stager.prepare(source);
            if(!prepared.manifest().hasDotnet()) return failure(Status.NOT_APPLICABLE,"NO_DOTNET_INPUT");
            Instant workerDeadline=clock.instant().plusSeconds(25); if(deadline.isBefore(workerDeadline)) workerDeadline=deadline;
            var context=new Context(projectId.toString(),snapshotId.toString(),jobId.toString(),attemptId.toString(),prepared.artifactId(),prepared.manifest().digest(),workerDeadline);
            var client=new ScopedWorkerClient(URI.create(url),serviceKey,new ArtifactGrantIssuer(keyId,grantKey,clock),clock);
            return new Execution(context,client.analyze(context));
        } catch(Exception exception) {
            if(Thread.currentThread().isInterrupted()) return failure(Status.CANCELLED,"CANCELLED");
            return failure(Status.REJECTED,"SOURCE_OR_WORKER_CONFIGURATION_INVALID");
        }
    }
    @Override public boolean hasDotnetFiles(String path) {
        try { return InputFingerprint.inspect(Path.of(path).toAbsolutePath()).hasDotnet(); } catch(Exception ignored) { return false; }
    }
    private static Execution failure(Status status,String code) { return new Execution(null,Outcome.failure(status,code)); }
}