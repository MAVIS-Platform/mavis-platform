ALTER TABLE workspaces ADD COLUMN course_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assignments ADD COLUMN lab_order INTEGER CHECK (lab_order > 0);
CREATE UNIQUE INDEX uq_workspace_lab_order ON assignments (workspace_id, lab_order)
    WHERE lab_order IS NOT NULL;

CREATE TABLE course_passkeys (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    digest VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

ALTER TABLE workspace_members ADD COLUMN enrollment_request_id UUID;
ALTER TABLE workspace_members ADD COLUMN enrollment_key_digest VARCHAR(64);

CREATE TABLE course_lab_results (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES submission_snapshots(id) ON DELETE CASCADE,
    review_revision BIGINT NOT NULL CHECK (review_revision > 0),
    passed BOOLEAN NOT NULL,
    PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE revoked_access_tokens (
    digest VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_revoked_access_token_expiry ON revoked_access_tokens (expires_at);
