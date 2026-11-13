package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.orchestrator.service.impl.AnalysisExecutionRegistry;
import com.mavis.common.entity.AnalysisAttempt;
import com.mavis.common.entity.Job;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.AnalysisAttemptRepository;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.JobRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkerModelPublisherTest {
    @Mock private JobRepository jobs;
    @Mock private ProjectRepository projects;
    @Mock private ModelVersionRepository versions;
    @Mock private ModelElementRepository elements;
    @Mock private ModelRelationshipRepository relationships;
    @Mock private EvidenceRepository evidence;
    @Mock private GraphBuilderService graph;
    @Mock private WorkerCanonicalImporter importer;
    @Spy private ObjectMapper json = new ObjectMapper();
    @Mock private CrossLanguageServiceLinker linker;
    @Mock private DiagramProjectionService diagrams;
    @Mock private AnalysisAttemptRepository attempts;
    @Mock private AnalysisExecutionRegistry executions;
    @InjectMocks private WorkerModelPublisher publisher;

    @Test
    void failedJobPreservesPreviousLatestValidModelAndRecordsAttemptDiagnostic() {
        UUID jobId = UUID.randomUUID();
        UUID attemptId = UUID.randomUUID();
        UUID projectId = UUID.randomUUID();
        Project project = Project.builder().id(projectId).name("Guided Project").build();
        Job job = Job.builder()
                .id(jobId)
                .project(project)
                .sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build())
                .status("RUNNING")
                .resultManifest(json.createObjectNode().put("attemptId", attemptId.toString()))
                .build();
        AnalysisAttempt attempt = AnalysisAttempt.builder()
                .id(attemptId)
                .job(job)
                .status("RUNNING")
                .build();

        when(jobs.findLockedById(jobId)).thenReturn(Optional.of(job));
        when(attempts.findById(attemptId)).thenReturn(Optional.of(attempt));

        publisher.fail(jobId, UUID.randomUUID(), "STALE_ATTEMPT_IGNORED");
        assertThat(job.getStatus()).isEqualTo("RUNNING");

        publisher.fail(jobId, attemptId, "ANALYSIS_OR_PUBLICATION_FAILED");

        assertThat(job.getStatus()).isEqualTo("FAILED");
        assertThat(job.getErrorDiagnostics()).isEqualTo("ANALYSIS_OR_PUBLICATION_FAILED");
        assertThat(job.getCompletedAt()).isNotNull();
        assertThat(attempt.getStatus()).isEqualTo("FAILED");
        assertThat(attempt.getDiagnosticCode()).isEqualTo("ANALYSIS_OR_PUBLICATION_FAILED");
        verify(versions, never()).invalidatePreviousVersions(any(), any());
        verify(versions, never()).save(any());
    }
}
