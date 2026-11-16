ALTER TABLE submission_snapshots
    ADD COLUMN IF NOT EXISTS student_snapshots JSONB;

ALTER TABLE submission_reviews
    ADD COLUMN IF NOT EXISTS snapshot_grades JSONB;

ALTER TABLE submission_reviews
    ADD COLUMN IF NOT EXISTS lab_outcome VARCHAR(24);
