# Stage 13–16 delivery record

Source: the roadmap supplied on 23 October 2026. The user's instruction overrides its separate branch names: all work stays on `feat/stage-13-to-16`, one commit per stage, verified and pushed before starting the next stage. No merge to main or deployment is authorized.

Baseline: b279478, fast-forwarded from the existing branch without a merge commit. Pre-existing local engineering files and `Doc KLTN/` remain outside these commits.

## Sequence and acceptance

1. Stage 13: runtime lineage and trace identity, timezone-aware OTPs, authenticated profile editing, project DTO preservation. Check profile validation/wrong password/anonymous and inactive users, runtime lineage/cross-trace collisions and FE contracts/build.
2. Stage 14: authorized workspace/member/assignment/reference/submission/feedback operations, personal submission listing and correct version pinning. Check outsider/student/lecturer/admin, cross-workspace/version, deadlines and immutable results. Connect actual UI mutations and cache invalidation.
3. Stage 15: guarded admin configuration and monitoring with honest readiness/counts and compare-and-set revisions. Configuration state is process-local where the roadmap requests memory/properties; expose that limit, never pretend it is durable secret storage. Check admin-only access, stale revisions, invalid limits, masking and effective enablement.
4. Stage 16: real saved runtime configuration/scenario contracts and UI; pin source/model/config/scenario, preserve independent lifecycle/evidence/cleanup and do not report approved sessions as running. Run Java, Worker and FE checks and isolated API/browser acceptance where prerequisites permit.

Stages change API contracts, Java services, FE schemas/adapters/UI and regression tests. Existing applied Flyway migrations are not rewritten. Runtime execution remains on the dedicated Runner; source is never executed by static tests. No fabricated health, readiness or test passes.

## Verification and rollback

Use JDK21 and the repository-pinned .NET SDK. Test data/services must be isolated from the user's cloud database; no production migration/reset. Unit/mock tests do not count as live runtime acceptance. Record exact commands, skips and limitations in each stage's section before commit. Review staged paths and secrets; push only this branch, never force-push. Rollback uses a reviewed revert of the relevant stage commit, not history rewriting.

## Results

### Stage 13 — verified

Implemented profile PATCH/PUT with active-user policy and password verification before mutation, OTP instant mapping, runtime base lineage and trace+span identity, scope checks, and FE profile/project contracts. No migration or dependency change.

Verification on 23 October 2026:
- Java unit reactor (`mvn -B -ntp -f MAVIS-Platform/mavis-be/pom.xml -pl mavis-platform,mavis-analyzer -am -Dtest=*Test,!*IntegrationTest -Dsurefire.failIfNoSpecifiedTests=false test`, task-local Maven cache): 317 discovered, 314 passed, 3 pre-existing environment skips; zero failures. Includes profile validation, both HTTP methods, incorrect passwords, inactive users, trace collisions and lineage assertions.
- Isolated PostgreSQL 15 on loopback port 15433 + Spring Boot `Stage13ProfileApiIntegrationTest`: passed. Checks JWT-authenticated password update/rejection, persisted hash, no hash response and OTP instant round-trip. Never used the cloud database.
- Frontend: 52 tests passed; typecheck, targeted ESLint and production build passed. Build used `.next-integration`; generated tracked config changes restored.
- Worker .NET 10: 218 passed / 3 skipped, zero failures with serial test collection execution. Initial concurrent build/test load caused two wall-clock timeouts; isolated serial run used the same assertions and code. Skips: two Linux symlink cases on Windows and opt-in real Docker-managed acceptance. This is not live imported-application runtime acceptance.
- Self-review of callers, DTOs, validation and final diff; `git diff --check` passed. Test logs retained locally under `E:/Mavis/analysis/stage13/`.

Production/runtime acceptance remains for stage 16; no claim of exhaustive or production verification.

### Stage 14 — verified

Connected workspace/member/assignment management forms and real API adapters, published reference model lookup, exact pinned submission hydration, complete submit payload and feedback commentText. Added current-user submission listing (own or workspace lecturer, admin all) with SQL EXISTS to avoid duplicates. Closed inactive/outsider/classmate read paths, student teaching-workspace creation, removed-member submission and reference-publishing permissions. Export uses the central project policy instead of comparing role display names. Read-list filtering uses a boolean policy check so a denied row does not mark the transaction rollback-only.

Verification:
- Common + platform unit reactor: 112 passed, zero skipped/failures. Existing authorization and version/deadline tests retained. Fixtures updated to explicitly supply the teaching workspace/policy denial after centralizing authorization.
- Stage14EducationApiIntegrationTest: passed against task PostgreSQL15 with dev bypass disabled. Exercises anonymous rejection, student creation denial, lecturer workspace/member/assignment creation, outsider denial, classmate private-project filtering, pinned submit, both list aliases for student/lecturer/admin, foreign detail denial, student feedback denial, lecturer feedback, admin export, rename, creator-removal denial, member removal, feedback read, archive and removed-member submit rejection. Stored submission count remains one.
- Frontend: 58 tests, typecheck, targeted lint and production build passed. Build caught an exactOptionalPropertyTypes mismatch in the new management form; corrected using the contract-derived type and rebuilt. Submission validation messages are allowlisted through the browser adapter.
- Final self-review and diff whitespace checks passed; generated Next config edits restored. Logs: E:/Mavis/analysis/stage14/. Worker unchanged; its stage13 verification remains applicable. Browser-operated full runtime acceptance is still pending stage16.

### Stage 15 — verified

Connected all admin adapters and forms (including actual newStatus account payload), active global runtime monitoring, revision-checked integration/profile configuration and audit records. Common process-local settings are consumed by GitHub ingestion, AI key resolution, runtime creation, approval and run-definition export. Resource limits are pinned into new session profiles and hashed; disabled/reduced profiles block new dispatch rather than rewriting old pinned inputs. INACTIVE users cannot obtain login credentials. Dashboard counts ALLOCATED/RUNNING/CANCELLING only and reports health unknown; no fabricated service-health claim.

Verification:
- Full targeted Java unit reactor: 324 discovered, 321 passed, 3 environment skips, zero failures. Additional final consumer run: 28 passed, covering AI disable, GitHub disable before network/writes, runtime integration disable and current limits/export. Includes new competing-writer and audit-failure atomicity tests for process-local settings.
- Stage15AdminApiIntegrationTest: passed on isolated PostgreSQL with strict auth. Checks non-admin denials, configuration updates, stale revisions, invalid resource limits, audit persistence, account locking, current-session denial and INACTIVE login denial.
- Frontend: 62 tests passed; final contract-only regression 30 passed; typecheck, targeted lint and final production build passed. Generated Next configuration restored. No application dependency or Flyway migration added.
- Self-review and whitespace checks passed. Logs: E:/Mavis/analysis/stage15/.

Limits: configuration switches reset on restart and are specific to one platform process, as requested by this stage. They store no credentials. CONFIGURED means key/config presence, not a successful external connection test. Live GitHub/AI/collector connectivity and physical Runner acceptance are not claimed.

### Stage 16 — verified with stated limits

Runtime configuration and HTTP scenarios now persist independently of session history. Additive Flyway V14 stores source/model pins, operator profiles, scenario steps and revisions; existing applied migrations remain unchanged. Updates take the same project lock and reject stale revisions. Start checks scope, exact revisions and explicit approval in one transaction, freezes those inputs into a real session, then queues READY_FOR_DISPATCH. It does not claim Docker is running.

Frontend runtime-config/scenarios/sessions use the durable APIs, provide create/edit forms and approval, and display separate execution/scenario/evidence/cleanup states. Pending and unknown remain distinct; missing durations and approval timestamps are not invented. Model edits send writable description fields instead of server-owned identity metadata.

Runner lifecycle, receipt and recovery callbacks require the dedicated service credential. Stale receipts cannot replace a newer valid model; legacy raw-span enrichment stays nonlatest and cannot satisfy required coursework runtime evidence without completed, cleaned-up Runner receipt evidence. Compose ZIP reads are bounded to 1 MiB. Real Docker acceptance exposed command budgets shorter than Compose readiness and cold Runner startup; bounded command allowances now fit those stages while the session deadline, cancellation and sandbox limits remain enforced. Command timing diagnostics are test-only and exclude stdin/secrets.

Operation and recovery:
- Apply V14 through Flyway before using the editor. Save a same-project snapshot/model, an enabled administrative profile ID and the operator-provisioned digest-pinned collector/scenario images, instrumentation volume and application runtimes/ports. Image/source correspondence remains an explicit trust boundary.
- GET/PUT /api/v1/analyzer/projects/{projectId}/runtime-plan reads/saves configuration; GET/POST /scenarios and PUT /scenarios/{scenarioId} manage saved scenarios; POST /start requires configurationRevision, scenarioRevision and approved=true. Each HTTP step is a JSON object with id/service/method/relative path/expectedStatus; secretHeaders contains protected environment-variable references, never values.
- A dedicated operator launches MAVIS.Runner managed with the queue's session ID and a shared task state root. Persisted receipts/lifecycle journals support delivery/recovery. Saving a profile does not install images, start a runner or prove physical readiness.
- Rollback: disable new runtime dispatch through the administrative switch, preserve journals/receipts, and revert the stage application commit under review. Do not edit/drop applied V14 or discard persisted planning data as an automatic rollback. No production migration/deployment occurred here.

Verification on 23 October 2026:
- Java full reactor: mvn -B -ntp -f MAVIS-Platform/mavis-be/pom.xml -Dmaven.repo.local=E:/Mavis/analysis/m2-cache clean package — BUILD SUCCESS. 354 discovered, 352 passed, 2 skipped, zero failures/errors. Includes live Java-to-Worker upload/publication, PostgreSQL lifecycle/authorization tests and all bootstrap API tests. Skips are optional external Fruit ZIP and FTGO source fixtures, not new tests disabled for this task. Log: java-final-acceptance.log; XML-derived counts: java-test-summary.json.
- Existing API fixtures were corrected to use real active actors, correct workspace roles, accepted lifecycle states, current C4 syntax and the actual stale-base 409 contract. ApiIntegrationContext restores each cached context's own authentication mode; application dev-bypass behavior was not relaxed. Earlier failing runs remain in local logs.
- Worker: dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj -c Release --no-restore — 219 passed, 2 Windows skips, zero failures. SDK10.0.204, console logging via Logging__EventLog__LogLevel__Default=None, serial test-output xunit.runner.json (parallelizeAssembly=false, parallelizeTestCollections=false, maxParallelThreads=1). MAVIS_MANAGED_DOCKER_TEST_ROOT points to the task-owned prepared fixture. Real Docker/OTel success and cancellation both passed; successful run has Completed/Passed/Available/Confirmed, cancellation has Cancelled/NotRun/Available/Confirmed. Checks sandbox enforcement, actual images, nonempty correlated interactions, durable receipt ACK and absence of session resources. Linux symlink tests remain skipped on Windows. Log: worker-final-live.log. Initial Docker command timeouts were diagnosed and fixed, not hidden by assertion changes.
- Frontend: 66 tests passed; typecheck, targeted ESLint and final backend-mode production build passed. Generated Next config edits restored; .next-integration isolated build output. Logs: fe-test.log, fe-typecheck.log, fe-lint.log, fe-backend-lint.log, fe-final-build.log.
- Fresh PostgreSQL database: all V1–V14 migrations applied from Empty Schema to v14 successfully. The same upgrade to V14 was exercised against the earlier task database by API integration tests. No cloud database was accessed. Log: java-fresh-server.log.
- Actual production Next BFF on loopback3100 -> strict-auth Java18183 -> fresh PostgreSQL15433: anonymous denial, HttpOnly login, configuration save/reload/stale revision rejection, scenario create/update, immutable queued revisions, truthful pending state, detail, cancel, signout and authenticated SSR route200 passed. The first smoke harness omitted the required cancel action; corrected its payload without changing application code and reran in a separate fixture project. Log: bff-smoke.log.
- Final self-review checks authorization/provenance, callers, data writes, test changes, generated files and whitespace. Logs and redacted fixture evidence are retained under E:/Mavis/analysis/stage16/; generated test output is excluded from the commit.

Limits: browser interaction was BLOCKED because the CUA kernel failed to initialize its local assets; HTTP/SSR and contract tests are not a substitute for click-through visual acceptance. The real Docker test uses a controlled repository application fixture and a FakeJava acknowledgement transport, while the separate BFF and Java API tests exercise actual persistence/authentication; no claim of one live browser-to-Java-to-Runner production execution. No arbitrary imported repository, production deployment, GitHub/AI provider connection, load benchmark or exhaustive-input guarantee was tested. Administrative switches remain process-local by stage15 design. Other pre-existing audit items outside this roadmap remain separate work. Dedicated Runner provisioning/launch and image/source verification remain operator responsibilities.
