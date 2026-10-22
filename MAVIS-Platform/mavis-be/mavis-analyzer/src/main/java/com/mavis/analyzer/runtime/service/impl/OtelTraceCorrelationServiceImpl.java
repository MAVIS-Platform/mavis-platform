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
        // =========================================================================
        Map<String, OtelSpanDTO> spanByIdMap = new LinkedHashMap<>();
        for (OtelSpanDTO span : rawSpans) {
            if (span.getSpanId() != null && !span.getSpanId().isBlank()) {
                spanByIdMap.put(span.getSpanId(), span);
            }
        }

        List<CausalCallStep> causalSteps = new ArrayList<>();
        int stepIndex = 1;

        for (OtelSpanDTO child : rawSpans) {
            if (child.getParentSpanId() != null && !child.getParentSpanId().isBlank()) {
                OtelSpanDTO parent = spanByIdMap.get(child.getParentSpanId());
                if (parent != null && parent.getServiceName() != null && child.getServiceName() != null) {
                    if (!parent.getServiceName().equalsIgnoreCase(child.getServiceName())) {
                        causalSteps.add(new CausalCallStep(stepIndex++, parent, child));
                    }
                }
            }
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

        // (1) Sao chép toàn bộ elements tĩnh sang version mới
        List<ModelElement> baseElements = modelElementRepository.findByModelVersionId(baseModelVersionId);
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
            serviceNameToElementMap.put(baseEl.getName().toLowerCase(), copy);
        }

        // Kiểm tra xem có service nào trong Span không khớp phần tử tĩnh -> Gắn cờ UNCERTAIN_MAPPING
        boolean hasUncertainMapping = false;
        for (OtelSpanDTO span : rawSpans) {
            String svcName = span.getServiceName();
            if (svcName != null && !svcName.isBlank()) {
                String lowerName = svcName.toLowerCase();
                if (!serviceNameToElementMap.containsKey(lowerName)) {
                    hasUncertainMapping = true;
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
                    serviceNameToElementMap.put(lowerName, uncertainEl);
                }
            }
        }

        // Lưu toàn bộ elements bằng saveAll()
        List<ModelElement> savedElements = modelElementRepository.saveAll(newElements);
        for (int i = 0; i < newElements.size(); i++) {
            ModelElement el = newElements.get(i);
            serviceNameToElementMap.put(el.getName().toLowerCase(), savedElements.get(i));
        }

        // (2) Kế thừa 100% cạnh tĩnh và nâng cấp / thêm mới theo bước gọi nhân quả
        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseModelVersionId);
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

        List<Evidence> newEvidences = new ArrayList<>();

        for (CausalCallStep step : causalSteps) {
            String callerName = step.parentSpan.getServiceName();
            String calleeName = step.childSpan.getServiceName();
            String pairKey = (callerName + "->" + calleeName).toLowerCase();

            ModelRelationship matchedRel = relByPairKey.get(pairKey);
            if (matchedRel != null) {
                // Trùng với cạnh tĩnh -> Nâng cấp originLayer = "STATIC_AND_RUNTIME"
                matchedRel.setOriginLayer("STATIC_AND_RUNTIME");

                Evidence ev = Evidence.builder()
                        .modelVersion(enrichedVersion)
                        .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                        .runtimeSession(session)
                        .relationship(matchedRel)
                        .sourceType("RUNTIME_TRACE")
                        .adapterVersion("OTEL_COLLECTOR_1.0")
                        .locator(step.childSpan.getTraceId() + ":" + step.childSpan.getSpanId())
                        .excerpt("HTTP " + step.childSpan.getHttpMethod() + " " + step.childSpan.getHttpUrl()
                                + " -> " + step.childSpan.getHttpStatusCode() + " (" + step.childSpan.getDurationMs() + "ms)")
                        .build();
                newEvidences.add(ev);
            } else {
                // Chưa có trong tĩnh -> Tạo cạnh mới relationType = "RUNTIME_OBSERVED", originLayer = "RUNTIME"
                ModelElement src = serviceNameToElementMap.get(callerName.toLowerCase());
                ModelElement tgt = serviceNameToElementMap.get(calleeName.toLowerCase());

                if (src != null && tgt != null) {
                    ModelRelationship newRuntimeRel = ModelRelationship.builder()
                            .modelVersion(enrichedVersion)
                            .sourceElement(src)
                            .targetElement(tgt)
                            .relationType("RUNTIME_OBSERVED")
                            .originLayer("RUNTIME")
                            .direction("DIRECTED")
                            .build();

                    newRelationships.add(newRuntimeRel);
                    relByPairKey.put(pairKey, newRuntimeRel);

                    Evidence ev = Evidence.builder()
                            .modelVersion(enrichedVersion)
                            .sourceSnapshot(enrichedVersion.getSourceSnapshot())
                            .runtimeSession(session)
                            .relationship(newRuntimeRel)
                            .sourceType("RUNTIME_TRACE")
                            .adapterVersion("OTEL_COLLECTOR_1.0")
                            .locator(step.childSpan.getTraceId() + ":" + step.childSpan.getSpanId())
                            .excerpt("HTTP " + step.childSpan.getHttpMethod() + " " + step.childSpan.getHttpUrl()
                                    + " -> " + step.childSpan.getHttpStatusCode() + " (" + step.childSpan.getDurationMs() + "ms)")
                            .build();
                    newEvidences.add(ev);
                }
            }
        }

        // Lưu Batch relationships và evidences bằng saveAll()
        modelRelationshipRepository.saveAll(newRelationships);
        evidenceRepository.saveAll(newEvidences);

        // =========================================================================
        // BƯỚC 4: SINH BẢN VẼ DiagramVersion notation = "UML_SEQUENCE", level = "RUNTIME_PROCESS"
        // =========================================================================
        ObjectNode sequenceLayout = objectMapper.createObjectNode();
        sequenceLayout.put("notation", "UML_SEQUENCE");
        sequenceLayout.put("level", "RUNTIME_PROCESS");
        sequenceLayout.put("totalSteps", causalSteps.size());

        ArrayNode stepsArray = objectMapper.createArrayNode();
        for (CausalCallStep step : causalSteps) {
            ObjectNode stepNode = objectMapper.createObjectNode();
            stepNode.put("stepOrder", step.order);
            stepNode.put("callerService", step.parentSpan.getServiceName());
            stepNode.put("calleeService", step.childSpan.getServiceName());
            stepNode.put("operation", step.childSpan.getOperationName() != null ? step.childSpan.getOperationName() : (step.childSpan.getHttpMethod() + " " + step.childSpan.getHttpUrl()));
            stepNode.put("httpMethod", step.childSpan.getHttpMethod());
            stepNode.put("httpStatusCode", step.childSpan.getHttpStatusCode());
            stepNode.put("durationMs", step.childSpan.getDurationMs());
            stepNode.put("traceId", step.childSpan.getTraceId());
            stepNode.put("spanId", step.childSpan.getSpanId());
            stepNode.put("parentSpanId", step.childSpan.getParentSpanId());
            stepsArray.add(stepNode);
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
        session.setCompletedAt(OffsetDateTime.now());
        runtimeSessionRepository.save(session);

        log.info("Hoàn tất đối chiếu nhân quả vết thực thi. Created ModelVersion ID: {}, revision: {}, traceStatus: {}",
                enrichedVersion.getId(), newRevision, session.getTraceStatus());

        return ModelVersionResponseDTO.fromEntity(enrichedVersion);
    }

    @Override
    @Transactional(readOnly = true)
    public SequenceDiagramResponseDTO getSequenceDiagramBySession(UUID sessionId) {
        log.info("Lấy biểu đồ tuần tự UML Sequence cho sessionId: {}", sessionId);

        Optional<ModelVersion> mvOpt = modelVersionRepository.findFirstByRuntimeSessionIdOrderByRevisionDesc(sessionId);
        if (mvOpt.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "Chưa có phiên bản mô hình RUNTIME_ENRICHED cho phiên thực nghiệm: " + sessionId);
        }

        ModelVersion mv = mvOpt.get();
        accessPolicyService.requireProjectReadAccess(mv.getProject());

        List<DiagramVersion> diagrams = diagramVersionRepository.findByModelVersionIdAndNotation(mv.getId(), "UML_SEQUENCE");
        if (diagrams.isEmpty()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "Không tìm thấy sơ đồ UML_SEQUENCE cho modelVersion: " + mv.getId());
        }

        DiagramVersion diagram = diagrams.get(0);
        List<SequenceStepDTO> steps = new ArrayList<>();

        if (diagram.getLayoutJson() != null && diagram.getLayoutJson().has("steps")) {
            for (var node : diagram.getLayoutJson().get("steps")) {
                steps.add(SequenceStepDTO.builder()
                        .stepOrder(node.path("stepOrder").asInt())
                        .callerService(node.path("callerService").asText())
                        .calleeService(node.path("calleeService").asText())
                        .operation(node.path("operation").asText())
                        .httpMethod(node.path("httpMethod").asText())
                        .httpStatusCode(node.path("httpStatusCode").asInt())
                        .durationMs(node.path("durationMs").asLong())
                        .traceId(node.path("traceId").asText())
                        .spanId(node.path("spanId").asText())
                        .parentSpanId(node.path("parentSpanId").asText())
                        .build());
            }
        }

        return SequenceDiagramResponseDTO.builder()
                .diagramId(diagram.getId())
                .modelVersionId(mv.getId())
                .runtimeSessionId(sessionId)
                .notation("UML_SEQUENCE")
                .level("RUNTIME_PROCESS")
                .layoutJson(diagram.getLayoutJson())
                .steps(steps)
                .build();
    }

    private static class CausalCallStep {
        final int order;
        final OtelSpanDTO parentSpan;
        final OtelSpanDTO childSpan;

        CausalCallStep(int order, OtelSpanDTO parentSpan, OtelSpanDTO childSpan) {
            this.order = order;
            this.parentSpan = parentSpan;
            this.childSpan = childSpan;
        }
    }
}
