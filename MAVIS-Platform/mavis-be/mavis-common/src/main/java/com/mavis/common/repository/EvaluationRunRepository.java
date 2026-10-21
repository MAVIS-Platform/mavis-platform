package com.mavis.common.repository;

import com.mavis.common.entity.EvaluationRun;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface EvaluationRunRepository extends JpaRepository<EvaluationRun, UUID> {
    List<EvaluationRun> findByModelVersionId(UUID modelVersionId);
    List<EvaluationRun> findByRuntimeSessionId(UUID runtimeSessionId);
}
