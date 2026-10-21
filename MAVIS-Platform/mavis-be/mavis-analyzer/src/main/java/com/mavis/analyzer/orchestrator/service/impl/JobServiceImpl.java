package com.mavis.analyzer.orchestrator.service.impl;

import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.analyzer.orchestrator.service.JobService;
import com.mavis.common.entity.Job;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ProjectRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class JobServiceImpl implements JobService {

    private final JobRepository jobRepository;
    private final ProjectRepository projectRepository;

    @Override
    @Transactional(readOnly = true)
    public JobResponseDTO getJobById(UUID jobId) {
        Job job = jobRepository.findById(jobId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy tiến trình phân tích với ID: " + jobId));

        return toResponseDTO(job);
    }

    @Override
    @Transactional(readOnly = true)
    public List<JobResponseDTO> getJobsByProjectId(UUID projectId) {
        if (!projectRepository.existsById(projectId)) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy dự án với ID: " + projectId);
        }

        List<Job> jobs = jobRepository.findByProjectIdOrderByStartedAtDesc(projectId);
        return jobs.stream()
                .map(this::toResponseDTO)
                .toList();
    }

    private JobResponseDTO toResponseDTO(Job job) {
        return JobResponseDTO.builder()
                .jobId(job.getId())
                .projectId(job.getProject() != null ? job.getProject().getId() : null)
                .sourceSnapshotId(job.getSourceSnapshot() != null ? job.getSourceSnapshot().getId() : null)
                .jobType(job.getJobType())
                .status(job.getStatus())
                .resultManifest(job.getResultManifest())
                .errorDiagnostics(job.getErrorDiagnostics())
                .startedAt(job.getStartedAt())
                .completedAt(job.getCompletedAt())
                .build();
    }
}
