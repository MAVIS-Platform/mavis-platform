package com.mavis.analyzer.workerclient.service.impl;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;

class ServiceBindingIndexTest {
    @TempDir Path root;
    @Test void portsAreDistinctAndDuplicateAliasesStayAmbiguous()throws Exception{
        Files.writeString(root.resolve("mavis.bindings.json"),"""
            {"schemaVersion":"1.0","bindings":[
             {"service":"java","projects":[],"sourceRoots":["src/java"],"endpoints":["http://localhost:5001","https://JAVA"]},
             {"service":"dotnet","projects":["src/Orders/App.csproj"],"sourceRoots":[],"endpoints":["http://localhost:5002","http://shared:8080"]},
             {"service":"other","projects":[],"sourceRoots":[],"endpoints":["http://shared:8080"]}]}
            """);
        var index=ServiceBindingIndex.load(root);
        assertEquals(Set.of("java"),index.endpoint("localhost:5001"));assertEquals(Set.of("dotnet"),index.endpoint("localhost:5002"));
        assertEquals(Set.of("dotnet","other"),index.endpoint("shared:8080"));assertEquals(Set.of("java"),index.endpoint("java:443"));
        assertEquals(Set.of("dotnet"),index.project("src/Orders/App.csproj"));assertEquals(Set.of("java"),index.source("src/java/X.java"));
        assertTrue(index.source("src/java-other/X.java").isEmpty());assertEquals(64,index.hash().length());
        assertNull(ServiceBindingIndex.alias("arbitrary-client"));assertNull(ServiceBindingIndex.alias("https://user:password@host"));
    }
    @Test void absentMappingDoesNotGuessAndInvalidInputFails()throws Exception{
        assertTrue(ServiceBindingIndex.load(root).project("src/App.csproj").isEmpty());
        Files.writeString(root.resolve("mavis.bindings.json"),"{\"schemaVersion\":\"1.0\",\"bindings\":[{\"service\":\"s\",\"projects\":[\"../outside\"],\"sourceRoots\":[],\"endpoints\":[]}]}");
        assertThrows(java.io.IOException.class,()->ServiceBindingIndex.load(root));
    }
}
