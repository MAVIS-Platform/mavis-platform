package com.mavis.common.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity @Table(name="analysis_attempts") @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AnalysisAttempt {
    @Id private UUID id;
    @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="job_id",nullable=false) private Job job;
    @Column(nullable=false) private String status;
    @Column(name="owner_instance",nullable=false) private UUID ownerInstance;
    @Column(name="started_at",nullable=false) private OffsetDateTime startedAt;
    @Column(name="deadline_utc",nullable=false) private OffsetDateTime deadlineUtc;
    @Column(name="completed_at") private OffsetDateTime completedAt;
    @Column(name="diagnostic_code") private String diagnosticCode;
}
