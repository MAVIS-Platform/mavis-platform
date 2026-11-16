-- Some environments provisioned this table manually while duplicate V11 prevented Flyway startup.
CREATE TABLE IF NOT EXISTS submission_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL UNIQUE REFERENCES submission_snapshots(id) ON DELETE CASCADE,
    lecturer_id UUID NOT NULL REFERENCES users(id),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    status VARCHAR(24) NOT NULL CHECK (status IN ('DRAFT', 'RETURNED', 'GRADED')),
    score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
    summary TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status <> 'GRADED' OR score IS NOT NULL)
);
