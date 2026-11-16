ALTER TABLE evaluation_findings ADD COLUMN details jsonb;
ALTER TABLE ai_explanations ADD COLUMN context_key varchar(64);
ALTER TABLE ai_explanations ADD COLUMN grounding_context jsonb;
CREATE INDEX idx_ai_explanations_context ON ai_explanations(model_version_id, context_key, created_at DESC);
