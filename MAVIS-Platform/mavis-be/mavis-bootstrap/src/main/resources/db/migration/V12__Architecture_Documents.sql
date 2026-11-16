CREATE TABLE architecture_documents (
    id UUID PRIMARY KEY,
    model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    view_key VARCHAR(160) NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    xml_content TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_architecture_document_view UNIQUE (model_version_id, view_key, revision)
);