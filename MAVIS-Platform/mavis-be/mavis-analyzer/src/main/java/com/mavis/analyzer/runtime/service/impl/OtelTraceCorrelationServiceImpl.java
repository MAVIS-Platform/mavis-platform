package com.mavis.analyzer.runtime.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.runtime.dto.OtelSpanDTO;
import com.mavis.analyzer.runtime.dto.RuntimeTraceIngestRequestDTO;
import com.mavis.analyzer.runtime.dto.SequenceDiagramResponseDTO;
import com.mavis.analyzer.runtime.dto.SequenceStepDTO;
import com.mavis.analyzer.runtime.service.OtelTraceCorrelationService;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class OtelTraceCorrelationServiceImpl implements OtelTraceCorrelationService {

    private final RuntimeSessionRepository runtimeSessionRepository;
    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final DiagramVersionRepository diagramVersionRepository;
    private final ObjectMapper objectMapper;
    private final AccessPolicyService accessPolicyService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelVersionResponseDTO ingestTraces(UUID sessionId, UUID baseModelVersionId, RuntimeTraceIngestRequestDTO request) {
        log.info("Tiếp nhận và đối chiếu nhân quả vết OpenTelemetry cho sessionId: {}, baseModelVersionId: {}",
                sessionId, baseModelVersionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên thực nghiệm với ID: " + sessionId));

        ModelVersion baseVersion = modelVersionRepository.findById(baseModelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình gốc với ID: " + baseModelVersionId));

        accessPolicyService.requireProjectWriteAccess(session.getProject());
        if (!baseVersion.getProject().getId().equals(session.getProject().getId())
                || baseVersion.getSourceSnapshot()==null || session.getSourceSnapshot()==null
                || !baseVersion.getSourceSnapshot().getId().equals(session.getSourceSnapshot().getId())
                || (session.getModelVersion()!=null && !session.getModelVersion().getId().equals(baseModelVersionId)))
            throw new BusinessException(com.mavis.common.exception.ErrorCode.BAD_REQUEST,"Trace model/session scope mismatch");

        List<OtelSpanDTO> rawSpans = (request != null && request.getSpans() != null)
                ? request.getSpans()
                : Collections.emptyList();

        // =========================================================================
        // BƯỚC 1: KHỬ THÔNG TIN MẬT (SECRET REDACTION) TRÊN TỪNG SPAN
        // =========================================================================
        for (OtelSpanDTO span : rawSpans) {
            if (span.getHttpUrl() != null) {
                span.setHttpUrl(SecretRedactor.redactString(span.getHttpUrl()));
            }
            if (span.getAttributes() != null && !span.getAttributes().isEmpty()) {
                Map<String, String> redactedAttrs = new HashMap<>();
                for (Map.Entry<String, String> entry : span.getAttributes().entrySet()) {
                    if (SecretRedactor.isSensitiveKey(entry.getKey())) {
                        redactedAttrs.put(entry.getKey(), SecretRedactor.REDACTED_MARKER);
                    } else {
                        redactedAttrs.put(entry.getKey(), SecretRedactor.redactString(entry.getValue()));
                    }
                }
                span.setAttributes(redactedAttrs);
            }
        }

        // =========================================================================
        // BƯỚC 2: DỰNG QUAN HỆ NHÂN QUẢ parentSpanId -> spanId THEO BR-46 TRONG O(N)
        // KÈM GỘP CẶP CLIENT/SERVER SPAN VÀ THEO DÕI CAUSAL PARENT MESSAGES (M3)
        // =========================================================================
        Map<String, OtelSpanDTO> spanByIdMap = new LinkedHashMap<>();
        for (OtelSpanDTO span : rawSpans) {
            if (span.getSpanId() != null && !span.getSpanId().isBlank()) {
                spanByIdMap.put(spanKey(span.getTraceId(), span.getSpanId()), span);
            }
        }

        List<CausalCallStep> causalSteps = new ArrayList<>();
        Map<String, String> childSpanKeyToMessageId = new LinkedHashMap<>();
        Set<String> deduplicatedCallKeys = new LinkedHashSet<>();
        List<String> correlationLimitations = new ArrayList<>();
        correlationLimitations.add("NO_SYNTHETIC_REPLY_FROM_END_TIME");
        correlationLimitations.add("NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE");
        boolean clockSkewDetected = false;
        int stepIndex = 1;

        for (OtelSpanDTO child : rawSpans) {
            if (child.getParentSpanId() != null && !child.getParentSpanId().isBlank()) {
                OtelSpanDTO parent = spanByIdMap.get(spanKey(child.getTraceId(), child.getParentSpanId()));
                if (parent != null && parent.getServiceName() != null && child.getServiceName() != null) {
                    if (!parent.getServiceName().equalsIgnoreCase(child.getServiceName())) {
                        String effectiveOperation = resolveSpanOperation(parent, child);
                        String dedupKey = (Objects.toString(child.getTraceId(), "") + "|"
                                + parent.getServiceName().toLowerCase(Locale.ROOT) + "->"
                                + child.getServiceName().toLowerCase(Locale.ROOT) + "|"
                                + resolveEffectiveCallerRootSpanId(parent, spanByIdMap) + "|"
                                + effectiveOperation).toLowerCase(Locale.ROOT);
                        if ( isDuplicateClientServerHop(parent, child, deduplicatedCallKeys, dedupKey) ) {
                            continue;
                        }
                        if (hasTimestampClockSkew(parent, child)) {
                            clockSkewDetected = true;
                        }
                        int order = stepIndex++;
                        String messageId = "msg-obs-" + order;
                        List<String> causalParents = resolveCausalParentMessageIds(parent, spanByIdMap, childSpanKeyToMessageId);
                        CausalCallStep step = new CausalCallStep(order, messageId, parent, child, causalParents);
                        causalSteps.add(step);
                        childSpanKeyToMessageId.put(spanKey(child.getTraceId(), child.getSpanId()), messageId);
                    }
                }
            }
        }
        if (clockSkewDetected) {
            correlationLimitations.add("CLOCK_SKEW_DETECTED_CAUSAL_ORDER_PRESERVED");
        }

        log.debug("Đã phát hiện {} bước gọi nhân quả liên dịch vụ từ {} spans", causalSteps.size(), rawSpans.size());

        // =========================================================================
        // BƯỚC 3: TẠO ModelVersion MỚI origin = "RUNTIME_ENRICHED" (BR-47..BR-49)
        // =========================================================================
        Project project = baseVersion.getProject();
        int maxRevision = modelVersionRepository.findMaxRevisionByProjectId(project.getId());
        int newRevision = maxRevision + 1;

        ModelVersion enrichedVersion = ModelVersion.builder()
                .project(project)
                .baseModelVersion(baseVersion)
                .sourceSnapshot(baseVersion.getSourceSnapshot())
                .runtimeSession(session)
                .revision(newRevision)
                .schemaVersion("1.0")
                .origin("RUNTIME_ENRICHED")
                .isLatestValid(false)
                .createdBy(baseVersion.getCreatedBy())
                .build();

        enrichedVersion = modelVersionRepository.save(enrichedVersion);
        session.setPublicationGateStatus("HELD_NON_PROMOTED");

        // (1) Sao chép toàn bộ elements tĩnh sang version mới (không đoán bằng tên đầu tiên nếu trùng tên)
        List<ModelElement> baseElements = modelElementRepository.findByModelVersionId(baseModelVersionId);
        Map<UUID, ModelElement> oldToNewElementMap = new LinkedHashMap<>();
        IdentityHashMap<ModelElement, UUID> newToBaseIdMap = new IdentityHashMap<>();
        Map<String, List<ModelElement>> elementsByLowerName = new LinkedHashMap<>();
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
            if (baseEl.getId() != null) {
                oldToNewElementMap.put(baseEl.getId(), copy);
                newToBaseIdMap.put(copy, baseEl.getId());
            }
            if (baseEl.getName() != null) {
                elementsByLowerName.computeIfAbsent(baseEl.getName().toLowerCase(Locale.ROOT), k -> new ArrayList<>()).add(copy);
            }
        }

        Map<String, String> confirmedMappings = session.getConfirmedServiceMappings() != null
                ? session.getConfirmedServiceMappings()
                : Collections.emptyMap();

        Map<String, ModelElement> uniqueServiceElementMap = new LinkedHashMap<>();
        Set<String> ambiguousServiceNames = new LinkedHashSet<>();

        for (Map.Entry<String, List<ModelElement>> entry : elementsByLowerName.entrySet()) {
            String lowerName = entry.getKey();
            List<ModelElement> candidates = entry.getValue();
            ModelElement confirmed = resolveConfirmedMapping(lowerName, confirmedMappings, oldToNewElementMap);
            if (confirmed != null) {
                uniqueServiceElementMap.put(lowerName, confirmed);
            } else if (candidates.size() == 1) {
                uniqueServiceElementMap.put(lowerName, candidates.get(0));
            } else {
                List<ModelElement> serviceContainers = candidates.stream()
                        .filter(c -> "SERVICE_CONTAINER".equalsIgnoreCase(c.getElementType()))
                        .toList();
                if (serviceContainers.size() == 1) {
                    uniqueServiceElementMap.put(lowerName, serviceContainers.get(0));
                } else {
                    ambiguousServiceNames.add(lowerName);
                }
            }
        }

        // Kiểm tra xem có service nào trong Span không khớp hoặc bị nhập nhằng -> Gắn cờ UNCERTAIN_MAPPING / AMBIGUOUS
        boolean hasUncertainMapping = false;
        Map<String, ModelElement> runtimeDiscoveredByLowerName = new LinkedHashMap<>();
        for (OtelSpanDTO span : rawSpans) {
            SpanElementResolution res = resolveSpanElement(span, confirmedMappings, oldToNewElementMap, uniqueServiceElementMap, ambiguousServiceNames, runtimeDiscoveredByLowerName);
            if ("UNCERTAIN_MAPPING".equals(res.status)) {
                hasUncertainMapping = true;
                String svcName = span.getServiceName();
                String lowerName = svcName.toLowerCase(Locale.ROOT);
                if (!runtimeDiscoveredByLowerName.containsKey(lowerName)) {
                    ObjectNode props = objectMapper.createObjectNode();
                    props.put("discoveredVia", "OTEL_SPAN");
                    props.put("traceId", span.getTraceId());

                    ModelElement uncertainEl = ModelElement.builder()
                            .modelVersion(enrichedVersion)
                            .name(svcName)
                            .elementType("SERVICE_CONTAINER")
                            .status("UNCERTAIN_MAPPING")
                            .properties(props)
                            .build();

                    newElements.add(uncertainEl);
                    runtimeDiscoveredByLowerName.put(lowerName, uncertainEl);
                }
            } else if ("AMBIGUOUS".equals(res.status)) {
                hasUncertainMapping = true;
            }
        }

        // Lưu toàn bộ elements bằng saveAll()
        List<ModelElement> savedElements = modelElementRepository.saveAll(newElements);
        IdentityHashMap<ModelElement, ModelElement> unsavedToSavedElement = new IdentityHashMap<>();
        for (int i = 0; i < newElements.size() && i < savedElements.size(); i++) {
            ModelElement orig = newElements.get(i);
            ModelElement saved = savedElements.get(i);
            unsavedToSavedElement.put(orig, saved);
            UUID baseId = newToBaseIdMap.get(orig);
            if (baseId != null) {
                oldToNewElementMap.put(baseId, saved);
                newToBaseIdMap.put(saved, baseId);
            }
        }
        for (Map.Entry<String, ModelElement> entry : new ArrayList<>(uniqueServiceElementMap.entrySet())) {
            ModelElement saved = unsavedToSavedElement.get(entry.getValue());
            if (saved != null) {
                uniqueServiceElementMap.put(entry.getKey(), saved);
            }
        }
        for (Map.Entry<String, ModelElement> entry : new ArrayList<>(runtimeDiscoveredByLowerName.entrySet())) {
            ModelElement saved = unsavedToSavedElement.get(entry.getValue());
            if (saved != null) {
                runtimeDiscoveredByLowerName.put(entry.getKey(), saved);
            }
        }

        // (2) Kế thừa 100% cạnh tĩnh và nâng cấp / thêm mới theo bước gọi nhân quả
        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseModelVersionId);
        List<ModelRelationship> newRelationships = new ArrayList<>();
        IdentityHashMap<ModelRelationship, UUID> newToBaseRelIdMap = new IdentityHashMap<>();
        Map<UUID, ModelRelationship> copiedByBaseRelId = new LinkedHashMap<>();
        Map<String, List<ModelRelationship>> staticRelsByPairKey = new LinkedHashMap<>();
        Map<String, ModelRelationship> runtimeRelByPairKey = new LinkedHashMap<>();

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
                if (baseRel.getId() != null) {
                    newToBaseRelIdMap.put(copyRel, baseRel.getId());
                    copiedByBaseRelId.put(baseRel.getId(), copyRel);
                }
                UUID srcBaseId = newToBaseIdMap.get(newSrc);
                UUID tgtBaseId = newToBaseIdMap.get(newTgt);
                if (srcBaseId != null && tgtBaseId != null) {
                    String idPairKey = (srcBaseId + "->" + tgtBaseId).toLowerCase(Locale.ROOT);
                    staticRelsByPairKey.computeIfAbsent(idPairKey, k -> new ArrayList<>()).add(copyRel);
                }
                String namePairKey = (newSrc.getName() + "->" + newTgt.getName()).toLowerCase(Locale.ROOT);
                staticRelsByPairKey.computeIfAbsent(namePairKey, k -> new ArrayList<>()).add(copyRel);
            }
        }

        List<Evidence> newEvidences = new ArrayList<>();
        boolean hasAmbiguousRelationshipCandidates = false;
        boolean hasUnknownMessageSort = false;

        for (CausalCallStep step : causalSteps) {
            SpanElementResolution callerRes = resolveSpanElement(
                    step.parentSpan, confirmedMappings, oldToNewElementMap, uniqueServiceElementMap, ambiguousServiceNames, runtimeDiscoveredByLowerName);
            SpanElementResolution calleeRes = resolveSpanElement(
                    step.childSpan, confirmedMappings, oldToNewElementMap, uniqueServiceElementMap, ambiguousServiceNames, runtimeDiscoveredByLowerName);
            step.callerResolution = callerRes;
            step.calleeResolution = calleeRes;

            String callerName = step.parentSpan.getServiceName();
            String calleeName = step.childSpan.getServiceName();
            UUID callerBaseId = callerRes.element != null ? newToBaseIdMap.get(callerRes.element) : null;
            UUID calleeBaseId = calleeRes.element != null ? newToBaseIdMap.get(calleeRes.element) : null;

            ModelRelationship matchedRel = resolveExplicitSpanRelationship(step.parentSpan, step.childSpan, copiedByBaseRelId);
            List<ModelRelationship> candidateStaticRels = Collections.emptyList();
            if (matchedRel == null) {
                if (callerBaseId != null && calleeBaseId != null) {
                    candidateStaticRels = staticRelsByPairKey.getOrDefault(
                            (callerBaseId + "->" + calleeBaseId).toLowerCase(Locale.ROOT),
                            Collections.emptyList()
                    );
                }
                String pairKey = (callerName + "->" + calleeName).toLowerCase(Locale.ROOT);
                if (candidateStaticRels.isEmpty() && !"AMBIGUOUS".equals(callerRes.status) && !"AMBIGUOUS".equals(calleeRes.status)) {
                    candidateStaticRels = staticRelsByPairKey.getOrDefault(pairKey, Collections.emptyList());
                }
                if (candidateStaticRels.size() == 1) {
                    matchedRel = candidateStaticRels.get(0);
                } else if (candidateStaticRels.size() > 1) {
                    hasAmbiguousRelationshipCandidates = true;
                    List<UUID> sortedBaseIds = candidateStaticRels.stream()
                            .map(newToBaseRelIdMap::get)
                            .filter(Objects::nonNull)
                            .distinct()
                            .sorted(Comparator.comparing(UUID::toString))
                            .toList();
                    step.candidateBaseRelationshipIds = sortedBaseIds;
                }
            }
            if (matchedRel != null && step.candidateBaseRelationshipIds.isEmpty()) {
                UUID singleBaseId = newToBaseRelIdMap.get(matchedRel);
                if (singleBaseId != null) {
                    step.candidateBaseRelationshipIds = List.of(singleBaseId);
                }
            }

            String pairKey = (callerName + "->" + calleeName).toLowerCase(Locale.ROOT);
            String httpMethod = firstNonBlank(step.childSpan.getHttpMethod(), step.parentSpan.getHttpMethod());
            String httpUrl = firstNonBlank(step.childSpan.getHttpUrl(), step.parentSpan.getHttpUrl());
            Integer statusCode = step.childSpan.getHttpStatusCode() != null ? step.childSpan.getHttpStatusCode() : step.parentSpan.getHttpStatusCode();
            Long durationMs = step.childSpan.getDurationMs() != null ? step.childSpan.getDurationMs() : step.parentSpan.getDurationMs();

            if (matchedRel != null) {
                matchedRel.setOriginLayer("STATIC_AND_RUNTIME");

                Evidence ev = Evidence.builder()
                        .modelVersion(enrichedVersion)
                        .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                        .runtimeSession(session)
                        .relationship(matchedRel)
                        .sourceType("RUNTIME_TRACE")
                        .adapterVersion("OTEL_COLLECTOR_1.0")
                        .locator(step.childSpan.getTraceId() + ":" + step.childSpan.getSpanId())
                        .excerpt("HTTP " + httpMethod + " " + httpUrl
                                + " -> " + statusCode + " (" + durationMs + "ms)")
                        .build();
                newEvidences.add(ev);
                step.relationship = matchedRel;
                step.evidence = ev;
            } else {
                ModelElement src = callerRes.element;
                ModelElement tgt = calleeRes.element;

                if (src != null && tgt != null) {
                    ModelRelationship newRuntimeRel = runtimeRelByPairKey.get(pairKey);
                    if (newRuntimeRel == null) {
                        newRuntimeRel = ModelRelationship.builder()
                                .modelVersion(enrichedVersion)
                                .sourceElement(src)
                                .targetElement(tgt)
                                .relationType("RUNTIME_OBSERVED")
                                .originLayer("RUNTIME")
                                .direction("DIRECTED")
                                .build();

                        newRelationships.add(newRuntimeRel);
                        runtimeRelByPairKey.put(pairKey, newRuntimeRel);
                    }

                    Evidence ev = Evidence.builder()
                            .modelVersion(enrichedVersion)
                            .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                            .runtimeSession(session)
                            .relationship(newRuntimeRel)
                            .sourceType("RUNTIME_TRACE")
                            .adapterVersion("OTEL_COLLECTOR_1.0")
                            .locator(step.childSpan.getTraceId() + ":" + step.childSpan.getSpanId())
                            .excerpt("HTTP " + httpMethod + " " + httpUrl
                                    + " -> " + statusCode + " (" + durationMs + "ms)")
                            .build();
                    newEvidences.add(ev);
                    if (step.candidateBaseRelationshipIds.size() <= 1) {
                        step.relationship = newRuntimeRel;
                    }
                    step.evidence = ev;
                }
            }
        }

        // Lưu Batch relationships và evidences bằng saveAll()
        modelRelationshipRepository.saveAll(newRelationships);
        evidenceRepository.saveAll(newEvidences);

        if (hasUncertainMapping) {
            correlationLimitations.add("PARTIAL_OR_AMBIGUOUS_PARTICIPANT_MAPPING");
        }
        if (hasAmbiguousRelationshipCandidates) {
            correlationLimitations.add("AMBIGUOUS_STATIC_RELATIONSHIP_CANDIDATES");
        }

        // =========================================================================
        // BƯỚC 4: SINH BẢN VẼ DiagramVersion notation = "UML_SEQUENCE", level = "RUNTIME_PROCESS"
        // =========================================================================
        ObjectNode sequenceLayout = objectMapper.createObjectNode();
        sequenceLayout.put("notation", "UML_SEQUENCE");
        sequenceLayout.put("level", "RUNTIME_PROCESS");
        sequenceLayout.put("schemaVersion", 2);
        sequenceLayout.put("baseModelVersionId", baseVersion.getId() != null ? baseVersion.getId().toString() : null);
        sequenceLayout.put("enrichedModelVersionId", enrichedVersion.getId() != null ? enrichedVersion.getId().toString() : null);
        sequenceLayout.put("traceStatus", hasUncertainMapping ? "PARTIAL" : "COMPLETE");
        sequenceLayout.put("totalSteps", causalSteps.size());

        ArrayNode stepsArray = objectMapper.createArrayNode();
        for (CausalCallStep step : causalSteps) {
            ObjectNode stepNode = objectMapper.createObjectNode();
            String callerSvc = step.parentSpan.getServiceName();
            String calleeSvc = step.childSpan.getServiceName();
            UUID callerBaseId = step.callerResolution != null && step.callerResolution.element != null
                    ? newToBaseIdMap.get(step.callerResolution.element)
                    : null;
            UUID calleeBaseId = step.calleeResolution != null && step.calleeResolution.element != null
                    ? newToBaseIdMap.get(step.calleeResolution.element)
                    : null;
            UUID callerElId = step.callerResolution != null && step.callerResolution.element != null
                    ? (step.callerResolution.element.getId() != null ? step.callerResolution.element.getId() : callerBaseId)
                    : null;
            UUID calleeElId = step.calleeResolution != null && step.calleeResolution.element != null
                    ? (step.calleeResolution.element.getId() != null ? step.calleeResolution.element.getId() : calleeBaseId)
                    : null;
            String callerStatus = step.callerResolution != null ? step.callerResolution.status : "UNMAPPED";
            String calleeStatus = step.calleeResolution != null ? step.calleeResolution.status : "UNMAPPED";
            String callerParticipantId = buildParticipantId(step.parentSpan, callerBaseId, callerElId, callerSvc, callerStatus);
            String calleeParticipantId = buildParticipantId(step.childSpan, calleeBaseId, calleeElId, calleeSvc, calleeStatus);

            UUID baseRelId = step.relationship != null ? newToBaseRelIdMap.get(step.relationship) : null;
            UUID relId = step.relationship != null
                    ? (step.relationship.getId() != null ? step.relationship.getId() : baseRelId)
                    : null;
            UUID evId = step.evidence != null ? step.evidence.getId() : null;

            String httpMethod = firstNonBlank(step.childSpan.getHttpMethod(), step.parentSpan.getHttpMethod());
            String httpUrl = firstNonBlank(step.childSpan.getHttpUrl(), step.parentSpan.getHttpUrl());
            Integer statusCode = step.childSpan.getHttpStatusCode() != null ? step.childSpan.getHttpStatusCode() : step.parentSpan.getHttpStatusCode();
            Long durationMs = step.childSpan.getDurationMs() != null ? step.childSpan.getDurationMs() : step.parentSpan.getDurationMs();
            String operation = resolveSpanOperation(step.parentSpan, step.childSpan);
            String messageSort = inferObservedMessageSort(step.parentSpan, step.childSpan);
            if ("UNKNOWN".equals(messageSort)) {
                hasUnknownMessageSort = true;
            }

            stepNode.put("stepOrder", step.order);
            stepNode.put("messageId", step.messageId);
            stepNode.put("callerService", callerSvc);
            stepNode.put("calleeService", calleeSvc);
            stepNode.put("callerParticipantId", callerParticipantId);
            stepNode.put("calleeParticipantId", calleeParticipantId);
            putUuidOrNull(stepNode, "callerElementId", callerElId);
            putUuidOrNull(stepNode, "calleeElementId", calleeElId);
            putUuidOrNull(stepNode, "callerBaseElementId", callerBaseId);
            putUuidOrNull(stepNode, "calleeBaseElementId", calleeBaseId);
            stepNode.put("callerResolutionStatus", callerStatus);
            stepNode.put("calleeResolutionStatus", calleeStatus);
            stepNode.put("operation", operation != null ? operation : (httpMethod + " " + httpUrl));
            stepNode.put("messageSort", messageSort);
            putStringOrNull(stepNode, "httpMethod", httpMethod);
            putIntOrNull(stepNode, "httpStatusCode", statusCode);
            putLongOrNull(stepNode, "durationMs", durationMs);
            putStringOrNull(stepNode, "traceId", step.childSpan.getTraceId());
            putStringOrNull(stepNode, "spanId", step.childSpan.getSpanId());
            putStringOrNull(stepNode, "parentSpanId", step.childSpan.getParentSpanId());
            putUuidOrNull(stepNode, "relationshipId", relId);
            putUuidOrNull(stepNode, "baseRelationshipId", baseRelId);
            ArrayNode candidateRelsNode = stepNode.putArray("candidateRelationshipIds");
            for (UUID candId : step.candidateBaseRelationshipIds) {
                if (candId != null) {
                    candidateRelsNode.add(candId.toString());
                }
            }
            putUuidOrNull(stepNode, "evidenceId", evId);
            stepNode.put("provenanceType", "OBSERVED");
            ArrayNode parentsNode = stepNode.putArray("causalParentMessageIds");
            for (String parentMsgId : step.causalParentMessageIds) {
                parentsNode.add(parentMsgId);
            }
            stepsArray.add(stepNode);
        }
        if (hasUnknownMessageSort && !correlationLimitations.contains("UNCLASSIFIED_MESSAGE_SORT_WITHOUT_EXPLICIT_SPAN_ATTRIBUTE")) {
            correlationLimitations.add("UNCLASSIFIED_MESSAGE_SORT_WITHOUT_EXPLICIT_SPAN_ATTRIBUTE");
        }
        ArrayNode limitationsNode = sequenceLayout.putArray("limitations");
        for (String lim : correlationLimitations) {
            limitationsNode.add(lim);
        }
        sequenceLayout.set("steps", stepsArray);

        DiagramVersion sequenceDiagram = DiagramVersion.builder()
                .modelVersion(enrichedVersion)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .layoutJson(sequenceLayout)
                .build();
        diagramVersionRepository.save(sequenceDiagram);

        // =========================================================================
        // CẬP NHẬT TRẠNG THÁI RUNTIME SESSION (BR-48: Độc lập scenario_status và trace_status)
        // =========================================================================
        String outcome = (request != null && request.getScenarioOutcome() != null)
                ? request.getScenarioOutcome().toUpperCase()
                : "PASSED";
        session.setScenarioStatus(outcome);
        session.setTraceStatus(hasUncertainMapping ? "PARTIAL" : "COMPLETE");
        session.setEnrichedModelVersionId(enrichedVersion.getId());
        session.setCompletedAt(OffsetDateTime.now());
        runtimeSessionRepository.save(session);

        log.info("Hoàn tất đối chiếu nhân quả vết thực thi. Created ModelVersion ID: {}, revision: {}, traceStatus: {}",
                enrichedVersion.getId(), newRevision, session.getTraceStatus());

        return ModelVersionResponseDTO.fromEntity(enrichedVersion);
    }

    private static String spanKey(String trace, String span) {
        return (Objects.toString(trace, "") + ":" + Objects.toString(span, "")).toLowerCase(Locale.ROOT);
    }

    @Override
    @Transactional(readOnly = true)
    public SequenceDiagramResponseDTO getSequenceDiagramBySession(UUID sessionId) {
        log.info("Lấy biểu đồ tuần tự UML Sequence cho sessionId: {}", sessionId);

        RuntimeSession session = runtimeSessionRepository.findById(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "Không tìm thấy runtime session: " + sessionId));
        accessPolicyService.requireProjectReadAccess(session.getProject());

        Optional<ModelVersion> mvOpt = modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId);
        if (mvOpt.isEmpty()) {
            UUID mvId = session.getModelVersion() != null ? session.getModelVersion().getId() : session.getId();
            return SequenceDiagramResponseDTO.builder()
                    .diagramId(UUID.randomUUID())
                    .modelVersionId(mvId)
                    .baseModelVersionId(session.getModelVersion() != null ? session.getModelVersion().getId() : null)
                    .sourceSnapshotId(session.getSourceSnapshot() != null ? session.getSourceSnapshot().getId() : null)
                    .modelRevision(session.getModelVersion() != null ? session.getModelVersion().getRevision() : 1)
                    .modelOrigin("RUNTIME_ENRICHED")
                    .runtimeSessionId(session.getId())
                    .notation("UML_SEQUENCE")
                    .level("RUNTIME_PROCESS")
                    .traceStatus(session.getTraceStatus() != null ? session.getTraceStatus() : "NOT_AVAILABLE")
                    .mappingStatus(session.getMappingStatus())
                    .startedAt(session.getStartedAt())
                    .completedAt(session.getCompletedAt())
                    .limitations(List.of("NO_TRACES_CAPTURED"))
                    .steps(Collections.emptyList())
                    .build();
        }

        ModelVersion mv = mvOpt.get();

        List<DiagramVersion> diagrams = diagramVersionRepository.findByModelVersionIdAndNotation(mv.getId(), "UML_SEQUENCE");
        if (diagrams.isEmpty()) {
            return SequenceDiagramResponseDTO.builder()
                    .diagramId(UUID.randomUUID())
                    .modelVersionId(mv.getId())
                    .baseModelVersionId(mv.getBaseModelVersion() != null ? mv.getBaseModelVersion().getId() : (session.getModelVersion() != null ? session.getModelVersion().getId() : null))
                    .sourceSnapshotId(mv.getSourceSnapshot() != null ? mv.getSourceSnapshot().getId() : (session.getSourceSnapshot() != null ? session.getSourceSnapshot().getId() : null))
                    .modelRevision(mv.getRevision())
                    .baseModelRevision(mv.getBaseModelVersion() != null ? mv.getBaseModelVersion().getRevision() : null)
                    .modelOrigin(mv.getOrigin())
                    .runtimeSessionId(session.getId())
                    .notation("UML_SEQUENCE")
                    .level("RUNTIME_PROCESS")
                    .traceStatus(session.getTraceStatus() != null ? session.getTraceStatus() : "NOT_AVAILABLE")
                    .mappingStatus(session.getMappingStatus())
                    .startedAt(session.getStartedAt())
                    .completedAt(session.getCompletedAt())
                    .limitations(List.of("NO_SEQUENCE_DIAGRAM"))
                    .steps(Collections.emptyList())
                    .build();
        }

        DiagramVersion diagram = diagrams.get(0);
        List<SequenceStepDTO> steps = new ArrayList<>();

        if (diagram.getLayoutJson() != null && diagram.getLayoutJson().has("steps")) {
            int fallbackOrder = 1;
            for (var node : diagram.getLayoutJson().get("steps")) {
                int stepOrder = node.path("stepOrder").asInt(fallbackOrder++);
                String messageId = nonBlankOrNull(node, "messageId");
                if (messageId == null) {
                    messageId = "msg-obs-" + stepOrder;
                }
                String callerService = nonBlankOrNull(node, "callerService");
                String calleeService = nonBlankOrNull(node, "calleeService");
                UUID callerElementId = uuidOrNull(node, "callerElementId");
                UUID calleeElementId = uuidOrNull(node, "calleeElementId");
                UUID callerBaseElementId = uuidOrNull(node, "callerBaseElementId");
                UUID calleeBaseElementId = uuidOrNull(node, "calleeBaseElementId");

                String callerResolutionStatus = nonBlankOrNull(node, "callerResolutionStatus");
                if (callerResolutionStatus == null) {
                    callerResolutionStatus = (callerElementId != null || callerBaseElementId != null) ? "RESOLVED" : "UNMAPPED";
                }
                String calleeResolutionStatus = nonBlankOrNull(node, "calleeResolutionStatus");
                if (calleeResolutionStatus == null) {
                    calleeResolutionStatus = (calleeElementId != null || calleeBaseElementId != null) ? "RESOLVED" : "UNMAPPED";
                }

                String callerParticipantId = nonBlankOrNull(node, "callerParticipantId");
                if (callerParticipantId == null) {
                    callerParticipantId = buildParticipantId(null, callerBaseElementId, callerElementId, callerService, callerResolutionStatus);
                }
                String calleeParticipantId = nonBlankOrNull(node, "calleeParticipantId");
                if (calleeParticipantId == null) {
                    calleeParticipantId = buildParticipantId(null, calleeBaseElementId, calleeElementId, calleeService, calleeResolutionStatus);
                }

                String messageSort = nonBlankOrNull(node, "messageSort");
                if (messageSort == null) {
                    messageSort = "UNKNOWN";
                }
                String provenanceType = nonBlankOrNull(node, "provenanceType");
                if (provenanceType == null) {
                    provenanceType = "OBSERVED";
                }

                List<String> causalParents = new ArrayList<>();
                if (node.has("causalParentMessageIds") && node.get("causalParentMessageIds").isArray()) {
                    for (var p : node.get("causalParentMessageIds")) {
                        if (p != null && !p.isNull() && !p.asText().isBlank()) {
                            causalParents.add(p.asText());
                        }
                    }
                }

                List<UUID> candidateRelIds = new ArrayList<>();
                if (node.has("candidateRelationshipIds") && node.get("candidateRelationshipIds").isArray()) {
                    for (var cr : node.get("candidateRelationshipIds")) {
                        if (cr != null && !cr.isNull() && !cr.asText().isBlank()) {
                            try {
                                candidateRelIds.add(UUID.fromString(cr.asText().trim()));
                            } catch (IllegalArgumentException ignored) {
                            }
                        }
                    }
                }

                Integer httpStatusCode = intOrNull(node, "httpStatusCode");
                if (httpStatusCode != null && (httpStatusCode < 100 || httpStatusCode > 599)) {
                    httpStatusCode = null;
                }

                steps.add(SequenceStepDTO.builder()
                        .stepOrder(stepOrder)
                        .messageId(messageId)
                        .callerService(callerService)
                        .calleeService(calleeService)
                        .callerParticipantId(callerParticipantId)
                        .calleeParticipantId(calleeParticipantId)
                        .callerElementId(callerElementId)
                        .calleeElementId(calleeElementId)
                        .callerBaseElementId(callerBaseElementId)
                        .calleeBaseElementId(calleeBaseElementId)
                        .callerResolutionStatus(callerResolutionStatus)
                        .calleeResolutionStatus(calleeResolutionStatus)
                        .operation(nonBlankOrNull(node, "operation"))
                        .messageSort(messageSort)
                        .httpMethod(nonBlankOrNull(node, "httpMethod"))
                        .httpStatusCode(httpStatusCode)
                        .durationMs(longOrNull(node, "durationMs"))
                        .traceId(nonBlankOrNull(node, "traceId"))
                        .spanId(nonBlankOrNull(node, "spanId"))
                        .parentSpanId(nonBlankOrNull(node, "parentSpanId"))
                        .relationshipId(uuidOrNull(node, "relationshipId"))
                        .baseRelationshipId(uuidOrNull(node, "baseRelationshipId"))
                        .candidateRelationshipIds(candidateRelIds)
                        .evidenceId(uuidOrNull(node, "evidenceId"))
                        .provenanceType(provenanceType)
                        .causalParentMessageIds(causalParents)
                        .build());
            }
        }

        ModelVersion baseMv = mv.getBaseModelVersion();
        if (mv.getRuntimeSession() != null) {
            session = mv.getRuntimeSession();
        }
        UUID baseModelVersionId = baseMv != null
                ? baseMv.getId()
                : (session != null && session.getModelVersion() != null
                        ? session.getModelVersion().getId()
                        : uuidOrNull(diagram.getLayoutJson(), "baseModelVersionId"));
        UUID sourceSnapshotId = mv.getSourceSnapshot() != null
                ? mv.getSourceSnapshot().getId()
                : (session != null && session.getSourceSnapshot() != null ? session.getSourceSnapshot().getId() : null);

        List<String> limitations = new ArrayList<>();
        if (diagram.getLayoutJson() != null && diagram.getLayoutJson().has("limitations") && diagram.getLayoutJson().get("limitations").isArray()) {
            for (var lim : diagram.getLayoutJson().get("limitations")) {
                if (lim != null && !lim.isNull() && !lim.asText().isBlank()) {
                    limitations.add(lim.asText());
                }
            }
        }
        if (limitations.isEmpty()) {
            limitations.add("NO_SYNTHETIC_REPLY_FROM_END_TIME");
            limitations.add("NO_COMBINED_FRAGMENTS_FROM_SINGLE_TRACE");
        }

        String traceStatus = session != null && session.getTraceStatus() != null
                ? session.getTraceStatus()
                : textOrNull(diagram.getLayoutJson(), "traceStatus");
        String mappingStatus = session != null ? session.getMappingStatus() : null;

        return SequenceDiagramResponseDTO.builder()
                .diagramId(diagram.getId())
                .modelVersionId(mv.getId())
                .baseModelVersionId(baseModelVersionId)
                .sourceSnapshotId(sourceSnapshotId)
                .modelRevision(mv.getRevision())
                .baseModelRevision(baseMv != null ? baseMv.getRevision() : null)
                .modelOrigin(mv.getOrigin())
                .runtimeSessionId(sessionId)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .traceStatus(traceStatus)
                .mappingStatus(mappingStatus)
                .startedAt(session != null ? session.getStartedAt() : null)
                .completedAt(session != null ? session.getCompletedAt() : null)
                .limitations(limitations)
                .layoutJson(diagram.getLayoutJson())
                .steps(steps)
                .build();
    }

    private static ModelRelationship resolveExplicitSpanRelationship(OtelSpanDTO parent,
                                                                     OtelSpanDTO child,
                                                                     Map<UUID, ModelRelationship> copiedByBaseRelId) {
        for (OtelSpanDTO s : Arrays.asList(child, parent)) {
            if (s != null && s.getAttributes() != null) {
                for (String key : List.of("mavis.model.relationshipId", "model.relationship.id", "relationshipId")) {
                    String raw = s.getAttributes().get(key);
                    if (raw != null && !raw.isBlank()) {
                        try {
                            UUID id = UUID.fromString(raw.trim());
                            ModelRelationship matched = copiedByBaseRelId.get(id);
                            if (matched != null) {
                                return matched;
                            }
                        } catch (IllegalArgumentException ignored) {
                        }
                    }
                }
            }
        }
        return null;
    }

    private static ModelElement resolveConfirmedMapping(String lowerServiceName,
                                                        Map<String, String> confirmedMappings,
                                                        Map<UUID, ModelElement> oldToNewElementMap) {
        if (confirmedMappings == null || confirmedMappings.isEmpty()) {
            return null;
        }
        for (Map.Entry<String, String> entry : confirmedMappings.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(lowerServiceName) && entry.getValue() != null) {
                try {
                    UUID id = UUID.fromString(entry.getValue().trim());
                    ModelElement resolved = oldToNewElementMap.get(id);
                    if (resolved != null) {
                        return resolved;
                    }
                } catch (IllegalArgumentException ignored) {
                }
            }
        }
        return null;
    }

    private static SpanElementResolution resolveSpanElement(OtelSpanDTO span,
                                                            Map<String, String> confirmedMappings,
                                                            Map<UUID, ModelElement> oldToNewElementMap,
                                                            Map<String, ModelElement> uniqueServiceElementMap,
                                                            Set<String> ambiguousServiceNames,
                                                            Map<String, ModelElement> runtimeDiscoveredByLowerName) {
        if (span == null) {
            return new SpanElementResolution(null, "UNMAPPED");
        }
        Map<String, String> attrs = span.getAttributes();
        if (attrs != null) {
            for (String key : List.of("mavis.model.elementId", "model.element.id", "modelServiceId")) {
                String rawId = attrs.get(key);
                if (rawId != null && !rawId.isBlank()) {
                    try {
                        UUID id = UUID.fromString(rawId.trim());
                        ModelElement resolved = oldToNewElementMap.get(id);
                        if (resolved != null) {
                            return new SpanElementResolution(resolved, "RESOLVED");
                        }
                    } catch (IllegalArgumentException ignored) {
                    }
                }
            }
        }
        String svcName = span.getServiceName();
        if (svcName == null || svcName.isBlank()) {
            return new SpanElementResolution(null, "UNMAPPED");
        }
        String lower = svcName.toLowerCase(Locale.ROOT);
        ModelElement confirmed = resolveConfirmedMapping(lower, confirmedMappings, oldToNewElementMap);
        if (confirmed != null) {
            return new SpanElementResolution(confirmed, "RESOLVED");
        }
        if (ambiguousServiceNames.contains(lower)) {
            return new SpanElementResolution(null, "AMBIGUOUS");
        }
        ModelElement unique = uniqueServiceElementMap.get(lower);
        if (unique != null) {
            return new SpanElementResolution(unique, "RESOLVED");
        }
        ModelElement discovered = runtimeDiscoveredByLowerName.get(lower);
        return new SpanElementResolution(discovered, "UNCERTAIN_MAPPING");
    }

    private static String buildParticipantId(OtelSpanDTO span,
                                             UUID baseElementId,
                                             UUID elementId,
                                             String serviceName,
                                             String resolutionStatus) {
        String role = null;
        if (span != null && span.getAttributes() != null) {
            role = firstNonBlank(span.getAttributes().get("mavis.participant.role"), span.getAttributes().get("participant.role"));
        }
        UUID canonicalId = baseElementId != null ? baseElementId : elementId;
        if (canonicalId != null && "RESOLVED".equalsIgnoreCase(resolutionStatus)) {
            return role != null && !role.isBlank()
                    ? "part:" + canonicalId + ":" + role.trim().toLowerCase(Locale.ROOT)
                    : "part:" + canonicalId;
        }
        String safeService = serviceName != null && !serviceName.isBlank()
                ? serviceName.trim().toLowerCase(Locale.ROOT)
                : "unknown";
        if ("AMBIGUOUS".equalsIgnoreCase(resolutionStatus)) {
            return "part:ambiguous:" + safeService;
        }
        return "part:service:" + safeService;
    }

    private static String resolveEffectiveCallerRootSpanId(OtelSpanDTO callerSpan, Map<String, OtelSpanDTO> spanByIdMap) {
        if (callerSpan == null) {
            return "";
        }
        String kind = spanKind(callerSpan);
        if ("CLIENT".equals(kind) && callerSpan.getParentSpanId() != null && !callerSpan.getParentSpanId().isBlank()) {
            OtelSpanDTO parent = spanByIdMap.get(spanKey(callerSpan.getTraceId(), callerSpan.getParentSpanId()));
            if (parent != null && parent.getServiceName() != null
                    && parent.getServiceName().equalsIgnoreCase(callerSpan.getServiceName())) {
                return parent.getSpanId();
            }
        }
        return Objects.toString(callerSpan.getSpanId(), "");
    }

    private static boolean isDuplicateClientServerHop(OtelSpanDTO parent,
                                                      OtelSpanDTO child,
                                                      Set<String> deduplicatedCallKeys,
                                                      String dedupKey) {
        String parentKind = spanKind(parent);
        String childKind = spanKind(child);
        if ("CLIENT".equals(parentKind) || "SERVER".equals(childKind)) {
            return !deduplicatedCallKeys.add(dedupKey);
        }
        return false;
    }

    private static List<String> resolveCausalParentMessageIds(OtelSpanDTO callerSpan,
                                                              Map<String, OtelSpanDTO> spanByIdMap,
                                                              Map<String, String> childSpanKeyToMessageId) {
        List<String> result = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        OtelSpanDTO curr = callerSpan;
        String callerService = callerSpan != null ? callerSpan.getServiceName() : null;
        while (curr != null && curr.getSpanId() != null && visited.add(spanKey(curr.getTraceId(), curr.getSpanId()))) {
            String key = spanKey(curr.getTraceId(), curr.getSpanId());
            String msgId = childSpanKeyToMessageId.get(key);
            if (msgId != null && !result.contains(msgId)) {
                result.add(msgId);
                break;
            }
            if (curr.getParentSpanId() == null || curr.getParentSpanId().isBlank()) {
                break;
            }
            OtelSpanDTO next = spanByIdMap.get(spanKey(curr.getTraceId(), curr.getParentSpanId()));
            if (next == null || callerService == null || next.getServiceName() == null
                    || !callerService.equalsIgnoreCase(next.getServiceName())) {
                break;
            }
            curr = next;
        }
        return result;
    }

    private static boolean hasTimestampClockSkew(OtelSpanDTO parent, OtelSpanDTO child) {
        Long pStart = parseTimestampAttr(parent);
        Long cStart = parseTimestampAttr(child);
        return pStart != null && cStart != null && cStart < pStart;
    }

    private static Long parseTimestampAttr(OtelSpanDTO span) {
        if (span == null || span.getAttributes() == null) {
            return null;
        }
        for (String key : List.of("startTimeUnixNano", "start.time.nano", "timestampMs")) {
            String v = span.getAttributes().get(key);
            if (v != null && !v.isBlank()) {
                try {
                    return Long.parseLong(v.trim());
                } catch (NumberFormatException ignored) {
                }
            }
        }
        return null;
    }

    private static String spanKind(OtelSpanDTO span) {
        if (span == null || span.getAttributes() == null) {
            return "";
        }
        String k = firstNonBlank(span.getAttributes().get("span.kind"), span.getAttributes().get("otel.span.kind"));
        return k != null ? k.trim().toUpperCase(Locale.ROOT) : "";
    }

    private static String resolveSpanOperation(OtelSpanDTO parent, OtelSpanDTO child) {
        if (child != null && child.getOperationName() != null && !child.getOperationName().isBlank()) {
            return child.getOperationName();
        }
        if (parent != null && "CLIENT".equals(spanKind(parent))
                && parent.getOperationName() != null && !parent.getOperationName().isBlank()) {
            return parent.getOperationName();
        }
        String method = firstNonBlank(child != null ? child.getHttpMethod() : null, parent != null ? parent.getHttpMethod() : null);
        String url = firstNonBlank(child != null ? child.getHttpUrl() : null, parent != null ? parent.getHttpUrl() : null);
        if (method != null || url != null) {
            return (method != null ? method : "") + (method != null && url != null ? " " : "") + (url != null ? url : "");
        }
        return null;
    }

    private static String inferObservedMessageSort(OtelSpanDTO parent, OtelSpanDTO child) {
        for (OtelSpanDTO s : Arrays.asList(child, parent)) {
            if (s != null && s.getAttributes() != null) {
                String explicitSort = firstNonBlank(s.getAttributes().get("mavis.message.sort"), s.getAttributes().get("message.sort"));
                if (explicitSort != null) {
                    String upper = explicitSort.trim().toUpperCase(Locale.ROOT);
                    if (Set.of("SYNCH_CALL", "ASYNCH_CALL", "ASYNCH_SIGNAL", "REPLY", "CREATE", "DELETE", "UNKNOWN").contains(upper)) {
                        return upper;
                    }
                }
            }
        }
        // Transport fields (HTTP method/status/URL or messaging.system) do NOT prove UML MessageSort
        return "UNKNOWN";
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) {
            return a;
        }
        if (b != null && !b.isBlank()) {
            return b;
        }
        return null;
    }

    private static String textOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) {
            return null;
        }
        String text = node.get(field).asText();
        return (text == null || text.isBlank() || "null".equalsIgnoreCase(text)) ? null : text;
    }

    private static String nonBlankOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field)) {
            return null;
        }
        String text = node.get(field).asText();
        return (text == null || text.isBlank() || "null".equalsIgnoreCase(text)) ? null : text.trim();
    }

    private static Integer intOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || !node.get(field).isNumber()) {
            return null;
        }
        return node.get(field).asInt();
    }

    private static Long longOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        if (node == null || !node.hasNonNull(field) || !node.get(field).isNumber()) {
            return null;
        }
        return node.get(field).asLong();
    }

    private static UUID uuidOrNull(com.fasterxml.jackson.databind.JsonNode node, String field) {
        String text = textOrNull(node, field);
        if (text == null) {
            return null;
        }
        try {
            return UUID.fromString(text.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static void putStringOrNull(ObjectNode node, String field, String value) {
        if (value != null) {
            node.put(field, value);
        } else {
            node.putNull(field);
        }
    }

    private static void putUuidOrNull(ObjectNode node, String field, UUID value) {
        if (value != null) {
            node.put(field, value.toString());
        } else {
            node.putNull(field);
        }
    }

    private static void putIntOrNull(ObjectNode node, String field, Integer value) {
        if (value != null) {
            node.put(field, value);
        } else {
            node.putNull(field);
        }
    }

    private static void putLongOrNull(ObjectNode node, String field, Long value) {
        if (value != null) {
            node.put(field, value);
        } else {
            node.putNull(field);
        }
    }

    private static class SpanElementResolution {
        final ModelElement element;
        final String status;

        SpanElementResolution(ModelElement element, String status) {
            this.element = element;
            this.status = status;
        }
    }

    private static class CausalCallStep {
        final int order;
        final String messageId;
        final OtelSpanDTO parentSpan;
        final OtelSpanDTO childSpan;
        final List<String> causalParentMessageIds;
        SpanElementResolution callerResolution;
        SpanElementResolution calleeResolution;
        ModelRelationship relationship;
        List<UUID> candidateBaseRelationshipIds = Collections.emptyList();
        Evidence evidence;

        CausalCallStep(int order, String messageId, OtelSpanDTO parentSpan, OtelSpanDTO childSpan, List<String> causalParentMessageIds) {
            this.order = order;
            this.messageId = messageId;
            this.parentSpan = parentSpan;
            this.childSpan = childSpan;
            this.causalParentMessageIds = causalParentMessageIds;
        }
    }
}

