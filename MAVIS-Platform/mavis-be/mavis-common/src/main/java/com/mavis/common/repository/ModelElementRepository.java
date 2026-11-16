package com.mavis.common.repository;

import com.mavis.common.entity.ModelElement;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.UUID;

@Repository
public interface ModelElementRepository extends JpaRepository<ModelElement, UUID> {
    @EntityGraph(attributePaths = {"parentElement"})
    List<ModelElement> findByModelVersionId(UUID modelVersionId);
    String CONTEXT_SOURCE_DECISIONS_SQL="SELECT DISTINCT ON (entry->>'sourceRoleKey') entry->>'sourceRoleKey' AS source_key,entry->>'state' AS state FROM model_elements me JOIN model_versions mv ON mv.id=me.model_version_id CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(me.properties->'contextReview'->'entries')='array' THEN me.properties->'contextReview'->'entries' ELSE '[]'::jsonb END) entry WHERE mv.project_id=:projectId AND mv.revision<=:revision AND entry->>'sourceRoleKey' IS NOT NULL ORDER BY entry->>'sourceRoleKey',mv.revision DESC";
    @Query(value=CONTEXT_SOURCE_DECISIONS_SQL,nativeQuery=true)
    List<Object[]> findContextSourceDecisions(@Param("projectId") UUID projectId,@Param("revision") int revision);
    long countByModelVersionId(UUID modelVersionId);
    List<ModelElement> findByModelVersionIdAndParentElementId(UUID modelVersionId, UUID parentElementId);
    boolean existsByIdAndModelVersionId(UUID id, UUID modelVersionId);
}
