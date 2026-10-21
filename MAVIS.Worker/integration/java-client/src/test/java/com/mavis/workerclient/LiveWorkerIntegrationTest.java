package com.mavis.workerclient;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import java.net.URI;
import java.nio.file.Path;
import java.time.Clock;
import static org.junit.jupiter.api.Assertions.*;

class LiveWorkerIntegrationTest {
    @Test void javaStagesSignsAndCallsRealDotnetWorker() throws Exception {
        String endpoint = System.getenv("MAVIS_WORKER_TEST_URL");
        Assumptions.assumeTrue(endpoint != null, "Run with the real Worker integration harness");
        Path source = Path.of(getClass().getResource("/fixtures/source").toURI()).toAbsolutePath();
        Path shared = Path.of(System.getenv("MAVIS_WORKER_TEST_ARTIFACT_ROOT"));
        var prepared = new SharedArtifactStager(source, shared).prepare(source);
        var clock = Clock.systemUTC();
        var scope = new WorkerContract.Context("p", "s", "j", "a1", prepared.artifactId(), prepared.manifest().digest(), clock.instant().plusSeconds(25));
        var issuer = new ArtifactGrantIssuer("test", "fixture-only-not-for-production-32-byte-key", clock);
        var client = new ScopedWorkerClient(URI.create(endpoint), "test-service-key", issuer, clock);
        var outcome = client.analyze(scope);
        assertEquals(WorkerContract.Status.COMPLETED, outcome.status(), outcome.code());
        assertNotNull(outcome.result()); assertEquals(scope.expectedInputDigest(), outcome.result().inputDigest());
        assertEquals(scope.attemptId(), outcome.result().attemptId());
        assertTrue(outcome.result().canonical().elements().stream().anyMatch(e -> e.name().equals("App")));
    }
}
