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

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy"})
    List<RuntimeSession> findByProjectIdOrderByCreatedAtDesc(UUID projectId);

    List<RuntimeSession> findBySourceSnapshotId(UUID sourceSnapshotId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM RuntimeSession s WHERE s.id = :id")
    Optional<RuntimeSession> findLockedById(@Param("id") UUID id);
}
