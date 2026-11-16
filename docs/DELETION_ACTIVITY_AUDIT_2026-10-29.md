# Deletion audit and Recent activity

Successful project/snapshot deletions now insert a resource-deletion/v1 audit_logs row in the same transaction. It contains authenticated actor ID, owner ID, project/target IDs, names and deletion mode. Project/snapshot identifiers are copied into audit details; they are not cascading references to the deleted records. Snapshot source files, secrets and code are not copied into logs. Failure to write exactly one audit row fails the transaction instead of reporting an unlogged success.

The personal activity endpoint /api/v1/activity/projects combines analysis jobs and deletion audit events with server-side ordering/count/pagination. It requires an active user and filters jobs by project ownership, deletion events by recorded owner or actual actor. It does not expose the global admin audit list. Analysis actor identity is not inferred from ownership. Actor names use the matching user identity; if unavailable, the recorded actor ID remains available.

Recent activity uses this feed even with zero projects. Removed projects and deleted snapshots have no dead Inspect links. Project removal is explicitly soft deletion with history retained; snapshot deletion is distinguished from analysis failure. Delete/start/cancel mutations refresh the feed and deletion also refreshes admin audit cache.

This change does not fabricate logs for past deletions. Those actions occurred before capture existed; neither actor nor exact deletion time is inferred from other fields. The old analysis-only endpoint remains compatible for existing clients.

Tests cover audit insertion, failed audit refusal, auth/page validation, adapter null fields and real PostgreSQL retention/rollback/isolation. Browser testing uses labeled fixtures and reads only; it does not perform production deletions. CI runs the PostgreSQL test on a dedicated loopback test database, never production.
