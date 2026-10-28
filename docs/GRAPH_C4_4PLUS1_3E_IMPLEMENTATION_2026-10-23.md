# Graph / Diagram / 3E — implementation status

Date: 2026-10-23. Scope: frontend architecture diagrams and projections. No Java stage 13–16 source, API contracts, migrations, or runtime orchestration changed.

## Implemented

- The architecture screen has one circular dependency Graph and a Diagram mode. The catalog stays at C4 Context/Container/Component and the five 4+1 views.
- System Context now renders the system boundary even without external facts. Known external relationships are aggregated, while internal services and infrastructure remain inside the system. Source-declared HTTP endpoints support an explicitly unidentified API-caller role; this does not identify business actors or establish external ownership.
- Logical shows extracted application abstractions and structural usage within the selected service. Development shows owned source packages. Neither view invents domain entities, inheritance, multiplicities, or unparsed code.
- Process projects independently declared application execution units and HTTP, database, publishing and handling interactions. Canonical source relationships remain traceable; Compose startup ordering and plain code dependencies are excluded from IPC.
- Physical / Deployment shows declared resources and startup dependencies. Physical hardware placement remains outside the available model facts.
- Scenarios (+1) supports a designed sequence from existing model interactions: title, ordered/repeated steps, move/remove, canonical participant selection, versioned project save, SVG / draw.io / print export, and restoration for the same model revision. It is marked as designed, not observed execution.
- Observed runtime is a separate scenario source, retaining existing read-only APIs and exact model/snapshot matching. The scenario designer does not create runtime configurations or execute workloads.
- Every canonical diagram participant opens the shared 3E panel: Explore evidence; Explain finding; Evaluate theo rule. Aggregated shapes expose their canonical members instead of sending invented IDs to evidence APIs.
- Existing C4 editing, project document revision checks, Graph interaction, zoom/pan, and exports remain in place.

## Verification

- 58 frontend tests passed. Added scope tests cover actor-free Context, inferred API-caller provenance, Logical service isolation, Process communication aggregation, startup/code-edge exclusion, and sequence order/repeats/XML escaping/revision validation.
- TypeScript and production build passed. Changed-file lint has no errors; the shared preview export helper has the existing React Fast Refresh advisory.
- Browser check against the user's FTGO model 8b5a2dbc-329d-4e9a-8d01-b94ab4b1c241 returned model HTTP 200 and 81 elements. Rendered Context: 2 shapes from 9 source controllers; scoped Logical: 17 shapes; Process: 17; Development: 27; Deployment: 16.
- Browser selected AccountingServiceProxy from Logical and opened canonical 3E. It created, reordered, removed and saved a designed sequence as document revision 1.
- Earlier Graph / 3E verification remains applicable: default Graph, canonical Graph/C4 selection, dragging/panning/zooming, fullscreen 3E, mobile drawer, real rule evaluation and RULE_FINDING explanation.

## Semantic limits

These are projections of available source/configuration facts. Missing business actor identities, domain models, synchronization/thread schedules, hardware placement and runtime traces remain explicit. A designed sequence is a use-case hypothesis authored by the user, not evidence of actual execution. Analysis omissions are not repaired by inventing nodes or relationships.

Reference semantics: [C4 System Context](https://c4model.com/diagrams/system-context), [Kruchten's 4+1 paper](https://www.cs.ubc.ca/~gregor/teaching/papers/4%2B1view-architecture.pdf).


Final local release: port 3000 runs .artifacts/complete-diagrams-ready. Browser reload restored saved sequence revision 1; Context (AccountsController), Process (ftgo-order-service), and sequence participants opened canonical 3E. Downloaded SVG and draw.io documents parsed successfully. Mobile viewport/page width both measured 390px.


## Graph scope and filter update — 2026-10-28

- Collapsed overview preserves service containers, databases, brokers/channels and external systems, including resources with a service parent. Internal components/classes are grouped only through a valid parent chain to a service; names or connectivity do not establish ownership.
- Unassigned internal elements (missing parent, absent parent, or parent cycles) and their related connections are hidden with explicit counts in the overview. Expand service internals to inspect their original IDs and evidence. Unclassified top-level nodes remain visibly Unknown; this UI update does not manufacture missing analyzer metadata.
- Type toggles remain available in Analysis and Explore. Hidden node types remove incident connections and update visible counts; canonical source data and aggregated evidence remain unchanged.
- The 3E inspector shares the filtered projection. Hiding the selected node or relationship clears selection, drill-down and highlight; restoring visibility does not silently restore the old selection.
- Each presentation retains its camera and dragged positions across filtering, including hiding every node and switching between presentations. Returning nodes recover cached positions; changing model revision creates a new view cache.
- Verification: 252 frontend tests pass, including ownership/cycle/resource preservation, canonical selection visibility and camera cache regressions. TypeScript and changed-file lint pass. Local mock browser checks verify Analysis/Explore filter parity, exact zoom/pan restoration, empty-state recovery and 3E closing on hidden selection. The mock session receives HTTP 401 from the authenticated AI semantics endpoint; this check does not validate live AI generation or production analyzer ownership completeness.
