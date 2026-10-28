-- Exact provider-reported token counts; never store prompts, keys or model responses.
CREATE TABLE IF NOT EXISTS ai_usage_events (
    request_id UUID PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source VARCHAR(16) NOT NULL CHECK (source IN ('java', 'next')),
    provider VARCHAR(16) NOT NULL CHECK (provider IN ('openai', 'gemini')),
    model VARCHAR(128) NOT NULL,
    input_tokens BIGINT NOT NULL CHECK (input_tokens >= 0),
    output_tokens BIGINT NOT NULL CHECK (output_tokens >= 0)
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_recorded_at ON ai_usage_events (recorded_at);
