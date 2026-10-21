package com.mavis.analyzer.detector.config.service.impl;

import com.mavis.analyzer.detector.config.dto.ConfigEvidenceDTO;
import com.mavis.analyzer.detector.config.dto.ConfigTargetUrlDTO;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SpringConfigDetectorServiceImplTest {

    private SpringConfigDetectorServiceImpl detectorService;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        detectorService = new SpringConfigDetectorServiceImpl();
    }

    @Test
    @DisplayName("detectConfigs - Trích xuất chính xác cấu hình từ file application.yml (Database host/db, Port, Name, Target URLs, Evidences)")
    void detectConfigs_FromYaml_Success() throws IOException {
        String yamlContent = """
                server:
                  port: 8083
                spring:
                  application:
                    name: fruit-order-service
                  datasource:
                    url: jdbc:postgresql://order-db:5432/fruit_order_db
                    username: postgres
                services:
                  catalog-url: http://fruit-catalog-service:8081
                  delivery-service-url: http://fruit-delivery-service:8085
                """;

        Path serviceDir = tempDir.resolve("fruit-order-service").resolve("src").resolve("main").resolve("resources");
        Files.createDirectories(serviceDir);
        Path configFile = serviceDir.resolve("application.yml");
        Files.writeString(configFile, yamlContent);

        List<DetectedSpringConfigDTO> configs = detectorService.detectConfigs(tempDir.toString());

        assertThat(configs).hasSize(1);
        DetectedSpringConfigDTO config = configs.get(0);

        assertThat(config.getApplicationName()).isEqualTo("fruit-order-service");
        assertThat(config.getServerPort()).isEqualTo(8083);
        assertThat(config.getDatasourceUrl()).isEqualTo("jdbc:postgresql://order-db:5432/fruit_order_db");
        assertThat(config.getDatasourceHost()).isEqualTo("order-db");
        assertThat(config.getDatasourceDatabase()).isEqualTo("fruit_order_db");
        assertThat(config.getDatasourceLineNumber()).isGreaterThan(0);

        // Kiểm tra danh sách target URLs
        assertThat(config.getTargetServiceUrls()).hasSize(2);
        assertThat(config.getTargetServiceUrls()).extracting(ConfigTargetUrlDTO::getTargetUrl)
                .containsExactlyInAnyOrder("http://fruit-catalog-service:8081", "http://fruit-delivery-service:8085");

        // Kiểm tra Evidences
        assertThat(config.getEvidences()).isNotEmpty();
        assertThat(config.getEvidences()).allMatch(e -> "CONFIG_FILE".equals(e.getSourceType()));
        assertThat(config.getEvidences()).extracting(ConfigEvidenceDTO::getConfigKey)
                .contains("spring.application.name", "server.port", "spring.datasource.url");
    }

    @Test
    @DisplayName("detectConfigs - Trích xuất chính xác từ file application.properties")
    void detectConfigs_FromProperties_Success() throws IOException {
        String propsContent = """
                server.port=8082
                spring.application.name=fruit-inventory-service
                spring.datasource.url=jdbc:mysql://inventory-db:3306/fruit_inventory_db
                order.service-url=http://fruit-order-service:8083
                """;

        Path serviceDir = tempDir.resolve("fruit-inventory-service").resolve("src").resolve("main").resolve("resources");
        Files.createDirectories(serviceDir);
        Path configFile = serviceDir.resolve("application.properties");
        Files.writeString(configFile, propsContent);

        List<DetectedSpringConfigDTO> configs = detectorService.detectConfigs(tempDir.toString());

        assertThat(configs).hasSize(1);
        DetectedSpringConfigDTO config = configs.get(0);

        assertThat(config.getApplicationName()).isEqualTo("fruit-inventory-service");
        assertThat(config.getServerPort()).isEqualTo(8082);
        assertThat(config.getDatasourceHost()).isEqualTo("inventory-db");
        assertThat(config.getDatasourceDatabase()).isEqualTo("fruit_inventory_db");

        assertThat(config.getTargetServiceUrls()).hasSize(1);
        assertThat(config.getTargetServiceUrls().get(0).getConfigKey()).isEqualTo("order.service-url");
        assertThat(config.getTargetServiceUrls().get(0).getTargetUrl()).isEqualTo("http://fruit-order-service:8083");
    }

    @Test
    @DisplayName("detectConfigs - Xử lý placeholder Spring kiểu ${DB_HOST:fallback}")
    void detectConfigs_WithPlaceholder_ExtractsFallback() throws IOException {
        String yamlContent = """
                spring:
                  application:
                    name: payment-service
                  datasource:
                    url: jdbc:postgresql://${DB_HOST:payment-db}:5432/${DB_NAME:fruit_payment_db}
                """;

        Path resDir = tempDir.resolve("payment-service").resolve("src").resolve("main").resolve("resources");
        Files.createDirectories(resDir);
        Files.writeString(resDir.resolve("application.yaml"), yamlContent);

        List<DetectedSpringConfigDTO> configs = detectorService.detectConfigs(tempDir.toString());
        assertThat(configs).hasSize(1);
        assertThat(configs.get(0).getDatasourceHost()).isEqualTo("payment-db");
        assertThat(configs.get(0).getDatasourceDatabase()).isEqualTo("fruit_payment_db");
    }

    @Test
    @DisplayName("detectConfigs - BẮT BUỘC bỏ qua các thư mục test, target, build theo BR-26")
    void detectConfigs_IgnoresTestAndTargetFolders_BR26() throws IOException {
        // 1. File trong thư mục src/main/resources (hợp lệ)
        Path validDir = tempDir.resolve("demo-service").resolve("src").resolve("main").resolve("resources");
        Files.createDirectories(validDir);
        Files.writeString(validDir.resolve("application.yml"), "spring.application.name: valid-service\nserver.port: 8080\n");

        // 2. File trong thư mục test (phải bị bỏ qua)
        Path testDir = tempDir.resolve("demo-service").resolve("src").resolve("test").resolve("resources");
        Files.createDirectories(testDir);
        Files.writeString(testDir.resolve("application.yml"), "spring.application.name: test-ignored-service\n");

        // 3. File trong thư mục target (phải bị bỏ qua)
        Path targetDir = tempDir.resolve("demo-service").resolve("target").resolve("classes");
        Files.createDirectories(targetDir);
        Files.writeString(targetDir.resolve("application.yml"), "spring.application.name: target-ignored-service\n");

        // 4. File trong thư mục build (phải bị bỏ qua)
        Path buildDir = tempDir.resolve("demo-service").resolve("build").resolve("resources");
        Files.createDirectories(buildDir);
        Files.writeString(buildDir.resolve("application.yml"), "spring.application.name: build-ignored-service\n");

        List<DetectedSpringConfigDTO> configs = detectorService.detectConfigs(tempDir.toString());

        assertThat(configs).hasSize(1);
        assertThat(configs.get(0).getApplicationName()).isEqualTo("valid-service");
    }
}
