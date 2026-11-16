ALTER TABLE jobs ADD COLUMN analysis_request_key VARCHAR(128);
CREATE UNIQUE INDEX uq_job_analysis_request ON jobs(project_id, analysis_request_key) WHERE analysis_request_key IS NOT NULL;
