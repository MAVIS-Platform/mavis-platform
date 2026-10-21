package com.mavis.platform.submission.dto;

import com.mavis.common.entity.FeedbackComment;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Thông tin nhận xét chấm bài từ Giảng viên")
public class FeedbackResponseDTO {

    private UUID id;
    private UUID submissionId;
    private UUID lecturerId;
    private String lecturerName;
    private String lecturerEmail;
    private UUID elementId;
    private String elementName;
    private UUID relationshipId;
    private String relationType;
    private String commentText;
    private OffsetDateTime createdAt;

    public static FeedbackResponseDTO fromEntity(FeedbackComment f) {
        if (f == null) return null;
        return FeedbackResponseDTO.builder()
                .id(f.getId())
                .submissionId(f.getSubmission() != null ? f.getSubmission().getId() : null)
                .lecturerId(f.getLecturer() != null ? f.getLecturer().getId() : null)
                .lecturerName(f.getLecturer() != null ? f.getLecturer().getFullName() : null)
                .lecturerEmail(f.getLecturer() != null ? f.getLecturer().getEmail() : null)
                .elementId(f.getElement() != null ? f.getElement().getId() : null)
                .elementName(f.getElement() != null ? f.getElement().getName() : null)
                .relationshipId(f.getRelationship() != null ? f.getRelationship().getId() : null)
                .relationType(f.getRelationship() != null ? f.getRelationship().getRelationType() : null)
                .commentText(f.getCommentText())
                .createdAt(f.getCreatedAt())
                .build();
    }
}
