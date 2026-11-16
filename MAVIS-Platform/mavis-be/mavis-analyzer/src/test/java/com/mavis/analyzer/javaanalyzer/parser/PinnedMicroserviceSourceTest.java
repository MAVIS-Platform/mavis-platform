package com.mavis.analyzer.javaanalyzer.parser;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class PinnedMicroserviceSourceTest {
    @Test @EnabledIfSystemProperty(named="mavis.seed.source", matches=".+")
    void pinnedSourceHasClientsModelsMethodCfgAndInfrastructureConfiguration() throws Exception {
        var source=System.getProperty("mavis.seed.source");
        var findings=new JavaSourceParser().parseProject(source);
        var classifiers=findings.stream().filter(f->"CLASS_INTERFACE".equals(f.getElementType())).toList();
        var clients=classifiers.stream().filter(f->f.getIdentifier().endsWith("Client")).toList();
        var configs=new SpringConfigDetectorServiceImpl().detectConfigs(source);
        var mapper=new ObjectMapper();
        var output=Map.of("classifiers",classifiers,"configurations",configs,"findings",findings);
        Files.writeString(Path.of(source).getParent().resolve("extraction-audit.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(output));
        System.out.println("SEED_AUDIT classifiers="+classifiers.size()+" clients="+clients.size()+" configTargets="+configs.stream().mapToInt(c->c.getTargetServiceUrls().size()).sum());
        assertThat(clients).hasSize(3);
        assertThat(classifiers).anyMatch(f->"ErrorCode".equals(f.getIdentifier()));
        var elementRepo=org.mockito.Mockito.mock(com.mavis.common.repository.ModelElementRepository.class);
        var relationRepo=org.mockito.Mockito.mock(com.mavis.common.repository.ModelRelationshipRepository.class);
        var evidenceRepo=org.mockito.Mockito.mock(com.mavis.common.repository.EvidenceRepository.class);
        var savedNodes=new ArrayList<com.mavis.common.entity.ModelElement>();var savedEdges=new ArrayList<com.mavis.common.entity.ModelRelationship>();
        org.mockito.Mockito.when(elementRepo.saveAll(org.mockito.ArgumentMatchers.any())).thenAnswer(call->{List<com.mavis.common.entity.ModelElement> values=call.getArgument(0);for(var node:values){if(node.getId()==null)node.setId(UUID.randomUUID());savedNodes.add(node);}return values;});
        org.mockito.Mockito.when(elementRepo.save(org.mockito.ArgumentMatchers.any())).thenAnswer(call->{com.mavis.common.entity.ModelElement node=call.getArgument(0);if(node.getId()==null)node.setId(UUID.randomUUID());savedNodes.add(node);return node;});
        org.mockito.Mockito.when(relationRepo.saveAll(org.mockito.ArgumentMatchers.any())).thenAnswer(call->{List<com.mavis.common.entity.ModelRelationship> values=call.getArgument(0);for(var edge:values){if(edge.getId()==null)edge.setId(UUID.randomUUID());savedEdges.add(edge);}return values;});
        var docker=new com.mavis.analyzer.detector.docker.service.impl.DockerDetectorServiceImpl();
        var builder=new com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl(elementRepo,relationRepo,evidenceRepo,docker,new SpringConfigDetectorServiceImpl(),null);
        var project=com.mavis.common.entity.Project.builder().id(UUID.randomUUID()).name("Pinned organization API").build();
        var snapshot=com.mavis.common.entity.SourceSnapshot.builder().id(UUID.randomUUID()).project(project).storagePath(source).build();
        var model=com.mavis.common.entity.ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).revision(1).build();
        var roots=builder.buildAndSaveElements(model,docker.detectServices(source),source);
        builder.buildRelationshipsAndEvidences(snapshot,model,roots,findings);
        assertThat(savedNodes).filteredOn(n->n.getName().endsWith("Client")).hasSize(3);
        assertThat(savedNodes).filteredOn(n->n.getProperties()!=null&&n.getProperties().has("umlClassifier")).hasSize(22);
        assertThat(savedEdges).anyMatch(e->"GATEWAY_ROUTE".equals(e.getRelationType()));
        var nodeJson=new ArrayList<Map<String,Object>>();for(var node:savedNodes){var value=new LinkedHashMap<String,Object>();value.put("id",node.getId().toString());value.put("name",node.getName());value.put("elementType",node.getElementType());value.put("parentId",node.getParentElement()==null?null:node.getParentElement().getId().toString());value.put("properties",node.getProperties());value.put("description","");value.put("layer","unclassified");value.put("evidence",List.of());nodeJson.add(value);}
        var edgeJson=new ArrayList<Map<String,Object>>();for(var edge:savedEdges){var value=new LinkedHashMap<String,Object>();value.put("id",edge.getId().toString());value.put("from",edge.getSourceElement().getId().toString());value.put("to",edge.getTargetElement().getId().toString());value.put("protocol",edge.getRelationType());value.put("originLayer",edge.getOriginLayer());value.put("properties",edge.getProperties());value.put("uncertain",false);value.put("evidence",List.of());edgeJson.add(value);}
        Files.writeString(Path.of(source).getParent().resolve("published-model.json"),mapper.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("id",model.getId().toString(),"projectId",project.getId().toString(),"snapshotId",snapshot.getId().toString(),"revision",1,"label","Pinned source", "elements",nodeJson,"edges",edgeJson)));
        System.out.println("SEED_MODEL nodes="+savedNodes.size()+" relationships="+savedEdges.size());
        assertThat(configs.stream().flatMap(c->c.getTargetServiceUrls().stream())).anyMatch(t->"GATEWAY_ROUTE".equals(t.getRelationType()));
    }
}