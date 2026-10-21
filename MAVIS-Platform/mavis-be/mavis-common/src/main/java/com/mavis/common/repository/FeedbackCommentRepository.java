package com.mavis.common.repository;

import com.mavis.common.entity.FeedbackComment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface FeedbackCommentRepository extends JpaRepository<FeedbackComment, UUID> {
    List<FeedbackComment> findBySubmissionId(UUID submissionId);
    List<FeedbackComment> findByLecturerId(UUID lecturerId);
}
