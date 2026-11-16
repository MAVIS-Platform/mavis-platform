package com.mavis.platform.submission.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Yêu cầu nộp bài tập kiến trúc bất biến")
public class SubmissionCreateRequest {

    @NotNull(message = "ID đề bài tập không được để trống")
    @Schema(description = "ID của đề bài tập (Assignment)", example = "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    private UUID assignmentId;

    @Schema(description = "ID của đồ án kiến trúc (Project); bỏ trống cho Lab v2")
    private UUID projectId;

    @Schema(description = "ID của ModelVersion nộp bài; bỏ trống cho Lab v2")
    private UUID modelVersionId;

    @Schema(description = "ID của DiagramVersion nộp bài; bỏ trống cho Lab v2")
    private UUID diagramVersionId;

    @Schema(description = "ID kết quả chấm kiến trúc tự động (nếu có)")
    private UUID evaluationRunId;

    @Schema(description = "ID phiên chạy sandbox thực nghiệm (bắt buộc nếu đề bài yêu cầu requireRuntimeTrace)")
    private UUID runtimeSessionId;

    @Schema(description = "Ghi chú của sinh viên khi nộp bài", example = "Em đã hoàn thành thiết kế C4 Container và cấu hình OTel trace.")
    private String submissionNotes;

    @Valid
    @Schema(description = "Danh sách các Snapshot thực hành kèm giải thích lý thuyết của sinh viên")
    private List<StudentSnapshotItemDTO> studentSnapshots;

    @Valid
    @Schema(description = "Câu trả lời giải trình cho Lab v2")
    private List<TheoryAnswerDTO> theoryAnswers;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class TheoryAnswerDTO {
        @Size(max = 64)
        private String sectionId;
        @Size(max = 255)
        private String title;
        @Size(max = 20000)
        private String answer;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class StudentSnapshotItemDTO {
        private String snapshotId;
        private String step;
        private String title;
        private String targetViewOrService;
        private String writtenExplanation;
        private String capturedAt;
    }
}
