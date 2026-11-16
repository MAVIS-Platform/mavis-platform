package com.mavis.analyzer.detector.docker.service.impl;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import static org.assertj.core.api.Assertions.assertThat;

class ComposeReferenceScannerTest {
    @TempDir Path root;

    @Test void resolvesCustomEndpointsArtifactsAndDeclaredFallbacksWithoutExportingSecrets() throws Exception {
        Files.createDirectories(root.resolve("gateway"));
        Files.writeString(root.resolve("gateway/Dockerfile"), "FROM eclipse-temurin:21\nCOPY build/libs/*.jar /app/gateway.jar\n");
        Files.writeString(root.resolve("docker-compose.yml"), """
            services:
              gateway:
                build: ./gateway
                environment:
                  CUSTOM_DESTINATION: http://orders:8080/orders
                  EVENTUATELOCAL_KAFKA_BOOTSTRAP_SERVERS: kafka:29092
                  EVENTUATELOCAL_ZOOKEEPER_CONNECTION_STRING: zookeeper:2181
                  AWS_DYNAMODB_ENDPOINT_URL: http://dynamodblocal:8000
                  SECRET: do-not-export
                  UNKNOWN: http://${UNRESOLVED}:8080
                  NOT_A_HOST: http://orders.evil.invalid:8080
                depends_on: [orders, mysql]
                links: [kafka:broker]
              orders:
                image: orders:latest
                ports: ["8082:8080"]
              kafka:
                image: kafka:latest
                ports: ["9092:9092"]
              zookeeper:
                image: zookeeper:latest
                ports: ["2181:2181"]
              dynamodblocal:
                image: amazon/dynamodb-local:latest
                ports: ["8000:8000"]
              mysql:
                image: mysql:8
                ports: ["3306:3306"]
            """);
        var containers = new DockerDetectorServiceImpl().detectContainers(root.toString());
        var gateway = containers.get(0);
        assertThat(gateway.getArtifactName()).isEqualTo("gateway.jar");
        assertThat(gateway.getArtifactLocator()).contains("Dockerfile:2");
        assertThat(gateway.getConnections()).anyMatch(c -> c.targetService().equals("orders") && c.protocol().equals("HTTP") && c.port() == 8080);
        assertThat(gateway.getConnections()).anyMatch(c -> c.targetService().equals("kafka") && c.port() == 29092);
        assertThat(gateway.getConnections()).anyMatch(c -> c.targetService().equals("zookeeper") && c.port() == 2181);
        assertThat(gateway.getConnections()).anyMatch(c -> c.targetService().equals("dynamodblocal") && c.port() == 8000);
        assertThat(gateway.getConnections()).anyMatch(c -> c.targetService().equals("mysql") && c.protocol().equals("STARTUP_DEPENDENCY") && c.port() == 3306);
        assertThat(gateway.getConnections()).filteredOn(c -> c.targetService().equals("orders")).hasSize(1);
        assertThat(gateway.getConnections().toString()).doesNotContain("do-not-export", "UNRESOLVED", "evil.invalid");
    }

    @Test void listEnvironmentsAndMissingDockerfilesRemainBounded() throws Exception {
        Files.writeString(root.resolve("docker-compose.yml"), """
            services:
              worker:
                build: ../outside
                environment:
                  - "CUSTOM_ENDPOINT=https://api:9443/path"
                  - PASSWORD=some-password
              api:
                image: api:latest
            """);
        var worker = new DockerDetectorServiceImpl().detectContainers(root.toString()).get(0);
        assertThat(worker.getArtifactName()).isNull();
        assertThat(worker.getConnections()).hasSize(1);
        assertThat(worker.getConnections().get(0).protocol()).isEqualTo("HTTPS");
        assertThat(worker.getConnections().get(0).port()).isEqualTo(9443);
    }
}
