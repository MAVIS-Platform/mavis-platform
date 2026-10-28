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
        List<DetectedContainerDTO> detectedContainers = List.of();

        // 1. Dò tìm từ DockerDetectorService nếu khả dụng
        if (dockerDetectorService != null && sourcePath != null) {
            try {
                detectedContainers = dockerDetectorService.detectContainers(sourcePath);
                for (DetectedContainerDTO c : detectedContainers) {
                    if (addedElementNames.add(c.getServiceName().toLowerCase())) {
                        ModelElement element = ModelElement.builder()
                                .modelVersion(modelVersion)
                                .name(c.getServiceName())
                                .elementType(c.getElementType())
                                .languageStack(ArchitectureResolver.technology(c.getImage()))
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

        // Logical databases are separate from the shared deployment host/server.
        for(var container:detectedContainers) {
            if(container.getDatasourceHost()==null||container.getDatasourceDatabase()==null)continue;
            String databaseName=container.getDatasourceDatabase()+" @ "+container.getDatasourceHost();
            if(addedElementNames.add(databaseName.toLowerCase())) {
                var properties=objectMapper.createObjectNode().put("resourceRole","LOGICAL_DATASTORE").put("physicalHost",container.getDatasourceHost()).put("database",container.getDatasourceDatabase()).put("ownerService",container.getServiceName()).put("classificationSource","COMPOSE_JDBC_BINDING").put("locator",container.getComposeFilePath()+":"+container.getDatasourceLineNumber()).put("responsibility","Stores application data for "+container.getServiceName());
                if(container.getDatasourceTechnology()!=null&&!container.getDatasourceTechnology().isBlank()){
                    properties.put("protocol",container.getDatasourceTechnology());
                }
                elements.add(ModelElement.builder().modelVersion(modelVersion).name(databaseName).elementType("DATABASE").languageStack(container.getDatasourceTechnology()+" protocol").scope(sourcePath).properties(properties).status("VALIDATED").build());
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
                            .languageStack(null)
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
                    if (cfg.getDatasourceHost() != null && !cfg.getDatasourceHost().isBlank() && !cfg.getDatasourceHost().equalsIgnoreCase("localhost") && !cfg.getDatasourceHost().equals("127.0.0.1")) {
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
                    .languageStack(null)
                    .scope(sourcePath)
                    .properties(createPropertiesNode(sourcePath))
                    .status("UNCERTAIN_MAPPING")
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
        // Worker results are imported by WorkerCanonicalImporter inside the publication transaction.

        // =========================================================================
        // BƯỚC 1: XÂY DỰNG VÀ LƯU BATCH CÁC COMPONENT CON (LEVEL 3 C4 HIERARCHY)
        // HỢP NHẤT CẢ PHẦN TỬ JAVA VÀ PHẦN TỬ C#
        // =========================================================================
        List<ModelElement> componentsToSave = new ArrayList<>();
        Set<String> processedComponents = new HashSet<>();

        // 1a. Java Components (Controller, Service, Repository, Component) + UML Classifiers (CLASS_INTERFACE)
        Map<String, CodeEvidenceDTO> classifierEvidencesByKey = new LinkedHashMap<>();
        if (evidences != null && !evidences.isEmpty()) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("CLASS_INTERFACE".equals(ev.getElementType())) {
                    ModelElement owningContainer = findOwningContainer(elements, ev.getFilePath());
                    String containerName = owningContainer != null ? owningContainer.getName() : "default";
                    String compKey = containerName + ":" + (ev.getQualifiedName() != null ? ev.getQualifiedName() : ev.getFilePath() + ":" + ev.getIdentifier());
                    classifierEvidencesByKey.put(compKey, ev);
                }
            }
            for (CodeEvidenceDTO ev : evidences) {
                String type = ev.getElementType();
                if ("CONTROLLER_COMPONENT".equals(type) || "SERVICE_COMPONENT".equals(type)
                        || "DATABASE_REPOSITORY".equals(type) || "GENERAL_COMPONENT".equals(type) || "MESSAGING_COMPONENT".equals(type)) {

                    String compName = ev.getIdentifier();
                    ModelElement owningContainer = findOwningContainer(elements, ev.getFilePath());
                    if(owningContainer!=null) {
                        String technology="MESSAGING_COMPONENT".equals(type)?"JAVA":"JAVA_SPRING";
                        if(owningContainer.getLanguageStack()==null||"JAVA".equals(owningContainer.getLanguageStack()))owningContainer.setLanguageStack(technology);
                    }
                    String containerName = owningContainer != null ? owningContainer.getName() : "default";
                    String compKey = containerName + ":" + (ev.getQualifiedName() != null ? ev.getQualifiedName() : ev.getFilePath() + ":" + compName);

                    if (processedComponents.add(compKey)) {
                        ObjectNode props = componentProperties(ev, owningContainer);
                        CodeEvidenceDTO umlEv = classifierEvidencesByKey.get(compKey);
                        if (umlEv != null) {
                            attachUmlClassifierMetadata(props, umlEv);
                        }
                        ModelElement compEl = ModelElement.builder()
                                .modelVersion(modelVersion)
                                .parentElement(owningContainer) // Gán parent_element_id theo C4
                                .name(compName)
                                .elementType("COMPONENT")
                                .languageStack("JAVA_SPRING")
                                .scope(ev.getFilePath())
                                .properties(props)
                                .status(owningContainer == null ? "UNCERTAIN_MAPPING" : "VALIDATED")
                                .build();
                        componentsToSave.add(compEl);
                    }
                }
            }
            List<ModelElement> serviceContainers = elements.stream()
                    .filter(e -> "SERVICE_CONTAINER".equals(e.getElementType()))
                    .toList();
            for (Map.Entry<String, CodeEvidenceDTO> entry : classifierEvidencesByKey.entrySet()) {
                String compKey = entry.getKey();
                CodeEvidenceDTO umlEv = entry.getValue();
                if (processedComponents.add(compKey)) {
                    ModelElement owningContainer = findOwningContainer(elements, umlEv.getFilePath());
                    if (owningContainer == null && serviceContainers.size() == 1) {
                        owningContainer = serviceContainers.get(0);
                    }
                    CodeEvidenceDTO feignEv = evidences.stream()
                            .filter(e -> "FEIGN_CLIENT".equalsIgnoreCase(e.getElementType())
                                    && Objects.equals(e.getSourceComponent(), umlEv.getIdentifier())
                                    && (e.getFilePath() == null || Objects.equals(e.getFilePath(), umlEv.getFilePath())))
                            .findFirst()
                            .orElse(null);
                    boolean isDeclarativeClient = feignEv != null
                            || (umlEv.getCodeSnippet() != null && umlEv.getCodeSnippet().matches("(?s).*@(FeignClient|HttpExchange|GrpcClient|WebServiceClient|RegisterRestClient)\\b.*"));
                    ObjectNode props = createPropertiesNode(umlEv.getFilePath());
                    props.put("componentBasis", isDeclarativeClient ? "FEIGN_CLIENT" : "UML_CLASSIFIER");
                    props.put("qualifiedName", umlEv.getQualifiedName());
                    if (isDeclarativeClient) {
                        props.put("responsibility", "Declarative outbound HTTP/REST client proxy");
                        if (feignEv != null && feignEv.getIdentifier() != null) {
                            props.put("targetService", feignEv.getIdentifier());
                        }
                    }
                    attachUmlClassifierMetadata(props, umlEv);
                    if (owningContainer == null) {
                        props.put("resolutionIssue", "UNRESOLVED_COMPONENT_OWNER");
                    }
                    ModelElement clsEl = ModelElement.builder()
                            .modelVersion(modelVersion)
                            .parentElement(owningContainer)
                            .name(umlEv.getIdentifier())
                            .elementType(isDeclarativeClient ? "COMPONENT" : "CLASS_INTERFACE")
                            .languageStack(isDeclarativeClient ? "Java / Spring Cloud Feign" : "JAVA_SPRING")
                            .scope(umlEv.getFilePath())
                            .properties(props)
                            .status(owningContainer == null ? "UNCERTAIN_MAPPING" : "VALIDATED")
                            .build();
                    componentsToSave.add(clsEl);
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
                String compKey = containerName + ":" + csharpEl.getScope() + ":" + compName;

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
        Map<String,String> messagingBindings = new HashMap<>();
        if(dockerDetectorService!=null&&sourcePath!=null)for(var container:dockerDetectorService.detectContainers(sourcePath))if(container.getMessageBrokerAuthority()!=null)messagingBindings.put(container.getServiceName(),container.getMessageBrokerAuthority());
        Map<String,ModelElement> channels = new HashMap<>();
        if(evidences!=null)for(var ev:evidences)if(("MESSAGE_PUBLISH".equals(ev.getElementType())||"MESSAGE_SUBSCRIBE".equals(ev.getElementType()))&&!ev.getIdentifier().isBlank()) {
            String key=messageKey(ev,allElements,messagingBindings);
            channels.computeIfAbsent(key, ignored -> {
                ModelElement owner=findOwningContainer(allElements,ev.getFilePath());
                String transport=owner==null?null:messagingBindings.get(owner.getName());
                ObjectNode properties=objectMapper.createObjectNode().put("channelName",ev.getIdentifier()).put("protocol",ev.getEndpointAlias()).put("logicalKey",key).put("transportAuthority",transport);
                properties.put("responsibility",transport==null?"Transport binding unresolved":"Declared channel on "+transport);
                if(transport==null)properties.put("resolutionIssue","UNRESOLVED_MESSAGE_TRANSPORT");
                return ModelElement.builder().modelVersion(modelVersion).name(ev.getIdentifier()+" ["+ev.getEndpointAlias()+"]").elementType("MESSAGE_CHANNEL").languageStack(ev.getEndpointAlias()).properties(properties).status(transport==null?"UNCERTAIN_MAPPING":"VALIDATED").build();
            });
        }
        if(!channels.isEmpty())allElements.addAll(modelElementRepository.saveAll(new ArrayList<>(channels.values())));
        if(evidences!=null)for(var ev:evidences)if("UNRESOLVED_MESSAGE_CHANNEL".equals(ev.getElementType())) {
            var component=findComponentByName(allElements,ev.getSourceComponent(),ev.getFilePath());
            if(component!=null) {var properties=component.getProperties() instanceof ObjectNode existing?existing.deepCopy():objectMapper.createObjectNode();properties.put("resolutionIssue","UNRESOLVED_MESSAGE_CHANNEL");component.setProperties(properties);component.setStatus("UNCERTAIN_MAPPING");}
        }

        // =========================================================================
        // XÂY DỰNG HASHMAP O(1) CHO VIỆC TÌM KIẾM PHẦN TỬ LIÊN NGÔN NGỮ (CROSS-LANGUAGE)
        // =========================================================================
        Map<String, ModelElement> elementByNameMap = new HashMap<>();
        Set<String> ambiguousNames = new HashSet<>();
        for (ModelElement el : allElements) {
            if (el.getName() != null) {
                if (elementByNameMap.containsKey(el.getName().toLowerCase().trim())) ambiguousNames.add(el.getName().toLowerCase().trim());
                elementByNameMap.put(el.getName().toLowerCase().trim(), el);
            }
        }

        // =========================================================================
        // BƯỚC 2: XÂY DỰNG VÀ LƯU BATCH REST_API EVIDENCES (JAVA + C#)
        // =========================================================================
        ambiguousNames.forEach(elementByNameMap::remove);
        List<Evidence> allEvidencesToSave = new ArrayList<>();

        // Keep declaration evidence on every canonical Java classifier, not
        // only REST endpoints. Relation evidence remains attached to relations.
        if (evidences != null) for (CodeEvidenceDTO fact : evidences) {
            if (!"CLASS_INTERFACE".equals(fact.getElementType())) continue;
            var target = findClassifierElement(allElements, fact.getQualifiedName(), fact.getFilePath());
            if (target == null || fact.getFilePath() == null) continue;
            allEvidencesToSave.add(Evidence.builder().sourceSnapshot(sourceSnapshot).modelVersion(modelVersion)
                    .element(target).sourceType("STATIC_CODE").adapterVersion("JAVAPARSER_3.25")
                    .locator(fact.getFilePath() + ":" + fact.getLineNumber()).excerpt(fact.getCodeSnippet()).build());
        }

        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("REST_API".equalsIgnoreCase(ev.getElementType())) {
                    ModelElement owningEl = findComponentOrContainer(allElements, ev.getSourceComponent(), ev.getFilePath());
                    if (owningEl == null) {
                        owningEl = findClassifierElement(allElements, ev.getQualifiedName(), ev.getFilePath());
                    }
                    if (owningEl == null) {
                        log.warn("Skipping REST evidence without a resolved owner: {}:{}", ev.getFilePath(), ev.getLineNumber());
                        continue;
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

        // Source-backed descriptions: a Repository name alone does not prove a database.
        for (var element : allElements) {
            var properties = element.getProperties();
            var classifier = properties == null ? null : properties.get("umlClassifier");
            if (classifier == null) continue;
            String annotations = classifier.path("annotations").toString();
            var parent = element.getParentElement();
            if (parent != null && (annotations.contains("EnableConfigServer") || annotations.contains("EnableEurekaServer"))) {
                var parentProperties = parent.getProperties() instanceof ObjectNode object ? object.deepCopy() : objectMapper.createObjectNode();
                boolean configServer = annotations.contains("EnableConfigServer");
                parent.setLanguageStack(configServer ? "Spring Cloud Config Server" : "Eureka Server");
                parentProperties.put("responsibility", configServer ? "Configuration server declared by @EnableConfigServer" : "Service registry declared by @EnableEurekaServer");
                parentProperties.put("roleEvidencePath", classifier.path("filePath").asText());parent.setProperties(parentProperties);
            }
            if (properties instanceof ObjectNode object && element.getName().endsWith("Repository")) {
                boolean collection = false;
                for (var member : classifier.path("members")) if (member.path("defaultValue").asText().matches("(?s).*new (ArrayList|LinkedList|HashMap|ConcurrentHashMap).*")) collection = true;
                if (collection) {object.put("responsibility", "Repository declaring in-memory collections; external persistence not established");object.put("storageEvidence", "IN_MEMORY_COLLECTION_DECLARED");}
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

        if(evidences!=null)for(var ev:evidences)if("MESSAGE_PUBLISH".equals(ev.getElementType())||"MESSAGE_SUBSCRIBE".equals(ev.getElementType())) {
            ModelElement endpoint=findComponentOrContainer(allElements,ev.getSourceComponent(),ev.getFilePath());
            ModelElement channel=channels.get(messageKey(ev,allElements,messagingBindings));
            if(endpoint==null||channel==null)continue;
            boolean publish="MESSAGE_PUBLISH".equals(ev.getElementType());
            ModelElement from=publish?endpoint:channel,to=publish?channel:endpoint;
            if(containsRelationship(relationshipsToSave,from,to,ev.getElementType()))continue;
            var relationship=ModelRelationship.builder().modelVersion(modelVersion).sourceElement(from).targetElement(to).relationType(ev.getElementType()).originLayer("STATIC").direction("DIRECTED").build();
            relationshipsToSave.add(relationship);
            relEvidenceContexts.add(new RelEvidenceContext(relationship,ev.getFilePath()+":"+ev.getLineNumber(),"STATIC_CODE",ev.getCodeSnippet(),"JAVA_MESSAGING_1"));
        }
        // (1) DECLARED_COMPOSE: Từ depends_on trong docker-compose.yml
        if (dockerDetectorService != null && sourcePath != null) {
            try {
                List<DetectedContainerDTO> composeContainers = dockerDetectorService.detectContainers(sourcePath);
                for (DetectedContainerDTO c : composeContainers) {
                    ModelElement sourceContainer = elementByNameMap.get(c.getServiceName().toLowerCase().trim());
                    if (sourceContainer == null) sourceContainer = matchTargetElement(elements, c.getServiceName());

                    if (sourceContainer != null && c.getComposeFilePath() != null) {
                        allEvidencesToSave.add(Evidence.builder().sourceSnapshot(sourceSnapshot).modelVersion(modelVersion)
                                .element(sourceContainer).sourceType("DOCKER_COMPOSE").adapterVersion("DOCKER_COMPOSE")
                                .locator(c.getComposeFilePath() + ":" + c.getLineNumber()).excerpt(c.getServiceName() + ":").build());
                    }

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
                    for (var connection : c.getConnections()) {
                        boolean link = "DECLARED_LINK".equals(connection.protocol());
                        if (!link && !connection.declaration().startsWith("environment:")) continue;
                        ModelElement targetContainer = elementByNameMap.get(connection.targetService().toLowerCase(java.util.Locale.ROOT));
                        if (sourceContainer == null || targetContainer == null) continue;
                        String key = connection.declaration().replaceFirst("^environment:", "").toLowerCase(java.util.Locale.ROOT).replace('_', '.');
                        String type = link ? "DECLARED_LINK" : com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl.relationTypeForKey(key);
                        if (containsRelationship(relationshipsToSave, sourceContainer, targetContainer, type)) continue;
                        var relationship = ModelRelationship.builder().modelVersion(modelVersion).sourceElement(sourceContainer).targetElement(targetContainer)
                                .relationType(type).originLayer(link ? "DEPLOYMENT" : "CONFIG").direction("DIRECTED")
                                .properties(objectMapper.createObjectNode().put("resolutionStatus", "RESOLVED").put("evidenceBasis", "COMPOSE_DECLARATION").put("configKey", connection.declaration())).build();
                        relationshipsToSave.add(relationship);
                        String locator = c.getComposeFilePath() + ":" + connection.lineNumber();
                        relEvidenceContexts.add(new RelEvidenceContext(relationship, locator, "DOCKER_COMPOSE", connection.declaration() + " -> " + connection.targetService(), "DOCKER_COMPOSE"));
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi khi xây dựng quan hệ DECLARED_COMPOSE: {}", e.getMessage());
            }
        }

        // (2) SERVICE_HTTP_CALL: Từ @FeignClient, RestTemplate, WebClient và Spring Config URLs
        var sourceConfigurations=springConfigDetectorService!=null && sourcePath!=null?springConfigDetectorService.detectConfigs(sourcePath):List.<DetectedSpringConfigDTO>of();
        if(sourceConfigurations==null) sourceConfigurations=List.of();
        if (evidences != null) {
            var feignConnections=new FeignCommunicationResolver(objectMapper,allElements,evidences,sourceConfigurations).resolve(modelVersion,evidences);
            Map<ModelElement,ModelElement> savedTargets=new IdentityHashMap<>();
            for(var connection:feignConnections) {
                ModelElement target=connection.target();
                if(!allElements.contains(target)) {
                    var original=target;
                    target=savedTargets.computeIfAbsent(original,key->modelElementRepository.save(key));
                    if(!allElements.contains(target)) allElements.add(target);
                }
                var relationship=ModelRelationship.builder().modelVersion(modelVersion).sourceElement(connection.source())
                        .targetElement(target).relationType("SERVICE_HTTP_CALL").originLayer("STATIC").direction("DIRECTED")
                        .properties(connection.properties()).build();
                relationshipsToSave.add(relationship);
                for(var proof:connection.proofs()) {
                    var fact=proof.fact();
                    relEvidenceContexts.add(new RelEvidenceContext(relationship,fact.getFilePath()+":"+fact.getLineNumber(),
                            "CLIENT_CONFIGURATION".equals(proof.role())?"CONFIG_FILE":"STATIC_CODE",fact.getCodeSnippet(),"OPENFEIGN_SOURCE_1",proof.role()));
                }
            }
            for (CodeEvidenceDTO ev : evidences) {
                String type = ev.getElementType();
                if("FEIGN_CLIENT".equals(type) && "OPENFEIGN".equals(ev.getMetadata().get("clientFramework"))) continue;
                if ("FEIGN_CLIENT".equalsIgnoreCase(type) || "REST_TEMPLATE_CALL".equalsIgnoreCase(type)
                        || "WEB_CLIENT_CALL".equalsIgnoreCase(type)) {

                    String targetServiceName = ev.getIdentifier();
                    if (targetServiceName == null || targetServiceName.isBlank()) continue;

                    ModelElement targetElement = elementByNameMap.get(targetServiceName.toLowerCase().trim());
                    if (targetElement == null) {
                        targetElement = matchTargetElement(elements, targetServiceName);
                    }
                    if (targetElement == null && "FEIGN_CLIENT".equalsIgnoreCase(type) && !targetServiceName.contains("${")) {
                        ObjectNode extProps = createPropertiesNode(ev.getFilePath());
                        extProps.put("sourceType", "FEIGN_CLIENT_TARGET");
                        targetElement = modelElementRepository.save(ModelElement.builder()
                                .modelVersion(modelVersion)
                                .name(targetServiceName.trim())
                                .elementType("SERVICE_CONTAINER")
                                .languageStack("HTTP / REST API")
                                .scope(ev.getFilePath())
                                .properties(extProps)
                                .status("VALIDATED")
                                .build());
                        elements.add(targetElement);
                        allElements.add(targetElement);
                        elementByNameMap.put(targetServiceName.toLowerCase().trim(), targetElement);
                    }

                    if (targetElement != null && findComponentOrContainer(allElements, ev.getSourceComponent(), ev.getFilePath()) != null) {
                        ModelElement sourceElement = findComponentOrContainer(allElements, ev.getSourceComponent(), ev.getFilePath());
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
                for (DetectedSpringConfigDTO cfg : sourceConfigurations) {
                    String sourceName = cfg.getApplicationName() != null ? cfg.getApplicationName() : cfg.getServiceName();
                    if (sourceName == null || sourceName.contains("${")) continue;
                    ModelElement sourceContainer = elementByNameMap.get(sourceName.toLowerCase().trim());
                    if (sourceContainer == null) sourceContainer = matchTargetElement(elements, sourceName);

                    for (ConfigTargetUrlDTO targetUrlDto : cfg.getTargetServiceUrls()) {
                        if (targetUrlDto.getTargetUrl() == null || targetUrlDto.getTargetUrl().contains("${")) continue;
                        String relationType = com.mavis.analyzer.detector.config.service.impl.SpringConfigDetectorServiceImpl.relationTypeForKey(targetUrlDto.getConfigKey());
                        String targetHost = extractHostFromUrl(targetUrlDto.getTargetUrl());
                        if (targetHost == null) continue;
                        ModelElement targetContainer = elementByNameMap.get(targetHost.toLowerCase().trim());
                        if (targetContainer == null) targetContainer = matchTargetElement(elements, targetHost);

                        if (sourceContainer != null && "GATEWAY_ROUTE".equals(relationType)) {
                            sourceContainer.setLanguageStack("Spring Cloud Gateway (configured)");
                            var props = sourceContainer.getProperties() instanceof ObjectNode object ? object.deepCopy() : objectMapper.createObjectNode();
                            props.put("responsibility", "HTTP routes declared in Spring Cloud Gateway configuration");props.put("roleEvidencePath", cfg.getConfigFilePath());sourceContainer.setProperties(props);
                        }
                        if (sourceContainer != null && targetContainer != null
                                && !containsConfiguredRelationship(relationshipsToSave, sourceContainer, targetContainer, relationType, targetUrlDto.getProfile())) {

                            ModelRelationship relationship = ModelRelationship.builder()
                                    .modelVersion(modelVersion)
                                    .sourceElement(sourceContainer)
                                    .targetElement(targetContainer)
                                    .relationType(relationType)
                                    .properties(objectMapper.createObjectNode().put("resolutionStatus", "RESOLVED").put("evidenceBasis", "CONFIGURATION_DECLARATION")
                                            .put("configKey", targetUrlDto.getConfigKey()).put("profile", targetUrlDto.getProfile()))
                                    .originLayer("CONFIG")
                                    .direction("DIRECTED")
                                    .build();
                            relationshipsToSave.add(relationship);

                            String loc = cfg.getConfigFilePath() + ":" + targetUrlDto.getLineNumber();
                            relEvidenceContexts.add(new RelEvidenceContext(relationship, loc, "CONFIG_FILE", targetUrlDto.getConfigKey() + "=" + targetUrlDto.getTargetUrl() + (targetUrlDto.getProfile() == null ? "" : " [profile=" + targetUrlDto.getProfile() + "]"), "SPRING_CONFIG"));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi khi kết nối SERVICE_HTTP_CALL từ Spring config: {}", e.getMessage());
            }
        }

        // (3) CODE_DEPENDENCY: Giữa các Component trong cùng service (Java) + UML_RELATIONSHIP (Class/Interface/Enum)
        if (evidences != null) {
            for (CodeEvidenceDTO ev : evidences) {
                if ("CODE_DEPENDENCY".equalsIgnoreCase(ev.getElementType())) {
                    String srcCompName = ev.getSourceComponent();
                    String tgtCompName = ev.getTargetComponent();
                    if (srcCompName == null || srcCompName.isBlank() || tgtCompName == null || tgtCompName.isBlank()) continue;

                    ModelElement srcEl = findComponentByName(allElements, srcCompName, ev.getFilePath());
                    if (srcEl == null) srcEl = findComponentByName(allElements, srcCompName, ev.getFilePath());

                    ModelElement tgtEl = findComponentByName(allElements, tgtCompName, ev.getFilePath());
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
            for (CodeEvidenceDTO ev : evidences) {
                if ("UML_RELATIONSHIP".equalsIgnoreCase(ev.getElementType())) {
                    String srcCompName = ev.getSourceComponent();
                    String tgtCompName = ev.getTargetComponent();
                    if (srcCompName == null || srcCompName.isBlank() || tgtCompName == null || tgtCompName.isBlank()) continue;

                    ModelElement srcEl = findClassifierElement(allElements, srcCompName, ev.getFilePath());
                    ModelElement tgtEl = findClassifierElement(allElements, tgtCompName, ev.getFilePath());
                    if (srcEl == null || tgtEl == null || srcEl.equals(tgtEl)) continue;

                    Map<String, Object> meta = ev.getMetadata() != null ? ev.getMetadata() : Map.of();
                    String umlRelKind = String.valueOf(meta.getOrDefault("umlRelationKind", "DEPENDENCY"));
                    String memberName = meta.get("memberName") != null ? String.valueOf(meta.get("memberName")) : null;

                    ModelRelationship unenrichedExisting = null;
                    boolean exactUmlDuplicate = false;
                    for (ModelRelationship r : relationshipsToSave) {
                        if ("CODE_DEPENDENCY".equals(r.getRelationType())
                                && srcEl.equals(r.getSourceElement())
                                && tgtEl.equals(r.getTargetElement())) {
                            JsonNode p = r.getProperties();
                            if (p == null || !p.hasNonNull("umlRelationKind")) {
                                unenrichedExisting = r;
                                break;
                            } else {
                                String existingKind = p.path("umlRelationKind").asText("");
                                String existingMember = p.path("memberName").asText("");
                                if (umlRelKind.equals(existingKind) && Objects.equals(memberName != null ? memberName : "", existingMember)) {
                                    exactUmlDuplicate = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (exactUmlDuplicate) {
                        continue;
                    }
                    if (unenrichedExisting != null) {
                        ObjectNode relProps = unenrichedExisting.getProperties() instanceof ObjectNode existing
                                ? existing.deepCopy()
                                : objectMapper.createObjectNode();
                        populateUmlRelationshipProperties(relProps, meta, ev.getIdentifier());
                        unenrichedExisting.setProperties(relProps);
                        continue;
                    }

                    ObjectNode relProps = objectMapper.createObjectNode();
                    populateUmlRelationshipProperties(relProps, meta, ev.getIdentifier());
                    ModelRelationship rel = ModelRelationship.builder()
                            .modelVersion(modelVersion)
                            .sourceElement(srcEl)
                            .targetElement(tgtEl)
                            .relationType("CODE_DEPENDENCY")
                            .originLayer("STATIC")
                            .direction("DIRECTED")
                            .properties(relProps)
                            .build();
                    relationshipsToSave.add(rel);

                    String loc = (ev.getFilePath() != null ? ev.getFilePath() : "") + ":" + ev.getLineNumber();
                    relEvidenceContexts.add(new RelEvidenceContext(rel, loc, "STATIC_CODE", ev.getCodeSnippet(), "JAVAPARSER_3.25"));
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

                    ModelElement repoEl = findComponentByName(allElements, repoName, ev.getFilePath());
                    if (repoEl == null) repoEl = findComponentByName(allElements, repoName, ev.getFilePath());

                    ModelElement dbEl = findDatabaseElementForFile(allElements, elements, ev.getFilePath(), serviceToDbHostMap);

                    if (repoEl != null && dbEl == null) {
                        ObjectNode properties = repoEl.getProperties() instanceof ObjectNode existing ? existing.deepCopy() : objectMapper.createObjectNode();
                        properties.put("resolutionIssue", "UNRESOLVED_DATABASE_BINDING");
                        repoEl.setProperties(properties);
                        repoEl.setStatus("UNCERTAIN_MAPPING");
                    }
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
        for (ModelRelationship relationship : relationshipsToSave) {
            ObjectNode properties = relationship.getProperties() instanceof ObjectNode existing ? existing.deepCopy() : objectMapper.createObjectNode();
            if(!properties.hasNonNull("resolutionStatus")) properties.put("resolutionStatus", "RESOLVED");
            properties.put("resolverVersion", "architecture-2");
            relationship.setProperties(properties);
        }
        if (!relationshipsToSave.isEmpty()) {
            List<ModelRelationship> savedRelationships = modelRelationshipRepository.saveAll(relationshipsToSave);
            log.info("Successfully batch saved {} model relationships (DECLARED_COMPOSE, SERVICE_HTTP_CALL, CODE_DEPENDENCY, DATABASE_ACCESS)",
                    savedRelationships.size());

            if(savedRelationships.size()!=relationshipsToSave.size()) throw new IllegalStateException("Incomplete relationship persistence");
            Map<ModelRelationship,ModelRelationship> savedByOriginal=new IdentityHashMap<>();
            for(int i=0;i<savedRelationships.size();i++) savedByOriginal.put(relationshipsToSave.get(i),savedRelationships.get(i));
            for (RelEvidenceContext ctx : relEvidenceContexts) {
                ModelRelationship savedRel = savedByOriginal.get(ctx.relationship);
                if(savedRel==null) throw new IllegalStateException("Evidence has no persisted relationship");

                Evidence relEvidence = Evidence.builder()
                        .sourceSnapshot(sourceSnapshot)
                        .modelVersion(modelVersion)
                        .relationship(savedRel)
                        .element(null)
                        .locator(ctx.locator)
                        .adapterVersion(ctx.adapterVersion)
                        .sourceType(ctx.sourceType)
                        .provenance(ctx.communicationRole==null?null:objectMapper.createObjectNode().put("communicationRole",ctx.communicationRole))
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
        if (c.getBuildContext() != null && !c.getBuildContext().contains("${") && c.getComposeFilePath() != null) {
            java.nio.file.Path compose = java.nio.file.Path.of(c.getComposeFilePath()).toAbsolutePath();
            node.put("buildContext", compose.getParent().resolve(c.getBuildContext()).normalize().toString());
        }
        node.put("sourceType", "DOCKER_COMPOSE");
        node.put("locator", c.getComposeFilePath() + ":" + c.getLineNumber());
        if (c.getPorts() != null && !c.getPorts().isEmpty()) {
            node.putPOJO("ports", c.getPorts());
        }
        ObjectNode deploymentMeta = objectMapper.createObjectNode();
        String elType = c.getElementType() != null ? c.getElementType() : "SERVICE_CONTAINER";
        deploymentMeta.put("nodeStereotype", "DATABASE".equals(elType) ? "<<device>>" : "<<executionEnvironment>>");
        deploymentMeta.put("executionEnvironment", switch (elType) {
            case "DATABASE" -> c.getImage() != null ? c.getImage() : "Database Server";
            case "QUEUE_BROKER" -> c.getImage() != null ? c.getImage() : "Message Broker";
            default -> "Docker Container";
        });
        boolean hasExplicitImage = c.getImage() != null && !c.getImage().isBlank() && !c.getImage().contains("${");
        boolean hasBuildContext = c.getBuildContext() != null && !c.getBuildContext().isBlank() && !c.getBuildContext().contains("${");
        if (hasExplicitImage) {
            deploymentMeta.put("artifactName", c.getImage().trim());
            deploymentMeta.put("artifactKind", "CONTAINER_IMAGE");
            deploymentMeta.put("artifactResolution", "EXPLICIT_CONTAINER_IMAGE");
        } else if (hasBuildContext && c.getArtifactName() != null) {
            deploymentMeta.put("artifactName", c.getArtifactName());
            deploymentMeta.put("artifactKind", "JAR");
            deploymentMeta.put("artifactResolution", "DOCKERFILE_DECLARED_ARTIFACT");
            deploymentMeta.put("artifactLocator", c.getArtifactLocator());
            deploymentMeta.put("declaredBuildContext", c.getBuildContext().trim());
        } else if (hasBuildContext) {
            deploymentMeta.put("declaredBuildContext", c.getBuildContext().trim());
            deploymentMeta.put("artifactResolution", "BUILD_CONTEXT_ONLY_UNRESOLVED_ARTIFACT");
        } else {
            deploymentMeta.put("artifactResolution", "NO_ARTIFACT_DECLARED");
        }
        if (c.getComposeFilePath() != null) {
            deploymentMeta.put("composeFilePath", c.getComposeFilePath());
            String fileName = java.nio.file.Path.of(c.getComposeFilePath()).getFileName().toString().toLowerCase(Locale.ROOT);
            String envName = fileName.contains("prod") ? "production" : (fileName.contains("dev") ? "development" : (fileName.contains("stage") || fileName.contains("staging") ? "staging" : "default"));
            deploymentMeta.put("environment", envName);
        }
        if (c.getLineNumber() != null) {
            deploymentMeta.put("lineNumber", c.getLineNumber());
        }
        deploymentMeta.set("connections", objectMapper.valueToTree(c.getConnections()));
        node.set("deploymentMetadata", deploymentMeta);
        return node;
    }

    private void attachUmlClassifierMetadata(ObjectNode props, CodeEvidenceDTO umlEv) {
        if (umlEv == null || umlEv.getMetadata() == null || umlEv.getMetadata().isEmpty()) return;
        JsonNode metaNode = objectMapper.valueToTree(umlEv.getMetadata());
        JsonNode umlNode = metaNode.hasNonNull("umlClassifier") ? metaNode.get("umlClassifier") : metaNode;
        props.set("umlClassifier", umlNode);
        if (metaNode.hasNonNull("packageName")) {
            props.put("packageName", metaNode.get("packageName").asText());
        } else if (umlNode.hasNonNull("packageName")) {
            props.put("packageName", umlNode.get("packageName").asText());
        }
        if (metaNode.hasNonNull("typeKind")) {
            props.put("typeKind", metaNode.get("typeKind").asText());
        } else if (umlNode.hasNonNull("typeKind")) {
            props.put("typeKind", umlNode.get("typeKind").asText());
        }
    }

    private void populateUmlRelationshipProperties(ObjectNode relProps, Map<String, Object> meta, String description) {
        if (description != null && !description.isBlank()) {
            relProps.put("description", description);
        }
        for (Map.Entry<String, Object> entry : meta.entrySet()) {
            if (entry.getValue() != null) {
                relProps.set(entry.getKey(), objectMapper.valueToTree(entry.getValue()));
            }
        }
        if (!relProps.hasNonNull("multiplicityStatus")) {
            relProps.put("multiplicityStatus", "UNKNOWN");
        }
        if (!relProps.hasNonNull("provenance")) {
            relProps.put("provenance", "SOURCE_EXTRACTED");
        }
    }

    private ModelElement findClassifierElement(List<ModelElement> allElements, String nameOrQualified, String filePath) {
        if (nameOrQualified == null || nameOrQualified.isBlank()) return null;
        ModelElement comp = ArchitectureResolver.component(allElements, nameOrQualified, filePath);
        if (comp != null) return comp;

        List<ModelElement> classifiers = allElements.stream()
                .filter(e -> "COMPONENT".equals(e.getElementType()) || "CLASS_INTERFACE".equals(e.getElementType()))
                .toList();
        ModelElement owner = ArchitectureResolver.owner(allElements, filePath);
        if (owner != null) {
            List<ModelElement> inOwner = classifiers.stream()
                    .filter(e -> e.getParentElement() != null && ArchitectureResolver.same(e.getParentElement(), owner))
                    .filter(e -> matchesClassifierName(e, nameOrQualified))
                    .toList();
            if (inOwner.size() == 1) return inOwner.get(0);
        }
        List<ModelElement> exactQualified = classifiers.stream()
                .filter(e -> e.getProperties() != null && nameOrQualified.equals(e.getProperties().path("qualifiedName").asText()))
                .toList();
        if (exactQualified.size() == 1) return exactQualified.get(0);

        List<ModelElement> exactSimple = classifiers.stream()
                .filter(e -> nameOrQualified.equals(e.getName()))
                .toList();
        return exactSimple.size() == 1 ? exactSimple.get(0) : null;
    }

    private boolean matchesClassifierName(ModelElement e, String nameOrQualified) {
        if (nameOrQualified.equals(e.getName())) return true;
        return e.getProperties() != null && nameOrQualified.equals(e.getProperties().path("qualifiedName").asText());
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

    private String messageKey(CodeEvidenceDTO evidence,List<ModelElement> elements,Map<String,String> bindings) {
        ModelElement owner=findOwningContainer(elements,evidence.getFilePath());
        String transport=owner==null?null:bindings.get(owner.getName());
        return evidence.getEndpointAlias()+":"+(transport!=null?transport:"unresolved:"+(owner==null?evidence.getFilePath():owner.getName()))+":"+evidence.getIdentifier();
    }
    private ModelElement findOwningContainer(List<ModelElement> elements, String filePath) {
        return ArchitectureResolver.owner(elements, filePath);
    }
    private ModelElement findComponentOrContainer(List<ModelElement> elements, String name, String filePath) {
        ModelElement component = ArchitectureResolver.component(elements, name, filePath);
        return component != null ? component : ArchitectureResolver.owner(elements, filePath);
    }
    private ModelElement findComponentByName(List<ModelElement> elements, String name, String filePath) {
        return ArchitectureResolver.component(elements, name, filePath);
    }
    private ModelElement matchTargetElement(List<ModelElement> elements, String name) {
        return ArchitectureResolver.target(elements, name);
    }
    private ModelElement findDatabaseElementForFile(List<ModelElement> all, List<ModelElement> containers,
                                                    String file, Map<String, String> bindings) {
        ModelElement owner = ArchitectureResolver.owner(containers, file);
        if (owner == null) return null;
        String host = bindings.get(owner.getName());
        if (host == null || host.isBlank() || host.equalsIgnoreCase("localhost") || host.equals("127.0.0.1")) return null;
        ModelElement db = ArchitectureResolver.target(containers, host);
        return db != null && "DATABASE".equals(db.getElementType()) ? db : null;
    }
    private ObjectNode componentProperties(CodeEvidenceDTO evidence, ModelElement owner) {
        ObjectNode properties = createPropertiesNode(evidence.getFilePath());
        properties.put("componentBasis", "MESSAGING_COMPONENT".equals(evidence.getElementType()) ? "MESSAGING_ENDPOINT" : "SPRING_BEAN");
        properties.put("qualifiedName", evidence.getQualifiedName());
        properties.put("responsibility", switch (evidence.getElementType()) {
            case "CONTROLLER_COMPONENT" -> "Exposes HTTP endpoints";
            case "DATABASE_REPOSITORY" -> "Persists and retrieves application data";
            case "SERVICE_COMPONENT" -> "Implements application operations";
            case "MESSAGING_COMPONENT" -> "Declares message publishing or handling endpoints";
            default -> "Spring application component";
        });
        if (owner == null) properties.put("resolutionIssue", "UNRESOLVED_COMPONENT_OWNER");
        return properties;
    }
    private Map<String, String> mapServicesToDatabases(String sourcePath) {
        Map<String, String> map = new HashMap<>();
        if (springConfigDetectorService != null && sourcePath != null) {
            try {
                List<DetectedSpringConfigDTO> configs = springConfigDetectorService.detectConfigs(sourcePath);
                for (DetectedSpringConfigDTO cfg : configs) {
                    if (cfg.getDatasourceHost() != null && !cfg.getDatasourceHost().isBlank() && !cfg.getDatasourceHost().equalsIgnoreCase("localhost") && !cfg.getDatasourceHost().equals("127.0.0.1")) {
                        String sName = cfg.getApplicationName() != null ? cfg.getApplicationName() : cfg.getServiceName();
                        if (sName != null) {
                            String previous = map.putIfAbsent(sName, cfg.getDatasourceHost());
                            if (previous != null && !previous.equals(cfg.getDatasourceHost())) map.put(sName, "");
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        if (dockerDetectorService != null && sourcePath != null) {
            for (DetectedContainerDTO container : dockerDetectorService.detectContainers(sourcePath)) {
                if(container.getDatasourceHost()!=null) map.put(container.getServiceName(),container.getDatasourceDatabase()!=null?container.getDatasourceDatabase()+" @ "+container.getDatasourceHost():container.getDatasourceHost());
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

    private boolean containsConfiguredRelationship(List<ModelRelationship> list, ModelElement source, ModelElement target, String type, String profile) {
        return list.stream().anyMatch(rel -> type.equals(rel.getRelationType()) && source.equals(rel.getSourceElement()) && target.equals(rel.getTargetElement())
                && java.util.Objects.equals(profile, rel.getProperties() == null ? null : rel.getProperties().path("profile").asText(null)));
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
        final String communicationRole;

        RelEvidenceContext(ModelRelationship relationship, String locator, String sourceType, String excerpt, String adapterVersion) {
            this(relationship,locator,sourceType,excerpt,adapterVersion,null);
        }
        RelEvidenceContext(ModelRelationship relationship, String locator, String sourceType, String excerpt, String adapterVersion,String communicationRole) {
            this.relationship = relationship;
            this.locator = locator;
            this.sourceType = sourceType;
            this.excerpt = excerpt;
            this.adapterVersion = adapterVersion;
            this.communicationRole = communicationRole;
        }
    }
}
