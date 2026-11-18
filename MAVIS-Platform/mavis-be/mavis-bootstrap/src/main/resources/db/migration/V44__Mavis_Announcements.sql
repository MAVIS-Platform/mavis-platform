-- MAVIS outer-layout support: administrator-authored site announcements.
-- Catalog categories are derived from the existing course/workspace name.

CREATE TABLE announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(160) NOT NULL,
    content TEXT NOT NULL,
    priority VARCHAR(16) NOT NULL DEFAULT 'NORMAL'
        CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'ARCHIVED')),
    audience_type VARCHAR(16) NOT NULL DEFAULT 'ALL'
        CHECK (audience_type IN ('ALL', 'STUDENT', 'LECTURER', 'WORKSPACE')),
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    publish_at TIMESTAMPTZ,
    expire_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_announcement_dates CHECK (expire_at IS NULL OR publish_at IS NULL OR expire_at > publish_at)
);

CREATE TABLE announcement_workspaces (
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (announcement_id, workspace_id)
);

CREATE INDEX idx_announcements_live
    ON announcements (status, pinned DESC, publish_at DESC, id DESC);
CREATE INDEX idx_announcement_workspaces_workspace
    ON announcement_workspaces (workspace_id, announcement_id);
