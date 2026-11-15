-- Freeze the prepared Studio Live topology at Lab publication time.
-- The reference profile remains editable, but a published Lab keeps this snapshot.
ALTER TABLE assignments
    ADD COLUMN studio_topology_snapshot JSONB,
    ADD COLUMN studio_topology_revision INTEGER;

COMMENT ON COLUMN assignments.studio_topology_snapshot IS
    'Immutable prepared Studio topology copied from the reference runtime profile when the Lab is published or frozen.';
COMMENT ON COLUMN assignments.studio_topology_revision IS
    'RuntimeConfiguration revision used to create studio_topology_snapshot.';
