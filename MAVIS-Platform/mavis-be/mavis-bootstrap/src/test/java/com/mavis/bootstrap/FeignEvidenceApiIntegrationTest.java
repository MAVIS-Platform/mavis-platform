package com.mavis.bootstrap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.entity.*;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class FeignEvidenceApiIntegrationTest extends ApiIntegrationContext {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired GraphBuilderService graph;
    @Autowired JavaSourceParser parser;
    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired ProjectRepository projects;
    @Autowired SourceSnapshotRepository snapshots;
    @Autowired ModelVersionRepository versions;
    @Autowired ModelElementRepository elements;
    @Autowired ModelRelationshipRepository relationships;
    @Autowired EvidenceRepository evidence;
    @TempDir Path root;
    void write(String file,String text) throws Exception {
        var target=root.resolve(file);Files.createDirectories(target.getParent());Files.writeString(target,text);
    }
    User user() { return users.saveAndFlush(User.builder().email(UUID.randomUUID()+"@example.invalid").fullName("Feign test")
            .passwordHash("fixture-only").status("ACTIVE").role(roles.findByCode("STUDENT").orElseThrow()).build()); }
    @Test void persistedCallerAndReceiverProofsStayOnTheirExactRelationshipAndRequireProjectReadAccess() throws Exception {
        write("order-service/src/main/java/order/CatalogClient.java","""
            package order;
            @FeignClient(name="catalog-service",path="/api/catalog") interface CatalogClient {
              @PostMapping("/inventory/deduct") String deductInventory(String request);
              @GetMapping("/products/variants/{variantId}/internal") String getVariantInternalInfo(Long variantId);
            }
            """);
        write("order-service/src/main/java/order/OrderService.java","""
            package order;
            @Service class OrderService { CatalogClient catalog;
              void buy() { catalog.deductInventory("request"); }
              Object view() { return catalog.getVariantInternalInfo(1L); }
            }
            """);
        write("catalog-service/src/main/java/catalog/CatalogController.java","""
            package catalog;
            @RestController @RequestMapping("/api/catalog") class CatalogController {
              @PostMapping("/inventory/deduct") String receiveDeduction(String request) { return "ok"; }
              @GetMapping("/products/variants/{id}/internal") String receiveVariant(Long id) { return "ok"; }
            }
            """);
        var owner=user();var outsider=user();
        var project=projects.saveAndFlush(Project.builder().owner(owner).name("Feign evidence fixture").build());
        var snapshot=snapshots.saveAndFlush(SourceSnapshot.builder().project(project).sourceType("ZIP_UPLOAD")
                .storagePath(root.toString()).artifactHash("a".repeat(64)).build());
        var version=versions.saveAndFlush(ModelVersion.builder().project(project).sourceSnapshot(snapshot).createdBy(owner)
                .revision(1).schemaVersion("1.0").origin("GENERATED").isLatestValid(true).build());
        List<ModelElement> services=new ArrayList<>();
        for(String name:List.of("order-service","catalog-service")) services.add(elements.saveAndFlush(ModelElement.builder()
                .modelVersion(version).name(name).elementType("SERVICE_CONTAINER").scope(root.resolve(name).toString())
                .properties(json.createObjectNode().put("buildContext",root.resolve(name).toString())).build()));
        graph.buildRelationshipsAndEvidences(snapshot,version,services,parser.parseProject(root.toString()));
        relationships.flush();evidence.flush();
        var http=relationships.findByModelVersionId(version.getId()).stream().filter(r->r.getProperties()!=null
                && "OPENFEIGN".equals(r.getProperties().path("clientFramework").asText())).toList();
        assertThat(http).hasSize(2);
        mvc.perform(get("/api/v1/analyzer/models/"+version.getId()+"/graph").header("Authorization",testAuthorization(owner.getEmail())))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.edges[?(@.properties.clientFramework == 'OPENFEIGN')]").value(org.hamcrest.Matchers.hasSize(2)));
        for(var relation:http) {
            var response=mvc.perform(get("/api/v1/analyzer/evidences/relationship/"+relation.getId())
                    .header("Authorization",testAuthorization(owner.getEmail()))).andExpect(status().isOk()).andReturn();
            var rows=json.readTree(response.getResponse().getContentAsString()).path("data");
            assertThat(rows.size()).isEqualTo(4);
            Set<String> rolesSeen=new HashSet<>();
            boolean post=relation.getProperties().path("httpMethod").asText().equals("POST");
            for(var row:rows) {
                assertThat(row.path("modelVersionId").asText()).isEqualTo(version.getId().toString());
                assertThat(row.path("sourceSnapshotId").asText()).isEqualTo(snapshot.getId().toString());
                assertThat(row.path("relationshipId").asText()).isEqualTo(relation.getId().toString());
                String role=row.path("provenance").path("communicationRole").asText();rolesSeen.add(role);
                if(role.equals("CALL_SITE")) assertThat(row.path("excerpt").asText()).contains(post?"deductInventory":"getVariantInternalInfo");
                if(role.equals("SERVER_ENDPOINT")) assertThat(row.path("excerpt").asText()).contains(post?"receiveDeduction":"receiveVariant");
                assertThat(row.path("locator").asText()).matches(".+\\.java:[1-9][0-9]*");
            }
            assertThat(rolesSeen).containsExactlyInAnyOrder("CLIENT_DECLARATION","CLIENT_CONTRACT","CALL_SITE","SERVER_ENDPOINT");
            mvc.perform(get("/api/v1/analyzer/evidences/relationship/"+relation.getId())
                    .header("Authorization",testAuthorization(outsider.getEmail()))).andExpect(status().isForbidden());
        }
    }
}
