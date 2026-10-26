package com.mavis.analyzer.javaanalyzer.parser;

import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class GeneralClassSemanticsTest {
    @TempDir Path root;
    private void source(String name, String body) throws Exception {
        Files.writeString(root.resolve(name + ".java"), "package sample.logistics; " + body);
    }
    @SuppressWarnings("unchecked")
    private Map<String, Object> classifier(List<CodeEvidenceDTO> facts, String name) {
        return (Map<String, Object>) facts.stream().filter(e -> "CLASS_INTERFACE".equals(e.getElementType()) && name.equals(e.getIdentifier())).findFirst().orElseThrow().getMetadata().get("umlClassifier");
    }

    @Test @SuppressWarnings("unchecked")
    void functionalFieldsAndAnnotatedHandlersAreExtractedWithoutModifierOrInitializerFilters() throws Exception {
        source("FulfillmentPort", """
            public class FulfillmentPort {
                public final CommandEndpoint<DispatchCommand> dispatch = CommandEndpointBuilder.forCommand(DispatchCommand.class).build();
                public static final String URL = "http://target:8080/{id}";
                protected java.util.function.Supplier<String> state = () -> { return "{ready}"; };
                int attempts;
                @org.springframework.web.bind.annotation.GetMapping(path = {"/a", "/b"})
                public final reactor.core.publisher.Mono<Parcel> find(@org.springframework.web.bind.annotation.RequestParam("id") String id) { return null; }
                @org.springframework.web.bind.annotation.PostMapping("/dispatch")
                reactor.core.publisher.Mono<Void> dispatch(DispatchCommand command) { return null; }
                protected void reset() {}
            }
            """);
        source("Parcel", "@jakarta.persistence.Entity public class Parcel {}");
        source("CatalogStore", "public interface CatalogStore extends org.springframework.data.repository.CrudRepository<Parcel, Long> {}");
        var facts = new JavaSourceParser().parseProject(root.toString());
        var members = (List<Map<String, Object>>) classifier(facts, "FulfillmentPort").get("members");
        assertThat(members.stream().filter(m -> "FIELD".equals(m.get("memberKind"))).map(m -> m.get("name"))).containsExactlyInAnyOrder("dispatch", "URL", "state", "attempts");
        assertThat(members.stream().filter(m -> "OPERATION".equals(m.get("memberKind"))).map(m -> m.get("name"))).containsExactlyInAnyOrder("find", "dispatch", "reset");
        assertThat(members).anyMatch(m -> "dispatch".equals(m.get("name")) && "FIELD".equals(m.get("memberKind")) && "PUBLIC".equals(m.get("visibility")) && Boolean.TRUE.equals(m.get("isReadOnly")));
        assertThat(facts).anyMatch(e -> "sample.logistics.FulfillmentPort".equals(e.getSourceComponent()) && "sample.logistics.Parcel".equals(e.getTargetComponent()));
        assertThat(facts).anyMatch(e -> "sample.logistics.CatalogStore".equals(e.getSourceComponent()) && "sample.logistics.Parcel".equals(e.getTargetComponent()) && "DEPENDENCY".equals(e.getMetadata().get("umlRelationKind")));
    }

    @Test void compositionRequiresDomainLifecycleEvidenceAndNeverComesFromSingletonInjection() throws Exception {
        for (String name : List.of("StockPort", "RebalanceWorkflow", "DocumentStore", "Address", "PackageUnit", "ExternalRef")) source(name, "public class " + name + " {}");
        source("BadgeValue", "@jakarta.persistence.Embeddable public class BadgeValue {}");
        source("Coordinator", """
            @org.springframework.stereotype.Service public class Coordinator {
                private final StockPort stock;
                private final RebalanceWorkflow workflow;
                @org.springframework.beans.factory.annotation.Autowired private DocumentStore documents;
                Coordinator(StockPort stock, RebalanceWorkflow workflow) { this.stock = stock; this.workflow = workflow; }
            }
            """);
        source("Consignment", """
            @jakarta.persistence.Entity public class Consignment {
                @jakarta.persistence.Embedded Address address;
                @jakarta.persistence.ElementCollection java.util.Map<String, BadgeValue> badges;
                @jakarta.persistence.OneToMany(cascade = jakarta.persistence.CascadeType.ALL, orphanRemoval = true)
                java.util.List<PackageUnit> units;
                @jakarta.persistence.OneToMany(cascade = jakarta.persistence.CascadeType.ALL)
                java.util.List<ExternalRef> references;
                @org.springframework.beans.factory.annotation.Autowired StockPort stock;
                java.util.List<BadgeValue> values;
                final DocumentStore manuallyAllocated = new DocumentStore();
            }
            """);
        var facts = new JavaSourceParser().parseProject(root.toString());
        var coordinator = facts.stream().filter(e -> "UML_RELATIONSHIP".equals(e.getElementType()) && "sample.logistics.Coordinator".equals(e.getSourceComponent())).toList();
        assertThat(coordinator).isNotEmpty().noneMatch(e -> "COMPOSITION".equals(e.getMetadata().get("umlRelationKind")) || "SHARED_AGGREGATION".equals(e.getMetadata().get("umlRelationKind")));
        var owned = facts.stream().filter(e -> "UML_RELATIONSHIP".equals(e.getElementType()) && "sample.logistics.Consignment".equals(e.getSourceComponent()) && "COMPOSITION".equals(e.getMetadata().get("umlRelationKind"))).toList();
        assertThat(owned).extracting(e -> e.getMetadata().get("roleName")).containsExactlyInAnyOrder("address", "badges", "units", "values");
        assertThat(owned).allMatch(e -> Boolean.TRUE.equals(e.getMetadata().get("astVerifiedWholePart")) && e.getMetadata().get("ownershipEvidence") != null);
        assertThat(facts).anyMatch(e -> "sample.logistics.Consignment".equals(e.getSourceComponent()) && "references".equals(e.getMetadata() == null ? null : e.getMetadata().get("roleName")) && "ASSOCIATION".equals(e.getMetadata().get("umlRelationKind")));
    }

    @Test void nonProductionTestSourceSetsAndJUnitFixturesDoNotPolluteTheClassModel() throws Exception {
        for (String sourceSet : List.of("integration-test", "component-test", "testFixtures", "functionalTest")) {
            Path folder = root.resolve("src/" + sourceSet + "/java"); Files.createDirectories(folder);
            Files.writeString(folder.resolve("Fixture.java"), "package sample.testfixture; public class Fixture {}");
        }
        Path archived = root.resolve("src/old-examples"); Files.createDirectories(archived);
        Files.writeString(archived.resolve("ArchivedCheck.java"), "package sample.checks; import org.junit.Test; public class ArchivedCheck { @Test public void exercise() {} }");
        Path production = root.resolve("src/main/java"); Files.createDirectories(production);
        Files.writeString(production.resolve("LatestPrice.java"), "package sample.production; public class LatestPrice {}");
        var facts = new JavaSourceParser().parseProject(root.toString());
        assertThat(facts).anyMatch(e -> "LatestPrice".equals(e.getIdentifier()));
        assertThat(facts).noneMatch(e -> "Fixture".equals(e.getIdentifier()) || "ArchivedCheck".equals(e.getIdentifier()));
    }
}
