ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check;
ALTER TABLE workspaces ADD CONSTRAINT workspaces_status_check
    CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));
