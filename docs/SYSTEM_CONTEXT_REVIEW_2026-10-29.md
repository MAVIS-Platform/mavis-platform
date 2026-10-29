# System Context Review

Implemented on a feature branch; not deployed automatically.

## Data and provenance

Candidates are stored in contextReview metadata on an internal model element, through the existing controlled-revision service. Each propose/edit/reject/confirm operation creates a revision under the project lock and write-access policy; migration V24 extends the element-type constraint to allow PERSON (existing types are preserved). Previous revisions retain earlier states and audit entries. Logical element keys keep candidate targets stable across revisions.

Proposed/rejected entries are metadata only, never diagram actors. Confirm requires a role/boundary explanation and creates PERSON or updates an external dependency, with USER_CONFIRMED provenance, reviewer identity, timestamp and source references. A manual candidate also creates an explicit user-confirmed interaction. No CONFIG_FILE or runtime evidence record is fabricated for those assertions.

Confirmed data is an assertion made by the reviewer, not proof that source or runtime established the business role. Source references are checked against the source revision and project; historical IDs remain tied to their original source revision. Concurrent/stale confirmations are rejected. Storage is bounded; failures leave the prior revision unchanged.

## Automatic suggestions in this implementation

- Saved STATIC_CODE evidence containing literal hasRole declarations can suggest a security-role candidate. Role identity is not assumed to be a human actor; confirmation is mandatory.
- Extracted EXTERNAL_SYSTEM dependencies can be proposed for boundary review. Unresolved targets are withheld from the main context until confirmed. Their source topology cannot be silently rewritten by editing a proposal.
- No business actors are generated from controller/entity names, runtime logs or a generic User placeholder.
- AI cannot rewrite the System Context description, actors or interaction labels in the exported diagram. Existing Container/Component enrichment remains independent.

## UI

System Context has an expandable Review system context section: find candidates, enter a manual candidate, edit, reject and review/confirm. Source excerpts are shown as references, not proof of the actor. Confirmation requires an explanation and acknowledgement. Review history shows reviewer/time/base revision. Saving navigates to the new revision; API failures keep the draft.

Backend mode is required for persistence. Mock mode explicitly states that review is unavailable rather than pretending to save. Historical revisions cannot be mutated. User-facing text is English.

## Verification boundaries and remaining work

Migration V24 must pass the PostgreSQL upgrade gate and be applied before production use. It has not been applied to production in this task.

Backend tests cover proposed-only storage, atomic confirmation, user provenance, rejection, source evidence validation, authorization, stale revision handling and controlled-revision persistence shape. Frontend tests protect the diagram from proposed actors and AI rewrites. Browser tests use a labeled fixture and deliberately reject mutations to verify form validation, payloads and draft preservation. They do not prove a production database write or live draw.io connection.

Natural-language document extraction and LLM actor proposals are not enabled in this version. Doing so requires cited evidence and the same review gate; no unsupported names should be created. Runtime role enrichment still depends on a separately provisioned runner and does not establish human business roles. Context decisions are revision-scoped and are not silently carried into a fresh static re-analysis.
