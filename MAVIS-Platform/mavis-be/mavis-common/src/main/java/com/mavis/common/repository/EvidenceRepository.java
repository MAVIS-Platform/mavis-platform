package com.mavis.common.repository;

import com.mavis.common.entity.Evidence;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface EvidenceRepository extends JpaRepository<Evidence, UUID> {
    List<Evidence> findByModelVersionId(UUID modelVersionId);
    long countByModelVersionId(UUID modelVersionId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByElementId(UUID elementId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByElementIdOrderByCreatedAtAsc(UUID elementId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByRelationshipId(UUID relationshipId);

    @EntityGraph(attributePaths = {"element", "relationship"})
    List<Evidence> findByRelationshipIdOrderByCreatedAtAsc(UUID relationshipId);

    List<Evidence> findByRelationshipIdIn(Collection<UUID> relationshipIds);
    List<Evidence> findByElementIdIn(Collection<UUID> elementIds);
}
