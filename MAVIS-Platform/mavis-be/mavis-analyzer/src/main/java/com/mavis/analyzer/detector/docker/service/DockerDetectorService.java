package com.mavis.analyzer.detector.docker.service;

import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;

import java.util.List;

public interface DockerDetectorService {

    List<DetectedContainerDTO> detectContainers(String extractedPath);

    List<String> detectServices(String extractedPath);
}
