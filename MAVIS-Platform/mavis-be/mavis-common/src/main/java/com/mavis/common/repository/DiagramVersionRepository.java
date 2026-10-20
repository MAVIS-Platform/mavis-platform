package com.mavis.common.repository;

import com.mavis.common.entity.DiagramVersion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DiagramVersionRepository extends JpaRepository<DiagramVersion, UUID> {
    List<DiagramVersion> findByModelVersionId(UUID modelVersionId);
    List<DiagramVersion> findByModelVersionIdAndNotation(UUID modelVersionId, String notation);
}
