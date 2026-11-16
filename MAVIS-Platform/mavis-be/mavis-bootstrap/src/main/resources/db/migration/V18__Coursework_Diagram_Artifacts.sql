-- Preserve existing projections and allow exact saved UML revisions/coursework bundles.
ALTER TABLE diagram_versions DROP CONSTRAINT IF EXISTS diagram_versions_notation_check;
ALTER TABLE diagram_versions ADD CONSTRAINT diagram_versions_notation_check
    CHECK (notation IN ('DEPENDENCY_GRAPH', 'C4', 'VIEW_4_PLUS_1', 'UML_SEQUENCE',
        'UML_CLASS', 'UML_PACKAGE', 'UML_DEPLOYMENT', 'UML_ACTIVITY', 'UML_STATE', 'BUNDLE'));
