package com.mavis.common.repository;

import com.mavis.common.entity.SubmissionSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface SubmissionSnapshotRepository extends JpaRepository<SubmissionSnapshot, UUID> {
    List<SubmissionSnapshot> findByAssignmentId(UUID assignmentId);
    List<SubmissionSnapshot> findByProjectId(UUID projectId);
    List<SubmissionSnapshot> findBySubmittedById(UUID submittedById);

    boolean existsByAssignmentId(UUID assignmentId);
    long countByAssignmentId(UUID assignmentId);

    @Query("SELECT s.assignment.id, COUNT(s.id) FROM SubmissionSnapshot s WHERE s.assignment.id IN :assignmentIds GROUP BY s.assignment.id")
    List<Object[]> countSubmissionsByAssignmentIds(@Param("assignmentIds") Collection<UUID> assignmentIds);
}
