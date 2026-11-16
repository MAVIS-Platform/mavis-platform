package com.mavis.common.repository;

import com.mavis.common.entity.AiExplanation;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AiExplanationRepository extends JpaRepository<AiExplanation, UUID> {

    List<AiExplanation> findByModelVersionId(UUID modelVersionId);
    Optional<AiExplanation> findFirstByModelVersionIdAndContextKeyOrderByCreatedAtDesc(UUID modelVersionId, String contextKey);

    @EntityGraph(attributePaths = {"modelVersion", "element", "relationship", "runtimeSession", "requestedBy"})
    List<AiExplanation> findByModelVersionIdOrderByCreatedAtDesc(UUID modelVersionId);

    @EntityGraph(attributePaths = {"modelVersion", "element", "relationship", "runtimeSession", "requestedBy"})
    Optional<AiExplanation> findWithDetailsById(UUID id);

    Optional<AiExplanation> findFirstByModelVersionIdAndExplanationScopeAndElementIdOrderByCreatedAtDesc(
            UUID modelVersionId, String explanationScope, UUID elementId);

    Optional<AiExplanation> findFirstByModelVersionIdAndExplanationScopeAndRelationshipIdOrderByCreatedAtDesc(
            UUID modelVersionId, String explanationScope, UUID relationshipId);

    Optional<AiExplanation> findFirstByModelVersionIdAndExplanationScopeAndRuntimeSessionIdOrderByCreatedAtDesc(
            UUID modelVersionId, String explanationScope, UUID runtimeSessionId);

    Optional<AiExplanation> findFirstByModelVersionIdAndExplanationScopeOrderByCreatedAtDesc(
            UUID modelVersionId, String explanationScope);
}
