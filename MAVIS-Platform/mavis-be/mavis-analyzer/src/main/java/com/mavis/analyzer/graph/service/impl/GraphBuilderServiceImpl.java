package com.mavis.analyzer.graph.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.detector.config.dto.ConfigTargetUrlDTO;
import com.mavis.analyzer.detector.config.dto.DetectedSpringConfigDTO;
import com.mavis.analyzer.detector.config.service.SpringConfigDetectorService;
import com.mavis.analyzer.detector.docker.dto.DetectedContainerDTO;
import com.mavis.analyzer.detector.docker.dto.DockerDependencyDTO;
import com.mavis.analyzer.detector.docker.service.DockerDetectorService;
import com.mavis.analyzer.graph.service.GraphBuilderService;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import com.mavis.analyzer.workerclient.dto.DotnetAnalyzeResponseDTO;
import com.mavis.analyzer.workerclient.dto.DotnetElementDTO;
import com.mavis.analyzer.workerclient.dto.DotnetEvidenceDTO;
import com.mavis.analyzer.workerclient.dto.DotnetRelationDTO;
import com.mavis.analyzer.workerclient.service.DotnetWorkerClientService;
import com.mavis.common.entity.Evidence;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import com.mavis.common.entity.ModelVersion;
import com.mavis.common.entity.SourceSnapshot;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
public class GraphBuilderServiceImpl implements GraphBuilderService {

    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final DockerDetectorService dockerDetectorService;
    private final SpringConfigDetectorService springConfigDetectorService;
    private final DotnetWorkerClientService dotnetWorkerClientService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final Pattern URL_HOST_PATTERN = Pattern.compile("https?://([^:/]+)(?::\\d+)?.*");

    @Autowired
    public GraphBuilderServiceImpl(ModelElementRepository modelElementRepository,
                                  ModelRelationshipRepository modelRelationshipRepository,
                                  EvidenceRepository evidenceRepository,
                                  @Autowired(required = false) DockerDetectorService dockerDetectorService,
                                  @Autowired(required = false) SpringConfigDetectorService springConfigDetectorService,
                                  @Autowired(required = false) DotnetWorkerClientService dotnetWorkerClientService) {
        this.modelElementRepository = modelElementRepository;
        this.modelRelationshipRepository = modelRelationshipRepository;
        this.evidenceRepository = evidenceRepository;
        this.dockerDetectorService = dockerDetectorService;
        this.springConfigDetectorService = springConfigDetectorService;
        this.dotnetWorkerClientService = dotnetWorkerClientService;
    }

    public GraphBuilderServiceImpl(ModelElementRepository modelElementRepository,
                                  ModelRelationshipRepository modelRelationshipRepository,
                                  EvidenceRepository evidenceRepository,
                                  DockerDetectorService dockerDetectorService,
                                  SpringConfigDetectorService springConfigDetectorService) {
        this(modelElementRepository, modelRelationshipRepository, evidenceRepository, dockerDetectorService, springConfigDetectorService, null);
    }

    public GraphBuilderServiceImpl(ModelElementRepository modelElementRepository,
                                  ModelRelationshipRepository modelRelationshipRepository,
                                  EvidenceRepository evidenceRepository) {
        this(modelElementRepository, modelRelationshipRepository, evidenceRepository, null, null, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices) {
        return buildAndSaveElements(modelVersion, detectedServices);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveNodes(ModelVersion modelVersion, List<String> detectedServices, String sourcePath) {
        return buildAndSaveElements(modelVersion, detectedServices, sourcePath);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices) {
        String sourcePath = resolveSourcePath(modelVersion);
        return buildAndSaveElements(modelVersion, detectedServices, sourcePath);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<ModelElement> buildAndSaveElements(ModelVersion modelVersion, List<String> detectedServices, String sourcePath) {
        List<ModelElement> elements = new ArrayList<>();
        Set<String> addedElementNames = new HashSet<>();

        // 1. Dò tìm từ DockerDetectorService nếu khả dụng
        if (dockerDetectorService != null && sourcePath != null) {
            try {
                List<DetectedContainerDTO> containers = dockerDetectorService.detectContainers(sourcePath);
                for (DetectedContainerDTO c : containers) {
                    if (addedElementNames.add(c.getServiceName().toLowerCase())) {
                        ModelElement element = ModelElement.builder()
                                .modelVersion(modelVersion)
                                .name(c.getServiceName())
                                .elementType(c.getElementType())
                                .languageStack("DATABASE".equals(c.getElementType()) ? "SQL" : "JAVA_SPRING")
                                .scope(sourcePath)
                                .properties(createContainerPropertiesNode(c, sourcePath))
                                .status("VALIDATED")
                                .build();
                        elements.add(element);
                    }
                }
            } catch (Exception e) {
                log.warn("Không thể detect containers qua DockerDetectorService: {}", e.getMessage());
            }
        }

        // 2. Bổ sung từ danh sách detectedServices nếu chưa có
        if (detectedServices != null) {
            for (String serviceName : detectedServices) {
                if (addedElementNames.add(serviceName.toLowerCase())) {
                    ModelElement element = ModelElement.builder()
                            .modelVersion(modelVersion)
                            .name(serviceName)
                            .elementType("SERVICE_CONTAINER")
                            .languageStack("JAVA_SPRING")
                            .scope(sourcePath)
                            .properties(createPropertiesNode(sourcePath))
                            .status("VALIDATED")
                            .build();
                    elements.add(element);
                }
            }
        }

        // 3. Dò tìm Database container từ SpringConfigDetectorService nếu chưa phát hiện
        if (springConfigDetectorService != null && sourcePath != null) {
            try {
                List<DetectedSpringConfigDTO> configs = springConfigDetectorService.detectConfigs(sourcePath);
                for (DetectedSpringConfigDTO cfg : configs) {
                    if (cfg.getDatasourceHost() != null && !cfg.getDatasourceHost().isBlank()) {
                        String dbHost = cfg.getDatasourceHost().toLowerCase();
                        if (addedElementNames.add(dbHost)) {
                            ModelElement dbElement = ModelElement.builder()
                                    .modelVersion(modelVersion)
                                    .name(cfg.getDatasourceHost())
                                    .elementType("DATABASE")
                                    .languageStack("SQL")
                                    .scope(sourcePath)
                                    .properties(createPropertiesNode(sourcePath))
                                    .status("VALIDATED")
                                    .build();
                            elements.add(dbElement);
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Không thể detect database từ SpringConfigDetectorService: {}", e.getMessage());
            }
        }

        // 4. Fallback nếu không phát hiện được container nào
        if (elements.isEmpty()) {
            String projectName = (modelVersion != null && modelVersion.getProject() != null)
                    ? modelVersion.getProject().getName()
                    : "default-service";
            log.info("No containers detected. Creating fallback ModelElement: {}", projectName);

            ModelElement fallbackElement = ModelElement.builder()
                    .modelVersion(modelVersion)
                    .name(projectName)
                    .elementType("SERVICE_CONTAINER")
                    .languageStack("JAVA_SPRING")
                    .scope(sourcePath)
                    .properties(createPropertiesNode(sourcePath))
                    .status("VALIDATED")
                    .build();
            elements.add(fallbackElement);
        }

        List<ModelElement> savedElements = modelElementRepository.saveAll(elements);
        log.info("Successfully persisted {} Level-2 model elements for model version ID: {}",
                savedElements.size(), modelVersion != null ? modelVersion.getId() : null);
        return savedElements;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void buildEdgesAndEvidences(ModelVersion modelVersion, List<ModelElement> elements, List<CodeEvidenceDTO> evidences) {
        SourceSnapshot snapshot = modelVersion != null ? modelVersion.getSourceSnapshot() : null;
        buildRelationshipsAndEvidences(snapshot, modelVersion, elements, evidences);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void buildRelationshipsAndEvidences(SourceSnapshot sourceSnapshot, ModelVersion modelVersion,
                                              List<ModelElement> elements, List<CodeEvidenceDTO> evidences) {
        if (elements == null || elements.isEmpty()) {
            log.info("Elements list is empty. Skipping relationship and evidence building.");
            return;
        }

        String sourcePath = resolveSourcePath(modelVersion);
        UUID projectId = (modelVersion != null && modelVersion.getProject() != null) ? modelVersion.getProject().getId() : null;
        UUID snapshotId = sourceSnapshot != null ? sourceSnapshot.getId() : (modelVersion != null && modelVersion.getSourceSnapshot() != null ? modelVersion.getSourceSnapshot().getId() : null);

        // =========================================================================
        // BƯỚC 0: GỌI C# ROSLYN WORKER NẾU CÓ DỰ ÁN .NET (GRACEFUL DEGRADATION)
        // =========================================================================
        DotnetAnalyzeResponseDTO dotnetAnalysis = null;
        if (dotnetWorkerClientService != null && sourcePath != null) {
            try {
                dotnetAnalysis = dotnetWorkerClientService.analyzeDotnetIfPresent(projectId, snapshotId, sourcePath);
            } catch (Exception e) {
                log.warn("Lỗi khi gọi DotnetWorkerClientService: {}. Tiến hành phân tích Java bình thường.", e.getMessage());
            }
        }

        // =========================================================================
        // BƯỚC 1: XÂY DỰNG VÀ LƯU BATCH CÁC COMPONENT CON (LEVEL 3 C4 HIERARCHY)
        // HỢP NHẤT CẢ PHẦN TỬ JAVA VÀ PHẦN TỬ C#
        // =========================================================================
        List<ModelElement> componentsToSave = new ArrayList<>();
        Set<String> processedComponents = new HashSet<>();

        // 1a. Java Components (Controller, Service, Repository, Component)
        if (evidences != null && !evidences.isEmpty()) {
            for (CodeEvidenceDTO ev : evidences) {
                String type = ev.getElementType();
                if ("CONTROLLER_COMPONENT".equals(type) || "SERVICE_COMPONENT".equals(type)
                        || "DATABASE_REPOSITORY".equals(type) || "GENERAL_COMPONENT".equals(type)) {

                    String compName = ev.getIdentifier();
                    ModelElement owningContainer = findOwningContainer(elements, ev.getFilePath());
                    String containerName = owningContainer != null ? owningContainer.getName() : "default";
                    String compKey = containerName + ":" + compName;

                    if (processedComponents.add(compKey)) {
                        ModelElement compEl = ModelElement.builder()
                                .modelVersion(modelVersion)
                                .parentElement(owningContainer) // Gán parent_element_id theo C4
                                .name(compName)
                                .elementType("COMPONENT")
                                .languageStack("JAVA_SPRING")
                                .scope(ev.getFilePath())
                                .properties(createPropertiesNode(ev.getFilePath()))
                                .status("VALIDATED")
                                .build();
                        componentsToSave.add(compEl);
                    }
                }
            }
        }

        // 1b. C# .NET Components từ C# Roslyn Worker
        if (dotnetAnalysis != null && dotnetAnalysis.getElements() != null) {
            for (DotnetElementDTO csharpEl : dotnetAnalysis.getElements()) {
                String compName = csharpEl.getName();
                if (compName == null || compName.isBlank()) continue;

                ModelElement owningContainer = null;
                if (csharpEl.getParentElementName() != null) {
                    owningContainer = matchTargetElement(elements, csharpEl.getParentElementName());
                }
                if (owningContainer == null) {
                    owningContainer = findOwningContainer(elements, csharpEl.getScope());
                }

                String containerName = owningContainer != null ? owningContainer.getName() : "default";
                String compKey = containerName + ":" + compName;

                if (processedComponents.add(compKey)) {
                    ModelElement compEl = ModelElement.builder()
                            .modelVersion(modelVersion)
                            .parentElement(owningContainer)
                            .name(compName)
                            .elementType(csharpEl.getElementType() != null ? csharpEl.getElementType() : "COMPONENT")
                            .languageStack(csharpEl.getLanguageStack() != null ? csharpEl.getLanguageStack() : "CSHARP_DOTNET")
                            .scope(csharpEl.getScope())
                            .properties(convertPropertiesNode(csharpEl.getProperties(), csharpEl.getScope()))
                            .status("VALIDATED")
                            .build();
                    componentsToSave.add(compEl);
                }
            }
        }

        List<ModelElement> savedComponents = new ArrayList<>();
        if (!componentsToSave.isEmpty()) {
            savedComponents = modelElementRepository.saveAll(componentsToSave);
            log.info("Successfully batch saved {} C4 COMPONENT elements (Java & C#) with parent hierarchy", savedComponents.size());
        }

        List<ModelElement> allElements = new ArrayList<>(elements);
        allElements.addAll(savedComponents);

        // =========================================================================
        // XÂY DỰNG HASHMAP O(1) CHO VIỆC TÌM KIẾM PHẦN TỬ LIÊN NGÔN NGỮ (CROSS-LANGUAGE)
        // =========================================================================
        Map<String, ModelElement> elementByNameMap = new HashMap<>();
        for (ModelElement el : allElements) {
            if (el.getName() != null) {
                elementByNameMap.put(el.getName().toLowerCase().trim(), el);
            }
        }

        // =========================================================================
        // BƯỚC 2: XÂY DỰNG VÀ LƯU BATCH REST_API EVIDENCES (JAVA + C#)
        // =========================================================================
        List<Evidence> allEvidencesToSave = new ArrayList<>();

        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("REST_API".equalsIgnoreCase(ev.getElementType())) {
                    ModelElement owningEl = elementByNameMap.get(ev.getSourceComponent() != null ? ev.getSourceComponent().toLowerCase().trim() : "");
                    if (owningEl == null) {
                        owningEl = findComponentOrContainer(allElements, ev.getSourceComponent(), ev.getFilePath());
                    }
                    String locator = (ev.getFilePath() != null ? ev.getFilePath() : "") + ":" + ev.getLineNumber();

                    Evidence apiEvidence = Evidence.builder()
                            .sourceSnapshot(sourceSnapshot)
                            .modelVersion(modelVersion)
                            .element(owningEl)
                            .locator(locator)
                            .adapterVersion("JAVAPARSER_3.25")
                            .sourceType("STATIC_CODE")
                            .excerpt(ev.getCodeSnippet())
                            .build();
                    allEvidencesToSave.add(apiEvidence);
                }
            }
        }

        // Bổ sung các standalone evidences từ C# Worker (nếu có gắn liền với element)
        if (dotnetAnalysis != null && dotnetAnalysis.getEvidences() != null) {
            for (DotnetEvidenceDTO evDto : dotnetAnalysis.getEvidences()) {
                if (evDto.getElementName() != null && (evDto.getSourceElementName() == null || evDto.getTargetElementName() == null)) {
                    ModelElement targetEl = elementByNameMap.get(evDto.getElementName().toLowerCase().trim());
                    if (targetEl != null) {
                        Evidence ev = Evidence.builder()
                                .sourceSnapshot(sourceSnapshot)
                                .modelVersion(modelVersion)
                                .element(targetEl)
                                .relationship(null)
                                .locator(evDto.getLocator() != null ? evDto.getLocator() : "RoslynWorker")
                                .adapterVersion(evDto.getAdapterVersion() != null ? evDto.getAdapterVersion() : "ROSLYN_4.8")
                                .sourceType(evDto.getSourceType() != null ? evDto.getSourceType() : "STATIC_CODE")
                                .excerpt(evDto.getExcerpt())
                                .build();
                        allEvidencesToSave.add(ev);
                    }
                }
            }
        }

        // =========================================================================
        // BƯỚC 3: XÂY DỰNG ĐỦ 4 LOẠI RELATIONSHIPS VÀ BẰNG CHỨNG ĐI KÈM
        // HỖ TRỢ KẾT NỐI LIÊN NGÔN NGỮ (JAVA <-> C#) TRONG THỜI GIAN O(1)
        // =========================================================================
        List<ModelRelationship> relationshipsToSave = new ArrayList<>();
        List<RelEvidenceContext> relEvidenceContexts = new ArrayList<>();

        // (1) DECLARED_COMPOSE: Từ depends_on trong docker-compose.yml
        if (dockerDetectorService != null && sourcePath != null) {
            try {
                List<DetectedContainerDTO> containers = dockerDetectorService.detectContainers(sourcePath);
                for (DetectedContainerDTO c : containers) {
                    ModelElement sourceContainer = elementByNameMap.get(c.getServiceName().toLowerCase().trim());
                    if (sourceContainer == null) sourceContainer = matchTargetElement(elements, c.getServiceName());

                    for (DockerDependencyDTO dep : c.getDependsOn()) {
                        ModelElement targetContainer = elementByNameMap.get(dep.getTargetService().toLowerCase().trim());
                        if (targetContainer == null) targetContainer = matchTargetElement(elements, dep.getTargetService());

                        if (sourceContainer != null && targetContainer != null) {
                            ModelRelationship rel = ModelRelationship.builder()
                                    .modelVersion(modelVersion)
                                    .sourceElement(sourceContainer)
                                    .targetElement(targetContainer)
                                    .relationType("DECLARED_COMPOSE")
                                    .originLayer("DEPLOYMENT")
                                    .direction("DIRECTED")
                                    .build();
                            relationshipsToSave.add(rel);

                            String loc = (c.getComposeFilePath() != null ? c.getComposeFilePath() : "docker-compose.yml") + ":" + dep.getLineNumber();
                            relEvidenceContexts.add(new RelEvidenceContext(rel, loc, "DOCKER_COMPOSE", "depends_on: " + dep.getTargetService(), "DOCKER_COMPOSE"));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi khi xây dựng quan hệ DECLARED_COMPOSE: {}", e.getMessage());
            }
        }

        // (2) SERVICE_HTTP_CALL: Từ @FeignClient, RestTemplate, WebClient và Spring Config URLs
        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                String type = ev.getElementType();
                if ("FEIGN_CLIENT".equalsIgnoreCase(type) || "REST_TEMPLATE_CALL".equalsIgnoreCase(type)
                        || "WEB_CLIENT_CALL".equalsIgnoreCase(type)) {

                    String targetServiceName = ev.getIdentifier();
                    if (targetServiceName == null || targetServiceName.isBlank()) continue;

                    ModelElement targetElement = elementByNameMap.get(targetServiceName.toLowerCase().trim());
                    if (targetElement == null) {
                        targetElement = matchTargetElement(elements, targetServiceName);
                    }

                    if (targetElement != null) {
                        ModelElement sourceElement = (ev.getSourceComponent() != null && !ev.getSourceComponent().isBlank())
                                ? elementByNameMap.get(ev.getSourceComponent().toLowerCase().trim())
                                : null;
                        if (sourceElement == null) {
                            sourceElement = findComponentOrContainer(allElements, ev.getSourceComponent(), ev.getFilePath());
                        }

                        ModelRelationship relationship = ModelRelationship.builder()
                                .modelVersion(modelVersion)
                                .sourceElement(sourceElement)
                                .targetElement(targetElement)
                                .relationType("SERVICE_HTTP_CALL")
                                .originLayer("STATIC")
                                .direction("DIRECTED")
                                .build();
                        relationshipsToSave.add(relationship);

                        String locator = (ev.getFilePath() != null ? ev.getFilePath() : "") + ":" + ev.getLineNumber();
                        relEvidenceContexts.add(new RelEvidenceContext(relationship, locator, "STATIC_CODE", ev.getCodeSnippet(), "JAVAPARSER_3.25"));
                    }
                }
            }
        }

        // Bổ sung quan hệ SERVICE_HTTP_CALL từ cấu hình Spring *.service-url
        if (springConfigDetectorService != null && sourcePath != null) {
            try {
                List<DetectedSpringConfigDTO> configs = springConfigDetectorService.detectConfigs(sourcePath);
                for (DetectedSpringConfigDTO cfg : configs) {
                    if (cfg.getApplicationName() == null) continue;
                    ModelElement sourceContainer = elementByNameMap.get(cfg.getApplicationName().toLowerCase().trim());
                    if (sourceContainer == null) sourceContainer = matchTargetElement(elements, cfg.getApplicationName());

                    for (ConfigTargetUrlDTO targetUrlDto : cfg.getTargetServiceUrls()) {
                        String targetHost = extractHostFromUrl(targetUrlDto.getTargetUrl());
                        if (targetHost == null) continue;
                        ModelElement targetContainer = elementByNameMap.get(targetHost.toLowerCase().trim());
                        if (targetContainer == null) targetContainer = matchTargetElement(elements, targetHost);

                        if (sourceContainer != null && targetContainer != null
                                && !containsRelationship(relationshipsToSave, sourceContainer, targetContainer, "SERVICE_HTTP_CALL")) {

                            ModelRelationship relationship = ModelRelationship.builder()
                                    .modelVersion(modelVersion)
                                    .sourceElement(sourceContainer)
                                    .targetElement(targetContainer)
                                    .relationType("SERVICE_HTTP_CALL")
                                    .originLayer("CONFIG")
                                    .direction("DIRECTED")
                                    .build();
                            relationshipsToSave.add(relationship);

                            String loc = cfg.getConfigFilePath() + ":" + targetUrlDto.getLineNumber();
                            relEvidenceContexts.add(new RelEvidenceContext(relationship, loc, "CONFIG_FILE", targetUrlDto.getConfigKey() + "=" + targetUrlDto.getTargetUrl(), "SPRING_CONFIG"));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi khi kết nối SERVICE_HTTP_CALL từ Spring config: {}", e.getMessage());
            }
        }

        // (3) CODE_DEPENDENCY: Giữa các Component trong cùng service (Java)
        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("CODE_DEPENDENCY".equalsIgnoreCase(ev.getElementType())) {
                    String srcCompName = ev.getSourceComponent();
                    String tgtCompName = ev.getTargetComponent();
                    if (srcCompName == null || srcCompName.isBlank() || tgtCompName == null || tgtCompName.isBlank()) continue;

                    ModelElement srcEl = elementByNameMap.get(srcCompName.toLowerCase().trim());
                    if (srcEl == null) srcEl = findComponentByName(allElements, srcCompName, ev.getFilePath());

                    ModelElement tgtEl = elementByNameMap.get(tgtCompName.toLowerCase().trim());
                    if (tgtEl == null) tgtEl = findComponentByName(allElements, tgtCompName, ev.getFilePath());

                    if (srcEl != null && tgtEl != null && !srcEl.equals(tgtEl)) {
                        ModelRelationship rel = ModelRelationship.builder()
                                .modelVersion(modelVersion)
                                .sourceElement(srcEl)
                                .targetElement(tgtEl)
                                .relationType("CODE_DEPENDENCY")
                                .originLayer("STATIC")
                                .direction("DIRECTED")
                                .build();
                        relationshipsToSave.add(rel);

                        String loc = (ev.getFilePath() != null ? ev.getFilePath() : "") + ":" + ev.getLineNumber();
                        relEvidenceContexts.add(new RelEvidenceContext(rel, loc, "STATIC_CODE", ev.getCodeSnippet(), "JAVAPARSER_3.25"));
                    }
                }
            }
        }

        // (4) DATABASE_ACCESS: Từ Repository/Entity đến Database Node (Java)
        Map<String, String> serviceToDbHostMap = mapServicesToDatabases(sourcePath);
        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("DATABASE_REPOSITORY".equalsIgnoreCase(ev.getElementType())) {
                    String repoName = ev.getSourceComponent() != null ? ev.getSourceComponent() : ev.getIdentifier();
                    if (repoName == null || repoName.isBlank()) continue;

                    ModelElement repoEl = elementByNameMap.get(repoName.toLowerCase().trim());
                    if (repoEl == null) repoEl = findComponentByName(allElements, repoName, ev.getFilePath());

                    ModelElement dbEl = findDatabaseElementForFile(allElements, elements, ev.getFilePath(), serviceToDbHostMap);

                    if (repoEl != null && dbEl != null) {
                        ModelRelationship rel = ModelRelationship.builder()
                                .modelVersion(modelVersion)
                                .sourceElement(repoEl)
                                .targetElement(dbEl)
                                .relationType("DATABASE_ACCESS")
                                .originLayer("STATIC")
                                .direction("DIRECTED")
                                .build();
                        relationshipsToSave.add(rel);

                        String loc = (ev.getFilePath() != null ? ev.getFilePath() : "") + ":" + ev.getLineNumber();
                        relEvidenceContexts.add(new RelEvidenceContext(rel, loc, "STATIC_CODE", ev.getCodeSnippet(), "JAVAPARSER_3.25"));
                    }
                }
            }
        }

        // (5) QUAN HỆ TỪ C# ROSLYN WORKER (BAO GỒM C# GỌI C# VÀ C# GỌI JAVA / JAVA GỌI C#)
        if (dotnetAnalysis != null && dotnetAnalysis.getRelationships() != null) {
            for (DotnetRelationDTO relDto : dotnetAnalysis.getRelationships()) {
                if (relDto.getSourceElementName() == null || relDto.getTargetElementName() == null) continue;

                String srcName = relDto.getSourceElementName().toLowerCase().trim();
                String tgtName = relDto.getTargetElementName().toLowerCase().trim();

                // Tra cứu O(1) qua elementByNameMap
                ModelElement srcEl = elementByNameMap.get(srcName);
                if (srcEl == null) srcEl = matchTargetElement(allElements, relDto.getSourceElementName());

                ModelElement tgtEl = elementByNameMap.get(tgtName);
                if (tgtEl == null) tgtEl = matchTargetElement(allElements, relDto.getTargetElementName());

                if (srcEl != null && tgtEl != null) {
                    String relType = relDto.getRelationType() != null ? relDto.getRelationType() : "SERVICE_HTTP_CALL";
                    if (!containsRelationship(relationshipsToSave, srcEl, tgtEl, relType)) {
                        ModelRelationship rel = ModelRelationship.builder()
                                .modelVersion(modelVersion)
                                .sourceElement(srcEl)
                                .targetElement(tgtEl)
                                .relationType(relType)
                                .originLayer(relDto.getOriginLayer() != null ? relDto.getOriginLayer() : "STATIC")
                                .direction(relDto.getDirection() != null ? relDto.getDirection() : "DIRECTED")
                                .properties(convertPropertiesNode(relDto.getProperties(), null))
                                .build();
                        relationshipsToSave.add(rel);

                        DotnetEvidenceDTO matchedEv = findEvidenceForRel(dotnetAnalysis.getEvidences(), relDto);
                        String locator = matchedEv != null ? matchedEv.getLocator() : "RoslynWorker";
                        String excerpt = matchedEv != null ? matchedEv.getExcerpt() : (relDto.getSourceElementName() + " -> " + relDto.getTargetElementName());
                        String adapter = matchedEv != null && matchedEv.getAdapterVersion() != null ? matchedEv.getAdapterVersion() : "ROSLYN_4.8";
                        String srcType = matchedEv != null && matchedEv.getSourceType() != null ? matchedEv.getSourceType() : "STATIC_CODE";

                        relEvidenceContexts.add(new RelEvidenceContext(rel, locator, srcType, excerpt, adapter));
                    }
                }
            }
        }

        // =========================================================================
        // BƯỚC 4: LƯU BATCH RELATIONSHIPS VÀ BẰNG CHỨNG LIÊN QUAN
        // =========================================================================
        if (!relationshipsToSave.isEmpty()) {
            List<ModelRelationship> savedRelationships = modelRelationshipRepository.saveAll(relationshipsToSave);
            log.info("Successfully batch saved {} model relationships (DECLARED_COMPOSE, SERVICE_HTTP_CALL, CODE_DEPENDENCY, DATABASE_ACCESS)",
                    savedRelationships.size());

            for (int i = 0; i < savedRelationships.size() && i < relEvidenceContexts.size(); i++) {
                ModelRelationship savedRel = savedRelationships.get(i);
                RelEvidenceContext ctx = relEvidenceContexts.get(i);

                Evidence relEvidence = Evidence.builder()
                        .sourceSnapshot(sourceSnapshot)
                        .modelVersion(modelVersion)
                        .relationship(savedRel)
                        .element(null)
                        .locator(ctx.locator)
                        .adapterVersion(ctx.adapterVersion)
                        .sourceType(ctx.sourceType)
                        .excerpt(ctx.excerpt)
                        .build();
                allEvidencesToSave.add(relEvidence);
            }
        }

        if (!allEvidencesToSave.isEmpty()) {
            evidenceRepository.saveAll(allEvidencesToSave);
            log.info("Successfully batch saved {} total evidences", allEvidencesToSave.size());
        }
    }

    private String resolveSourcePath(ModelVersion modelVersion) {
        if (modelVersion != null && modelVersion.getSourceSnapshot() != null && modelVersion.getSourceSnapshot().getStoragePath() != null) {
            String sp = modelVersion.getSourceSnapshot().getStoragePath();
            if (sp.toLowerCase().endsWith(".zip")) {
                int dotIndex = sp.lastIndexOf('.');
                return sp.substring(0, dotIndex) + "_extracted";
            }
            return sp;
        }
        return null;
    }

    private ObjectNode createPropertiesNode(String sourcePath) {
        ObjectNode node = objectMapper.createObjectNode();
        if (sourcePath != null) {
            node.put("sourcePath", sourcePath);
        }
        return node;
    }

    private ObjectNode createContainerPropertiesNode(DetectedContainerDTO c, String sourcePath) {
        ObjectNode node = objectMapper.createObjectNode();
        if (sourcePath != null) {
            node.put("sourcePath", sourcePath);
        }
        if (c.getImage() != null) {
            node.put("image", c.getImage());
        }
        if (c.getPorts() != null && !c.getPorts().isEmpty()) {
            node.putPOJO("ports", c.getPorts());
        }
        return node;
    }

    private JsonNode convertPropertiesNode(Map<String, Object> props, String fallbackScope) {
        if (props != null && !props.isEmpty()) {
            return objectMapper.valueToTree(props);
        }
        return createPropertiesNode(fallbackScope);
    }

    private DotnetEvidenceDTO findEvidenceForRel(List<DotnetEvidenceDTO> evidences, DotnetRelationDTO relDto) {
        if (evidences == null || evidences.isEmpty()) return null;
        for (DotnetEvidenceDTO ev : evidences) {
            if (relDto.getSourceElementName().equalsIgnoreCase(ev.getSourceElementName())
                    && relDto.getTargetElementName().equalsIgnoreCase(ev.getTargetElementName())) {
                return ev;
            }
        }
        return null;
    }

    private ModelElement findOwningContainer(List<ModelElement> elements, String filePath) {
        if (elements == null || elements.isEmpty()) {
            return null;
        }
        if (filePath != null) {
            for (ModelElement el : elements) {
                if ("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())) {
                    if (el.getName() != null && filePath.contains(el.getName())) {
                        return el;
                    }
                }
            }
            for (ModelElement el : elements) {
                if ("SERVICE_CONTAINER".equalsIgnoreCase(el.getElementType())) {
                    return el;
                }
            }
        }
        return elements.get(0);
    }

    private ModelElement findComponentOrContainer(List<ModelElement> allElements, String componentName, String filePath) {
        if (componentName != null) {
            for (ModelElement el : allElements) {
                if (el.getName() != null && el.getName().equalsIgnoreCase(componentName)) {
                    return el;
                }
            }
        }
        return findOwningContainer(allElements, filePath);
    }

    private ModelElement findComponentByName(List<ModelElement> allElements, String compName, String filePath) {
        if (compName == null) return null;
        for (ModelElement el : allElements) {
            if ("COMPONENT".equalsIgnoreCase(el.getElementType()) && compName.equalsIgnoreCase(el.getName())) {
                return el;
            }
        }
        for (ModelElement el : allElements) {
            if (compName.equalsIgnoreCase(el.getName())) {
                return el;
            }
        }
        return null;
    }

    private ModelElement matchTargetElement(List<ModelElement> elements, String targetServiceName) {
        if (targetServiceName == null || targetServiceName.isBlank()) {
            return null;
        }
        // 1. Exact match
        for (ModelElement el : elements) {
            if (el.getName() != null && el.getName().equalsIgnoreCase(targetServiceName)) {
                return el;
            }
        }
        // 2. Contains match
        String targetLower = targetServiceName.toLowerCase();
        for (ModelElement el : elements) {
            if (el.getName() != null) {
                String nodeNameLower = el.getName().toLowerCase();
                if (nodeNameLower.contains(targetLower) || targetLower.contains(nodeNameLower)) {
                    return el;
                }
            }
        }
        return null;
    }

    private ModelElement findDatabaseElementForFile(List<ModelElement> allElements, List<ModelElement> containerElements,
                                                  String filePath, Map<String, String> serviceToDbHostMap) {
        if (filePath != null) {
            for (Map.Entry<String, String> entry : serviceToDbHostMap.entrySet()) {
                if (filePath.contains(entry.getKey())) {
                    ModelElement dbEl = matchTargetElement(containerElements, entry.getValue());
                    if (dbEl != null) {
                        return dbEl;
                    }
                }
            }
        }
        // Fallback: Tìm node DATABASE đầu tiên
        for (ModelElement el : allElements) {
            if ("DATABASE".equalsIgnoreCase(el.getElementType())) {
                return el;
            }
        }
        return null;
    }

    private Map<String, String> mapServicesToDatabases(String sourcePath) {
        Map<String, String> map = new HashMap<>();
        if (springConfigDetectorService != null && sourcePath != null) {
            try {
                List<DetectedSpringConfigDTO> configs = springConfigDetectorService.detectConfigs(sourcePath);
                for (DetectedSpringConfigDTO cfg : configs) {
                    if (cfg.getDatasourceHost() != null && !cfg.getDatasourceHost().isBlank()) {
                        String sName = cfg.getApplicationName() != null ? cfg.getApplicationName() : cfg.getServiceName();
                        if (sName != null) {
                            map.put(sName, cfg.getDatasourceHost());
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return map;
    }

    private String extractHostFromUrl(String url) {
        if (url == null) return null;
        try {
            Matcher m = URL_HOST_PATTERN.matcher(url);
            if (m.matches()) {
                return m.group(1).trim();
            }
            URI uri = URI.create(url);
            if (uri.getHost() != null) {
                return uri.getHost();
            }
        } catch (Exception ignored) {
        }
        return url;
    }

    private boolean containsRelationship(List<ModelRelationship> list, ModelElement src, ModelElement tgt, String type) {
        for (ModelRelationship r : list) {
            if (type.equals(r.getRelationType()) && r.getSourceElement() != null && r.getTargetElement() != null) {
                if (r.getSourceElement().equals(src) && r.getTargetElement().equals(tgt)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static class RelEvidenceContext {
        final ModelRelationship relationship;
        final String locator;
        final String sourceType;
        final String excerpt;
        final String adapterVersion;

        RelEvidenceContext(ModelRelationship relationship, String locator, String sourceType, String excerpt, String adapterVersion) {
            this.relationship = relationship;
            this.locator = locator;
            this.sourceType = sourceType;
            this.excerpt = excerpt;
            this.adapterVersion = adapterVersion;
        }
    }
}
