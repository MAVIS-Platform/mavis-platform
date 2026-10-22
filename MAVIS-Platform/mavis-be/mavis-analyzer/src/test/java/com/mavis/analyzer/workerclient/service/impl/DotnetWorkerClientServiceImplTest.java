package com.mavis.analyzer.workerclient.service.impl;

import com.mavis.workerclient.WorkerContract;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class DotnetWorkerClientServiceImplTest {
    @TempDir Path temp;
    private DotnetWorkerClientServiceImpl disabled() { return new DotnetWorkerClientServiceImpl(false,"http://127.0.0.1:1","","","","","",Clock.systemUTC()); }
    @Test void javaOnlyIsNotApplicableWithoutNetwork() throws Exception {
        Files.writeString(temp.resolve("App.java"),"class App {}");
        var result=disabled().analyze(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),temp.toString(),Instant.now().plusSeconds(30));
        assertEquals(WorkerContract.Status.NOT_APPLICABLE,result.outcome().status());assertNull(result.outcome().result());
    }
    @Test void disabledCsharpIsRejectedRatherThanSuccessfulEmpty() throws Exception {
        Files.writeString(temp.resolve("App.csproj"),"<Project />");
        var result=disabled().analyze(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),temp.toString(),Instant.now().plusSeconds(30));
        assertEquals(WorkerContract.Status.REJECTED,result.outcome().status());assertEquals("WORKER_NOT_CONFIGURED",result.outcome().code());
    }
    @Test void expiredScopeDoesNotPrepareOrDispatch() {
        var result=disabled().analyze(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),temp.toString(),Instant.now().minusSeconds(1));
        assertEquals(WorkerContract.Status.TIMED_OUT,result.outcome().status());
    }
    @Test void ignoredTreesAndMissingScopeAreNotConfusedWithSuccessfulAnalysis() throws Exception {
        Files.createDirectory(temp.resolve("obj"));Files.writeString(temp.resolve("obj/App.csproj"),"<Project />");
        assertFalse(disabled().hasDotnetFiles(temp.toString()));
        assertEquals(WorkerContract.Status.REJECTED,disabled().analyze(null,null,null,null,temp.toString(),Instant.now()).outcome().status());
    }
    @Test void sourceOutsideConfiguredSnapshotRootIsDenied() throws Exception {
        Path allowed=Files.createDirectory(temp.resolve("allowed")),artifacts=Files.createDirectory(temp.resolve("artifacts"));
        Path outside=Files.createDirectory(temp.resolve("outside"));Files.writeString(outside.resolve("App.csproj"),"<Project />");
        var client=new DotnetWorkerClientServiceImpl(true,"http://127.0.0.1:1","test-service-key","test","fixture-only-not-for-production-32-byte-key",allowed.toString(),artifacts.toString(),Clock.systemUTC());
        assertEquals(WorkerContract.Status.REJECTED,client.analyze(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),outside.toString(),Instant.now().plusSeconds(30)).outcome().status());
    }
    @Test void actualPlatformClientCallsRealWorkerWithUuidScope() throws Exception {
        String url=System.getenv("MAVIS_WORKER_TEST_URL");Assumptions.assumeTrue(url!=null,"Run real Worker integration harness");
        Path source=Files.createDirectory(temp.resolve("source"));
        Files.writeString(source.resolve("App.csproj"),"<Project />");Files.writeString(source.resolve("App.cs"),"class App {}");
        var client=new DotnetWorkerClientServiceImpl(true,url,"test-service-key","test","fixture-only-not-for-production-32-byte-key",temp.toString(),System.getenv("MAVIS_WORKER_TEST_ARTIFACT_ROOT"),Clock.systemUTC());
        UUID project=UUID.randomUUID(),snapshot=UUID.randomUUID(),job=UUID.randomUUID(),attempt=UUID.randomUUID();
        var execution=client.analyze(project,snapshot,job,attempt,source.toString(),Instant.now().plusSeconds(45));
        assertEquals(WorkerContract.Status.COMPLETED,execution.outcome().status(),execution.outcome().code());
        assertEquals(snapshot.toString(),execution.outcome().result().sourceSnapshotId());
        assertEquals(attempt.toString(),execution.outcome().result().attemptId());
    }
}