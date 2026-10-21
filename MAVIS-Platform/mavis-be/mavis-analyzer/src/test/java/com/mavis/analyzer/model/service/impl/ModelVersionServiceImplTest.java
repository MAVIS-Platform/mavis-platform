package com.mavis.analyzer.model.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mavis.analyzer.diagram.service.DiagramProjectionService;
import com.mavis.analyzer.model.dto.ModelDiffResponseDTO;
import com.mavis.analyzer.model.dto.ModelRevisionRequestDTO;
import com.mavis.analyzer.model.dto.ModelVersionResponseDTO;
import com.mavis.common.entity.*;
import com.mavis.common.exception.BusinessException;
import com.mavis.common.exception.ErrorCode;
import com.mavis.common.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ModelVersionServiceImplTest {

    @Mock
    private ModelVersionRepository modelVersionRepository;

    @Mock
    private ModelElementRepository modelElementRepository;

    @Mock
    private ModelRelationshipRepository modelRelationshipRepository;

    @Mock
    private EvidenceRepository evidenceRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private DiagramProjectionService diagramProjectionService;

    @InjectMocks
    private ModelVersionServiceImpl modelVersionService;

    private Project sampleProject;
    private SourceSnapshot sampleSnapshot;
    private ModelVersion baseModelVersion;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        sampleProject = Project.builder()
                .id(UUID.randomUUID())
                .name("fruit-market-app")
                .build();

        sampleSnapshot = SourceSnapshot.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .build();

        baseModelVersion = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .sourceSnapshot(sampleSnapshot)
                .revision(1)
                .schemaVersion("1.0")
                .origin("GENERATED")
                .isLatestValid(true)
                .createdAt(OffsetDateTime.now())
                .build();
    }

    @Test
    @DisplayName("getModelVersionsByProject - should return versions ordered by revision DESC")
    void shouldGetModelVersionsByProject_OrderedByRevisionDesc() {
        ModelVersion rev2 = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .revision(2)
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .build();

        when(modelVersionRepository.findByProjectIdOrderByRevisionDesc(sampleProject.getId()))
                .thenReturn(List.of(rev2, baseModelVersion));

        List<ModelVersionResponseDTO> result = modelVersionService.getModelVersionsByProject(sampleProject.getId());

        assertThat(result).hasSize(2);
        assertThat(result.get(0).getRevision()).isEqualTo(2);
        assertThat(result.get(0).getOrigin()).isEqualTo("USER_CONFIRMED");
        assertThat(result.get(1).getRevision()).isEqualTo(1);
    }

    @Test
    @DisplayName("createControlledRevision - should create USER_CONFIRMED revision, batch saveAll and call diagramProjection")
    void shouldCreateControlledRevision_Success() {
        UUID baseId = baseModelVersion.getId();
        when(modelVersionRepository.findById(baseId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(sampleProject.getId())).thenReturn(1);

        ModelVersion savedRev2 = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .sourceSnapshot(sampleSnapshot)
                .revision(2)
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .build();

        when(modelVersionRepository.save(any(ModelVersion.class))).thenReturn(savedRev2);

        // Base elements
        ModelElement orderContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("fruit-order-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build();

        ModelElement inventoryContainer = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("fruit-inventory-service")
                .elementType("SERVICE_CONTAINER")
                .languageStack("JAVA")
                .status("DRAFT")
                .build();

        when(modelElementRepository.findByModelVersionId(baseId))
                .thenReturn(List.of(orderContainer, inventoryContainer));

        // When saveAll is called for containers, simulate returning saved instances with IDs
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        // Base relationships
        ModelRelationship relHttp = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(orderContainer)
                .targetElement(inventoryContainer)
                .relationType("SERVICE_HTTP_CALL")
                .originLayer("STATIC")
                .direction("DIRECTED")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(baseId))
                .thenReturn(List.of(relHttp));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        // Base evidence
        Evidence baseEv = Evidence.builder()
                .id(UUID.randomUUID())
                .sourceSnapshot(sampleSnapshot)
                .modelVersion(baseModelVersion)
                .element(orderContainer)
                .locator("OrderController.java:25")
                .sourceType("CODE_AST")
                .build();

        when(evidenceRepository.findByModelVersionId(baseId)).thenReturn(List.of(baseEv));
        when(evidenceRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        // Request: modify orderContainer to STUDENT_CONFIRMED, add notification-service
        ModelRevisionRequestDTO request = ModelRevisionRequestDTO.builder()
                .modifiedElements(List.of(
                        ModelRevisionRequestDTO.ElementModificationDTO.builder()
                                .id(orderContainer.getId())
                                .name("fruit-order-service")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .addedElements(List.of(
                        ModelRevisionRequestDTO.ElementCreateDTO.builder()
                                .name("notification-service")
                                .elementType("SERVICE_CONTAINER")
                                .languageStack("JAVA")
                                .status("STUDENT_CONFIRMED")
                                .build()
                ))
                .addedRelationships(List.of(
                        ModelRevisionRequestDTO.RelationshipCreateDTO.builder()
                                .sourceElementName("fruit-order-service")
                                .targetElementName("notification-service")
                                .relationType("SERVICE_HTTP_CALL")
                                .build()
                ))
                .build();

        ModelVersionResponseDTO response = modelVersionService.createControlledRevision(baseId, request);

        assertThat(response).isNotNull();
        assertThat(response.getRevision()).isEqualTo(2);
        assertThat(response.getOrigin()).isEqualTo("USER_CONFIRMED");

        // Verify invalidation of previous versions
        verify(modelVersionRepository).invalidatePreviousVersions(sampleProject.getId(), savedRev2.getId());

        // Verify batch saveAll for elements (containers and components)
        verify(modelElementRepository, atLeastOnce()).saveAll(anyList());

        // Verify batch saveAll for relationships
        verify(modelRelationshipRepository).saveAll(anyList());

        // Verify batch saveAll for evidences
        verify(evidenceRepository).saveAll(anyList());

        // Verify diagram generation for the new model version
        verify(diagramProjectionService).generateDefaultDiagramsForModel(eq(savedRev2), anyList(), anyList());
    }

    @Test
    @DisplayName("createControlledRevision - should remove elements and relationships when requested")
    void shouldCreateControlledRevision_WithRemovedElements() {
        UUID baseId = baseModelVersion.getId();
        when(modelVersionRepository.findById(baseId)).thenReturn(Optional.of(baseModelVersion));
        when(modelVersionRepository.findMaxRevisionByProjectId(sampleProject.getId())).thenReturn(1);

        ModelVersion savedRev2 = ModelVersion.builder()
                .id(UUID.randomUUID())
                .project(sampleProject)
                .revision(2)
                .origin("USER_CONFIRMED")
                .isLatestValid(true)
                .build();
        when(modelVersionRepository.save(any(ModelVersion.class))).thenReturn(savedRev2);

        ModelElement elToKeep = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("order-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .build();

        ModelElement elToKeep2 = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("inventory-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .build();

        ModelElement elToRemove = ModelElement.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .name("legacy-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .build();

        when(modelElementRepository.findByModelVersionId(baseId))
                .thenReturn(List.of(elToKeep, elToKeep2, elToRemove));
        when(modelElementRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));

        ModelRelationship relToRemove = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(elToKeep)
                .targetElement(elToRemove)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship survivingRel = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .modelVersion(baseModelVersion)
                .sourceElement(elToKeep)
                .targetElement(elToKeep2)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(baseId)).thenReturn(List.of(relToRemove, survivingRel));
        when(modelRelationshipRepository.saveAll(anyList())).thenAnswer(invocation -> invocation.getArgument(0));
        when(evidenceRepository.findByModelVersionId(baseId)).thenReturn(Collections.emptyList());

        // Request: remove elToRemove
        ModelRevisionRequestDTO request = ModelRevisionRequestDTO.builder()
                .removedElementIds(List.of(elToRemove.getId()))
                .build();

        ModelVersionResponseDTO response = modelVersionService.createControlledRevision(baseId, request);

        assertThat(response.getRevision()).isEqualTo(2);

        // Captured elements saved should only include elToKeep and elToKeep2
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelElement>> elementCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelElementRepository, atLeastOnce()).saveAll(elementCaptor.capture());

        List<ModelElement> savedElements = elementCaptor.getAllValues().stream()
                .flatMap(List::stream)
                .toList();

        assertThat(savedElements).hasSize(2);
        assertThat(savedElements.stream().map(ModelElement::getName)).containsExactlyInAnyOrder("order-service", "inventory-service");

        // Captured relationships saved should only include survivingRel
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ModelRelationship>> relCaptor = ArgumentCaptor.forClass(List.class);
        verify(modelRelationshipRepository).saveAll(relCaptor.capture());
        List<ModelRelationship> savedRels = relCaptor.getValue();
        assertThat(savedRels).hasSize(1);
        assertThat(savedRels.get(0).getTargetElement().getName()).isEqualTo("inventory-service");
    }

    @Test
    @DisplayName("compareModelVersions - should accurately detect Added, Removed, Modified, and Unchanged in O(N)")
    void shouldCompareModelVersions_AccurateLinearDiff() {
        UUID baseVersionId = UUID.randomUUID();
        UUID targetVersionId = UUID.randomUUID();

        ModelVersion baseVersion = ModelVersion.builder()
                .id(baseVersionId)
                .revision(1)
                .build();

        ModelVersion targetVersion = ModelVersion.builder()
                .id(targetVersionId)
                .revision(2)
                .build();

        when(modelVersionRepository.findById(baseVersionId)).thenReturn(Optional.of(baseVersion));
        when(modelVersionRepository.findById(targetVersionId)).thenReturn(Optional.of(targetVersion));

        // Base version: order-service (status DRAFT), inventory-service, old-auth-service
        ModelElement baseOrder = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("fruit-order-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .languageStack("JAVA")
                .build();

        ModelElement baseInventory = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("fruit-inventory-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .languageStack("JAVA")
                .build();

        ModelElement baseOldAuth = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("old-auth-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .languageStack("JAVA")
                .build();

        when(modelElementRepository.findByModelVersionId(baseVersionId))
                .thenReturn(List.of(baseOrder, baseInventory, baseOldAuth));

        // Target version: order-service (status STUDENT_CONFIRMED -> Modified), inventory-service (Unchanged), notification-service (Added). old-auth-service is Removed.
        ModelElement targetOrder = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("fruit-order-service")
                .elementType("SERVICE_CONTAINER")
                .status("STUDENT_CONFIRMED")
                .languageStack("JAVA")
                .build();

        ModelElement targetInventory = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("fruit-inventory-service")
                .elementType("SERVICE_CONTAINER")
                .status("DRAFT")
                .languageStack("JAVA")
                .build();

        ModelElement targetNotification = ModelElement.builder()
                .id(UUID.randomUUID())
                .name("notification-service")
                .elementType("SERVICE_CONTAINER")
                .status("STUDENT_CONFIRMED")
                .languageStack("JAVA")
                .build();

        when(modelElementRepository.findByModelVersionId(targetVersionId))
                .thenReturn(List.of(targetOrder, targetInventory, targetNotification));

        // Relationships:
        // Base has: order -> inventory (Unchanged), order -> old-auth (Removed)
        ModelRelationship baseRel1 = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(baseOrder)
                .targetElement(baseInventory)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship baseRel2 = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(baseOrder)
                .targetElement(baseOldAuth)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(baseVersionId))
                .thenReturn(List.of(baseRel1, baseRel2));

        // Target has: order -> inventory (Unchanged), order -> notification (Added)
        ModelRelationship targetRel1 = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(targetOrder)
                .targetElement(targetInventory)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        ModelRelationship targetRel2 = ModelRelationship.builder()
                .id(UUID.randomUUID())
                .sourceElement(targetOrder)
                .targetElement(targetNotification)
                .relationType("SERVICE_HTTP_CALL")
                .build();

        when(modelRelationshipRepository.findByModelVersionId(targetVersionId))
                .thenReturn(List.of(targetRel1, targetRel2));

        // Perform diff
        ModelDiffResponseDTO diff = modelVersionService.compareModelVersions(baseVersionId, targetVersionId);

        assertThat(diff).isNotNull();
        assertThat(diff.getBaseRevision()).isEqualTo(1);
        assertThat(diff.getTargetRevision()).isEqualTo(2);

        // Elements check
        assertThat(diff.getAddedElements()).hasSize(1);
        assertThat(diff.getAddedElements().get(0).getName()).isEqualTo("notification-service");

        assertThat(diff.getRemovedElements()).hasSize(1);
        assertThat(diff.getRemovedElements().get(0).getName()).isEqualTo("old-auth-service");

        assertThat(diff.getModifiedElements()).hasSize(1);
        assertThat(diff.getModifiedElements().get(0).getBaseElement().getName()).isEqualTo("fruit-order-service");
        assertThat(diff.getModifiedElements().get(0).getChanges()).contains("status: DRAFT -> STUDENT_CONFIRMED");

        assertThat(diff.getUnchangedElements()).hasSize(1);
        assertThat(diff.getUnchangedElements().get(0).getName()).isEqualTo("fruit-inventory-service");

        // Relationships check
        assertThat(diff.getAddedRelationships()).hasSize(1);
        assertThat(diff.getAddedRelationships().get(0).getSourceElementName()).isEqualTo("fruit-order-service");
        assertThat(diff.getAddedRelationships().get(0).getTargetElementName()).isEqualTo("notification-service");

        assertThat(diff.getRemovedRelationships()).hasSize(1);
        assertThat(diff.getRemovedRelationships().get(0).getTargetElementName()).isEqualTo("old-auth-service");

        assertThat(diff.getUnchangedRelationships()).hasSize(1);
        assertThat(diff.getUnchangedRelationships().get(0).getTargetElementName()).isEqualTo("fruit-inventory-service");

        // Summary check:
        // totalAdded = 1 added element + 1 added relationship = 2
        // totalRemoved = 1 removed element + 1 removed relationship = 2
        // totalModified = 1 modified element = 1
        // totalUnchanged = 1 unchanged element + 1 unchanged relationship = 2
        assertThat(diff.getSummary().getTotalAdded()).isEqualTo(2);
        assertThat(diff.getSummary().getTotalRemoved()).isEqualTo(2);
        assertThat(diff.getSummary().getTotalModified()).isEqualTo(1);
        assertThat(diff.getSummary().getTotalUnchanged()).isEqualTo(2);
    }

    @Test
    @DisplayName("createControlledRevision - should throw BusinessException when base ModelVersion not found")
    void shouldThrowException_WhenBaseModelVersionNotFound() {
        UUID notFoundId = UUID.randomUUID();
        when(modelVersionRepository.findById(notFoundId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> modelVersionService.createControlledRevision(notFoundId, new ModelRevisionRequestDTO()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Không tìm thấy base ModelVersion");
    }
}
