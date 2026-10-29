# Project and snapshot deletion

## UI and confirmation

Delete is available beside View in the project list, in Project Overview, and in each snapshot row. A confirmation dialog describes retention/destruction and requires typing DELETE. Backend mode is required; a demo does not pretend to persist deletions. Failure keeps the dialog and acknowledgement visible. Success invalidates lists/history/model caches and removes stale selection parameters.

## Backend behavior

- Project deletion preserves existing soft-delete behavior: set DELETED and retain snapshot/model/job/runtime history and stored files. It does not delete a GitHub repository.
- Snapshot deletion permanently removes the snapshot, its analysis jobs and generated model revisions only if no protected reference depends on them. Physical artifacts are retained for the shared-artifact retention policy; no filesystem path is deleted here.
- Published/reference snapshots, submitted coursework and runtime-linked snapshots are protected. Cross-snapshot model lineage or other protected FK references cause a conflict and rollback.
- Active jobs, pending/running runtime or unresolved cleanup block deletion. Owner/system-admin write policy and project-level locks protect every request. Runtime start and reference publication share the same lock to avoid racing deletion.
- Deleted projects cannot accept edits, uploads or new analysis. Historical read access remains governed by the existing read policy.
- Removing the latest snapshot restores only a known promoted static result or USER_CONFIRMED revision. No arbitrary partial draft or historical runtime result is promoted. If no such result remains, import/analyze a snapshot before creating further controlled revisions.

## Verification

Unit/regression tests cover authorization, source/project scope, protected records, active work, FK conflicts, latest-result restoration and deleted-project write protection. Adapter tests assert scoped DELETE endpoints. Production-bundle browser tests use read fixtures and deliberately reject mutations: acknowledgement gating, correct IDs, cancellation and draft retention are checked without deleting live data.

ResourceDeletionPostgresTest is opt-in on the dedicated loopback PostgreSQL test port. It creates a random isolated database and tests actual cascade deletion, same-snapshot revision lineage, promoted replacement and rollback for a cross-snapshot child. Local execution skips this test without the isolated DB; CI must pass it before release. No production data was deleted during development.
