package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.*;
import com.mavis.analyzer.runtime.service.RunnerReceiptIngestService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
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
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final DiagramVersionRepository diagramVersionRepository;
    private final ObjectMapper objectMapper;

    @Value("${mavis.runner.state-root:}")
    private String runnerStateRoot;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelVersionResponseDTO ingestRunnerReceipt(UUID sessionId, RunnerReceiptIngestRequestDTO receipt) {
        log.info("Tiếp nhận RunnerReceipt cho sessionId: {}, resourceProject: {}", sessionId,
                receipt != null ? receipt.getResourceProject() : null);

        if (receipt == null) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt payload cannot be null");
        }

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        // =========================================================================
        // 1. XÁC THỰC SCOPE (WJ-02)
        // =========================================================================
        if (receipt.getSessionId() != null && !receipt.getSessionId().isBlank()
                && !sessionId.toString().equalsIgnoreCase(receipt.getSessionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: sessionId does not match");
        }

        if (receipt.getSourceSnapshotId() != null && !receipt.getSourceSnapshotId().isBlank()
                && !session.getSourceSnapshot().getId().toString().equalsIgnoreCase(receipt.getSourceSnapshotId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: sourceSnapshotId does not match");
        }

        if (session.getModelVersion() != null && receipt.getModelVersionId() != null && !receipt.getModelVersionId().isBlank()
                && !session.getModelVersion().getId().toString().equalsIgnoreCase(receipt.getModelVersionId())) {
            throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: modelVersionId does not match");
        }

        if (receipt.getResourceProject() != null && !receipt.getResourceProject().isBlank()) {
            if (!RESOURCE_PROJECT_PATTERN.matcher(receipt.getResourceProject()).matches()) {
                throw new BusinessException(ErrorCode.BAD_REQUEST, "Runner receipt scope mismatch: invalid resourceProject format");
            }
        }

        // =========================================================================
        // 2. TÍNH LŨY THỪA (IDEMPOTENCY - WJ-02)
        // =========================================================================
        if (session.getRunnerReceiptJson() != null) {
            boolean sameProject = receipt.getResourceProject() == null
                    || receipt.getResourceProject().equalsIgnoreCase(session.getResourceProject());
            if (sameProject) {
                log.info("Receipt đã được xử lý cho sessionId: {}. Trả về ModelVersion hiện có (Idempotent replay).", sessionId);
                Optional<ModelVersion> existingEnriched = modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId);
                if (existingEnriched.isPresent()) {
                    return ModelVersionResponseDTO.fromEntity(existingEnriched.get());
                }
            }
        }

        // =========================================================================
        // 3. ÁNH XẠ TRẠNG THÁI CHÍNH XÁC KHÔNG MẶC ĐỊNH PASSED (WJ-04)
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
        session.setTraceQuality(outcome.getTraceQuality() != null ? outcome.getTraceQuality().toUpperCase() : "UNAVAILABLE");
        session.setMappingStatus(outcome.getMappingStatus() != null ? outcome.getMappingStatus().toUpperCase() : "UNAVAILABLE");

        if (receipt.getSandboxEnforcementConfirmed() != null) {
            session.setSandboxEnforcementConfirmed(receipt.getSandboxEnforcementConfirmed());
        }
        if (receipt.getResourceProject() != null && !receipt.getResourceProject().isBlank()) {
            session.setResourceProject(receipt.getResourceProject());
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

        // Ánh xạ traceStatus
        if (!"Available".equalsIgnoreCase(outcome.getEvidenceStatus()) || spans.isEmpty()) {
            session.setTraceStatus("NONE");
        } else if ("Mapped".equalsIgnoreCase(outcome.getMappingStatus()) && "CompleteForCapturedData".equalsIgnoreCase(outcome.getTraceQuality())) {
            session.setTraceStatus("COMPLETE");
        } else if (spans.stream().anyMatch(s -> s.getModelServiceId() == null || s.getModelServiceId().isBlank())) {
            session.setTraceStatus("PARTIAL");
        } else {
            session.setTraceStatus("COMPLETE");
        }

        session.setRunnerReceiptJson(SecretRedactor.redactJson(objectMapper.valueToTree(receipt)));
        session.setCompletedAt(OffsetDateTime.now());
        runtimeSessionRepository.save(session);

        // =========================================================================
        // 4. CHUYỂN ĐỔI RunnerCorrelatedSpanDTO VÀ causalEdges SANG ModelVersion (WJ-04)
        // =========================================================================
        ModelVersion baseVersion = session.getModelVersion();
        if (baseVersion == null && receipt.getModelVersionId() != null && !receipt.getModelVersionId().isBlank()) {
            try {
                baseVersion = modelVersionRepository.findById(UUID.fromString(receipt.getModelVersionId())).orElse(null);
            } catch (Exception ignored) {}
        }
        if (baseVersion == null) {
            baseVersion = modelVersionRepository.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(session.getProject().getId())
                    .orElse(null);
        }

        if (baseVersion == null) {
            log.warn("Không tìm thấy base ModelVersion cho session {}. Bỏ qua làm giàu mô hình.", sessionId);
            return null;
        }

        Project project = baseVersion.getProject();
        int maxRevision = modelVersionRepository.findMaxRevisionByProjectId(project.getId());
        int newRevision = maxRevision + 1;

        ModelVersion enrichedVersion = ModelVersion.builder()
                .project(project)
                .sourceSnapshot(baseVersion.getSourceSnapshot())
                .runtimeSession(session)
                .revision(newRevision)
                .schemaVersion("1.0")
                .origin("RUNTIME_ENRICHED")
                .isLatestValid(true)
                .createdBy(baseVersion.getCreatedBy())
                .build();

        enrichedVersion = modelVersionRepository.save(enrichedVersion);
        modelVersionRepository.invalidatePreviousVersions(project.getId(), enrichedVersion.getId());

        // (4.1) Sao chép toàn bộ elements tĩnh từ baseVersion
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

        // Kiểm tra spans: nếu có runtimeService chưa có trong static model -> UNCERTAIN_MAPPING
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

        // (4.2) Kế thừa 100% quan hệ tĩnh (TUYỆT ĐỐI KHÔNG XÓA CẠNH TĨNH CHƯA ĐI QUA)
        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseVersion.getId());
        List<ModelRelationship> newRelationships = new ArrayList<>();
        Map<String, ModelRelationship> relByPairKey = new HashMap<>();

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
                String pairKey = (newSrc.getName() + "->" + newTgt.getName()).toLowerCase();
                relByPairKey.put(pairKey, copyRel);
            }
        }

        // (4.3) Xử lý các bước gọi nhân quả / tương tác từ Runner receipt
        Map<String, RunnerCorrelatedSpanDTO> spanMap = new HashMap<>();
        for (RunnerCorrelatedSpanDTO s : spans) {
            if (s.getSpanId() != null) {
                spanMap.put(s.getSpanId().toLowerCase(), s);
            }
        }

        List<Evidence> newEvidences = new ArrayList<>();
        List<CausalStepRecord> sequenceSteps = new ArrayList<>();
        int stepOrder = 1;

        // Ưu tiên tương tác từ causalEdges hoặc parentSpanId
        List<RunnerCausalEdgeDTO> causalEdges = (trace != null && trace.getCausalEdges() != null)
                ? trace.getCausalEdges()
                : Collections.emptyList();

        Set<String> processedEdgeKeys = new HashSet<>();

        if (!causalEdges.isEmpty()) {
            for (RunnerCausalEdgeDTO edge : causalEdges) {
                RunnerCorrelatedSpanDTO parentSpan = edge.getParentSpanId() != null ? spanMap.get(edge.getParentSpanId().toLowerCase()) : null;
                RunnerCorrelatedSpanDTO childSpan = edge.getChildSpanId() != null ? spanMap.get(edge.getChildSpanId().toLowerCase()) : null;

                if (parentSpan != null && childSpan != null
                        && parentSpan.getRuntimeService() != null && childSpan.getRuntimeService() != null
                        && !parentSpan.getRuntimeService().equalsIgnoreCase(childSpan.getRuntimeService())) {

                    String pairKey = (parentSpan.getRuntimeService() + "->" + childSpan.getRuntimeService()).toLowerCase();
                    long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());

                    processCausalInteraction(enrichedVersion, session, parentSpan.getRuntimeService(),
                            childSpan.getRuntimeService(), childSpan, durationMs, trace, outcome,
                            relByPairKey, serviceNameToElementMap, newRelationships, newEvidences);

                    sequenceSteps.add(new CausalStepRecord(stepOrder++, parentSpan, childSpan, durationMs));
                    processedEdgeKeys.add(edge.getParentSpanId() + "->" + edge.getChildSpanId());
                }
            }
        } else {
            // Fallback sang quan hệ parentSpanId -> spanId
            for (RunnerCorrelatedSpanDTO childSpan : spans) {
                if (childSpan.getParentSpanId() != null && !childSpan.getParentSpanId().isBlank()) {
                    RunnerCorrelatedSpanDTO parentSpan = spanMap.get(childSpan.getParentSpanId().toLowerCase());
                    if (parentSpan != null && parentSpan.getRuntimeService() != null && childSpan.getRuntimeService() != null
                            && !parentSpan.getRuntimeService().equalsIgnoreCase(childSpan.getRuntimeService())) {

                        String edgeKey = childSpan.getParentSpanId() + "->" + childSpan.getSpanId();
                        if (processedEdgeKeys.add(edgeKey)) {
                            long durationMs = parseDurationMs(childSpan.getDurationNanoseconds());

                            processCausalInteraction(enrichedVersion, session, parentSpan.getRuntimeService(),
                                    childSpan.getRuntimeService(), childSpan, durationMs, trace, outcome,
                                    relByPairKey, serviceNameToElementMap, newRelationships, newEvidences);

                            sequenceSteps.add(new CausalStepRecord(stepOrder++, parentSpan, childSpan, durationMs));
                        }
                    }
                }
            }
        }

        modelRelationshipRepository.saveAll(newRelationships);
        evidenceRepository.saveAll(newEvidences);

        // (4.4) Sinh bản vẽ DiagramVersion notation = "UML_SEQUENCE", level = "RUNTIME_PROCESS"
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

        log.info("Xử lý RunnerReceipt hoàn tất cho sessionId: {}, revision mới: {}", sessionId, newRevision);
        return ModelVersionResponseDTO.fromEntity(enrichedVersion);
    }

    private void processCausalInteraction(ModelVersion enrichedVersion,
                                          RuntimeSession session,
                                          String callerName,
                                          String calleeName,
                                          RunnerCorrelatedSpanDTO childSpan,
                                          long durationMs,
                                          RunnerTraceCorrelationDTO trace,
                                          RunnerOutcomeDTO outcome,
                                          Map<String, ModelRelationship> relByPairKey,
                                          Map<String, ModelElement> serviceNameToElementMap,
                                          List<ModelRelationship> newRelationships,
                                          List<Evidence> newEvidences) {

        String pairKey = (callerName + "->" + calleeName).toLowerCase();
        ModelRelationship matchedRel = relByPairKey.get(pairKey);

        ObjectNode provenance = objectMapper.createObjectNode();
        if (trace != null && trace.getWarnings() != null) {
            ArrayNode warnArr = provenance.putArray("warnings");
            trace.getWarnings().forEach(warnArr::add);
        }
        if (outcome != null && outcome.getDiagnostics() != null) {
            ArrayNode diagArr = provenance.putArray("diagnostics");
            outcome.getDiagnostics().forEach(diagArr::add);
        }
        if (childSpan.getScenarioStepId() != null) {
            provenance.put("scenarioStepId", childSpan.getScenarioStepId());
        }

        if (matchedRel != null) {
            matchedRel.setOriginLayer("STATIC_AND_RUNTIME");

            Evidence ev = Evidence.builder()
                    .modelVersion(enrichedVersion)
                    .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                    .runtimeSession(session)
                    .relationship(matchedRel)
                    .sourceType("RUNTIME_TRACE")
                    .adapterVersion("MAVIS_RUNNER_1.0")
                    .locator(childSpan.getTraceId() + ":" + childSpan.getSpanId())
                    .excerpt(callerName + " -> " + calleeName + " (" + durationMs + "ms)")
                    .provenance(provenance)
                    .build();
            newEvidences.add(ev);
        } else {
            ModelElement src = serviceNameToElementMap.get(callerName.toLowerCase());
            ModelElement tgt = serviceNameToElementMap.get(calleeName.toLowerCase());

            if (src != null && tgt != null) {
                ModelRelationship newRel = ModelRelationship.builder()
                        .modelVersion(enrichedVersion)
                        .sourceElement(src)
                        .targetElement(tgt)
                        .relationType("RUNTIME_OBSERVED")
                        .originLayer("RUNTIME")
                        .direction("DIRECTED")
                        .build();

                newRelationships.add(newRel);
                relByPairKey.put(pairKey, newRel);

                Evidence ev = Evidence.builder()
                        .modelVersion(enrichedVersion)
                        .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                        .runtimeSession(session)
                        .relationship(newRel)
                        .sourceType("RUNTIME_TRACE")
                        .adapterVersion("MAVIS_RUNNER_1.0")
                        .locator(childSpan.getTraceId() + ":" + childSpan.getSpanId())
                        .excerpt(callerName + " -> " + calleeName + " (" + durationMs + "ms)")
                        .provenance(provenance)
                        .build();
                newEvidences.add(ev);
            }
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
        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

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
            // Kiểm tra chống symlink/reparse point tương tự RuntimeReceiptStore.cs
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
}
