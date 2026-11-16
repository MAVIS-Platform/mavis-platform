-- Migration V7: Dedicated Runtime Runner Contract, Versioned Provenance & Receipts (WJ-01..WJ-04)

-- 1. Nới rộng ràng buộc scenario_status để hỗ trợ thêm 'NOT_RUN'
ALTER TABLE runtime_sessions DROP CONSTRAINT IF EXISTS runtime_sessions_scenario_status_check;
ALTER TABLE runtime_sessions ADD CONSTRAINT runtime_sessions_scenario_status_check
    CHECK (scenario_status IN ('PENDING', 'APPROVED', 'RUNNING', 'PASSED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'NOT_RUN'));

-- 2. Bổ sung các cột phục vụ Runner contract và receipts
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS model_version_id UUID REFERENCES model_versions(id) ON DELETE SET NULL;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS profile_version_id VARCHAR(100) DEFAULT 'local-poc-profile/1.0';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS run_configuration_version_id VARCHAR(100) DEFAULT 'run-config/1.0';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS scenario_version_id VARCHAR(100) DEFAULT 'scenario/1.0';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS confirmed_service_mappings JSONB;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS resource_project VARCHAR(64);
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS execution_status VARCHAR(40) DEFAULT 'NOT_STARTED';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS evidence_status VARCHAR(40) DEFAULT 'UNAVAILABLE';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS cleanup_status VARCHAR(40) DEFAULT 'NOT_APPLICABLE';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS trace_quality VARCHAR(40) DEFAULT 'UNAVAILABLE';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(40) DEFAULT 'UNAVAILABLE';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS sandbox_enforcement_confirmed BOOLEAN DEFAULT false;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS runner_receipt_json JSONB;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ;

-- 3. Tạo index hỗ trợ tra cứu receipt và outbox sync
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_resource_project ON runtime_sessions(resource_project);
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_model_version ON runtime_sessions(model_version_id);
