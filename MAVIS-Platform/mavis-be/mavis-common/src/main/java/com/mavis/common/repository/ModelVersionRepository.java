package com.mavis.common.repository;

import com.mavis.common.entity.ModelVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ModelVersionRepository extends JpaRepository<ModelVersion, UUID> {

    @Modifying
    @Transactional
    @Query("UPDATE ModelVersion m SET m.isLatestValid = false WHERE m.project.id = :projectId AND m.id != :currentId")
    void invalidatePreviousVersions(@Param("projectId") UUID projectId, @Param("currentId") UUID currentId);

    Optional<ModelVersion> findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(UUID projectId);

    List<ModelVersion> findByProjectId(UUID projectId);

    List<ModelVersion> findByProjectIdOrderByRevisionDesc(UUID projectId);

    @Query("SELECT COALESCE(MAX(m.revision), 0) FROM ModelVersion m WHERE m.project.id = :projectId")
    Integer findMaxRevisionByProjectId(@Param("projectId") UUID projectId);
}
