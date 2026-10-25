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
        if(request.getFindingId()==null || request.getEvaluationRunId()==null) throw invalid("Cần chọn finding và lần đánh giá cụ thể.");
        var finding=findings.findById(request.getFindingId()).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        var run=finding.getEvaluationRun();
        if(run==null || !run.getId().equals(request.getEvaluationRunId()) || !run.getModelVersion().getId().equals(model.getId())) throw invalid("Finding không thuộc lần đánh giá/model đang chọn.");
        boolean selected=element!=null && (finding.getElement()!=null && finding.getElement().getId().equals(element.getId()) || contains(finding.getDetails(),"relatedElementIds",element.getId()));
        selected |= relationship!=null && (finding.getRelationship()!=null && finding.getRelationship().getId().equals(relationship.getId()) || contains(finding.getDetails(),"relatedRelationshipIds",relationship.getId()));
        if(!selected) throw invalid("Finding không liên quan đối tượng đang chọn.");
        boolean legacy=!"3e-2".equals(run.getRuleSetVersion());
        Set<String> allowed=new HashSet<>();
        if(!legacy && finding.getDetails()!=null) finding.getDetails().path("supportingEvidenceIds").forEach(id -> allowed.add(id.asText()));
        var relevant=evidences.findByModelVersionId(model.getId()).stream().filter(e -> allowed.contains(e.getId().toString()) && e.getExcerpt()!=null && !e.getExcerpt().isBlank()).sorted(Comparator.comparing(e -> e.getId().toString())).toList();
        var content=mapper.createObjectNode();
        content.put("summary", legacy ? "Nhận xét này dùng phiên bản rule cũ. Kiểm tra lại kiến trúc để có kết luận theo cơ chế mới." : "RULE-03".equals(finding.getRuleId()) ? "Trong mô hình đã phân tích, phần tử này không có quan hệ kết nối được ghi nhận. Cần kiểm tra source và cấu hình trước khi kết luận service thực sự độc lập." : SecretRedactor.redactString(finding.getMessage()));
        content.put("whyItMatters", switch(finding.getRuleId()) {
            case "RULE-02" -> "Nhiều service truy cập cùng dữ liệu có thể làm việc thay đổi hoặc triển khai từng service phụ thuộc lẫn nhau. Cần đối chiếu ranh giới dữ liệu trước khi quyết định thay đổi thiết kế.";
            case "RULE-01" -> "Vòng phụ thuộc có thể làm thay đổi ở một service ảnh hưởng dây chuyền tới các service còn lại.";
            case "RULE-03" -> "Service ít kết nối trong mô hình có thể là thành phần độc lập hoặc phần phân tích còn thiếu; không tự chứng minh service bị lỗi.";
            default -> "Nhận xét hỗ trợ kiểm tra kiến trúc trong phạm vi dữ liệu đã phân tích; hãy đối chiếu căn cứ trước khi thay đổi source.";
        });
        var unknowns=content.putArray("unknowns");
        if(legacy) unknowns.add("Chưa xác minh lại nhận xét lịch sử bằng phiên bản rule hiện tại.");
        if(finding.getDetails()!=null) finding.getDetails().path("unknowns").forEach(unknowns::add);
        if(relevant.isEmpty()) unknowns.add("Chưa có đoạn bằng chứng đầy đủ gắn với nhận xét này.");
        var next=content.putArray("nextSteps");
        if(legacy) next.add("Chạy lại kiểm tra trên bản kiến trúc đang xem; kết quả lịch sử được giữ nguyên.");
        else if("RULE-02".equals(finding.getRuleId())) next.add("Đối chiếu datasource, database/schema và quyền truy cập của các service liên quan.").add("Xác định phạm vi dữ liệu dùng chung và chủ ý thiết kế trước khi đề xuất tách database.");
        else if("RULE-03".equals(finding.getRuleId())) next.add("Đối chiếu source và cấu hình kết nối của service để tìm phần phân tích còn thiếu.").add("Xác minh service có chủ ý hoạt động độc lập trước khi thay đổi kiến trúc.");
        else next.add("Mở bằng chứng và các quan hệ liên quan để xác minh nhận xét trong ngữ cảnh dự án.");
        content.put("evidenceSufficiency",legacy?"LEGACY_UNVERIFIED":relevant.isEmpty()?"INCOMPLETE":"SOURCE_REFERENCES");
        var refs=content.putArray("evidenceRefs"); relevant.forEach(e -> refs.add(e.getId().toString()));
        var context=mapper.createObjectNode(); context.put("contractVersion","3e/2"); context.put("modelId",model.getId().toString());
        if(model.getSourceSnapshot()!=null)context.put("snapshotId",model.getSourceSnapshot().getId().toString());
        context.put("findingId",finding.getId().toString());context.put("evaluationRunId",run.getId().toString());context.put("ruleSetVersion",run.getRuleSetVersion());context.put("language","vi");context.put("ruleId",finding.getRuleId());context.put("resultStatus",finding.getStatus());context.put("templateVersion","finding-2");
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
        return AiExplanationResponseDTO.builder().id(e.getId()).modelVersionId(e.getModelVersion().getId()).explanationScope(e.getExplanationScope())
            .elementId(e.getElement()==null?null:e.getElement().getId()).relationshipId(e.getRelationship()==null?null:e.getRelationship().getId())
            .contractVersion("3e/2").findingId(UUID.fromString(c.path("findingId").asText())).evaluationRunId(UUID.fromString(c.path("evaluationRunId").asText()))
            .ruleSetVersion(c.path("ruleSetVersion").asText()).structuredContent(c.path("structuredContent")).groundingContext(c)
            .explanationText(e.getExplanationText()).providerMode("DETERMINISTIC_EVIDENCE_SYNTHESIS").epistemicBadge("Giải thích theo rule và căn cứ đã lưu")
            .cached(cached).secretRedacted(true).createdAt(e.getCreatedAt()).citedEvidenceIds(evidence.stream().map(Evidence::getId).toList())
            .citedEvidences(evidence.stream().map(v -> EvidenceSummaryDTO.builder().id(v.getId()).sourceType(v.getSourceType()).locator(SecretRedactor.redactString(v.getLocator())).excerpt(SecretRedactor.redactString(v.getExcerpt())).build()).toList()).build();
    }
    private static boolean contains(JsonNode d,String key,UUID id) { if(d!=null)for(var value:d.path(key))if(id.toString().equals(value.asText()))return true;return false; }
    private static BusinessException invalid(String message) {return new BusinessException(ErrorCode.BAD_REQUEST,message);}
    private static String digest(String text) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
}
