package com.mavis.analyzer.graph.service.impl;

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
 private final WorkerImpactService worker=mock(WorkerImpactService.class);
 private final GraphServiceImpl service=new GraphServiceImpl(elements,relationships,models,worker);
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
 @Test void graphReadStillProjectsPersistedNodes(){UUID model=UUID.randomUUID();when(elements.findByModelVersionId(model)).thenReturn(List.of(ModelElement.builder().id(UUID.randomUUID()).name("service").elementType("SERVICE_CONTAINER").build()));when(relationships.findByModelVersionId(model)).thenReturn(List.of());assertEquals(1,service.getGraphDataBySessionId(model).getNodes().size());verifyNoInteractions(worker);}
}
