# Worker Java client core

Java 21/Jackson transport library used by the platform integration. No Spring/JPA, database writes or target builds. This replaces the name-based/raw-path transport draft, not the Java analyzer itself.

- DTOs match Worker `1.0`, static profile `dotnet-static/1.9`, canonical candidate schema `dotnet-findings/1`.
- Artifact grants bind project/snapshot/job/attempt/digest/deadline. Keys are supplied by platform configuration; never use fixture keys outside tests.
- SharedArtifactStager copies only the producer-supported source/metadata set into a fresh atomic scope. Input is bounded, linked paths rejected. Snapshot and artifact roots must be separate; Worker must mount the artifact root read-only. Platform owns retention of completed scopes.
- Fingerprint uses ordinal paths and decoded-text SHA-256, including generated source but excluding ignored trees. Shared cases cover Unicode, CRLF and UTF-8/16/32 BOMs. Java rejects malformed encodings rather than guessing.
- Transport rejects redirects, limits response bytes/list counts, bounds whole-body time and preserves explicit timeout/cancel/rejected/failed outcomes. Failures never become successful empty results. No automatic retry or model promotion occurs here.
- Result validation checks scope, schema/adapter version, evidence hashes, references, orphan evidence and relative locations. Java still owns canonical identity/service mapping and publication policy.

Run `mvn test` here, or build it through the backend reactor. The live test is opt-in via `MAVIS_WORKER_TEST_URL` and `MAVIS_WORKER_TEST_ARTIFACT_ROOT`; its skip in ordinary unit runs is not live interoperability evidence.
