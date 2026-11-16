-- Draft Quiz authoring and reusable question bank.
ALTER TABLE course_quizzes
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS course_quiz_drafts (
    assignment_id UUID PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
    lesson TEXT NOT NULL,
    pass_percent INTEGER NOT NULL CHECK (pass_percent BETWEEN 1 AND 100),
    questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_question_bank (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    module_id UUID REFERENCES course_modules(id) ON DELETE SET NULL,
    question JSONB NOT NULL CHECK (jsonb_typeof(question) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_question_bank_workspace
    ON quiz_question_bank (workspace_id, created_at DESC);
