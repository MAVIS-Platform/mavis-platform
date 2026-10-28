package com.mavis.analyzer.graph.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.detector.config.dto.*;
import com.mavis.common.entity.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class FeignCommunicationResolverTest {
    @TempDir Path root;
    final ObjectMapper json=new ObjectMapper();
    final ModelVersion version=ModelVersion.builder().id(UUID.randomUUID()).build();
    static final String CLIENT="""
        package shop.order;
        @FeignClient(name="catalog-service",path="/api/catalog")
        interface CatalogFeignClient {
          @PostMapping("/inventory/deduct") String deductInventory(String request);
          @GetMapping("/products/variants/{variantId}/internal") String getVariantInternalInfo(Long variantId);
        }
        """;
    static final String CALLER="""
        package shop.order;
        @Service class OrderService {
          CatalogFeignClient catalog;
          void purchase() { catalog.deductInventory("request"); }
          Object view() { return catalog.getVariantInternalInfo(1L); }
        }
        """;
    static final String SERVER="""
        package shop.catalog;
        @RestController @RequestMapping("/api/catalog") class CatalogController {
          @PostMapping("/inventory/deduct") String deduct(String request) { return "ok"; }
          @GetMapping("/products/variants/{id}/internal") String variant(Long id) { return "ok"; }
        }
        """;
    void write(String relative,String text) throws Exception {
        var file=root.resolve(relative);Files.createDirectories(file.getParent());Files.writeString(file,text);
    }
    void fixture(String client,String caller,String server) throws Exception {
        write("order-service/src/main/java/shop/order/CatalogFeignClient.java",client);
        write("order-service/src/main/java/shop/order/OrderService.java",caller);
        write("catalog-service/src/main/java/shop/catalog/CatalogController.java",server);
    }
    ModelElement service(String name) {
        return ModelElement.builder().id(UUID.randomUUID()).modelVersion(version).name(name).elementType("SERVICE_CONTAINER")
                .scope(root.resolve(name).toString()).properties(json.createObjectNode().put("buildContext",root.resolve(name).toString())).build();
    }
    List<CodeEvidenceDTO> facts() { return new JavaSourceParser().parseProject(root.toString()); }
    List<FeignCommunicationResolver.Connection> resolve(List<ModelElement> nodes,List<DetectedSpringConfigDTO> configs) {
        var facts=facts();return new FeignCommunicationResolver(json,nodes,facts,configs).resolve(version,facts);
    }
    DetectedSpringConfigDTO config(String module,String url,String profile) {
        return DetectedSpringConfigDTO.builder().configFilePath(root.resolve(module+"/src/main/resources/application.yml").toString())
                .targetServiceUrls(List.of(ConfigTargetUrlDTO.builder().configKey("spring.cloud.openfeign.client.config.catalog-service.url")
                        .targetUrl(url).lineNumber(6).profile(profile).build())).build();
    }
    @Test void joinsBothContractsTypedInvocationsAndReceiverMethodsWithIndependentProofs() throws Exception {
        fixture(CLIENT,CALLER,SERVER);
        var order=service("order-service");var catalog=service("catalog-service");
        var connections=resolve(List.of(order,catalog),List.of());
        assertThat(connections).hasSize(2);
        for(var connection:connections) {
            assertThat(connection.source()).isSameAs(order);assertThat(connection.target()).isSameAs(catalog);
            assertThat(connection.properties().path("serverMatch").asText()).isEqualTo("MATCHED_METHOD_PATH");
            assertThat(connection.properties().path("runtimeObserved").asBoolean()).isFalse();
            assertThat(connection.proofs()).extracting(FeignCommunicationResolver.Proof::role)
                    .containsExactly("CLIENT_DECLARATION","CLIENT_CONTRACT","CALL_SITE","SERVER_ENDPOINT");
            assertThat(connection.proofs()).allSatisfy(p->{assertThat(p.fact().getFilePath()).isNotBlank();assertThat(p.fact().getLineNumber()).isPositive();assertThat(p.fact().getCodeSnippet()).isNotBlank();});
            String verb=connection.properties().path("httpMethod").asText();
            String caller=connection.proofs().get(2).fact().getCodeSnippet();
            assertThat(caller).contains(verb.equals("POST")?"deductInventory":"getVariantInternalInfo");
            assertThat(connection.proofs().get(3).fact().getCodeSnippet()).contains(verb.equals("POST")?"@PostMapping":"@GetMapping");
        }
    }
    @Test void wrongVerbAndAmbiguousReceiverNeverProduceAUniqueReceiverProof() throws Exception {
        fixture(CLIENT,CALLER,SERVER.replace("@PostMapping","@DeleteMapping"));
        write("catalog-service/src/main/java/shop/catalog/OtherController.java",SERVER.replace("CatalogController","OtherController").replace("@PostMapping","@DeleteMapping"));
        var connections=resolve(List.of(service("order-service"),service("catalog-service")),List.of());
        var post=connections.stream().filter(c->c.properties().path("httpMethod").asText().equals("POST")).findFirst().orElseThrow();
        var get=connections.stream().filter(c->c.properties().path("httpMethod").asText().equals("GET")).findFirst().orElseThrow();
        assertThat(post.properties().path("serverMatch").asText()).isEqualTo("NOT_FOUND_IN_IMPORTED_SOURCE");
        assertThat(get.properties().path("serverMatch").asText()).isEqualTo("AMBIGUOUS_ENDPOINT");
        assertThat(connections).allSatisfy(c->assertThat(c.proofs()).noneMatch(p->p.role().equals("SERVER_ENDPOINT")));
    }
    @Test void annotationUrlOverridesNameAndConfigurationWithoutAttachingOtherServiceEndpoints() throws Exception {
        fixture(CLIENT.replace("path=", "url=\"http://inventory-service:8080\",path="),CALLER,SERVER);
        var inventory=service("inventory-service");
        var connections=resolve(List.of(service("order-service"),service("catalog-service"),inventory),List.of(config("order-service","http://catalog-service",null)));
        assertThat(connections).allSatisfy(c->{assertThat(c.target()).isSameAs(inventory);assertThat(c.properties().path("targetSelector").asText()).isEqualTo("ANNOTATION_URL");assertThat(c.proofs()).noneMatch(p->p.role().equals("SERVER_ENDPOINT")||p.role().equals("CLIENT_CONFIGURATION"));});
    }
    @Test void concreteConfigUrlUsesItsPathAndOwnerWhileProfileOverridesStayUnresolved() throws Exception {
        fixture(CLIENT,CALLER,SERVER);
        var nodes=List.of(service("order-service"),service("catalog-service"),service("inventory-service"));
        var connections=resolve(nodes,List.of(config("order-service","http://inventory-service:8080/gateway",null)));
        assertThat(connections).allSatisfy(c->{assertThat(c.target().getName()).isEqualTo("inventory-service");assertThat(c.properties().path("httpPath").asText()).startsWith("/gateway/api/catalog/");assertThat(c.proofs()).anyMatch(p->p.role().equals("CLIENT_CONFIGURATION"));});
        var uncertain=resolve(nodes,List.of(config("order-service","http://inventory-service:8080", "prod")));
        assertThat(uncertain).allSatisfy(c->{assertThat(c.target().getElementType()).isEqualTo("EXTERNAL_SYSTEM");assertThat(c.properties().path("resolutionStatus").asText()).isEqualTo("UNRESOLVED");});
        assertThat(resolve(nodes,List.of(config("catalog-service","http://inventory-service",null)))).allSatisfy(c->assertThat(c.target().getName()).isEqualTo("catalog-service"));
    }
    @Test void placeholderAndDuplicateServiceNamesNeverGuessAnImportedTarget() throws Exception {
        fixture(CLIENT.replace("path=", "url=\"${catalog.url}\",path="),CALLER,SERVER);
        var nodes=List.of(service("order-service"),service("catalog-service"));
        assertThat(resolve(nodes,List.of())).allSatisfy(c->{assertThat(c.target().getName()).startsWith("Unresolved Feign target");assertThat(c.properties().path("resolutionStatus").asText()).isEqualTo("UNRESOLVED");});
        fixture(CLIENT,CALLER,SERVER);
        assertThat(resolve(List.of(nodes.get(0),nodes.get(1),service("catalog-service")),List.of())).allSatisfy(c->assertThat(c.properties().path("resolutionStatus").asText()).isEqualTo("AMBIGUOUS"));
    }
    @Test void overloadsAndShadowingAreNotMisrepresentedAsUniqueInvocations() throws Exception {
        fixture(CLIENT.replace("interface CatalogFeignClient {","interface CatalogFeignClient { @GetMapping(\"/alternative\") String getVariantInternalInfo(String id);"),CALLER,SERVER);
        assertThat(resolve(List.of(service("order-service"),service("catalog-service")),List.of()).stream().filter(c->c.properties().path("httpMethod").asText().equals("GET")))
                .allSatisfy(c->{assertThat(c.properties().path("invocationResolution").asText()).isEqualTo("AMBIGUOUS_OVERLOAD");assertThat(c.proofs()).noneMatch(p->p.role().equals("CALL_SITE"));});
        fixture(CLIENT,"""
            package shop.order;
            class OrderService {
              CatalogFeignClient catalog;
              void shadow(Object catalog) { catalog.deductInventory("not Feign"); this.catalog.deductInventory("actual field"); }
              void lambda() { things.forEach(catalog -> catalog.deductInventory("not field")); }
            }
            """,SERVER);
        var invocations=facts().stream().filter(f->"FEIGN_INVOCATION".equals(f.getElementType())).toList();
        assertThat(invocations).hasSize(1);assertThat(invocations.get(0).getCodeSnippet()).startsWith("this.catalog");
    }
}
