package com.mavis.analyzer.storage.service;

import java.util.UUID;

public interface ArtifactRetentionService {

    /**
     * Determines whether a source snapshot can be safely deleted.
     * Returns false if the snapshot is referenced by any model_versions,
     * submission_snapshots, or pending/running jobs.
     */
    boolean canDeleteSourceSnapshot(UUID snapshotId);

    /**
     * Cleans up unreferenced temporary and orphan artifacts in the storage directory.
     * Preserves all files referenced by source snapshots, model versions, and submission snapshots.
     *
     * @return the number of unreferenced files/directories removed
     */
    int cleanupUnreferencedArtifacts();
}
