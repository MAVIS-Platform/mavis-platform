package com.mavis.analyzer.model.service;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.security.AccessPolicyService;
import com.mavis.common.utils.SecurityUtils;
import com.mavis.common.exception.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.time.OffsetDateTime;
import java.util.regex.Pattern;

@Service @RequiredArgsConstructor
public class ContextReviewService {
 private final ModelVersionRepository models;
 private final ProjectRepository projects;
 private final ModelElementRepository elements;
 private final ModelRelationshipRepository relationships;
 private final EvidenceRepository evidence;
 private final AccessPolicyService access;
 private final ModelVersionService revisions;
 private final ObjectMapper json;
 public record Request(int expectedRevision,String action,String candidateId,String name,String kind,String targetKey,String direction,String basis,String boundary,List<UUID> evidenceIds){}
 private static final Pattern ROLE=Pattern.compile("hasRole\\(\\s*[\"']([A-Za-z][A-Za-z0-9_:-]{1,63})[\"']\\s*\\)");
 public static String key(ModelElement e){var p=e.getProperties();return p!=null&&p.hasNonNull("logicalKey")?p.path("logicalKey").asText():p!=null&&p.hasNonNull("workerLogicalId")?"worker:"+p.path("workerLogicalId").asText():"element:"+e.getId();}
 private BusinessException invalid(String message){return new BusinessException(ErrorCode.BAD_REQUEST,message);}
 private String text(String s,int max){if(s==null||s.isBlank()||s.length()>max)throw invalid("Missing or invalid context review field");return s.trim();}
 @Transactional(rollbackFor=Exception.class)
 public ModelVersionService.ModelView review(UUID modelId,Request r){
  var base=models.findById(modelId).orElseThrow(()->invalid("Model unavailable"));access.requireProjectWriteAccess(base.getProject());projects.findLockedById(base.getProject().getId()).orElseThrow();
  if(r==null||r.expectedRevision()!=base.getRevision()||!models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(base.getProject().getId()).map(m->m.getId().equals(modelId)).orElse(false))throw new BusinessException(ErrorCode.CONFLICT,"Context review requires the latest revision. Reload before saving.");
  var nodes=elements.findByModelVersionId(modelId);var inside=nodes.stream().filter(n->!Set.of("PERSON","EXTERNAL_SYSTEM").contains(n.getElementType())).toList();
  if(inside.isEmpty())throw invalid("No internal system element is available to anchor context review");
  var anchor=inside.stream().filter(n->n.getProperties()!=null&&n.getProperties().has("contextReview")).findFirst().orElse(inside.get(0));
  ObjectNode review=anchor.getProperties()!=null&&anchor.getProperties().path("contextReview").isObject()?(ObjectNode)anchor.getProperties().path("contextReview").deepCopy():json.createObjectNode();
  if ((review.has("entries") && !review.get("entries").isArray()) || (review.has("audit") && !review.get("audit").isArray())) throw invalid("Invalid stored context review");
  ArrayNode entries=review.has("entries")?(ArrayNode)review.get("entries"):review.putArray("entries");ArrayNode audit=review.has("audit")?(ArrayNode)review.get("audit"):review.putArray("audit");
  if(entries.size()>100||audit.size()>=300)throw invalid("Context review limit reached");
  var edits=new ArrayList<ModelVersionService.ElementEdit>();var links=new ArrayList<ModelVersionService.RelationshipEdit>();
  String action=text(r.action(),20);String who=SecurityUtils.getCurrentUserId().toString();String now=OffsetDateTime.now().toString();
  ObjectNode item=null;
  if(Set.of("CONFIRM","REJECT","EDIT").contains(action)){
   for(var entry:entries)if(entry.path("id").asText().equals(r.candidateId()))item=(ObjectNode)entry;
   if(item==null||!"PROPOSED".equals(item.path("state").asText()))throw invalid("Only proposed context can be reviewed");
  }
  if(r.evidenceIds()!=null && r.evidenceIds().size()>20)throw invalid("Too many evidence references");
  var citations=evidence.findByModelVersionId(modelId);
  if("SUGGEST".equals(action)){
   int before=entries.size();
   var seen=new HashSet<String>();for(var entry:entries)seen.add(entry.path("dedupKey").asText());
   for(var ev:citations){
    if(entries.size()>=100||review.toString().length()>48000)break;
    if(!"STATIC_CODE".equals(ev.getSourceType())||ev.getExcerpt()==null||ev.getElement()==null||!inside.stream().anyMatch(n->n.getId().equals(ev.getElement().getId())))continue;
    var matcher=ROLE.matcher(ev.getExcerpt());while(matcher.find()&&entries.size()<100&&review.toString().length()<48000){
     String role=matcher.group(1),dedup="role:"+role+":"+key(ev.getElement());if(!seen.add(dedup))continue;
     var candidate=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("state","PROPOSED").put("kind","PERSON").put("name","Role: "+role).put("targetKey",key(ev.getElement())).put("direction","INBOUND").put("basis","Source mentions a security role. This does not prove a human actor or business role; review is required.").put("sourceLocator",ev.getLocator()).put("sourceExcerpt",ev.getExcerpt().substring(0,Math.min(1200,ev.getExcerpt().length()))).put("proposalOrigin","SOURCE_CANDIDATE").put("sourceModelId",modelId.toString()).put("dedupKey",dedup);
     candidate.putArray("evidenceIds").add(ev.getId().toString());entries.add(candidate);
    }
   }
   for(var n:nodes){
    if(entries.size()>=100||review.toString().length()>48000)break;
    if(!"EXTERNAL_SYSTEM".equals(n.getElementType())||"CONFIRMED".equals(n.getProperties()==null?"":n.getProperties().path("contextReviewState").asText()))continue;
    var rel=relationships.findByModelVersionId(modelId).stream().filter(e->(e.getSourceElement().getId().equals(n.getId())&&inside.stream().anyMatch(i->i.getId().equals(e.getTargetElement().getId())))||(e.getTargetElement().getId().equals(n.getId())&&inside.stream().anyMatch(i->i.getId().equals(e.getSourceElement().getId())))).findFirst();
    if(rel.isEmpty())continue;var edge=rel.get();var target=edge.getSourceElement().getId().equals(n.getId())?edge.getTargetElement():edge.getSourceElement();String dedup="external:"+key(n);if(!seen.add(dedup))continue;
    entries.add(json.createObjectNode().put("id",UUID.randomUUID().toString()).put("state","PROPOSED").put("kind","EXTERNAL_SYSTEM").put("name",n.getName()).put("targetKey",key(target)).put("existingElementKey",key(n)).put("direction",edge.getSourceElement().getId().equals(n.getId())?"INBOUND":"OUTBOUND").put("basis","Extracted dependency candidate. External ownership and the system boundary are not established.").put("proposalOrigin","MODEL_CANDIDATE").put("sourceModelId",modelId.toString()).put("dedupKey",dedup));
   }
   review.put("lastSuggestionCount",entries.size()-before);
  }else if("PROPOSE".equals(action)||"EDIT".equals(action)){
   if(!Set.of("PERSON","EXTERNAL_SYSTEM").contains(r.kind())||!Set.of("INBOUND","OUTBOUND").contains(r.direction()))throw invalid("Invalid context kind or direction");
   String targetKey=text(r.targetKey(),500);if(inside.stream().noneMatch(n->key(n).equals(targetKey)))throw invalid("Target must be inside this model");
   if(item!=null && item.has("existingElementKey") && (!"EXTERNAL_SYSTEM".equals(r.kind()) || !item.path("targetKey").asText().equals(targetKey) || !item.path("direction").asText().equals(r.direction())))throw invalid("An extracted dependency keeps its recorded topology. Add a manual candidate for a different context decision.");
   if(item==null){if(entries.size()>=100||review.toString().length()>48000)throw invalid("Context review storage limit reached");item=json.createObjectNode().put("id",UUID.randomUUID().toString()).put("state","PROPOSED");entries.add(item);}
   item.put("name",text(r.name(),255)).put("kind",r.kind()).put("targetKey",targetKey).put("direction",r.direction()).put("basis",text(r.basis(),2000)).put("proposalOrigin","USER_PROVIDED").put("sourceModelId",modelId.toString());
   var ids=item.putArray("evidenceIds");for(var id:r.evidenceIds()==null?List.<UUID>of():r.evidenceIds()){if(citations.stream().noneMatch(e->e.getId().equals(id)))throw invalid("Evidence is not from this revision");ids.add(id.toString());}
  }else if("REJECT".equals(action))item.put("state","REJECTED");
  else if("CONFIRM".equals(action)){
   if(item.has("sourceModelId") && item.path("evidenceIds").isArray() && !item.path("evidenceIds").isEmpty()) {
    UUID sourceId;try{sourceId=UUID.fromString(item.path("sourceModelId").asText());}catch(IllegalArgumentException ex){throw invalid("Invalid source revision");}
    var source=models.findById(sourceId).orElseThrow(()->invalid("Source revision unavailable"));
    if(!source.getProject().getId().equals(base.getProject().getId()))throw invalid("Source revision belongs to another project");
    var validIds=new HashSet<String>();evidence.findByModelVersionId(sourceId).forEach(ev->validIds.add(ev.getId().toString()));
    for(var ev:item.path("evidenceIds"))if(!validIds.contains(ev.asText()))throw invalid("Source evidence reference is not valid");
   }
   String boundary=text(r.boundary(),2000);if(boundary.length()<10)throw invalid("Explain the actor role or external system boundary before confirming");
   var target=inside.stream().filter(n->key(n).equals(itemKey(r,entries))).findFirst().orElseThrow(()->invalid("Candidate target no longer exists"));
   item.put("state","CONFIRMED").put("confirmationOrigin","USER_CONFIRMED").put("confirmedBy",who).put("confirmedAt",now).put("boundary",boundary);
   var props=json.createObjectNode().put("contextReviewState","CONFIRMED").put("contextFactOrigin","USER_CONFIRMED").put("confirmedBy",who).put("confirmedAt",now).put("contextCandidateId",item.path("id").asText()).put("boundaryDecision",boundary).put("description","User-confirmed context. "+boundary);
   props.set("contextSourceReferences",item.deepCopy());
   var existingKey=item.path("existingElementKey").asText();var existing=nodes.stream().filter(n->key(n).equals(existingKey)).findFirst();
   String ref="context-"+item.path("id").asText();
   if(existing.isPresent())edits.add(new ModelVersionService.ElementEdit(existing.get().getId().toString(),"UPDATE",item.path("name").asText(),null,"STUDENT_CONFIRMED",null,null,null,props));
   else{
    edits.add(new ModelVersionService.ElementEdit(ref,"ADD",item.path("name").asText(),item.path("kind").asText(),null,null,null,null,props));
    boolean inbound="INBOUND".equals(item.path("direction").asText());links.add(new ModelVersionService.RelationshipEdit(ref+"-interaction","ADD",inbound?ref:target.getId().toString(),inbound?target.getId().toString():ref,"CODE_DEPENDENCY",true,props));
   }
  }else throw invalid("Unknown context review action");
  audit.add(json.createObjectNode().put("action",action).put("candidateId",item==null?"":item.path("id").asText()).put("actorId",who).put("at",now).put("baseModelId",modelId.toString()));
  if(review.toString().length()>63000)throw invalid("Context review history limit reached; existing decisions were not changed");
  edits.add(new ModelVersionService.ElementEdit(anchor.getId().toString(),"UPDATE",null,null,null,null,null,null,json.createObjectNode().set("contextReview",review)));
  return revisions.revise(modelId,new ModelVersionService.RevisionRequest(edits,links));
 }
 private String itemKey(Request r,ArrayNode entries){for(var entry:entries)if(entry.path("id").asText().equals(r.candidateId()))return entry.path("targetKey").asText();return "";}
}
