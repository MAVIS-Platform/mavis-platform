# System Context Review

Implemented on a feature branch; not deployed automatically.

## Data and provenance

Candidates are stored in contextReview metadata on an internal model element, through the existing controlled-revision service. Each propose/edit/reject/confirm operation creates a revision under the project lock and write-access policy; migration V24 extends the element-type constraint to allow PERSON (existing types are preserved). Previous revisions retain earlier states and audit entries. Logical element keys keep candidate targets stable across revisions.

Rejected entries are withheld. Source-backed proposed principals may be displayed as dashed, provisional view elements; they are not model PERSON facts. Manual proposed entries stay metadata-only. Confirm requires a role/boundary explanation and creates PERSON or updates an external dependency, with USER_CONFIRMED provenance, reviewer identity, timestamp and source references. A manual candidate also creates an explicit user-confirmed interaction. No CONFIG_FILE or runtime evidence record is fabricated for those assertions.

Confirmed data is an assertion made by the reviewer, not proof that source or runtime established the business role. Source references are checked against the source revision and project; historical IDs remain tied to their original source revision. Concurrent/stale confirmations are rejected. Storage is bounded; failures leave the prior revision unchanged.

## Automatic suggestions in this implementation

- Saved STATIC_CODE evidence containing literal hasRole, hasAnyRole, @RolesAllowed or @Secured access rules can suggest a security principal. Comments, quoted examples and dynamic role expressions are excluded. Human identity and business role remain unverified.
- Extracted EXTERNAL_SYSTEM dependencies can be proposed for boundary review. Unresolved targets are withheld from the main context until confirmed. Their source topology cannot be silently rewritten by editing a proposal.
- No business actors are generated from controller/entity names, runtime logs or a generic User placeholder.
- AI cannot rewrite the System Context description, actors or interaction labels in the exported diagram. Existing Container/Component enrichment remains independent.

## UI

System Context automatically requests a read-only source candidate preview. This does not lock the project or clone a model revision. It has an expandable Review system context section: refresh source candidates, enter a manual candidate, edit, reject and review/confirm. Source excerpts are shown as references, not proof of the actor. Confirmation requires an explanation and acknowledgement. Review history shows reviewer/time/base revision. Saving navigates to the new revision; API failures keep the draft.

Backend mode is required for persistence. Mock mode explicitly states that review is unavailable rather than pretending to save. Historical revisions cannot be mutated. User-facing text is English.

## Verification boundaries and remaining work

Existing PERSON persistence requires migration V24. The provisional-preview change adds no migration and performs no production migration.

Backend tests cover proposed-only storage, atomic confirmation, user provenance, rejection, source evidence validation, authorization, stale revision handling and controlled-revision persistence shape. Frontend tests separate source-backed provisional principals from confirmed actors, reject unsupported/manual/rejected candidates, and prevent AI rewrites. Browser tests use a labeled fixture and deliberately reject mutations to verify form validation, payloads and draft preservation. They do not prove a production database write or live draw.io connection.

Natural-language document extraction and LLM actor proposals are not enabled in this version. Doing so requires cited evidence and the same review gate; no unsupported names should be created. Runtime role enrichment still depends on a separately provisioned runner and does not establish human business roles. Context decisions are revision-scoped and are not silently carried into a fresh static re-analysis.

## Provisional-preview details

`GET /api/v1/analyzer/models/{modelId}/context-review/candidates` checks project read access before reading saved source evidence. Literal role names are preserved, with the source locator, excerpt, evidence ID and revision. Preview IDs are deterministic for a role and logical target key. Reject/confirm can address these IDs directly; writes still require latest-revision checks, project write access and the existing controlled-revision transaction. Rejected keys remain suppressed along the reviewed lineage. For a fresh analysis, a project-scoped lookup of the latest decision for each source signature in prior reviews suppresses only the exact rejected role + locator + excerpt signature. A changed declaration requires review again; confirmed business roles are never silently transferred onto a new analysis.

Generated XML labels provisional nodes as `SECURITY_PRINCIPAL`, uses dashed nodes/links, and explicitly says that the interaction and business role need review. A saved draw.io document is retained; users may select a separate inferred preview. Unsaved drawing changes are also retained when parent XML updates. Visual edits alone do not confirm semantic actors.

The read-only endpoint avoids the previous heavy SUGGEST revision-generation path for source discovery. The mutation response timeout is aligned with full model loading; an ambiguous save timeout instructs users to reload the latest revision instead of assuming the write failed. Source discovery errors are displayed as unavailable, never as a verified zero-actor result.

Local verification: 28 backend tests across ContextReviewServiceTest and ModelVersionServiceImplTest; 291 frontend regressions; production build; browser fixture exercises automatic discovery, evidence display, no automatic model writes, error handling and retry. Local draw.io was unavailable, so generated XML checks are not a claim of visual verification inside the real editor. CI integration results are recorded on the pull request.

PR-Agent provider logs identified the retired model explicitly. The workflow uses gemini/gemini-3.8-flash with gemini/gemini-3.6-flash fallback; provider success is verified on CI rather than inferred from configuration.
