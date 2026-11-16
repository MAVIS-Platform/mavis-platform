ALTER TABLE model_versions ADD COLUMN base_model_version_id UUID REFERENCES model_versions(id) ON DELETE RESTRICT;
