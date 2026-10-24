CREATE TABLE runtime_configurations (
 project_id UUID PRIMARY KEY REFERENCES projects(id),
 source_snapshot_id UUID NOT NULL REFERENCES source_snapshots(id),
 model_version_id UUID NOT NULL REFERENCES model_versions(id),
 profile_id VARCHAR(100) NOT NULL,
 profile JSONB NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0)
);
CREATE TABLE runtime_scenarios (
 id UUID PRIMARY KEY,
 project_id UUID NOT NULL REFERENCES projects(id),
 name VARCHAR(100) NOT NULL,
 steps JSONB NOT NULL,
 revision INTEGER NOT NULL CHECK(revision > 0)
);
CREATE INDEX idx_runtime_scenarios_project ON runtime_scenarios(project_id);
