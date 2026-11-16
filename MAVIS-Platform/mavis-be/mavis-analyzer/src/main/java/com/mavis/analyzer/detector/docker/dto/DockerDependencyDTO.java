package com.mavis.analyzer.detector.docker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DockerDependencyDTO {
    private String targetService;
    private Integer lineNumber;
}
