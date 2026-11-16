package com.mavis.platform.assignment.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AssignmentCreateRequest {

    @NotBlank(message = "Tiêu đề đề bài không được để trống")
    @Size(max = 255, message = "Tiêu đề không được vượt quá 255 ký tự")
    private String title;

    private String description;

    private String labMode;

    private List<String> requiredDiagramTypes;

    @Builder.Default
    private String ruleSetVersion = "SWD_DEFAULT_V1";

    @Builder.Default
    private Boolean requireRuntimeTrace = false;

    private Object aiPolicy;

    @Min(value = 1, message = "Thứ tự Lab phải >= 1")
    private Integer labOrder;

    private java.util.UUID referenceModelId;
    private Boolean clearReferenceSource;

    private OffsetDateTime dueAt;
}
