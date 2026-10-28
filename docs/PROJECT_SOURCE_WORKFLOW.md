# Project and snapshot imports

- New personal project: the popup on My Projects contains a name, public GitHub repository URL, branch selector and optional full commit SHA. The default branch is preselected; the initial snapshot uses the selected branch or pinned SHA. No project picker or separate Create button exists in this form.
- Existing project: Import new snapshot is an action in the Source Snapshots title row and opens a dialog on the same page. A linked repository is read-only. Branch or optional full commit SHA chooses the revision; the selected SHA overrides the branch and is validated in that repository.
- Both new-project import and new-snapshot import queue analysis automatically, then open Source Snapshots with the accepted job so progress can be monitored. A model revision is created by analysis, not by merely importing a source snapshot.
- Legacy /import URLs redirect to the matching popup; they no longer present an additional create-project page. Teacher reference-source routes keep their assignment workflow.
- Backend normalizes repository identity and rejects replacement through both project update and source import. A lock serializes initial linking/imports to a project. GitHub-bound projects cannot accept unverified ZIP archives through the API.
- Older projects with no saved repository may link their original public GitHub URL once, after a successful import. No URL is guessed from commit hashes and no old snapshot is rewritten. Legacy ZIP-only/classroom projects remain usable until linked to GitHub.
- A failed import after project creation keeps the created ID for retry while the popup remains open. If analysis start fails after snapshot import, retry reuses the same snapshot and idempotency key. The project is not silently deleted. Its name/repository are locked in that retry form.
- Uses existing repository_url and default_branch fields; no migration is required.

The repository identity helper and related tests were recovered from the old MAVISS source. The earlier `feat/streamline-project-import` branch had only part of the desired flow and was not a substitute for the project-bound snapshot workflow.

Verification: backend SourceIngestionServiceImplTest, ProjectServiceImplTest, GitHubRepositoryUrlsTest; frontend typecheck/API contract tests; browser preview for project creation with branch/SHA, fixed-repository branch/SHA snapshots, title-row action and mobile layout. Preview does not import production projects.
