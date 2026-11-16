# 3E v2 — implementation and verification

Date: 2026-10-23. Branch: feat/ui-api-updates. Status: code implemented and automated acceptance completed; student usability pilot remains pending.

## Delivered

- Vietnamese 3E panel with a basic summary before network explanation, default Explain, accessible tabs, a 420px desktop panel and a bounded mobile drawer.
- Summaries use saved types, ownership and known responsibilities. Source/configuration/runtime provenance remains distinguishable through the frontend contract.
- Evidence cards use relative source locations, expandable excerpts, explicit unknown completeness and progressive loading. No invented line range or full-source IDE.
- Findings have readable names and outcomes, evaluation scope/version/time, legacy notices, specific evidence navigation, graph highlighting and return to the original selection.
- RULE-02 ignores startup/deployment edges, resolves logical datastore identities and service ownership, combines matching identities and groups unresolved findings. Missing access evidence produces NEEDS_REVIEW rather than PASS; summary metrics use the final verdict.
- Finding explanation validates model, selected subject, evaluation run and finding identity. Evidence retrieval is restricted to finding references inside the authorized model.
- Structured deterministic finding explanations separate summary, significance, unknowns, next steps and references. This is labeled as deterministic synthesis, not live LLM output.
- Cache keys include subject/model/snapshot, finding/run/rule version, template/language and evidence content. Legacy explanation cache is not used for the new bound finding flow.
- Existing model evaluations remain unchanged. New evaluations use ruleSetVersion 3e-2.
- Additive migration V14__ThreeE_Grounded_Context.sql stores finding details and explanation grounding/cache identity. It was applied successfully to the existing development database.

## Verification

- Analyzer suite: 215 tests reported, 0 failures/errors, 12 skipped by existing test configuration. Supporting Maven modules also passed.
- Frontend: 60 tests passed; changed-file ESLint and production build passed.
- New tests cover same host/separate schemas, same logical identity, startup exclusion, missing owner/identity/access evidence, component ownership, deduplicated unresolved warnings, wrong model/run/subject, evidence allowlists, context cache invalidation and finding-evidence authorization.
- Actual FTGO browser flow on port 3000: no AI request on initial selection; new rule version 3e-2; finding explanation HTTP 200 with exact IDs; repeat request used matching cache; graph highlighting returned to selection.
- Real DATABASE_ACCESS evidence returned STATIC_CODE and relative file location. A real legacy evaluation response fixture showed the historical-rule notice.
- Mobile: panel 366px wide inside a 390px viewport; document width 390px.
- Backend runs the packaged build with schema V14. Frontend runs .artifacts/three-e-final on port 3000. Worker orchestration/configuration was not changed.

## Remaining acceptance and limits

- No 3–5 student usability pilot has been performed; do not claim the learning goals have been demonstrated by novices.
- No full fresh-database deployment exercise was performed in this task. The additive migration was validated on the existing development database.
- This change does not make incomplete analysis complete, recover source that was not extracted or prove runtime behavior from declarations. Evidence cards explicitly retain missing-completeness states.
- Existing evaluations are historical records; run a new evaluation to use the updated rule. A model lacking datastore identity can require source re-analysis.
- Full-source browsing, general chat, arbitrary panel resizing and rewriting other architecture rules remain outside this release.
