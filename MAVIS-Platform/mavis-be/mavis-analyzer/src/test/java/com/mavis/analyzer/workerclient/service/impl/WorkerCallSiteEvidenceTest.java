package com.mavis.analyzer.workerclient.service.impl;

import com.mavis.common.utils.HashUtils;
import com.mavis.workerclient.WorkerContract;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkerCallSiteEvidenceTest {
    @TempDir Path root;

    @Test
    void readsOnlyThePrimaryInvocationFromTheVerifiedSource() throws Exception {
        String source = "  client.GetAsync(\r\n    \"https://demo.invalid/orders\");\r\n";
        String hash = HashUtils.sha256Hex(source.getBytes(StandardCharsets.UTF_8));
        var file = root.resolve("Orders.cs");
        Files.writeString(file, "\uFEFF" + source);
        var location = new WorkerContract.Location("Orders.cs", 1, 2, 3, 35);
        var config = new WorkerContract.Location("Orders.cs", 1, 1, 1, 2);
        var result = fixture(hash, location, config);
        assertEquals(Map.of("call", "client.GetAsync(\n    \"https://demo.invalid/orders\")"),
                WorkerCallSiteEvidence.extract(root, result));

        Files.writeString(file, source.replace("orders", "changed"));
        assertTrue(WorkerCallSiteEvidence.extract(root, result).isEmpty());
    }

    @Test
    void skipsMissingOrOutOfRangeLocations() throws Exception {
        String source = "client.GetAsync(url);";
        String hash = HashUtils.sha256Hex(source.getBytes(StandardCharsets.UTF_8));
        Files.writeString(root.resolve("Orders.cs"), source);
        var badColumn = new WorkerContract.Location("Orders.cs", 1, 1, 1, 100);
        var missing = new WorkerContract.Location("Other.cs", 1, 1, 1, 2);
        assertTrue(WorkerCallSiteEvidence.extract(root, fixture(hash, badColumn, missing)).isEmpty());
        assertTrue(WorkerCallSiteEvidence.extract(root, fixture(hash, missing, badColumn)).isEmpty());
    }

    private static WorkerContract.Result fixture(String hash, WorkerContract.Location primary,
                                                 WorkerContract.Location additional) {
        var call = new WorkerContract.Evidence("call", "snapshot", "adapter", "STATIC_CODE", primary,
                "Orders.cs:1:3-2:35", hash, "call-hash");
        var registration = new WorkerContract.Evidence("registration", "snapshot", "adapter", "STATIC_CODE",
                additional, "Orders.cs:1:1-1:2", hash, "config-hash");
        var finding = new WorkerContract.Finding("OutgoingHttp", "App.csproj", "demo.invalid", "GET",
                primary, "GetAsync", "finding", List.of(additional), "ResolvedSymbol", "Resolved",
                Map.of(), "STATIC_CODE", List.of("call", "registration"));
        var bundle = new WorkerContract.Canonical("dotnet-findings/1", true, List.of(), List.of(),
                List.of(call, registration));
        return new WorkerContract.Result("1.0", "job", "project", "snapshot", "adapter", List.of(finding),
                null, List.of(), "input", "attempt", List.of(), bundle);
    }
}
