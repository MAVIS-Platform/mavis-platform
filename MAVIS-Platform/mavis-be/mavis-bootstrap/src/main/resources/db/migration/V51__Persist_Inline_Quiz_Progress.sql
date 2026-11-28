CREATE TABLE course_inline_quiz_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES course_definitions(id) ON DELETE CASCADE,
    course_version INTEGER NOT NULL,
    item_id UUID NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    best_correct_count INTEGER NOT NULL DEFAULT 0,
    total_questions INTEGER NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    passed_at TIMESTAMPTZ,
    CONSTRAINT uq_inline_quiz_progress
        UNIQUE (user_id, workspace_id, course_version, item_id),
    CONSTRAINT ck_inline_quiz_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_inline_quiz_scores CHECK (
        best_correct_count >= 0 AND total_questions >= 0 AND best_correct_count <= total_questions
    )
);

CREATE INDEX idx_inline_quiz_progress_lookup
    ON course_inline_quiz_progress (workspace_id, user_id, course_version, passed);
