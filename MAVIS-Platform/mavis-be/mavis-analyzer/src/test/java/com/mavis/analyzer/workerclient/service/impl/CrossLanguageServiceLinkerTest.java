package com.mavis.analyzer.workerclient.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CrossLanguageServiceLinkerTest {
    @TempDir Path root;
    @Test void ambiguousTargetsAndDuplicateServicesAreNeverFirstMatched()throws Exception{
        Files.writeString(root.resolve("mavis.bindings.json"),"""
            {"schemaVersion":"1.0","bindings":[
              {"service":"java","projects":[],"sourceRoots":["src"],"endpoints":[]},
              {"service":"a","projects":[],"sourceRoots":[],"endpoints":["http://localhost:5001"]},
              {"service":"b","projects":[],"sourceRoots":[],"endpoints":["http://localhost:5001"]}]}
            """);
        var elements=mock(ModelElementRepository.class);var rels=mock(ModelRelationshipRepository.class);var evidence=mock(EvidenceRepository.class);
        var model=ModelVersion.builder().id(UUID.randomUUID()).build();
        when(elements.findByModelVersionId(model.getId())).thenReturn(List.of(service("java"),service("a"),service("b")));
        var linker=new CrossLanguageServiceLinker(elements,rels,evidence,new ObjectMapper());
        var call=CodeEvidenceDTO.builder().elementType("REST_TEMPLATE_CALL").endpointAlias("localhost:5001").filePath(root.resolve("src/App.java").toString()).lineNumber(1).build();
        var report=linker.link(model,root.toString(),null,List.of(call));
        assertEquals(1,report.ambiguous());assertEquals(0,report.linked());
        when(elements.findByModelVersionId(model.getId())).thenReturn(List.of(service("java"),service("java"),service("a")));
        report=linker.link(model,root.toString(),null,List.of(call));assertEquals(0,report.linked());
    }
    @Test void absentBindingsPreserveUnresolvedWithoutCreatingEdges()throws Exception{
        var elements=mock(ModelElementRepository.class);var rels=mock(ModelRelationshipRepository.class);var evidence=mock(EvidenceRepository.class);
        var model=ModelVersion.builder().id(UUID.randomUUID()).build();when(elements.findByModelVersionId(model.getId())).thenReturn(List.of(service("java"),service("localhost")));
        var call=CodeEvidenceDTO.builder().elementType("REST_TEMPLATE_CALL").endpointAlias("localhost:5001").filePath(root.resolve("App.java").toString()).lineNumber(1).build();
        var result=new CrossLanguageServiceLinker(elements,rels,evidence,new ObjectMapper()).link(model,root.toString(),null,List.of(call));
        assertEquals(1,result.unresolved());assertEquals(0,result.linked());assertNull(result.bindingHash());
    }
    private static ModelElement service(String name){return ModelElement.builder().id(UUID.randomUUID()).name(name).elementType("SERVICE_CONTAINER").build();}
}
