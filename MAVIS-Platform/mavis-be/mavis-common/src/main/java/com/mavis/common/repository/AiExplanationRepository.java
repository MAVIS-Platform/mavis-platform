package com.mavis.common.repository;

import com.mavis.common.entity.AiExplanation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AiExplanationRepository extends JpaRepository<AiExplanation, UUID> {
    List<AiExplanation> findByModelVersionId(UUID modelVersionId);
}
