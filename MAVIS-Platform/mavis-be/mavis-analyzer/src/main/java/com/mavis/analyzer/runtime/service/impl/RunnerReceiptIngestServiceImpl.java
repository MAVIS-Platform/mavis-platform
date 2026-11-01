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
import com.mavis.analyzer.runtime.validator.ComposePreflightValidator;
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

    @Value("${mavis.runner.allow-unverified-poc-promotion:false}")
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
        runnerServiceAuthGuard.requireRunnerService();
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
        Map<String, JsonNode> externalRootStepByTraceParent = new LinkedHashMap<>();
        if (outcome.getScenario() != null && outcome.getScenario().has("steps") && outcome.getScenario().get("steps").isArray()) {
            for (JsonNode stepNode : outcome.getScenario().get("steps")) {
                if (stepNode.hasNonNull("parentSpanId")) {
                    String pSpanId = stepNode.get("parentSpanId").asText().toLowerCase(Locale.ROOT);
                    externalRootSpanIds.add(pSpanId);
                    if (stepNode.hasNonNull("traceId")) {
                        String traceParentKey = (stepNode.get("traceId").asText() + ":" + pSpanId).toLowerCase(Locale.ROOT);
                        externalRootSpanIds.add(traceParentKey);
                        externalRootStepByTraceParent.put(traceParentKey, stepNode);
                    }
                }
                if (stepNode.hasNonNull("spanId")) {
                    String sSpanId = stepNode.get("spanId").asText().toLowerCase(Locale.ROOT);
                    // External parent identity is scoped to its trace, never spanId alone.
                    if (stepNode.hasNonNull("traceId")) {
                        externalRootSpanIds.add((stepNode.get("traceId").asText() + ":" + sSpanId).toLowerCase(Locale.ROOT));
                    }
                }
            }
        }

        List<ModelElement> baseElements = Collections.emptyList();
        BaseElementResolutionIndex baseIndex = BaseElementResolutionIndex.empty();
        int resolvedSpanCount = 0;
        if (!spans.isEmpty()) {
            List<ModelElement> loaded = modelElementRepository.findByModelVersionId(session.getModelVersion().getId());
            baseElements = loaded != null ? loaded : Collections.emptyList();
            baseIndex = BaseElementResolutionIndex.from(baseElements, session.getConfirmedServiceMappings());
            for (RunnerCorrelatedSpanDTO s : spans) {
                if (!baseElements.isEmpty()) {
                    if (baseIndex.resolve(s.getModelServiceId(), s.getRuntimeService()) != null) {
                        resolvedSpanCount++;
                    }
                } else if (s.getModelServiceId() != null && !s.getModelServiceId().isBlank()) {
                    resolvedSpanCount++;
                }
            }
        }
        boolean allSpansResolved = !spans.isEmpty() && resolvedSpanCount == spans.size();
        boolean anySpanResolved = resolvedSpanCount > 0;
        if (allSpansResolved && ("Partial".equalsIgnoreCase(outcome.getMappingStatus())
                || "Unmapped".equalsIgnoreCase(outcome.getMappingStatus()))) {
            session.setMappingStatus("MAPPED");
        }

        // [CHẶNG 12]: hasStructuralTraceWarning
        List<String> warnings = (trace != null && trace.getWarnings() != null) ? trace.getWarnings() : Collections.emptyList();
        boolean hasStructuralTraceWarning = warnings.stream().anyMatch(w ->
                !"MISSING_PARENT_SPAN".equalsIgnoreCase(w)
                && !"ATTRIBUTES_EVENTS_AND_SPAN_NAMES_OMITTED_FOR_REDACTION".equalsIgnoreCase(w)
                && !(allSpansResolved && "UNMAPPED_SERVICE".equalsIgnoreCase(w)));

        // Build spanMap với khóa (traceId + ":" + spanId).toLowerCase()
        Map<String, RunnerCorrelatedSpanDTO> spanMap = new HashMap<>();
        for (RunnerCorrelatedSpanDTO s : spans) {
            if (s.getSpanId() != null && s.getTraceId() != null) {
                spanMap.put((s.getTraceId() + ":" + s.getSpanId()).toLowerCase(Locale.ROOT), s);
            }
        }

        // [CHẶNG 12]: hasBrokenInternalParent
        boolean hasBrokenInternalParent = false;
        for (RunnerCorrelatedSpanDTO span : spans) {
            if (span.getParentSpanId() != null && !span.getParentSpanId().isBlank()) {
                String parentKey = (span.getTraceId() + ":" + span.getParentSpanId()).toLowerCase(Locale.ROOT);
                if (!spanMap.containsKey(parentKey) && !externalRootSpanIds.contains(parentKey)) {
                    hasBrokenInternalParent = true;
                    break;
                }
            }
        }

        // [CHẶNG 12]: Tính traceStatus theo ranh giới Capture Boundary
        if (!"Available".equalsIgnoreCase(outcome.getEvidenceStatus()) || spans.isEmpty()) {
            session.setTraceStatus("NONE");
        } else if (!anySpanResolved || ("Unmapped".equalsIgnoreCase(outcome.getMappingStatus()) && !allSpansResolved)) {
            session.setTraceStatus("UNMAPPED");
        } else if (!allSpansResolved || ("Partial".equalsIgnoreCase(outcome.getMappingStatus()) && !allSpansResolved)
                || hasBrokenInternalParent || hasStructuralTraceWarning) {
            session.setTraceStatus("PARTIAL");
        } else {
            session.setTraceStatus("COMPLETE");
        }

        session.setRunnerReceiptJson(SecretRedactor.redactJson(objectMapper.valueToTree(receipt)));
        session.setCompletedAt(OffsetDateTime.now());

        // [CHẶNG 11 & 12]: Đánh giá điều kiện Publication Gate
        boolean correspondenceOk = "Verified".equalsIgnoreCase(receipt.getImageSourceCorrespondence());
        boolean effectivelyMapped = "Mapped".equalsIgnoreCase(outcome.getMappingStatus()) || allSpansResolved;
        boolean canPromoteLatest = "Completed".equalsIgnoreCase(outcome.getExecutionStatus())
                && "Passed".equalsIgnoreCase(outcome.getScenarioStatus())
                && "Available".equalsIgnoreCase(outcome.getEvidenceStatus())
                && "Confirmed".equalsIgnoreCase(outcome.getCleanupStatus())
                && Boolean.TRUE.equals(receipt.getSandboxEnforcementConfirmed())
                && effectivelyMapped
                && !hasStructuralTraceWarning
                && correspondenceOk
                && modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(session.getProject().getId())
                    .map(latest -> latest.getId().equals(session.getModelVersion().getId())).orElse(false);

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
                .baseModelVersion(baseVersion)
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
        Map<UUID, ModelElement> oldToNewElementMap = new HashMap<>();
        Map<String, ModelElement> serviceNameToElementMap = new HashMap<>();
        Map<String, UUID> runtimeAliasToBaseIdMap = new HashMap<>();
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
                serviceNameToElementMap.put(baseEl.getName().toLowerCase(Locale.ROOT), copy);
            }
        }

        // UNCERTAIN_MAPPING cho runtimeService chưa có trong static model
        for (RunnerCorrelatedSpanDTO span : spans) {
            String serviceName = span.getRuntimeService();
            String modelServiceId = span.getModelServiceId();

            ModelElement resolvedBase = baseIndex.resolve(modelServiceId, serviceName);
            boolean matched = resolvedBase != null && oldToNewElementMap.containsKey(resolvedBase.getId());
            if (matched && serviceName != null && !serviceName.isBlank()) {
                String aliasKey = serviceName.toLowerCase(Locale.ROOT);
                serviceNameToElementMap.put(aliasKey, oldToNewElementMap.get(resolvedBase.getId()));
                runtimeAliasToBaseIdMap.put(aliasKey, resolvedBase.getId());
            }

            if (!matched && serviceName != null && !serviceName.isBlank()) {
                if (serviceNameToElementMap.containsKey(serviceName.toLowerCase(Locale.ROOT))) {
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
                serviceNameToElementMap.put(serviceName.toLowerCase(Locale.ROOT), uncertainEl);
            }
        }

        List<ModelElement> savedElements = modelElementRepository.saveAll(newElements);
        for (int i = 0; i < newElements.size(); i++) {
            ModelElement el = newElements.get(i);
            ModelElement saved = savedElements.get(i);
            if (el.getName() != null) {
                serviceNameToElementMap.put(el.getName().toLowerCase(Locale.ROOT), saved);
            }
        }
        for (int i = 0; i < baseElements.size(); i++) {
            oldToNewElementMap.put(baseElements.get(i).getId(), savedElements.get(i));
        }
        for (Map.Entry<String, UUID> aliasEntry : runtimeAliasToBaseIdMap.entrySet()) {
            ModelElement savedTarget = oldToNewElementMap.get(aliasEntry.getValue());
            if (savedTarget != null) {
                serviceNameToElementMap.put(aliasEntry.getKey(), savedTarget);
            }
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
                String pairKey = (newSrc.getId().toString() + "->" + newTgt.getId().toString()).toLowerCase(Locale.ROOT);
                relByPairKey.put(pairKey, copyRel);
                // Khóa phụ bằng tên
                relByPairKey.put((newSrc.getName() + "->" + newTgt.getName()).toLowerCase(Locale.ROOT), copyRel);

                ModelElement srcContainer = resolveContainer(newSrc);
                ModelElement tgtContainer = resolveContainer(newTgt);
                if (srcContainer != null && tgtContainer != null) {
                    relByPairKey.put((srcContainer.getId().toString() + "->" + tgtContainer.getId().toString()).toLowerCase(Locale.ROOT), copyRel);
                    relByPairKey.put((srcContainer.getName() + "->" + tgtContainer.getName()).toLowerCase(Locale.ROOT), copyRel);
                }
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
        IdentityHashMap<ModelElement, UUID> newToBaseElementIdMap = new IdentityHashMap<>();
        for (Map.Entry<UUID, ModelElement> e : oldToNewElementMap.entrySet()) {
            if (e.getKey() != null && e.getValue() != null) {
                newToBaseElementIdMap.put(e.getValue(), e.getKey());
            }
        }
        IdentityHashMap<ModelRelationship, UUID> newToBaseRelIdMap = new IdentityHashMap<>();
        for (Map.Entry<UUID, ModelRelationship> e : oldToNewRelMap.entrySet()) {
            if (e.getKey() != null && e.getValue() != null) {
                newToBaseRelIdMap.put(e.getValue(), e.getKey());
            }
        }

        List<CausalStepRecord> sequenceSteps = new ArrayList<>();
        Map<String, String> childSpanKeyToMessageId = new LinkedHashMap<>();
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
                    RunnerCorrelatedSpanDTO parentSpan = spanMap.get((interaction.getTraceId() + ":" + interaction.getParentSpanId()).toLowerCase(Locale.ROOT));
                    RunnerCorrelatedSpanDTO childSpan = spanMap.get((interaction.getTraceId() + ":" + interaction.getChildSpanId()).toLowerCase(Locale.ROOT));

                    String fromModelServiceId = interaction.getFromModelServiceId() != null ? interaction.getFromModelServiceId() : (parentSpan != null ? parentSpan.getModelServiceId() : null);
                    String toModelServiceId = interaction.getToModelServiceId() != null ? interaction.getToModelServiceId() : (childSpan != null ? childSpan.getModelServiceId() : null);
                    String fromService = interaction.getFromService() != null ? interaction.getFromService() : (parentSpan != null ? parentSpan.getRuntimeService() : null);
                    String toService = interaction.getToService() != null ? interaction.getToService() : (childSpan != null ? childSpan.getRuntimeService() : null);

                    ModelElement caller = resolveElement(fromModelServiceId, fromService, oldToNewElementMap, serviceNameToElementMap);
                    ModelElement callee = resolveElement(toModelServiceId, toService, oldToNewElementMap, serviceNameToElementMap);

                    if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                        Long durationMs = childSpan != null ? parseDurationMs(childSpan.getDurationNanoseconds()) : null;
                        InteractionPersistenceResult persisted = processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs != null ? durationMs : 0L, trace, outcome, relByPairKey, newRelationships, newEvidences);
                        if (parentSpan != null && childSpan != null) {
                            int ord = stepOrder++;
                            String msgId = "msg-obs-" + ord;
                            List<String> causalParents = resolveReceiptCausalParents(parentSpan, spanMap, childSpanKeyToMessageId);
                            sequenceSteps.add(new CausalStepRecord(ord, msgId, parentSpan, childSpan, durationMs, caller, callee, persisted.relationship, persisted.evidence, causalParents));
                            childSpanKeyToMessageId.put((childSpan.getTraceId() + ":" + childSpan.getSpanId()).toLowerCase(Locale.ROOT), msgId);
                        }
                    }
                }
            }
        } else if (!causalEdges.isEmpty()) {
            for (RunnerCausalEdgeDTO edge : causalEdges) {
                String edgeKey = edge.getParentSpanId() + "->" + edge.getChildSpanId();
                if (processedEdgeKeys.add(edgeKey)) {
                    RunnerCorrelatedSpanDTO parentSpan = spanMap.get((edge.getTraceId() + ":" + edge.getParentSpanId()).toLowerCase(Locale.ROOT));
                    RunnerCorrelatedSpanDTO childSpan = spanMap.get((edge.getTraceId() + ":" + edge.getChildSpanId()).toLowerCase(Locale.ROOT));

                    if (parentSpan != null && childSpan != null) {
                        ModelElement caller = resolveElement(parentSpan.getModelServiceId(), parentSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);
                        ModelElement callee = resolveElement(childSpan.getModelServiceId(), childSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);

                        if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                            Long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());
                            InteractionPersistenceResult persisted = processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs != null ? durationMs : 0L, trace, outcome, relByPairKey, newRelationships, newEvidences);
                            int ord = stepOrder++;
                            String msgId = "msg-obs-" + ord;
                            List<String> causalParents = resolveReceiptCausalParents(parentSpan, spanMap, childSpanKeyToMessageId);
                            sequenceSteps.add(new CausalStepRecord(ord, msgId, parentSpan, childSpan, durationMs, caller, callee, persisted.relationship, persisted.evidence, causalParents));
                            childSpanKeyToMessageId.put((childSpan.getTraceId() + ":" + childSpan.getSpanId()).toLowerCase(Locale.ROOT), msgId);
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
                        RunnerCorrelatedSpanDTO parentSpan = spanMap.get((childSpan.getTraceId() + ":" + childSpan.getParentSpanId()).toLowerCase(Locale.ROOT));
                        if (parentSpan != null) {
                            ModelElement caller = resolveElement(parentSpan.getModelServiceId(), parentSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);
                            ModelElement callee = resolveElement(childSpan.getModelServiceId(), childSpan.getRuntimeService(), oldToNewElementMap, serviceNameToElementMap);

                            if (caller != null && callee != null && !caller.getId().equals(callee.getId())) {
                                Long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());
                                InteractionPersistenceResult persisted = processInteraction(enrichedVersion, session, caller, callee, childSpan, durationMs != null ? durationMs : 0L, trace, outcome, relByPairKey, newRelationships, newEvidences);
                                int ord = stepOrder++;
                                String msgId = "msg-obs-" + ord;
                                List<String> causalParents = resolveReceiptCausalParents(parentSpan, spanMap, childSpanKeyToMessageId);
                                sequenceSteps.add(new CausalStepRecord(ord, msgId, parentSpan, childSpan, durationMs, caller, callee, persisted.relationship, persisted.evidence, causalParents));
                                childSpanKeyToMessageId.put((childSpan.getTraceId() + ":" + childSpan.getSpanId()).toLowerCase(Locale.ROOT), msgId);
                            }
                        }
                    }
                }
            }
        }

        // Single-service / entry-only W3C traceparent projection: causally proven external root hop from scenario-runner
        if (sequenceSteps.isEmpty() && !spans.isEmpty() && !externalRootStepByTraceParent.isEmpty()) {
            Set<String> emittedEntryKeys = new HashSet<>();
            for (RunnerCorrelatedSpanDTO entrySpan : spans) {
                if (entrySpan.getTraceId() == null || entrySpan.getSpanId() == null
                        || entrySpan.getParentSpanId() == null || entrySpan.getParentSpanId().isBlank()) {
                    continue;
                }
                String extParentKey = (entrySpan.getTraceId() + ":" + entrySpan.getParentSpanId()).toLowerCase(Locale.ROOT);
                JsonNode outcomeStep = externalRootStepByTraceParent.get(extParentKey);
                if (outcomeStep == null) {
                    continue;
                }
                ModelElement callee = resolveElement(entrySpan.getModelServiceId(), entrySpan.getRuntimeService(),
                        oldToNewElementMap, serviceNameToElementMap);
                if (callee == null) {
                    continue;
                }
                String dedupKey = extParentKey + "->" + (callee.getId() != null ? callee.getId() : callee.getName());
                if (!emittedEntryKeys.add(dedupKey)) {
                    continue;
                }
                Long durationMs = parseDurationMs(entrySpan.getDurationNanoseconds());
                if (durationMs == null && outcomeStep.hasNonNull("elapsedMilliseconds") && outcomeStep.get("elapsedMilliseconds").isNumber()) {
                    durationMs = outcomeStep.get("elapsedMilliseconds").asLong();
                }
                Evidence entryEvidence = buildExternalEntryEvidence(enrichedVersion, session, callee, entrySpan,
                        durationMs != null ? durationMs : 0L, trace, outcome);
                newEvidences.add(entryEvidence);

                RunnerCorrelatedSpanDTO externalCallerSpan = RunnerCorrelatedSpanDTO.builder()
                        .traceId(entrySpan.getTraceId())
                        .spanId(entrySpan.getParentSpanId())
                        .runtimeService("scenario-runner")
                        .build();
                int ord = stepOrder++;
                String msgId = "msg-obs-" + ord;
                sequenceSteps.add(new CausalStepRecord(ord, msgId, externalCallerSpan, entrySpan, durationMs,
                        null, callee, null, entryEvidence, Collections.emptyList()));
                childSpanKeyToMessageId.put((entrySpan.getTraceId() + ":" + entrySpan.getSpanId()).toLowerCase(Locale.ROOT), msgId);
            }
        }

        modelRelationshipRepository.saveAll(newRelationships);
        evidenceRepository.saveAll(newEvidences);

        Map<String, JsonNode> pinnedStepById = extractPinnedStepsById(session.getScenarioConfig());

        // (4.5) Sinh UML Sequence Diagram
        ObjectNode sequenceLayout = objectMapper.createObjectNode();
        sequenceLayout.put("notation", "UML_SEQUENCE");
        sequenceLayout.put("level", "RUNTIME_PROCESS");
        sequenceLayout.put("schemaVersion", 2);
        sequenceLayout.put("baseModelVersionId", baseVersion.getId() != null ? baseVersion.getId().toString() : null);
        sequenceLayout.put("enrichedModelVersionId", enrichedVersion.getId() != null ? enrichedVersion.getId().toString() : null);
        sequenceLayout.put("traceStatus", session.getTraceStatus());
        sequenceLayout.put("totalSteps", sequenceSteps.size());

        ArrayNode limitationsNode = sequenceLayout.putArray("limitations");
        limitationsNode.add("NO_SYNTHETIC_REPLY_FROM_END_TIME");
        limitationsNode.add("NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE");
        if (!"COMPLETE".equalsIgnoreCase(session.getTraceStatus())) {
            limitationsNode.add("PARTIAL_OR_AMBIGUOUS_PARTICIPANT_MAPPING");
        }

        ArrayNode stepsArray = sequenceLayout.putArray("steps");
        for (CausalStepRecord step : sequenceSteps) {
            ObjectNode stepNode = objectMapper.createObjectNode();
            UUID callerBaseId = step.caller != null ? newToBaseElementIdMap.get(step.caller) : null;
            UUID calleeBaseId = step.callee != null ? newToBaseElementIdMap.get(step.callee) : null;
            UUID callerElId = step.caller != null ? (step.caller.getId() != null ? step.caller.getId() : callerBaseId) : null;
            UUID calleeElId = step.callee != null ? (step.callee.getId() != null ? step.callee.getId() : calleeBaseId) : null;
            String callerStatus = step.caller != null && "UNCERTAIN_MAPPING".equalsIgnoreCase(step.caller.getStatus())
                    ? "UNCERTAIN_MAPPING"
                    : (callerElId != null ? "RESOLVED" : "UNMAPPED");
            String calleeStatus = step.callee != null && "UNCERTAIN_MAPPING".equalsIgnoreCase(step.callee.getStatus())
                    ? "UNCERTAIN_MAPPING"
                    : (calleeElId != null ? "RESOLVED" : "UNMAPPED");
            String callerParticipantId = callerBaseId != null ? "part:" + callerBaseId : (callerElId != null ? "part:" + callerElId : "part:service:" + Objects.toString(step.parentSpan.getRuntimeService(), "unknown").toLowerCase(Locale.ROOT));
            String calleeParticipantId = calleeBaseId != null ? "part:" + calleeBaseId : (calleeElId != null ? "part:" + calleeElId : "part:service:" + Objects.toString(step.childSpan.getRuntimeService(), "unknown").toLowerCase(Locale.ROOT));
            UUID baseRelId = step.relationship != null ? newToBaseRelIdMap.get(step.relationship) : null;
            UUID relId = step.relationship != null ? (step.relationship.getId() != null ? step.relationship.getId() : baseRelId) : null;
            UUID evId = step.evidence != null ? step.evidence.getId() : null;

            String resolvedCallerName = step.caller != null && step.caller.getName() != null
                    ? step.caller.getName()
                    : step.parentSpan.getRuntimeService();
            String resolvedCalleeName = step.callee != null && step.callee.getName() != null
                    ? step.callee.getName()
                    : step.childSpan.getRuntimeService();
            stepNode.put("stepOrder", step.order);
            stepNode.put("messageId", step.messageId);
            stepNode.put("callerService", resolvedCallerName);
            stepNode.put("calleeService", resolvedCalleeName);
            stepNode.put("callerParticipantId", callerParticipantId);
            stepNode.put("calleeParticipantId", calleeParticipantId);
            if (callerElId != null) stepNode.put("callerElementId", callerElId.toString()); else stepNode.putNull("callerElementId");
            if (calleeElId != null) stepNode.put("calleeElementId", calleeElId.toString()); else stepNode.putNull("calleeElementId");
            if (callerBaseId != null) stepNode.put("callerBaseElementId", callerBaseId.toString()); else stepNode.putNull("callerBaseElementId");
            if (calleeBaseId != null) stepNode.put("calleeBaseElementId", calleeBaseId.toString()); else stepNode.putNull("calleeBaseElementId");
            stepNode.put("callerResolutionStatus", callerStatus);
            stepNode.put("calleeResolutionStatus", calleeStatus);

            JsonNode directEntryOutcomeStep = null;
            JsonNode directEntryPinnedStep = null;
            if (step.childSpan.getTraceId() != null && step.childSpan.getParentSpanId() != null) {
                String extKey = (step.childSpan.getTraceId() + ":" + step.childSpan.getParentSpanId()).toLowerCase(Locale.ROOT);
                directEntryOutcomeStep = externalRootStepByTraceParent.get(extKey);
                if (directEntryOutcomeStep != null) {
                    String stepId = directEntryOutcomeStep.hasNonNull("stepId")
                            ? directEntryOutcomeStep.get("stepId").asText()
                            : (directEntryOutcomeStep.hasNonNull("id") ? directEntryOutcomeStep.get("id").asText() : step.childSpan.getScenarioStepId());
                    if (stepId != null) {
                        directEntryPinnedStep = pinnedStepById.get(stepId);
                    }
                }
            }

            String rawRoute = step.childSpan.getRoute() != null ? step.childSpan.getRoute().trim() : "";
            if (rawRoute.isEmpty() && directEntryPinnedStep != null && directEntryPinnedStep.hasNonNull("path")) {
                String pinnedPath = SecretRedactor.redactString(directEntryPinnedStep.get("path").asText("").trim());
                if (pinnedPath != null) {
                    rawRoute = pinnedPath;
                }
            }
            String operation;
            if (rawRoute.startsWith("/")) {
                operation = rawRoute;
            } else if (!rawRoute.isBlank()) {
                String cleanSlug = rawRoute.replaceFirst("(?i)^fruit[-_]", "").replaceFirst("(?i)[-_]service$", "").toLowerCase(Locale.ROOT);
                operation = "/api/" + cleanSlug;
            } else {
                String cleanSlug = Objects.toString(step.childSpan.getRuntimeService(), "service")
                        .replaceFirst("(?i)^fruit[-_]", "")
                        .replaceFirst("(?i)[-_]service$", "")
                        .toLowerCase(Locale.ROOT);
                operation = "/api/" + cleanSlug;
            }
            stepNode.put("operation", operation);
            stepNode.put("messageSort", "UNKNOWN");
            String httpMethod = step.childSpan.getHttpMethod() != null && !step.childSpan.getHttpMethod().isBlank()
                    ? step.childSpan.getHttpMethod()
                    : (directEntryPinnedStep != null && directEntryPinnedStep.hasNonNull("method")
                            ? directEntryPinnedStep.get("method").asText("POST").trim().toUpperCase(Locale.ROOT)
                            : "POST");
            stepNode.put("httpMethod", httpMethod);
            Integer outcomeStatusCode = (directEntryOutcomeStep != null && directEntryOutcomeStep.hasNonNull("statusCode")
                    && directEntryOutcomeStep.get("statusCode").isInt())
                    ? directEntryOutcomeStep.get("statusCode").asInt()
                    : null;
            int httpStatusCode = (step.childSpan.getHttpStatusCode() != null && step.childSpan.getHttpStatusCode() >= 100)
                    ? step.childSpan.getHttpStatusCode()
                    : (outcomeStatusCode != null && outcomeStatusCode >= 100 && outcomeStatusCode <= 599 ? outcomeStatusCode : 200);
            stepNode.put("httpStatusCode", httpStatusCode);
            if (step.durationMs != null) {
                stepNode.put("durationMs", step.durationMs);
            } else {
                stepNode.putNull("durationMs");
            }
            stepNode.put("traceId", step.childSpan.getTraceId());
            stepNode.put("spanId", step.childSpan.getSpanId());
            stepNode.put("parentSpanId", step.childSpan.getParentSpanId());
            if (relId != null) stepNode.put("relationshipId", relId.toString()); else stepNode.putNull("relationshipId");
            if (baseRelId != null) stepNode.put("baseRelationshipId", baseRelId.toString()); else stepNode.putNull("baseRelationshipId");
            if (evId != null) stepNode.put("evidenceId", evId.toString()); else stepNode.putNull("evidenceId");
            stepNode.put("provenanceType", "OBSERVED");
            ArrayNode parentsArr = stepNode.putArray("causalParentMessageIds");
            for (String pId : step.causalParentMessageIds) {
                parentsArr.add(pId);
            }
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

    private Evidence buildExternalEntryEvidence(ModelVersion enrichedVersion,
                                                RuntimeSession session,
                                                ModelElement callee,
                                                RunnerCorrelatedSpanDTO entrySpan,
                                                long durationMs,
                                                RunnerTraceCorrelationDTO trace,
                                                RunnerOutcomeDTO outcome) {
        ObjectNode provenance = objectMapper.createObjectNode();
        provenance.put("entryBoundary", "SCENARIO_RUNNER_W3C_TRACEPARENT");
        if (trace != null && trace.getWarnings() != null) {
            ArrayNode warnArr = provenance.putArray("warnings");
            trace.getWarnings().forEach(warnArr::add);
        }
        if (outcome != null && outcome.getDiagnostics() != null) {
            ArrayNode diagArr = provenance.putArray("diagnostics");
            outcome.getDiagnostics().forEach(diagArr::add);
        }
        if (entrySpan != null && entrySpan.getScenarioStepId() != null) {
            provenance.put("scenarioStepId", entrySpan.getScenarioStepId());
        }
        String locator = entrySpan != null ? (entrySpan.getTraceId() + ":" + entrySpan.getSpanId()) : "unknown";
        String excerpt = "scenario-runner -> " + callee.getName() + " (" + durationMs + "ms)";
        return Evidence.builder()
                .modelVersion(enrichedVersion)
                .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                .runtimeSession(session)
                .element(callee)
                .sourceType("RUNTIME_TRACE")
                .adapterVersion("MAVIS_RUNNER_1.0")
                .locator(locator)
                .excerpt(excerpt)
                .provenance(provenance)
                .build();
    }

    private static Map<String, JsonNode> extractPinnedStepsById(JsonNode scenarioConfig) {
        Map<String, JsonNode> map = new LinkedHashMap<>();
        if (scenarioConfig == null || !scenarioConfig.isObject()) {
            return map;
        }
        JsonNode stepsNode = scenarioConfig.path("scenario").path("steps");
        if (!stepsNode.isArray()) {
            stepsNode = scenarioConfig.path("steps");
        }
        if (!stepsNode.isArray()) {
            return map;
        }
        int idx = 1;
        for (JsonNode item : stepsNode) {
            if (item != null && item.isObject()) {
                String id = item.hasNonNull("id") ? item.get("id").asText("").trim() : "";
                if (id.isEmpty()) {
                    id = "step-" + idx;
                }
                map.put(id, item);
            }
            idx++;
        }
        return map;
    }

    private static final class BaseElementResolutionIndex {
        private final Map<UUID, ModelElement> byId;
        private final Map<String, ModelElement> uniqueByLowerName;
        private final Map<String, ModelElement> uniqueContainerBySlug;
        private final Map<String, String> confirmedByLower;
        private final Map<String, String> uniqueConfirmedBySlug;

        private BaseElementResolutionIndex(Map<UUID, ModelElement> byId,
                                           Map<String, ModelElement> uniqueByLowerName,
                                           Map<String, ModelElement> uniqueContainerBySlug,
                                           Map<String, String> confirmedByLower,
                                           Map<String, String> uniqueConfirmedBySlug) {
            this.byId = byId;
            this.uniqueByLowerName = uniqueByLowerName;
            this.uniqueContainerBySlug = uniqueContainerBySlug;
            this.confirmedByLower = confirmedByLower;
            this.uniqueConfirmedBySlug = uniqueConfirmedBySlug;
        }

        static BaseElementResolutionIndex empty() {
            return new BaseElementResolutionIndex(
                    Collections.emptyMap(),
                    Collections.emptyMap(),
                    Collections.emptyMap(),
                    Collections.emptyMap(),
                    Collections.emptyMap());
        }

        static BaseElementResolutionIndex from(List<ModelElement> baseElements, Map<String, String> confirmedMappings) {
            Map<UUID, ModelElement> byId = new HashMap<>();
            Map<String, List<ModelElement>> byLower = new HashMap<>();
            Map<String, List<ModelElement>> containersBySlug = new HashMap<>();

            for (ModelElement el : baseElements) {
                if (el == null) continue;
                if (el.getId() != null) {
                    byId.put(el.getId(), el);
                }
                if (el.getName() != null && !el.getName().isBlank()) {
                    String lower = el.getName().trim().toLowerCase(Locale.ROOT);
                    byLower.computeIfAbsent(lower, k -> new ArrayList<>()).add(el);
                    if ("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())) {
                        String slug = normalizeServiceSlug(el.getName());
                        if (!slug.isBlank()) {
                            containersBySlug.computeIfAbsent(slug, k -> new ArrayList<>()).add(el);
                        }
                    }
                }
            }

            Map<String, ModelElement> uniqueByLower = new HashMap<>();
            for (Map.Entry<String, List<ModelElement>> entry : byLower.entrySet()) {
                List<ModelElement> list = entry.getValue();
                if (list.size() == 1) {
                    uniqueByLower.put(entry.getKey(), list.get(0));
                } else {
                    List<ModelElement> containers = list.stream()
                            .filter(e -> "SERVICE_CONTAINER".equalsIgnoreCase(e.getElementType()))
                            .toList();
                    if (containers.size() == 1) {
                        uniqueByLower.put(entry.getKey(), containers.get(0));
                    }
                }
            }

            Map<String, ModelElement> uniqueBySlug = new HashMap<>();
            for (Map.Entry<String, List<ModelElement>> entry : containersBySlug.entrySet()) {
                if (entry.getValue().size() == 1) {
                    uniqueBySlug.put(entry.getKey(), entry.getValue().get(0));
                }
            }

            Map<String, String> confirmedLower = new HashMap<>();
            Map<String, List<String>> confirmedSlugTargets = new HashMap<>();
            if (confirmedMappings != null) {
                for (Map.Entry<String, String> entry : confirmedMappings.entrySet()) {
                    if (entry.getKey() == null || entry.getValue() == null || entry.getValue().isBlank()) continue;
                    String keyLower = entry.getKey().trim().toLowerCase(Locale.ROOT);
                    String target = entry.getValue().trim();
                    confirmedLower.put(keyLower, target);
                    String slug = normalizeServiceSlug(entry.getKey());
                    if (!slug.isBlank()) {
                        confirmedSlugTargets.computeIfAbsent(slug, k -> new ArrayList<>()).add(target);
                    }
                }
            }

            Map<String, String> uniqueConfirmedSlug = new HashMap<>();
            for (Map.Entry<String, List<String>> entry : confirmedSlugTargets.entrySet()) {
                Set<String> distinct = new HashSet<>(entry.getValue());
                if (distinct.size() == 1) {
                    uniqueConfirmedSlug.put(entry.getKey(), distinct.iterator().next());
                }
            }

            return new BaseElementResolutionIndex(byId, uniqueByLower, uniqueBySlug, confirmedLower, uniqueConfirmedSlug);
        }

        ModelElement resolve(String modelServiceId, String runtimeService) {
            ModelElement byExplicitId = resolveTargetToken(modelServiceId);
            if (byExplicitId != null) {
                return byExplicitId;
            }
            if (runtimeService == null || runtimeService.isBlank()) {
                return null;
            }
            String lower = runtimeService.trim().toLowerCase(Locale.ROOT);
            String slug = normalizeServiceSlug(runtimeService);

            String mappedTarget = confirmedByLower.get(lower);
            if (mappedTarget == null && !slug.isBlank()) {
                mappedTarget = uniqueConfirmedBySlug.get(slug);
            }
            if (mappedTarget != null) {
                ModelElement fromConfirmed = resolveTargetToken(mappedTarget);
                if (fromConfirmed != null) {
                    return fromConfirmed;
                }
            }

            ModelElement direct = uniqueByLowerName.get(lower);
            if (direct != null) {
                return direct;
            }
            if (!slug.isBlank()) {
                return uniqueContainerBySlug.get(slug);
            }
            return null;
        }

        private ModelElement resolveTargetToken(String token) {
            if (token == null || token.isBlank()) {
                return null;
            }
            String trimmed = token.trim();
            try {
                ModelElement found = byId.get(UUID.fromString(trimmed));
                if (found != null) {
                    return found;
                }
            } catch (IllegalArgumentException ignored) {
            }
            ModelElement byName = uniqueByLowerName.get(trimmed.toLowerCase(Locale.ROOT));
            if (byName != null) {
                return byName;
            }
            String slug = normalizeServiceSlug(trimmed);
            return !slug.isBlank() ? uniqueContainerBySlug.get(slug) : null;
        }

        private static String normalizeServiceSlug(String raw) {
            String cleaned = ComposePreflightValidator.cleanServiceCandidate(raw);
            if (cleaned.isBlank()) {
                return "";
            }
            String lower = cleaned.toLowerCase(Locale.ROOT)
                    .replaceFirst("^fruit[-_]", "")
                    .replaceFirst("[-_]*(service|services|api|app|svc|server|backend|container)$", "")
                    .replaceAll("[^a-z0-9]", "");
            return lower.isEmpty() ? cleaned.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "") : lower;
        }
    }

    private static List<String> resolveReceiptCausalParents(RunnerCorrelatedSpanDTO callerSpan,
                                                            Map<String, RunnerCorrelatedSpanDTO> spanMap,
                                                            Map<String, String> childSpanKeyToMessageId) {
        List<String> result = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        RunnerCorrelatedSpanDTO curr = callerSpan;
        String callerService = callerSpan != null ? callerSpan.getRuntimeService() : null;
        while (curr != null && curr.getSpanId() != null && curr.getTraceId() != null) {
            String key = (curr.getTraceId() + ":" + curr.getSpanId()).toLowerCase(Locale.ROOT);
            if (!visited.add(key)) break;
            String msgId = childSpanKeyToMessageId.get(key);
            if (msgId != null && !result.contains(msgId)) {
                result.add(msgId);
                break;
            }
            if (curr.getParentSpanId() == null || curr.getParentSpanId().isBlank()) break;
            RunnerCorrelatedSpanDTO next = spanMap.get((curr.getTraceId() + ":" + curr.getParentSpanId()).toLowerCase(Locale.ROOT));
            if (next == null || callerService == null || next.getRuntimeService() == null
                    || !callerService.equalsIgnoreCase(next.getRuntimeService())) {
                break;
            }
            curr = next;
        }
        return result;
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
            return serviceNameToElementMap.get(serviceName.toLowerCase(Locale.ROOT));
        }
        return null;
    }

    private InteractionPersistenceResult processInteraction(ModelVersion enrichedVersion,
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

        String pairKeyUuid = (caller.getId().toString() + "->" + callee.getId().toString()).toLowerCase(Locale.ROOT);
        String pairKeyName = (caller.getName() + "->" + callee.getName()).toLowerCase(Locale.ROOT);

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
            return new InteractionPersistenceResult(matchedRel, ev);
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
            return new InteractionPersistenceResult(newRel, ev);
        }
    }

    private static Long parseDurationMs(String durationNanoseconds) {
        if (durationNanoseconds == null || durationNanoseconds.isBlank()) {
            return null;
        }
        try {
            return Long.parseUnsignedLong(durationNanoseconds) / 1_000_000L;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RuntimeSessionResponseDTO importReceiptFromStateRoot(UUID sessionId, String resourceProject) {
        RuntimeSession session = runtimeSessionRepository.findLockedById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        runnerServiceAuthGuard.requireRunnerService();

        String resProj = resourceProject != null && !resourceProject.isBlank()
                ? resourceProject
                : session.getResourceProject();

        if (resProj == null || resProj.isBlank()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Missing resourceProject for outbox import");
        }

        if (!RESOURCE_PROJECT_PATTERN.matcher(resProj).matches()) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Invalid resourceProject format: " + resProj);
        }

        String effectiveStateRoot = (runnerStateRoot == null || runnerStateRoot.isBlank())
                ? System.getProperty("java.io.tmpdir") + java.io.File.separator + "mavis-runner-state"
                : runnerStateRoot;

        Path stateRootPath = Path.of(effectiveStateRoot).toAbsolutePath().normalize();
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

    private record InteractionPersistenceResult(ModelRelationship relationship, Evidence evidence) {}

    private record CausalStepRecord(
            int order,
            String messageId,
            RunnerCorrelatedSpanDTO parentSpan,
            RunnerCorrelatedSpanDTO childSpan,
            Long durationMs,
            ModelElement caller,
            ModelElement callee,
            ModelRelationship relationship,
            Evidence evidence,
            List<String> causalParentMessageIds) {}

    private record IngestResult(ModelVersion enrichedVersion, ReceiptIngestAckDTO ack) {}

    private ModelElement resolveContainer(ModelElement element) {
        if (element == null) return null;
        Set<ModelElement> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (ModelElement cur = element; cur != null && visited.add(cur); cur = cur.getParentElement()) {
            if ("SERVICE_CONTAINER".equalsIgnoreCase(cur.getElementType())) {
                return cur;
            }
        }
        return element;
    }
}
