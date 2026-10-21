package com.mavis.common.repository;

import com.mavis.common.entity.Workspace;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    Optional<Workspace> findByCode(String code);
    List<Workspace> findByCreatedById(UUID createdById);
}
