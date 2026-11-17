-- Workspace-level reusable theory lessons.
CREATE TABLE theory_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    language VARCHAR(16) NOT NULL DEFAULT 'vi',
    style VARCHAR(32) NOT NULL DEFAULT 'CUSTOM'
        CHECK (style IN ('CONCEPT', 'GUIDED', 'CHECKLIST', 'CUSTOM')),
    source VARCHAR(32) NOT NULL DEFAULT 'LECTURER'
        CHECK (source IN ('SEED', 'LECTURER', 'IMPORT', 'AI', 'BUNDLE')),
    source_url VARCHAR(1024),
    license_note VARCHAR(255),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_theory_assets_workspace_updated ON theory_assets(workspace_id, updated_at DESC);

-- A Lab links to a library asset. course_item_id points at the materialized lesson
-- students read through the published Course snapshot.
CREATE TABLE lab_theory_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES theory_assets(id) ON DELETE CASCADE,
    course_item_id UUID REFERENCES course_items(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 1 CHECK (position > 0),
    attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lab_theory_asset UNIQUE (assignment_id, asset_id)
);
CREATE INDEX ix_lab_theory_assets_asset ON lab_theory_assets(asset_id);
