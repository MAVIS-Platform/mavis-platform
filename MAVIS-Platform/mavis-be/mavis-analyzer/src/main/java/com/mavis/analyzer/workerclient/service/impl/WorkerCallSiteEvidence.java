package com.mavis.analyzer.workerclient.service.impl;

import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.workerclient.InputFingerprint;
import com.mavis.workerclient.WorkerContract;

import java.io.IOException;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/** Resolve only the primary source location of a Roslyn HTTP invocation. */
final class WorkerCallSiteEvidence {
    private WorkerCallSiteEvidence() {}

    static Map<String, String> extract(Path root, WorkerContract.Result result) {
        var references = new HashMap<WorkerContract.Location, WorkerContract.Evidence>();
        for (var item : result.canonical().evidence()) {
            if ("STATIC_CODE".equals(item.origin())) references.put(item.location(), item);
        }
        var files = new HashMap<String, Optional<String[]>>();
        var excerpts = new HashMap<String, String>();
        for (var finding : result.findings()) {
            if (!"OutgoingHttp".equals(finding.kind())) continue;
            var evidence = references.get(finding.evidence());
            if (evidence == null) continue;
            var location = evidence.location();
            var lines = files.computeIfAbsent(location.filePath() + ":" + evidence.fileHash(),
                    key -> read(root, location.filePath(), evidence.fileHash()));
            lines.map(value -> excerpt(value, location))
                    .filter(value -> !value.isBlank())
                    .ifPresent(value -> excerpts.put(evidence.id(), SecretRedactor.redactString(value)));
        }
        return Map.copyOf(excerpts);
    }

    private static Optional<String[]> read(Path root, String relative, String hash) {
        try {
            return Optional.of(InputFingerprint.readVerifiedSource(root, relative, hash)
                    .split("\\r\\n|[\\r\\n\\u0085\\u2028\\u2029]", -1));
        } catch (IOException | IllegalArgumentException unavailable) {
            return Optional.empty();
        }
    }

    private static String excerpt(String[] lines, WorkerContract.Location location) {
        int start = location.startLine() - 1;
        int end = location.endLine() - 1;
        if (start < 0 || end < start || end >= lines.length || end - start > 12) return "";
        int from = location.startColumn() == null ? 0 : location.startColumn() - 1;
        int to = location.endColumn() == null ? lines[end].length() : location.endColumn() - 1;
        if (from < 0 || from > lines[start].length() || to < 0 || to > lines[end].length()
                || (start == end && to < from)) return "";
        var result = new StringBuilder();
        for (int row = start; row <= end; row++) {
            result.append(lines[row], row == start ? from : 0, row == end ? to : lines[row].length());
            if (row < end) result.append('\n');
            if (result.length() > 1200) return "";
        }
        return result.toString().strip();
    }
}
