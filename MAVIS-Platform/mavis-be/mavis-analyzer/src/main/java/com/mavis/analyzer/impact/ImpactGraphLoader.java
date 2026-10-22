package com.mavis.analyzer.impact;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
        var names=new TreeMap<String,String>();elements.findByModelVersionId(modelId).stream().filter(e->"SERVICE_CONTAINER".equals(e.getElementType())).forEach(e->names.put(e.getId().toString(),e.getName()));
        if(!names.containsKey(target.toString())||names.size()>10000)throw invalid();
        var selected=relationships.findByModelVersionId(modelId).stream().filter(r->"SERVICE_HTTP_CALL".equals(r.getRelationType())&&names.containsKey(r.getSourceElement().getId().toString())&&names.containsKey(r.getTargetElement().getId().toString())&&r.getProperties()!=null&&
                ("CONFIG_BOUND".equals(r.getProperties().path("mappingStatus").asText())||r.getProperties().path("userConfirmed").asBoolean(false))).sorted(Comparator.comparing(r->r.getId().toString())).toList();
        if(selected.size()>50000)throw invalid();
        var ids=selected.stream().map(r->r.getId()).toList();var grouped=new HashMap<UUID,List<String>>();var evidenceViews=new TreeMap<String,EvidenceView>();
        if(!ids.isEmpty())for(var e:evidence.findByRelationshipIdIn(ids)){
            if(!e.getModelVersion().getId().equals(modelId))throw invalid();String id=e.getId().toString();grouped.computeIfAbsent(e.getRelationship().getId(),ignored->new ArrayList<>()).add(id);
            evidenceViews.put(id,new EvidenceView(id,e.getSourceSnapshot().getId(),e.getLocator(),e.getAdapterVersion(),e.getSourceType(),e.getProvenance()));
        }
        var edges=selected.stream().map(r->new ImpactWorkerClient.Edge(r.getId().toString(),r.getSourceElement().getId().toString(),r.getTargetElement().getId().toString(),"HttpRestCall",grouped.getOrDefault(r.getId(),List.of()).stream().sorted().toList())).toList();
        String revision;
        try{revision=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(List.of(modelId.toString(),new ArrayList<>(names.keySet()),edges))));}catch(Exception e){throw new IllegalStateException("Cannot fingerprint service graph");}
        if(expectedRevision!=null&&!expectedRevision.equals(revision))throw new BusinessException(ErrorCode.BAD_REQUEST,"Graph revision mismatch");
        return new Snapshot(new ImpactWorkerClient.Request(modelId.toString(),modelId.toString(),revision,true,target.toString(),new ArrayList<>(names.keySet()),edges,maxDepth,List.of(),maxPaths),Map.copyOf(names),Map.copyOf(evidenceViews),List.of("ONLY_CONFIG_BOUND_OR_USER_CONFIRMED_SERVICE_HTTP_EDGES","UNRECONCILED_LEGACY_AND_CODE_RELATIONS_EXCLUDED"));
    }
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Invalid service impact graph or request");}
}
