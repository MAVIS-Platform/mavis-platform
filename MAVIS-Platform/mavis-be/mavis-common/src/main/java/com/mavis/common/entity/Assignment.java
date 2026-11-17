package com.mavis.common.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "assignments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Assignment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by", nullable = false)
    private User createdBy;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    @Column(name = "lab_mode", nullable = false, length = 32)
    private String labMode = "LEGACY";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "required_diagram_types")
    private JsonNode requiredDiagramTypes;

    @Column(name = "rule_set_version", length = 50)
    private String ruleSetVersion;

    @Builder.Default
    @Column(name = "require_runtime_trace", nullable = false)
    private Boolean requireRuntimeTrace = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ai_policy")
    private JsonNode aiPolicy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reference_model_id")
    private ModelVersion referenceModel;

    @Column(name = "lab_order")
    private Integer labOrder;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "studio_topology_snapshot")
    private JsonNode studioTopologySnapshot;

    @Column(name = "studio_topology_revision")
    private Integer studioTopologyRevision;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "studio_exercise_snapshot")
    private JsonNode studioExerciseSnapshot;

    @Column(name = "studio_exercise_revision")
    private Integer studioExerciseRevision;

    @Column(name = "due_at")
    private OffsetDateTime dueAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
