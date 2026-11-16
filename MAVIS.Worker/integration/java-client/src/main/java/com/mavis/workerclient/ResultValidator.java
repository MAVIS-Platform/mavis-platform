package com.mavis.workerclient;

import java.nio.charset.StandardCharsets;
import java.util.*;
import static com.mavis.workerclient.WorkerContract.*;

/** Rejects drift/corrupt provenance before any consumer may publish. */
public final class ResultValidator {
    private ResultValidator() {}
    public static void validate(Result r, Context c) {
        require(r != null && "1.0".equals(r.schemaVersion()) && "dotnet-static/1.9".equals(r.analyzerVersion()));
        require(Objects.equals(r.projectId(), c.projectId()) && Objects.equals(r.sourceSnapshotId(), c.sourceSnapshotId()) &&
                Objects.equals(r.jobId(), c.jobId()) && Objects.equals(r.attemptId(), c.attemptId()) && Objects.equals(r.inputDigest(), c.expectedInputDigest()));
        require(r.coverage() != null && "PartialSyntax".equals(r.coverage().mode()) && r.coverage().discoveredFiles() >= 0 && r.coverage().analyzedFiles() >= 0 &&
                r.coverage().skippedFiles() >= 0 && r.coverage().analyzedFiles() + r.coverage().skippedFiles() == r.coverage().discoveredFiles());
        require(r.findings() != null && !r.findings().isEmpty() && r.findings().size() <= 100_000 && r.warnings() != null && r.warnings().size() <= 10_000 && r.projects() != null && !r.projects().isEmpty());
        Canonical bundle = r.canonical();
        require(bundle != null && "dotnet-findings/1".equals(bundle.schemaVersion()) && bundle.requiresCanonicalMerge() && bundle.elements() != null &&
                bundle.relationships() != null && bundle.evidence() != null && !bundle.elements().isEmpty() && bundle.elements().size() <= 20_000 && bundle.relationships().size() <= 50_000 && bundle.evidence().size() <= 100_000);
        Set<String> evidenceIds = new HashSet<>(), elementIds = new HashSet<>(), relationIds = new HashSet<>(), used = new HashSet<>();
        for (Evidence evidence : bundle.evidence()) {
            require(evidence != null && digest(evidence.id()) && evidenceIds.add(evidence.id()) && Objects.equals(evidence.sourceSnapshotId(), c.sourceSnapshotId()) &&
                    r.analyzerVersion().equals(evidence.adapterVersion()) && origin(evidence.origin()) && digest(evidence.fileHash()) && digest(evidence.evidenceHash()));
            location(evidence.location());
            var loc = evidence.location();
            String locator = loc.filePath() + ":" + loc.startLine() + ":" + (loc.startColumn() == null ? 1 : loc.startColumn()) + "-" + loc.endLine() + ":" + (loc.endColumn() == null ? "*" : loc.endColumn());
            require(locator.equals(evidence.locator()) && hash(evidence.origin(), locator, evidence.fileHash()).equals(evidence.evidenceHash()) &&
                    hash(c.sourceSnapshotId(), r.analyzerVersion(), evidence.evidenceHash()).equals(evidence.id()));
        }
        for (Element element : bundle.elements()) {
            require(element != null && digest(element.id()) && elementIds.add(element.id()) && element.name() != null && !element.name().isBlank() &&
                    Set.of("SYSTEM", "COMPONENT", "CLASS_INTERFACE", "DATABASE", "EXTERNAL_SYSTEM").contains(element.kind()));
            relative(element.projectPath()); refs(element.evidenceIds(), evidenceIds, used);
        }
        for (Relationship relation : bundle.relationships()) {
            require(relation != null && digest(relation.id()) && relationIds.add(relation.id()) && elementIds.contains(relation.fromId()) && elementIds.contains(relation.toId()) &&
                    Set.of("CODE_DEPENDENCY", "SERVICE_HTTP_CALL", "DATABASE_ACCESS").contains(relation.type()) && origin(relation.origin()) && relation.dependencyKind() != null);
            refs(relation.evidenceIds(), evidenceIds, used);
        }
        require(used.equals(evidenceIds));
        var findingIds = new HashSet<String>();
        for (Finding finding : r.findings()) {
            require(finding != null && digest(finding.id()) && finding.kind() != null && origin(finding.origin()));
            // A raw finding can share a logical ID with another declaration; canonical identity/evidence merging is authoritative.
            findingIds.add(finding.id()); relative(finding.projectPath()); location(finding.evidence());
            for (Location extra : finding.additionalEvidence() == null ? List.<Location>of() : finding.additionalEvidence()) location(extra);
            refs(finding.evidenceIds(), evidenceIds, new HashSet<>());
        }
        for (Warning warning : r.warnings()) { require(warning != null && warning.code() != null && warning.message() != null); if (warning.filePath() != null) relative(warning.filePath()); }
        for (Project project : r.projects()) { require(project != null && digest(project.id())); relative(project.projectPath()); if (!".".equals(project.rootPath())) relative(project.rootPath()); }
    }
    private static void location(Location location) {
        require(location != null && location.startLine() >= 1 && location.endLine() >= location.startLine()); relative(location.filePath());
        require(location.startColumn() == null || location.startColumn() >= 1);
        require(location.endColumn() == null || location.endColumn() >= 1);
    }
    private static void relative(String path) {
        require(path != null && !path.isBlank() && !path.startsWith("/") && !path.contains("\\") && !path.contains(":") &&
                Arrays.stream(path.split("/", -1)).noneMatch(p -> p.isEmpty() || p.equals(".") || p.equals("..")));
    }
    private static void refs(List<String> ids, Set<String> evidence, Set<String> used) {
        require(ids != null && !ids.isEmpty()); for (String id : ids) { require(evidence.contains(id)); used.add(id); }
    }
    private static boolean digest(String value) { return value != null && value.matches("[0-9a-f]{64}"); }
    private static boolean origin(String value) { return "STATIC_CODE".equals(value) || "CONFIG".equals(value); }
    private static String hash(String a, String b, String c) { return HexFormat.of().formatHex(InputFingerprint.sha256().digest((a + "\n" + b + "\n" + c).getBytes(StandardCharsets.UTF_8))); }
    private static void require(boolean value) { if (!value) throw new IllegalArgumentException("Invalid Worker result contract or provenance"); }
}
