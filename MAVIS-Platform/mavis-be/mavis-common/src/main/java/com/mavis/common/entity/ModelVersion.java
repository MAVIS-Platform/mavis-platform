package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "model_versions", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"project_id", "revision"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelVersion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_snapshot_id", nullable = false)
    private SourceSnapshot sourceSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "base_model_version_id")
    private ModelVersion baseModelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "runtime_session_id")
    private RuntimeSession runtimeSession;

    @Builder.Default
    @Column(nullable = false)
    private Integer revision = 1;

    @Builder.Default
    @Column(name = "schema_version", nullable = false, length = 50)
    private String schemaVersion = "1.0";

    @Builder.Default
    @Column(nullable = false, length = 50)
    private String origin = "GENERATED";

    @Builder.Default
    @Column(name = "is_latest_valid", nullable = false)
    private Boolean isLatestValid = true;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
