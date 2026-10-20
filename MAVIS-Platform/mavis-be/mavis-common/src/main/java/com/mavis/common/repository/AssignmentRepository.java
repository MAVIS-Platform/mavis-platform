package com.mavis.common.repository;

import com.mavis.common.entity.Assignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AssignmentRepository extends JpaRepository<Assignment, UUID> {
    List<Assignment> findByWorkspaceId(UUID workspaceId);
    List<Assignment> findByCreatedById(UUID createdById);
}
