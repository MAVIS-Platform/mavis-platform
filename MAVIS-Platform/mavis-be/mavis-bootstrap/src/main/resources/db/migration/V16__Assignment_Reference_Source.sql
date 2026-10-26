ALTER TABLE assignments ADD COLUMN IF NOT EXISTS reference_model_id UUID REFERENCES model_versions(id);
