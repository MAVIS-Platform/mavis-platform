ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('PENDING','RUNNING','CANCELLING','COMPLETED','FAILED','CANCELLED'));
CREATE TABLE analysis_attempts (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL CHECK (status IN ('RUNNING','CANCELLING','COMPLETED','PARTIAL','FAILED','CANCELLED')),
    owner_instance UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    deadline_utc TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    diagnostic_code VARCHAR(100)
);
CREATE INDEX idx_analysis_attempts_job ON analysis_attempts(job_id,started_at);
CREATE UNIQUE INDEX uq_active_analysis_attempt ON analysis_attempts(job_id) WHERE status IN ('RUNNING','CANCELLING');
