# MAVIS · Stage 1 progress

Date: 2026-10-20 (Asia/Saigon).

## Checkpoint 1 · Design system and shared application shell

Status: implementation delivered; command-line verification passed. Browser visual/interaction verification and project-owner approval remain pending. Checkpoint 1 and Stage 1 are not complete until those gates are satisfied.

Authorization: the owner supplied the three requested screen flows and instructed continuation. This authorizes the checkpoint 1 scope previously proposed. Subsequent checkpoints remain gated by review and approval of this result.

### Acceptance criteria, verification methods, and results

- Semantic Light/Dark tokens — **verified programmatically**: 56 color tokens per theme; matching theme keys; every color registered as a Tailwind semantic utility. Forty text/surface pairs meet 4.5:1 (minimum 5.68:1); six boundary/focus/edge pairs meet 3:1. This checks opaque token pairs after OKLCH-to-sRGB conversion and is not a rendered-page accessibility certification. Actual font rendering, overlapping surfaces, and responsive layout remain unverified.
- Light/Dark/System — **partly verified**: eight pre-paint cases pass (default light/dark system, explicit choices overriding system, System, invalid/malicious-looking saved values, denied storage). Preference persistence, live media-query changes, cross-tab synchronization, and hydrated menu interaction are implemented and inspected in code, but not exercised in a real browser.
- Three role configurations and separated context — **verified at configuration/SSR level**: Student global destinations exactly My Projects / My Workspaces / My Submissions; Lecturer global destination My Workspaces; Admin has five flow-defined groups and nine destinations. Context configurations have 12 Student project destinations, five Lecturer teaching destinations, and four review destinations. Unsupported role/context combinations produce no contextual navigation. No planned destination has an invented URL.
- Sidebar collapse/drawer/menus/focus/narrow widths — **implemented, browser verification pending**: inspect at 1440px, 1024px, 768px, and 390px with keyboard and pointer before approval.
- Representative normal/selected/disabled/error/loading states — **implemented, partly verified**: production SSR contains both theme specimens, preview role controls, accessible skip link, and visible fixture-data labeling. Search, local feedback, modal confirmation, and detail-panel toggling still require hydrated browser verification.
- TypeScript — **passed**: full frontend type check, including all existing screens.
- Production build — **passed** on an independent temporary source copy with the same locked dependencies. Source-parity assertions confirm all 12 changed/added application source files exactly match the repository at final verification.
- HTTP smoke checks — **passed**: `/design-system`, `/`, `/architecture`, `/impact`, `/explain`, `/import` each return HTTP 200 and the explicit illustrative-data label. Generated CSS contains the new overlay, status/evidence, selection, and typography utilities.
- Formatting/lint — **passed with warnings**: Prettier passes for all 14 checkpoint files. Scoped ESLint reports 0 errors and four `react-refresh/only-export-components` warnings in layout, theme-provider, badge, and button. No ESLint configuration was changed; this is not a claim that repository-wide lint is clean.
- Scope/unrelated work — **verified**: actual tracked diff and full untracked status reviewed. No deletions. Backend, CI, dependency manifests/lockfile, Next configuration, tracked `.next`, and pre-existing reference documents remain unchanged.

### Commands actually executed

Node was absent from PATH. A portable Node 22.16.0 archive was downloaded from nodejs.org to `%TEMP%/mavis-stage1-node`, its SHA-256 checked against the release `SHASUMS256.txt`, and extracted without a system-wide installation. The following commands use that executable; `node` below abbreviates its full path.

- `node <portable-npm>/bin/npm-cli.js ci --no-audit --no-fund` — passed; 292 packages installed from the existing lockfile. Dependency deprecation notices were emitted for existing Recharts/ESLint versions. No dependency versions were changed.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false` from `MAVIS-Frontend` — passed, exit 0. No build-info file was written into the repository.
- `node node_modules/prettier/bin/prettier.cjs --check` with the 14 checkpoint paths listed below — passed. `--write` was earlier run only on checkpoint files to apply repository formatting.
- `node node_modules/eslint/bin/eslint.js` with the 11 checkpoint `.ts`/`.tsx` paths listed below — exit 0, 0 errors, four warnings. CSS and Markdown are covered by formatting/token checks, not ESLint.
- `node node_modules/next/dist/bin/next build` from `%TEMP%/mavis-stage1-build-native` — passed after final source synchronization. Next.js 15.5.25 came from the existing lockfile. Next's configuration skips lint during build, so the separate scoped ESLint run above is material.
- `node %TEMP%/mavis-stage1-verification.mjs` — temporary verification harness; token parity/registration, 46 contrast pairs, and eight pre-paint appearance cases passed.
- `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3091` from the independent build copy — started successfully for HTTP smoke testing.
- `node %TEMP%/mavis-stage1-smoke.mjs` — temporary harness; navigation conformance, six HTTP routes, generated semantic CSS, and source parity passed.
- `git diff --check`, `git diff --stat`, `git diff --numstat`, actual file diffs, and `git status --porcelain=v1 -uall` — inspected. No whitespace errors; no out-of-scope final tracked diff.

The Node archive/checksum, temporary harnesses, dependencies, and isolated build outputs are local verification artifacts, not product source changes. The smoke-test server is stopped after verification.

Earlier unsuccessful verification attempts are recorded rather than counted as passes: sandbox download connection failed; initial sandbox Next build failed with `spawn EPERM`; a temporary copy using a cross-drive dependency junction failed Webpack module resolution; a copy under `node_modules/.cache` failed `@/` alias resolution. A fresh temporary copy with its own `npm ci` resolved the path issues. Successful builds required permission to spawn workers outside the sandbox. The repository's architecture/configuration was not altered to accommodate these environment issues.

Browser runtime setup succeeded but browser discovery returned `No browser is available` and the supported browser list was empty. No screenshots, visual layout checks, keyboard tests, or browser persistence checks were executed, and no alternative browser automation was used.

### Current implementation

- Semantic color, typography, spacing, geometry, graph and evidence tokens.
- Theme preference provider and pre-paint initialization; header selector.
- Shared role-aware shell with global/context separation, sidebar collapse, mobile drawer, breadcrumb, notification/profile previews, and optional contextual evidence panel.
- `/design-system` with paired themes, component states, role/context controls, graph/evidence grammar and non-graphical relationship inspection.
- Screen/group/action/panel mapping and reusable visual standards in `stage-1-foundation.md`.

### Files

Modified:

- `app/layout.tsx`
- `src/styles.css`
- `src/components/app-shell.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/sheet.tsx`

Created:

- `app/design-system/page.tsx`
- `src/components/theme-provider.tsx`
- `src/components/appearance-selector.tsx`
- `src/lib/navigation.ts`
- `docs/design/stage-1-foundation.md`
- `docs/design/stage-1-progress.md`

Deleted: none.

### Existing conditions and limits

- `reference-documents/` was already untracked before this work. Preserve it unchanged.
- Node/npm were absent from PATH and common installation paths; frontend dependencies were initially absent. Portable runtime and locked dependencies are now available locally; no global PATH or system installation was changed.
- Existing detailed demo pages and their data/interaction logic are retained; shell-level labeling identifies their illustrative data. Their original widgets/copy and the old SaaS README are not approved final screen designs.
- Planned navigation entries have no invented route or backend contract. Outside the review harness they are explicitly planned/disabled. The harness only changes selection/context.
- Account, notification, feedback delivery, analysis, import, export, and AI service operations are not connected to a backend in this checkpoint.

### File-list deviation

The initial checkpoint proposal listed six existing files to modify. Two additional related primitive files, `src/components/ui/dialog.tsx` and `src/components/ui/sheet.tsx`, each receive a one-line change from a fixed black backdrop to `bg-overlay`. This extension was reported before the edit and is required for the preview's modal/drawer token consistency. Their behavior was not changed. The final change set is eight modified files and six created files, with no deletions or unrelated feature changes.

### Open the exact built candidate for manual review

The isolated build is retained in `%TEMP%/mavis-stage1-build-native`. In PowerShell, run:

```powershell
& "$env:TEMP\mavis-stage1-node\node-v22.16.0-win-x64\node.exe" "$env:TEMP\mavis-stage1-build-native\node_modules\next\dist\bin\next" start "$env:TEMP\mavis-stage1-build-native" -H 127.0.0.1 -p 3091
```

Open `http://127.0.0.1:3091/design-system`. This avoids regenerating the tracked `.next` directory in the repository. The retained candidate matches all 12 application-source files in this checkpoint; later edits require synchronizing and rebuilding that copy.

Manual handoff: [Vietnamese run instructions and 38 interaction checks](stage-1-manual-check.md). This documentation was added at the owner's request after the implementation handoff; it does not alter application source or mark any manual check as passed.

Before approval: inspect both appearances; test Light/Dark/System through reload and device-preference changes; select all three preview roles and their contexts; collapse/expand the sidebar; check mobile drawer, focus trap/return, skip link, menu keyboard interaction, tabs, table filter/empty state, invalid input recovery, detail panel, and local feedback. Record the real results in this report. Owner approval has not yet been given for the implemented candidate.

### Next checkpoints, each separately reviewed

1. Checkpoint 2: validate the full screen inventory with the owner; implement Student My Projects and Project Overview / Project Workspace layout, replacing the legacy dashboard body within an explicitly approved file scope.
2. Checkpoint 3: source snapshots, analysis results, architecture explorer/model/diagram/version and impact workspace layouts.
3. Checkpoint 4: runtime configuration/scenarios/session details and evidence-grounded AI explanation layouts.
4. Checkpoint 5: Student educational activities and Lecturer teaching/submission-review workspace layouts.
5. Checkpoint 6: Administrator list/detail/settings/monitoring/runtime layouts, cross-role consistency, responsive and accessibility verification, final screen-to-design coverage.

The next checkpoint must not begin before this checkpoint is verified and approved. Stage 2 inherits only approved decisions.
