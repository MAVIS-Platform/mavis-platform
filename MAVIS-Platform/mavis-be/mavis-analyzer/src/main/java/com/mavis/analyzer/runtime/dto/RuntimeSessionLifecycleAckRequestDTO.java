package com.mavis.analyzer.runtime.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RuntimeSessionLifecycleAckRequestDTO {

    @NotNull
    private UUID sessionId;

    @NotBlank
    private String resourceProject;

    @NotBlank
    private String stage; // "ALLOCATED" or "RUNNING"

    private OffsetDateTime observedAt;
}
