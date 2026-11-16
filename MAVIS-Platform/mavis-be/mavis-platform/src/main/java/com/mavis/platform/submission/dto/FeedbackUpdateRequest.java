package com.mavis.platform.submission.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Schema(description = "Yêu cầu cập nhật nhận xét chấm bài")
public class FeedbackUpdateRequest {

    @Schema(description = "ID phần tử kiến trúc nếu muốn đổi vị trí ghim (nullable)")
    private UUID elementId;

    @Schema(description = "ID mối quan hệ kiến trúc nếu muốn đổi vị trí ghim (nullable)")
    private UUID relationshipId;

    @NotBlank(message = "Nội dung nhận xét không được để trống")
    @Schema(description = "Nội dung nhận xét mới")
    private String commentText;
}
