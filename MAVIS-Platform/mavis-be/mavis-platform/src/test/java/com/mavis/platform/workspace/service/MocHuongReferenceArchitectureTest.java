package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.DiagramVersion;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class MocHuongReferenceArchitectureTest {

    private final ObjectMapper json = new ObjectMapper();

    private MocHuongReferenceArchitectureBuilder.BuiltResult buildInMemoryModel() {
        Project project = Project.builder()
                .id(UUID.randomUUID())
                .name(MocHuongReferenceArchitectureBuilder.SYSTEM_NAME)
                .build();
        SourceSnapshot snapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(project)
                .sourceType("ZIP_UPLOAD")
                .build();
        ModelVersion modelVersion = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(project)
                .sourceSnapshot(snapshot)
                .revision(1)
                .build();

        return MocHuongReferenceArchitectureBuilder.populate(
                json,
                modelVersion,
                snapshot,
                new MocHuongReferenceArchitectureBuilder.PersistenceHooks(
                        el -> {
                            if (el.getId() == null) el.setId(UUID.randomUUID());
                            return el;
                        },
                        rel -> {
                            if (rel.getId() == null) rel.setId(UUID.randomUUID());
                            return rel;
                        },
                        ev -> {
                            if (ev.getId() == null) ev.setId(UUID.randomUUID());
                            return ev;
                        },
                        diagrams -> diagrams,
                        run -> run
                ));
    }

    @Test
    void buildsAuthenticSixServiceMocHuongC1ToC3ModelWithoutFakePlaceholders() {
        var built = buildInMemoryModel();

        assertThat(MocHuongReferenceArchitectureBuilder.SYSTEM_NAME).isEqualTo("Mộc Hương Shop Platform");
        assertThat(built.elements()).noneMatch(el ->
                "payment-service".equalsIgnoreCase(el.getName())
                        || "inventory-service".equalsIgnoreCase(el.getName())
                        || "PaymentClient".equalsIgnoreCase(el.getName()));

        List<ModelElement> microservices = built.elements().stream()
                .filter(el -> "SERVICE_CONTAINER".equals(el.getElementType()))
                .toList();
        assertThat(microservices)
                .extracting(ModelElement::getName)
                .containsExactlyInAnyOrder(
                        "service-discovery",
                        "api-gateway",
                        "identity-service",
                        "catalog-service",
                        "order-service",
                        "notification-service");

        List<ModelElement> actors = built.elements().stream()
                .filter(el -> "PERSON".equals(el.getElementType()))
                .toList();
        assertThat(actors).extracting(ModelElement::getName)
                .containsExactlyInAnyOrder("Admin", "Staff", "Customer");
        assertThat(built.elements())
                .anyMatch(el -> "EXTERNAL_SYSTEM".equals(el.getElementType())
                        && "Observability Platform (OpenTelemetry)".equals(el.getName()));
        assertThat(built.elements())
                .extracting(ModelElement::getName)
                .noneMatch(name -> name != null && (name.toLowerCase().contains("mavis")
                        || name.toLowerCase().contains("quản trị hệ thống")));

        Set<String> relTriples = new HashSet<>();
        for (ModelRelationship rel : built.relationships()) {
            String key = rel.getSourceElement().getId() + "->" + rel.getTargetElement().getId() + "::" + rel.getRelationType();
            assertThat(relTriples.add(key))
                    .as("Duplicate relationship detected in Moc Huong model: %s", key)
                    .isTrue();
        }

        DiagramVersion c1Diagram = built.diagrams().stream()
                .filter(d -> "C4".equals(d.getNotation()) && "CONTEXT".equals(d.getLevel()))
                .findFirst()
                .orElseThrow();
        assertThat(c1Diagram.getLayoutJson().path("nodes")).hasSize(5);
        assertThat(c1Diagram.getLayoutJson().path("edges")).hasSize(4);

        assertThat(built.diagrams())
                .anyMatch(d -> "DEPENDENCY_GRAPH".equals(d.getNotation()) && "SERVICE".equals(d.getLevel()));
        assertThat(built.diagrams())
                .anyMatch(d -> "C4".equals(d.getNotation()) && "CONTAINER".equals(d.getLevel()));
        assertThat(built.diagrams())
                .anyMatch(d -> "C4".equals(d.getNotation()) && "COMPONENT".equals(d.getLevel()));
    }

    @Test
    void enforcesStrictDatabasePerServiceRedisCacheAndKafkaMessaging() {
        var built = buildInMemoryModel();

        Map<String, List<ModelRelationship>> allDbAccessByTarget = built.relationships().stream()
                .filter(r -> "DATABASE_ACCESS".equals(r.getRelationType()))
                .collect(Collectors.groupingBy(r -> r.getTargetElement().getName()));

        assertThat(allDbAccessByTarget.keySet()).containsExactlyInAnyOrder(
                "identity-db", "catalog-db", "order-db", "notification-db", "redis");

        Map<String, List<ModelRelationship>> containerDbAccessByTarget = built.relationships().stream()
                .filter(r -> "DATABASE_ACCESS".equals(r.getRelationType())
                        && "SERVICE_CONTAINER".equals(r.getSourceElement().getElementType()))
                .collect(Collectors.groupingBy(r -> r.getTargetElement().getName()));

        assertThat(containerDbAccessByTarget.get("identity-db")).singleElement()
                .extracting(r -> r.getSourceElement().getName()).isEqualTo("identity-service");
        assertThat(containerDbAccessByTarget.get("catalog-db")).singleElement()
                .extracting(r -> r.getSourceElement().getName()).isEqualTo("catalog-service");
        assertThat(containerDbAccessByTarget.get("order-db")).singleElement()
                .extracting(r -> r.getSourceElement().getName()).isEqualTo("order-service");
        assertThat(containerDbAccessByTarget.get("notification-db")).singleElement()
                .extracting(r -> r.getSourceElement().getName()).isEqualTo("notification-service");
        assertThat(containerDbAccessByTarget.get("redis")).singleElement()
                .extracting(r -> r.getSourceElement().getName()).isEqualTo("catalog-service");

        Map<String, String> expectedOwnerByStore = Map.of(
                "identity-db", "identity-service",
                "catalog-db", "catalog-service",
                "order-db", "order-service",
                "notification-db", "notification-service",
                "redis", "catalog-service");
        expectedOwnerByStore.forEach((store, owner) -> assertThat(allDbAccessByTarget.get(store))
                .isNotEmpty()
                .allSatisfy(rel -> {
                    ModelElement src = rel.getSourceElement();
                    String resolvedOwner = src.getParentElement() != null ? src.getParentElement().getName() : src.getName();
                    assertThat(resolvedOwner).isEqualTo(owner);
                }));

        ModelElement redis = built.elements().stream()
                .filter(el -> "redis".equals(el.getName()))
                .findFirst()
                .orElseThrow();
        assertThat(redis.getElementType()).isEqualTo("DATABASE");
        assertThat(redis.getProperties().path("datastoreKind").asText()).isEqualTo("CACHE");

        assertThat(built.elements())
                .anyMatch(el -> "kafka".equals(el.getName()) && "MESSAGE_CHANNEL".equals(el.getElementType()));
        assertThat(built.relationships())
                .anyMatch(r -> "MESSAGE_PUBLISH".equals(r.getRelationType())
                        && "order-service".equals(r.getSourceElement().getName())
                        && "kafka".equals(r.getTargetElement().getName()));
        assertThat(built.relationships())
                .anyMatch(r -> "MESSAGE_SUBSCRIBE".equals(r.getRelationType())
                        && "kafka".equals(r.getSourceElement().getName())
                        && "notification-service".equals(r.getTargetElement().getName()));
    }

    @Test
    void enforcesCleanThreeTierComponentLayeringAndRealFileLineEvidences() {
        var built = buildInMemoryModel();

        List<ModelElement> components = built.elements().stream()
                .filter(el -> "COMPONENT".equals(el.getElementType()))
                .toList();
        assertThat(components).extracting(ModelElement::getName).contains(
                "JwtAuthenticationGatewayFilter",
                "ServiceDiscoveryApplication",
                "AuthController",
                "PasswordEncoderConfig",
                "IdentityDataSeeder",
                "ProductController",
                "OrderController",
                "OrderSagaOrchestrator",
                "CatalogFeignClient",
                "OutboxEventPublisher",
                "OrderEventConsumer");

        assertThat(built.relationships())
                .anyMatch(r -> "OrderController".equals(r.getSourceElement().getName())
                        && "OrderService".equals(r.getTargetElement().getName()))
                .anyMatch(r -> "OrderController".equals(r.getSourceElement().getName())
                        && "OrderSagaOrchestrator".equals(r.getTargetElement().getName()))
                .anyMatch(r -> "OrderService".equals(r.getSourceElement().getName())
                        && "OrderRepository".equals(r.getTargetElement().getName()))
                .anyMatch(r -> "OrderSagaOrchestrator".equals(r.getSourceElement().getName())
                        && "OrderRepository".equals(r.getTargetElement().getName()))
                .noneMatch(r -> "OrderService".equals(r.getSourceElement().getName())
                        && "OrderSagaOrchestrator".equals(r.getTargetElement().getName()));

        boolean directControllerToRepo = built.relationships().stream().anyMatch(r -> {
            String srcTier = r.getSourceElement().getProperties() != null
                    ? r.getSourceElement().getProperties().path("tier").asText("") : "";
            String dstTier = r.getTargetElement().getProperties() != null
                    ? r.getTargetElement().getProperties().path("tier").asText("") : "";
            return "CONTROLLER".equals(srcTier) && "REPOSITORY".equals(dstTier);
        });
        assertThat(directControllerToRepo)
                .as("No Controller must directly depend on a Repository across C3 components")
                .isFalse();

        assertThat(built.evidences())
                .extracting(Evidence::getLocator)
                .contains(
                        "order-service/src/main/java/com/mochuong/order/controller/OrderController.java:38",
                        "order-service/src/main/java/com/mochuong/order/service/OrderService.java:24",
                        "order-service/src/main/java/com/mochuong/order/service/OrderSagaOrchestrator.java:96",
                        "order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java:9",
                        "order-service/src/main/java/com/mochuong/order/service/OutboxEventPublisher.java:39",
                        "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java:38",
                        "identity-service/src/main/java/com/mochuong/identity/config/IdentityDataSeeder.java:22",
                        "identity-service/src/main/java/com/mochuong/identity/config/PasswordEncoderConfig.java:12",
                        "api-gateway/src/main/java/com/mochuong/gateway/filter/JwtAuthenticationGatewayFilter.java:63");
    }

    @Test
    void reverseBfsFromCatalogAndNotificationReachesRealUpstreamCallers() {
        var built = buildInMemoryModel();

        Map<UUID, ModelElement> byId = new HashMap<>();
        for (ModelElement el : built.elements()) {
            byId.put(el.getId(), el);
        }
        Map<UUID, List<UUID>> reverseAdj = new HashMap<>();
        Set<String> allowedRelTypes = Set.of(
                "SERVICE_HTTP_CALL", "GATEWAY_ROUTE", "MESSAGE_PUBLISH", "MESSAGE_SUBSCRIBE", "DATABASE_ACCESS");
        for (ModelRelationship rel : built.relationships()) {
            if (!allowedRelTypes.contains(rel.getRelationType())) continue;
            UUID src = rel.getSourceElement().getId();
            UUID dst = rel.getTargetElement().getId();
            if ("COMPONENT".equals(byId.get(src).getElementType()) || "COMPONENT".equals(byId.get(dst).getElementType())) {
                continue;
            }
            if ("MESSAGE_SUBSCRIBE".equals(rel.getRelationType())) {
                // Notification subscribes to Kafka -> Notification depends on Kafka -> changing Kafka impacts Notification
                reverseAdj.computeIfAbsent(src, k -> new ArrayList<>()).add(dst);
            } else if ("MESSAGE_PUBLISH".equals(rel.getRelationType())) {
                // Order publishes to Kafka -> changing Order impacts Kafka (downstream event flow)
                reverseAdj.computeIfAbsent(dst, k -> new ArrayList<>()).add(src);
                reverseAdj.computeIfAbsent(src, k -> new ArrayList<>()).add(dst);
            } else {
                reverseAdj.computeIfAbsent(dst, k -> new ArrayList<>()).add(src);
            }
        }

        UUID catalogId = built.serviceIds().get("catalog-service");
        Set<String> catalogUpstreamNames = bfsNames(catalogId, reverseAdj, byId);
        assertThat(catalogUpstreamNames).contains("order-service", "api-gateway", "Admin", "Staff", "Customer");

        UUID kafkaId = built.elements().stream()
                .filter(el -> "kafka".equals(el.getName()))
                .findFirst().orElseThrow().getId();
        Set<String> kafkaImpactedNames = bfsNames(kafkaId, reverseAdj, byId);
        assertThat(kafkaImpactedNames).contains("order-service", "notification-service");

        UUID notificationId = built.serviceIds().get("notification-service");
        Set<String> notificationUpstreamNames = bfsNames(notificationId, reverseAdj, byId);
        assertThat(notificationUpstreamNames).contains("api-gateway", "Admin", "Staff", "Customer");
    }

    @Test
    void buildsRealCuratedSourceArchiveWithoutLegacyPlaceholders() throws Exception {
        byte[] zipBytes = MocHuongReferenceArchitectureBuilder.buildMocHuongArchive();
        List<String> entries = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entries.add(entry.getName());
            }
        }
        assertThat(entries).contains(
                "order-service/src/main/java/com/mochuong/order/client/CatalogFeignClient.java",
                "catalog-service/src/main/java/com/mochuong/catalog/controller/ProductController.java",
                "notification-service/src/main/java/com/mochuong/notification/consumer/OrderEventConsumer.java",
                "api-gateway/src/main/java/com/mochuong/gateway/filter/JwtAuthenticationGatewayFilter.java");
        assertThat(entries).noneMatch(name -> name.contains("PaymentClient") || name.contains("InventoryController"));
    }

    private Set<String> bfsNames(UUID startId, Map<UUID, List<UUID>> adj, Map<UUID, ModelElement> byId) {
        Set<String> names = new HashSet<>();
        Set<UUID> visited = new HashSet<>();
        Queue<UUID> queue = new ArrayDeque<>();
        visited.add(startId);
        queue.add(startId);
        while (!queue.isEmpty()) {
            UUID cur = queue.poll();
            for (UUID next : adj.getOrDefault(cur, List.of())) {
                if (visited.add(next)) {
                    names.add(byId.get(next).getName());
                    queue.add(next);
                }
            }
        }
        return names;
    }
}
