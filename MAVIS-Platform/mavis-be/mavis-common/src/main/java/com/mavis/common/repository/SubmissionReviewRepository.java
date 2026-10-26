package com.mavis.common.repository;
import com.mavis.common.entity.SubmissionReview;
import org.springframework.data.jpa.repository.*;
import java.util.*;
public interface SubmissionReviewRepository extends JpaRepository<SubmissionReview,UUID> {
    @EntityGraph(attributePaths={"lecturer"})
    Optional<SubmissionReview> findBySubmissionId(UUID submissionId);
}
