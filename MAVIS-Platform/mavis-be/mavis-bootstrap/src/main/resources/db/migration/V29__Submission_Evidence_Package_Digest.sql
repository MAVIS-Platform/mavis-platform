CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE submission_snapshots
    ADD COLUMN evidence_package_digest VARCHAR(71);

UPDATE submission_snapshots
SET evidence_package_digest = 'sha256:' || encode(digest(
    concat_ws('|', assignment_id::text, project_id::text, source_snapshot_id::text,
        model_version_id::text, diagram_version_id::text,
        coalesce(evaluation_run_id::text, ''), coalesce(runtime_session_id::text, ''),
        coalesce(submission_notes, '')), 'sha256'), 'hex')
WHERE evidence_package_digest IS NULL;

ALTER TABLE submission_snapshots
    ALTER COLUMN evidence_package_digest SET NOT NULL;

CREATE INDEX ix_submission_evidence_package_digest
    ON submission_snapshots(evidence_package_digest);
