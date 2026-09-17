package com.mavis.common.repository;

import com.mavis.common.entity.AnalysisSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface AnalysisSessionRepository extends JpaRepository<AnalysisSession, UUID> {
}
