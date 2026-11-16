# Coordination with Java stage 13–16 roadmap

Date: 2026-10-23. Reference supplied by user: mavis_stage_13_to_16_fe_be_completion_and_bugfix_roadmap.md. The prompts inside that document are reference material, not instructions to execute those stages in this chat.

## Baseline that must be preserved

Diagram/graph work is pushed in commit 3123ad8 on feat/ui-api-updates. The roadmap audit describes an earlier V1–V11 snapshot and does not include this commit. Java stage branches should integrate/review this baseline before editing shared files. Do not overwrite these files using older Drive copies.

- V12__Architecture_Documents.sql and V13__Messaging_Architecture_Facts.sql already exist and have been applied to the configured development cloud database. Never reuse those migration numbers or modify their applied SQL. Allocate new migration numbers from the latest integrated branch; stage number is independent of migration number.
- New document entities/repository/controller/service and messaging element/relationship types must survive subsequent changes.
- Frontend mappings added for architecture views/documents, GitHub branch discovery/commit pinning, graph origin/resolution and hierarchy must survive subsequent changes.

## Working boundary for this chat

This chat continues diagram/graph semantics, projection, layout/readability, view navigation, document persistence/export and directly necessary analyzer changes. It will not start roadmap stages 13–16 profile, OTP, runtime lineage, workspace/assignment/submission, admin integrations/profiles or runtime configuration/scenario work.

The Java teammate's roadmap includes frontend tasks too. Ownership of those tasks is not reassigned by this note. Treat stage 13.2, 14.2, 15.2 and 16.1 frontend changes as reserved until the human team agrees who implements them.

## Shared files requiring careful merge

- MAVIS-Frontend/src/lib/api/java-operations.ts: add stage operations without replacing diagram/document/GitHub cases or existing runtime read/control cases. Prefer extracting stage-specific adapters into separate modules when useful.
- MAVIS-Frontend/src/lib/api/contracts.ts and src/types/domain.ts: extend contracts; keep hierarchy, relationship origin/resolution and document revision fields.
- MAVIS-Frontend/src/lib/api/java-wire.ts: projectView belongs to the stage 13 change; modelView/evidence/graph metadata changed in 3123ad8. Merge by function.
- tests/java-contract.test.cjs: preserve both architecture/import regressions and new stage contract tests.
- Model/element/relationship entities, projection, DTOs and Flyway: coordinate additive fields/types and migration allocation. Runtime enrichment must preserve added properties and parent relationships when copying models.

## Roadmap assumptions to review before implementing

These are integration concerns inferred from the supplied plan, not confirmed bugs in the teammate's future code.

1. Project ACTIVE is a project lifecycle state, not proof analysis/diagram is ready; keep lifecycle and analysis readiness separate.
2. Stage 16 save operations must actually persist configuration/scenarios and check revisions. A read/preflight response with revision=1 is not a successful save. compatible does not alone prove readiness to dispatch.
3. Choose a submission's diagram explicitly and verify project/model/snapshot ownership; selecting the first diagram silently may submit the wrong document. Define how new saved architecture documents relate to existing diagramVersionId.
4. Admin integration/profile toggles must affect actual execution and survive restart if presented as saved settings. Audit logs alone do not provide durable active configuration. Derive health from available checks; do not hardcode all services operational.
5. Runtime create/approve behavior must preserve existing approval/security and lifecycle contracts. Do not collapse independent execution/evidence/publication states into invented success.
6. Resolve actual DTO/endpoint contracts against current code/OpenAPI; older line numbers, operation counts and folder paths in the roadmap are not authoritative.

## Integration check before merging

Build from the current combined baseline; run each stage's tests plus architecture/import contract regressions. Verify fresh and existing DB migrations. Keep secrets, generated .next files and build outputs out of commits. This note does not authorize sending messages to another person or chat.
## 3E v2 integration — 2026-10-23

V14__ThreeE_Grounded_Context.sql is now allocated and applied to the development database. Preserve it when integrating stage branches; allocate a later unused migration for unrelated changes.

3E modifies ArchitectureEvaluationServiceImpl (RULE-02 and finding context), AI explanation DTOs/service, AiExplanation/EvaluationFinding entities, and the explanation repository. It adds GroundedFindingExplanation, SharedDatabaseRule and FindingEvidenceController. New finding explanation requests carry findingId and evaluationRunId; new evaluations identify the actual rule set as 3e-2. Old results remain historical.

Frontend shared changes retain sourceType in evidenceSchema/evidenceView and add the findingEvidence operation to contracts/java-operations. Merge these changes by function with the stage work. Profile, OTP, education, admin and runtime configuration/execution files were not changed by 3E.

See THREE_E_IMPLEMENTATION_2026-10-23.md for automated acceptance and the pending novice usability pilot.