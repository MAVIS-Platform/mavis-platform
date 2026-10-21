package com.mavis.analyzer.orchestrator.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.orchestrator.dto.JobResponseDTO;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class JobServiceImplTest {

    @Mock
    private JobRepository jobRepository;

    @Mock
    private ProjectRepository projectRepository;

    @InjectMocks
    private JobServiceImpl jobService;

    private Project sampleProject;
    private SourceSnapshot sampleSnapshot;
    private Job sampleJob;
    private ObjectNode manifestNode;

    @BeforeEach
    void setUp() {
        UUID projectId = UUID.randomUUID();
        UUID snapshotId = UUID.randomUUID();
        UUID jobId = UUID.randomUUID();

        sampleProject = Project.builder()
                .id(projectId)
                .name("Order Service")
                .build();

        sampleSnapshot = SourceSnapshot.builder()
                .id(snapshotId)
                .project(sampleProject)
                .artifactHash("abc123hash")
                .build();

        ObjectMapper mapper = new ObjectMapper();
        manifestNode = mapper.createObjectNode();
        manifestNode.put("elementsCount", 5);
        manifestNode.put("relationshipsCount", 4);
        manifestNode.put("evidencesCount", 8);

        sampleJob = Job.builder()
                .id(jobId)
                .project(sampleProject)
                .sourceSnapshot(sampleSnapshot)
                .jobType("STATIC_ANALYSIS")
                .status("COMPLETED")
                .resultManifest(manifestNode)
                .startedAt(OffsetDateTime.now().minusMinutes(5))
                .completedAt(OffsetDateTime.now())
                .build();
    }

    @Test
    @DisplayName("getJobById - Thành công lấy thông tin tiến trình")
    void getJobById_Success() {
        when(jobRepository.findById(sampleJob.getId())).thenReturn(Optional.of(sampleJob));

        JobResponseDTO response = jobService.getJobById(sampleJob.getId());

        assertThat(response).isNotNull();
        assertThat(response.getJobId()).isEqualTo(sampleJob.getId());
        assertThat(response.getProjectId()).isEqualTo(sampleProject.getId());
        assertThat(response.getSourceSnapshotId()).isEqualTo(sampleSnapshot.getId());
        assertThat(response.getStatus()).isEqualTo("COMPLETED");
        assertThat(response.getJobType()).isEqualTo("STATIC_ANALYSIS");
        assertThat(response.getResultManifest()).isNotNull();
        assertThat(response.getResultManifest().get("elementsCount").asInt()).isEqualTo(5);
    }

    @Test
    @DisplayName("getJobById - Ném NOT_FOUND khi jobId không tồn tại")
    void getJobById_NotFound_ThrowsException() {
        UUID nonExistentId = UUID.randomUUID();
        when(jobRepository.findById(nonExistentId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> jobService.getJobById(nonExistentId))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }

    @Test
    @DisplayName("getJobsByProjectId - Thành công lấy danh sách tiến trình theo dự án")
    void getJobsByProjectId_Success() {
        when(projectRepository.existsById(sampleProject.getId())).thenReturn(true);
        when(jobRepository.findByProjectIdOrderByStartedAtDesc(sampleProject.getId()))
                .thenReturn(List.of(sampleJob));

        List<JobResponseDTO> response = jobService.getJobsByProjectId(sampleProject.getId());

        assertThat(response).hasSize(1);
        assertThat(response.get(0).getJobId()).isEqualTo(sampleJob.getId());
        assertThat(response.get(0).getStatus()).isEqualTo("COMPLETED");
    }

    @Test
    @DisplayName("getJobsByProjectId - Ném NOT_FOUND khi dự án không tồn tại")
    void getJobsByProjectId_ProjectNotFound_ThrowsException() {
        UUID nonExistentProjectId = UUID.randomUUID();
        when(projectRepository.existsById(nonExistentProjectId)).thenReturn(false);

        assertThatThrownBy(() -> jobService.getJobsByProjectId(nonExistentProjectId))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.NOT_FOUND);
    }
}
