package com.mavis.analyzer.aiexplain.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.aiexplain.dto.*;
import com.mavis.analyzer.runtime.util.SecretRedactor;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import com.mavis.common.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Service
@RequiredArgsConstructor
public class GroundedFindingExplanation {
    private final EvaluationFindingRepository findings;
    private final AiExplanationRepository explanations;
    private final EvidenceRepository evidences;
    private final ObjectMapper mapper;

    public AiExplanationResponseDTO explain(AiExplainRequestDTO request, ModelVersion model, ModelElement element, ModelRelationship relationship) {
        if(request.getFindingId()==null || request.getEvaluationRunId()==null) throw invalid("A specific finding and evaluation run must be selected.");
        var finding=findings.findById(request.getFindingId()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        var run=finding.getEvaluationRun();
        if(run==null || !run.getId().equals(request.getEvaluationRunId()) || !run.getModelVersion().getId().equals(model.getId())) throw invalid("Finding does not belong to the selected evaluation run or model.");
        boolean selected=element!=null && (finding.getElement()!=null && finding.getElement().getId().equals(element.getId()) || contains(finding.getDetails(),"relatedElementIds",element.getId()));
        selected |= relationship!=null && (finding.getRelationship()!=null && finding.getRelationship().getId().equals(relationship.getId()) || contains(finding.getDetails(),"relatedRelationshipIds",relationship.getId()));
        if(!selected) throw invalid("Finding is not related to the currently selected element or relationship.");
        boolean legacy=!Set.of("3e-2","3e-3").contains(Objects.toString(run.getRuleSetVersion(),""));
        Set<String> allowed=new HashSet<>();
        if(!legacy && finding.getDetails()!=null) finding.getDetails().path("supportingEvidenceIds").forEach(id -> allowed.add(id.asText()));
        boolean isVi = "vi".equalsIgnoreCase(request.getLocale());
        var relevant=evidences.findByModelVersionId(model.getId()).stream().filter(e -> allowed.contains(e.getId().toString()) && e.getExcerpt()!=null && !e.getExcerpt().isBlank()).sorted(Comparator.comparing(e -> e.getId().toString())).toList();
        boolean hasHttpCallSite = relevant.stream().anyMatch(e -> ("STATIC_CODE".equals(e.getSourceType()) || "CODE".equals(e.getSourceType()))
                && "CALL_SITE".equals(e.getProvenance() == null ? "" : e.getProvenance().path("communicationRole").asText("")));
        boolean metadataOnly = !legacy && ((finding.getDetails() != null && "UNVERIFIED_METADATA_ONLY".equals(finding.getDetails().path("evidenceSufficiency").asText()))
                || ("RULE-04".equals(finding.getRuleId()) && relationship != null && "SERVICE_HTTP_CALL".equalsIgnoreCase(relationship.getRelationType()) && !relevant.isEmpty() && !hasHttpCallSite));
        var content=mapper.createObjectNode();
        String summary;
        if (isVi) {
            summary = legacy
                ? "Phát hiện này được sinh ra từ phiên bản quy tắc cũ. Hãy chạy lại đánh giá kiến trúc để cập nhật kết quả kiểm tra mới nhất."
                : "RULE-03".equals(finding.getRuleId())
                    ? "Trong mô hình đã phân tích, phần tử này chưa ghi nhận cạnh kết nối nào. Hãy kiểm tra mã nguồn và cấu hình trước khi kết luận Service này hoàn toàn cô lập."
                    : SecretRedactor.redactString(finding.getMessage());
        } else {
            summary = legacy
                ? "This finding was generated under a legacy rule version. Re-run architectural evaluation to obtain updated diagnostics."
                : "RULE-03".equals(finding.getRuleId())
                    ? "In the analyzed model, this element has no recorded connectivity edges. Inspect source code and configuration before concluding the service is truly isolated."
                    : SecretRedactor.redactString(finding.getMessage());
        }
        content.put("summary", summary);

        String whyItMatters;
        if (isVi) {
            whyItMatters = switch(finding.getRuleId()) {
                case "RULE-02" -> "Nhiều Service cùng truy cập chung một Database hoặc Schema có thể làm tăng mức độ gắn kết chặt chẽ (tight coupling), cản trở việc triển khai độc lập và tiến hóa cơ sở dữ liệu. Hãy xác minh ranh giới sở hữu dữ liệu trước khi tái cấu trúc.";
                case "RULE-01" -> "Phụ thuộc vòng giữa các Service có thể khiến thay đổi hoặc sự cố từ một Service lan truyền dây chuyền theo chu trình phụ thuộc.";
                case "RULE-03" -> "Một Service có độ kết nối thấp hoặc cô lập trong mô hình có thể là một worker chạy độc lập hoặc sử dụng cơ chế liên kết động chưa được trích xuất; điều này không đồng nghĩa với việc có lỗi.";
                case "RULE-04" -> "Quan hệ giao tiếp HTTP giữa các dịch vụ chỉ được xem là có bằng chứng đầy đủ khi trích xuất được CALL_SITE thực thi từ mã nguồn (với file/line locator và excerpt hợp lệ). Khai báo interface hoặc cấu hình metadata chỉ mang tính tham chiếu chưa xác minh.";
                default -> "Phát hiện này nêu bật một mẫu kiến trúc trong phạm vi mô hình đã phân tích; hãy kiểm tra bằng chứng trước khi chỉnh sửa mã nguồn.";
            };
        } else {
            whyItMatters = switch(finding.getRuleId()) {
                case "RULE-02" -> "Multiple services accessing a shared database or schema can couple independent deployments and schema evolution. Verify data ownership boundaries before refactoring.";
                case "RULE-01" -> "Cyclic dependencies across services can cause changes or failures in one service to cascade across the dependency cycle.";
                case "RULE-03" -> "A weakly connected or isolated service in the model may represent a standalone worker or unextracted dynamic wiring; it does not automatically indicate a defect.";
                case "RULE-04" -> "Service-to-service HTTP calls require a statically extracted CALL_SITE invocation with a valid file/line locator and excerpt to be grounded. Interface contracts or configuration properties alone remain Unverified metadata-only.";
                default -> "This finding highlights an architectural pattern within the analyzed model scope; verify the supporting evidence before modifying source code.";
            };
        }
        content.put("whyItMatters", whyItMatters);

        var unknowns=content.putArray("unknowns");
        if(legacy) {
            unknowns.add(isVi
                ? "Phát hiện trong lịch sử chưa được kiểm tra lại với phiên bản bộ quy tắc hiện tại."
                : "Historical finding has not been re-verified against the current rule set version.");
        }
        if(finding.getDetails()!=null) finding.getDetails().path("unknowns").forEach(unknowns::add);
        if(metadataOnly && unknowns.isEmpty()) {
            unknowns.add(isVi
                ? "Missing Evidence (Unverified metadata-only): chỉ ghi nhận metadata khai báo/cấu hình client, chưa tìm thấy bằng chứng CALL_SITE hợp lệ."
                : "Missing Evidence (Unverified metadata-only): only client contract or configuration metadata is linked; no verified CALL_SITE invocation evidence was extracted.");
        }
        if(relevant.isEmpty()) {
            unknowns.add(isVi
                ? "Hiện chưa có đoạn trích mã nguồn hoàn chỉnh nào được liên kết với phát hiện này."
                : "No complete source excerpt evidence is currently linked to this finding.");
        }

        var next=content.putArray("nextSteps");
        if(legacy) {
            next.add(isVi
                ? "Hãy chạy lại đánh giá trên phiên bản kiến trúc đang hoạt động; các kết quả lịch sử vẫn được bảo lưu."
                : "Re-run evaluation on the active architecture version; historical results remain preserved.");
        } else if("RULE-02".equals(finding.getRuleId())) {
            if (isVi) {
                next.add("So sánh cấu hình datasource, lược đồ schema và quyền truy cập giữa các Service liên quan.")
                    .add("Xác định rõ quyền sở hữu dữ liệu chung và ý đồ thiết kế trước khi đề xuất phân tách database.");
            } else {
                next.add("Compare datasource configurations, schemas, and access permissions across participating services.")
                    .add("Determine shared data ownership and design intent before proposing database decomposition.");
            }
        } else if("RULE-03".equals(finding.getRuleId())) {
            if (isVi) {
                next.add("Kiểm tra mã nguồn và cấu hình binding của Service để tìm các kênh giao tiếp chưa được trích xuất.")
                    .add("Xác nhận xem Service có chủ đích hoạt động độc lập hay không trước khi thay đổi ranh giới kiến trúc.");
            } else {
                next.add("Inspect service source code and binding configuration for unextracted communication channels.")
                    .add("Confirm whether the service is intentionally standalone before altering architecture boundaries.");
            }
        } else {
            next.add(isVi
                ? "Kiểm tra bằng chứng liên kết và các mối quan hệ lân cận để xác minh phát hiện này trong ngữ cảnh dự án."
                : "Inspect linked evidence and adjacent relationships to verify this finding in project context.");
        }
        content.put("evidenceSufficiency",legacy?"LEGACY_UNVERIFIED":metadataOnly?"UNVERIFIED_METADATA_ONLY":relevant.isEmpty()?"INCOMPLETE":"SOURCE_REFERENCES");
        var refs=content.putArray("evidenceRefs"); relevant.forEach(e -> refs.add(e.getId().toString()));
        var context=mapper.createObjectNode(); context.put("contractVersion","3e/2"); context.put("modelId",model.getId().toString());
        if(model.getSourceSnapshot()!=null)context.put("snapshotId",model.getSourceSnapshot().getId().toString());
        context.put("findingId",finding.getId().toString());context.put("evaluationRunId",run.getId().toString());context.put("ruleSetVersion",run.getRuleSetVersion());context.put("language",isVi ? "vi" : "en");context.put("ruleId",finding.getRuleId());context.put("resultStatus",finding.getStatus());context.put("templateVersion","finding-2");
        context.put("elementId",element==null?"":element.getId().toString());context.put("relationshipId",relationship==null?"":relationship.getId().toString());context.set("structuredContent",content);
        var basis=context.deepCopy();var evidenceBasis=basis.putArray("evidenceContext");relevant.forEach(e -> evidenceBasis.add(mapper.createObjectNode().put("id",e.getId().toString()).put("sourceType",e.getSourceType()).put("locator",e.getLocator()).put("excerpt",e.getExcerpt())));
        String key=digest(basis.toString());
        if(!Boolean.TRUE.equals(request.getForceRefresh()) && (request.getUserQuestion()==null || request.getUserQuestion().isBlank())) {
            var cached=explanations.findFirstByModelVersionIdAndContextKeyOrderByCreatedAtDesc(model.getId(),key);
            if(cached.isPresent())return response(cached.get(),relevant,true);
        }
        var citations=mapper.createArrayNode();relevant.forEach(e -> citations.add(e.getId().toString()));
        var entity=AiExplanation.builder().modelVersion(model).element(element).relationship(relationship).explanationScope("RULE_FINDING")
            .contextKey(key).groundingContext(context).explanationText(content.path("summary").asText()+"\n\n"+content.path("whyItMatters").asText())
            .citedEvidenceIds(citations).secretRedacted(true).aiModelName("deterministic-finding-2").build();
        return response(explanations.save(entity),relevant,false);
    }
    private AiExplanationResponseDTO response(AiExplanation e,List<Evidence> evidence,boolean cached) {
        var c=e.getGroundingContext();
        boolean isVi = "vi".equalsIgnoreCase(c.path("language").asText());
        return AiExplanationResponseDTO.builder().id(e.getId()).modelVersionId(e.getModelVersion().getId()).explanationScope(e.getExplanationScope())
            .elementId(e.getElement()==null?null:e.getElement().getId()).relationshipId(e.getRelationship()==null?null:e.getRelationship().getId())
            .contractVersion("3e/2").findingId(UUID.fromString(c.path("findingId").asText())).evaluationRunId(UUID.fromString(c.path("evaluationRunId").asText()))
            .ruleSetVersion(c.path("ruleSetVersion").asText()).structuredContent(c.path("structuredContent")).groundingContext(c)
            .explanationText(e.getExplanationText()).providerMode("DETERMINISTIC_EVIDENCE_SYNTHESIS").epistemicBadge(isVi ? "Giải thích Quy tắc Dựa trên Bằng chứng" : "Rule-Grounded Explanation (Saved Evidence)")
            .cached(cached).secretRedacted(true).createdAt(e.getCreatedAt()).citedEvidenceIds(evidence.stream().map(Evidence::getId).toList())
            .citedEvidences(evidence.stream().map(v -> EvidenceSummaryDTO.builder().id(v.getId()).sourceType(v.getSourceType()).locator(SecretRedactor.redactString(v.getLocator())).excerpt(SecretRedactor.redactString(v.getExcerpt())).build()).toList()).build();
    }
    private static boolean contains(JsonNode d,String key,UUID id) { if(d!=null)for(var value:d.path(key))if(id.toString().equals(value.asText()))return true;return false; }
    private static BusinessException invalid(String message) {return new BusinessException(ErrorCode.BAD_REQUEST,message);}
    private static String digest(String text) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
