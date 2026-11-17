package com.mavis.common.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Draft Studio Live exercise authored by a lecturer for one Lab. */
@Entity
@Table(name = "lab_studio_exercises")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LabStudioExercise {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false, unique = true)
    private Assignment assignment;

    private UUID runtimeProjectId;
    private UUID runtimeModelId;
    private UUID runtimeSnapshotId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "baseline_requests", nullable = false)
    private JsonNode baselineRequests;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "initial_state", nullable = false)
    private JsonNode initialState;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "allowed_actions", nullable = false)
    private JsonNode allowedActions;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "success_criteria", nullable = false)
    private JsonNode successCriteria;

    @Column(columnDefinition = "TEXT")
    private String instructions;

    @Builder.Default
    @Column(nullable = false)
    private Integer revision = 1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        OffsetDateTime now = OffsetDateTime.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
        if (revision == null) revision = 1;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = OffsetDateTime.now();
    }
}
