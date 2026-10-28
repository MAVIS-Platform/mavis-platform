# Feign delivery verification — 28 October 2026

Branch: `fix/full-stack-audit-20261028`. Previous audit fix `dc15771` has been pushed. This change adds method-level OpenFeign source analysis and caller/receiver evidence to the existing graph and Inspector. It does not merge main or deploy production. See [behavior and limitations](FEIGN_COMMUNICATION_EVIDENCE.md).

## Verification

| Check | Result |
| --- | --- |
| Java full reactor `mvnw.cmd -B -ntp verify`, JDK21 | PASS: 446 discovered, 432 passed, 14 skipped, no failures/errors |
| Feign resolver and existing parser/graph targeted tests | PASS, followed by full reactor regression |
| Feign HTTP API integration, PostgreSQL local, JWT | PASS: two method-specific relationships, correct proof association, four roles per relationship, outsider denied |
| Flyway clean install and V15→V20 upgrade | PASS, history/data preservation and repeat migration included |
| FE `npm test` | PASS: 227 tests, no skips/failures |
| FE `npm run typecheck` | PASS |
| FE production `npm run build` | PASS, isolated `MAVIS_NEXT_DIST_DIR=.artifacts/feign-build-20261028` |
| Worker Release test suite, .NET10 | PASS: 222 passed, 3 skipped, no failures |
| Launcher migration/preflight PowerShell tests | PASS |
| ESLint new communication files and Java wire adapter | PASS |
| Existing Inspector/domain lint | Existing baseline unchanged: selection 67 errors/5 warnings, evidence 8 errors, domain 6 errors; full lint is not clean |
| `git diff --check` | PASS |

Java's 14 skips are optional source/benchmark fixtures and external Worker integration cases. Worker skips are two Linux-specific tests and the opt-in managed Docker runtime test. These do not count as passes. No imported application was executed.

The first full Java run used incorrect migration test environment variable names and failed that test; the corrected complete verify passed. The first sandboxed Worker run was blocked by Windows Event Log access; rerun with appropriate execution permissions passed. Tests/assertions were not weakened for either result.

Environment: isolated PostgreSQL18 on `127.0.0.1:15438`, dummy test credentials, Flyway application startup disabled, schema validation enabled. Migration tests created/dropped randomly named local databases. No cloud writes, private data, Gmail or external AI requests. Task-owned PostgreSQL container stopped after verification; unrelated services left alone.

Local evidence: `E:/Mavis/analysis/feign-evidence-20261028/`: `java-verify-corrected.log`, `java-feign-api.log`, `fe-tests.log`, `fe-types.log`, `fe-build.log`, `worker-tests-permitted.log`, `launcher-tests.log`, and baseline/current lint comparison JSON. Build-generated Next metadata and the trace fixture timestamp were restored after inspection.

## Review and remaining gates

Self-review traced parser → typed receiver resolution → graph publication → evidence persistence/API → FE DTO → Inspector. The cross-language linker skips method-level OpenFeign summaries to prevent duplicate HTTP edges; a regression test covers this. The relationship persistence path preserves all proof records and rejects incomplete saves. URL target precedence, ambiguous service/endpoint/overload cases, wrong verbs, path variables and shadowing have regression coverage.

No dependency or database migration was added. A new analysis revision is required for existing imported projects. Browser UAT, independent teammate review, hosted Actions, production deployment and real runtime traffic validation were not performed. Passing these tests does not establish correctness for every possible input.
