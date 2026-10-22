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
@Table(name = "runtime_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RuntimeSession {

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
    @JoinColumn(name = "model_version_id")
    private ModelVersion modelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "triggered_by")
    private User triggeredBy;

    @Column(name = "profile_name", length = 100)
    private String profileName;

    @Builder.Default
    @Column(name = "profile_version_id", length = 100)
    private String profileVersionId = "local-poc-profile/1.0";

    @Builder.Default
    @Column(name = "run_configuration_version_id", length = 100)
    private String runConfigurationVersionId = "run-config/1.0";

    @Builder.Default
    @Column(name = "scenario_version_id", length = 100)
    private String scenarioVersionId = "scenario/1.0";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "confirmed_service_mappings")
    private java.util.Map<String, String> confirmedServiceMappings;

    @Column(name = "resource_project", length = 64)
    private String resourceProject;

    @Column(name = "scenario_name")
    private String scenarioName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "scenario_config")
    private JsonNode scenarioConfig;

    @Builder.Default
    @Column(name = "scenario_status", nullable = false, length = 30)
    private String scenarioStatus = "PENDING";

    @Builder.Default
    @Column(name = "execution_status", length = 40)
    private String executionStatus = "NOT_STARTED";

    @Builder.Default
    @Column(name = "evidence_status", length = 40)
    private String evidenceStatus = "UNAVAILABLE";

    @Builder.Default
    @Column(name = "cleanup_status", length = 40)
    private String cleanupStatus = "NOT_APPLICABLE";

    @Builder.Default
    @Column(name = "trace_quality", length = 40)
    private String traceQuality = "UNAVAILABLE";

    @Builder.Default
    @Column(name = "mapping_status", length = 40)
    private String mappingStatus = "UNAVAILABLE";

    @Builder.Default
    @Column(name = "sandbox_enforcement_confirmed")
    private Boolean sandboxEnforcementConfirmed = false;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "runner_receipt_json")
    private JsonNode runnerReceiptJson;

    @Builder.Default
    @Column(name = "trace_status", nullable = false, length = 30)
    private String traceStatus = "NONE";

    @Column(name = "trace_storage_path", length = 500)
    private String traceStoragePath;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @Column(name = "cancel_requested_at")
    private OffsetDateTime cancelRequestedAt;

    @Column(name = "receipt_digest", length = 128)
    private String receiptDigest;

    @Column(name = "enriched_model_version_id")
    private UUID enrichedModelVersionId;

    @Builder.Default
    @Column(name = "publication_gate_status", length = 50)
    private String publicationGateStatus = "NONE";

    @Column(name = "allocated_at")
    private OffsetDateTime allocatedAt;

    @Builder.Default
    @Column(name = "image_source_correspondence", length = 40)
    private String imageSourceCorrespondence = "UNVERIFIED";

    @Builder.Default
    @Column(name = "profile_acceptance", length = 40)
    private String profileAcceptance = "UNVERIFIED";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
