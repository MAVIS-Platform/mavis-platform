package com.mavis.analyzer.graph.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.impact.WorkerImpactService;
import com.mavis.analyzer.impact.ImpactGraphLoader;
import com.mavis.workerclient.ImpactWorkerClient;
import com.mavis.common.repository.*;
import com.mavis.common.entity.*;
import com.mavis.common.exception.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GraphServiceImplTest {
 private final ModelElementRepository elements=mock(ModelElementRepository.class);
 private final ModelRelationshipRepository relationships=mock(ModelRelationshipRepository.class);
 private final ModelVersionRepository models=mock(ModelVersionRepository.class);
 private final EvidenceRepository evidenceRepo=mock(EvidenceRepository.class);
 private final WorkerImpactService worker=mock(WorkerImpactService.class);
 private final com.mavis.common.security.AccessPolicyService policy=mock(com.mavis.common.security.AccessPolicyService.class);
 private final GraphServiceImpl service=new GraphServiceImpl(elements,relationships,models,evidenceRepo,worker,policy);
 @Test void detailedImpactMapsWorkerPathsEvidenceAndWarningsWithoutJavaTraversal(){
  UUID model=UUID.randomUUID(),target=UUID.randomUUID(),direct=UUID.randomUUID(),indirect=UUID.randomUUID(),evidence=UUID.randomUUID();
  var result=new ImpactWorkerClient.Result(model.toString(),"revision",target.toString(),List.of(
   new ImpactWorkerClient.Path(direct.toString(),"Direct",1,List.of(direct.toString(),target.toString()),List.of("e1"),List.of(evidence.toString())),
   new ImpactWorkerClient.Path(indirect.toString(),"Indirect",2,List.of(indirect.toString(),direct.toString(),target.toString()),List.of("e2","e1"),List.of(evidence.toString()))),true,List.of("PATH_LIMIT_REACHED"),List.of());
  when(worker.analyze(model,target,null,10,1000)).thenReturn(new WorkerImpactService.View(result,Map.of(target.toString(),"C",direct.toString(),"B",indirect.toString(),"A"),Map.of(evidence.toString(),new ImpactGraphLoader.EvidenceView(evidence.toString(),UUID.randomUUID(),"App.cs:10","1.9","STATIC_CODE",null)),List.of("EXCLUDED_UNCONFIRMED_EDGES")));
  var response=service.analyzeDetailedImpact(model,target);
  assertEquals(2,response.getTotalImpactedCount());assertEquals(1,response.getDirectlyImpactedCount());assertEquals(1,response.getIndirectlyImpactedCount());
  assertEquals(List.of("A","B","C"),response.getImpactedElements().get(1).getDependencyPathNames());
  assertEquals(evidence,response.getImpactedElements().get(0).getSupportingEvidences().get(0).getEvidenceId());
  assertTrue(response.isTruncated());assertEquals("revision",response.getGraphRevisionId());assertEquals(2,response.getWarnings().size());
  verifyNoInteractions(elements,relationships,models);
 }
 @Test void workerFailureNeverFallsBackToLocalBfs(){UUID model=UUID.randomUUID(),target=UUID.randomUUID();when(worker.analyze(model,target,null,10,1000)).thenThrow(new ImpactWorkerClient.Unavailable());assertThrows(ImpactWorkerClient.Unavailable.class,()->service.analyzeDetailedImpact(model,target));verifyNoInteractions(elements,relationships,models);}
 @Test void missingTargetFailureIsPreserved(){UUID model=UUID.randomUUID(),target=UUID.randomUUID();when(worker.analyze(model,target,null,10,1000)).thenThrow(new BusinessException(ErrorCode.NOT_FOUND,"Target missing"));assertThrows(BusinessException.class,()->service.analyzeDetailedImpact(model,target));}
 @Test void simpleImpactUsesSameWorkerEngine(){UUID model=UUID.randomUUID(),target=UUID.randomUUID(),dependent=UUID.randomUUID();when(worker.analyze(model,target,null,10,1000)).thenReturn(new WorkerImpactService.View(new ImpactWorkerClient.Result(model.toString(),"r",target.toString(),List.of(new ImpactWorkerClient.Path(dependent.toString(),"Direct",1,List.of(dependent.toString(),target.toString()),List.of(),List.of())),false,List.of(),List.of()),Map.of(dependent.toString(),"Caller"),Map.of(),List.of()));assertEquals("Caller",service.analyzeImpact(model,target).get(0).getName());verify(worker).analyze(model,target,null,10,1000);}
 @Test void graphReadStillProjectsPersistedNodes(){UUID model=UUID.randomUUID();when(models.findById(model)).thenReturn(Optional.of(ModelVersion.builder().id(model).project(Project.builder().id(UUID.randomUUID()).build()).build()));when(elements.findByModelVersionId(model)).thenReturn(List.of(ModelElement.builder().id(UUID.randomUUID()).name("service").elementType("SERVICE_CONTAINER").build()));when(relationships.findByModelVersionId(model)).thenReturn(List.of());assertEquals(1,service.getGraphDataBySessionId(model).getNodes().size());verifyNoInteractions(worker);}

 @Test void unauthorizedGraphDoesNotReadNodesOrEdges(){var project=Project.builder().id(UUID.randomUUID()).build();var model=ModelVersion.builder().id(UUID.randomUUID()).project(project).build();when(models.findById(model.getId())).thenReturn(Optional.of(model));doThrow(new BusinessException(ErrorCode.FORBIDDEN)).when(policy).requireProjectReadAccess(project);assertThrows(BusinessException.class,()->service.getGraphDataBySessionId(model.getId()));verifyNoInteractions(elements,relationships,evidenceRepo);}
 @Test void existingEmptyModelIsAnEmptyGraph(){var model=ModelVersion.builder().id(UUID.randomUUID()).project(Project.builder().id(UUID.randomUUID()).build()).build();when(models.findById(model.getId())).thenReturn(Optional.of(model));assertTrue(service.getGraphDataBySessionId(model.getId()).getNodes().isEmpty());}

 // S2a: metadata passthrough từ ModelElement.properties qua mapping thật của service (không mock mapping).
 private final ObjectMapper json = new ObjectMapper();
 private ModelVersion modelWith(UUID id){return ModelVersion.builder().id(id).project(Project.builder().id(UUID.randomUUID()).build()).build();}
 @Test void graphReadPassesChannelMetadataThroughFromProperties(){UUID model=UUID.randomUUID(),channelId=UUID.randomUUID(),plainId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  var props=json.createObjectNode();props.put("channelName","order-events").put("protocol","kafka").put("logicalKey","order-events@kafka").put("transportAuthority","kafka");
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
   ModelElement.builder().id(channelId).name("order-events [kafka]").elementType("MESSAGE_CHANNEL").properties(props).build(),
   ModelElement.builder().id(plainId).name("orders-db").elementType("DATABASE").build()));
  var nodes=service.getGraphDataBySessionId(model).getNodes();
  var channel=nodes.stream().filter(n->n.getId().equals(channelId)).findFirst().orElseThrow();
  assertEquals("kafka",channel.getProtocol());assertEquals("kafka",channel.getTransportAuthority());assertNull(channel.getResolutionIssue());
  assertEquals("order-events [kafka]",channel.getName());assertEquals("MESSAGE_CHANNEL",channel.getType());
  var plain=nodes.stream().filter(n->n.getId().equals(plainId)).findFirst().orElseThrow();
  assertNull(plain.getProtocol());assertNull(plain.getTransportAuthority());assertNull(plain.getResolutionIssue());
  verifyNoInteractions(worker);}
 @Test void unresolvedTransportKeepsProtocolAndIssueWithoutAuthority(){UUID model=UUID.randomUUID(),channelId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  // Đúng shape nhánh unresolved của GraphBuilderServiceImpl (:322-325): có protocol + resolutionIssue, không transportAuthority.
  var props=json.createObjectNode();props.put("channelName","order-events").put("protocol","kafka").put("resolutionIssue","UNRESOLVED_MESSAGE_TRANSPORT");
  when(elements.findByModelVersionId(model)).thenReturn(List.of(ModelElement.builder().id(channelId).name("order-events [kafka]").elementType("MESSAGE_CHANNEL").properties(props).status("UNCERTAIN_MAPPING").build()));
  var node=service.getGraphDataBySessionId(model).getNodes().get(0);
  assertEquals("kafka",node.getProtocol());assertEquals("UNRESOLVED_MESSAGE_TRANSPORT",node.getResolutionIssue());assertNull(node.getTransportAuthority());}
 @Test void missingBlankAndNonTextualMetadataBecomeNullWithoutBreakingResponse(){UUID model=UUID.randomUUID(),weirdId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  var props=json.createObjectNode();props.put("protocol",42).put("transportAuthority","").put("resolutionIssue",true).put("languageStack","kafka");
  when(elements.findByModelVersionId(model)).thenReturn(List.of(ModelElement.builder().id(weirdId).name("weird").elementType("MESSAGE_CHANNEL").properties(props).build()));
  var node=service.getGraphDataBySessionId(model).getNodes().get(0);
  assertNull(node.getProtocol());assertNull(node.getTransportAuthority());assertNull(node.getResolutionIssue());
  assertEquals("weird",node.getName());assertEquals("MESSAGE_CHANNEL",node.getType());}
 @Test void metadataJsonNullObjectArrayAndWhitespaceBecomeNullValidTextPreserved(){UUID model=UUID.randomUUID(),bad=UUID.randomUUID(),good=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  var badProps=json.createObjectNode();badProps.putNull("protocol");badProps.putObject("transportAuthority").put("nested","x");badProps.putArray("resolutionIssue").add("a");
  var goodProps=json.createObjectNode();goodProps.put("protocol","kafka ").put("transportAuthority","   ").putNull("resolutionIssue");
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
   ModelElement.builder().id(bad).name("bad").elementType("MESSAGE_CHANNEL").properties(badProps).build(),
   ModelElement.builder().id(good).name("good").elementType("MESSAGE_CHANNEL").properties(goodProps).build()));
  var nodes=service.getGraphDataBySessionId(model).getNodes();
  var badNode=nodes.stream().filter(n->n.getId().equals(bad)).findFirst().orElseThrow();
  assertNull(badNode.getProtocol());assertNull(badNode.getTransportAuthority());assertNull(badNode.getResolutionIssue());
  var goodNode=nodes.stream().filter(n->n.getId().equals(good)).findFirst().orElseThrow();
  assertEquals("kafka ",goodNode.getProtocol());assertNull(goodNode.getTransportAuthority());assertNull(goodNode.getResolutionIssue());}
 @Test void nodeMetadataSerializesWithProjectJacksonConvention()throws Exception{UUID model=UUID.randomUUID(),channelId=UUID.randomUUID(),plainId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  var props=json.createObjectNode();props.put("protocol","kafka").put("transportAuthority","kafka");
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
   ModelElement.builder().id(channelId).name("order-events [kafka]").elementType("MESSAGE_CHANNEL").properties(props).build(),
   ModelElement.builder().id(plainId).name("orders-db").elementType("DATABASE").build()));
  // Dự án không có ObjectMapper toàn cục tùy biến (chỉ ApiResponse tự khai báo NON_NULL ở class level),
  // nên convention API hiện hành là Jackson mặc định: field null vẫn được serialize.
  var mapper=new ObjectMapper();
  var channel=mapper.writeValueAsString(service.getGraphDataBySessionId(model).getNodes().get(0));
  assertTrue(channel.contains("\"protocol\":\"kafka\""));assertTrue(channel.contains("\"transportAuthority\":\"kafka\""));
  var plain=mapper.writeValueAsString(service.getGraphDataBySessionId(model).getNodes().get(1));
  assertTrue(plain.contains("\"protocol\":null"));assertTrue(plain.contains("\"resolutionIssue\":null"));}

 @Test void graphReadMapsBatchEvidenceIdsAndCountToEdges(){
  UUID model=UUID.randomUUID(),relId=UUID.randomUUID(),ev1=UUID.randomUUID(),ev2=UUID.randomUUID();
  UUID srcId=UUID.randomUUID(),tgtId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
    ModelElement.builder().id(srcId).name("S1").elementType("SERVICE_CONTAINER").build(),
    ModelElement.builder().id(tgtId).name("S2").elementType("SERVICE_CONTAINER").build()));
  var rel = ModelRelationship.builder().id(relId).relationType("SERVICE_HTTP_CALL")
    .sourceElement(ModelElement.builder().id(srcId).build())
    .targetElement(ModelElement.builder().id(tgtId).build()).build();
  when(relationships.findByModelVersionId(model)).thenReturn(List.of(rel));
  List<Object[]> rows = new ArrayList<>();
  rows.add(new Object[]{relId, ev1});
  rows.add(new Object[]{relId, ev2});
  when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(model)).thenReturn(rows);

  var edges = service.getGraphDataBySessionId(model).getEdges();
  assertEquals(1, edges.size());
  assertEquals(2L, edges.get(0).getEvidenceCount());
  assertEquals(List.of(ev1, ev2), edges.get(0).getEvidenceIds());
 }

 @Test void graphReadPreservesVerifiedZeroEvidenceWhenQuerySucceedsWithNoRows(){
  UUID model=UUID.randomUUID(),relId=UUID.randomUUID(),srcId=UUID.randomUUID(),tgtId=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
    ModelElement.builder().id(srcId).name("S1").elementType("SERVICE_CONTAINER").build(),
    ModelElement.builder().id(tgtId).name("S2").elementType("SERVICE_CONTAINER").build()));
  var rel = ModelRelationship.builder().id(relId).relationType("SERVICE_HTTP_CALL")
    .sourceElement(ModelElement.builder().id(srcId).build())
    .targetElement(ModelElement.builder().id(tgtId).build()).build();
  when(relationships.findByModelVersionId(model)).thenReturn(List.of(rel));
  when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(model)).thenReturn(Collections.emptyList());

  var edges = service.getGraphDataBySessionId(model).getEdges();
  assertEquals(1, edges.size());
  assertEquals(0L, edges.get(0).getEvidenceCount());
  assertTrue(edges.get(0).getEvidenceIds().isEmpty());
 }

 @Test void graphReadFailsWhenEvidenceQueryThrowsException(){
  UUID model=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  when(elements.findByModelVersionId(model)).thenReturn(List.of());
  when(relationships.findByModelVersionId(model)).thenReturn(List.of());
  when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(model)).thenThrow(new RuntimeException("DB connection error"));

  assertThrows(RuntimeException.class, () -> service.getGraphDataBySessionId(model));
 }

 @Test void graphReadExecutesSingleBatchCallForMultipleEdges(){
  UUID model=UUID.randomUUID(),r1=UUID.randomUUID(),r2=UUID.randomUUID(),r3=UUID.randomUUID();
  UUID s1=UUID.randomUUID(),s2=UUID.randomUUID(),s3=UUID.randomUUID();
  when(models.findById(model)).thenReturn(Optional.of(modelWith(model)));
  when(elements.findByModelVersionId(model)).thenReturn(List.of(
    ModelElement.builder().id(s1).name("S1").elementType("SERVICE_CONTAINER").build(),
    ModelElement.builder().id(s2).name("S2").elementType("SERVICE_CONTAINER").build(),
    ModelElement.builder().id(s3).name("S3").elementType("SERVICE_CONTAINER").build()));
  var rel1 = ModelRelationship.builder().id(r1).relationType("SERVICE_HTTP_CALL").sourceElement(ModelElement.builder().id(s1).build()).targetElement(ModelElement.builder().id(s2).build()).build();
  var rel2 = ModelRelationship.builder().id(r2).relationType("DATABASE_ACCESS").sourceElement(ModelElement.builder().id(s2).build()).targetElement(ModelElement.builder().id(s3).build()).build();
  var rel3 = ModelRelationship.builder().id(r3).relationType("CODE_DEPENDENCY").sourceElement(ModelElement.builder().id(s1).build()).targetElement(ModelElement.builder().id(s3).build()).build();
  when(relationships.findByModelVersionId(model)).thenReturn(List.of(rel1, rel2, rel3));
  UUID evA = UUID.randomUUID();
  List<Object[]> rows = new ArrayList<>();
  rows.add(new Object[]{r1, evA});
  when(evidenceRepo.findRelationshipEvidenceIdsByModelVersionId(model)).thenReturn(rows);

  var edges = service.getGraphDataBySessionId(model).getEdges();
  assertEquals(3, edges.size());
  // Verify exactly 1 batch call (O(1) query) across all edges
  verify(evidenceRepo, times(1)).findRelationshipEvidenceIdsByModelVersionId(model);
 }
}
