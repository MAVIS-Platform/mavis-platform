package com.mavis.analyzer.detector.docker.service.impl;

import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.dto.DockerDependencyDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DockerDetectorServiceImplTest {

    private DockerDetectorServiceImpl dockerDetectorService;

    @TempDir
    Path tempDir;

    @BeforeEach
    void setUp() {
        dockerDetectorService = new DockerDetectorServiceImpl();
    }

    @Test
    @DisplayName("detectContainers - Phân loại chính xác DATABASE, QUEUE_BROKER, SERVICE_CONTAINER và trích xuất depends_on, ports")
    void detectContainers_Success() throws IOException {
        String composeContent = """
                version: '3.8'

                services:
                  api-gateway:
                    build: ./api-gateway
                    ports:
                      - "8080:8080"
                    depends_on:
                      - order-service
                      - catalog-service

                  order-service:
                    image: fruit-order-service:1.0
                    ports:
                      - "8083:8083"
                    depends_on:
                      - order-db
                      - kafka-broker

                  order-db:
                    image: postgres:15-alpine
                    ports:
                      - "5432:5432"

                  catalog-cache:
                    image: redis:7-alpine
                    ports:
                      - "6379:6379"

                  kafka-broker:
                    image: confluentinc/cp-kafka:7.4.0
                    ports:
                      - "9092:9092"

                  rabbit-queue:
                    image: rabbitmq:3-management
                    ports:
                      - "5672:5672"
                """;

        Path composeFile = tempDir.resolve("docker-compose.yml");
        Files.writeString(composeFile, composeContent);

        List<DetectedContainerDTO> containers = dockerDetectorService.detectContainers(tempDir.toString());

        assertThat(containers).hasSize(6);

        // 1. Kiểm tra api-gateway (SERVICE_CONTAINER)
        DetectedContainerDTO apiGateway = containers.stream()
                .filter(c -> "api-gateway".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(apiGateway.getElementType()).isEqualTo("SERVICE_CONTAINER");
        assertThat(apiGateway.getPorts()).containsExactly("8080:8080");
        assertThat(apiGateway.getDependsOn()).extracting(DockerDependencyDTO::getTargetService)
                .containsExactly("order-service", "catalog-service");
        // Kiểm tra số dòng được ghi nhận
        assertThat(apiGateway.getLineNumber()).isEqualTo(4);

        // 2. Kiểm tra order-service
        DetectedContainerDTO orderService = containers.stream()
                .filter(c -> "order-service".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(orderService.getElementType()).isEqualTo("SERVICE_CONTAINER");
        assertThat(orderService.getImage()).isEqualTo("fruit-order-service:1.0");
        assertThat(orderService.getDependsOn()).extracting(DockerDependencyDTO::getTargetService)
                .containsExactly("order-db", "kafka-broker");

        // 3. Kiểm tra order-db (DATABASE từ postgres)
        DetectedContainerDTO orderDb = containers.stream()
                .filter(c -> "order-db".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(orderDb.getElementType()).isEqualTo("DATABASE");
        assertThat(orderDb.getImage()).isEqualTo("postgres:15-alpine");
        assertThat(orderDb.getPorts()).containsExactly("5432:5432");

        // 4. Kiểm tra catalog-cache (DATABASE từ redis)
        DetectedContainerDTO redisContainer = containers.stream()
                .filter(c -> "catalog-cache".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(redisContainer.getElementType()).isEqualTo("DATABASE");
        assertThat(redisContainer.getImage()).isEqualTo("redis:7-alpine");

        // 5. Kiểm tra kafka-broker (QUEUE_BROKER từ kafka)
        DetectedContainerDTO kafkaContainer = containers.stream()
                .filter(c -> "kafka-broker".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(kafkaContainer.getElementType()).isEqualTo("QUEUE_BROKER");
        assertThat(kafkaContainer.getImage()).isEqualTo("confluentinc/cp-kafka:7.4.0");

        // 6. Kiểm tra rabbit-queue (QUEUE_BROKER từ rabbitmq)
        DetectedContainerDTO rabbitContainer = containers.stream()
                .filter(c -> "rabbit-queue".equals(c.getServiceName()))
                .findFirst().orElseThrow();
        assertThat(rabbitContainer.getElementType()).isEqualTo("QUEUE_BROKER");
    }

    @Test
    @DisplayName("detectServices - Trích xuất danh sách tên services")
    void detectServices_ReturnsServiceNames() throws IOException {
        String composeContent = """
                services:
                  service-a:
                    image: my-app:latest
                  service-b:
                    image: my-app2:latest
                """;

        Path composeFile = tempDir.resolve("docker-compose.yaml");
        Files.writeString(composeFile, composeContent);

        List<String> serviceNames = dockerDetectorService.detectServices(tempDir.toString());
        assertThat(serviceNames).containsExactly("service-a", "service-b");
    }

    @Test
    @DisplayName("detectContainers - Trả về rỗng khi không có file compose")
    void detectContainers_NoFile_ReturnsEmpty() {
        List<DetectedContainerDTO> containers = dockerDetectorService.detectContainers(tempDir.toString());
        assertThat(containers).isEmpty();
    }

    @Test
    void composeDatabaseBindingUsesSelectedDeploymentAndNeverParsesCredentials() throws IOException {
        Files.writeString(tempDir.resolve("docker-compose.yml"), """
                services:
                  api:
                    build:
                      context: ./modules/orders
                    environment:
                      SPRING_DATASOURCE_URL: jdbc:mysql://mysql/orders
                      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092
                      SPRING_DATASOURCE_PASSWORD: do-not-import
                  mysql:
                    image: mysql:8
                """);
        var containers=dockerDetectorService.detectContainers(tempDir.toString());
        assertThat(containers.get(0).getBuildContext()).isEqualTo("./modules/orders");
        assertThat(containers.get(0).getDatasourceHost()).isEqualTo("mysql");
        assertThat(containers.get(0).getDatasourceTechnology()).isEqualTo("mysql");
        assertThat(containers.get(0).getDatasourceDatabase()).isEqualTo("orders");
        assertThat(containers.get(0).getMessageBrokerAuthority()).isEqualTo("kafka:9092");
        assertThat(DockerDetectorServiceImpl.resolveElementType("provectuslabs/kafka-ui:latest","kafka-ui")).isEqualTo("SERVICE_CONTAINER");
        assertThat(DockerDetectorServiceImpl.resolveElementType("amazon/dynamodb-local:latest","dynamodblocal")).isEqualTo("DATABASE");
    }}
