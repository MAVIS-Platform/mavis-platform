package com.mavis.analyzer.model.service.impl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ModelVersionServiceImplTest {
 final ProjectRepository projects=mock(ProjectRepository.class);
 final ModelVersionRepository models=mock(ModelVersionRepository.class);
 final ModelElementRepository elements=mock(ModelElementRepository.class);
 final ModelRelationshipRepository relationships=mock(ModelRelationshipRepository.class);
 final EvidenceRepository evidence=mock(EvidenceRepository.class);
 final DiagramProjectionService diagrams=mock(DiagramProjectionService.class);
 final ObjectMapper json=new ObjectMapper();
 final ModelVersionServiceImpl service=new ModelVersionServiceImpl(projects,models,elements,relationships,evidence,diagrams,json);
 Project project;ModelVersion base;ModelElement node;
 @BeforeEach void setup(){
  var owner=User.builder().id(UUID.randomUUID()).build();project=Project.builder().id(UUID.randomUUID()).owner(owner).build();
  base=ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(SourceSnapshot.builder().id(UUID.randomUUID()).build()).revision(1).schemaVersion("1.0").origin("GENERATED").isLatestValid(true).build();
  node=ModelElement.builder().id(UUID.randomUUID()).modelVersion(base).name("Orders").elementType("SERVICE_CONTAINER").status("NEEDS_REVIEW").properties(json.createObjectNode().put("logicalKey","orders")).build();
  SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(owner.getId().toString(),"test",List.of()));
  when(projects.findById(project.getId())).thenReturn(Optional.of(project));when(projects.findLockedById(project.getId())).thenReturn(Optional.of(project));
  when(models.findById(base.getId())).thenReturn(Optional.of(base));when(models.findByProjectId(project.getId())).thenReturn(List.of(base));when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId())).thenReturn(Optional.of(base));when(models.findMaxRevisionByProjectId(project.getId())).thenReturn(1);
  when(elements.findByModelVersionId(base.getId())).thenReturn(List.of(node));when(relationships.findByModelVersionId(base.getId())).thenReturn(List.of());when(evidence.findByModelVersionId(base.getId())).thenReturn(List.of());
  when(models.save(any())).thenAnswer(call->{ModelVersion value=call.getArgument(0);if(value.getId()==null)value.setId(UUID.randomUUID());when(models.findById(value.getId())).thenReturn(Optional.of(value));return value;});
  when(elements.saveAll(any())).thenAnswer(call->{Collection<ModelElement> values=call.getArgument(0);for(var value:values)if(value.getId()==null)value.setId(UUID.randomUUID());return new ArrayList<>(values);});
  when(relationships.saveAll(any())).thenAnswer(call->{Collection<ModelRelationship> values=call.getArgument(0);for(var value:values)if(value.getId()==null)value.setId(UUID.randomUUID());return new ArrayList<>(values);});
 }
 @AfterEach void cleanup(){SecurityContextHolder.clearContext();}
 @Test void listsRevisionsWithOwnerGuard(){assertEquals(1,service.getModelVersionsByProject(project.getId()).size());SecurityContextHolder.clearContext();assertThrows(RuntimeException.class,()->service.getModelVersionsByProject(project.getId()));}
 @Test void javaRequestCreatesControlledRevisionWithMetadataAndEvidence(){
  var request=ModelRevisionRequestDTO.builder().modifiedElements(List.of(ModelRevisionRequestDTO.ElementModificationDTO.builder().id(node.getId()).newName("Renamed").status("STUDENT_CONFIRMED").build())).addedElements(List.of(ModelRevisionRequestDTO.ElementCreateDTO.builder().name("Gateway").languageStack("JAVA").properties(json.createObjectNode().put("displayTag","manual")).build())).addedRelationships(List.of(ModelRevisionRequestDTO.RelationshipCreateDTO.builder().sourceElementName("Gateway").targetElementId(node.getId()).build())).build();
  var response=service.createControlledRevision(base.getId(),request);assertEquals(2,response.getRevision());assertEquals("USER_CONFIRMED",response.getOrigin());assertTrue(response.getIsLatestValid());
  var captor=org.mockito.ArgumentCaptor.forClass(Collection.class);verify(elements).saveAll(captor.capture());var copied=(Collection<ModelElement>)captor.getValue();var added=copied.stream().filter(n->n.getName().equals("Gateway")).findFirst().orElseThrow();assertEquals("JAVA",added.getLanguageStack());assertEquals("manual",added.getProperties().path("displayTag").asText());verify(diagrams).generateDefaultDiagramsForModel(any(),anyList(),anyList());verify(evidence).saveAll(any());verify(models).invalidatePreviousVersions(project.getId(),response.getId());assertEquals("Orders",node.getName());
 }
 @Test void removingNodeRemovesIncidentRelationships(){var edge=ModelRelationship.builder().id(UUID.randomUUID()).modelVersion(base).sourceElement(node).targetElement(node).relationType("SERVICE_HTTP_CALL").build();when(relationships.findByModelVersionId(base.getId())).thenReturn(List.of(edge));service.createControlledRevision(base.getId(),ModelRevisionRequestDTO.builder().removedElementIds(List.of(node.getId())).build());verify(relationships).saveAll(argThat(values -> !values.iterator().hasNext()));}
 @Test void logicalDiffClassifiesRenameAsModified(){var next=ModelVersion.builder().id(UUID.randomUUID()).project(project).revision(2).build();when(models.findById(next.getId())).thenReturn(Optional.of(next));var renamed=ModelElement.builder().id(UUID.randomUUID()).modelVersion(next).name("Renamed").elementType(node.getElementType()).status(node.getStatus()).properties(node.getProperties()).build();when(elements.findByModelVersionId(next.getId())).thenReturn(List.of(renamed));when(relationships.findByModelVersionId(next.getId())).thenReturn(List.of());var diff=service.compareModelVersions(base.getId(),next.getId());assertEquals(1,diff.getModifiedElements().size());assertTrue(diff.getAddedElements().isEmpty());assertEquals(1,diff.getSummary().getTotalModified());}
 @Test void rejectsMissingStaleOrForgedIdentity(){assertThrows(BusinessException.class,()->service.createControlledRevision(UUID.randomUUID(),ModelRevisionRequestDTO.builder().build()));when(models.findFirstByProjectIdAndIsLatestValidTrueOrderByRevisionDesc(project.getId())).thenReturn(Optional.empty());assertThrows(BusinessException.class,()->service.createControlledRevision(base.getId(),ModelRevisionRequestDTO.builder().build()));verify(models,never()).save(any());}
}
