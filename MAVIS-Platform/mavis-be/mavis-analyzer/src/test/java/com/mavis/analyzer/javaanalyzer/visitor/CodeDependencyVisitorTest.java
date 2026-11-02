package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CodeDependencyVisitorTest {

    @Test
    @DisplayName("Should detect @Service and constructor injection dependencies")
    void shouldDetectServiceAndConstructorInjection() {
        String code = """
                package com.mavis.order.service;
                
                import org.springframework.stereotype.Service;
                
                @Service
                public class OrderService {
                    private final OrderRepository orderRepository;
                    private final PaymentClient paymentClient;
                
                    public OrderService(OrderRepository orderRepository, PaymentClient paymentClient) {
                        this.orderRepository = orderRepository;
                        this.paymentClient = paymentClient;
                    }
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        CodeDependencyVisitor visitor = new CodeDependencyVisitor("/app/OrderService.java");
        visitor.visit(cu, evidences);

        // 1. Service component evidence
        assertThat(evidences).anyMatch(e ->
                "SERVICE_COMPONENT".equals(e.getElementType())
                        && "OrderService".equals(e.getIdentifier())
                        && "OrderService".equals(e.getSourceComponent())
                        && "@Service\npublic class OrderService".equals(e.getCodeSnippet())
        );

        // 2. Dependencies via constructor
        List<CodeEvidenceDTO> depEvidences = evidences.stream()
                .filter(e -> "CODE_DEPENDENCY".equals(e.getElementType()))
                .toList();

        assertThat(depEvidences).hasSize(2);
        assertThat(depEvidences).extracting(CodeEvidenceDTO::getTargetComponent)
                .containsExactlyInAnyOrder("OrderRepository", "PaymentClient");
        assertThat(depEvidences).allMatch(e -> "OrderService".equals(e.getSourceComponent()));
    }

    @Test
    @DisplayName("Should detect Lombok @RequiredArgsConstructor and final fields")
    void shouldDetectLombokRequiredArgsConstructor() {
        String code = """
                package com.mavis.catalog.service;
                
                import lombok.RequiredArgsConstructor;
                import org.springframework.stereotype.Service;
                import java.util.List;
                
                @Service
                @RequiredArgsConstructor
                public class FruitCatalogService {
                    private final FruitRepository fruitRepository;
                    private final InventoryClient inventoryClient;
                    private final String ignoredString;
                    private final int ignoredCount;
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        CodeDependencyVisitor visitor = new CodeDependencyVisitor("/app/FruitCatalogService.java");
        visitor.visit(cu, evidences);

        // Ignored types (String, int) must not be treated as dependencies
        List<CodeEvidenceDTO> depEvidences = evidences.stream()
                .filter(e -> "CODE_DEPENDENCY".equals(e.getElementType()))
                .toList();

        assertThat(depEvidences).hasSize(2);
        assertThat(depEvidences).extracting(CodeEvidenceDTO::getTargetComponent)
                .containsExactlyInAnyOrder("FruitRepository", "InventoryClient");
    }

    @Test
    @DisplayName("Should detect @Autowired and @Inject field injection")
    void shouldDetectAutowiredFieldInjection() {
        String code = """
                package com.mavis.notification.service;
                
                import org.springframework.beans.factory.annotation.Autowired;
                import org.springframework.stereotype.Component;
                import jakarta.inject.Inject;
                
                @Component
                public class EmailNotificationHandler {
                    @Autowired
                    private EmailSender emailSender;
                    
                    @Inject
                    private TemplateEngine templateEngine;
                    
                    private String notInjected;
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        CodeDependencyVisitor visitor = new CodeDependencyVisitor("/app/EmailNotificationHandler.java");
        visitor.visit(cu, evidences);

        assertThat(evidences).anyMatch(e ->
                "GENERAL_COMPONENT".equals(e.getElementType()) && "EmailNotificationHandler".equals(e.getIdentifier())
        );

        List<CodeEvidenceDTO> depEvidences = evidences.stream()
                .filter(e -> "CODE_DEPENDENCY".equals(e.getElementType()))
                .toList();

        assertThat(depEvidences).hasSize(2);
        assertThat(depEvidences).extracting(CodeEvidenceDTO::getTargetComponent)
                .containsExactlyInAnyOrder("EmailSender", "TemplateEngine");
    }

    @Test
    @DisplayName("Should ignore interfaces")
    void shouldIgnoreInterfaces() {
        String code = """
                package com.mavis.catalog;
                
                public interface CatalogApi {
                    void check();
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new CodeDependencyVisitor("/app/CatalogApi.java").visit(cu, evidences);

        assertThat(evidences).isEmpty();
    }
}
