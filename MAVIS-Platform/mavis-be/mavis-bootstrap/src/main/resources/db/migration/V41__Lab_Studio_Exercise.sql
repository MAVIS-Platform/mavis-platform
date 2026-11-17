-- Teacher-authored Studio Live exercise for a Lab.
CREATE TABLE lab_studio_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
    runtime_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    runtime_model_id UUID REFERENCES model_versions(id) ON DELETE SET NULL,
    runtime_snapshot_id UUID REFERENCES source_snapshots(id) ON DELETE SET NULL,
    baseline_requests JSONB NOT NULL DEFAULT '[]'::jsonb,
    initial_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    success_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
    instructions TEXT,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_lab_studio_exercises_runtime_project ON lab_studio_exercises(runtime_project_id);

ALTER TABLE assignments ADD COLUMN studio_exercise_snapshot JSONB;
ALTER TABLE assignments ADD COLUMN studio_exercise_revision INTEGER;
