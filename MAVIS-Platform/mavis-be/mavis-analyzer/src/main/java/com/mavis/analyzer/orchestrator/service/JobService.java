package com.mavis.analyzer.orchestrator.service;

import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;

import java.util.List;
import java.util.UUID;

public interface JobService {

    JobResponseDTO getJobById(UUID jobId);

    List<JobResponseDTO> getJobsByProjectId(UUID projectId);
}
