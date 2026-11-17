-- Explicit unlock prerequisites between published Labs.
CREATE TABLE lab_prerequisites (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    prerequisite_assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (assignment_id, prerequisite_assignment_id),
    CONSTRAINT chk_lab_prerequisite_not_self CHECK (assignment_id <> prerequisite_assignment_id)
);
CREATE INDEX ix_lab_prerequisites_prerequisite ON lab_prerequisites(prerequisite_assignment_id);
