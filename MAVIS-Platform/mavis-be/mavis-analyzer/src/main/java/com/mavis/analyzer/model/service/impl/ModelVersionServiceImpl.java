package com.mavis.analyzer.model.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.model.dto.ModelDiffResponseDTO;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.analyzer.model.service.ModelVersionService;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.EvidenceRepository;
import com.mavis.common.repository.ModelElementRepository;
import com.mavis.common.repository.ModelRelationshipRepository;
import com.mavis.common.repository.ModelVersionRepository;
import com.mavis.common.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ModelVersionServiceImpl implements ModelVersionService {

    private final ModelVersionRepository modelVersionRepository;
    private final ModelElementRepository modelElementRepository;
    private final ModelRelationshipRepository modelRelationshipRepository;
    private final EvidenceRepository evidenceRepository;
    private final UserRepository userRepository;
    private final DiagramProjectionService diagramProjectionService;

    @Override
    @Transactional(readOnly = true)
    public List<ModelVersionResponseDTO> getModelVersionsByProject(UUID projectId) {
        log.info("Lấy danh sách ModelVersion theo Project ID: {}", projectId);
        List<ModelVersion> versions = modelVersionRepository.findByProjectIdOrderByRevisionDesc(projectId);
        return versions.stream()
                .map(ModelVersionResponseDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ModelVersionResponseDTO getModelVersionById(UUID modelVersionId) {
        ModelVersion version = modelVersionRepository.findById(modelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy ModelVersion với ID: " + modelVersionId));
        return ModelVersionResponseDTO.fromEntity(version);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public ModelVersionResponseDTO createControlledRevision(UUID baseModelVersionId, ModelRevisionRequestDTO request) {
        log.info("Tạo Model Revision mới từ baseModelVersionId: {}", baseModelVersionId);

        // 1. Tải base version
        ModelVersion baseVersion = modelVersionRepository.findById(baseModelVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy base ModelVersion với ID: " + baseModelVersionId));

        Project project = baseVersion.getProject();
        UUID projectId = project != null ? project.getId() : null;

        // 2. Tính số revision mới = maxRevision + 1
        Integer maxRevision = (projectId != null) ? modelVersionRepository.findMaxRevisionByProjectId(projectId) : null;
        int nextRevision = (maxRevision != null && maxRevision > 0 ? maxRevision : (baseVersion.getRevision() != null ? baseVersion.getRevision() : 0)) + 1;

        User createdByUser = null;
        if (request != null && request.getCreatedById() != null) {
            createdByUser = userRepository.findById(request.getCreatedById()).orElse(null);
        }
        if (createdByUser == null) {
            createdByUser = baseVersion.getCreatedBy();
        }

        // 3. Tạo ModelVersion mới: origin = "USER_CONFIRMED", isLatestValid = true
        ModelVersion newVersion = ModelVersion.builder()
                .project(project)
                .sourceSnapshot(baseVersion.getSourceSnapshot())
                .runtimeSession(baseVersion.getRuntimeSession())
                .revision(nextRevision)
                .schemaVersion(baseVersion.getSchemaVersion() != null ? baseVersion.getSchemaVersion() : "1.0")
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .createdBy(createdByUser)
                .build();

        newVersion = modelVersionRepository.save(newVersion);

        if (projectId != null) {
            modelVersionRepository.invalidatePreviousVersions(projectId, newVersion.getId());
        }

        // 4. Sao chép và áp dụng chỉnh sửa phần tử (ModelElement)
        List<ModelElement> baseElements = modelElementRepository.findByModelVersionId(baseModelVersionId);

        Set<UUID> removedElementIds = new HashSet<>();
        if (request != null && request.getRemovedElementIds() != null) {
            removedElementIds.addAll(request.getRemovedElementIds());
        }

        Map<UUID, ModelRevisionRequestDTO.ElementModificationDTO> modById = new HashMap<>();
        Map<String, ModelRevisionRequestDTO.ElementModificationDTO> modByName = new HashMap<>();
        if (request != null && request.getModifiedElements() != null) {
            for (ModelRevisionRequestDTO.ElementModificationDTO mod : request.getModifiedElements()) {
                if (mod.getId() != null) {
                    modById.put(mod.getId(), mod);
                }
                if (mod.getName() != null && !mod.getName().isBlank()) {
                    modByName.put(mod.getName().toLowerCase().trim(), mod);
                }
            }
        }

        // Lọc các element không bị xóa
        List<ModelElement> survivingBaseElements = new ArrayList<>();
        for (ModelElement el : baseElements) {
            if (removedElementIds.contains(el.getId())) {
                continue;
            }
            if (el.getParentElement() != null && removedElementIds.contains(el.getParentElement().getId())) {
                continue;
            }
            survivingBaseElements.add(el);
        }

        Map<UUID, ModelElement> oldToNewElementMap = new HashMap<>();
        Map<String, ModelElement> nameToNewElementMap = new HashMap<>();

        List<ModelElement> clonedContainers = new ArrayList<>();
        List<ModelElement> clonedComponents = new ArrayList<>();

        for (ModelElement baseEl : survivingBaseElements) {
            ModelRevisionRequestDTO.ElementModificationDTO mod = modById.get(baseEl.getId());
            if (mod == null && baseEl.getName() != null) {
                mod = modByName.get(baseEl.getName().toLowerCase().trim());
            }

            String name = baseEl.getName();
            if (mod != null) {
                if (mod.getNewName() != null && !mod.getNewName().isBlank()) {
                    name = mod.getNewName().trim();
                } else if (mod.getName() != null && !mod.getName().isBlank()) {
                    name = mod.getName().trim();
                }
            }

            String status = (mod != null && mod.getStatus() != null && !mod.getStatus().isBlank())
                    ? mod.getStatus()
                    : (mod != null ? "STUDENT_CONFIRMED" : baseEl.getStatus());

            String languageStack = (mod != null && mod.getLanguageStack() != null)
                    ? mod.getLanguageStack()
                    : baseEl.getLanguageStack();

            String scope = (mod != null && mod.getScope() != null)
                    ? mod.getScope()
                    : baseEl.getScope();

            JsonNode properties = (mod != null && mod.getProperties() != null)
                    ? mod.getProperties()
                    : baseEl.getProperties();

            ModelElement cloned = ModelElement.builder()
                    .modelVersion(newVersion)
                    .elementType(baseEl.getElementType())
                    .name(name)
                    .languageStack(languageStack)
                    .scope(scope)
                    .status(status)
                    .properties(properties)
                    .build();

            oldToNewElementMap.put(baseEl.getId(), cloned);
            if (cloned.getName() != null) {
                nameToNewElementMap.put(cloned.getName().toLowerCase().trim(), cloned);
            }

            if (baseEl.getParentElement() == null) {
                clonedContainers.add(cloned);
            } else {
                clonedComponents.add(cloned);
            }
        }

        // Bổ sung các element mới từ request
        List<ModelElement> addedContainers = new ArrayList<>();
        List<ModelElement> addedComponents = new ArrayList<>();
        Map<ModelElement, ModelRevisionRequestDTO.ElementCreateDTO> addedCompToDtoMap = new HashMap<>();

        if (request != null && request.getAddedElements() != null) {
            for (ModelRevisionRequestDTO.ElementCreateDTO addDto : request.getAddedElements()) {
                if (addDto.getName() == null || addDto.getName().isBlank()) {
                    continue;
                }
                String status = (addDto.getStatus() != null && !addDto.getStatus().isBlank())
                        ? addDto.getStatus()
                        : "STUDENT_CONFIRMED";
                String elType = (addDto.getElementType() != null && !addDto.getElementType().isBlank())
                        ? addDto.getElementType()
                        : "SERVICE_CONTAINER";

                ModelElement addedEl = ModelElement.builder()
                        .modelVersion(newVersion)
                        .elementType(elType)
                        .name(addDto.getName().trim())
                        .languageStack(addDto.getLanguageStack())
                        .scope(addDto.getScope())
                        .status(status)
                        .properties(addDto.getProperties())
                        .build();

                nameToNewElementMap.put(addedEl.getName().toLowerCase().trim(), addedEl);

                if ("COMPONENT".equalsIgnoreCase(elType)
                        || addDto.getParentElementId() != null
                        || (addDto.getParentElementName() != null && !addDto.getParentElementName().isBlank())) {
                    addedComponents.add(addedEl);
                    addedCompToDtoMap.put(addedEl, addDto);
                } else {
                    addedContainers.add(addedEl);
                }
            }
        }

        // Lưu toàn bộ Containers bằng 1 lệnh saveAll() duy nhất
        List<ModelElement> allContainersToSave = new ArrayList<>(clonedContainers);
        allContainersToSave.addAll(addedContainers);
        List<ModelElement> savedContainers = allContainersToSave.isEmpty()
                ? Collections.emptyList()
                : modelElementRepository.saveAll(allContainersToSave);

        for (ModelElement sc : savedContainers) {
            if (sc.getName() != null) {
                nameToNewElementMap.put(sc.getName().toLowerCase().trim(), sc);
            }
        }

        // Thiết lập quan hệ cha-con (parentElement) cho Components
        for (ModelElement baseEl : survivingBaseElements) {
            if (baseEl.getParentElement() != null) {
                ModelElement clonedChild = oldToNewElementMap.get(baseEl.getId());
                ModelElement newParent = oldToNewElementMap.get(baseEl.getParentElement().getId());
                if (clonedChild != null && newParent != null) {
                    clonedChild.setParentElement(newParent);
                }
            }
        }

        for (ModelElement addedChild : addedComponents) {
            ModelRevisionRequestDTO.ElementCreateDTO addDto = addedCompToDtoMap.get(addedChild);
            if (addDto != null) {
                ModelElement parent = null;
                if (addDto.getParentElementId() != null) {
                    parent = oldToNewElementMap.get(addDto.getParentElementId());
                }
                if (parent == null && addDto.getParentElementName() != null && !addDto.getParentElementName().isBlank()) {
                    parent = nameToNewElementMap.get(addDto.getParentElementName().toLowerCase().trim());
                }
                if (parent != null) {
                    addedChild.setParentElement(parent);
                }
            }
        }

        // Lưu toàn bộ Components bằng 1 lệnh saveAll() duy nhất
        List<ModelElement> allComponentsToSave = new ArrayList<>(clonedComponents);
        allComponentsToSave.addAll(addedComponents);
        List<ModelElement> savedComponents = allComponentsToSave.isEmpty()
                ? Collections.emptyList()
                : modelElementRepository.saveAll(allComponentsToSave);

        for (ModelElement sc : savedComponents) {
            if (sc.getName() != null) {
                nameToNewElementMap.put(sc.getName().toLowerCase().trim(), sc);
            }
        }

        List<ModelElement> allSavedElements = new ArrayList<>(savedContainers);
        allSavedElements.addAll(savedComponents);

        // 5. Sao chép và áp dụng chỉnh sửa quan hệ (ModelRelationship)
        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseModelVersionId);

        Set<UUID> removedRelationshipIds = new HashSet<>();
        if (request != null && request.getRemovedRelationshipIds() != null) {
            removedRelationshipIds.addAll(request.getRemovedRelationshipIds());
        }

        Map<UUID, ModelRelationship> oldToNewRelMap = new HashMap<>();
        List<ModelRelationship> relationshipsToSave = new ArrayList<>();

        for (ModelRelationship baseRel : baseRelationships) {
            if (removedRelationshipIds.contains(baseRel.getId())) {
                continue;
            }
            if (baseRel.getSourceElement() == null || baseRel.getTargetElement() == null) {
                continue;
            }

            ModelElement newSource = oldToNewElementMap.get(baseRel.getSourceElement().getId());
            ModelElement newTarget = oldToNewElementMap.get(baseRel.getTargetElement().getId());
            if (newSource == null || newTarget == null) {
                continue; // Một trong 2 phần tử đầu/cuối đã bị xóa
            }

            ModelRelationship clonedRel = ModelRelationship.builder()
                    .modelVersion(newVersion)
                    .sourceElement(newSource)
                    .targetElement(newTarget)
                    .relationType(baseRel.getRelationType())
                    .originLayer(baseRel.getOriginLayer())
                    .direction(baseRel.getDirection())
                    .properties(baseRel.getProperties())
                    .build();

            relationshipsToSave.add(clonedRel);
            oldToNewRelMap.put(baseRel.getId(), clonedRel);
        }

        // Bổ sung các quan hệ mới từ request
        if (request != null && request.getAddedRelationships() != null) {
            for (ModelRevisionRequestDTO.RelationshipCreateDTO addRel : request.getAddedRelationships()) {
                ModelElement src = null;
                if (addRel.getSourceElementId() != null) {
                    src = oldToNewElementMap.get(addRel.getSourceElementId());
                }
                if (src == null && addRel.getSourceElementName() != null) {
                    src = nameToNewElementMap.get(addRel.getSourceElementName().toLowerCase().trim());
                }

                ModelElement tgt = null;
                if (addRel.getTargetElementId() != null) {
                    tgt = oldToNewElementMap.get(addRel.getTargetElementId());
                }
                if (tgt == null && addRel.getTargetElementName() != null) {
                    tgt = nameToNewElementMap.get(addRel.getTargetElementName().toLowerCase().trim());
                }

                if (src != null && tgt != null) {
                    String originLayer = addRel.getOriginLayer();
                    if (originLayer == null || (!originLayer.equals("STATIC") && !originLayer.equals("DEPLOYMENT") && !originLayer.equals("RUNTIME") && !originLayer.equals("STATIC_AND_RUNTIME"))) {
                        originLayer = "STATIC";
                    }

                    ModelRelationship newRel = ModelRelationship.builder()
                            .modelVersion(newVersion)
                            .sourceElement(src)
                            .targetElement(tgt)
                            .relationType(addRel.getRelationType() != null ? addRel.getRelationType() : "SERVICE_HTTP_CALL")
                            .originLayer(originLayer)
                            .direction(addRel.getDirection() != null ? addRel.getDirection() : "DIRECTED")
                            .properties(addRel.getProperties())
                            .build();

                    relationshipsToSave.add(newRel);
                }
            }
        }

        // Lưu toàn bộ quan hệ bằng 1 lệnh saveAll() duy nhất
        List<ModelRelationship> allSavedRelationships = relationshipsToSave.isEmpty()
                ? Collections.emptyList()
                : modelRelationshipRepository.saveAll(relationshipsToSave);

        // 6. Sao chép bằng chứng (Evidence) cho phần tử và quan hệ còn tồn tại
        List<Evidence> baseEvidences = evidenceRepository.findByModelVersionId(baseModelVersionId);
        List<Evidence> evidencesToSave = new ArrayList<>();

        for (Evidence baseEv : baseEvidences) {
            ModelElement mappedEl = null;
            if (baseEv.getElement() != null) {
                mappedEl = oldToNewElementMap.get(baseEv.getElement().getId());
                if (mappedEl == null) {
                    continue; // Phần tử đã bị xóa
                }
            }

            ModelRelationship mappedRel = null;
            if (baseEv.getRelationship() != null) {
                mappedRel = oldToNewRelMap.get(baseEv.getRelationship().getId());
                if (mappedRel == null) {
                    continue; // Quan hệ đã bị xóa
                }
            }

            Evidence clonedEv = Evidence.builder()
                    .sourceSnapshot(baseEv.getSourceSnapshot())
                    .modelVersion(newVersion)
                    .element(mappedEl)
                    .relationship(mappedRel)
                    .runtimeSession(baseEv.getRuntimeSession())
                    .locator(baseEv.getLocator())
                    .adapterVersion(baseEv.getAdapterVersion())
                    .sourceType(baseEv.getSourceType())
                    .excerpt(baseEv.getExcerpt())
                    .build();

            evidencesToSave.add(clonedEv);
        }

        // Lưu toàn bộ Evidence bằng 1 lệnh saveAll() duy nhất
        if (!evidencesToSave.isEmpty()) {
            evidenceRepository.saveAll(evidencesToSave);
        }

        // 7. Tự động sinh 3 bản vẽ kiến trúc mặc định cho Revision mới
        diagramProjectionService.generateDefaultDiagramsForModel(newVersion, allSavedElements, allSavedRelationships);

        log.info("Tạo Model Revision thành công với ID: {}, revision: {}", newVersion.getId(), newVersion.getRevision());
        return ModelVersionResponseDTO.fromEntity(newVersion);
    }

    @Override
    @Transactional(readOnly = true)
    public ModelDiffResponseDTO compareModelVersions(UUID baseVersionId, UUID targetVersionId) {
        log.info("So sánh 2 phiên bản mô hình O(N): baseVersionId={}, targetVersionId={}", baseVersionId, targetVersionId);

        ModelVersion baseVersion = modelVersionRepository.findById(baseVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy base ModelVersion: " + baseVersionId));
        ModelVersion targetVersion = modelVersionRepository.findById(targetVersionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy target ModelVersion: " + targetVersionId));

        List<ModelElement> baseElements = modelElementRepository.findByModelVersionId(baseVersionId);
        List<ModelElement> targetElements = modelElementRepository.findByModelVersionId(targetVersionId);

        List<ModelRelationship> baseRelationships = modelRelationshipRepository.findByModelVersionId(baseVersionId);
        List<ModelRelationship> targetRelationships = modelRelationshipRepository.findByModelVersionId(targetVersionId);

        // 1. Chuẩn bị Map O(N) cho ModelElement: elementType + "::" + name.toLowerCase()
        Map<String, ModelElement> baseElementMap = new LinkedHashMap<>();
        for (ModelElement el : baseElements) {
            baseElementMap.put(buildElementKey(el.getElementType(), el.getName()), el);
        }

        Map<String, ModelElement> targetElementMap = new LinkedHashMap<>();
        for (ModelElement el : targetElements) {
            targetElementMap.put(buildElementKey(el.getElementType(), el.getName()), el);
        }

        List<ModelDiffResponseDTO.ModelElementDiffDTO> addedElements = new ArrayList<>();
        List<ModelDiffResponseDTO.ModelElementModifiedDiffDTO> modifiedElements = new ArrayList<>();
        List<ModelDiffResponseDTO.ModelElementDiffDTO> unchangedElements = new ArrayList<>();
        List<ModelDiffResponseDTO.ModelElementDiffDTO> removedElements = new ArrayList<>();

        for (Map.Entry<String, ModelElement> entry : targetElementMap.entrySet()) {
            String key = entry.getKey();
            ModelElement targetEl = entry.getValue();
            if (!baseElementMap.containsKey(key)) {
                addedElements.add(ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(targetEl));
            } else {
                ModelElement baseEl = baseElementMap.get(key);
                List<String> changes = detectElementChanges(baseEl, targetEl);
                if (!changes.isEmpty()) {
                    modifiedElements.add(ModelDiffResponseDTO.ModelElementModifiedDiffDTO.builder()
                            .key(key)
                            .baseElement(ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(baseEl))
                            .targetElement(ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(targetEl))
                            .changes(changes)
                            .build());
                } else {
                    unchangedElements.add(ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(targetEl));
                }
            }
        }

        for (Map.Entry<String, ModelElement> entry : baseElementMap.entrySet()) {
            String key = entry.getKey();
            ModelElement baseEl = entry.getValue();
            if (!targetElementMap.containsKey(key)) {
                removedElements.add(ModelDiffResponseDTO.ModelElementDiffDTO.fromEntity(baseEl));
            }
        }

        // 2. Chuẩn bị Map O(N) cho ModelRelationship: sourceName + "->" + targetName + "::" + relationType
        Map<String, ModelRelationship> baseRelMap = new LinkedHashMap<>();
        for (ModelRelationship rel : baseRelationships) {
            baseRelMap.put(buildRelationshipKey(rel), rel);
        }

        Map<String, ModelRelationship> targetRelMap = new LinkedHashMap<>();
        for (ModelRelationship rel : targetRelationships) {
            targetRelMap.put(buildRelationshipKey(rel), rel);
        }

        List<ModelDiffResponseDTO.ModelRelationshipDiffDTO> addedRelationships = new ArrayList<>();
        List<ModelDiffResponseDTO.ModelRelationshipDiffDTO> unchangedRelationships = new ArrayList<>();
        List<ModelDiffResponseDTO.ModelRelationshipDiffDTO> removedRelationships = new ArrayList<>();

        for (Map.Entry<String, ModelRelationship> entry : targetRelMap.entrySet()) {
            String key = entry.getKey();
            ModelRelationship targetRel = entry.getValue();
            if (!baseRelMap.containsKey(key)) {
                addedRelationships.add(ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(targetRel));
            } else {
                unchangedRelationships.add(ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(targetRel));
            }
        }

        for (Map.Entry<String, ModelRelationship> entry : baseRelMap.entrySet()) {
            String key = entry.getKey();
            ModelRelationship baseRel = entry.getValue();
            if (!targetRelMap.containsKey(key)) {
                removedRelationships.add(ModelDiffResponseDTO.ModelRelationshipDiffDTO.fromEntity(baseRel));
            }
        }

        ModelDiffResponseDTO.DiffSummaryDTO summary = ModelDiffResponseDTO.DiffSummaryDTO.builder()
                .totalAdded(addedElements.size() + addedRelationships.size())
                .totalRemoved(removedElements.size() + removedRelationships.size())
                .totalModified(modifiedElements.size())
                .totalUnchanged(unchangedElements.size() + unchangedRelationships.size())
                .addedElementsCount(addedElements.size())
                .removedElementsCount(removedElements.size())
                .modifiedElementsCount(modifiedElements.size())
                .unchangedElementsCount(unchangedElements.size())
                .addedRelationshipsCount(addedRelationships.size())
                .removedRelationshipsCount(removedRelationships.size())
                .unchangedRelationshipsCount(unchangedRelationships.size())
                .build();

        return ModelDiffResponseDTO.builder()
                .baseVersionId(baseVersion.getId())
                .baseRevision(baseVersion.getRevision())
                .targetVersionId(targetVersion.getId())
                .targetRevision(targetVersion.getRevision())
                .summary(summary)
                .addedElements(addedElements)
                .removedElements(removedElements)
                .modifiedElements(modifiedElements)
                .unchangedElements(unchangedElements)
                .addedRelationships(addedRelationships)
                .removedRelationships(removedRelationships)
                .unchangedRelationships(unchangedRelationships)
                .build();
    }

    private String buildElementKey(String elementType, String name) {
        String type = elementType != null ? elementType.trim() : "";
        String n = name != null ? name.toLowerCase().trim() : "";
        return type + "::" + n;
    }

    private String buildRelationshipKey(ModelRelationship rel) {
        String srcName = (rel != null && rel.getSourceElement() != null && rel.getSourceElement().getName() != null)
                ? rel.getSourceElement().getName().toLowerCase().trim()
                : "";
        String tgtName = (rel != null && rel.getTargetElement() != null && rel.getTargetElement().getName() != null)
                ? rel.getTargetElement().getName().toLowerCase().trim()
                : "";
        String relType = (rel != null && rel.getRelationType() != null)
                ? rel.getRelationType().trim()
                : "";
        return srcName + "->" + tgtName + "::" + relType;
    }

    private List<String> detectElementChanges(ModelElement baseEl, ModelElement targetEl) {
        List<String> changes = new ArrayList<>();
        if (!Objects.equals(baseEl.getName(), targetEl.getName())) {
            changes.add("name: " + baseEl.getName() + " -> " + targetEl.getName());
        }
        if (!Objects.equals(baseEl.getStatus(), targetEl.getStatus())) {
            changes.add("status: " + baseEl.getStatus() + " -> " + targetEl.getStatus());
        }
        if (!Objects.equals(baseEl.getLanguageStack(), targetEl.getLanguageStack())) {
            changes.add("languageStack: " + baseEl.getLanguageStack() + " -> " + targetEl.getLanguageStack());
        }
        if (!Objects.equals(baseEl.getScope(), targetEl.getScope())) {
            changes.add("scope: " + baseEl.getScope() + " -> " + targetEl.getScope());
        }
        if (!Objects.equals(baseEl.getProperties(), targetEl.getProperties())) {
            changes.add("properties changed");
        }
        return changes;
    }
}
