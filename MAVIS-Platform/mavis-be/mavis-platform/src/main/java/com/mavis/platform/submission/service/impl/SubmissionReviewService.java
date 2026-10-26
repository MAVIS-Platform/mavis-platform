package com.mavis.platform.submission.service.impl;

import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.*;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class SubmissionReviewService {
    private final SubmissionSnapshotRepository submissions;
    private final SubmissionReviewRepository reviews;
    private final AccessPolicyService access;
    private final EntityManager entityManager;
    public record Save(@Min(0) long expectedRevision, @NotNull @Pattern(regexp="DRAFT|RETURNED|GRADED") String status,
                       @DecimalMin("0") @DecimalMax("100") @Digits(integer=3,fraction=2) BigDecimal score,
                       @NotNull @Size(max=10000) String summary) {}
    public record View(UUID submissionId,long revision,String status,BigDecimal score,String summary,
                       UUID lecturerId,String lecturerName,OffsetDateTime updatedAt) {}

    @Transactional(readOnly=true)
    public View get(UUID id) {
        var submission=submission(id);var actor=access.requireCurrentActiveUser();
        boolean student=actor.getId().equals(submission.getSubmittedBy().getId());
        if (!student) access.requireWorkspaceLecturer(submission.getAssignment().getWorkspace().getId());
        var review=reviews.findBySubmissionId(id);
        if(review.isEmpty() || (student && "DRAFT".equals(review.get().getStatus()))) return new View(id,0,"PENDING",null,"",null,null,null);
        return view(review.get());
    }
    @Transactional
    public View save(UUID id,Save request) {
        var submission=submission(id);access.requireWorkspaceLecturer(submission.getAssignment().getWorkspace().getId());
        var actor=access.requireCurrentActiveUser();
        if(actor.getId().equals(submission.getSubmittedBy().getId()))throw new BusinessException(ErrorCode.FORBIDDEN,"Cannot grade your own submission");
        if(!java.util.Set.of("DRAFT","RETURNED","GRADED").contains(request.status()) || request.expectedRevision()<0 || request.summary()==null || request.summary().length()>10000 ||
            (request.score()!=null && (request.score().signum()<0 || request.score().compareTo(new BigDecimal("100"))>0 || request.score().scale()>2)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid review");
        if("GRADED".equals(request.status())&&request.score()==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"A published grade requires a score out of 100");
        if("RETURNED".equals(request.status())&&request.summary().isBlank())throw new BusinessException(ErrorCode.BAD_REQUEST,"Explain the requested changes before returning work");
        entityManager.lock(submission,LockModeType.PESSIMISTIC_WRITE);
        var review=reviews.findBySubmissionId(id).orElseGet(SubmissionReview::new);
        if(review.getRevision()!=request.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT,"Review changed. Reload before saving");
        review.setSubmission(submission);review.setLecturer(actor);review.setRevision(review.getRevision()+1);
        review.setStatus(request.status());review.setScore(request.score());review.setSummary(request.summary().trim());review.setUpdatedAt(OffsetDateTime.now());
        return view(reviews.save(review));
    }
    private SubmissionSnapshot submission(UUID id) {
        var submission=submissions.findWithDetailsById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
        if(submission.getAssignment()==null||submission.getAssignment().getWorkspace()==null)throw new BusinessException(ErrorCode.FORBIDDEN,"A teaching workspace is required");
        return submission;
    }
    private View view(SubmissionReview review) {
        return new View(review.getSubmission().getId(),review.getRevision(),review.getStatus(),review.getScore(),review.getSummary(),review.getLecturer().getId(),review.getLecturer().getFullName(),review.getUpdatedAt());
    }
}
