package com.mavis.common.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "model_relationships")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelRelationship {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_version_id", nullable = false)
    private ModelVersion modelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_element_id", nullable = false)
    private ModelElement sourceElement;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_element_id", nullable = false)
    private ModelElement targetElement;

    @Column(name = "relation_type", nullable = false, length = 50)
    private String relationType;

    @Builder.Default
    @Column(name = "origin_layer", nullable = false, length = 30)
    private String originLayer = "STATIC";

    @Builder.Default
    @Column(length = 50)
    private String direction = "DIRECTED";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "properties")
    private JsonNode properties;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
