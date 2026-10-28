package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.workerclient.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkerModelPublisher {
    private final JobRepository jobs;
    private final ProjectRepository projects;
    private final ModelVersionRepository versions;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final GraphBuilderService graph;
    private final WorkerCanonicalImporter importer;
    private final ObjectMapper json;
    private final CrossLanguageServiceLinker linker;
    private final com.mavis.analyzer.diagram.service.DiagramProjectionService diagrams;
    private final AnalysisAttemptRepository attempts;
    private final com.mavis.analyzer.orchestrator.service.impl.AnalysisExecutionRegistry executions;

    @Transactional
    public boolean begin(UUID jobId,UUID attempt,Instant deadline) {
        if(attempt==null || deadline==null || !Instant.now().isBefore(deadline))throw new IllegalArgumentException("Invalid attempt deadline");
        Job job=jobs.findLockedById(jobId).orElseThrow();
        if(!"PENDING".equals(job.getStatus()))return false;
        job.setStatus("RUNNING");job.setResultManifest(json.createObjectNode().put("attemptId",attempt.toString()).put("deadlineUtc",deadline.toString()));
        jobs.save(job);
        attempts.save(AnalysisAttempt.builder().id(attempt).job(job).status("RUNNING").ownerInstance(executions.instanceId()).startedAt(OffsetDateTime.now()).deadlineUtc(OffsetDateTime.ofInstant(deadline,java.time.ZoneOffset.UTC)).build());return true;
    }

    @Transactional(rollbackFor=Exception.class)
    public UUID publish(UUID jobId,UUID attempt,Instant deadline,String source,List<String> services,List<CodeEvidenceDTO> javaFindings,
                        boolean hasJava,DotnetWorkerClientService.Execution execution) throws java.io.IOException {
        Job job=jobs.findLockedById(jobId).orElseThrow();
        if(!active(job,attempt))throw new IllegalStateException("Stale or cancelled analysis attempt");
        if(job.getResultManifest().path("deadlineUtc").asText().isEmpty() || !deadline.equals(Instant.parse(job.getResultManifest().path("deadlineUtc").asText())))
            throw new IllegalArgumentException("Publication deadline cannot be extended");
        if(!Instant.now().isBefore(deadline))throw new IllegalStateException("Analysis attempt expired before publication");
        Project project=projects.findLockedById(job.getProject().getId()).orElseThrow();
        var outcome=execution.outcome();
        boolean complete=outcome.status()==WorkerContract.Status.COMPLETED;
        boolean notApplicable=outcome.status()==WorkerContract.Status.NOT_APPLICABLE;
        if(outcome.status()==WorkerContract.Status.CANCELLED)throw new IllegalStateException("Worker attempt cancelled");
        if(!hasJava && !complete)throw new IllegalStateException("Csharp analysis did not complete");
        if(complete) {
            if(execution.context()==null || !execution.context().jobId().equals(jobId.toString()) || !execution.context().attemptId().equals(attempt.toString()) ||
                    !execution.context().sourceSnapshotId().equals(job.getSourceSnapshot().getId().toString()) || !execution.context().projectId().equals(project.getId().toString()))
                throw new IllegalArgumentException("Worker publication scope mismatch");
            ResultValidator.validate(outcome.result(),execution.context());
            if(!Instant.now().isBefore(execution.context().deadlineUtc()))throw new IllegalStateException("Late Worker result");
        }
        ObjectNode manifest=(ObjectNode)job.getResultManifest().deepCopy();
        manifest.set("dotnetAdapter",json.createObjectNode().put("status",outcome.status().name()).put("code",outcome.code()));
        manifest.put("completeness",complete||notApplicable?"ADAPTERS_COMPLETED":"PARTIAL");
        manifest.put("canonicalMapping","REQUIRES_REVIEW");
        manifest.put("analysisPolicyVersion", "source-method-v3-feign");
        var javaFacts = javaFindings == null ? java.util.List.<CodeEvidenceDTO>of() : javaFindings;
        manifest.putObject("javaExtractionCoverage")
                .put("classifierFacts", javaFacts.stream().filter(f -> "CLASS_INTERFACE".equals(f.getElementType())).count())
                .put("feignClientFacts", javaFacts.stream().filter(f -> "FEIGN_CLIENT".equals(f.getElementType())).count())
                .put("feignCallSiteFacts", javaFacts.stream().filter(f -> "FEIGN_INVOCATION".equals(f.getElementType())).count())
                .put("coverageMeaning", "Counts describe extracted facts, not proof of complete source or runtime coverage");
        if(complete) {
            manifest.set("dotnetCoverage",json.valueToTree(outcome.result().coverage()));manifest.set("dotnetWarnings",json.valueToTree(outcome.result().warnings()));
            manifest.put("analyzerVersion",outcome.result().analyzerVersion()).put("inputDigest",outcome.result().inputDigest());
        }
        ModelVersion version=versions.save(ModelVersion.builder().project(project).sourceSnapshot(job.getSourceSnapshot())
                .createdBy(project.getOwner()).revision(versions.findMaxRevisionByProjectId(project.getId())+1).schemaVersion("1.0").origin("GENERATED").isLatestValid(false).build());
        if(hasJava || !services.isEmpty()) {
            var saved=graph.buildAndSaveElements(version,services,source);
            graph.buildRelationshipsAndEvidences(job.getSourceSnapshot(),version,saved,javaFindings);
        }
        if(complete)importer.importResult(version,outcome.result());
        var mapping=linker.link(version,source,complete?outcome.result():null,javaFindings);
        manifest.set("serviceMapping",json.valueToTree(mapping));
        diagrams.generateDefaultDiagramsForModel(version,elements.findByModelVersionId(version.getId()),relationships.findByModelVersionId(version.getId()));
        // Missing C# in mixed input may retain a partial draft, never replace the latest complete model.
        if(complete||notApplicable) {versions.invalidatePreviousVersions(project.getId(),version.getId());version.setIsLatestValid(true);versions.save(version);}
        manifest.put("modelVersionId",version.getId().toString()).put("promotedLatest",complete||notApplicable);
        manifest.put("elementsCount",elements.countByModelVersionId(version.getId())).put("relationshipsCount",relationships.countByModelVersionId(version.getId())).put("evidencesCount",evidence.countByModelVersionId(version.getId()));
        if(!Instant.now().isBefore(deadline))throw new IllegalStateException("Analysis attempt expired during publication");
        job.setResultManifest(manifest);job.setStatus("COMPLETED");job.setCompletedAt(OffsetDateTime.now());jobs.save(job);
        finishAttempt(attempt,complete||notApplicable?"COMPLETED":"PARTIAL",null);
        return version.getId();
    }
    @Transactional
    public void fail(UUID jobId,UUID attempt,String code) {
        Job job=jobs.findLockedById(jobId).orElseThrow();if(!active(job,attempt))return;
        job.setStatus("FAILED");job.setErrorDiagnostics(code);job.setCompletedAt(OffsetDateTime.now());jobs.save(job);finishAttempt(attempt,"FAILED",code);
    }
    @Transactional public void acknowledgeCancellation(UUID jobId,UUID attempt){var job=jobs.findLockedById(jobId).orElseThrow();if("CANCELLING".equals(job.getStatus())&&job.getResultManifest()!=null&&attempt.toString().equals(job.getResultManifest().path("attemptId").asText())){job.setStatus("CANCELLED");job.setCompletedAt(OffsetDateTime.now());jobs.save(job);finishAttempt(attempt,"CANCELLED",null);}}
    private void finishAttempt(UUID id,String status,String code){attempts.findById(id).ifPresent(a->{a.setStatus(status);a.setCompletedAt(OffsetDateTime.now());a.setDiagnosticCode(code);attempts.save(a);});}
    private boolean active(Job job,UUID attempt) {return "RUNNING".equals(job.getStatus()) && job.getResultManifest()!=null && attempt.toString().equals(job.getResultManifest().path("attemptId").asText());}
}
