package com.mavis.common.repository;
import com.mavis.common.entity.AnalysisAttempt;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface AnalysisAttemptRepository extends JpaRepository<AnalysisAttempt,UUID> {
    List<AnalysisAttempt> findByJobIdOrderByStartedAtAsc(UUID jobId);
}
