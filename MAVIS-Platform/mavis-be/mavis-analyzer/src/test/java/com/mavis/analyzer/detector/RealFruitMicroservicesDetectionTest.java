package com.mavis.analyzer.detector;

import com.mavis.analyzer.detector.config.dto.ConfigTargetUrlDTO;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl;
import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.dto.DockerDependencyDTO;
import com.mavis.analyzer.detector.docker.service.impl.DockerDetectorServiceImpl;
import com.mavis.analyzer.graph.service.impl.GraphBuilderServiceImpl;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.javaanalyzer.parser.JavaSourceParser;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.Project;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mockito;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

class RealFruitMicroservicesDetectionTest {

    @TempDir
    Path tempDir;

    @Test
    @DisplayName("Kiểm thử thực tế toàn diện trên fruit-market-microservices.zip: Docker, Config, Java AST & C4 GraphBuilder")
    void testRealFruitMicroservicesDataset() throws IOException {
        Path zipPath = Paths.get("Huong_Di", "fruit-market-microservices.zip");
        if (!Files.exists(zipPath)) {
            zipPath = Paths.get("..", "Huong_Di", "fruit-market-microservices.zip");
        }
        if (!Files.exists(zipPath)) {
            zipPath = Paths.get("mavis-be", "Huong_Di", "fruit-market-microservices.zip");
        }
        if (!Files.exists(zipPath)) {
            zipPath = Paths.get("..", "mavis-be", "Huong_Di", "fruit-market-microservices.zip");
        }

        assumeTrue(Files.exists(zipPath), "Skipping external dataset test when fruit-market-microservices.zip is absent");

        // 1. Giải nén vào tempDir
        extractZip(zipPath.toFile(), tempDir.toFile());
        Path extractedRoot = tempDir.resolve("fruit-market-microservices");
        if (!extractedRoot.toFile().exists()) {
            extractedRoot = tempDir;
        }

        System.out.println("================================================================================");
        System.out.println(" BÁO CÁO KIỂM THỬ THỰC TẾ TOÀN DIỆN TRÊN BỘ DỮ LIỆU: fruit-market-microservices.zip");
        System.out.println("================================================================================");

        // 2. Chạy DockerDetectorServiceImpl
        DockerDetectorServiceImpl dockerDetector = new DockerDetectorServiceImpl();
        List<DetectedContainerDTO> containers = dockerDetector.detectContainers(extractedRoot.toString());

        System.out.println("\n[1] KẾT QUẢ DÒ QUÉT DOCKER COMPOSE:");
        System.out.println("Tổng số container phát hiện: " + containers.size());
        for (DetectedContainerDTO c : containers) {
            System.out.printf("  - %-28s | Type: %-18s | Image: %-25s | Ports: %s\n",
                    c.getServiceName(), c.getElementType(), c.getImage() != null ? c.getImage() : "(build)", c.getPorts());
            if (!c.getDependsOn().isEmpty()) {
                System.out.print("      -> depends_on: ");
                for (DockerDependencyDTO dep : c.getDependsOn()) {
                    System.out.printf("%s(line %d) ", dep.getTargetService(), dep.getLineNumber());
                }
                System.out.println();
            }
        }

        assertThat(containers).hasSize(11);
        long dbCount = containers.stream().filter(c -> "DATABASE".equals(c.getElementType())).count();
        long serviceCount = containers.stream().filter(c -> "SERVICE_CONTAINER".equals(c.getElementType())).count();
        assertThat(dbCount).isEqualTo(4);
        assertThat(serviceCount).isEqualTo(7);

        // 3. Chạy SpringConfigDetectorServiceImpl
        SpringConfigDetectorServiceImpl configDetector = new SpringConfigDetectorServiceImpl();
        List<DetectedSpringConfigDTO> configs = configDetector.detectConfigs(extractedRoot.toString());

        System.out.println("\n[2] KẾT QUẢ DÒ QUÉT CẤU HÌNH SPRING (application.yml):");
        System.out.println("Tổng số file cấu hình phát hiện: " + configs.size());
        for (DetectedSpringConfigDTO cfg : configs) {
            System.out.printf("  - Service: %-26s | Port: %-5s | DB Host: %-14s | DB Name: %s\n",
                    cfg.getApplicationName(),
                    cfg.getServerPort() != null ? cfg.getServerPort() : "N/A",
                    cfg.getDatasourceHost() != null ? cfg.getDatasourceHost() : "N/A",
                    cfg.getDatasourceDatabase() != null ? cfg.getDatasourceDatabase() : "N/A");
            if (!cfg.getTargetServiceUrls().isEmpty()) {
                for (ConfigTargetUrlDTO url : cfg.getTargetServiceUrls()) {
                    System.out.printf("      -> Target URL [%s] = %s (line %d)\n",
                            url.getConfigKey(), url.getTargetUrl(), url.getLineNumber());
                }
            }
        }

        assertThat(configs).hasSize(7);

        // 4. Chạy JavaSourceParser (với 4 AST Visitors: ControllerVisitor, HttpClientVisitor, CodeDependencyVisitor, DatabaseAccessVisitor)
        JavaSourceParser javaParser = new JavaSourceParser();
        List<CodeEvidenceDTO> evidences = javaParser.parseProject(extractedRoot.toString());

        System.out.println("\n[3] KẾT QUẢ DÒ QUÉT JAVA AST (4 VISITORS):");
        System.out.println("Tổng số Code Evidences thu thập được: " + evidences.size());

        Map<String, List<CodeEvidenceDTO>> evidenceByType = evidences.stream()
                .collect(Collectors.groupingBy(CodeEvidenceDTO::getElementType));

        for (Map.Entry<String, List<CodeEvidenceDTO>> entry : evidenceByType.entrySet()) {
            System.out.printf("  * %-22s: %3d evidences\n", entry.getKey(), entry.getValue().size());
        }

        // 5. Chạy GraphBuilderServiceImpl xây dựng đồ thị C4 & các cạnh quan hệ
        ModelElementRepository modelElementRepo = Mockito.mock(ModelElementRepository.class);
        ModelRelationshipRepository modelRelRepo = Mockito.mock(ModelRelationshipRepository.class);
        EvidenceRepository evidenceRepo = Mockito.mock(EvidenceRepository.class);

        List<ModelElement> savedElements = new ArrayList<>();
        List<ModelRelationship> savedRelationships = new ArrayList<>();
        List<Evidence> savedEvidences = new ArrayList<>();

        when(modelElementRepo.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelElement> list = inv.getArgument(0);
            savedElements.addAll(list);
            return list;
        });
        when(modelRelRepo.saveAll(anyList())).thenAnswer(inv -> {
            List<ModelRelationship> list = inv.getArgument(0);
            savedRelationships.addAll(list);
            return list;
        });
        when(evidenceRepo.saveAll(anyList())).thenAnswer(inv -> {
            List<Evidence> list = inv.getArgument(0);
            savedEvidences.addAll(list);
            return list;
        });

        Project mockProject = Project.builder()
                .id(UUID.randomUUID())
                .name("fruit-market-microservices")
                .build();
        SourceSnapshot mockSnapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(mockProject)
                .storagePath(extractedRoot.toString())
                .build();
        ModelVersion mockModelVersion = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(mockProject)
                .sourceSnapshot(mockSnapshot)
                .revision(1)
                .build();

        GraphBuilderServiceImpl graphBuilder = new GraphBuilderServiceImpl(
                modelElementRepo, modelRelRepo, evidenceRepo, dockerDetector, configDetector
        );

        List<ModelElement> level2Containers = graphBuilder.buildAndSaveElements(mockModelVersion, null, extractedRoot.toString());
        graphBuilder.buildRelationshipsAndEvidences(mockSnapshot, mockModelVersion, level2Containers, evidences);

        System.out.println("\n[4] KẾT QUẢ XÂY DỰNG ĐỒ THỊ KIẾN TRÚC C4 (GraphBuilderServiceImpl):");
        System.out.printf("  - C4 Level 2 Containers: %d (SERVICE_CONTAINER: %d, DATABASE: %d)\n",
                level2Containers.size(),
                level2Containers.stream().filter(e -> "SERVICE_CONTAINER".equals(e.getElementType())).count(),
                level2Containers.stream().filter(e -> "DATABASE".equals(e.getElementType())).count());

        List<ModelElement> level3Components = savedElements.stream()
                .filter(e -> "COMPONENT".equals(e.getElementType()))
                .toList();

        System.out.printf("  - C4 Level 3 Components: %d (được phân cấp cha-con rõ ràng qua parent_element_id)\n",
                level3Components.size());

        System.out.println("\n  Danh sách Component và Service Container trực thuộc (mẫu 15 components đầu tiên):");
        int countComp = 0;
        for (ModelElement comp : level3Components) {
            String parentName = comp.getParentElement() != null ? comp.getParentElement().getName() : "(no parent)";
            System.out.printf("    + %-30s -> trực thuộc: %s\n", comp.getName(), parentName);
            if (++countComp >= 15) {
                System.out.printf("    ... và %d components khác\n", level3Components.size() - 15);
                break;
            }
        }

        System.out.println("\n[5] KẾT QUẢ XÂY DỰNG 4 LOẠI CẠNH QUAN HỆ (ModelRelationship):");
        System.out.printf("Tổng số cạnh quan hệ: %d\n", savedRelationships.size());
        Map<String, List<ModelRelationship>> relsByType = savedRelationships.stream()
                .collect(Collectors.groupingBy(ModelRelationship::getRelationType));

        for (Map.Entry<String, List<ModelRelationship>> entry : relsByType.entrySet()) {
            System.out.printf("  * %-20s: %2d cạnh\n", entry.getKey(), entry.getValue().size());
            for (ModelRelationship r : entry.getValue()) {
                String src = r.getSourceElement() != null ? r.getSourceElement().getName() : "null";
                String tgt = r.getTargetElement() != null ? r.getTargetElement().getName() : "null";
                System.out.printf("      [%s] %s  --->  %s\n", r.getOriginLayer(), src, tgt);
            }
        }

        System.out.println("\n[6] KẾT QUẢ LƯU BẰNG CHỨNG (Evidence):");
        System.out.printf("Tổng số bằng chứng (Evidences) đã lưu: %d (Batch Persistence bằng saveAll)\n", savedEvidences.size());
        System.out.println("================================================================================\n");

        // Assertions
        assertThat(level2Containers).isNotEmpty();
        assertThat(level3Components).isNotEmpty();
        assertThat(level3Components).allMatch(c -> c.getParentElement() != null);
        assertThat(savedRelationships).isNotEmpty();
        assertThat(relsByType.keySet()).contains(
                "DECLARED_COMPOSE",
                "SERVICE_HTTP_CALL",
                "CODE_DEPENDENCY",
                "DATABASE_ACCESS"
        );
        assertThat(savedEvidences).isNotEmpty();
    }

    private void extractZip(File zipFile, File destDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(new FileInputStream(zipFile))) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File newFile = new File(destDir, entry.getName());
                if (entry.isDirectory()) {
                    newFile.mkdirs();
                } else {
                    new File(newFile.getParent()).mkdirs();
                    try (FileOutputStream fos = new FileOutputStream(newFile)) {
                        int len;
                        while ((len = zis.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }
}
