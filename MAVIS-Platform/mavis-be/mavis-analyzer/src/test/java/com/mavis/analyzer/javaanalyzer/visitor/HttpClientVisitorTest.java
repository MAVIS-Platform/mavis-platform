package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class HttpClientVisitorTest {

    @Test
    @DisplayName("Should detect @FeignClient with name attribute")
    void shouldDetectFeignClientAnnotation() {
        String code = """
                package com.mavis.order.client;
                
                import org.springframework.cloud.openfeign.FeignClient;
                import org.springframework.web.bind.annotation.GetMapping;
                
                @FeignClient(name = "payment-service")
                public interface PaymentClient {
                    @GetMapping("/payments")
                    String getPayments();
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new HttpClientVisitor("/app/PaymentClient.java").visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        CodeEvidenceDTO ev = evidences.get(0);
        assertThat(ev.getElementType()).isEqualTo("FEIGN_CLIENT");
        assertThat(ev.getIdentifier()).isEqualTo("payment-service");
        assertThat(ev.getSourceComponent()).isEqualTo("PaymentClient");
    }

    @Test
    @DisplayName("Should detect FeignClientVisitor backward compatibility subclass")
    void shouldSupportFeignClientVisitorSubclass() {
        String code = """
                package com.mavis.order.client;
                
                import org.springframework.cloud.openfeign.FeignClient;
                
                @FeignClient("inventory-service")
                public interface InventoryClient {
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new FeignClientVisitor("/app/InventoryClient.java").visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        assertThat(evidences.get(0).getIdentifier()).isEqualTo("inventory-service");
    }

    @Test
    @DisplayName("Should detect RestTemplate calls (getForObject, postForObject, exchange)")
    void shouldDetectRestTemplateCalls() {
        String code = """
                package com.mavis.order.service;
                
                import org.springframework.web.client.RestTemplate;
                
                public class OrderService {
                    private RestTemplate restTemplate;
                
                    public void placeOrder() {
                        restTemplate.getForObject("http://inventory-service/stock", String.class);
                        restTemplate.postForObject("http://payment-service:8082/charge", null, String.class);
                    }
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new HttpClientVisitor("/app/OrderService.java").visit(cu, evidences);

        List<CodeEvidenceDTO> restCalls = evidences.stream()
                .filter(e -> "REST_TEMPLATE_CALL".equals(e.getElementType()))
                .toList();

        assertThat(restCalls).hasSize(2);
        assertThat(restCalls).extracting(CodeEvidenceDTO::getIdentifier)
                .containsExactlyInAnyOrder("inventory-service", "payment-service");
        assertThat(restCalls).allMatch(e -> "OrderService".equals(e.getSourceComponent()));
    }

    @Test
    @DisplayName("Should detect WebClient .uri(...) calls")
    void shouldDetectWebClientCalls() {
        String code = """
                package com.mavis.gateway;
                
                import org.springframework.web.reactive.function.client.WebClient;
                
                public class GatewayRouter {
                    private WebClient webClient;
                
                    public void route() {
                        webClient.get().uri("http://catalog-service/fruits").retrieve();
                    }
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new HttpClientVisitor("/app/GatewayRouter.java").visit(cu, evidences);

        List<CodeEvidenceDTO> webCalls = evidences.stream()
                .filter(e -> "WEB_CLIENT_CALL".equals(e.getElementType()))
                .toList();

        assertThat(webCalls).hasSize(1);
        assertThat(webCalls.get(0).getIdentifier()).isEqualTo("catalog-service");
        assertThat(webCalls.get(0).getSourceComponent()).isEqualTo("GatewayRouter");
    }

    @Test
    @DisplayName("Should ignore Map.put and JpaRepository.delete while detecting real RestOperations put/delete")
    void shouldIgnoreMapPutAndRepositoryDelete() {
        String code = """
                package com.mavis.catalog.service;

                import java.util.Map;
                import org.springframework.web.client.RestOperations;

                public class ProductServiceImpl {
                    private ProductRepository productRepository;
                    private RestOperations httpOps;

                    public void sync(Map<String, Object> claims, Object product) {
                        claims.put("role", "ADMIN");
                        productRepository.delete(product);
                        httpOps.delete("http://inventory-service/stock/1");
                    }
                }
                """;

        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new HttpClientVisitor("/app/ProductServiceImpl.java").visit(cu, evidences);

        assertThat(evidences).hasSize(1);
        assertThat(evidences.get(0).getElementType()).isEqualTo("REST_TEMPLATE_CALL");
        assertThat(evidences.get(0).getIdentifier()).isEqualTo("inventory-service");
    }
}
