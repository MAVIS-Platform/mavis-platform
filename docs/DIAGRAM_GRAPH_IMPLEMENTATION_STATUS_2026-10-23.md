# Diagram/Graph implementation checkpoint — 2026-10-23

Branch: feat/ui-api-updates. Status: implementation in progress; not a complete product-readiness sign-off.

## Implemented and verified

- Deterministic service/component resolution; removed first-service/first-database and ambiguous name fallbacks.
- Docker build-context and explicit Compose datasource binding; logical database/schema separated from physical host. Kafka UI is not classified as a broker.
- Java bean factories and explicit Eventuate/Kafka declarations; constant resolution is conservative. Channel identity includes configured broker authority. Unknown transport is scoped and reported, not joined across services.
- Graph API retains origin and resolution metadata; frontend supports service-internal expansion/collapse, origin filters and underlying relationship inspection.
- Architecture view planner: explicit grouped overview, application Container, service Component, messaging/channel and deployment scopes. Aggregations retain underlying IDs and omissions.
- Clean SVG viewer, optional draw.io editing, SVG/download and multi-page draw.io export. Browser print offers A3 PDF output.
- Persistent architecture documents with immutable revision history, project access checks, compare-and-set writes and XML/XXE validation. Additive V12/V13 applied successfully to the configured development cloud database.
- GitHub imports resolve branch/ref to commit SHA before source download. Existing old snapshots with null SHA remain unchanged.

## Verification evidence

- Backend analyzer suite: 205 tests, 0 failures/errors, 12 conditional integration skips (plus reactor common/client tests); JDK 25 invocation needs -Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true.
- Frontend: 50 tests passed; targeted ESLint and production build passed.
- Real FTGO import and analysis completed with review, snapshot 0fdac156-f888-4128-a3ad-385d82f804f6, model 1d571e9d-c6ba-4374-bbae-cfc3111b48aa.
- Current model: 81 elements / 90 relationships. Counts are observed output, not ground truth or coverage proof.
- Previous model all 24 views rendered successfully; latest model exported successfully as 25 draw.io pages (410,904 bytes), parsed as XML. SVG download succeeded. Latest production UI save persisted revision 1, history selector appeared, and graph expansion/origin filter were exercised. A status-text wait timed out because editor reload replaced the save message; API read confirmed successful persistence.
- Cloud document save revisions 1/2/3 verified; stale save rejected with 409; historical revision preserved; fresh browser context read latest saved revision without local storage.
- Production FE runs on port 3000, Java on 8081; worker remains on 5082.

## Remaining work before plan completion

- Independent source-backed reference manifests and held-out repo acceptance are not complete. Existing FTGO fixture is a regression sample, not a ground-truth manifest.
- Architecture-level component grouping remains based primarily on bean/messaging endpoint extraction; grouping classes by architectural responsibilities is not complete.
- Shared-module ownership, mutable channel declarations, complete HTTP/config resolution and framework coverage have unresolved cases. Latest FTGO reports four unresolved elements explicitly.
- Automated semantic/readability release gate is not complete; status deliberately stays requires-review. Compact overview improved, but measured smallest screen text remains around 10px at fit on 1366x768, below the proposed 12px target. A3 estimate approximately 12.5pt. These measurements need rendered-font transform validation.
- Snapshot tests and user-visible geometry metrics do not replace independent semantic or novice-usability testing. No student pilot has been performed.
- Full PDF pack automation, stable layout migration across source revisions and cross-view deep links remain incomplete. Current PDF path uses browser print per view.
- Production host configuration for draw.io URL still needs deployment support; current integration is local self-hosted draw.io.

Do not label the entire plan complete or all generated diagrams Ready to use until these conditions are met.