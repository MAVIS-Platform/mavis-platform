package com.mavis.common.repository;

import com.mavis.common.entity.RuntimeSession;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RuntimeSessionRepository extends JpaRepository<RuntimeSession, UUID> {
    List<RuntimeSession> findByProjectId(UUID projectId);
    long countByExecutionStatusIn(java.util.Collection<String> statuses);

    /** Excludes simulated sandboxes (which own no Docker containers) so they never block real runner slots. */
    @Query(value = "SELECT COUNT(*) FROM runtime_sessions WHERE execution_status IN (:statuses) "
            + "AND COALESCE(studio_control->>'simulatedSandbox', 'false') <> 'true'", nativeQuery = true)
    long countActiveNonSimulated(@Param("statuses") java.util.Collection<String> statuses);

    /** Phase E3: global active session count for one user across all Labs/projects (excluding simulated sandboxes). */
    @Query(value = "SELECT COUNT(*) FROM runtime_sessions WHERE triggered_by = :userId "
            + "AND execution_status IN (:statuses) AND cancel_requested_at IS NULL "
            + "AND COALESCE(studio_control->>'simulatedSandbox', 'false') <> 'true'", nativeQuery = true)
    long countActiveNonSimulatedByUser(@Param("userId") UUID userId, @Param("statuses") java.util.Collection<String> statuses);

    /** Phase E3: most recent non-simulated session creation epoch seconds for one user (cooldown enforcement). */
    @Query(value = "SELECT CAST(EXTRACT(EPOCH FROM MAX(created_at)) AS BIGINT) FROM runtime_sessions WHERE triggered_by = :userId "
            + "AND COALESCE(studio_control->>'simulatedSandbox', 'false') <> 'true'", nativeQuery = true)
    Long findLatestNonSimulatedCreatedEpochSecondsByUser(@Param("userId") UUID userId);

    /** Phase E4: recent terminal sessions for boot failure rate monitoring. */
    List<RuntimeSession> findTop20ByCompletedAtIsNotNullOrderByCompletedAtDesc();
    long countByExecutionStatusAndCreatedAtBefore(String executionStatus, java.time.OffsetDateTime createdAt);
    List<RuntimeSession> findByExecutionStatusOrderByCreatedAtAsc(String executionStatus);
    List<RuntimeSession> findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc(String executionStatus);
    List<RuntimeSession> findByExecutionStatusIn(java.util.Collection<String> statuses);
    List<RuntimeSession> findByResourceProjectIn(java.util.Collection<String> resourceProjects);

    /** Atomic FIFO claim: concurrent claimers skip rows another transaction already locked (no double claim). */
    @Query(value = "SELECT * FROM runtime_sessions WHERE execution_status = 'QUEUED' AND cancel_requested_at IS NULL "
            + "ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<RuntimeSession> lockOldestQueued();

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy"})
    List<RuntimeSession> findByProjectIdOrderByCreatedAtDesc(UUID projectId);

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy", "assignment"})
    List<RuntimeSession> findByAssignmentIdAndTriggeredBy_IdOrderByCreatedAtDesc(UUID assignmentId, UUID triggeredById);

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy", "assignment"})
    List<RuntimeSession> findByProject_Workspace_IdAndTriggeredBy_IdOrderByCreatedAtDesc(UUID workspaceId, UUID triggeredById);

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy", "assignment", "modelVersion"})
    List<RuntimeSession> findTop50ByOrderByCreatedAtDesc();

    List<RuntimeSession> findBySourceSnapshotId(UUID sourceSnapshotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM RuntimeSession s WHERE s.id = :id")
    Optional<RuntimeSession> findLockedById(@Param("id") UUID id);
}
