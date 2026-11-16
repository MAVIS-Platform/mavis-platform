package com.mavis.common.repository;

import com.mavis.common.entity.WorkspaceMember;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Repository
public interface WorkspaceMemberRepository extends JpaRepository<WorkspaceMember, UUID> {
    List<WorkspaceMember> findByWorkspaceId(UUID workspaceId);
    List<WorkspaceMember> findByUserId(UUID userId);
    Optional<WorkspaceMember> findByWorkspaceIdAndUserId(UUID workspaceId, UUID userId);

    long countByWorkspaceId(UUID workspaceId);
    boolean existsByWorkspaceIdAndUserId(UUID workspaceId, UUID userId);

    List<WorkspaceMember> findByUserIdAndWorkspaceIdIn(UUID userId, Collection<UUID> workspaceIds);

    @Query("SELECT wm.workspace.id, COUNT(wm.id) FROM WorkspaceMember wm WHERE wm.workspace.id IN :workspaceIds GROUP BY wm.workspace.id")
    List<Object[]> countMembersByWorkspaceIds(@Param("workspaceIds") Collection<UUID> workspaceIds);

    @EntityGraph(attributePaths = {"user", "user.role"})
    List<WorkspaceMember> findByWorkspaceIdOrderByJoinedAtAsc(UUID workspaceId);

    @EntityGraph(attributePaths = {"user", "user.role"})
    List<WorkspaceMember> findByWorkspaceIdInOrderByJoinedAtAsc(Collection<UUID> workspaceIds);

    @Query("SELECT wm.user.id FROM WorkspaceMember wm WHERE wm.workspace.id = :workspaceId")
    Set<UUID> findMemberUserIdsByWorkspaceId(@Param("workspaceId") UUID workspaceId);
}

