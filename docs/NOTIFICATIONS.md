# In-app notifications

## Scope and delivery

The bell and `/notifications` inbox are shared by Student, Lecturer and System Administrator. These are **in-app** updates, not email, SMS, OS push or a replacement for immediate form validation/toasts. New messages are polled every 25 seconds while the application is active; they are not WebSocket push. Reading/opening the bell does not mark every message read. Single-message reads and mark-all operations persist in PostgreSQL. Mark-all is scoped to the signed-in user and the server's creation-time cutoff. No API permits choosing another recipient or broadcasting arbitrary text.

PostgreSQL AFTER triggers write inbox rows in the same transaction as business changes. A rollback removes both. Unique recipient/event keys prevent duplicate fanout; no historical backfill is performed. Business authors are excluded from assignment/workspace broadcasts. Async result receipts may intentionally go to the initiating project owner. Draft reviews never notify students; only published/returned reviews and withdrawals do. Private feedback, grades, error diagnostics, tokens, passwords and credentials are not copied into notification bodies. The destination's normal authorization still applies when an old notification is opened after access has changed.

## Event coverage

- Workspace: membership added/removed, member role changed, workspace archived/reactivated. Lecturers receive join notices; members receive access notices.
- Assignment: created, edited, deleted, reference source published; active student members receive due reminders within 24 hours and one hour if no submission exists. A single scan does not emit both reminder windows at once.
- Submission: receipt to the submitter, new submission to workspace lecturers/creator; new/edited/removed lecturer feedback; published/returned grades and published-review withdrawal to the submission author. Draft text and scores remain private.
- Analysis: terminal source-analysis jobs and available model revisions/evaluations to the owner. Failed/timed-out jobs also alert administrators, excluding a duplicate if the owner is an admin.
- Runtime: terminal execution changes and failed cleanup to the owner; failure/timeout/rejection/cleanup incidents to administrators.
- Account/project: role/access/password changes to the affected active user, account-access changes to administrators, project status to the owner. Locked users cannot access the inbox; login lock notices remain a separate auth feature.
- Administration: integration/profile changes to other admins. Health monitoring emits admin alerts on failure/warning transitions and recovery, without repeatedly alerting on an unchanged outage.

Ordinary saves, diagram edits, AI calls and synchronous configuration validation do not generate a second persistent notification for every click. Their saved result or form response remains the source of truth. Deleted resources may no longer open; the inbox preserves a generic activity receipt, not an unauthorized copy of deleted data.

## Release and operations

1. Review and back up the database. Apply only `V22__User_Notifications.sql` through the approved migration process; production Flyway is disabled by default. The migration creates the inbox, indexes, helper functions, triggers and last-observed health table. It does not rewrite old business data or backfill users. New frontend/backend code without V22 returns an unavailable inbox and leaves existing business tables unmodified.
2. Deploy the matching frontend/backend release. GET `/api/v1/notifications` accepts page/size (max 50), unreadOnly and category. PATCH `/{id}/read` and POST `/read-all` recheck active-user identity and ownership. HTTP responses are private/no-store at the Next boundary.
3. After V22, set `MAVIS_NOTIFICATIONS_REMINDERS_ENABLED=true` and `MAVIS_NOTIFICATIONS_MONITORING_ENABLED=true` on the backend and restart. The reminder scan runs every minute; health monitoring starts after 90 seconds and runs every minute. Multiple instances are deduplicated by database state/constraints.
4. Verify Student/Lecturer/Admin event paths using separate accounts. Verify empty, unread/all, category, pagination, unavailable storage and mark-as-read behaviour. Never seed fake production notifications to represent provider usage or user activity.

If the database is down, the inbox and DB-backed alerts cannot deliver; an external uptime/email channel would require a separate integration. Monitoring covers the checks implemented by System Health, not full host/Runner observability. No automated retention deletion is enabled. Event triggers are part of the business transaction: monitor failures and roll back the notification release by disabling its triggers before dropping any helpers/table. Do not drop user data to roll back UI code.

## Verification

- Backend: `./mvnw.cmd -pl mavis-bootstrap -am -Dtest=NotificationControllerTest -Dsurefire.failIfNoSpecifiedTests=false test`.
- Frontend: `npm run typecheck` and `npm test`.
- Event integration: start an isolated PostgreSQL instance on localhost port 55439 with local test user postgres, then run `python MAVIS-Platform/mavis-be/mavis-bootstrap/src/test/python/notification_events_test.py` with psycopg2 installed. `MAVIS_NOTIFICATION_TEST_PORT` overrides only the localhost port. Tests create/drop a uniquely named test database, never connect to the production DSN, and assert real trigger recipient isolation, rollback, deduplication, published-review privacy, reminders and health transitions. CI runs this against a fresh Postgres service container.
