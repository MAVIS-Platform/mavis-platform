package com.mavis.common.repository;

import com.mavis.common.entity.EvaluationFinding;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EvaluationFindingRepository extends JpaRepository<EvaluationFinding, UUID> {
    @EntityGraph(attributePaths = {"element", "relationship"})
    List<EvaluationFinding> findByEvaluationRunId(UUID evaluationRunId);
    List<EvaluationFinding> findByElementId(UUID elementId);
    List<EvaluationFinding> findByRelationshipId(UUID relationshipId);
}
