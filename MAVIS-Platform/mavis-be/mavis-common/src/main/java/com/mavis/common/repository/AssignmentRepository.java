package com.mavis.common.repository;

import com.mavis.common.entity.Assignment;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {
    List<Assignment> findByWorkspaceId(UUID workspaceId);
    List<Assignment> findByCreatedById(UUID createdById);

    long countByWorkspaceId(UUID workspaceId);

    @Query("SELECT a.workspace.id, COUNT(a.id) FROM Assignment a WHERE a.workspace.id IN :workspaceIds GROUP BY a.workspace.id")
    List<Object[]> countAssignmentsByWorkspaceIds(@Param("workspaceIds") Collection<UUID> workspaceIds);

    @EntityGraph(attributePaths = {"workspace", "createdBy"})
    List<Assignment> findByWorkspaceIdOrderByCreatedAtDesc(UUID workspaceId);

    @EntityGraph(attributePaths = {"workspace", "createdBy"})
    Optional<Assignment> findWithDetailsById(UUID id);
}

