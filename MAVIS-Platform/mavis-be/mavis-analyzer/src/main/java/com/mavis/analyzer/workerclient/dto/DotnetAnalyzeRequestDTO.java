package com.mavis.analyzer.workerclient.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DotnetAnalyzeRequestDTO {
    private UUID projectId;
    private UUID sourceSnapshotId;
    private String extractedSourcePath;
}
