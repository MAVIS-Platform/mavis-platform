package com.mavis.common.repository;
import com.mavis.common.entity.SubmissionReview;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface SubmissionReviewRepository extends JpaRepository<SubmissionReview,UUID> {
    @EntityGraph(attributePaths={"lecturer"})
    Optional<SubmissionReview> findBySubmissionId(UUID submissionId);

    @EntityGraph(attributePaths={"lecturer", "submission"})
    List<SubmissionReview> findBySubmissionIdIn(Collection<UUID> submissionIds);

    interface GradebookReviewProjection {
        UUID getSubmissionId();
        String getStatus();
        java.math.BigDecimal getScore();
        String getLabOutcome();
        java.time.OffsetDateTime getUpdatedAt();
    }

    @Query("""
            SELECT r.submission.id AS submissionId,
                   r.status AS status,
                   r.score AS score,
                   r.labOutcome AS labOutcome,
                   r.updatedAt AS updatedAt
            FROM SubmissionReview r
            WHERE r.submission.id IN :submissionIds
            """)
    List<GradebookReviewProjection> findGradebookReviewsBySubmissionIds(@Param("submissionIds") Collection<UUID> submissionIds);
}
