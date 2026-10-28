package com.mavis.analyzer.impact;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.workerclient.ImpactWorkerClient;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Service @RequiredArgsConstructor
public class ImpactGraphLoader {
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final JobRepository jobs;
    private final ObjectMapper json;
    private final com.mavis.common.security.AccessPolicyService accessPolicy;
    public record EvidenceView(String id,UUID sourceSnapshotId,String locator,String adapterVersion,String sourceType,JsonNode provenance){}
    public record Snapshot(ImpactWorkerClient.Request request,Map<String,String> serviceNames,Map<String,EvidenceView> evidence,List<String> warnings){}
    @Transactional(readOnly=true)
    public Snapshot load(UUID modelId,UUID target,String expectedRevision,int maxDepth,int maxPaths){
        if(maxDepth<1||maxDepth>100||maxPaths<1||maxPaths>10000)throw invalid();
        var model=models.findById(modelId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Model not found"));
        accessPolicy.requireProjectReadAccess(model.getProject());
        boolean ready="USER_CONFIRMED".equals(model.getOrigin())||jobs.findBySourceSnapshotId(model.getSourceSnapshot().getId()).stream().anyMatch(j->"COMPLETED".equals(j.getStatus())&&j.getResultManifest()!=null&&modelId.toString().equals(j.getResultManifest().path("modelVersionId").asText())&&"ADAPTERS_COMPLETED".equals(j.getResultManifest().path("completeness").asText()));
        if(!ready)throw new BusinessException(ErrorCode.BAD_REQUEST,"Impact requires a completed, version-pinned model");
        var allEls = elements.findByModelVersionId(modelId);
        var names = new TreeMap<String, String>();
        allEls.stream().filter(e -> "SERVICE_CONTAINER".equals(e.getElementType())).forEach(e -> names.put(e.getId().toString(), e.getName()));

        UUID resolvedTargetId = target;
        if (!names.containsKey(target.toString())) {
            var matching = allEls.stream().filter(e -> target.equals(e.getId())).findFirst().orElse(null);
            if (matching != null) {
                var container = resolveContainer(matching);
                if (container != null && names.containsKey(container.getId().toString())) {
                    resolvedTargetId = container.getId();
                }
            }
        }
        if (!names.containsKey(resolvedTargetId.toString()) || names.size() > 10000) throw invalid();

        record ResolvedRel(ModelRelationship rel, ModelElement sourceContainer, ModelElement targetContainer) {}
        List<ResolvedRel> selected = new ArrayList<>();
        Set<String> impactRelTypes = Set.of(
            "SERVICE_HTTP_CALL",
            "GATEWAY_ROUTE",
            "MESSAGE_PUBLISH",
            "MESSAGE_SUBSCRIBE",
            "DECLARED_COMPOSE",
            "DECLARED_LINK"
        );
        for (var r : relationships.findByModelVersionId(modelId)) {
            if (!impactRelTypes.contains(r.getRelationType())) continue;
            var src = resolveContainer(r.getSourceElement());
            var tgt = resolveContainer(r.getTargetElement());
            if (src == null || tgt == null || src.getId().equals(tgt.getId())) continue;
            if (!names.containsKey(src.getId().toString()) || !names.containsKey(tgt.getId().toString())) continue;
            selected.add(new ResolvedRel(r, src, tgt));
        }
        if (selected.size() > 50000) throw invalid();
        selected.sort(Comparator.comparing(sr -> sr.rel().getId().toString()));

        var ids = selected.stream().map(sr -> sr.rel().getId()).toList();
        var grouped = new HashMap<UUID, List<String>>();
        var evidenceViews = new TreeMap<String, EvidenceView>();
        if (!ids.isEmpty()) for (var e : evidence.findByRelationshipIdIn(ids)) {
            if (!e.getModelVersion().getId().equals(modelId)) throw invalid();
            String id = e.getId().toString();
            grouped.computeIfAbsent(e.getRelationship().getId(), ignored -> new ArrayList<>()).add(id);
            evidenceViews.put(id, new EvidenceView(id, e.getSourceSnapshot().getId(), e.getLocator(), e.getAdapterVersion(), e.getSourceType(), e.getProvenance()));
        }
        var edges = selected.stream().map(sr -> new ImpactWorkerClient.Edge(
                sr.rel().getId().toString(),
                sr.sourceContainer().getId().toString(),
                sr.targetContainer().getId().toString(),
                "HttpRestCall",
                grouped.getOrDefault(sr.rel().getId(), List.of()).stream().sorted().toList()
        )).toList();
        String revision;
        try {
            revision = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(List.of(modelId.toString(), new ArrayList<>(names.keySet()), edges))));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot fingerprint service graph");
        }
        if (expectedRevision != null && !expectedRevision.equals(revision)) throw new BusinessException(ErrorCode.BAD_REQUEST, "Graph revision mismatch");
        return new Snapshot(new ImpactWorkerClient.Request(modelId.toString(), modelId.toString(), revision, true, resolvedTargetId.toString(), new ArrayList<>(names.keySet()), edges, maxDepth, List.of(), maxPaths), Map.copyOf(names), Map.copyOf(evidenceViews), List.of("SERVICE_HTTP_EDGES_INCLUDED", "CASCADING_MULTI_HOP_CONTAINER_RESOLVED"));
    }

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
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Invalid service impact graph or request");}
}
