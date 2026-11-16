package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "source_snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SourceSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id", nullable = false)
    private Project project;

    @Builder.Default
    @Column(name = "source_type", nullable = false, length = 30)
    private String sourceType = "GITHUB_COMMIT";

    @Column(name = "branch_name", length = 100)
    private String branchName;

    @Column(name = "commit_sha")
    private String commitSha;

    @Column(name = "artifact_hash", nullable = false)
    private String artifactHash;

    @Column(name = "storage_path", length = 500)
    private String storagePath;

    @Builder.Default
    @Column(name = "is_published", nullable = false)
    private Boolean isPublished = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }
}
