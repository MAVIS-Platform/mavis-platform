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

Stage 15: pending stage 14 push.
Stage 16: pending stage 15 verification and push.
