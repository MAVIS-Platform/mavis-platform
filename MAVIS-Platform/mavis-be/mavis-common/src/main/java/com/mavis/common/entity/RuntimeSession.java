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
    @JoinColumn(name = "triggered_by")
    private User triggeredBy;

    @Column(name = "profile_name", length = 100)
    private String profileName;

    @Column(name = "scenario_name")
    private String scenarioName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "scenario_config")
    private JsonNode scenarioConfig;

    @Builder.Default
    @Column(name = "scenario_status", nullable = false, length = 30)
    private String scenarioStatus = "PENDING";

    @Builder.Default
    @Column(name = "trace_status", nullable = false, length = 30)
    private String traceStatus = "NONE";

    @Column(name = "trace_storage_path", length = 500)
    private String traceStoragePath;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;
}
