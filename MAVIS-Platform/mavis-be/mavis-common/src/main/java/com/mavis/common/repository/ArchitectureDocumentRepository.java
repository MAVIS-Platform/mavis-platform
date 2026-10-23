package com.mavis.common.repository;
import com.mavis.common.entity.ArchitectureDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ArchitectureDocumentRepository extends JpaRepository<ArchitectureDocument,UUID> {
    Optional<ArchitectureDocument> findTopByModelVersionIdAndViewKeyOrderByRevisionDesc(UUID modelVersionId,String viewKey);
    Optional<ArchitectureDocument> findByModelVersionIdAndViewKeyAndRevision(UUID modelVersionId,String viewKey,long revision);
}