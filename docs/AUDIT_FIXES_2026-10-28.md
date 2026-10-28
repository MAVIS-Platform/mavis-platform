# MAVIS full-stack audit reconciliation — 28 October 2026

Baseline `main` at `196f7bf`; fix branch `fix/full-stack-audit-20261028`.
The supplied audit describes an older source layout (.NET8/eight Maven modules/V1–V11). Its proposed code is not applied blindly to the current .NET10/reactor/source model. No feature branch was blindly merged, no shared database history rewritten, and no production deployment performed.

## Findings and disposition

| Audit | Current source finding and action |
|---|---|
| BUG-01 | The current Java adapter already implements the education, runtime, revision and admin operations. Added a coverage guard that every contract is handled by Java or an explicit BFF auth handler. Squashed implementation presence, not branch ancestry alone, decides whether merging is needed. |
| BUG-02 | Real: launcher overwrote an explicit migration setting. It now honors true/false and rejects invalid values. Default remains false for shared DB safety. Read-only shared history confirms V10=Fence_Job_Updates (-228092565), V11=Runtime_Recovery_Result (848310647), through V15. Their files/checksums stay untouched. The two unregistered duplicate scripts move to V18 (Coursework_Diagram_Artifacts) and V20 (Submission_Review). V20 tolerates an already manually provisioned review table. Launcher rejects future duplicates. Clean/upgrade migration tests run only against disposable databases. |
| BUG-03 | Real: CORS allowed localhost only. Both localhost:3000 and 127.0.0.1:3000 now work; unrelated origins remain denied. Same-origin Next BFF traffic does not require browser-to-Java CORS, but direct supported local API calls do. |
| BUG-04 | Real outside cloud profile: SecurityConfig, SecurityUtils and base application.yml defaulted to dev bypass. Defaults now fail closed; cloud already disabled bypass. Tests verify anonymous401 before controller and allowed/denied CORS preflights. |
| BUG-05 | Known safe business messages now map to stable public codes for invalid login, verification/locked account and submission deadline/scope/owner/partial-analysis failures. Existing BFF and browser adapter already carry allowlisted codes. Arbitrary upstream messages, SQL, tokens and unexpected errors stay hidden. Existing profile/GitHub mappings preserved. Unknown business errors retain status-specific fallback; not a blanket upstream-text forwarding change. |
| BUG-06 | Blank optional transport strings were already accepted/normalized in much current code, so audit's exact min(1) Zod502 claim is stale. Remaining issues fixed: authorized existing session with no observed model/diagram returns an explicit empty sequence (real model ID, no fake diagram ID); unknown session still404, forbidden session still403. Optional HTTP status values are bounded to integral100–599; FE normalizes old persisted blank trace/method fields. No synthetic runtime calls or success evidence invented. |
| BUG-07 | Fixed missing layer fallback from current graph element type/name; explicit layer takes precedence. Edge certainty already follows resolutionStatus and is preserved. Dangling graph edges still fail contract validation instead of silently hiding invalid backend data. |
| BUG-08 | Real: recovery timestamp OffsetDateTime reserialization changes signed wire representation. Keep original string, validate ISO offset time, hash exact value; timestamp .120Z/.000Z/.450Z vectors agree with C# canonical fixtures. Scope checks, idempotency/conflict and terminal publication hold remain. |
| BUG-09 | Real: generic proxy rejected supported snapshot/elements/evaluate/revisions paths. Explicit bounded allowlist expanded; internal/admin/runner and arbitrary extra paths still excluded, auth and same-origin mutation guard unchanged. |
| BUG-10 | Already resolved: SelectionContext is derived directly from URLSearchParams in AppProvider.UrlSelection. Adding a second synchronizing state/effect would introduce competing state. Existing URL-based project/model navigation retained. |
| BUG-11 | Class/assignment project creation and runtime adapter already wired. Fixed optional runtime query failure/loading blocking submission. Required runtime remains blocked until valid selected evidence. Keep explicit matching project/model/source/diagram selection and frozen artifact confirmation. Do not auto-reassign personal projects or silently submit the first diagram. |
| BUG-12 | saveModel already calls revision endpoint with explicit element changes and lineage. Existing regression covers saved revisions; retained. |
| BUG-13 | Relationship selection and userQuestion UI already exist. Fixed explain target/kind URL handling; target must belong to the current revision. URL target changes update the visible selected target. |
| BUG-14 | Already resolved: login redirects student /, lecturer /workspaces, admin /administration/users independently of backend mode. |
| BUG-15 | Current workspace overview/members screens, lecturer CRUD and reference publication exist and are wired. Preserved; no duplicate replacement screens. |
| BUG-16 | Workspace create/read, assignment read and workspace project/reference list already enforce policy. Remaining owner-only job read/list now uses shared project-read policy so authorized lecturers/admins work and peers remain denied. Write/cancel authorization unchanged. |
| BUG-17 | Current admin controller set already exposes jobs/integrations/profiles and global runtime-sessions; BackendRuntime administrative mode loads projectId="*" without requiring project selection. The remaining role UI gap is fixed: explicit Student/Lecturer/System administrator selection uses the existing admin-only role endpoint, with confirmation before granting system administration. Canonical SYSTEM_ADMIN mapping is tested. Existing administrator rows remain read-only in this UI, preserving its previous protection against accidental administrator demotion. |
| BUG-18 | Already resolved: submission export uses AccessPolicyService, without comparing localized roles.name. Frozen bundle/provenance checks retained. |

## Verification scope

Regression evidence and exact commands are recorded in `docs/engineering/tasks/2026-10-28-full-stack-audit-fixes.md` (local workspace kit) and `E:/Mavis/analysis/full-stack-fix-20261028`.

- FE: Node tests include live adapter/BFF functions with mocked transport, boundary/code propagation, negative path allowlist, graph layer/certainty, runtime normalization, explain target and submission readiness.
- Java: real standalone Spring Security filter chain without DB checks auth/CORS; unit tests check policy delegation/denial, recovery exact timestamp digest, empty sequence access gate/idempotency. Broad suites are separate from UI acceptance.
- C#: shared canonical vectors retain all original 64-bit integer tests and add exact timestamp strings.
- Launcher: migration default/override and duplicate guard must not execute DDL on the team database.

A passing build or unit suite is not complete browser UAT, production verification or migration acceptance. Runtime/Docker-only platform skips and unavailable prerequisites are recorded explicitly. No real provider requests, Gmail delivery, production fixture mutations or deployment as part of these fixes.

## Migration deployment boundary

The group database Flyway history was read in a read-only connection; no user data was exported and no cloud DDL was executed. It confirms the retained canonical V10/V11 scripts. Renamed V18/V20 are pending schema changes, not evidence of production rollout. Existing env keeps migrations disabled. Before enabling on a live environment, review its own version/script/checksum history and actual schema, take/verify a backup and agree the rollout/rollback plan. An environment which applied the alternate coursework V10/submission V11 needs a separate reconciliation; do not run Flyway repair blindly.
## Local verification receipt

- Java: `mvnw.cmd -B -ntp clean verify` PASS, 434 passed / 15 skipped / 0 failed (449 discovered across Java client/common/platform/analyzer/bootstrap). PostgreSQL18.6 test DB only; legacy API tests now use real JWT rather than dev-bypass headers. Education test verifies job reads/lists for owner, lecturer and admin, and denies peer/outside students.
- MigrationUpgradeTest PASS: empty DB ->V20; V15 ->V20 with a manually provisioned review table and preserved learner row; validate and repeated migrate. Canonical V10/V11 scripts remain unchanged. PG18 runs emit an older-Flyway support warning; hosted CI uses PostgreSQL16.
- Worker: 222 passed /3 skipped /0 failed (225 discovered). Two Linux-only filesystem cases and opt-in real-Docker runtime test skipped locally. The shared timestamp vectors pass. A fixture writer initially rounded a pre-existing int64; that accidental change was corrected before the passing rerun, and all original int64 vectors are retained.
- Frontend: 224/224 tests PASS; typecheck PASS. Production build PASS (exit0) after role UI changes, using isolated output under `.artifacts/audit-build-20261028`.
- Launcher WindowsPowerShell5.1 regression PASS: migration default/explicit true/false, duplicate-version fixture and invalid setting, without DB connections.
- Workflow YAML parses; new CI PostgreSQL service and targeted security/job/runtime/migration regressions are configured. Hosted Actions execution NOT RUN locally.
- Targeted lint has no newly introduced errors after formatting; 79 pre-existing errors in java-operations.ts, 23 in contracts.ts and two prior Explain warnings remain. Build already skips lint by existing configuration; this receipt does not claim lint-clean.
- `git diff --check` PASS. Generated Next metadata and observed sequence timestamp fixture changes are excluded/restored. No new libraries, real provider requests, Gmail delivery, shared DDL, production writes or deployment.
- The workspace Doctor inventories tools but its broad file scan encounters the protected private-backup directory; that local-kit limitation is not an application test pass. Independent teammate review and full multiuser browser UAT remain pending.
