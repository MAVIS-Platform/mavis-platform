package com.mavis.common.repository;
import com.mavis.common.entity.ArchitectureDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface ArchitectureDocumentRepository extends JpaRepository<ArchitectureDocument,UUID> {
    List<ArchitectureDocument> findByModelVersionIdAndViewKeyInAndRevisionIn(
            UUID modelVersionId, Collection<String> viewKeys, Collection<Long> revisions);
    List<ArchitectureDocument> findByModelVersionIdOrderByViewKeyAscRevisionDesc(UUID modelVersionId);
    Optional<ArchitectureDocument> findTopByModelVersionIdAndViewKeyOrderByRevisionDesc(UUID modelVersionId,String viewKey);
    Optional<ArchitectureDocument> findByModelVersionIdAndViewKeyAndRevision(UUID modelVersionId,String viewKey,long revision);
}
