package com.mavis.platform.workspace.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Data transfer records for chapter-level Coursera ESSAY item submissions
 * and lecturer 100-point rubric grading.
 */
public final class CourseEssayDtos {
    private CourseEssayDtos() {}

    public record EssaySubmissionView(
            UUID id,
            UUID workspaceId,
            UUID courseItemId,
            String itemTitle,
            UUID studentId,
            String studentName,
            String studentEmail,
            String answerMarkdown,
            String status,
            BigDecimal score,
            String feedback,
            UUID gradedBy,
            OffsetDateTime submittedAt,
            OffsetDateTime gradedAt
    ) {}

    public record SubmitEssayRequest(
            @NotBlank(message = "Essay answer cannot be empty")
            @Size(max = 50000, message = "Essay answer cannot exceed 50,000 characters")
            String answerMarkdown
    ) {}

    public record GradeEssayRequest(
            @NotNull(message = "Score is required")
            @DecimalMin(value = "0.0", message = "Score must be at least 0")
            @DecimalMax(value = "100.0", message = "Score cannot exceed 100")
            BigDecimal score,

            @Size(max = 10000, message = "Feedback cannot exceed 10,000 characters")
            String feedback,

            String status
    ) {}
}
