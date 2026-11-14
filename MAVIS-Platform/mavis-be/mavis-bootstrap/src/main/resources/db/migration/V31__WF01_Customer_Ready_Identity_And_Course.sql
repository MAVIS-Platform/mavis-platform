ALTER TABLE users ADD COLUMN avatar_url VARCHAR(1000);
ALTER TABLE users ADD COLUMN preferred_locale VARCHAR(5) NOT NULL DEFAULT 'en'
    CHECK (preferred_locale IN ('en','vi'));
ALTER TABLE workspaces ADD COLUMN max_students INTEGER CHECK (max_students IS NULL OR max_students > 0);

CREATE TABLE refresh_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_digest VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_refresh_sessions_user_active ON refresh_sessions(user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE auth_rate_limits (
    scope VARCHAR(40) NOT NULL,
    subject_digest VARCHAR(64) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ,
    PRIMARY KEY(scope, subject_digest)
);
