package com.mavis.common.repository;

import com.mavis.common.entity.SourceSnapshot;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SourceSnapshotRepository extends JpaRepository<SourceSnapshot, UUID> {
    List<SourceSnapshot> findByProjectId(UUID projectId);
    Optional<SourceSnapshot> findFirstByProjectIdOrderByCreatedAtDesc(UUID projectId);

    @EntityGraph(attributePaths = {"project", "createdBy"})
    @Query("SELECT s FROM SourceSnapshot s WHERE s.project.workspace.id = :workspaceId AND s.isPublished = true ORDER BY s.createdAt DESC")
    List<SourceSnapshot> findPublishedByWorkspaceId(@Param("workspaceId") UUID workspaceId);
}
