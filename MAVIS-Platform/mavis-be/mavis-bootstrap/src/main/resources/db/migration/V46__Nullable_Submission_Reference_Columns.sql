ALTER TABLE submission_snapshots ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE submission_snapshots ALTER COLUMN source_snapshot_id DROP NOT NULL;
ALTER TABLE submission_snapshots ALTER COLUMN model_version_id DROP NOT NULL;
