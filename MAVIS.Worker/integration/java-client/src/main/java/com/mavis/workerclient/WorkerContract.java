package com.mavis.workerclient;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Transport DTOs mirror the C# producer; no JPA objects or platform DB ownership. */
public final class WorkerContract {
    private WorkerContract() {}
    public record Context(String projectId, String sourceSnapshotId, String jobId, String attemptId,
                          String artifactId, String expectedInputDigest, Instant deadlineUtc) {
        public Context {
            for (String value : new String[]{projectId, sourceSnapshotId, jobId, attemptId})
                if (value == null || !value.matches("[A-Za-z0-9_-]{1,128}")) throw new IllegalArgumentException("Invalid scope identity");
            if (artifactId == null || !artifactId.matches("[0-9a-f]{64}") || expectedInputDigest == null || !expectedInputDigest.matches("[0-9a-f]{64}") || deadlineUtc == null)
                throw new IllegalArgumentException("Invalid artifact scope");
        }
    }
    public record Request(String schemaVersion, String artifactGrant) {}
    public record Location(String filePath, int startLine, int endLine, Integer startColumn, Integer endColumn) {}
    public record Finding(String kind, String projectPath, String target, String httpMethod, Location evidence,
                          String subject, String id, List<Location> additionalEvidence, String confidence,
                          String resolutionStatus, Map<String,String> properties, String origin, List<String> evidenceIds) {}
    public record Coverage(int discoveredFiles, int analyzedFiles, String mode, int skippedFiles, List<String> profiles) {}
    public record Warning(String code, String message, String filePath) {}
    public record Project(String id, String projectPath, String rootPath, String name) {}
    public record Evidence(String id, String sourceSnapshotId, String adapterVersion, String origin, Location location,
                           String locator, String fileHash, String evidenceHash) {}
    public record Element(String id, String kind, String name, String projectPath, String resolutionStatus,
                          List<String> evidenceIds, Map<String,String> properties) {}
    public record Relationship(String id, String fromId, String toId, String type, String dependencyKind,
                               String resolutionStatus, List<String> evidenceIds, String origin) {}
    public record Canonical(String schemaVersion, boolean requiresCanonicalMerge, List<Element> elements,
                            List<Relationship> relationships, List<Evidence> evidence) {}
    public record Result(String schemaVersion, String jobId, String projectId, String sourceSnapshotId, String analyzerVersion,
                         List<Finding> findings, Coverage coverage, List<Warning> warnings, String inputDigest,
                         String attemptId, List<Project> projects, Canonical canonical) {}
    public enum Status { COMPLETED, NOT_APPLICABLE, TIMED_OUT, CANCELLED, REJECTED, FAILED }
    public record Outcome(Status status, String code, Result result) {
        public static Outcome failure(Status status, String code) { return new Outcome(status, code, null); }
    }
}
