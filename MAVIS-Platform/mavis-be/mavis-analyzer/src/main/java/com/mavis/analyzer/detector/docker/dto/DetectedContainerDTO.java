package com.mavis.analyzer.detector.docker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DetectedContainerDTO {

    private String serviceName;
    private String image;
    private String buildContext;
    private String artifactName;
    private String artifactLocator;
    @Builder.Default
    private List<DetectedConnectionDTO> connections = new ArrayList<>();
    private String messageBrokerAuthority;
    private String datasourceHost;
    private String datasourceDatabase;
    private String datasourceTechnology;
    private Integer datasourceLineNumber;
    private String elementType; // "SERVICE_CONTAINER", "DATABASE", "QUEUE_BROKER"

    @Builder.Default
    private List<String> ports = new ArrayList<>();

    @Builder.Default
    private List<DockerDependencyDTO> dependsOn = new ArrayList<>();

    private Integer lineNumber;
    private String composeFilePath;
}
