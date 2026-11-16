-- Additive Lab v2 discriminator and theory evidence storage.
-- Legacy rows keep the current behavior through the LEGACY default.
ALTER TABLE assignments
    ADD COLUMN IF NOT EXISTS lab_mode VARCHAR(32) NOT NULL DEFAULT 'LEGACY';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = to_regclass('assignments')
          AND conname = 'assignments_lab_mode_check'
    ) THEN
        ALTER TABLE assignments
            ADD CONSTRAINT assignments_lab_mode_check
            CHECK (lab_mode IN ('LEGACY', 'THEORY_QUIZ', 'THEORY_QUIZ_STUDIO'));
    END IF;
END $$;

ALTER TABLE submission_snapshots
    ADD COLUMN IF NOT EXISTS theory_evidence JSONB;

ALTER TABLE submission_snapshots
    ALTER COLUMN diagram_version_id DROP NOT NULL;
