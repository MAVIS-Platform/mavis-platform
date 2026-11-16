package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.workerclient.WorkerContract;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import java.nio.file.*;
import java.util.*;

@Service @RequiredArgsConstructor
public class CrossLanguageServiceLinker {
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final ObjectMapper json;
    public record Report(int linked,int unresolved,int ambiguous,String bindingHash) {}

    @Transactional(propagation=Propagation.MANDATORY)
    public Report link(ModelVersion version,String source,WorkerContract.Result worker,List<CodeEvidenceDTO> javaFindings,
                       Map<String, String> callSites)throws java.io.IOException {
        var bindings=ServiceBindingIndex.load(Path.of(source));
        var all=elements.findByModelVersionId(version.getId());
        var services=new HashMap<String,List<ModelElement>>();
        for(var e:all)if("SERVICE_CONTAINER".equals(e.getElementType()))services.computeIfAbsent(e.getName(),ignored->new ArrayList<>()).add(e);
        var byLogical=new HashMap<String,ModelElement>();for(var e:all)if(e.getProperties()!=null && e.getProperties().hasNonNull("workerLogicalId"))byLogical.put(e.getProperties().get("workerLogicalId").asText(),e);
        var proposals=new ArrayList<Proposal>();
        var ownedModules=new ArrayList<ModelElement>();
        if(worker!=null){
            var canonical=new HashMap<String,WorkerContract.Element>();worker.canonical().elements().forEach(e->canonical.put(e.id(),e));
            var refs=new HashMap<String,WorkerContract.Evidence>();worker.canonical().evidence().forEach(e->refs.put(e.id(),e));
            for(var relation:worker.canonical().relationships())if("SERVICE_HTTP_CALL".equals(relation.type())){
                var from=canonical.get(relation.fromId());var to=canonical.get(relation.toId());
                var ev=relation.evidenceIds().stream().map(refs::get).toList();
                proposals.add(new Proposal(bindings.project(from.projectPath()),bindings.endpoint(to.name()),ev,List.of(),relation.id()));
            }
            // Explicit module ownership; no directory-name or first-container fallback.
            for(var project:worker.projects()){
                var owners=bindings.project(project.projectPath());var owner=unique(owners,services);var module=byLogical.get(project.id());
                if(owner!=null && module!=null){module.setParentElement(owner);module.setStatus("NEEDS_REVIEW");ownedModules.add(module);}
            }
        }
        Path root=Path.of(source).toAbsolutePath().normalize();
        for(var finding:javaFindings)if(Set.of("FEIGN_CLIENT","REST_TEMPLATE_CALL","WEB_CLIENT_CALL").contains(finding.getElementType())&&finding.getFilePath()!=null){
            // Method-level OpenFeign relationships and their proofs are already published by the graph builder.
            if ("OPENFEIGN".equals(finding.getMetadata().get("clientFramework"))) continue;
            Path path=Path.of(finding.getFilePath()).toAbsolutePath().normalize();if(!path.startsWith(root))continue;
            String relative=root.relativize(path).toString().replace('\\','/');
            proposals.add(new Proposal(bindings.source(relative),bindings.endpoint(finding.getEndpointAlias()),List.of(),List.of(finding),"java:"+relative+":"+finding.getLineNumber()));
        }
        int linked=0,unresolved=0,ambiguous=0;var saved=new ArrayList<ModelRelationship>();var evs=new ArrayList<Evidence>();
        for(var p:proposals){
            if(p.from.size()>1 || p.to.size()>1 || p.from.stream().anyMatch(n->services.getOrDefault(n,List.of()).size()>1)||p.to.stream().anyMatch(n->services.getOrDefault(n,List.of()).size()>1)){ambiguous++;continue;}
            var from=unique(p.from,services);var to=unique(p.to,services);if(from==null||to==null||from==to){unresolved++;continue;}
            var properties=json.createObjectNode().put("mappingStatus","CONFIG_BOUND").put("bindingHash",bindings.hash()).put("mappingLocator","mavis.bindings.json:1")
                    .put("sourceReference",p.id).put("requiresReview",true).put("callerService",from.getName()).put("calleeService",to.getName()).put("transport","HTTP").put("resolutionStatus","RESOLVED");
            var relation=ModelRelationship.builder().modelVersion(version).sourceElement(from).targetElement(to).relationType("SERVICE_HTTP_CALL").originLayer("STATIC").direction("DIRECTED").properties(properties).build();
            saved.add(relation);linked++;
            evs.add(Evidence.builder().modelVersion(version).sourceSnapshot(version.getSourceSnapshot()).relationship(relation).locator("mavis.bindings.json:1").sourceType("CONFIG_FILE").adapterVersion("service-bindings/1")
                    .provenance(json.createObjectNode().put("fileHash",bindings.hash()).put("sourceReference",p.id)).build());
            for(var e:p.workerEvidence) {
                var excerpt = callSites.get(e.id());
                com.fasterxml.jackson.databind.node.ObjectNode provenance = json.valueToTree(e);
                if (excerpt != null) provenance.put("communicationRole", "CALL_SITE");
                evs.add(Evidence.builder().modelVersion(version).sourceSnapshot(version.getSourceSnapshot())
                        .relationship(relation).locator(e.locator()).adapterVersion(e.adapterVersion())
                        .sourceType(e.origin().equals("CONFIG") ? "CONFIG_FILE" : "STATIC_CODE")
                        .excerpt(excerpt).provenance(provenance).build());
            }
            for(var e:p.javaEvidence)evs.add(Evidence.builder().modelVersion(version).sourceSnapshot(version.getSourceSnapshot()).relationship(relation).locator(root.relativize(Path.of(e.getFilePath()).toAbsolutePath().normalize()).toString().replace('\\','/')+":"+e.getLineNumber()).adapterVersion("JAVAPARSER_3.25").sourceType("STATIC_CODE").build());
        }
        elements.saveAll(ownedModules);relationships.saveAll(saved);if(!saved.isEmpty())relationships.flush();evidence.saveAll(evs);return new Report(linked,unresolved,ambiguous,bindings.hash());
    }
    private record Proposal(Set<String> from,Set<String> to,List<WorkerContract.Evidence> workerEvidence,List<CodeEvidenceDTO> javaEvidence,String id){}
    private static ModelElement unique(Set<String> names,Map<String,List<ModelElement>> services){if(names.size()!=1)return null;var values=services.getOrDefault(names.iterator().next(),List.of());return values.size()==1?values.get(0):null;}
}
