package com.mavis.common.entity;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity @Table(name="submission_reviews") @Getter @Setter @NoArgsConstructor
public class SubmissionReview {
    @Id @GeneratedValue(strategy=GenerationType.UUID) private UUID id;
    @OneToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="submission_id",unique=true,nullable=false) private SubmissionSnapshot submission;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="lecturer_id",nullable=false) private User lecturer;
    @Column(nullable=false) private long revision;
    @Column(nullable=false,length=24) private String status;
    @Column(precision=5,scale=2) private BigDecimal score;
    @Column(nullable=false,columnDefinition="text") private String summary;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name="snapshot_grades")
    private JsonNode snapshotGrades;
    @Column(name="lab_outcome",length=24)
    private String labOutcome;
    @Column(name="updated_at",nullable=false) private OffsetDateTime updatedAt;
}
