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
@Table(name = "ai_explanations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AiExplanation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "requested_by")
    private User requestedBy;

    @Column(name = "explanation_scope", nullable = false, length = 50)
    private String explanationScope;

    @Column(name = "explanation_text", nullable = false, columnDefinition = "TEXT")
    private String explanationText;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "cited_evidence_ids", nullable = false)
    private JsonNode citedEvidenceIds;

    @Builder.Default
    @Column(name = "secret_redacted", nullable = false)
    private Boolean secretRedacted = true;

    @Column(name = "ai_model_name", length = 100)
    private String aiModelName;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}