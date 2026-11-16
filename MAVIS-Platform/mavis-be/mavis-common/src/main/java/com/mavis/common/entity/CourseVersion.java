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
@Table(name = "course_versions", uniqueConstraints = {
        @UniqueConstraint(name = "uq_course_version", columnNames = {"course_id", "version"}),
        @UniqueConstraint(name = "uq_course_version_digest", columnNames = {"course_id", "snapshot_digest"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CourseVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private CourseDefinition course;

    @Column(nullable = false)
    private int version;

    @Column(name = "draft_revision", nullable = false)
    private int draftRevision;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private JsonNode snapshot;

    @Column(name = "snapshot_digest", nullable = false, length = 71)
    private String snapshotDigest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "published_by", nullable = false)
    private User publishedBy;

    @CreationTimestamp
    @Column(name = "published_at", nullable = false, updatable = false)
    private OffsetDateTime publishedAt;
}
