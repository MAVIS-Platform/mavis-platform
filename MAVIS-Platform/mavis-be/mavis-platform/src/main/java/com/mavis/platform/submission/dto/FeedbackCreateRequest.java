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
@Schema(description = "Yêu cầu tạo nhận xét / góp ý chấm bài của Giảng viên")
public class FeedbackCreateRequest {

    @Schema(description = "ID phần tử kiến trúc (ModelElement) nếu ghim vào Node (nullable)", example = "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    private UUID elementId;

    @Schema(description = "ID mối quan hệ kiến trúc (ModelRelationship) nếu ghim vào Edge (nullable)", example = "3fa85f64-5717-4562-b3fc-2c963f66afa6")
    private UUID relationshipId;

    @NotBlank(message = "Nội dung nhận xét không được để trống")
    @Schema(description = "Nội dung nhận xét chấm bài", example = "Dịch vụ thanh toán chưa cấu hình Circuit Breaker dự phòng.")
    private String commentText;
}
