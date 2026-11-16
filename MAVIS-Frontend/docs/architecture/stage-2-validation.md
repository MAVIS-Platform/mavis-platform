# Stage 2 validation record

Date: 2026-10-21, Asia/Saigon.

Implementation scope: Stage 2 reusable components, feature state, typed provisional API contracts, adapter isolation, role-aware session behavior, version-scoped workflows and integration documentation. Stage 1 semantic styles, theme implementation, fonts and navigation groups are retained. No dependency version changed. No backend service was modified or contacted as an integration test.

## Automated verification

- Strict TypeScript: passed with the existing strict flags, including exact optional properties and unchecked indexed access. Command: `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- Boundary/workflow tests: **11 passed**. Command: `node tests/architecture.test.cjs` (`npm test`). Covers model immutability, stale revisions, frozen submission and matching source versions, feedback scope, runtime approval/prerequisites/outcomes, administrative permission checks, malformed graph/response rejection, response identity mismatch, network/HTTP failure normalization, cancellation, timeout, multipart transport, proxy configuration/origin/cookie isolation and pre-paint theme resolution.
- Scoped ESLint on all modified/new TypeScript: passed with **0 errors, 2 warnings** from the existing Fast Refresh rule on Next.js metadata exports in `app/layout.tsx` and `app/page.tsx`. This is not a claim of repository-wide lint cleanliness. The production Next configuration skips lint, so this separate check is material.
- Formatting: Prettier checked all modified/new TypeScript, Markdown, JSON and CJS files. `git diff --check` reports no whitespace errors.
- Production build: passed using Next.js **15.5.25** and the existing locked dependencies, in an isolated temporary copy. All **118 app/source/public files** match that copy by SHA-256. The repository's tracked `.next` outputs remain unchanged.
- HTTP smoke: **33 rendered routes and 2 expected 404 routes per mode**, plus explicit mock/backend login disclosure, design-preview fixture disclosure and 501 responses for unconfigured API operations. Both mock and backend modes passed against the built app. Command: `node tests/http-smoke.cjs <base-url> <mock|backend>`. This checks server rendering and routing, not hydrated interaction or actual backend data.

The environment has no Node/npm on its normal PATH. Verification used the previously installed, checksum-verified portable Node 22.16.0 at `%TEMP%/mavis-stage1-node/node-v22.16.0-win-x64/node.exe`. The isolated Stage 2 candidate is `%TEMP%/mavis-stage2-build`, with its own copy of the existing locked dependencies. No global runtime installation or PATH change was made.

Normal sandbox Next builds could not spawn workers (`spawn EPERM`); the build passed with the approved worker-spawn escalation. An initial cross-drive invocation with an absolute Next project argument compiled but failed HTTP smoke with duplicated Windows paths. Rebuilding and starting from inside the temporary project's own working directory resolved it. Neither failure was treated as a successful verification, and no product configuration was changed to hide it. Node's worker-based test launcher was also blocked; the committed test command runs Node's built-in tests in the same process.

## Browser and backend limits

Browser runtime setup succeeded, but discovery returned `No browser is available`; the supported browser list was empty. No browser screenshot, hydrated interaction, focus, keyboard, cross-tab storage or responsive validation was executed. No substitute browser automation was used.

No configured backend or authenticated backend response was verified. The backend-mode smoke test intentionally leaves operation mappings absent and verifies honest unavailability. It is not evidence that login, source upload, analysis, AI, runtime, coursework or administration are live-integrated. The server proxy's successful/failed transport tests use explicit test doubles.

## Stage 3 checks

- Check preserved Stage 1 typography, tokens, shell and all feature layouts in both themes at 390, 768, 1024 and 1440px.
- Verify Light/Dark/System through reload, OS changes, denied storage and multiple tabs; ensure no initial theme flash.
- Exercise login/sample-role switching, sign-out, forced 401 expiry, 403 routes/actions and cache clearing with a real browser.
- Verify keyboard menus, dialogs/drawers, focus trap/return, labels, live status announcements, graph controls and skip navigation.
- Run source invalid/unsupported/failed/incomplete-evidence scenarios, model conflict recovery, runtime approval/cancel/terminate, version-frozen submission and lecturer feedback flows end to end.
- Profile representative large graphs and long lists; agree server pagination/graph chunking before production-scale data.
- Complete the [API integration checklist](api-integration.md) and capture actual authenticated responses, validation errors, conflicts and unavailable-service behavior for every enabled operation.

To inspect the retained candidate, run the portable Node executable with `node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3092` **from `%TEMP%/mavis-stage2-build`**, then open `http://127.0.0.1:3092`. Set `MAVIS_API_MODE` to `mock` for sample accounts or `backend` to inspect unconfigured-service behavior. Temporary smoke servers are stopped after verification.
