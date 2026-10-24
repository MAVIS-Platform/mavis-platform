package com.mavis.analyzer.runtime.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils;
import com.mavis.common.dto.ApiResponse;
import com.mavis.common.exception.*;
import com.mavis.common.repository.RuntimeSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/analyzer/runtime/sessions")
public class RuntimeRecoveryController {
    private final RuntimeSessionRepository sessions;
    private final RunnerServiceAuthGuard access;
    private final ObjectMapper json;
    public record Result(String sessionId, String modelVersionId, String sourceSnapshotId, String profileVersionId,
        String runConfigurationVersionId, String scenarioVersionId, String resourceProject,
        String recoveryId, String cleanupStatus, OffsetDateTime recoveredAt) {}
    public record Ack(UUID sessionId, String resourceProject, String recoveryId, String recoveryDigest, String persistenceStatus) {}

    @PostMapping("/{id}/recovery-result")
    @Transactional(rollbackFor = Exception.class)
    public ApiResponse<Ack> recover(@PathVariable UUID id, @RequestBody Result result) {
        var session=sessions.findLockedById(id).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Session not found"));
        access.requireRunnerService();
        if(result==null || !id.toString().equals(result.sessionId()) || session.getModelVersion()==null ||
            !session.getModelVersion().getId().toString().equals(result.modelVersionId()) ||
            !session.getSourceSnapshot().getId().toString().equals(result.sourceSnapshotId()) ||
            !java.util.Objects.equals(session.getProfileVersionId(),result.profileVersionId()) ||
            !java.util.Objects.equals(session.getRunConfigurationVersionId(),result.runConfigurationVersionId()) ||
            !java.util.Objects.equals(session.getScenarioVersionId(),result.scenarioVersionId()) ||
            !java.util.Objects.equals(session.getResourceProject(),result.resourceProject()) ||
            result.recoveryId()==null || !result.recoveryId().matches("[0-9a-f]{32}") ||
            !"Confirmed".equals(result.cleanupStatus()) || result.recoveredAt()==null)
            throw new BusinessException(ErrorCode.BAD_REQUEST,"Invalid recovery scope/result");
        var incoming=json.valueToTree(result);
        String digest=CanonicalReceiptDigestUtils.computeDigest(incoming);
        if(session.getRecoveryResultJson()!=null) {
            if(!digest.equals(CanonicalReceiptDigestUtils.computeDigest(session.getRecoveryResultJson())))
                throw new BusinessException(ErrorCode.CONFLICT,"Conflicting recovery result");
            return ApiResponse.success(new Ack(id,result.resourceProject(),result.recoveryId(),digest,"ALREADY_COMMITTED"));
        }
        if(session.getRunnerReceiptJson()!=null || session.getCompletedAt()!=null)
            throw new BusinessException(ErrorCode.CONFLICT,"Terminal session already recorded");
        if(!java.util.Set.of("ALLOCATED","RUNNING","CANCELLING").contains(session.getExecutionStatus()))
            throw new BusinessException(ErrorCode.CONFLICT,"No active allocation to recover");
        session.setRecoveryResultJson(incoming);
        session.setExecutionStatus("FAILED");
        session.setScenarioStatus("FAILED");
        session.setCleanupStatus("CONFIRMED");
        session.setCompletedAt(OffsetDateTime.now());
        session.setPublicationGateStatus("HELD_NON_PROMOTED");
        sessions.save(session);
        return ApiResponse.success(new Ack(id,result.resourceProject(),result.recoveryId(),digest,"COMMITTED"));
    }
}
