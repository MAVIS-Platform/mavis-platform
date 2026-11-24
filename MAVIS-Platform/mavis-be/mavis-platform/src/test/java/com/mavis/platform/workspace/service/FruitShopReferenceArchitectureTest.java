package com.mavis.platform.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;

class FruitShopReferenceArchitectureTest {

    private final ObjectMapper json = new ObjectMapper();

    private FruitShopReferenceArchitectureBuilder.BuiltResult buildInMemoryModel() {
        Project project = Project.builder()
                .id(UUID.randomUUID())
                .name(FruitShopReferenceArchitectureBuilder.SYSTEM_NAME)
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

        return FruitShopReferenceArchitectureBuilder.populate(
                json,
                modelVersion,
                snapshot,
                new FruitShopReferenceArchitectureBuilder.PersistenceHooks(
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
    void buildsAuthenticDotNet8FruitShopC1ToC3ModelWithoutJavaOrLegacyPlaceholders() {
        var built = buildInMemoryModel();

        assertThat(FruitShopReferenceArchitectureBuilder.SYSTEM_NAME).isEqualTo("Project Trái Cây Platform");

        List<ModelElement> microservices = built.elements().stream()
                .filter(el -> "SERVICE_CONTAINER".equals(el.getElementType()))
                .toList();
        assertThat(microservices)
                .extracting(ModelElement::getName)
                .containsExactlyInAnyOrder(
                        "ApiGateway",
                        "FruitCatalog.API",
                        "FruitBasket.API",
                        "FruitOrdering.API");

        List<ModelElement> actors = built.elements().stream()
                .filter(el -> "PERSON".equals(el.getElementType()))
                .toList();
        assertThat(actors).extracting(ModelElement::getName)
                .containsExactlyInAnyOrder("Admin", "Staff", "Customer");
        assertThat(actors).allSatisfy(actor -> {
            assertThat(actor.getProperties().path("contextFactOrigin").asText()).isEqualTo("USER_CONFIRMED");
            assertThat(actor.getProperties().path("contextActionLabel").asText()).contains("[HTTPS]");
        });

        assertThat(built.elements().stream().filter(el -> "DATABASE".equals(el.getElementType())).toList())
                .extracting(ModelElement::getName)
                .containsExactlyInAnyOrder("catalog-db", "ordering-db", "redis");

        assertThat(built.elements().stream().filter(el -> "MESSAGE_CHANNEL".equals(el.getElementType())).toList())
                .extracting(ModelElement::getName)
                .containsExactly("rabbitmq");

        assertThat(built.elements().stream().filter(el -> "EXTERNAL_SYSTEM".equals(el.getElementType())).toList())
                .extracting(ModelElement::getName)
                .containsExactly("OpenTelemetry & MAVIS Observability");

        List<ModelElement> c3Components = built.elements().stream()
                .filter(el -> "COMPONENT".equals(el.getElementType()))
                .toList();
        assertThat(c3Components)
                .extracting(ModelElement::getName)
                .contains(
                        "AuthController",
                        "YarpReverseProxyPipeline",
                        "JwtOptions",
                        "GlobalExceptionHandler",
                        "CatalogItemsController",
                        "CatalogService",
                        "CatalogDbContext",
                        "CatalogDbInitializer",
                        "BasketController",
                        "BasketService",
                        "OrderCreatedConsumer",
                        "RedisBasketRepository",
                        "RedisProcessedEventStore",
                        "OrdersController",
                        "OrderSagaService",
                        "OrderQueryService",
                        "CatalogApiClient",
                        "BasketApiClient",
                        "OutboxRelayBackgroundService",
                        "OrderingDbContext");

        boolean directControllerToRepo = built.relationships().stream().anyMatch(r -> {
            String srcTier = r.getSourceElement().getProperties() != null
                    ? r.getSourceElement().getProperties().path("tier").asText("") : "";
            String dstTier = r.getTargetElement().getProperties() != null
                    ? r.getTargetElement().getProperties().path("tier").asText("") : "";
            return "CONTROLLER".equalsIgnoreCase(srcTier) && "REPOSITORY".equalsIgnoreCase(dstTier);
        });
        assertThat(directControllerToRepo)
                .as("Controllers in .NET services must talk to Services/Handlers rather than EF DbContext or Redis repositories directly")
                .isFalse();

        assertThat(built.evidences())
                .extracting(Evidence::getLocator)
                .contains(
                        "src/Gateways/ApiGateway/Program.cs:85",
                        "src/Gateways/ApiGateway/Controllers/AuthController.cs:24",
                        "src/Gateways/ApiGateway/appsettings.json:41",
                        "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs:62",
                        "src/Services/FruitCatalog/FruitCatalog.API/Data/CatalogDbContext.cs:12",
                        "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs:14",
                        "src/Services/FruitBasket/FruitBasket.API/Repositories/RedisProcessedEventStore.cs:5",
                        "src/Services/FruitOrdering/FruitOrdering.API/Program.cs:67",
                        "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs:72",
                        "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs:84");

        // Ensure zero Java/Spring/legacy Moc-Huong terms leaked into the C# reference model
        for (ModelElement el : built.elements()) {
            assertNoJavaOrLegacyTokens(el.getName() + " " + el.getLanguageStack() + " " + el.getScope() + " " + el.getProperties());
        }
        for (ModelRelationship rel : built.relationships()) {
            assertNoJavaOrLegacyTokens(rel.getRelationType() + " " + rel.getProperties());
        }
        for (Evidence ev : built.evidences()) {
            assertNoJavaOrLegacyTokens(ev.getLocator() + " " + ev.getExcerpt());
        }
        built.diagrams().forEach(d -> assertNoJavaOrLegacyTokens(d.getLayoutJson().toString()));
    }

    @Test
    void reverseBfsFromCatalogAndBasketReachesRealUpstreamCallers() {
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
                reverseAdj.computeIfAbsent(src, k -> new ArrayList<>()).add(dst);
            } else if ("MESSAGE_PUBLISH".equals(rel.getRelationType())) {
                reverseAdj.computeIfAbsent(dst, k -> new ArrayList<>()).add(src);
                reverseAdj.computeIfAbsent(src, k -> new ArrayList<>()).add(dst);
            } else {
                reverseAdj.computeIfAbsent(dst, k -> new ArrayList<>()).add(src);
            }
        }

        UUID catalogId = built.serviceIds().get("FruitCatalog.API");
        assertThat(bfsNames(catalogId, reverseAdj, byId))
                .contains("FruitOrdering.API", "ApiGateway", "Admin", "Staff", "Customer");

        UUID basketId = built.serviceIds().get("FruitBasket.API");
        assertThat(bfsNames(basketId, reverseAdj, byId))
                .contains("FruitOrdering.API", "ApiGateway", "Admin", "Staff", "Customer");

        UUID rabbitmqId = built.elements().stream()
                .filter(el -> "rabbitmq".equals(el.getName()))
                .findFirst().orElseThrow().getId();
        assertThat(bfsNames(rabbitmqId, reverseAdj, byId))
                .contains("FruitOrdering.API", "FruitBasket.API");
    }

    @Test
    void buildsRealCuratedDotNet8ArchiveWithoutJavaOrSpringArtifacts() throws Exception {
        byte[] zipBytes = FruitShopReferenceArchitectureBuilder.buildFruitShopArchive();
        List<String> entries = new ArrayList<>();
        StringBuilder contents = new StringBuilder();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                entries.add(entry.getName());
                contents.append(new String(zis.readAllBytes(), StandardCharsets.UTF_8)).append('\n');
            }
        }
        assertThat(entries).contains(
                "FruitShop.Microservices.sln",
                "docker-compose.yml",
                "src/Gateways/ApiGateway/Program.cs",
                "src/Gateways/ApiGateway/Controllers/AuthController.cs",
                "src/Gateways/ApiGateway/appsettings.json",
                "src/Services/FruitCatalog/FruitCatalog.API/Controllers/CatalogItemsController.cs",
                "src/Services/FruitBasket/FruitBasket.API/Consumers/OrderCreatedConsumer.cs",
                "src/Services/FruitOrdering/FruitOrdering.API/Services/OrderSagaService.cs",
                "src/Services/FruitOrdering/FruitOrdering.API/BackgroundServices/OutboxRelayBackgroundService.cs");
        assertNoJavaOrLegacyTokens(String.join("\n", entries) + "\n" + contents);
    }

    private void assertNoJavaOrLegacyTokens(String raw) {
        String lower = raw.toLowerCase(Locale.ROOT);
        assertThat(lower)
                .doesNotContain("spring")
                .doesNotContain("openfeign")
                .doesNotContain("feign")
                .doesNotContain("moc huong")
                .doesNotContain("mộc hương")
                .doesNotContain("java 21")
                .doesNotContain("payment-service")
                .doesNotContain("inventory-service")
                .doesNotContain("pom.xml");
    }

    private Set<String> bfsNames(UUID startId, Map<UUID, List<UUID>> adj, Map<UUID, ModelElement> byId) {
        Set<String> names = new HashSet<>();
        Set<UUID> visited = new HashSet<>();
        Queue<UUID> queue = new ArrayDeque<>();
        visited.add(startId);
        queue.add(startId);
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            for (UUID next : adj.getOrDefault(current, List.of())) {
                if (visited.add(next)) {
                    names.add(byId.get(next).getName());
                    queue.add(next);
                }
            }
        }
        return names;
    }
}
