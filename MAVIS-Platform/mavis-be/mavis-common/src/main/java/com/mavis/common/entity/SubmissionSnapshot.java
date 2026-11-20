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
@Table(name = "submission_snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubmissionSnapshot {
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name="studio_evidence",updatable=false)
    private JsonNode studioEvidence;

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignment_id", nullable = false)
    private Assignment assignment;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "submitted_by", nullable = false)
    private User submittedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_snapshot_id")
    private SourceSnapshot sourceSnapshot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "model_version_id")
    private ModelVersion modelVersion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "diagram_version_id")
    private DiagramVersion diagramVersion;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "theory_evidence", updatable = false)
    private JsonNode theoryEvidence;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "evaluation_run_id")
    private EvaluationRun evaluationRun;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "runtime_session_id")
    private RuntimeSession runtimeSession;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "course_quiz_evidence", updatable = false)
    private JsonNode courseQuizEvidence;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "student_snapshots", updatable = false)
    private JsonNode studentSnapshots;

    @Column(name = "submission_notes", columnDefinition = "TEXT")
    private String submissionNotes;

    @Column(name = "evidence_package_digest", nullable = false, updatable = false, length = 71)
    private String evidencePackageDigest;

    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false, updatable = false)
    private OffsetDateTime submittedAt;

    public boolean isGuidedLab() {
        if (assignment != null && assignment.getLabOrder() != null) return true;
        if (courseQuizEvidence == null) return false;
        String status = courseQuizEvidence.path("status").asText();
        return "PASSED".equals(status) || "NOT_REQUIRED".equals(status);
    }
}
