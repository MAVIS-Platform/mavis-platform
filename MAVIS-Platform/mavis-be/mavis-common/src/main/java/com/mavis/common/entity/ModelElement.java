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
@Table(name = "model_elements")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelElement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_version_id", nullable = false)
    private ModelVersion modelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_element_id")
    private ModelElement parentElement;

    @Column(name = "element_type", nullable = false, length = 50)
    private String elementType;

    @Column(name = "language_stack", length = 50)
    private String languageStack;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "text")
    private String scope;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "properties")
    private JsonNode properties;

    @Builder.Default
    @Column(nullable = false, length = 50)
    private String status = "DRAFT";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
