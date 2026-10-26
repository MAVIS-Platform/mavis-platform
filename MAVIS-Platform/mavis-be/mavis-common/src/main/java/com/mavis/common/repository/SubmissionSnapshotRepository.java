package com.mavis.common.repository;

import com.mavis.common.entity.SubmissionSnapshot;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SubmissionSnapshotRepository extends JpaRepository<SubmissionSnapshot, UUID> {
    boolean existsByDiagramVersionId(UUID diagramVersionId);
    List<SubmissionSnapshot> findByAssignmentId(UUID assignmentId);
    List<SubmissionSnapshot> findByProjectId(UUID projectId);
    List<SubmissionSnapshot> findBySubmittedById(UUID submittedById);

    @EntityGraph(attributePaths = {
            "assignment", "project", "submittedBy", "sourceSnapshot",
            "modelVersion", "diagramVersion", "evaluationRun", "runtimeSession"
    })
    List<SubmissionSnapshot> findByAssignmentIdOrderBySubmittedAtDesc(UUID assignmentId);

    @EntityGraph(attributePaths = {
            "assignment", "project", "submittedBy", "sourceSnapshot",
            "modelVersion", "diagramVersion", "evaluationRun", "runtimeSession"
    })
    List<SubmissionSnapshot> findByProjectIdOrderBySubmittedAtDesc(UUID projectId);

    @EntityGraph(attributePaths = {
            "assignment", "project", "submittedBy", "sourceSnapshot",
            "modelVersion", "diagramVersion", "evaluationRun", "runtimeSession"
    })
    @Query("SELECT s FROM SubmissionSnapshot s WHERE s.id = :id")
    Optional<SubmissionSnapshot> findWithDetailsById(@Param("id") UUID id);

    // All eight paths are to-one associations: keep one row per submission; no collection fetch joins.
    @EntityGraph(attributePaths = {"assignment", "project", "submittedBy", "sourceSnapshot", "modelVersion", "diagramVersion", "evaluationRun", "runtimeSession"})
    @Query("SELECT s FROM SubmissionSnapshot s WHERE :admin = true OR s.submittedBy.id = :userId OR EXISTS (SELECT wm.id FROM WorkspaceMember wm WHERE wm.workspace = s.assignment.workspace AND wm.user.id = :userId AND wm.memberRole = 'LECTURER') ORDER BY s.submittedAt DESC")
    List<SubmissionSnapshot> findVisibleTo(@Param("userId") UUID userId, @Param("admin") boolean admin);

    boolean existsByAssignmentId(UUID assignmentId);
    long countByAssignmentId(UUID assignmentId);
    boolean existsBySourceSnapshotId(UUID sourceSnapshotId);

    @Query("SELECT s.assignment.id, COUNT(s.id) FROM SubmissionSnapshot s WHERE s.assignment.id IN :assignmentIds GROUP BY s.assignment.id")
    List<Object[]> countSubmissionsByAssignmentIds(@Param("assignmentIds") Collection<UUID> assignmentIds);
}

