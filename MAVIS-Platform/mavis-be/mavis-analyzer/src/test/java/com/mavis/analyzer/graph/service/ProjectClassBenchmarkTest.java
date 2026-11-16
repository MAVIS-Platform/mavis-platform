package com.mavis.analyzer.graph.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl;
import com.mavis.analyzer.detector.docker.service.impl.DockerDetectorServiceImpl;
import com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** Optional repository benchmark. Input paths and assertions are not production matching rules. */
class ProjectClassBenchmarkTest {
    @Test void exportCanonicalClassBenchmark() throws Exception {
        String source = System.getProperty("mavis.benchmark.source");
        assumeTrue(source != null && Files.isDirectory(Path.of(source)), "Set mavis.benchmark.source to run a local source benchmark");
        String output = Objects.requireNonNull(System.getProperty("mavis.benchmark.output"));
        var elementRepo = mock(ModelElementRepository.class);
        var relationshipRepo = mock(ModelRelationshipRepository.class);
        var evidenceRepo = mock(EvidenceRepository.class);
        var elements = new ArrayList<ModelElement>();
        var relationships = new ArrayList<ModelRelationship>();
        when(elementRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelElement> input = inv.getArgument(0); var saved = new ArrayList<ModelElement>();
            input.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); saved.add(e); }); elements.addAll(saved); return saved;
        });
        when(relationshipRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<ModelRelationship> input = inv.getArgument(0); var saved = new ArrayList<ModelRelationship>();
            input.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); saved.add(e); }); relationships.addAll(saved); return saved;
        });
        when(evidenceRepo.saveAll(any())).thenAnswer(inv -> {
            Iterable<Evidence> input = inv.getArgument(0); var saved = new ArrayList<Evidence>();
            input.forEach(e -> { if (e.getId() == null) e.setId(UUID.randomUUID()); saved.add(e); }); return saved;
        });
        var project = Project.builder().id(UUID.randomUUID()).name("source-benchmark").build();
        var snapshot = SourceSnapshot.builder().id(UUID.randomUUID()).project(project).storagePath(source).build();
        var version = ModelVersion.builder().id(UUID.randomUUID()).project(project).sourceSnapshot(snapshot).revision(1).build();
        var facts = new JavaSourceParser().parseProject(source);
        var builder = new GraphBuilderServiceImpl(elementRepo, relationshipRepo, evidenceRepo, new DockerDetectorServiceImpl(), new SpringConfigDetectorServiceImpl());
        var roots = builder.buildAndSaveElements(version, null, source);
        builder.buildRelationshipsAndEvidences(snapshot, version, roots, facts);
        assertThat(elements).isNotEmpty();
        var mapper = new ObjectMapper();
        var model = mapper.createObjectNode().put("id", version.getId().toString()).put("projectId", project.getId().toString()).put("snapshotId", snapshot.getId().toString()).put("revision", 1).put("label", "Source benchmark");
        var nodes = model.putArray("elements");
        var ids = new HashSet<UUID>();
        for (var e : elements) if (ids.add(e.getId())) {
            var node = nodes.addObject().put("id", e.getId().toString()).put("name", e.getName()).put("elementType", e.getElementType()).put("parentId", e.getParentElement() == null ? null : e.getParentElement().getId().toString());
            node.set("properties", e.getProperties()); node.putArray("evidence");
        }
        var edges = model.putArray("edges");
        for (var r : relationships) {
            assertThat(ids).contains(r.getSourceElement().getId(), r.getTargetElement().getId());
            var edge = edges.addObject().put("id", r.getId().toString()).put("from", r.getSourceElement().getId().toString()).put("to", r.getTargetElement().getId().toString()).put("protocol", r.getRelationType()).put("originLayer", r.getOriginLayer()).put("uncertain", false);
            edge.set("properties", r.getProperties()); edge.putArray("evidence");
        }
        Path destination = Path.of(output).toAbsolutePath(); Files.createDirectories(destination.getParent());
        mapper.writerWithDefaultPrettyPrinter().writeValue(destination.toFile(), model);
        System.out.println("CLASS_BENCHMARK nodes=" + nodes.size() + " edges=" + edges.size() + " output=" + destination);
    }
}
