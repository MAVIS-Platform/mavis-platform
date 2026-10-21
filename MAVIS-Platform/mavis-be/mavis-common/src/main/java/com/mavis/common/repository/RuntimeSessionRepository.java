package com.mavis.common.repository;

import com.mavis.common.entity.RuntimeSession;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RuntimeSessionRepository extends JpaRepository<RuntimeSession, UUID> {
    List<RuntimeSession> findByProjectId(UUID projectId);

    @EntityGraph(attributePaths = {"project", "sourceSnapshot", "triggeredBy"})
    List<RuntimeSession> findByProjectIdOrderByCreatedAtDesc(UUID projectId);

    List<RuntimeSession> findBySourceSnapshotId(UUID sourceSnapshotId);
}
