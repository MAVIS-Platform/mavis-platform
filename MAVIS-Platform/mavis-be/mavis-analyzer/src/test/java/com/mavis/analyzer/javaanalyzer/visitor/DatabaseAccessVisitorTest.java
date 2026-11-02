package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DatabaseAccessVisitorTest {

    @Test
    @DisplayName("Should detect JpaRepository interface and extract managed entity")
    void shouldDetectJpaRepositoryInterface() {
        String code = """
                package com.mavis.order.repository;
                
                import org.springframework.data.jpa.repository.JpaRepository;
                import java.util.UUID;
                
                public interface OrderRepository extends JpaRepository<Order, UUID> {
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        DatabaseAccessVisitor visitor = new DatabaseAccessVisitor("/app/OrderRepository.java");
        visitor.visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        CodeEvidenceDTO evidence = evidences.get(0);
        assertThat(evidence.getElementType()).isEqualTo("DATABASE_REPOSITORY");
        assertThat(evidence.getIdentifier()).isEqualTo("OrderRepository");
        assertThat(evidence.getSourceComponent()).isEqualTo("OrderRepository");
        assertThat(evidence.getTargetComponent()).isEqualTo("Order");
        assertThat(evidence.getFilePath()).isEqualTo("/app/OrderRepository.java");
        assertThat(evidence.getCodeSnippet()).isEqualTo("public interface OrderRepository");
    }

    @Test
    @DisplayName("Should detect MongoRepository and CrudRepository interfaces")
    void shouldDetectMongoAndCrudRepository() {
        String code = """
                package com.mavis.catalog.repository;
                
                import org.springframework.data.mongodb.repository.MongoRepository;
                
                public interface ProductCatalogRepository extends MongoRepository<Product, String> {
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new DatabaseAccessVisitor("/app/ProductCatalogRepository.java").visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        CodeEvidenceDTO evidence = evidences.get(0);
        assertThat(evidence.getElementType()).isEqualTo("DATABASE_REPOSITORY");
        assertThat(evidence.getIdentifier()).isEqualTo("ProductCatalogRepository");
        assertThat(evidence.getTargetComponent()).isEqualTo("Product");
    }

    @Test
    @DisplayName("Should detect @Entity and @Table annotation with custom table name")
    void shouldDetectEntityAndTableName() {
        String code = """
                package com.mavis.order.entity;
                
                import jakarta.persistence.Entity;
                import jakarta.persistence.Table;
                
                @Entity
                @Table(name = "tbl_customer_orders")
                public class Order {
                    private Long id;
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        DatabaseAccessVisitor visitor = new DatabaseAccessVisitor("/app/Order.java");
        visitor.visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        CodeEvidenceDTO evidence = evidences.get(0);
        assertThat(evidence.getElementType()).isEqualTo("DATABASE_ENTITY");
        assertThat(evidence.getIdentifier()).isEqualTo("tbl_customer_orders");
        assertThat(evidence.getSourceComponent()).isEqualTo("Order");
        assertThat(evidence.getTargetComponent()).isEqualTo("tbl_customer_orders");
        assertThat(evidence.getCodeSnippet()).doesNotContain("[").contains("@Entity").contains("public class Order");
    }

    @Test
    @DisplayName("Should detect @Entity without @Table defaulting to class name")
    void shouldDetectEntityDefaultingToClassName() {
        String code = """
                package com.mavis.payment.entity;
                
                import jakarta.persistence.Entity;
                
                @Entity
                public class PaymentTransaction {
                    private Long id;
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        DatabaseAccessVisitor visitor = new DatabaseAccessVisitor("/app/PaymentTransaction.java");
        visitor.visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        CodeEvidenceDTO evidence = evidences.get(0);
        assertThat(evidence.getElementType()).isEqualTo("DATABASE_ENTITY");
        assertThat(evidence.getIdentifier()).isEqualTo("PaymentTransaction");
    }
}
