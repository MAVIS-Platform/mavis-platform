CREATE TABLE course_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    draft_revision INTEGER NOT NULL DEFAULT 1 CHECK (draft_revision > 0),
    published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE course_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES course_definitions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    draft_revision INTEGER NOT NULL CHECK (draft_revision > 0),
    snapshot JSONB NOT NULL,
    snapshot_digest VARCHAR(71) NOT NULL,
    published_by UUID NOT NULL REFERENCES users(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_version UNIQUE (course_id, version),
    CONSTRAINT uq_course_version_digest UNIQUE (course_id, snapshot_digest)
);
CREATE INDEX ix_course_versions_course_published ON course_versions(course_id, published_at DESC);

CREATE TABLE course_modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES course_definitions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL CHECK (position > 0),
    prerequisite_module_id UUID REFERENCES course_modules(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_module_position UNIQUE (course_id, position),
    CONSTRAINT uq_course_module_course_id_id UNIQUE (course_id, id)
);
ALTER TABLE course_modules
    ADD CONSTRAINT fk_course_module_prerequisite_same_course
    FOREIGN KEY (course_id, prerequisite_module_id)
    REFERENCES course_modules(course_id, id)
    DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ix_course_modules_prerequisite ON course_modules(prerequisite_module_id);


CREATE TABLE course_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    item_type VARCHAR(32) NOT NULL CHECK (item_type IN ('THEORY', 'QUIZ', 'ESSAY', 'STATIC_LAB', 'IMPACT_LAB', 'RUNTIME_LAB')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL CHECK (position > 0),
    assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_item_position UNIQUE (module_id, position)
);
CREATE INDEX ix_course_items_module_position ON course_items(module_id, position);
CREATE INDEX ix_course_items_assignment ON course_items(assignment_id) WHERE assignment_id IS NOT NULL;
