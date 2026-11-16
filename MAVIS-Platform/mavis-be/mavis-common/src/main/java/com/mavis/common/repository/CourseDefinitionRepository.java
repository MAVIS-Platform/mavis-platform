package com.mavis.common.repository;

import com.mavis.common.entity.CourseDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

public interface CourseDefinitionRepository extends JpaRepository<CourseDefinition, UUID> {
    Optional<CourseDefinition> findByWorkspaceId(UUID workspaceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from CourseDefinition c join fetch c.workspace where c.workspace.id = :workspaceId")
    Optional<CourseDefinition> findLockedByWorkspaceId(@Param("workspaceId") UUID workspaceId);
}
