package com.mavis.common.repository;

import com.mavis.common.entity.ModelRelationship;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ModelRelationshipRepository extends JpaRepository<ModelRelationship, UUID> {
    @EntityGraph(attributePaths = {"sourceElement", "targetElement"})
    List<ModelRelationship> findByModelVersionId(UUID modelVersionId);

    @Query("SELECT r FROM ModelRelationship r WHERE r.modelVersion.id = :modelVersionId")
    List<ModelRelationship> findRawByModelVersionId(@Param("modelVersionId") UUID modelVersionId);

    long countByModelVersionId(UUID modelVersionId);

    List<ModelRelationship> findBySourceElementId(UUID sourceElementId);
    List<ModelRelationship> findByTargetElementId(UUID targetElementId);
}
