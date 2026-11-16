package com.mavis.analyzer.detector.config.service;

import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;

import java.util.List;

public interface SpringConfigDetectorService {

    List<DetectedSpringConfigDTO> detectConfigs(String rootPath);
}
