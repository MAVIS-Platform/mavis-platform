package com.mavis.analyzer.model.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mavis.common.entity.ModelElement;
import com.mavis.common.entity.ModelRelationship;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModelDiffResponseDTO {

    private UUID baseVersionId;
    private Integer baseRevision;
    private UUID targetVersionId;
    private Integer targetRevision;

    private DiffSummaryDTO summary;

    @Builder.Default
    private List<ModelElementDiffDTO> addedElements = new ArrayList<>();

    @Builder.Default
    private List<ModelElementDiffDTO> removedElements = new ArrayList<>();

    @Builder.Default
    private List<ModelElementModifiedDiffDTO> modifiedElements = new ArrayList<>();

    @Builder.Default
    private List<ModelElementDiffDTO> unchangedElements = new ArrayList<>();

    @Builder.Default
    private List<ModelRelationshipDiffDTO> addedRelationships = new ArrayList<>();

    @Builder.Default
    private List<ModelRelationshipDiffDTO> removedRelationships = new ArrayList<>();

    @Builder.Default
    private List<ModelRelationshipDiffDTO> unchangedRelationships = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class DiffSummaryDTO {
        private int totalAdded;
        private int totalRemoved;
        private int totalModified;
        private int totalUnchanged;

        private int addedElementsCount;
        private int removedElementsCount;
        private int modifiedElementsCount;
        private int unchangedElementsCount;

        private int addedRelationshipsCount;
        private int removedRelationshipsCount;
        private int unchangedRelationshipsCount;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModelElementDiffDTO {
        private UUID id;
        private String name;
        private String elementType;
        private String languageStack;
        private String scope;
        private String status;
        private UUID parentElementId;
        private String parentElementName;
        private JsonNode properties;

        public static ModelElementDiffDTO fromEntity(ModelElement entity) {
            if (entity == null) {
                return null;
            }
            return ModelElementDiffDTO.builder()
                    .id(entity.getId())
                    .name(entity.getName())
                    .elementType(entity.getElementType())
                    .languageStack(entity.getLanguageStack())
                    .scope(entity.getScope())
                    .status(entity.getStatus())
                    .parentElementId(entity.getParentElement() != null ? entity.getParentElement().getId() : null)
                    .parentElementName(entity.getParentElement() != null ? entity.getParentElement().getName() : null)
                    .properties(entity.getProperties())
                    .build();
        }
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModelElementModifiedDiffDTO {
        private String key;
        private ModelElementDiffDTO baseElement;
        private ModelElementDiffDTO targetElement;

        @Builder.Default
        private List<String> changes = new ArrayList<>();
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ModelRelationshipDiffDTO {
        private UUID id;
        private UUID sourceElementId;
        private String sourceElementName;
        private UUID targetElementId;
        private String targetElementName;
        private String relationType;
        private String originLayer;
        private String direction;
        private JsonNode properties;

        public static ModelRelationshipDiffDTO fromEntity(ModelRelationship entity) {
            if (entity == null) {
                return null;
            }
            return ModelRelationshipDiffDTO.builder()
                    .id(entity.getId())
                    .sourceElementId(entity.getSourceElement() != null ? entity.getSourceElement().getId() : null)
                    .sourceElementName(entity.getSourceElement() != null ? entity.getSourceElement().getName() : null)
                    .targetElementId(entity.getTargetElement() != null ? entity.getTargetElement().getId() : null)
                    .targetElementName(entity.getTargetElement() != null ? entity.getTargetElement().getName() : null)
                    .relationType(entity.getRelationType())
                    .originLayer(entity.getOriginLayer())
                    .direction(entity.getDirection())
                    .properties(entity.getProperties())
                    .build();
        }
    }
}
