package com.mavis.common.repository;

import com.mavis.common.entity.TheoryAsset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TheoryAssetRepository extends JpaRepository<TheoryAsset, UUID> {

    List<TheoryAsset> findByWorkspaceIdOrderByUpdatedAtDesc(UUID workspaceId);

    Optional<TheoryAsset> findByIdAndWorkspaceId(UUID id, UUID workspaceId);
}
