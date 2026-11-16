-- Link managed runtime sessions to the Lab assignment they were started from.
ALTER TABLE runtime_sessions
    ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_runtime_sessions_assignment_created
    ON runtime_sessions (assignment_id, created_at DESC);
