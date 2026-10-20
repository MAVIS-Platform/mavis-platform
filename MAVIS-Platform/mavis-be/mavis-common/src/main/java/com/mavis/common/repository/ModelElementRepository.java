package com.mavis.common.repository;

import com.mavis.common.entity.ModelElement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ModelElementRepository extends JpaRepository<ModelElement, UUID> {
    List<ModelElement> findByModelVersionId(UUID modelVersionId);
    List<ModelElement> findByModelVersionIdAndParentElementId(UUID modelVersionId, UUID parentElementId);
    boolean existsByIdAndModelVersionId(UUID id, UUID modelVersionId);
}
