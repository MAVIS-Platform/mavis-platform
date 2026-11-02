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

@Service
public class ImpactGraphLoader {
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final JobRepository jobs;
    private final ObjectMapper json;
    private final com.mavis.common.security.AccessPolicyService accessPolicy;

    @org.springframework.beans.factory.annotation.Autowired
    public ImpactGraphLoader(
            ModelVersionRepository models,
            ModelElementRepository elements,
            ModelRelationshipRepository relationships,
            EvidenceRepository evidence,
            JobRepository jobs,
            ObjectMapper json,
            com.mavis.common.security.AccessPolicyService accessPolicy) {
        this.models = models;
        this.elements = elements;
        this.relationships = relationships;
        this.evidence = evidence;
        this.jobs = jobs;
        this.json = json;
        this.accessPolicy = accessPolicy;
    }

    public ImpactGraphLoader(
            ModelVersionRepository models,
            ModelElementRepository elements,
            ModelRelationshipRepository relationships,
            EvidenceRepository evidence,
            JobRepository jobs,
            ObjectMapper json) {
        this(models, elements, relationships, evidence, jobs, json, null);
    }

    private static final Set<String> IMPACT_NODE_TYPES = Set.of(
        "SERVICE_CONTAINER",
        "QUEUE_BROKER",
        "MESSAGE_CHANNEL",
        "DATABASE",
        "EXTERNAL_SYSTEM"
    );

    public record EvidenceView(String id,UUID sourceSnapshotId,String locator,String adapterVersion,String sourceType,JsonNode provenance){}
    public record Snapshot(ImpactWorkerClient.Request request,Map<String,String> serviceNames,Map<String,EvidenceView> evidence,List<String> warnings){}
    @Transactional(readOnly=true)
    public Snapshot load(UUID modelId,UUID target,String expectedRevision,int maxDepth,int maxPaths){
        if(maxDepth<1||maxDepth>100||maxPaths<1||maxPaths>10000)throw invalid();
        var model=models.findById(modelId).orElseThrow(()->new BusinessException(ErrorCode.NOT_FOUND,"Model not found"));
        if (accessPolicy != null) {
            accessPolicy.requireProjectReadAccess(model.getProject());
        }
        boolean ready="USER_CONFIRMED".equals(model.getOrigin())||"RUNTIME_ENRICHED".equals(model.getOrigin())||jobs.findBySourceSnapshotId(model.getSourceSnapshot().getId()).stream().anyMatch(j->"COMPLETED".equals(j.getStatus())&&j.getResultManifest()!=null&&modelId.toString().equals(j.getResultManifest().path("modelVersionId").asText())&&"ADAPTERS_COMPLETED".equals(j.getResultManifest().path("completeness").asText()));
        if(!ready)throw new BusinessException(ErrorCode.BAD_REQUEST,"Impact requires a completed, version-pinned model");
        var allEls = elements.findByModelVersionId(modelId);
        var names = new TreeMap<String, String>();
        allEls.stream()
                .filter(e -> e.getElementType() != null && IMPACT_NODE_TYPES.contains(e.getElementType()))
                .forEach(e -> names.put(e.getId().toString(), e.getName()));

        UUID resolvedTargetId = target;
        if (!names.containsKey(target.toString())) {
            var matching = allEls.stream().filter(e -> target.equals(e.getId())).findFirst().orElse(null);
            if (matching != null) {
                var container = resolveContainer(matching, allEls);
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
            "DECLARED_LINK",
            "DATABASE_ACCESS",
            "RUNTIME_OBSERVED"
        );
        Map<UUID, ModelElement> elById = new HashMap<>();
        for (var el : allEls) {
            if (el.getId() != null) elById.put(el.getId(), el);
        }
        List<ModelRelationship> rels = relationships.findRawByModelVersionId(modelId);
        if (rels == null || rels.isEmpty()) {
            rels = relationships.findByModelVersionId(modelId);
        }
        for (var r : rels) {
            if (!impactRelTypes.contains(r.getRelationType())) continue;
            var rawSrc = r.getSourceElement() != null && r.getSourceElement().getId() != null
                    ? elById.getOrDefault(r.getSourceElement().getId(), r.getSourceElement())
                    : r.getSourceElement();
            var rawTgt = r.getTargetElement() != null && r.getTargetElement().getId() != null
                    ? elById.getOrDefault(r.getTargetElement().getId(), r.getTargetElement())
                    : r.getTargetElement();
            var src = resolveContainer(rawSrc, allEls);
            var tgt = resolveContainer(rawTgt, allEls);
            if (src == null || tgt == null || src.getId().equals(tgt.getId())) continue;
            if (!names.containsKey(src.getId().toString()) || !names.containsKey(tgt.getId().toString())) continue;

            ModelElement effectiveSrc = src;
            ModelElement effectiveTgt = tgt;
            if ("MESSAGE_SUBSCRIBE".equals(r.getRelationType())) {
                boolean srcIsChannel = isChannelOrBroker(src);
                boolean tgtIsChannel = isChannelOrBroker(tgt);
                if (srcIsChannel && !tgtIsChannel) {
                    effectiveSrc = tgt;
                    effectiveTgt = src;
                }
            }

            selected.add(new ResolvedRel(r, effectiveSrc, effectiveTgt));
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
            UUID evSnapshotId = e.getSourceSnapshot() != null ? e.getSourceSnapshot().getId() : (model.getSourceSnapshot() != null ? model.getSourceSnapshot().getId() : null);
            evidenceViews.put(id, new EvidenceView(id, evSnapshotId, e.getLocator(), e.getAdapterVersion(), e.getSourceType(), e.getProvenance()));
        }

        List<ImpactWorkerClient.Edge> edges = new ArrayList<>();
        Set<String> edgeIds = new HashSet<>();
        for (var sr : selected) {
            String edgeId = sr.rel().getId().toString();
            edgeIds.add(edgeId);
            edges.add(new ImpactWorkerClient.Edge(
                edgeId,
                sr.sourceContainer().getId().toString(),
                sr.targetContainer().getId().toString(),
                "HttpRestCall",
                grouped.getOrDefault(sr.rel().getId(), List.of()).stream().sorted().toList()
            ));
        }

        // Synthesize direct virtual messaging edges (subContainer -> pubContainer)
        // so when pubContainer is impacted/fails, subContainer is also traversed as impacted.
        Map<String, List<ResolvedRel>> publishersByChannel = new HashMap<>();
        Map<String, List<ResolvedRel>> subscribersByChannel = new HashMap<>();
        for (var sr : selected) {
            if ("MESSAGE_PUBLISH".equals(sr.rel().getRelationType())) {
                publishersByChannel.computeIfAbsent(sr.targetContainer().getId().toString(), k -> new ArrayList<>()).add(sr);
            } else if ("MESSAGE_SUBSCRIBE".equals(sr.rel().getRelationType())) {
                subscribersByChannel.computeIfAbsent(sr.targetContainer().getId().toString(), k -> new ArrayList<>()).add(sr);
            }
        }

        Map<String, Set<String>> synthPairsEvidence = new LinkedHashMap<>();
        for (var entry : publishersByChannel.entrySet()) {
            String channelId = entry.getKey();
            List<ResolvedRel> pubList = entry.getValue();
            List<ResolvedRel> subList = subscribersByChannel.getOrDefault(channelId, List.of());
            for (var pub : pubList) {
                String pubId = pub.sourceContainer().getId().toString();
                for (var sub : subList) {
                    String subId = sub.sourceContainer().getId().toString();
                    if (pubId.equals(subId)) continue;
                    String pairKey = subId + "->" + pubId;
                    Set<String> evs = synthPairsEvidence.computeIfAbsent(pairKey, k -> new LinkedHashSet<>());
                    evs.addAll(grouped.getOrDefault(pub.rel().getId(), List.of()));
                    evs.addAll(grouped.getOrDefault(sub.rel().getId(), List.of()));
                }
            }
        }

        for (var entry : synthPairsEvidence.entrySet()) {
            String[] parts = entry.getKey().split("->");
            String subId = parts[0];
            String pubId = parts[1];
            String synthEdgeId = UUID.nameUUIDFromBytes(("synthetic-messaging-" + subId + "->" + pubId).getBytes(StandardCharsets.UTF_8)).toString();
            if (!edgeIds.contains(synthEdgeId)) {
                edgeIds.add(synthEdgeId);
                edges.add(new ImpactWorkerClient.Edge(
                    synthEdgeId,
                    subId,
                    pubId,
                    "HttpRestCall",
                    entry.getValue().stream().sorted().toList()
                ));
            }
        }
        if (edges.size() > 50000) throw invalid();

        String revision;
        try {
            revision = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(List.of(modelId.toString(), new ArrayList<>(names.keySet()), edges))));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot fingerprint service graph");
        }
        if (expectedRevision != null && !expectedRevision.equals(revision)) throw new BusinessException(ErrorCode.BAD_REQUEST, "Graph revision mismatch");
        return new Snapshot(new ImpactWorkerClient.Request(modelId.toString(), modelId.toString(), revision, true, resolvedTargetId.toString(), new ArrayList<>(names.keySet()), edges, maxDepth, List.of(), maxPaths), Map.copyOf(names), Map.copyOf(evidenceViews), List.of("SERVICE_HTTP_EDGES_INCLUDED", "CASCADING_MULTI_HOP_CONTAINER_RESOLVED"));
    }

    private boolean isChannelOrBroker(ModelElement el) {
        if (el == null || el.getElementType() == null) return false;
        return "MESSAGE_CHANNEL".equalsIgnoreCase(el.getElementType()) || "QUEUE_BROKER".equalsIgnoreCase(el.getElementType());
    }

    private ModelElement resolveContainer(ModelElement element, List<ModelElement> allEls) {
        if (element == null) return null;
        if (element.getElementType() != null && IMPACT_NODE_TYPES.contains(element.getElementType())) {
            return element;
        }
        Set<ModelElement> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (ModelElement cur = element; cur != null && visited.add(cur); cur = cur.getParentElement()) {
            if (cur.getElementType() != null && IMPACT_NODE_TYPES.contains(cur.getElementType())) {
                return cur;
            }
        }
        String hint = element.getProperties() != null && element.getProperties().hasNonNull("serviceName")
                ? element.getProperties().get("serviceName").asText()
                : element.getScope();
        if (hint != null && !hint.isBlank()) {
            String normalized = hint.replace('\\', '/').toLowerCase(Locale.ROOT);
            for (ModelElement candidate : allEls) {
                if ("SERVICE_CONTAINER".equals(candidate.getElementType()) && candidate.getName() != null) {
                    String svc = candidate.getName().toLowerCase(Locale.ROOT);
                    if (normalized.equals(svc) || normalized.startsWith(svc + "/") || normalized.contains("/" + svc + "/")) {
                        return candidate;
                    }
                }
            }
        }
        return element;
    }
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Invalid service impact graph or request");}
}
