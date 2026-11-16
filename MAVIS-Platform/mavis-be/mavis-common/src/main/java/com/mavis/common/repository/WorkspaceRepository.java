package com.mavis.common.repository;

import com.mavis.common.entity.Workspace;
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
public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Workspace w where w.id = :id")
    Optional<Workspace> findLockedById(@Param("id") UUID id);

    Optional<Workspace> findByCode(String code);
    List<Workspace> findByCreatedById(UUID createdById);

    boolean existsByCodeIgnoreCase(String code);

    @EntityGraph(attributePaths = {"createdBy"})
    Optional<Workspace> findWithCreatorById(UUID id);

    @EntityGraph(attributePaths = {"createdBy"})
    @Query("SELECT DISTINCT w FROM Workspace w LEFT JOIN WorkspaceMember wm ON wm.workspace.id = w.id WHERE w.createdBy.id = :userId OR wm.user.id = :userId ORDER BY w.createdAt DESC")
    List<Workspace> findAllAccessibleByUserId(@Param("userId") UUID userId);
}

