package com.mavis.analyzer.model.dto;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
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
public class ModelRevisionRequestDTO {
    // Worker contract fields are additive; null selects the Java stage-3 request shape.
    private List<com.mavis.analyzer.model.service.ModelVersionService.ElementEdit> elements;
    private List<com.mavis.analyzer.model.service.ModelVersionService.RelationshipEdit> relationships;

    private UUID createdById;
    private String revisionNote;

    @Builder.Default
    private List<ElementCreateDTO> addedElements = new ArrayList<>();

    @Builder.Default
    private List<ElementModificationDTO> modifiedElements = new ArrayList<>();

    @Builder.Default
    private List<UUID> removedElementIds = new ArrayList<>();

    @Builder.Default
    private List<RelationshipCreateDTO> addedRelationships = new ArrayList<>();

    @Builder.Default
    private List<UUID> removedRelationshipIds = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ElementCreateDTO {
        @NotBlank(message = "Tên phần tử không được để trống")
        private String name;

        @Builder.Default
        private String elementType = "SERVICE_CONTAINER";

        private String languageStack;
        private String scope;
        private UUID parentElementId;
        private String parentElementName;
        private JsonNode properties;

        @Builder.Default
        private String status = "STUDENT_CONFIRMED";
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ElementModificationDTO {
        private UUID id;
        private String name;
        private String newName;
        private String status;
        private String languageStack;
        private String scope;
        private JsonNode properties;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RelationshipCreateDTO {
        private UUID sourceElementId;
        private String sourceElementName;

        private UUID targetElementId;
        private String targetElementName;

        @Builder.Default
        private String relationType = "SERVICE_HTTP_CALL";

        @Builder.Default
        private String originLayer = "STATIC";

        @Builder.Default
        private String direction = "DIRECTED";

        private JsonNode properties;
    }
}
