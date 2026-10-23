package com.mavis.analyzer.graph.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.analyzer.graph.service.impl.ArchitectureResolver;
import com.mavis.common.entity.ModelElement;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class ArchitectureResolverTest {
    private ModelElement service(String name) {
        return ModelElement.builder().id(UUID.randomUUID()).name(name).elementType("SERVICE_CONTAINER").scope("/repo").build();
    }
    @Test void ownershipUsesPathSegmentsAndRejectsUnknownAndAmbiguousRoots() {
        var order = service("order-service"); var orderApi = service("order-service-api");
        assertThat(ArchitectureResolver.owner(List.of(order, orderApi), "/repo/order-service-api/src/Api.java")).isSameAs(orderApi);
        assertThat(ArchitectureResolver.owner(List.of(orderApi, order), "/repo/order-service-api/src/Api.java")).isSameAs(orderApi);
        assertThat(ArchitectureResolver.owner(List.of(order, orderApi), "/repo/shared/src/Shared.java")).isNull();
        assertThat(ArchitectureResolver.owner(List.of(order, orderApi), null)).isNull();
    }
    @Test void buildContextResolvesRenamedComposeService() {
        var service = service("api");
        service.setProperties(new ObjectMapper().createObjectNode().put("buildContext", "C:/repo/modules/orders"));
        assertThat(ArchitectureResolver.owner(List.of(service), "C:\\repo\\modules\\orders\\src\\Controller.java")).isSameAs(service);
        assertThat(ArchitectureResolver.technology("confluentinc/cp-kafka:7.5")).isEqualTo("Apache Kafka");
        assertThat(ArchitectureResolver.technology("example/custom-java-service:1")).isNull();
    }
    @Test void duplicateSimpleNamesStayInsideTheirService() {
        var a = service("orders"); var b = service("kitchen");
        var ca = ModelElement.builder().id(UUID.randomUUID()).name("RestaurantRepository").elementType("COMPONENT").parentElement(a).scope("/repo/orders/src/Repo.java").build();
        var cb = ModelElement.builder().id(UUID.randomUUID()).name("RestaurantRepository").elementType("COMPONENT").parentElement(b).scope("/repo/kitchen/src/Repo.java").build();
        assertThat(ArchitectureResolver.component(List.of(a,b,cb,ca), "RestaurantRepository", "/repo/orders/src/Controller.java")).isSameAs(ca);
        assertThat(ArchitectureResolver.component(List.of(a,b,ca,cb), "RestaurantRepository", "/repo/shared/src/Controller.java")).isNull();
        assertThat(ArchitectureResolver.target(List.of(a,b), "order")).isNull();
    }
}