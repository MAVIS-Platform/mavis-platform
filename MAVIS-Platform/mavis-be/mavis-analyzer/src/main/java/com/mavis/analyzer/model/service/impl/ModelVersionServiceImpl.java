package com.mavis.analyzer.model.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.model.service.ModelVersionService;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.*;
import com.mavis.common.utils.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import java.util.function.Function;

@Slf4j
@Service @RequiredArgsConstructor
public class ModelVersionServiceImpl implements ModelVersionService {
    private final com.mavis.common.security.AccessPolicyService accessPolicy;
    @Transactional(readOnly=true)
    public List<com.mavis.analyzer.model.dto.ModelVersionResponseDTO> getModelVersionsByProject(UUID id){
        list(id);return models.findByProjectId(id).stream().sorted(Comparator.comparing(ModelVersion::getRevision).reversed()).map(com.mavis.analyzer.model.dto.ModelVersionResponseDTO::fromEntity).toList();
    }
    @Transactional(readOnly=true)
    public com.mavis.analyzer.model.dto.ModelVersionResponseDTO getModelVersionById(UUID id){var model=models.findById(id).orElseThrow(()->missing());owner(model.getProject());return com.mavis.analyzer.model.dto.ModelVersionResponseDTO.fromEntity(model);}

    @Transactional(rollbackFor=Exception.class)
    public com.mavis.analyzer.model.dto.ModelVersionResponseDTO createControlledRevision(UUID base,com.mavis.analyzer.model.dto.ModelRevisionRequestDTO request){
        if(request==null)throw invalid();
        getModelVersionById(base); // Authorize before loading edit references or trusting caller-createdById.
        if(request.getAddedElements()==null||request.getModifiedElements()==null||request.getRemovedElementIds()==null||request.getAddedRelationships()==null||request.getRemovedRelationshipIds()==null)throw invalid();
        if((long)request.getAddedElements().size()+request.getModifiedElements().size()+request.getRemovedElementIds().size()+request.getAddedRelationships().size()+request.getRemovedRelationshipIds().size()>2000)throw invalid();
        RevisionRequest edits;
        if(request.getElements()!=null||request.getRelationships()!=null){
            if(!request.getAddedElements().isEmpty()||!request.getModifiedElements().isEmpty()||!request.getRemovedElementIds().isEmpty()||!request.getAddedRelationships().isEmpty()||!request.getRemovedRelationshipIds().isEmpty())throw invalid();
            edits=new RevisionRequest(request.getElements(),request.getRelationships());
        }else{
            var nodes=new ArrayList<ElementEdit>();var edges=new ArrayList<RelationshipEdit>();
            var existing=elements.findByModelVersionId(base);var names=new HashMap<String,List<String>>();for(var node:existing)names.computeIfAbsent(node.getName(),k->new ArrayList<>()).add(node.getId().toString());
            for(var node:request.getAddedElements()){
                String ref="added-"+UUID.randomUUID();names.computeIfAbsent(node.getName(),k->new ArrayList<>()).add(ref);
                nodes.add(new ElementEdit(ref,"ADD",node.getName(),node.getElementType(),node.getStatus(),resolveRef(node.getParentElementId(),node.getParentElementName(),names,true),node.getLanguageStack(),node.getScope(),node.getProperties()));

            }
            for(var node:request.getModifiedElements()){

                nodes.add(new ElementEdit(resolveRef(node.getId(),node.getName(),names,false),"UPDATE",node.getNewName()!=null?node.getNewName():node.getName(),null,node.getStatus(),null,node.getLanguageStack(),node.getScope(),node.getProperties()));
            }
            for(UUID id:request.getRemovedElementIds())nodes.add(new ElementEdit(id.toString(),"REMOVE",null,null,null,null));
            for(var edge:request.getAddedRelationships()){
                if(!"DIRECTED".equals(edge.getDirection())||!"STATIC".equals(edge.getOriginLayer()))throw invalid();
                edges.add(new RelationshipEdit("added-"+UUID.randomUUID(),"ADD",resolveRef(edge.getSourceElementId(),edge.getSourceElementName(),names,false),resolveRef(edge.getTargetElementId(),edge.getTargetElementName(),names,false),edge.getRelationType(),true,edge.getProperties()));
            }
            for(UUID id:request.getRemovedRelationshipIds())edges.add(new RelationshipEdit(id.toString(),"REMOVE",null,null,null,false));
            edits=new RevisionRequest(nodes,edges);
        }
        var result=revise(base,edits);return getModelVersionById(result.id());
    }
    private String resolveRef(UUID id,String name,Map<String,List<String>> names,boolean optional){
        if(id!=null)return id.toString();if(name==null&&optional)return null;
        var matches=names.get(name);if(matches==null||matches.size()!=1)throw invalid();return matches.get(0);
    }
    @Transactional(readOnly=true)
    public com.mavis.analyzer.model.dto.ModelDiffResponseDTO compareModelVersions(UUID base,UUID target){
        var result=compare(base,target);var dto=new com.mavis.analyzer.model.dto.ModelDiffResponseDTO();
        dto.setBaseVersionId(base);dto.setTargetVersionId(target);dto.setBaseRevision(models.findById(base).orElseThrow(()->missing()).getRevision());dto.setTargetRevision(models.findById(target).orElseThrow(()->missing()).getRevision());dto.setElements(result.elements());dto.setRelationships(result.relationships());
        var before=new HashMap<String,ModelElement>();for(var node:elements.findByModelVersionId(base))before.put(key(node.getProperties(),"element",node.getId()),node);
        var after=new HashMap<String,ModelElement>();for(var node:elements.findByModelVersionId(target))after.put(key(node.getProperties(),"element",node.getId()),node);
        for(String id:result.elements().added())dto.getAddedElements().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(after.get(id)));
        for(String id:result.elements().removed())dto.getRemovedElements().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(before.get(id)));
        for(String id:result.elements().unchanged())dto.getUnchangedElements().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(after.get(id)));
        for(String id:result.elements().modified())dto.getModifiedElements().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementModifiedDiffDTO.builder().key(id).changes(elementChanges(before.get(id),after.get(id))).baseElement(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(before.get(id))).targetElement(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(after.get(id))).build());
        var oldEdges=new HashMap<String,ModelRelationship>();for(var edge:rawRels(base))oldEdges.put(key(edge.getProperties(),"relationship",edge.getId()),edge);
        var newEdges=new HashMap<String,ModelRelationship>();for(var edge:rawRels(target))newEdges.put(key(edge.getProperties(),"relationship",edge.getId()),edge);
        for(String id:result.relationships().added())dto.getAddedRelationships().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(newEdges.get(id)));
        for(String id:result.relationships().removed())dto.getRemovedRelationships().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(oldEdges.get(id)));
        for(String id:result.relationships().unchanged())dto.getUnchangedRelationships().add(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(newEdges.get(id)));
        dto.setSummary(com.mavis.analyzer.model.dto.ModelDiffResponseDTO.DiffSummaryDTO.builder().addedElementsCount(dto.getAddedElements().size()).removedElementsCount(dto.getRemovedElements().size()).modifiedElementsCount(dto.getModifiedElements().size()).unchangedElementsCount(dto.getUnchangedElements().size()).addedRelationshipsCount(dto.getAddedRelationships().size()).removedRelationshipsCount(dto.getRemovedRelationships().size()).unchangedRelationshipsCount(dto.getUnchangedRelationships().size()).totalAdded(dto.getAddedElements().size()+dto.getAddedRelationships().size()).totalRemoved(dto.getRemovedElements().size()+dto.getRemovedRelationships().size()).totalModified(dto.getModifiedElements().size()+result.relationships().modified().size()).totalUnchanged(dto.getUnchangedElements().size()+dto.getUnchangedRelationships().size()).build());
        return dto;
    }
    private final ProjectRepository projects;
    private final ModelVersionRepository models;
    private final ModelElementRepository elements;
    private final ModelRelationshipRepository relationships;
    private final EvidenceRepository evidence;
    private final DiagramProjectionService diagrams;
    private final ObjectMapper json;

    @Override @Transactional(readOnly=true)
    public List<ModelView> list(UUID project){var p=projects.findById(project).orElseThrow(()->missing());owner(p);return models.findByProjectId(project).stream().sorted(Comparator.comparing(ModelVersion::getRevision).reversed()).map(this::view).toList();}
    @Override @Transactional(rollbackFor=Exception.class)
    public ModelView revise(UUID baseId,RevisionRequest request){
        if(request==null||request.elements()==null||request.relationships()==null||request.elements().size()+request.relationships().size()>2000)throw invalid();
        var base=models.findById(baseId).orElseThrow(()->missing());accessPolicy.requireProjectWriteAccess(base.getProject());projects.findLockedById(base.getProject().getId()).orElseThrow(()->missing());
        // Refresh the latest identity under the same project lock used by analysis publication.
        var latest=models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(base.getProject().getId()).orElseThrow(()->invalid());
        if(!latest.getId().equals(baseId))throw new BusinessException(ErrorCode.CONFLICT,"Revision base is stale; reload latest model before editing");
        var oldNodes=elements.findByModelVersionId(baseId);var oldEdges=rawRels(baseId);
        if(oldNodes.size()>10000||oldEdges.size()>50000)throw invalid();
        var next=models.save(ModelVersion.builder().project(base.getProject()).sourceSnapshot(base.getSourceSnapshot()).baseModelVersion(base).createdBy(base.getProject().getOwner())
                .revision(models.findMaxRevisionByProjectId(base.getProject().getId())+1).schemaVersion(base.getSchemaVersion()).origin("USER_CONFIRMED").isLatestValid(false).build());
        var nodes=new LinkedHashMap<String,ModelElement>();var oldByRef=new HashMap<String,ModelElement>();var parents=new HashMap<String,String>();
        for(var n:oldNodes){String ref=n.getId().toString();oldByRef.put(ref,n);if(n.getParentElement()!=null)parents.put(ref,n.getParentElement().getId().toString());
            nodes.put(ref,ModelElement.builder().modelVersion(next).name(n.getName()).elementType(n.getElementType()).languageStack(n.getLanguageStack()).scope(n.getScope()).status(n.getStatus()).properties(props(n.getProperties(),"element",n.getId())).build());}
        var changedNodes=new HashSet<String>();var addedNodes=new HashSet<String>();var seen=new HashSet<String>();
        for(var edit:request.elements()){
            if(edit==null||!ref(edit.ref())||!seen.add(edit.ref()))throw invalid();
            switch(edit.operation()==null?"":edit.operation()){
                case "REMOVE" -> {if(nodes.remove(edit.ref())==null)throw invalid();parents.remove(edit.ref());}
                case "UPDATE" -> {var n=nodes.get(edit.ref());if(n==null||edit.kind()!=null||edit.parentRef()!=null)throw invalid();
                    if(edit.name()!=null){name(edit.name());n.setName(edit.name());}if(edit.status()!=null){if(!edit.status().equals("STUDENT_CONFIRMED"))throw invalid();n.setStatus(edit.status());}if(edit.languageStack()!=null)n.setLanguageStack(edit.languageStack());if(edit.scope()!=null)n.setScope(edit.scope());n.setProperties(metadata(n.getProperties(),edit.properties()));changedNodes.add(edit.ref());}
                case "ADD" -> {if(nodes.containsKey(edit.ref())||oldByRef.containsKey(edit.ref())||edit.kind()==null||!Set.of("COMPONENT","CLASS_INTERFACE","SERVICE_CONTAINER","DATABASE","EXTERNAL_SYSTEM","QUEUE_BROKER","PERSON").contains(edit.kind()))throw invalid();name(edit.name());
                    nodes.put(edit.ref(),ModelElement.builder().modelVersion(next).name(edit.name()).elementType(edit.kind()).status("STUDENT_CONFIRMED").languageStack(edit.languageStack()).scope(edit.scope()).properties(metadata(json.createObjectNode().put("logicalKey","user:"+UUID.randomUUID()).put("origin","USER_CONFIRMED"),edit.properties())).build());
                    if(edit.parentRef()!=null)parents.put(edit.ref(),edit.parentRef());addedNodes.add(edit.ref());}
                default -> throw invalid();
            }
        }
        for(var entry:parents.entrySet()){
            var node=nodes.get(entry.getKey());var parent=nodes.get(entry.getValue());if(node==null||parent==null)throw invalid();node.setParentElement(parent);
            var visited=new HashSet<String>();String cursor=entry.getKey();while(cursor!=null){if(!visited.add(cursor))throw invalid();cursor=parents.get(cursor);}
        }
        var oldEdgeRefs=new HashSet<String>();oldEdges.forEach(r->oldEdgeRefs.add(r.getId().toString()));
        var edges=new LinkedHashMap<String,ModelRelationship>();
        for(var r:oldEdges){String from=r.getSourceElement().getId().toString(),to=r.getTargetElement().getId().toString();
            // Explicit removals are validated below; removed nodes remove their incident edges in this revision only.
            if(nodes.containsKey(from)&&nodes.containsKey(to))edges.put(r.getId().toString(),ModelRelationship.builder().modelVersion(next).sourceElement(nodes.get(from)).targetElement(nodes.get(to))
                    .relationType(r.getRelationType()).originLayer(r.getOriginLayer()).direction(r.getDirection()).properties(props(r.getProperties(),"relationship",r.getId())).build());}
        var addedEdges=new HashSet<String>();var changedEdges=new HashSet<String>();seen.clear();
        for(var edit:request.relationships()){
            if(edit==null||!ref(edit.ref())||!seen.add(edit.ref()))throw invalid();
            switch(edit.operation()==null?"":edit.operation()){
                case "REMOVE" -> {if(edges.remove(edit.ref())==null)throw invalid();}
                case "UPDATE" -> {var r=edges.get(edit.ref());if(r==null||!edit.confirmed()||edit.fromRef()!=null||edit.toRef()!=null||edit.type()!=null)throw invalid();r.setProperties(metadata(r.getProperties(),edit.properties()));((ObjectNode)r.getProperties()).put("userConfirmed",true);changedEdges.add(edit.ref());}
                case "ADD" -> {if(edges.containsKey(edit.ref())||oldEdgeRefs.contains(edit.ref())||!nodes.containsKey(edit.fromRef())||!nodes.containsKey(edit.toRef())||edit.type()==null||!Set.of("CODE_DEPENDENCY","SERVICE_HTTP_CALL","DATABASE_ACCESS").contains(edit.type()))throw invalid();
                    edges.put(edit.ref(),ModelRelationship.builder().modelVersion(next).sourceElement(nodes.get(edit.fromRef())).targetElement(nodes.get(edit.toRef())).relationType(edit.type()).originLayer("STATIC").direction("DIRECTED")
                            .properties(metadata(json.createObjectNode().put("logicalKey","user:"+UUID.randomUUID()).put("userConfirmed",true).put("origin","USER_CONFIRMED"),edit.properties())).build());addedEdges.add(edit.ref());}
                default -> throw invalid();
            }
        }
        elements.saveAll(nodes.values());elements.flush();relationships.saveAll(edges.values());relationships.flush();
        var copies=new ArrayList<Evidence>();
        for(var e:evidence.findByModelVersionId(baseId)){
            var n=e.getElement()==null?null:nodes.get(e.getElement().getId().toString());var r=e.getRelationship()==null?null:edges.get(e.getRelationship().getId().toString());
            if(n==null&&r==null)continue;
            var provenance=e.getProvenance()!=null&&e.getProvenance().isObject()?(ObjectNode)e.getProvenance().deepCopy():json.createObjectNode();
            provenance.put("copiedFromEvidenceId",e.getId().toString()).put("baseModelVersionId",baseId.toString());
            copies.add(Evidence.builder().modelVersion(next).sourceSnapshot(e.getSourceSnapshot()).runtimeSession(e.getRuntimeSession()).element(n).relationship(r).locator(e.getLocator()).sourceType(e.getSourceType()).adapterVersion(e.getAdapterVersion()).excerpt(e.getExcerpt()).provenance(provenance).build());
        }
        var nodeEdits=new HashSet<String>(changedNodes);nodeEdits.addAll(addedNodes);for(String id:nodeEdits)if(request.elements().stream().noneMatch(edit->id.equals(edit.ref())&&edit.properties()!=null&&(edit.properties().has("contextReview")||edit.properties().has("contextFactOrigin"))))copies.add(editEvidence(next,baseId,nodes.get(id),null));
        var edgeEdits=new HashSet<String>(changedEdges);edgeEdits.addAll(addedEdges);for(String id:edgeEdits)if(!edges.get(id).getProperties().has("contextFactOrigin"))copies.add(editEvidence(next,baseId,null,edges.get(id)));
        evidence.saveAll(copies);evidence.flush();diagrams.generateDefaultDiagramsForModel(next,new ArrayList<>(nodes.values()),new ArrayList<>(edges.values()));
        models.invalidatePreviousVersions(base.getProject().getId(),next.getId());next.setIsLatestValid(true);models.save(next);return view(next);
    }
    @Override @Transactional(readOnly=true)
    public ModelDiff compare(UUID a,UUID b){var base=models.findById(a).orElseThrow(()->missing());var target=models.findById(b).orElseThrow(()->missing());owner(base.getProject());owner(target.getProject());
        if(!base.getProject().getId().equals(target.getProject().getId()))throw invalid();
        var before=elements.findByModelVersionId(a);var after=elements.findByModelVersionId(b);var beforeNames=nodeKeys(before);var afterNames=nodeKeys(after);
        var allNodeKeys=new HashMap<UUID,String>(beforeNames);allNodeKeys.putAll(afterNames);
        return new ModelDiff(a,b,diff(before,after,n->key(n.getProperties(),"element",n.getId()),n->List.of(n.getName(),n.getElementType(),n.getStatus(),Objects.toString(n.getLanguageStack(),""),Objects.toString(n.getScope(),""),diffProperties(n.getProperties()),n.getParentElement()==null?"":beforeNames.getOrDefault(n.getParentElement().getId(),afterNames.get(n.getParentElement().getId())))),
                diff(rawRels(a),rawRels(b),r->key(r.getProperties(),"relationship",r.getId()),r->List.of(r.getRelationType(),Objects.toString(r.getDirection(),"DIRECTED"),allNodeKeys.getOrDefault(r.getSourceElement().getId(),key(r.getSourceElement().getProperties(),"element",r.getSourceElement().getId())),allNodeKeys.getOrDefault(r.getTargetElement().getId(),key(r.getTargetElement().getProperties(),"element",r.getTargetElement().getId())),r.getProperties()==null?false:r.getProperties().path("userConfirmed").asBoolean())));
    }
    private List<ModelRelationship> rawRels(UUID modelId){var rels=relationships.findRawByModelVersionId(modelId);return rels!=null&&!rels.isEmpty()?rels:relationships.findByModelVersionId(modelId);}
    private Map<UUID,String> nodeKeys(List<ModelElement> nodes){var keys=new HashMap<UUID,String>();nodes.forEach(n->keys.put(n.getId(),key(n.getProperties(),"element",n.getId())));return keys;}
    private <T> Difference diff(List<T> before,List<T> after,Function<T,String> identity,Function<T,Object> signature){var a=new LinkedHashMap<String,Object>();var b=new LinkedHashMap<String,Object>();for(var v:before)if(a.put(identity.apply(v),signature.apply(v))!=null)throw invalid();for(var v:after)if(b.put(identity.apply(v),signature.apply(v))!=null)throw invalid();var added=new ArrayList<String>();var removed=new ArrayList<String>();var modified=new ArrayList<String>();var unchanged=new ArrayList<String>();for(var e:a.entrySet()){if(!b.containsKey(e.getKey()))removed.add(e.getKey());else if(!e.getValue().equals(b.get(e.getKey())))modified.add(e.getKey());else unchanged.add(e.getKey());}for(String id:b.keySet())if(!a.containsKey(id))added.add(id);return new Difference(added,removed,modified,unchanged);}
    private ObjectNode props(com.fasterxml.jackson.databind.JsonNode properties,String kind,UUID id){var p=properties!=null&&properties.isObject()?(ObjectNode)properties.deepCopy():json.createObjectNode();p.put("logicalKey",key(properties,kind,id));return p;}
    private String key(com.fasterxml.jackson.databind.JsonNode p,String kind,UUID id){if(p!=null){if(p.hasNonNull("logicalKey"))return p.get("logicalKey").asText();if(p.hasNonNull("workerLogicalId"))return "worker:"+p.get("workerLogicalId").asText();}return kind+":"+id;}
    private Evidence editEvidence(ModelVersion next,UUID base,ModelElement node,ModelRelationship relationship){return Evidence.builder().modelVersion(next).sourceSnapshot(next.getSourceSnapshot()).element(node).relationship(relationship).sourceType("CONFIG_FILE").adapterVersion("controlled-revision/1").locator("user-revision:"+next.getId())
            .provenance(json.createObjectNode().put("origin","USER_CONFIRMED").put("baseModelVersionId",base.toString()).put("actorId",SecurityUtils.getCurrentUserId().toString())).build();}
    private void owner(Project p){accessPolicy.requireProjectReadAccess(p);}
    private ModelView view(ModelVersion m){return new ModelView(m.getId(),m.getProject().getId(),m.getSourceSnapshot().getId(),m.getBaseModelVersion()==null?null:m.getBaseModelVersion().getId(),m.getRevision(),m.getOrigin(),Boolean.TRUE.equals(m.getIsLatestValid()));}
    private static boolean ref(String s){return s!=null&&s.matches("[A-Za-z0-9_-]{1,128}");}
    private static void name(String name){if(name==null||name.isBlank()||name.length()>255)throw invalid();}
    private List<String> elementChanges(ModelElement base,ModelElement target){
        var changes=new ArrayList<String>();if(!Objects.equals(base.getName(),target.getName()))changes.add("name");
        if(!Objects.equals(base.getStatus(),target.getStatus()))changes.add("status");if(!Objects.equals(base.getElementType(),target.getElementType()))changes.add("elementType");
        if(!Objects.equals(base.getLanguageStack(),target.getLanguageStack()))changes.add("languageStack");if(!Objects.equals(base.getScope(),target.getScope()))changes.add("scope");
        if(!diffProperties(base.getProperties()).equals(diffProperties(target.getProperties())))changes.add("properties");
        return changes;
    }
    private Object diffProperties(com.fasterxml.jackson.databind.JsonNode properties){
        ObjectNode normalized=properties!=null&&properties.isObject()?(ObjectNode)properties.deepCopy():json.createObjectNode();
        normalized.remove("logicalKey");return normalized;
    }
    private ObjectNode metadata(com.fasterxml.jackson.databind.JsonNode existing,com.fasterxml.jackson.databind.JsonNode requested){
        ObjectNode result=existing!=null&&existing.isObject()?(ObjectNode)existing.deepCopy():json.createObjectNode();
        if(requested!=null && !requested.isNull()){
            if(!requested.isObject()||requested.size()>100||requested.toString().length()>65536)throw invalid();
            var fields=requested.fields();while(fields.hasNext()){var entry=fields.next();if(Set.of("logicalKey","workerLogicalId","origin","userConfirmed").contains(entry.getKey()))throw invalid();result.set(entry.getKey(),entry.getValue());}
        }
        return result;
    }
    private static BusinessException invalid(){return new BusinessException(ErrorCode.BAD_REQUEST,"Invalid controlled revision or comparison input");}
    private static BusinessException missing(){return new BusinessException(ErrorCode.NOT_FOUND,"Model not found");}
}
