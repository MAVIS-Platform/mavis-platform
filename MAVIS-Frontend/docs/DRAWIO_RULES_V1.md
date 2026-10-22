# draw.io MAVIS SE rules v1 — implementation and verification

Branch: feat/ui-api-updates. Date: 2026-10-22.

## Architecture decision

The existing authenticated FE API requests Java's JSON diagram export (Java remains the owner/access-policy authority). It validates model ownership, projects the chosen component container and relationship class, then generates canonical draw.io XML using a versioned IR/rule set and ELK in a bounded Node worker. Generated preview and generated download use this same API response. No new Java endpoint or Worker change is required.

Relayout of an edited draft runs the identical generator in the browser with a same-origin ELK Web Worker. Draft XML is not posted back to Java or another service. The raw worker script is served through the existing allowlisted diagram-engine asset route. The engine has a timeout and topology/geometry checks; generated scope is limited to 100 nodes/200 relationships. There are at most three deterministic candidate layouts. Engine exceptions or hard geometry violations fail generation rather than silently removing elements.

ELK JS 0.11.0 is pinned; its package is licensed EPL-2.0. Keep package license/notice when redistributing it. This does not change or resolve the separate production/license questions for the draw.io editor image.

## Implemented

- Node name/type/known technology/known responsibility; missing source information stays explicit. Conservative Unicode text wrapping, 280-unit node width and dynamic height, Arial, 16px bold name, 12px secondary copy, body padding.
- Role-based service/database/broker/external shapes and Clean/Dark/Blueprint palettes. Contrast tests check 4.5:1 for text against palette fills. Style changes stay in draw.io and preserve mxGeometry.
- C4 Component container selector. The chosen service is represented by its boundary; only its components and directly related elements appear. Scope omissions are counted.
- All/source-inferred/declared/runtime relation selection. Missing runtime relationships do not imply traffic or health. All node IDs and edge direction stay traceable.
- Canonical node/port/orthogonal-route/edge-label geometry. Labels are measured before layout and included as ELK labels; final waypoints are serialized, so the editor does not run a second layout on canonical input.
- Geometry gate: node-node, label-node, label-label overlaps, segments through unrelated nodes, nonorthogonal segments, crossing count. A browser XML inspector also updates metrics after saving edits. Baseline hard collisions block generated output; crossing count is shown separately.
- Distinct Fit, theme, Regenerate and local Relayout actions. Relayout/regenerate require confirmation and retain a recovery copy. Saved rule metadata survives draw.io's mxCell-to-UserObject serialization.
- Draft isolation by user/model/diagram/container/relation view. Existing overview draft key is retained. Legacy drafts are preserved and identified; Regenerate is explicit. No semantic-model revision or database persistence is introduced.
- Editable XML, scoped generated download and current edited download remain separate. Title, scope counts and legend accompany drawings.

## Verification evidence

- 39 Node tests: real Petclinic fixtures, deterministic output, semantic IDs/counts, component scope, missing technology, escaping, cycle, reciprocal, self-loop, parallel edges, disconnected nodes, planar shared-dependency layout, multiple pins/conflicting locks, maximum size, geometry detection, relation filters and palette contrast.
- Local browser tests: authenticated Petclinic, rendered C4 component, metadata/save round-trip, dark restyle with identical geometry, correct renderer retention, local relayout preserving semantic IDs and zero POST requests containing the draft.
- Fixture: Petclinic Container 11 nodes/13 edges has zero hard geometry collisions and zero crossings in the tested layout. The scoped customers-service Component has zero hard collisions and zero crossings. These are measured results, not a claim that all graphs can be planar.
- Synthetic benchmark before final visual review: 30 nodes/60 edges around 1.5s; 100/200 around 3.2s on this workstation. Hardware/environment-dependent; not a hosted performance guarantee.
- Production build, lint and typecheck are checked before delivery. Browser screenshots/logs are task-local under .artifacts/dev-backend and excluded from source commits.

## Material limits / remaining review

- Petclinic Container now passes the zero-crossing target with a topology-based planar two-hub fan layout. It recognizes connectivity rather than service names. General nonplanar/dense graphs may still have crossings, which remain visible in the report; no relation is deleted to hide them.
- Text measurement is conservative code-point wrapping, not a universal font-shaping engine. Very large diagrams should be split; Fit does not guarantee readable text at any viewport size. Review long names/languages visually before publishing.
- Lock/unlock selected uses the editor native lock flags. Local Relayout preserves locked rectangles, places remaining shapes around them, and uses obstacle-aware orthogonal routing. Contradictory/undersized locks fail safely with a recovery copy. Theme-only preserves both geometry and lock flags.
- Manually authored floating connectors must be attached before relayout. The editor remains available for free-form edits, but the rule generator requires node-to-node routes.
- Browser-only drafts remain browser-only. Cloud persistence, collaboration, production HTTPS/editor origin, and production license approval are separate work.
- Java's direct DRAWIO_XML export is unchanged; MAVIS FE's authenticated export adapter is the canonical rule-based path implemented here.
## Completion checks

The remaining v1 gates (Petclinic Container crossing target, position locking, repeat verification, commit/push) are completed before delivery. No cloud draft storage or production deployment is implied.
