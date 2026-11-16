package com.mavis.analyzer.evaluation.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.*;
import java.util.*;
import java.util.stream.Collectors;

/** Conservative logical-datastore rule. Startup edges and physical host identity are not data access. */
final class SharedDatabaseRule {
    private SharedDatabaseRule() {}
    static List<EvaluationFinding> evaluate(List<ModelElement> elements, List<ModelRelationship> relationships, ObjectMapper mapper) {
        Map<UUID, ModelElement> byId = elements.stream().collect(Collectors.toMap(ModelElement::getId, e -> e, (a,b) -> a));
        Map<String, List<ModelRelationship>> groups = new TreeMap<>();
        List<EvaluationFinding> findings = new ArrayList<>();
        Map<UUID,EvaluationFinding> unresolved = new LinkedHashMap<>();
        for (ModelRelationship rel : relationships) {
            if (!"DATABASE_ACCESS".equals(rel.getRelationType()) || "DEPLOYMENT".equals(rel.getOriginLayer())) continue;
            ModelElement db = rel.getTargetElement();
            if (db == null || !"DATABASE".equals(db.getElementType())) continue;
            ModelElement service = owner(rel.getSourceElement(), byId);
            JsonNode p = db.getProperties();
            String host = text(p,"physicalHost"), database = text(p,"database");
            boolean logical = "LOGICAL_DATASTORE".equals(text(p,"resourceRole")) && !host.isBlank() && !database.isBlank();
            if (!logical || service == null) {
                var f = unresolved.get(db.getId());
                if(f==null) { f = EvaluationFinding.builder().ruleId("RULE-02").severity("INFO").status("NEEDS_REVIEW").element(db).relationship(rel)
                    .message("Cần xác minh database/schema và service sở hữu trước khi đánh giá việc dùng chung dữ liệu.").build();
                var d=mapper.createObjectNode(); d.put("applicability","UNRESOLVED"); d.put("evidenceSufficiency","INCOMPLETE");
                d.putArray("unknowns").add("Chưa phân giải đầy đủ logical datastore hoặc service sở hữu; cùng host chưa chứng minh dùng chung dữ liệu.");
                f.setDetails(d); unresolved.put(db.getId(),f); }
                var d=(com.fasterxml.jackson.databind.node.ObjectNode) f.getDetails();
                appendId(d,"relatedElementIds",db.getId());
                if(service!=null)appendId(d,"relatedElementIds",service.getId());
                appendId(d,"relatedRelationshipIds",rel.getId());
                continue;
            }
            // Identifier spelling is significant for some engines; do not lower-case database/schema names.
            String key = db.getLanguageStack()+"|"+host.toLowerCase(Locale.ROOT)+"|"+text(p,"port")+"|"+database+"|"+text(p,"schema");
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(rel);
        }
        findings.addAll(unresolved.values());
        for (var entry : groups.entrySet()) {
            var rels=entry.getValue(); var services=new TreeMap<String,ModelElement>();
            rels.forEach(r -> { var service=owner(r.getSourceElement(),byId); services.put(service.getId().toString(),service); });
            var db=rels.get(0).getTargetElement();
            var f=EvaluationFinding.builder().ruleId("RULE-02").element(db).relationship(rels.get(0))
                .severity(services.size()>1?"WARNING":"INFO").status(services.size()>1?"VIOLATION":"PASS")
                .message(services.size()>1 ? "Mô hình khai báo "+services.size()+" service truy cập cùng logical datastore '"+text(db.getProperties(),"database")+"'. Cần xem xét ranh giới dữ liệu; chưa chứng minh truy cập cùng bảng hay cùng thời điểm."
                    : "Các quan hệ truy cập đã phân giải của logical datastore này thuộc một service. Kết quả chỉ áp dụng cho dữ liệu đã phân tích.").build();
            var details=mapper.createObjectNode(); details.put("applicability","APPLICABLE"); details.put("evidenceSufficiency","DECLARED_MODEL");
            details.put("datastoreIdentity",entry.getKey()); details.putArray("unknowns").add("Chưa xác định phạm vi bảng, quyền truy cập hoặc thời điểm thực thi.");
            var nodes=details.putArray("relatedElementIds"); services.values().forEach(s -> nodes.add(s.getId().toString()));
            rels.stream().map(r -> r.getTargetElement().getId()).distinct().sorted().forEach(id -> nodes.add(id.toString()));
            var edges=details.putArray("relatedRelationshipIds"); rels.stream().map(ModelRelationship::getId).filter(Objects::nonNull).distinct().sorted().forEach(id -> edges.add(id.toString()));
            f.setDetails(details); findings.add(f);
        }
        if (findings.isEmpty()) findings.add(EvaluationFinding.builder().ruleId("RULE-02").severity("INFO").status("NOT_APPLICABLE")
            .message("Không có quan hệ truy cập logical datastore đã phân giải để áp dụng rule này. Startup dependency không được tính là truy cập dữ liệu.").build());
        return findings;
    }
    static ModelElement owner(ModelElement node, Map<UUID,ModelElement> elements) {
        Set<UUID> visited=new HashSet<>();
        while(node!=null && node.getId()!=null && visited.add(node.getId())) {
            if("SERVICE_CONTAINER".equals(node.getElementType())) return node;
            var parent=node.getParentElement(); node=parent==null?null:elements.getOrDefault(parent.getId(),parent);
        }
        return null;
    }
    private static void appendId(com.fasterxml.jackson.databind.node.ObjectNode details,String key,UUID id) {
        if(id==null)return;
        var array=details.withArray(key);
        for(var existing:array)if(existing.asText().equals(id.toString()))return;
        array.add(id.toString());
    }
    private static String text(JsonNode p,String key) { return p==null?"":p.path(key).asText("").trim(); }
}
