package com.mavis.common.repository;

import com.mavis.common.entity.SubmissionSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface SubmissionSnapshotRepository extends JpaRepository<SubmissionSnapshot, UUID> {
    List<SubmissionSnapshot> findByAssignmentId(UUID assignmentId);
    List<SubmissionSnapshot> findByProjectId(UUID projectId);
    List<SubmissionSnapshot> findBySubmittedById(UUID submittedById);
}
