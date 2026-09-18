package com.mavis.common.repository;

import com.mavis.common.entity.AnalysisSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Repository
public interface AnalysisSessionRepository extends JpaRepository<AnalysisSession, UUID> {

    @Modifying
    @Transactional
    @Query("UPDATE AnalysisSession s SET s.isLatestValid = false WHERE s.project.id = :projectId AND s.id != :currentSessionId")
    void invalidatePreviousSessions(@Param("projectId") UUID projectId, @Param("currentSessionId") UUID currentSessionId);
}
