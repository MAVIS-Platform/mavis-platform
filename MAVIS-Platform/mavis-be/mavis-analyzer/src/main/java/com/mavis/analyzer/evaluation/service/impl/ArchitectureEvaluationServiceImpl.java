package com.mavis.analyzer.evaluation.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.evaluation.dto.EvaluationFindingResponseDTO;
import com.mavis.analyzer.evaluation.dto.EvaluationRunResponseDTO;
import com.mavis.analyzer.evaluation.service.ArchitectureEvaluationService;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ArchitectureEvaluationServiceImpl implements ArchitectureEvaluationService {

    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final EvaluationRunRepository evaluationRunRepository;
    private final EvaluationFindingRepository evaluationFindingRepository;
    private final ObjectMapper objectMapper;
    private final com.mavis.common.security.AccessPolicyService accessPolicy;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public EvaluationRunResponseDTO evaluateModel(UUID modelVersionId, String ruleSetVersion) {
        log.info("Bắt đầu đánh giá 5 quy tắc kiến trúc tự động cho modelVersionId: {}", modelVersionId);

        ModelVersion modelVersion = modelVersionRepository.findById(modelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy phiên bản mô hình với ID: " + modelVersionId));

        accessPolicy.requireProjectReadAccess(modelVersion.getProject());

        // [TỐI ƯU HIỆU NĂNG]: Nạp toàn bộ Elements, Relationships, Evidences lên RAM trong 3 câu query đầu tiên
        // Query 1: Elements
        List<ModelElement> elements = modelElementRepository.findByModelVersionId(modelVersionId);
        // Query 2: Relationships (ModelElements are already in L1 cache from Query 1)
        List<ModelRelationship> relationships = modelRelationshipRepository.findRawByModelVersionId(modelVersionId);
        if (relationships == null || relationships.isEmpty()) {
            relationships = modelRelationshipRepository.findByModelVersionId(modelVersionId);
        }
        // Query 3: Evidences
        List<Evidence> evidences = evidenceRepository.findByModelVersionId(modelVersionId);

        log.debug("Đã nạp lên RAM: {} elements, {} relationships, {} evidences cho modelVersionId: {}",
                elements.size(), relationships.size(), evidences.size(), modelVersionId);

        Map<UUID, ModelElement> elementMap = elements.stream()
                .collect(Collectors.toMap(ModelElement::getId, e -> e, (e1, e2) -> e1));

        List<EvaluationFinding> allFindings = new ArrayList<>();
        Map<String, String> ruleStatusMap = new HashMap<>();

        // =========================================================================
        // RULE-01 (NO_CYCLIC_SERVICE_DEPENDENCY): Thuật toán DFS 3 màu (White-Gray-Black)
        // =========================================================================
        List<EvaluationFinding> rule01Findings = evaluateRule01NoCyclicDependency(elements, relationships, elementMap);
        allFindings.addAll(rule01Findings);
        updateRuleStatus(ruleStatusMap, "RULE-01", rule01Findings);

        // =========================================================================
        // RULE-02 (NO_SHARED_DATABASE_ANTI_PATTERN): Nút DATABASE bị >= 2 SERVICE_CONTAINER truy cập
        // =========================================================================
        List<EvaluationFinding> rule02Findings = SharedDatabaseRule.evaluate(elements, relationships, objectMapper);
        allFindings.addAll(rule02Findings);
        updateRuleStatus(ruleStatusMap, "RULE-02", rule02Findings);

        // =========================================================================
        // RULE-03 (ISOLATED_SERVICE_WARNING): SERVICE_CONTAINER có bậc vào = 0 và bậc ra = 0
        // =========================================================================
        List<EvaluationFinding> rule03Findings = evaluateRule03IsolatedServices(elements, relationships, elementMap);
        allFindings.addAll(rule03Findings);
        updateRuleStatus(ruleStatusMap, "RULE-03", rule03Findings);

        // =========================================================================
        // RULE-04 (EVIDENCE_GROUNDING_CHECK): Cạnh SERVICE_HTTP_CALL và DATABASE_ACCESS có Evidence
        // =========================================================================
        List<EvaluationFinding> rule04Findings = evaluateRule04EvidenceGrounding(relationships, evidences, elementMap);
        allFindings.addAll(rule04Findings);
        updateRuleStatus(ruleStatusMap, "RULE-04", rule04Findings);

        // =========================================================================
        // RULE-05 (UNCERTAIN_MAPPING_CHECK): Phần tử ở trạng thái UNCERTAIN_MAPPING
        // =========================================================================
        List<EvaluationFinding> rule05Findings = evaluateRule05UncertainMapping(elements);
        allFindings.addAll(rule05Findings);
        updateRuleStatus(ruleStatusMap, "RULE-05", rule05Findings);

        // =========================================================================
        // TÍNH ĐIỂM COMPLIANCE SCORE (0..100) VÀ TỔNG HỢP SUMMARY METRICS
        // =========================================================================
        for (EvaluationFinding finding : allFindings) {

            ObjectNode details = finding.getDetails() instanceof ObjectNode d ? d : objectMapper.createObjectNode();
            details.put("contractVersion", "3e/2");
            details.put("ruleSetVersion", "3e-3");
            if (!details.has("applicability")) details.put("applicability", finding.getElement()==null && finding.getRelationship()==null ? "MODEL_SCOPE" : "APPLICABLE");
            var nodeIds = new HashSet<String>();
            if (finding.getElement()!=null) nodeIds.add(finding.getElement().getId().toString());
            details.path("relatedElementIds").forEach(n -> nodeIds.add(n.asText()));
            var relationIds = new HashSet<String>();
            if (finding.getRelationship()!=null) relationIds.add(finding.getRelationship().getId().toString());
            details.path("relatedRelationshipIds").forEach(n -> relationIds.add(n.asText()));
            var evidenceIds = details.putArray("supportingEvidenceIds");
            evidences.stream().filter(e -> e.getExcerpt()!=null && !e.getExcerpt().isBlank())
                .filter(e -> e.getElement()!=null && nodeIds.contains(e.getElement().getId().toString()) || e.getRelationship()!=null && relationIds.contains(e.getRelationship().getId().toString()))
                .map(Evidence::getId).filter(Objects::nonNull).distinct().sorted().forEach(id -> evidenceIds.add(id.toString()));
            if (evidenceIds.isEmpty()) {
                details.put("evidenceSufficiency","INCOMPLETE");
                if("RULE-02".equals(finding.getRuleId()) && ("PASS".equals(finding.getStatus()) || "VIOLATION".equals(finding.getStatus()))) {
                    finding.setStatus("NEEDS_REVIEW"); finding.setSeverity("INFO");
                    finding.setMessage("Mô hình có ánh xạ logical datastore nhưng chưa có đoạn bằng chứng gắn với truy cập. Cần đối chiếu source và datasource trước khi kết luận.");
                }
            } else if(!details.has("evidenceSufficiency")) details.put("evidenceSufficiency","SOURCE_REFERENCES");
            finding.setDetails(details);
        }

        updateRuleStatus(ruleStatusMap,"RULE-02",rule02Findings);
        double score = 100.0;
        int passedCount = 0;
        int violationCount = 0;
        int needsReviewCount = 0;

        for (EvaluationFinding f : allFindings) {
            if ("PASS".equalsIgnoreCase(f.getStatus())) {
                passedCount++;
            } else if ("VIOLATION".equalsIgnoreCase(f.getStatus())) {
                violationCount++;
                if ("ERROR".equalsIgnoreCase(f.getSeverity())) {
                    score -= 20.0;
                } else if ("WARNING".equalsIgnoreCase(f.getSeverity())) {
                    score -= 10.0;
                } else {
                    score -= 5.0;
                }
            } else if ("NEEDS_REVIEW".equalsIgnoreCase(f.getStatus())) {
                needsReviewCount++;
                score -= 5.0;
            }
        }
        score = Math.max(0.0, Math.min(100.0, score));
        double complianceScore = Math.round(score * 100.0) / 100.0;

        ObjectNode metricsNode = objectMapper.createObjectNode();
        metricsNode.put("complianceScore", complianceScore);
        metricsNode.put("passedCount", passedCount);
        metricsNode.put("violationCount", violationCount);
        metricsNode.put("needsReviewCount", needsReviewCount);
        metricsNode.put("totalRulesEvaluated", 5);
        metricsNode.put("totalFindings", allFindings.size());

        ObjectNode ruleSummary = objectMapper.createObjectNode();
        for (int i = 1; i <= 5; i++) {
            String ruleCode = "RULE-0" + i;
            ruleSummary.put(ruleCode, ruleStatusMap.getOrDefault(ruleCode, "PASS"));
        }
        metricsNode.set("ruleSummary", ruleSummary);

        // Lưu EvaluationRun
        EvaluationRun evaluationRun = EvaluationRun.builder()
                .modelVersion(modelVersion)
                .ruleSetVersion("3e-3")
                .summaryMetrics(metricsNode)
                .build();
        EvaluationRun savedRun = evaluationRunRepository.save(evaluationRun);

        // Gán EvaluationRun cho toàn bộ findings
        for(EvaluationFinding finding:allFindings) finding.setEvaluationRun(savedRun);

        // [TỐI ƯU HIỆU NĂNG]: Lưu toàn bộ EvaluationFinding bằng 1 lệnh saveAll() duy nhất
        List<EvaluationFinding> savedFindings = evaluationFindingRepository.saveAll(allFindings);

        log.info("Hoàn tất đánh giá kiến trúc cho modelVersionId: {}. Score: {}, Findings: {}",
                modelVersionId, complianceScore, savedFindings.size());

        return EvaluationRunResponseDTO.fromEntity(savedRun, savedFindings);
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvaluationRunResponseDTO> getEvaluationsByModelVersion(UUID modelVersionId) {
        var model = modelVersionRepository.findById(modelVersionId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(model.getProject());
        List<EvaluationRun> runs = evaluationRunRepository.findByModelVersionIdOrderByCreatedAtDesc(modelVersionId);
        return runs.stream()
                .map(EvaluationRunResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<EvaluationFindingResponseDTO> getFindingsByEvaluationRunId(UUID evaluationRunId) {
        var run = evaluationRunRepository.findById(evaluationRunId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        accessPolicy.requireProjectReadAccess(run.getModelVersion().getProject());
        List<EvaluationFinding> findings = evaluationFindingRepository.findByEvaluationRunId(evaluationRunId);
        return findings.stream()
                .map(EvaluationFindingResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public EvaluationRunResponseDTO getEvaluationRunById(UUID evaluationRunId) {
        EvaluationRun run = evaluationRunRepository.findById(evaluationRunId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy lượt đánh giá với ID: " + evaluationRunId));
        List<EvaluationFinding> findings = evaluationFindingRepository.findByEvaluationRunId(evaluationRunId);
        accessPolicy.requireProjectReadAccess(run.getModelVersion().getProject());
        return EvaluationRunResponseDTO.fromEntity(run, findings);
    }

    // =========================================================================
    // 5 THUẬT TOÁN ĐÁNH GIÁ QUY TẮC KIẾN TRÚC HOÀN TOÀN TRÊN RAM
    // =========================================================================

    /**
     * RULE-01 (NO_CYCLIC_SERVICE_DEPENDENCY): Thuật toán DFS 3 màu (White=0, Gray=1, Black=2)
     * Phát hiện chu trình phụ thuộc giữa các SERVICE_CONTAINER.
     */
    private List<EvaluationFinding> evaluateRule01NoCyclicDependency(List<ModelElement> elements,
                                                                   List<ModelRelationship> relationships,
                                                                   Map<UUID, ModelElement> elementMap) {
        List<EvaluationFinding> findings = new ArrayList<>();

        List<ModelElement> serviceContainers = elements.stream()
                .filter(e -> "SERVICE_CONTAINER".equalsIgnoreCase(e.getElementType()))
                .collect(Collectors.toList());

        if (serviceContainers.isEmpty()) {
            findings.add(EvaluationFinding.builder()
                    .ruleId("RULE-01")
                    .severity("INFO")
                    .status("PASS")
                    .message("Không phát hiện chu trình phụ thuộc vòng lặp giữa các SERVICE_CONTAINER (Không có service container nào).")
                    .build());
            return findings;
        }

        // Xây dựng đồ thị có hướng giữa các SERVICE_CONTAINER
        Map<UUID, List<ServiceDependencyEdge>> adj = new HashMap<>();
        for (ModelElement sc : serviceContainers) {
            adj.put(sc.getId(), new ArrayList<>());
        }

        for (ModelRelationship rel : relationships) {
            UUID srcId = getServiceContainerId(rel.getSourceElement(), elementMap);
            UUID dstId = getServiceContainerId(rel.getTargetElement(), elementMap);
            if (srcId != null && dstId != null && !srcId.equals(dstId) && adj.containsKey(srcId) && adj.containsKey(dstId)) {
                adj.get(srcId).add(new ServiceDependencyEdge(dstId, rel));
            }
        }

        // DFS 3 màu: 0=WHITE (chưa duyệt), 1=GRAY (đang duyệt trên stack), 2=BLACK (đã hoàn tất)
        Map<UUID, Integer> color = new HashMap<>();
        for (ModelElement sc : serviceContainers) {
            color.put(sc.getId(), 0);
        }

        List<List<UUID>> detectedCycles = new ArrayList<>();
        List<ModelRelationship> cycleBackEdges = new ArrayList<>();
        List<UUID> currentPath = new ArrayList<>();
        Set<String> visitedBackEdges = new HashSet<>();

        for (ModelElement sc : serviceContainers) {
            if (color.get(sc.getId()) == 0) {
                dfsCycleDetection(sc.getId(), color, adj, currentPath, detectedCycles, cycleBackEdges, visitedBackEdges);
            }
        }

        if (!detectedCycles.isEmpty()) {
            for (int i = 0; i < detectedCycles.size(); i++) {
                List<UUID> cycle = detectedCycles.get(i);
                ModelRelationship backEdgeRel = (i < cycleBackEdges.size()) ? cycleBackEdges.get(i) : null;
                String cyclePathStr = cycle.stream()
                        .map(id -> elementMap.containsKey(id) ? elementMap.get(id).getName() : id.toString())
                        .collect(Collectors.joining(" -> "));

                ModelElement headElement = elementMap.get(cycle.get(0));
                findings.add(EvaluationFinding.builder()
                        .ruleId("RULE-01")
                        .severity("ERROR")
                        .status("VIOLATION")
                        .element(headElement)
                        .relationship(backEdgeRel)
                        .message("Phát hiện chu trình phụ thuộc vòng lặp giữa các dịch vụ (Cyclic Service Dependency): " + cyclePathStr)
                        .build());
            }
        } else {
            findings.add(EvaluationFinding.builder()
                    .ruleId("RULE-01")
                    .severity("INFO")
                    .status("PASS")
                    .message("Không phát hiện chu trình phụ thuộc vòng lặp giữa các SERVICE_CONTAINER.")
                    .build());
        }

        return findings;
    }

    private void dfsCycleDetection(UUID u,
                                   Map<UUID, Integer> color,
                                   Map<UUID, List<ServiceDependencyEdge>> adj,
                                   List<UUID> currentPath,
                                   List<List<UUID>> detectedCycles,
                                   List<ModelRelationship> cycleBackEdges,
                                   Set<String> visitedBackEdges) {
        color.put(u, 1); // GRAY
        currentPath.add(u);

        for (ServiceDependencyEdge edge : adj.getOrDefault(u, Collections.emptyList())) {
            UUID v = edge.targetServiceId;
            int vColor = color.getOrDefault(v, 0);

            if (vColor == 1) {
                // Cạnh ngược (Back-edge) tới đỉnh màu GRAY -> Phát hiện chu trình!
                String edgeKey = u + "->" + v;
                if (!visitedBackEdges.contains(edgeKey)) {
                    visitedBackEdges.add(edgeKey);
                    int startIndex = currentPath.indexOf(v);
                    if (startIndex >= 0) {
                        List<UUID> cycle = new ArrayList<>(currentPath.subList(startIndex, currentPath.size()));
                        cycle.add(v);
                        detectedCycles.add(cycle);
                        cycleBackEdges.add(edge.relationship);
                    }
                }
            } else if (vColor == 0) {
                dfsCycleDetection(v, color, adj, currentPath, detectedCycles, cycleBackEdges, visitedBackEdges);
            }
        }

        currentPath.remove(currentPath.size() - 1);
        color.put(u, 2); // BLACK
    }

    /**
     * RULE-02 (NO_SHARED_DATABASE_ANTI_PATTERN):
     * Kiểm tra có nút DATABASE nào bị >= 2 SERVICE_CONTAINER khác nhau cùng truy cập (DATABASE_ACCESS) không.
     */
    private List<EvaluationFinding> evaluateRule03IsolatedServices(List<ModelElement> elements,
                                                                 List<ModelRelationship> relationships,
                                                                 Map<UUID, ModelElement> elementMap) {
        List<EvaluationFinding> findings = new ArrayList<>();

        List<ModelElement> serviceContainers = elements.stream()
                .filter(e -> "SERVICE_CONTAINER".equalsIgnoreCase(e.getElementType()))
                .collect(Collectors.toList());

        Map<UUID, Integer> inDegrees = new HashMap<>();
        Map<UUID, Integer> outDegrees = new HashMap<>();

        for (ModelElement sc : serviceContainers) {
            inDegrees.put(sc.getId(), 0);
            outDegrees.put(sc.getId(), 0);
        }

        for (ModelRelationship rel : relationships) {
            UUID srcServiceId = getServiceContainerId(rel.getSourceElement(), elementMap);
            UUID dstServiceId = getServiceContainerId(rel.getTargetElement(), elementMap);

            // Bậc ra: nguồn là srcServiceId
            if (srcServiceId != null && outDegrees.containsKey(srcServiceId)) {
                if (dstServiceId == null || !srcServiceId.equals(dstServiceId)) {
                    outDegrees.put(srcServiceId, outDegrees.get(srcServiceId) + 1);
                }
            }

            // Bậc vào: đích là dstServiceId
            if (dstServiceId != null && inDegrees.containsKey(dstServiceId)) {
                if (srcServiceId == null || !dstServiceId.equals(srcServiceId)) {
                    inDegrees.put(dstServiceId, inDegrees.get(dstServiceId) + 1);
                }
            }
        }

        boolean hasIsolated = false;
        for (ModelElement sc : serviceContainers) {
            int in = inDegrees.getOrDefault(sc.getId(), 0);
            int out = outDegrees.getOrDefault(sc.getId(), 0);

            if (in == 0 && out == 0) {
                hasIsolated = true;
                findings.add(EvaluationFinding.builder()
                        .ruleId("RULE-03")
                        .severity("INFO")
                        .status("NEEDS_REVIEW")
                        .element(sc)
                        .message("Dịch vụ '" + sc.getName() + "' bị cô lập trong kiến trúc (bậc vào = 0, bậc ra = 0), không có bất kỳ kết nối hay phụ thuộc nào với các dịch vụ khác.")
                        .build());
            }
        }

        if (!hasIsolated) {
            findings.add(EvaluationFinding.builder()
                    .ruleId("RULE-03")
                    .severity("INFO")
                    .status("PASS")
                    .message("Tất cả các dịch vụ SERVICE_CONTAINER đều có liên kết giao tiếp trong kiến trúc (không có dịch vụ bị cô lập).")
                    .build());
        }

        return findings;
    }

    /**
     * RULE-04 (EVIDENCE_GROUNDING_CHECK):
     * Kiểm tra mọi cạnh SERVICE_HTTP_CALL và DATABASE_ACCESS có ít nhất 1 Evidence đính kèm không.
     */
    private List<EvaluationFinding> evaluateRule04EvidenceGrounding(List<ModelRelationship> relationships,
                                                                   List<Evidence> evidences,
                                                                   Map<UUID, ModelElement> elementMap) {
        List<EvaluationFinding> findings = new ArrayList<>();

        Set<UUID> relIdsWithEvidence = evidences.stream()
                .filter(ArchitectureEvaluationServiceImpl::isGroundedRelationshipEvidence)
                .map(ev -> ev.getRelationship().getId())
                .collect(Collectors.toSet());

        List<ModelRelationship> groundedCandidates = relationships.stream()
                .filter(rel -> "SERVICE_HTTP_CALL".equalsIgnoreCase(rel.getRelationType())
                        || "DATABASE_ACCESS".equalsIgnoreCase(rel.getRelationType()))
                .collect(Collectors.toList());

        boolean hasMissingEvidence = false;
        for (ModelRelationship rel : groundedCandidates) {
            if (!relIdsWithEvidence.contains(rel.getId())) {
                hasMissingEvidence = true;
                ModelElement src = elementMap.getOrDefault(rel.getSourceElement().getId(), rel.getSourceElement());
                ModelElement tgt = elementMap.getOrDefault(rel.getTargetElement().getId(), rel.getTargetElement());

                findings.add(EvaluationFinding.builder()
                        .ruleId("RULE-04")
                        .severity("WARNING")
                        .status("VIOLATION")
                        .element(src)
                        .relationship(rel)
                        .message("Quan hệ '" + rel.getRelationType() + "' từ '" + src.getName()
                                + "' tới '" + tgt.getName() + "' thiếu bằng chứng trích xuất mã nguồn (Missing Evidence Grounding).")
                        .build());
            }
        }

        if (!hasMissingEvidence) {
            findings.add(EvaluationFinding.builder()
                    .ruleId("RULE-04")
                    .severity("INFO")
                    .status("PASS")
                    .message("Tất cả các cạnh SERVICE_HTTP_CALL và DATABASE_ACCESS đều có bằng chứng trích xuất hợp lệ từ mã nguồn.")
                    .build());
        }

        return findings;
    }

    private static boolean isGroundedRelationshipEvidence(Evidence evidence) {
        var relationship = evidence.getRelationship();
        if (relationship == null || evidence.getExcerpt() == null || evidence.getExcerpt().isBlank()
                || evidence.getLocator() == null || !evidence.getLocator().matches(".+:[1-9]\\d*")) return false;
        String type = evidence.getSourceType();
        boolean code = "STATIC_CODE".equals(type) || "CODE".equals(type);
        if ("SERVICE_HTTP_CALL".equalsIgnoreCase(relationship.getRelationType())) {
            String role = evidence.getProvenance() == null ? "" : evidence.getProvenance().path("communicationRole").asText();
            return code && (role.isEmpty() || "CALL_SITE".equals(role));
        }
        return code || "CONFIG_FILE".equals(type) || "CONFIG".equals(type);
    }

    /**
     * RULE-05 (UNCERTAIN_MAPPING_CHECK):
     * Kiểm tra có phần tử nào đang ở trạng thái UNCERTAIN_MAPPING cần người học xác nhận không.
     */
    private List<EvaluationFinding> evaluateRule05UncertainMapping(List<ModelElement> elements) {
        List<EvaluationFinding> findings = new ArrayList<>();

        boolean hasUncertain = false;
        for (ModelElement el : elements) {
            if (isUncertainMapping(el)) {
                hasUncertain = true;
                findings.add(EvaluationFinding.builder()
                        .ruleId("RULE-05")
                        .severity("INFO")
                        .status("NEEDS_REVIEW")
                        .element(el)
                        .message("Phần tử '" + el.getName() + "' (loại " + el.getElementType()
                                + ") đang ở trạng thái UNCERTAIN_MAPPING cần sinh viên/giảng viên xem xét và xác nhận ánh xạ kiến trúc.")
                        .build());
            }
        }

        if (!hasUncertain) {
            findings.add(EvaluationFinding.builder()
                    .ruleId("RULE-05")
                    .severity("INFO")
                    .status("PASS")
                    .message("Không có phần tử nào đang ở trạng thái UNCERTAIN_MAPPING cần xác nhận.")
                    .build());
        }

        return findings;
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================

    private UUID getServiceContainerId(ModelElement element, Map<UUID, ModelElement> elementMap) {
        if (element == null) return null;
        ModelElement resolved = elementMap.getOrDefault(element.getId(), element);
        if ("SERVICE_CONTAINER".equalsIgnoreCase(resolved.getElementType())) {
            return resolved.getId();
        }
        if (resolved.getParentElement() != null) {
            UUID parentId = resolved.getParentElement().getId();
            ModelElement parent = elementMap.get(parentId);
            if (parent != null && "SERVICE_CONTAINER".equalsIgnoreCase(parent.getElementType())) {
                return parent.getId();
            }
        }
        return null;
    }

    private UUID getDatabaseId(ModelElement element, Map<UUID, ModelElement> elementMap) {
        if (element == null) return null;
        ModelElement resolved = elementMap.getOrDefault(element.getId(), element);
        if ("DATABASE".equalsIgnoreCase(resolved.getElementType())) {
            return resolved.getId();
        }
        if (resolved.getParentElement() != null) {
            UUID parentId = resolved.getParentElement().getId();
            ModelElement parent = elementMap.get(parentId);
            if (parent != null && "DATABASE".equalsIgnoreCase(parent.getElementType())) {
                return parent.getId();
            }
        }
        return null;
    }

    private boolean isUncertainMapping(ModelElement element) {
        if (element == null) return false;
        if ("UNCERTAIN_MAPPING".equalsIgnoreCase(element.getStatus())) {
            return true;
        }
        if (element.getProperties() != null) {
            if ("UNCERTAIN_MAPPING".equalsIgnoreCase(element.getProperties().path("status").asText(""))) {
                return true;
            }
            if (element.getProperties().path("uncertainMapping").asBoolean(false)) {
                return true;
            }
        }
        return false;
    }

    private void updateRuleStatus(Map<String, String> statusMap, String ruleCode, List<EvaluationFinding> findings) {
        boolean hasViolation = findings.stream().anyMatch(f -> "VIOLATION".equalsIgnoreCase(f.getStatus()));
        boolean hasReview = findings.stream().anyMatch(f -> "NEEDS_REVIEW".equalsIgnoreCase(f.getStatus()));

        if (hasViolation) {
            statusMap.put(ruleCode, "VIOLATION");
        } else if (hasReview) {
            statusMap.put(ruleCode, "NEEDS_REVIEW");
        } else if(findings.stream().allMatch(f -> "NOT_APPLICABLE".equals(f.getStatus()))) {
            statusMap.put(ruleCode, "NOT_APPLICABLE");
        } else {
            statusMap.put(ruleCode, "PASS");
        }
    }

    private static class ServiceDependencyEdge {
        private final UUID targetServiceId;
        private final ModelRelationship relationship;

        public ServiceDependencyEdge(UUID targetServiceId, ModelRelationship relationship) {
            this.targetServiceId = targetServiceId;
            this.relationship = relationship;
        }
    }
}
