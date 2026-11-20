package com.mavis.platform.submission.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.exception.*;
import com.mavis.platform.workspace.service.CourseProgressionService;
import jakarta.persistence.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service @RequiredArgsConstructor
public class SubmissionReviewService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final BigDecimal SNAPSHOT_PASS_EXCLUSIVE_THRESHOLD = new BigDecimal("5.0");

    private final SubmissionSnapshotRepository submissions;
    private final SubmissionReviewRepository reviews;
    private final AccessPolicyService access;
    private final EntityManager entityManager;
    private final CourseProgressionService courseProgression;

    public record SnapshotGrade(
            @NotBlank @Size(max = 128) String snapshotId,
            @Size(max = 255) String title,
            @NotNull @DecimalMin("0") @DecimalMax("10") @Digits(integer = 2, fraction = 2) BigDecimal score,
            @Size(max = 2000) String comment) {}

    public record Save(
            @Min(0) long expectedRevision,
            @NotNull @Pattern(regexp="DRAFT|RETURNED|GRADED") String status,
            @DecimalMin("0") @DecimalMax("100") @Digits(integer=3,fraction=2) BigDecimal score,
            @NotNull @Size(max=10000) String summary,
            List<@Valid SnapshotGrade> snapshotGrades) {
        public Save(long expectedRevision, String status, BigDecimal score, String summary) {
            this(expectedRevision, status, score, summary, List.of());
        }
    }

    public record View(
            UUID submissionId,
            long revision,
            String status,
            BigDecimal score,
            BigDecimal scoreTenScale,
            String summary,
            UUID lecturerId,
            String lecturerName,
            OffsetDateTime updatedAt,
            List<SnapshotGrade> snapshotGrades,
            String labOutcome) {
        public View(UUID submissionId, long revision, String status, BigDecimal score, String summary,
                    UUID lecturerId, String lecturerName, OffsetDateTime updatedAt,
                    List<SnapshotGrade> snapshotGrades, String labOutcome) {
            this(submissionId, revision, status, score, toTenScale(score), summary,
                    lecturerId, lecturerName, updatedAt, snapshotGrades, labOutcome);
        }

        public View(UUID submissionId, long revision, String status, BigDecimal score, String summary,
                    UUID lecturerId, String lecturerName, OffsetDateTime updatedAt) {
            this(submissionId, revision, status, score, summary, lecturerId, lecturerName, updatedAt, List.of(), "PENDING");
        }
    }

    public static BigDecimal toTenScale(BigDecimal scoreOutOf100) {
        if (scoreOutOf100 == null) {
            return null;
        }
        return scoreOutOf100.divide(BigDecimal.TEN, 2, RoundingMode.HALF_UP);
    }

    @Transactional(readOnly=true)
    public View get(UUID id) {
        var submission=submission(id);var actor=access.requireCurrentActiveUser();
        boolean student=actor.getId().equals(submission.getSubmittedBy().getId());
        if (!student) access.requireWorkspaceLecturer(submission.getAssignment().getWorkspace().getId());
        var review=reviews.findBySubmissionId(id);
        if(review.isEmpty() || (student && "DRAFT".equals(review.get().getStatus()))) return new View(id,0,"PENDING",null,"",null,null,null,List.of(),"PENDING");
        return view(review.get());
    }
    @Transactional
    public View save(UUID id,Save request) {
        var submission=submission(id);access.requireWorkspaceLecturer(submission.getAssignment().getWorkspace().getId());
        var actor=access.requireCurrentActiveUser();
        if(actor.getId().equals(submission.getSubmittedBy().getId()))throw new BusinessException(ErrorCode.FORBIDDEN,"Cannot grade your own submission");
        if(!java.util.Set.of("DRAFT","RETURNED","GRADED").contains(request.status()) || request.expectedRevision()<0 || request.summary()==null || request.summary().length()>10000 ||
            (request.score()!=null && (request.score().signum()<0 || request.score().compareTo(new BigDecimal("100"))>0 || request.score().scale()>2)))throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid review");

        boolean guidedLab = submission.getAssignment().getLabOrder() != null;
        boolean publishing = "GRADED".equals(request.status());
        List<SnapshotGrade> normalizedGrades = request.snapshotGrades() == null ? List.of() : request.snapshotGrades();
        boolean hasSnapshotGrades = !normalizedGrades.isEmpty();
        boolean allSnapshotsPassed = true;
        BigDecimal resolvedScore = request.score();

        if (hasSnapshotGrades) {
            BigDecimal total = BigDecimal.ZERO;
            for (SnapshotGrade grade : normalizedGrades) {
                if (grade == null || grade.snapshotId() == null || grade.snapshotId().isBlank()
                        || grade.score() == null || grade.score().signum() < 0
                        || grade.score().compareTo(new BigDecimal("10")) > 0 || grade.score().scale() > 2) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Each snapshot score must be between 0 and 10");
                }
                if (grade.score().compareTo(SNAPSHOT_PASS_EXCLUSIVE_THRESHOLD) <= 0) {
                    allSnapshotsPassed = false;
                }
                total = total.add(grade.score());
            }
            if ((guidedLab && publishing) || (!guidedLab && resolvedScore == null)) {
                resolvedScore = total.multiply(BigDecimal.TEN)
                        .divide(BigDecimal.valueOf(normalizedGrades.size()), 2, RoundingMode.HALF_UP);
            }
        }
        if (guidedLab && !publishing) resolvedScore = null;

        if("GRADED".equals(request.status())&&resolvedScore==null)throw new BusinessException(ErrorCode.BAD_REQUEST,"A published grade requires a rubric score (0-10 per snapshot)");
        if("GRADED".equals(request.status())&&request.summary().isBlank())throw new BusinessException(ErrorCode.BAD_REQUEST,"APPROVAL_SUMMARY_REQUIRED");
        if("RETURNED".equals(request.status())&&request.summary().isBlank())throw new BusinessException(ErrorCode.BAD_REQUEST,"REJECTION_REASON_REQUIRED");
        entityManager.lock(submission,LockModeType.PESSIMISTIC_WRITE);
        var review=reviews.findBySubmissionId(id).orElseGet(SubmissionReview::new);
        if(review.getRevision()!=request.expectedRevision())throw new BusinessException(ErrorCode.CONFLICT,"Review changed. Reload before saving");

        if (guidedLab && "GRADED".equals(review.getStatus()) && "PASSED".equals(review.getLabOutcome())) {
            throw new BusinessException(ErrorCode.CONFLICT, "PASSED_LAB_REVIEW_FINAL");
        }
        if (guidedLab && (publishing || hasSnapshotGrades)) {
            var required = new HashSet<String>();
            JsonNode snapshots = submission.getStudentSnapshots();
            if (snapshots != null && snapshots.isArray()) {
                for (JsonNode snapshot : snapshots) {
                    String snapshotId = snapshot.path("snapshotId").textValue();
                    if (snapshotId == null || snapshotId.isBlank() || !required.add(snapshotId)) {
                        throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_SUBMISSION_SNAPSHOTS");
                    }
                }
            }
            if (required.isEmpty()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "SUBMISSION_SNAPSHOTS_REQUIRED");
            }
            for (SnapshotGrade grade : normalizedGrades) {
                if (!required.remove(grade.snapshotId())) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "INVALID_SNAPSHOT_GRADE_IDS");
                }
            }
            if (publishing && !required.isEmpty()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "SNAPSHOT_GRADES_INCOMPLETE");
            }
        }

        boolean passed = "GRADED".equals(request.status()) && (!hasSnapshotGrades || allSnapshotsPassed);
        String labOutcome = "GRADED".equals(request.status())
                ? (passed ? "PASSED" : "NEEDS_REVISION")
                : ("RETURNED".equals(request.status()) ? "NEEDS_REVISION" : "PENDING");

        review.setSubmission(submission);review.setLecturer(actor);review.setRevision(review.getRevision()+1);
        review.setStatus(request.status());review.setScore(resolvedScore);review.setSummary(request.summary().trim());
        review.setSnapshotGrades(hasSnapshotGrades ? JSON.valueToTree(normalizedGrades) : null);
        review.setLabOutcome(labOutcome);
        review.setUpdatedAt(OffsetDateTime.now());
        review=reviews.saveAndFlush(review);
        if("GRADED".equals(review.getStatus())) {
            courseProgression.recordFinalizedResult(id,review.getRevision(),passed);
        }
        return view(review);
    }
    private SubmissionSnapshot submission(UUID id) {
        var submission=submissions.findWithDetailsById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND));
        if(submission.getAssignment()==null||submission.getAssignment().getWorkspace()==null)throw new BusinessException(ErrorCode.FORBIDDEN,"A teaching workspace is required");
        return submission;
    }
    private View view(SubmissionReview review) {
        List<SnapshotGrade> grades = parseSnapshotGrades(review.getSnapshotGrades());
        String outcome = review.getLabOutcome();
        if (outcome == null || outcome.isBlank()) {
            outcome = "GRADED".equals(review.getStatus()) ? "PASSED"
                    : ("RETURNED".equals(review.getStatus()) ? "NEEDS_REVISION" : "PENDING");
        }
        return new View(review.getSubmission().getId(),review.getRevision(),review.getStatus(),review.getScore(),
                review.getSummary(),review.getLecturer().getId(),review.getLecturer().getFullName(),
                review.getUpdatedAt(),grades,outcome);
    }

    private static List<SnapshotGrade> parseSnapshotGrades(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) {
            return List.of();
        }
        List<SnapshotGrade> result = new ArrayList<>();
        for (JsonNode item : node) {
            if (item == null || !item.isObject()) {
                continue;
            }
            BigDecimal score = item.hasNonNull("score") ? new BigDecimal(item.get("score").asText()) : null;
            result.add(new SnapshotGrade(
                    item.path("snapshotId").asText(""),
                    item.hasNonNull("title") ? item.get("title").asText() : null,
                    score,
                    item.hasNonNull("comment") ? item.get("comment").asText() : null));
        }
        return List.copyOf(result);
    }
}
