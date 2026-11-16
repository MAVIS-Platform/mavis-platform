package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "evidences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Evidence {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_snapshot_id", nullable = false)
    private SourceSnapshot sourceSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_version_id", nullable = false)
    private ModelVersion modelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "element_id")
    private ModelElement element;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "relationship_id")
    private ModelRelationship relationship;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "runtime_session_id")
    private RuntimeSession runtimeSession;

    @Column(nullable = false, length = 500)
    private String locator;

    @Column(name = "adapter_version", length = 50)
    private String adapterVersion;

    @Column(name = "source_type", nullable = false, length = 50)
    private String sourceType;

    @Column(columnDefinition = "TEXT")
    private String excerpt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "provenance", columnDefinition = "jsonb")
    private JsonNode provenance;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
