ALTER TABLE ai_usage_events ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_ai_usage_events_user_time ON ai_usage_events (user_id, recorded_at DESC);
