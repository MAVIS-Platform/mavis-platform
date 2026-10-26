package com.mavis.analyzer.javaanalyzer.parser;

import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;

class JavaPackageTypeResolutionTest {
    @TempDir Path root;

    private void source(String name, String content) throws Exception {
        Path file = root.resolve(name);
        Files.createDirectories(file.getParent());
        Files.writeString(file, content);
    }

    @Test void resolvesFieldsNestedGenericsConstructorsAutowiredAndBeanAcrossArbitraryPackages() throws Exception {
        source("z/StockPort.java", "package sample.shipping.ports; public class StockPort {}");
        source("z/LedgerPort.java", "package sample.shipping.ports; public class LedgerPort {}");
        source("a/AbortDispatch.java", """
            package sample.shipping.workflows.abort;
            import sample.shipping.ports.StockPort;
            import sample.shipping.ports.LedgerPort;
            import java.util.Map; import java.util.List;
            public class AbortDispatch {
              private Map<String, List<StockPort>> ports;
              @org.springframework.beans.factory.annotation.Autowired LedgerPort ledger;
            }
            """);
        source("a/AmendDispatch.java", """
            package sample.shipping.workflows.amend;
            import sample.shipping.ports.*;
            public class AmendDispatch {
              AmendDispatch(StockPort stock, LedgerPort ledger) {}
              @org.springframework.context.annotation.Bean
              public StockPort stock(LedgerPort ledger) { return null; }
            }
            """);
        source("a/Factory.java", """
            package sample.shipping.configuration;
            public class Factory {
              @org.springframework.context.annotation.Bean
              public sample.shipping.ports.StockPort stock(sample.shipping.ports.LedgerPort ledger) { return null; }
            }
            """);
        source("z/Parcel.java", "package sample.shipping.domain; @jakarta.persistence.Entity public class Parcel {}");
        var facts = new JavaSourceParser().parseProject(root.toString());
        for (String owner : List.of("sample.shipping.workflows.abort.AbortDispatch", "sample.shipping.workflows.amend.AmendDispatch", "sample.shipping.configuration.Factory")) {
            assertThat(facts).anyMatch(e -> owner.equals(e.getSourceComponent()) && "sample.shipping.ports.StockPort".equals(e.getTargetComponent()));
            assertThat(facts).anyMatch(e -> owner.equals(e.getSourceComponent()) && "sample.shipping.ports.LedgerPort".equals(e.getTargetComponent()));
        }
        var entity = facts.stream().filter(e -> "CLASS_INTERFACE".equals(e.getElementType()) && "Parcel".equals(e.getIdentifier())).findFirst().orElseThrow();
        var classifier = (Map<?, ?>) entity.getMetadata().get("umlClassifier");
        assertThat(classifier.get("annotations").toString()).contains("jakarta.persistence.Entity");
    }

    @Test void explicitImportsBeatSamePackageAndWildcardsStayAmbiguousInsteadOfGuessing() throws Exception {
        source("local/Port.java", "package sample.local; public class Port {}");
        source("one/Port.java", "package sample.one; public class Port {}");
        source("two/Port.java", "package sample.two; public class Port {}");
        source("local/Explicit.java", "package sample.local; import sample.one.Port; public class Explicit { Port port; }");
        source("local/Qualified.java", "package sample.local; public class Qualified { sample.two.Port port; }");
        source("other/Ambiguous.java", "package sample.other; import sample.one.*; import sample.two.*; public class Ambiguous { Port port; }");
        var facts = new JavaSourceParser().parseProject(root.toString());
        assertThat(facts).anyMatch(e -> "sample.local.Explicit".equals(e.getSourceComponent()) && "sample.one.Port".equals(e.getTargetComponent()));
        assertThat(facts).noneMatch(e -> "sample.local.Explicit".equals(e.getSourceComponent()) && "sample.local.Port".equals(e.getTargetComponent()));
        assertThat(facts).anyMatch(e -> "sample.local.Qualified".equals(e.getSourceComponent()) && "sample.two.Port".equals(e.getTargetComponent()));
        assertThat(facts).noneMatch(e -> "sample.other.Ambiguous".equals(e.getSourceComponent()) && e.getTargetComponent() != null);
    }
}
