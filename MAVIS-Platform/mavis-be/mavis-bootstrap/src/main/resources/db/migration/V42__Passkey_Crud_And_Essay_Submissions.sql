-- 1. Upgrade course_passkeys to support full CRUD, multiple keys per workspace, and readable custom codes (e.g. JAVA2026)
ALTER TABLE course_passkeys DROP CONSTRAINT IF EXISTS course_passkeys_pkey;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
UPDATE course_passkeys SET id = uuid_generate_v4() WHERE id IS NULL;
ALTER TABLE course_passkeys ALTER COLUMN id SET NOT NULL;
ALTER TABLE course_passkeys ADD PRIMARY KEY (id);

ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS code VARCHAR(32);
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS label VARCHAR(120) NOT NULL DEFAULT 'Mã ghi danh lớp học';
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS max_uses INTEGER;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE course_passkeys ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_course_passkeys_workspace ON course_passkeys(workspace_id, created_at DESC);

-- 2. Table for Student Essay / Written Assignment submissions on Course Items (type = 'ESSAY')
CREATE TABLE IF NOT EXISTS course_item_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    course_item_id UUID NOT NULL REFERENCES course_items(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answer_markdown TEXT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'GRADED', 'RETURNED')),
    score NUMERIC(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    feedback TEXT,
    graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    graded_at TIMESTAMPTZ,
    CONSTRAINT uq_course_item_student_submission UNIQUE (course_item_id, student_id)
);
CREATE INDEX IF NOT EXISTS ix_course_item_submissions_workspace ON course_item_submissions(workspace_id, submitted_at DESC);
