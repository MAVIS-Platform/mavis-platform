package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.security.RunnerServiceAuthGuard;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.analyzer.runtime.utils.CanonicalReceiptDigestUtils;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.*;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class RunnerReceiptIngestServiceImpl implements RunnerReceiptIngestService {

    private static final Pattern RESOURCE_PROJECT_PATTERN = Pattern.compile("^mavisrun-[0-9a-fA-F]{32}$");

    private final RuntimeSessionRepository runtimeSessionRepository;
    private final ProjectRepository projectRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final DiagramVersionRepository diagramVersionRepository;
    private final RunnerServiceAuthGuard runnerServiceAuthGuard;
    private final ObjectMapper objectMapper;

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot;

    @Value("${mavis.runner.allow-unverified-poc-promotion:true}")
    private boolean allowUnverifiedPocPromotion;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelVersionResponseDTO ingestRunnerReceipt(UUID sessionId, RunnerReceiptIngestRequestDTO receipt) {
        IngestResult result = processReceiptIngest(sessionId, receipt);
        return result.enrichedVersion != null ? ModelVersionResponseDTO.fromEntity(result.enrichedVersion) : null;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ReceiptIngestAckDTO ingestRunnerReceiptAck(UUID sessionId, RunnerReceiptIngestRequestDTO receipt) {
        IngestResult result = processReceiptIngest(sessionId, receipt);
        return result.ack;
    }

    private IngestResult processReceiptIngest(UUID sessionId, RunnerReceiptIngestRequestDTO receipt) {
        log.info("Tiếp nhận RunnerReceipt cho sessionId: {}, resourceProject: {}", sessionId,
                receipt != null ? receipt.getResourceProject() : null);

        if (receipt == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt payload cannot be null");
        }

        // [CHẶNG 11]: Khóa bi quan RuntimeSession
        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        // Phân quyền kép
        runnerServiceAuthGuard.checkRunnerOrProjectWriteAccess(session.getProject());
        if (session.getRecoveryResultJson() != null) {
            throw new BusinessException(ErrorCode.CONFLICT, "Allocation was already recovered; late execution receipt rejected");
        }

        // =========================================================================
        // 1. XÁC THỰC BẮT BUỘC CẢ 6 VERSION IDS VÀ RESOURCEPROJECT (WJ-01, WJ-02)
        // =========================================================================
        if (receipt.getSessionId() == null || receipt.getSessionId().isBlank()
                || !sessionId.toString().equalsIgnoreCase(receipt.getSessionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: sessionId không khớp");
        }

        if (receipt.getSourceSnapshotId() == null || receipt.getSourceSnapshotId().isBlank()
                || !session.getSourceSnapshot().getId().toString().equalsIgnoreCase(receipt.getSourceSnapshotId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: sourceSnapshotId không khớp");
        }

        if (session.getModelVersion() == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Phiên thực nghiệm chưa được ghim ModelVersion");
        }

        if (receipt.getModelVersionId() == null || receipt.getModelVersionId().isBlank()
                || !session.getModelVersion().getId().toString().equalsIgnoreCase(receipt.getModelVersionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: modelVersionId không khớp");
        }

        if (receipt.getProfileVersionId() == null || receipt.getProfileVersionId().isBlank()
                || !receipt.getProfileVersionId().equals(session.getProfileVersionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: profileVersionId không khớp");
        }

        if (receipt.getRunConfigurationVersionId() == null || receipt.getRunConfigurationVersionId().isBlank()
                || !receipt.getRunConfigurationVersionId().equals(session.getRunConfigurationVersionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: runConfigurationVersionId không khớp");
        }

        if (receipt.getScenarioVersionId() == null || receipt.getScenarioVersionId().isBlank()
                || !receipt.getScenarioVersionId().equals(session.getScenarioVersionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: scenarioVersionId không khớp");
        }

        if (receipt.getResourceProject() == null || !RESOURCE_PROJECT_PATTERN.matcher(receipt.getResourceProject()).matches()
                || !receipt.getResourceProject().equalsIgnoreCase(session.getResourceProject())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: resourceProject không khớp");
        }

        // =========================================================================
        // 2. CANONICAL RECEIPT DIGEST & IDEMPOTENCY / CONFLICT (CHẶNG 11)
        // =========================================================================
        String incomingDigest = CanonicalReceiptDigestUtils.computeDigest(objectMapper.valueToTree(receipt));

        if (session.getReceiptDigest() != null) {
            if (session.getReceiptDigest().equals(incomingDigest)) {
                log.info("Receipt trùng incomingDigest cho session {}. Trả về idempotent ALREADY_COMMITTED.", sessionId);
                Optional<ModelVersion> existingEnriched = modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId);
                ReceiptIngestAckDTO ack = ReceiptIngestAckDTO.builder()
                        .sessionId(sessionId)
                        .resourceProject(session.getResourceProject())
                        .receiptDigest(incomingDigest)
                        .persistenceStatus("ALREADY_COMMITTED")
                        .publicationGateStatus(session.getPublicationGateStatus())
                        .promotedLatest("PROMOTED".equalsIgnoreCase(session.getPublicationGateStatus()))
                        .baseModelVersionId(session.getModelVersion().getId())
                        .enrichedModelVersionId(existingEnriched.map(ModelVersion::getId).orElse(session.getEnrichedModelVersionId()))
                        .enrichedRevision(existingEnriched.map(ModelVersion::getRevision).orElse(null))
                        .acknowledgedAt(OffsetDateTime.now())
                        .build();
                return new IngestResult(existingEnriched.orElse(null), ack);
            } else {
                throw new BusinessException(ErrorCode.CONFLICT, "Conflicting RunnerReceipt digest for session " + sessionId);
            }
        }

        session.setReceiptDigest(incomingDigest);
        session.setImageSourceCorrespondence(receipt.getImageSourceCorrespondence() != null ? receipt.getImageSourceCorrespondence() : "Unverified");
        session.setProfileAcceptance(receipt.getProfileAcceptance() != null ? receipt.getProfileAcceptance() : "Unverified");

        // =========================================================================
        // 3. ÁNH XẠ TRẠNG THÁI VÀ BẮT CÁC LỖI CẤU TRÚC (CHẶNG 11 & 12)
        // =========================================================================
        RunnerOutcomeDTO outcome = receipt.getOutcome();
        if (outcome == null) {
            outcome = RunnerOutcomeDTO.builder()
                    .executionStatus("Failed")
                    .scenarioStatus("NotRun")
                    .evidenceStatus("Unavailable")
                    .cleanupStatus("Incomplete")
                    .traceQuality("Unavailable")
                    .mappingStatus("Unavailable")
                    .build();
        }

        session.setExecutionStatus(outcome.getExecutionStatus() != null ? outcome.getExecutionStatus().toUpperCase() : "FAILED");
        session.setEvidenceStatus(outcome.getEvidenceStatus() != null ? outcome.getEvidenceStatus().toUpperCase() : "UNAVAILABLE");
        session.setCleanupStatus(outcome.getCleanupStatus() != null ? outcome.getCleanupStatus().toUpperCase() : "INCOMPLETE");
        session.setTraceQuality(outcome.getTraceQuality() != null ? outcome.getTraceQuality() : "Unavailable");
        session.setMappingStatus(outcome.getMappingStatus() != null ? outcome.getMappingStatus().toUpperCase() : "UNAVAILABLE");

        if (receipt.getSandboxEnforcementConfirmed() != null) {
            session.setSandboxEnforcementConfirmed(receipt.getSandboxEnforcementConfirmed());
        }

        // Ánh xạ scenarioStatus
        String rawScenario = outcome.getScenarioStatus();
        if ("Passed".equalsIgnoreCase(rawScenario)) {
            session.setScenarioStatus("PASSED");
        } else if ("Failed".equalsIgnoreCase(rawScenario)) {
            session.setScenarioStatus("FAILED");
        } else if ("NotRun".equalsIgnoreCase(rawScenario)) {
            if ("TimedOut".equalsIgnoreCase(outcome.getExecutionStatus())) {
                session.setScenarioStatus("TIMEOUT");
            } else if ("Cancelled".equalsIgnoreCase(outcome.getExecutionStatus())) {
                session.setScenarioStatus("CANCELLED");
            } else {
                session.setScenarioStatus("FAILED");
            }
        } else {
            session.setScenarioStatus("FAILED");
        }

        RunnerTraceCorrelationDTO trace = outcome.getTrace();
        List<RunnerCorrelatedSpanDTO> spans = (trace != null && trace.getSpans() != null)
                ? trace.getSpans()
                : Collections.emptyList();

        // [CHẶNG 12]: Tập hợp danh sách externalRootSpanIds từ outcome.scenario.steps
        Set<String> externalRootSpanIds = new HashSet<>();
        if (outcome.getScenario() != null && outcome.getScenario().has("steps") && outcome.getScenario().get("steps").isArray()) {
            for (JsonNode stepNode : outcome.getScenario().get("steps")) {
                if (stepNode.hasNonNull("parentSpanId")) {
                    String pSpanId = stepNode.get("parentSpanId").asText().toLowerCase();
                    externalRootSpanIds.add(pSpanId);
                    if (stepNode.hasNonNull("traceId")) {
                        externalRootSpanIds.add((stepNode.get("traceId").asText() + ":" + pSpanId).toLowerCase());
                    }
                }
                if (stepNode.hasNonNull("spanId")) {
                    String sSpanId = stepNode.get("spanId").asText().toLowerCase();
                    // External parent identity is scoped to its trace, never spanId alone.
                    if (stepNode.hasNonNull("traceId")) {
                        externalRootSpanIds.add((stepNode.get("traceId").asText() + ":" + sSpanId).toLowerCase());
                    }
                }
            }
        }

        // [CHẶNG 12]: hasStructuralTraceWarning
        List<String> warnings = (trace != null && trace.getWarnings() != null) ? trace.getWarnings() : Collections.emptyList();
        boolean hasStructuralTraceWarning = warnings.stream().anyMatch(w ->
                !"MISSING_PARENT_SPAN".equalsIgnoreCase(w)
                && !"ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION".equalsIgnoreCase(w));

        // Build spanMap với khóa (traceId + ":" + spanId).toLowerCase()
        Map<String, RunnerCorrelatedSpanDTO> spanMap = new HashMap<>();
        for (RunnerCorrelatedSpanDTO s : spans) {
            if (s.getSpanId() != null && s.getTraceId() != null) {
                spanMap.put((s.getTraceId() + ":" + s.getSpanId()).toLowerCase(), s);
            }
        }

        // [CHẶNG 12]: hasBrokenInternalParent
        boolean hasBrokenInternalParent = false;
        for (RunnerCorrelatedSpanDTO span : spans) {
            if (span.getParentSpanId() != null && !span.getParentSpanId().isBlank()) {
                String parentKey = (span.getTraceId() + ":" + span.getParentSpanId()).toLowerCase();
                String pSpanId = span.getParentSpanId().toLowerCase();
                if (!spanMap.containsKey(parentKey) && !externalRootSpanIds.contains(parentKey)) {
                    hasBrokenInternalParent = true;
                    break;
                }
            }
        }

        // [CHẶNG 12]: Tính traceStatus theo ranh giới Capture Boundary
        if (!"Available".equalsIgnoreCase(outcome.getEvidenceStatus()) || spans.isEmpty()) {
            session.setTraceStatus("NONE");
        } else if ("Unmapped".equalsIgnoreCase(outcome.getMappingStatus()) || spans.stream().noneMatch(s -> s.getModelServiceId() != null && !s.getModelServiceId().isBlank())) {
            session.setTraceStatus("UNMAPPED");
        } else if ("Partial".equalsIgnoreCase(outcome.getMappingStatus()) || hasBrokenInternalParent || hasStructuralTraceWarning) {
            session.setTraceStatus("PARTIAL");
        } else {
            session.setTraceStatus("COMPLETE");
        }

        session.setRunnerReceiptJson(SecretRedactor.redactJson(objectMapper.valueToTree(receipt)));
        session.setCompletedAt(OffsetDateTime.now());

        // [CHẶNG 11 & 12]: Đánh giá điều kiện Publication Gate
        boolean correspondenceOk = "Verified".equalsIgnoreCase(receipt.getImageSourceCorrespondence()) || allowUnverifiedPocPromotion;
        boolean canPromoteLatest = "Completed".equalsIgnoreCase(outcome.getExecutionStatus())
                && "Passed".equalsIgnoreCase(outcome.getScenarioStatus())
                && "Available".equalsIgnoreCase(outcome.getEvidenceStatus())
                && "Confirmed".equalsIgnoreCase(outcome.getCleanupStatus())
                && Boolean.TRUE.equals(receipt.getSandboxEnforcementConfirmed())
                && "Mapped".equalsIgnoreCase(outcome.getMappingStatus())
                && !hasStructuralTraceWarning
                && correspondenceOk;

        // Nếu spans rỗng -> không tạo ModelVersion mới
        if (spans.isEmpty()) {
            session.setEnrichedModelVersionId(null);
            session.setPublicationGateStatus("SKIPPED_NO_EVIDENCE");
            runtimeSessionRepository.save(session);

            ReceiptIngestAckDTO ack = ReceiptIngestAckDTO.builder()
                    .sessionId(sessionId)
                    .resourceProject(session.getResourceProject())
                    .receiptDigest(incomingDigest)
                    .persistenceStatus("COMMITTED")
                    .publicationGateStatus("SKIPPED_NO_EVIDENCE")
                    .promotedLatest(false)
                    .baseModelVersionId(session.getModelVersion().getId())
                    .enrichedModelVersionId(null)
                    .enrichedRevision(null)
                    .acknowledgedAt(OffsetDateTime.now())
                    .build();
            return new IngestResult(null, ack);
        }

        // =========================================================================
        // 4. KHÓA CẤP PROJECT & TẠO MODELVERSION RUNTIME_ENRICHED (CHẶNG 11 & 12)
        // =========================================================================
        Project project = session.getProject();
        Project lockedProject = projectRepository.findByIdForUpdate(project.getId()).orElse(project);

        int maxRevision = modelVersionRepository.findMaxRevisionByProjectId(lockedProject.getId());
        int newRevision = maxRevision + 1;

        ModelVersion baseVersion = session.getModelVersion();

        ModelVersion enrichedVersion = ModelVersion.builder()
                .project(lockedProject)
                .sourceSnapshot(baseVersion.getSourceSnapshot())
                .runtimeSession(session)
                .revision(newRevision)
                .schemaVersion("1.0")
                .origin("RUNTIME_ENRICHED")
                .isLatestValid(canPromoteLatest)
                .createdBy(baseVersion.getCreatedBy())
                .build();

        enrichedVersion = modelVersionRepository.save(enrichedVersion);

        if (canPromoteLatest) {
            modelVersionRepository.invalidatePreviousVersions(lockedProject.getId(), enrichedVersion.getId());
            session.setPublicationGateStatus("PROMOTED");
        } else {
            session.setPublicationGateStatus("HELD_NON_PROMOTED");
        }

        session.setEnrichedModelVersionId(enrichedVersion.getId());
        runtimeSessionRepository.save(session);

        // (4.1) Sao chép elements từ baseVersion sang enrichedVersion (bảo toàn properties và parentElement)
        List<ModelElement> baseElements = modelElementRepository.findByModelVersionId(baseVersion.getId());
        Map<UUID, ModelElement> oldToNewElementMap = new HashMap<>();
        Map<String, ModelElement> serviceNameToElementMap = new HashMap<>();
        List<ModelElement> newElements = new ArrayList<>();

        for (ModelElement baseEl : baseElements) {
            ModelElement copy = ModelElement.builder()
                    .modelVersion(enrichedVersion)
                    .name(baseEl.getName())
                    .elementType(baseEl.getElementType())
                    .languageStack(baseEl.getLanguageStack())
                    .scope(baseEl.getScope())
                    .properties(baseEl.getProperties() != null ? baseEl.getProperties().deepCopy() : null)
                    .status(baseEl.getStatus())
                    .build();
            newElements.add(copy);
            oldToNewElementMap.put(baseEl.getId(), copy);
            if (baseEl.getName() != null) {
                serviceNameToElementMap.put(baseEl.getName().toLowerCase(), copy);
            }
        }

        // UNCERTAIN_MAPPING cho runtimeService chưa có trong static model
        for (RunnerCorrelatedSpanDTO span : spans) {
            String serviceName = span.getRuntimeService();
            String modelServiceId = span.getModelServiceId();

            boolean matched = false;
            if (modelServiceId != null && !modelServiceId.isBlank()) {
                try {
                    UUID elId = UUID.fromString(modelServiceId);
                    if (oldToNewElementMap.containsKey(elId)) {
                        matched = true;
                    }
                } catch (IllegalArgumentException ignored) {}
            }

            if (!matched && serviceName != null && !serviceName.isBlank()) {
                if (serviceNameToElementMap.containsKey(serviceName.toLowerCase())) {
                    matched = true;
                }
            }

            if (!matched && serviceName != null && !serviceName.isBlank()) {
                ObjectNode props = objectMapper.createObjectNode();
                props.put("discoveredVia", "RUNNER_CORRELATED_SPAN");
                props.put("traceId", span.getTraceId());

                ModelElement uncertainEl = ModelElement.builder()
                            .modelVersion(enrichedVersion)
                        .name(serviceName)
                        .elementType("SERVICE_CONTAINER")
                        .status("UNCERTAIN_MAPPING")
                        .properties(props)
                        .build();

                newElements.add(uncertainEl);
                serviceNameToElementMap.put(serviceName.toLowerCase(), uncertainEl);
            }
        }

        List<ModelElement> savedElements = modelElementRepository.saveAll(newElements);
        for (int i = 0; i < newElements.size(); i++) {
            ModelElement el = newElements.get(i);
            ModelElement saved = savedElements.get(i);
            if (el.getName() != null) {
                serviceNameToElementMap.put(el.getName().toLowerCase(), saved);
            }
        }
        for (int i = 0; i < baseElements.size(); i++) {
            oldToNewElementMap.put(baseElements.get(i).getId(), savedElements.get(i));
        }

        for (int i = 0; i < baseElements.size(); i++) {
            ModelElement baseEl = baseElements.get(i);
            if (baseEl.getParentElement() != null) {
                ModelElement newParent = oldToNewElementMap.get(baseEl.getParentElement().getId());
                savedElements.get(i).setParentElement(newParent);
            }
        }

        modelElementRepository.saveAll(savedElements);

        // (4.2) Sao chép relationships từ baseVersion (bảo toàn properties và khóa ghép UUID)
        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseVersion.getId());
        List<ModelRelationship> newRelationships = new ArrayList<>();
        Map<String, ModelRelationship> relByPairKey = new HashMap<>();
        Map<UUID, ModelRelationship> oldToNewRelMap = new HashMap<>();

        for (ModelRelationship baseRel : baseRelationships) {
            ModelElement newSrc = oldToNewElementMap.get(baseRel.getSourceElement().getId());
            ModelElement newTgt = oldToNewElementMap.get(baseRel.getTargetElement().getId());

            if (newSrc != null && newTgt != null) {
                ModelRelationship copyRel = ModelRelationship.builder()
                            .modelVersion(enrichedVersion)
                        .sourceElement(newSrc)
                        .targetElement(newTgt)
                        .relationType(baseRel.getRelationType())
                        .originLayer(baseRel.getOriginLayer() != null ? baseRel.getOriginLayer() : "STATIC")
                        .direction(baseRel.getDirection())
                        .properties(baseRel.getProperties() != null ? baseRel.getProperties().deepCopy() : null)
                        .build();

                newRelationships.add(copyRel);
                oldToNewRelMap.put(baseRel.getId(), copyRel);
                // Khóa ghép bằng UUID
                String pairKey = (newSrc.getId().toString() + "->" + newTgt.getId().toString()).toLowerCase();
                relByPairKey.put(pairKey, copyRel);
                // Khóa phụ bằng tên
                relByPairKey.put((newSrc.getName() + "->" + newTgt.getName()).toLowerCase(), copyRel);
            }
        }

        // (4.3) Sao chép toàn bộ Evidence tĩnh (STATIC_CODE, CONFIG_FILE, DOCKER_COMPOSE) kèm provenance JSONB
        List<Evidence> baseEvidences = evidenceRepository.findByModelVersionId(baseVersion.getId());
        List<Evidence> newEvidences = new ArrayList<>();

        for (Evidence baseEv : baseEvidences) {
            if ("STATIC_CODE".equalsIgnoreCase(baseEv.getSourceType())
                    || "CONFIG_FILE".equalsIgnoreCase(baseEv.getSourceType())
                    || "DOCKER_COMPOSE".equalsIgnoreCase(baseEv.getSourceType())) {
                ModelElement newElement = baseEv.getElement() != null ? oldToNewElementMap.get(baseEv.getElement().getId()) : null;
                ModelRelationship newRel = baseEv.getRelationship() != null ? oldToNewRelMap.get(baseEv.getRelationship().getId()) : null;

                Evidence copyEv = Evidence.builder()
                        .modelVersion(enrichedVersion)
                        .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                        .element(newElement)
                        .relationship(newRel)
                        .sourceType(baseEv.getSourceType())
                        .locator(baseEv.getLocator())
                        .excerpt(baseEv.getExcerpt())
                        .adapterVersion(baseEv.getAdapterVersion())
                        .provenance(baseEv.getProvenance() != null ? baseEv.getProvenance().deepCopy() : null)
                        .build();
                newEvidences.add(copyEv);
            }
        }

        // (4.4) Xử lý tương tác nhân quả ưu tiên interactions và UUID modelServiceId
        List<CausalStepRecord> sequenceSteps = new ArrayList<>();
        int stepOrder = 1;
        Set<String> processedEdgeKeys = new HashSet<>();

        List<RunnerObservedInteractionDTO> interactions = (trace != null && trace.getInteractions() != null)
                ? trace.getInteractions()
                : Collections.emptyList();

        List<RunnerCausalEdgeDTO> causalEdges = (trace != null && trace.getCausalEdges() != null)
                ? trace.getCausalEdges()
                : Collections.emptyList();

        if (!interactions.isEmpty()) {
            for (RunnerObservedInteractionDTO interaction : interactions) {
                String edgeKey = interaction.getParentSpanId() + "->" + interaction.getChildSpanId();
                if (processedEdgeKeys.add(edgeKey)) {
                    RunnerCorrelatedSpanDTO parentSpan = spanMap.get((interaction.getTraceId() + ":" + interaction.getParentSpanId()).toLowerCase());
                    RunnerCorrelatedSpanDTO childSpan = spanMap.get((interaction.getTraceId() + ":" + interaction.getChildSpanId()).toLowerCase());

                    String fromModelServiceId = interaction.getFromModelServiceId() != null ? interaction.getFromModelServiceId() : (parentSpan != null ? parentSpan.getModelServiceId() : null);
                    String toModelServiceId = interaction.getToModelServiceId() != null ? interaction.getToModelServiceId() : (childSpan != null ? childSpan.getModelServiceId() : null);
                    String fromService = interaction.getFromService() != null ? interaction.getFromService() : (parentSpan != null ? parentSpan.getRuntimeService() : null);
                    String toService = interaction.getToService() != null ? interaction.getToService() : (childSpan != null ? childSpan.getRuntimeService() : null);

                    ModelElement caller = resolveElement(fromModelServiceId, fromService, oldToNewElementMap, serviceNameToElementMap);
                    ModelElement callee = resolveElement(toModelServiceId, toService, oldToNewElementMap, serviceNameToElementMap);

                    if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                        long durationMs = childSpan != null ? parseDurationMs(childSpan.getDurationNanoseconds()) : 0L;
                        processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs, trace, outcome, relByPairKey, newRelationships, newEvidences);
                        if (parentSpan != null && childSpan != null) {
                            sequenceSteps.add(new CausalStepRecord(stepOrder++, parentSpan, childSpan, durationMs));
                        }
                    }
                }
            }
        } else if (!causalEdges.isEmpty()) {
            for (RunnerCausalEdgeDTO edge : causalEdges) {
                String edgeKey = edge.getParentSpanId() + "->" + edge.getChildSpanId();
                if (processedEdgeKeys.add(edgeKey)) {
                    RunnerCorrelatedSpanDTO parentSpan = spanMap.get((edge.getTraceId() + ":" + edge.getParentSpanId()).toLowerCase());
                    RunnerCorrelatedSpanDTO childSpan = spanMap.get((edge.getTraceId() + ":" + edge.getChildSpanId()).toLowerCase());

                    if (parentSpan != null && childSpan != null) {
                        ModelElement caller = resolveElement(parentSpan.getModelServiceId(), parentSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);
                        ModelElement callee = resolveElement(childSpan.getModelServiceId(), childSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);

                        if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                            long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());
                            processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs, trace, outcome, relByPairKey, newRelationships, newEvidences);
                            sequenceSteps.add(new CausalStepRecord(stepOrder++, parentSpan, childSpan, durationMs));
                        }
                    }
                }
            }
        } else {
            // Fallback sang spans có parentSpanId
            for (RunnerCorrelatedSpanDTO childSpan : spans) {
                if (childSpan.getParentSpanId() != null && !childSpan.getParentSpanId().isBlank()) {
                    String edgeKey = childSpan.getParentSpanId() + "->" + childSpan.getSpanId();
                    if (processedEdgeKeys.add(edgeKey)) {
                        RunnerCorrelatedSpanDTO parentSpan = spanMap.get((childSpan.getTraceId() + ":" + childSpan.getParentSpanId()).toLowerCase());
                        if (parentSpan != null) {
                            ModelElement caller = resolveElement(parentSpan.getModelServiceId(), parentSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);
                            ModelElement callee = resolveElement(childSpan.getModelServiceId(), childSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);

                            if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                                long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());
                                processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs, trace, outcome, relByPairKey, newRelationships, newEvidences);
                                sequenceSteps.add(new CausalStepRecord(stepOrder++, parentSpan, childSpan, durationMs));
                            }
                        }
                    }
                }
            }
        }

        modelRelationshipRepository.saveAll(newRelationships);
        evidenceRepository.saveAll(newEvidences);

        // (4.5) Sinh UML Sequence Diagram
        ObjectNode sequenceLayout = objectMapper.createObjectNode();
        sequenceLayout.put("notation", "UML_SEQUENCE");
        sequenceLayout.put("level", "RUNTIME_PROCESS");
        sequenceLayout.put("totalSteps", sequenceSteps.size());

        ArrayNode stepsArray = sequenceLayout.putArray("steps");
        for (CausalStepRecord step : sequenceSteps) {
            ObjectNode stepNode = objectMapper.createObjectNode();
            stepNode.put("stepOrder", step.order);
            stepNode.put("callerService", step.parentSpan.getRuntimeService());
            stepNode.put("calleeService", step.childSpan.getRuntimeService());
            stepNode.put("operation", "Call " + step.childSpan.getRuntimeService());
            stepNode.put("httpStatusCode", step.childSpan.getHttpStatusCode());
            stepNode.put("durationMs", step.durationMs);
            stepNode.put("traceId", step.childSpan.getTraceId());
            stepNode.put("spanId", step.childSpan.getSpanId());
            stepNode.put("parentSpanId", step.childSpan.getParentSpanId());
            stepsArray.add(stepNode);
        }

        DiagramVersion sequenceDiagram = DiagramVersion.builder()
                .modelVersion(enrichedVersion)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .layoutJson(sequenceLayout)
                .build();
        diagramVersionRepository.save(sequenceDiagram);

        ReceiptIngestAckDTO ack = ReceiptIngestAckDTO.builder()
                .sessionId(sessionId)
                .resourceProject(session.getResourceProject())
                .receiptDigest(incomingDigest)
                .persistenceStatus("COMMITTED")
                .publicationGateStatus(session.getPublicationGateStatus())
                .promotedLatest(canPromoteLatest)
                .baseModelVersionId(baseVersion.getId())
                .enrichedModelVersionId(enrichedVersion.getId())
                .enrichedRevision(newRevision)
                .acknowledgedAt(OffsetDateTime.now())
                .build();

        log.info("Xử lý RunnerReceipt hoàn tất cho sessionId: {}, revision mới: {}, gate: {}",
                sessionId, newRevision, session.getPublicationGateStatus());

        return new IngestResult(enrichedVersion, ack);
    }

    private ModelElement resolveElement(String modelServiceId, String serviceName,
                                        Map<UUID, ModelElement> oldToNewElementMap,
                                        Map<String, ModelElement> serviceNameToElementMap) {
        if (modelServiceId != null && !modelServiceId.isBlank()) {
            try {
                UUID elId = UUID.fromString(modelServiceId);
                ModelElement el = oldToNewElementMap.get(elId);
                if (el != null) return el;
            } catch (IllegalArgumentException ignored) {}
        }
        if (serviceName != null && !serviceName.isBlank()) {
            return serviceNameToElementMap.get(serviceName.toLowerCase());
        }
        return null;
    }

    private void processInteraction(ModelVersion enrichedVersion,
                                    RuntimeSession session,
                                    ModelElement caller,
                                    ModelElement callee,
                                    RunnerCorrelatedSpanDTO childSpan,
                                    long durationMs,
                                    RunnerTraceCorrelationDTO trace,
                                    RunnerOutcomeDTO outcome,
                                    Map<String, ModelRelationship> relByPairKey,
                                    List<ModelRelationship> newRelationships,
                                    List<Evidence> newEvidences) {

        String pairKeyUuid = (caller.getId().toString() + "->" + callee.getId().toString()).toLowerCase();
        String pairKeyName = (caller.getName() + "->" + callee.getName()).toLowerCase();

        ModelRelationship matchedRel = relByPairKey.get(pairKeyUuid);
        if (matchedRel == null) {
            matchedRel = relByPairKey.get(pairKeyName);
        }

        ObjectNode provenance = objectMapper.createObjectNode();
        if (trace != null && trace.getWarnings() != null) {
            ArrayNode warnArr = provenance.putArray("warnings");
            trace.getWarnings().forEach(warnArr::add);
        }
        if (outcome != null && outcome.getDiagnostics() != null) {
            ArrayNode diagArr = provenance.putArray("diagnostics");
            outcome.getDiagnostics().forEach(diagArr::add);
        }
        if (childSpan != null && childSpan.getScenarioStepId() != null) {
            provenance.put("scenarioStepId", childSpan.getScenarioStepId());
        }

        String locator = childSpan != null ? (childSpan.getTraceId() + ":" + childSpan.getSpanId()) : "unknown";
        String excerpt = caller.getName() + " -> " + callee.getName() + " (" + durationMs + "ms)";

        if (matchedRel != null) {
            matchedRel.setOriginLayer("STATIC_AND_RUNTIME");

            Evidence ev = Evidence.builder()
                    .modelVersion(enrichedVersion)
                    .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                    .runtimeSession(session)
                    .relationship(matchedRel)
                    .sourceType("RUNTIME_TRACE")
                    .adapterVersion("MAVIS_RUNNER_1.0")
                    .locator(locator)
                    .excerpt(excerpt)
                    .provenance(provenance)
                    .build();
            newEvidences.add(ev);
        } else {
            ModelRelationship newRel = ModelRelationship.builder()
                    .modelVersion(enrichedVersion)
                    .sourceElement(caller)
                    .targetElement(callee)
                    .relationType("RUNTIME_OBSERVED")
                    .originLayer("RUNTIME")
                    .direction("DIRECTED")
                    .build();

            newRelationships.add(newRel);
            relByPairKey.put(pairKeyUuid, newRel);
            relByPairKey.put(pairKeyName, newRel);

            Evidence ev = Evidence.builder()
                    .modelVersion(enrichedVersion)
                    .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                    .runtimeSession(session)
                    .relationship(newRel)
                    .sourceType("RUNTIME_TRACE")
                    .adapterVersion("MAVIS_RUNNER_1.0")
                    .locator(locator)
                    .excerpt(excerpt)
                    .provenance(provenance)
                    .build();
            newEvidences.add(ev);
        }
    }

    private static long parseDurationMs(String durationNanoseconds) {
        if (durationNanoseconds == null || durationNanoseconds.isBlank()) {
            return 0L;
        }
        try {
            return Long.parseUnsignedLong(durationNanoseconds) / 1_000_000L;
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO importReceiptFromStateRoot(UUID sessionId, String resourceProject) {
        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        runnerServiceAuthGuard.checkRunnerOrProjectWriteAccess(session.getProject());

        String resProj = resourceProject != null && !resourceProject.isBlank()
                ? resourceProject
                : session.getResourceProject();

        if (resProj == null || resProj.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Missing resourceProject for outbox import");
        }

        if (!RESOURCE_PROJECT_PATTERN.matcher(resProj).matches()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Invalid resourceProject format: " + resProj);
        }

        if (runnerStateRoot == null || runnerStateRoot.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "mavis.runner.state-root is not configured");
        }

        Path stateRootPath = Path.of(runnerStateRoot).toAbsolutePath().normalize();
        Path receiptsDir = stateRootPath.resolve("receipts").normalize();

        try {
            for (Path current = receiptsDir; current != null; current = current.getParent()) {
                if (Files.exists(current) && Files.isSymbolicLink(current)) {
                    throw new BusinessException(ErrorCode.BAD_REQUEST, "Linked receipt directories are not supported");
                }
            }

            Path targetFile = receiptsDir.resolve(resProj + ".json").normalize();
            if (!targetFile.startsWith(receiptsDir)) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Invalid receipt file path traversal");
            }

            if (!Files.exists(targetFile)) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "Receipt file not found: " + resProj + ".json");
            }

            String content = Files.readString(targetFile, StandardCharsets.UTF_8);
            RunnerReceiptIngestRequestDTO receipt = objectMapper.readValue(content, RunnerReceiptIngestRequestDTO.class);

            ingestRunnerReceipt(sessionId, receipt);

            RuntimeSession updated = runtimeSessionRepository.findById(sessionId).orElseThrow();
            return RuntimeSessionResponseDTO.fromEntity(updated);
        } catch (BusinessException be) {
            throw be;
        } catch (Exception e) {
            log.error("Lỗi khi đọc receipt outbox từ {}: {}", receiptsDir, e.getMessage(), e);
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Failed to read receipt outbox: " + e.getMessage());
        }
    }

    private record CausalStepRecord(int order, RunnerCorrelatedSpanDTO parentSpan, RunnerCorrelatedSpanDTO childSpan, long durationMs) {}

    private record IngestResult(ModelVersion enrichedVersion, ReceiptIngestAckDTO ack) {}
}
