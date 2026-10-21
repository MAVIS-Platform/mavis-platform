package com.mavis.analyzer.detector.docker;

import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.service.DockerDetectorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DockerDetector {

    private final DockerDetectorService dockerDetectorService;

    public List<String> detectServices(String extractedPath) {
        return dockerDetectorService.detectServices(extractedPath);
    }

    public List<DetectedContainerDTO> detectContainers(String extractedPath) {
        return dockerDetectorService.detectContainers(extractedPath);
    }
}
