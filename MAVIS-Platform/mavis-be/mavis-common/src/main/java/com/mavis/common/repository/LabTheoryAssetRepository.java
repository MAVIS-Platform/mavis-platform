package com.mavis.common.repository;

import com.mavis.common.entity.LabTheoryAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LabTheoryAssetRepository extends JpaRepository<LabTheoryAsset, UUID> {

    List<LabTheoryAsset> findByAssignmentIdOrderByPositionAsc(UUID assignmentId);

    Optional<LabTheoryAsset> findByAssignmentIdAndAssetId(UUID assignmentId, UUID assetId);

    List<LabTheoryAsset> findByAssetId(UUID assetId);
}
