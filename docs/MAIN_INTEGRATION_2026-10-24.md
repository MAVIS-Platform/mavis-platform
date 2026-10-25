# Main integration and Windows launch — 24 October 2026

Integrated `origin/main` **f3c2fae** into `feat/stage-13-to-16`, starting from **c5ab260**. The incoming architecture explorer, diagrams, scenarios and grounded 3E features are retained alongside stages 13–16. Main was not modified or force-pushed.

## Resolution and fixes

- The only textual conflict was the final newline of the identical `V14__ThreeE_Grounded_Context.sql`. Retained the applied SQL; V14 checksum remains **2009627390**. Runtime planning remains V15. No shared migration or data change was needed for this merge.
- Added frontend regression coverage for 3E finding evidence: preserve `STATIC_CODE` provenance/unknown completeness and reject an evaluation from another model before fetching its evidence.
- The old evaluation API fixture treated an unqualified database node with no access excerpts as confirmed shared data. The new 3E rule correctly returned `NEEDS_REVIEW`, producing 55 instead of the fixture's expected 50. Added the logical datastore identity and actual configuration excerpts to the fixture, retaining the original score assertions and the new conservative rule. Extended real HTTP checks for finding evidence, grounded explanations, unrelated subjects and cross-user denial.
- Fixed Windows launch when the required SDKs are absent from PATH: optional machine-local JDK/.NET paths and existing package caches are read from ignored backend settings. They affect child processes only. No global SDK/PATH change or application dependency was introduced.
- Increased readiness request timeout from 3 to 30 seconds. The first OpenAPI generation took 8.2 seconds; the old probe aborted valid responses and produced client-disconnect error logs. A subsequent launcher readiness run passed without restarting the services.
- Frontend uses the launcher's ignored `.artifacts/next-local` build directory. Restored tracked `.next` cache and generated TypeScript metadata changed during verification; build products and private settings are excluded from the merge commit.

## Verification

| Check | Result |
| --- | --- |
| Frontend architecture/Java-contract suite | **77 passed**, 0 failed |
| TypeScript / mainflow contract / production build | **PASS** |
| Targeted incoming frontend lint | 0 errors, 1 Fast Refresh warning |
| Java client/common/platform/analyzer/bootstrap reports | **371 passed, 2 skipped**, 0 failures/errors |
| Worker .NET 10 regression | **218 passed, 3 skipped**, 0 failed |
| Windows PowerShell 5.1 launcher invalid-toolchain checks | **2 passed** |
| Actual `run.bat` build/start/readiness | **PASS**, all three services ready |
| Launcher repeat call | **PASS**, existing services retained |
| Running-app HTTP acceptance | **8 passed** |
| Browser | Login page rendered at the running frontend URL |

Java verification used an isolated local PostgreSQL database and Worker fixture. The initial full-reactor run identified the single outdated evaluation fixture. After fixing it, the focused evaluation test and all bootstrap API tests passed; the latest aggregate reports above contain no failures. Other Java modules had already passed and were unchanged by the fixture correction. The final artifact was packaged successfully and rebuilt by the actual Windows entry point.

The two Java skips are optional external corpus fixtures. Worker skips are two Linux-specific cases and the opt-in real-Docker runtime test. Worker runtime source did not change in main; this merge does not claim another real-Docker workload acceptance run.

HTTP acceptance checks the merged finding-evidence and runtime-plan API paths, Worker readiness, frontend login/session, strict anonymous API/BFF denial and unknown-account login through BFF → Java → Aiven. No cloud test users, OTP requests or real emails were created. Authenticated business writes were exercised by the isolated API tests, not by adding fixtures to the shared database.

## Running locally

- Frontend: **http://127.0.0.1:3000/login**
- Java API documentation: **http://127.0.0.1:8081/swagger-ui/index.html**
- Worker readiness: **http://127.0.0.1:5082/api/health/ready**

The requested application services remain running. Only the separate test Worker and test PostgreSQL were stopped. Run `run.bat --check` to inspect the running services. Logs/PID records are in `.artifacts/local-run`; task evidence is in `E:/Mavis/analysis/main-integration-20261024`.

Local JDK/SDK/cache settings and database/SMTP credentials remain in ignored `.env.backend.local`. The launcher keeps shared migrations disabled. Full multi-user browser/load testing and real Gmail delivery were not performed during this integration.
