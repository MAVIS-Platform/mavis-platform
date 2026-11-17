package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Link between a Lab and a reusable theory asset, with the materialized Course item id. */
@Entity
@Table(name = "lab_theory_assets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LabTheoryAsset {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false)
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id", nullable = false)
    private TheoryAsset asset;

    @Column(name = "course_item_id")
    private UUID courseItemId;

    @Builder.Default
    @Column(nullable = false)
    private Integer position = 1;

    @Column(name = "attached_at", nullable = false)
    private OffsetDateTime attachedAt;

    @PrePersist
    protected void onCreate() {
        if (attachedAt == null) attachedAt = OffsetDateTime.now();
        if (position == null) position = 1;
    }
}
