---
name: mavis-ship
description: Finish MAVIS coding work by running relevant checks, committing the task changes, merging to main when on a feature branch, and pushing. Use automatically after a substantive repository change is complete; do not use for Q&A, planning-only, or unfinished work.
---

# MAVIS delivery

Use this workflow automatically after completing a substantive MAVIS code change. The user has authorized the normal test, commit, merge, and push flow; do not ask again for each step.

1. Confirm the Git root is `mavis-platform/`. Check branch, status, and diffs so the task's changes are clear. Leave unrelated WIP untouched.
2. Define what must work from the task and map changed files to their frontend, backend, or Worker module. Find the closest existing tests and commands in that module's README or `docs/DEVELOPMENT_RUNBOOK.md`.
3. Before committing, run the focused tests for the changed behavior, then the relevant typecheck/build/lint checks. Run broader suites when the change spans modules or could affect shared behavior. Do not add unrelated tests.
4. If a relevant check fails, identify whether it is caused by this task. Fix task-related failures and rerun the failed checks; if still blocked, report the failure without publishing a broken change. If no automated test covers the behavior, run the closest available check and report that gap.
5. Review the final diff, stage only files belonging to this task, and create a descriptive commit.
6. If already on `main`, verify the committed result and push it to `origin main`. If on a feature branch, push that branch, merge it into an up-to-date local `main`, rerun the relevant checks on the merged result, then push `main` to `origin`.
7. Never include unrelated WIP or secrets, use blanket staging, discard working-tree changes, or force-push. If a conflict or unrelated dirty state prevents a safe merge, preserve the state and report the specific blocker.
8. Report the checks and results, commit SHA, merge/push result, and any CI/deployment status actually observed. A successful push alone does not prove production health.
