package com.mavis.workerclient;

import java.io.IOException;
import java.nio.file.*;
import java.util.Comparator;
import java.util.UUID;

/** Copies supported immutable inputs into a new scope. Worker must mount artifactRoot read-only. */
public final class SharedArtifactStager {
    public record Prepared(String artifactId, InputFingerprint.Manifest manifest) {}
    private final Path snapshotsRoot;
    private final Path artifactsRoot;
    public SharedArtifactStager(Path snapshotsRoot, Path artifactsRoot) throws IOException {
        this.snapshotsRoot = snapshotsRoot.toAbsolutePath().normalize(); this.artifactsRoot = artifactsRoot.toAbsolutePath().normalize();
        InputFingerprint.validateDirectory(this.snapshotsRoot); InputFingerprint.validateDirectory(this.artifactsRoot);
    }
    public Prepared prepare(Path source) throws IOException {
        Path normalized = source.toAbsolutePath().normalize();
        if (!normalized.startsWith(snapshotsRoot) || normalized.startsWith(artifactsRoot) || artifactsRoot.startsWith(normalized))
            throw new IOException("Source outside configured snapshot scope or overlapping artifact root");
        var before = InputFingerprint.inspect(normalized);
        if (!before.hasDotnet()) return new Prepared(null, before);
        String id = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        Path temporary = artifactsRoot.resolve("prepare-" + id); Path target = artifactsRoot.resolve(id);
        Files.createDirectory(temporary);
        try {
            for (String relative : before.files()) {
                Path destination = temporary.resolve(relative).normalize();
                if (!destination.startsWith(temporary)) throw new IOException("Invalid artifact entry");
                Files.createDirectories(destination.getParent());
                Files.copy(normalized.resolve(relative), destination, LinkOption.NOFOLLOW_LINKS);
            }
            var copied = InputFingerprint.inspect(temporary);
            if (!before.digest().equals(copied.digest())) throw new IOException("Snapshot changed during copy");
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            return new Prepared(id, copied);
        } finally {
            if (Files.exists(temporary, LinkOption.NOFOLLOW_LINKS)) {
                if (!temporary.getParent().equals(artifactsRoot)) throw new IOException("Invalid preparation cleanup scope");
                try (var entries = Files.walk(temporary)) { for (Path entry : entries.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(entry); }
            }
        }
    }
}
