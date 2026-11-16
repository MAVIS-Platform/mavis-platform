-- Migration V8: Runtime Receipt Digest, Publication Gate & Locking (Chặng 11 & 12)

-- 1. Nới rộng check constraint scenario_status (nếu chưa có đủ các trạng thái)
ALTER TABLE runtime_sessions DROP CONSTRAINT IF EXISTS runtime_sessions_scenario_status_check;
ALTER TABLE runtime_sessions ADD CONSTRAINT runtime_sessions_scenario_status_check
    CHECK (scenario_status IN ('PENDING', 'APPROVED', 'RUNNING', 'PASSED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'NOT_RUN'));

-- 2. Bổ sung các cột phục vụ Canonical Receipt Digest, Publication Gate và Lifecycle Tracking
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS receipt_digest VARCHAR(128);
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS enriched_model_version_id UUID REFERENCES model_versions(id) ON DELETE SET NULL;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS publication_gate_status VARCHAR(50) NOT NULL DEFAULT 'NONE';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMPTZ;
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS image_source_correspondence VARCHAR(40) DEFAULT 'UNVERIFIED';
ALTER TABLE runtime_sessions ADD COLUMN IF NOT EXISTS profile_acceptance VARCHAR(40) DEFAULT 'UNVERIFIED';

-- 3. Tạo index hỗ trợ tra cứu idempotency qua receipt_digest
CREATE INDEX IF NOT EXISTS idx_runtime_sessions_receipt_digest ON runtime_sessions(receipt_digest);
