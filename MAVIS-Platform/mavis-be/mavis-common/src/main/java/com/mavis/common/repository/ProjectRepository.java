package com.mavis.common.repository;

import com.mavis.common.entity.Project;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ProjectRepository extends JpaRepository<Project, UUID> {
    List<Project> findByOwnerId(UUID ownerId);
    List<Project> findByWorkspaceId(UUID workspaceId);

    @EntityGraph(attributePaths = {"owner", "workspace", "assignment"})
    List<Project> findByOwnerIdOrderByCreatedAtDesc(UUID ownerId);

    @EntityGraph(attributePaths = {"owner", "workspace", "assignment"})
    Optional<Project> findWithDetailsById(UUID id);

    @EntityGraph(attributePaths = {"owner", "workspace", "assignment"})
    List<Project> findByWorkspaceIdAndStatusNotOrderByCreatedAtDesc(UUID workspaceId, String excludedStatus);
}
