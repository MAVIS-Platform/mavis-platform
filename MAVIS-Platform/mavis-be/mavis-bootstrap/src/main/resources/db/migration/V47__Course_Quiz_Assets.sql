CREATE TABLE course_quiz_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    pass_percent INTEGER NOT NULL DEFAULT 70 CHECK (pass_percent BETWEEN 1 AND 100),
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_quiz_assets_workspace_updated
    ON course_quiz_assets(workspace_id, updated_at DESC);
