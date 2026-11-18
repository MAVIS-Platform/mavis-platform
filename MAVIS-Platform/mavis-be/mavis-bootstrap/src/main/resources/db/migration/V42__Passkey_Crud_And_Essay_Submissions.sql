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
