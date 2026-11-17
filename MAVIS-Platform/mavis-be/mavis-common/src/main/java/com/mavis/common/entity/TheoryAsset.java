package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Reusable theory lesson owned by a workspace, linked to Labs instead of copied into each one. */
@Entity
@Table(name = "theory_assets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TheoryAsset {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @Builder.Default
    @Column(nullable = false, length = 16)
    private String language = "vi";

    @Builder.Default
    @Column(nullable = false, length = 32)
    private String style = "CUSTOM";

    @Builder.Default
    @Column(nullable = false, length = 32)
    private String source = "LECTURER";

    @Column(name = "source_url", length = 1024)
    private String sourceUrl;

    @Column(name = "license_note", length = 255)
    private String licenseNote;

    @Builder.Default
    @Column(nullable = false)
    private Integer version = 1;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;
}
