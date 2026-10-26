package com.mavis.common.repository;

import com.mavis.common.entity.Evidence;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface EvidenceRepository extends JpaRepository<Evidence, UUID> {
    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByModelVersionId(UUID modelVersionId);
    long countByModelVersionId(UUID modelVersionId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByElementId(UUID elementId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByElementIdOrderByCreatedAtAsc(UUID elementId);

    @EntityGraph(attributePaths = {"element", "relationship", "relationship.sourceElement", "relationship.targetElement"})
    @Query("select e from Evidence e left join e.element a left join e.relationship r where e.modelVersion.id = :modelVersionId and (a.id = :elementId or r.sourceElement.id = :elementId or r.targetElement.id = :elementId) order by e.createdAt asc")
    List<Evidence> findElementContext(@Param("modelVersionId") UUID modelVersionId, @Param("elementId") UUID elementId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByRelationshipId(UUID relationshipId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByRelationshipIdOrderByCreatedAtAsc(UUID relationshipId);

    List<Evidence> findByRelationshipIdIn(Collection<UUID> relationshipIds);
    List<Evidence> findByElementIdIn(Collection<UUID> elementIds);

    @Query("SELECT e.relationship.id, e.id FROM Evidence e WHERE e.modelVersion.id = :modelVersionId AND e.relationship IS NOT NULL")
    List<Object[]> findRelationshipEvidenceIdsByModelVersionId(@Param("modelVersionId") UUID modelVersionId);
}
