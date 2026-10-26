-- Run outside a transaction (see the sibling .sql.conf) so index builds do not block writes.
-- Preserve visibility rules and the to-one fetch graph. PostgreSQL does not
-- automatically index referencing foreign-key columns.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_submitter_time
    ON submission_snapshots (submitted_by, submitted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_assignment_time
    ON submission_snapshots (assignment_id, submitted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_project_time
    ON submission_snapshots (project_id, submitted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_time
    ON submission_snapshots (submitted_at DESC);

-- Supports the lecturer membership EXISTS branch and assignment workspace lookup.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workspace_members_lecturer_user_workspace
    ON workspace_members (user_id, workspace_id) WHERE member_role = 'LECTURER';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assignments_workspace ON assignments (workspace_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_source_snapshot ON submission_snapshots (source_snapshot_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_model_version ON submission_snapshots (model_version_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_diagram_version ON submission_snapshots (diagram_version_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_evaluation_run ON submission_snapshots (evaluation_run_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submissions_runtime_session ON submission_snapshots (runtime_session_id);
