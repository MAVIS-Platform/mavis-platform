package com.mavis.common.repository;

import com.mavis.common.entity.FeedbackComment;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface FeedbackCommentRepository extends JpaRepository<FeedbackComment, UUID> {
    List<FeedbackComment> findBySubmissionId(UUID submissionId);
    List<FeedbackComment> findByLecturerId(UUID lecturerId);

    @EntityGraph(attributePaths = {"lecturer", "element", "relationship"})
    List<FeedbackComment> findBySubmissionIdOrderByCreatedAtAsc(UUID submissionId);

    long countBySubmissionId(UUID submissionId);

    @Query("SELECT f.submission.id, COUNT(f.id) FROM FeedbackComment f WHERE f.submission.id IN :submissionIds GROUP BY f.submission.id")
    List<Object[]> countFeedbacksBySubmissionIds(@Param("submissionIds") Collection<UUID> submissionIds);
}

