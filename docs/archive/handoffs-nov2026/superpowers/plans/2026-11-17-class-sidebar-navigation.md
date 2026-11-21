# Class Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let lecturers expand a class in the existing left sidebar and select a class destination that renders in the main content area, without adding another sidebar.

**Architecture:** Extend the existing navigation model so a workspace entry has nested destinations, and render those children as accessible links in the current AppShell sidebar. Keep workspace identity in each destination URL; make the overview's course-content subtabs addressable so the sidebar can own the top-level class navigation without losing Roadmap, course Authoring, or Setup.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Tailwind tokens/components, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-class-sidebar-navigation-design.md`

## Global Constraints

- Do not add a right-hand sidebar or move the global MAVIS navigation.
- Preserve existing data, API contracts, permission checks, and workspace query parameters.
- Keep global navigation and workspace selection available.
- Use existing components/tokens and native links/buttons with visible focus states.
- Retain all existing class destinations and course-content actions.
- Preserve existing uncommitted work; only edit task-scoped frontend files.

## Review Focus

- A lecturer on any class route sees the correct class expanded and the current destination active; test navigation model and route rendering.
- Switching workspace does not carry a stale selected class or route state; test workspace links retain their own encoded workspace ID.
- A student does not gain lecturer-only destinations or actions; assert role-specific nested navigation.
- Sidebar collapsed/mobile modes keep class destinations reachable and keyboard-operable; verify at narrow viewport and via link/button semantics.
- Direct links to existing routes and query-based Results remain valid; test `workspace` and `view=results` preservation.

---

### Task 1: Model nested class destinations

**Files:**
- Modify: `MAVIS-Frontend/src/lib/navigation.ts`
- Test: `MAVIS-Frontend/tests/architecture.test.cjs`

**Interfaces:**
- Produces `NavigationItem.children?: readonly NavigationItem[]` for class entries; existing flat navigation items remain unchanged.
- Class destination IDs: `workspace-overview`, `members`, `assignments`, `lab-authoring`, `assignment-submissions`, `workspace-results`, `course-authoring`, `course-setup`.

- [ ] **Step 1: Add failing navigation assertions**

Assert lecturer workspace navigation includes these destinations with existing route paths and preserves the global `workspaces` and `studio` entries; assert student navigation does not expose lecturer-only destinations.

- [ ] **Step 2: Run the focused test and confirm failure**

Run from `MAVIS-Frontend`: `node --test tests/architecture.test.cjs`
Expected: the new nested-navigation assertions fail before implementation.

- [ ] **Step 3: Add typed nested destinations**

Add `children` to `NavigationItem`. For each workspace item generated in `AppShell`, attach class destinations whose hrefs carry `?workspace=${encodeURIComponent(w.id)}`. Keep Overview, Members, Assignments, Lab Authoring, Submissions, Results, course Authoring, and course Setup distinct; retain `/submissions?workspace=…&view=results` for Results.

- [ ] **Step 4: Run focused navigation tests**

Run: `node --test tests/architecture.test.cjs`
Expected: PASS, including existing global navigation and permission-related assertions.

### Task 2: Render expandable class navigation in AppShell

**Files:**
- Modify: `MAVIS-Frontend/src/components/app-shell.tsx`
- Test: `MAVIS-Frontend/tests/architecture.test.cjs`

**Interfaces:**
- Consumes `NavigationItem.children` from Task 1.
- Existing `NavigationEntry` remains the entry point for global links; it renders a native expand/collapse button for workspace parents and nested links for destinations.

- [ ] **Step 1: Add failing AppShell/navigation render assertions**

Assert workspace parent entries expose a named expand control, nested links retain each workspace query, the active destination is marked current, and nested destinations remain available when the global sidebar is collapsed or in the mobile Sheet.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/architecture.test.cjs`
Expected: the new nested-navigation assertions fail.

- [ ] **Step 3: Implement expandable nested navigation**

Use the existing `Collapsible` primitives for the workspace child list. Expand the selected workspace when the active route's query matches it; preserve selection across route changes. Keep collapsed-sidebar access through the existing tooltip/expand behavior and retain mobile Sheet close-on-navigation behavior. Use localized visible labels, `aria-expanded`, and current-link semantics.

- [ ] **Step 4: Run focused navigation tests**

Run: `node --test tests/architecture.test.cjs`
Expected: PASS; global/project navigation remains unchanged.

### Task 3: Make overview course views addressable and remove duplicate class tabs

**Files:**
- Modify: `MAVIS-Frontend/src/features/workspaces/screens.tsx`
- Modify: `MAVIS-Frontend/src/features/courses/course-workspace-shell.tsx`
- Test: `MAVIS-Frontend/tests/architecture.test.cjs`

**Interfaces:**
- Overview reads `view` from the URL: `roadmap` (default), `course-authoring`, or `course-setup`.
- `CourseWorkspaceShell` continues rendering workspace identity, summary, and actions, but its class-section navigation is omitted when the AppShell nested class navigation owns those destinations.

- [ ] **Step 1: Add failing overview route-state assertions**

Assert each supported `view` renders its corresponding existing component, absent/unknown `view` falls back to Roadmap, and existing Members/Submissions/Results routes keep their current screen components.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/architecture.test.cjs`
Expected: course view URL-state assertions fail.

- [ ] **Step 3: Wire URL-addressable course views**

Read `view` with `useSearchParams`; update the overview menu links to target the corresponding `view` values. Preserve course setup actions and access checks (`canManage`). Keep Workspace Members and Submissions screens using `CourseWorkspaceShell` summary/actions while removing its duplicate section navigation in these class-scoped screens.

- [ ] **Step 4: Run focused workspace tests**

Run: `node --test tests/architecture.test.cjs tests/course-learning-ui.test.cjs`
Expected: PASS; course setup, authoring, and class routes remain available.

### Task 4: Verify responsive and role behavior in the real frontend

**Files:**
- Test: `MAVIS-Frontend/tests/lecturer-lms.browser.cjs` (extend only if its current fixtures can exercise the sidebar without introducing new backend assumptions)
- Verify: Tasks 1–3 files

- [ ] **Step 1: Run typecheck and targeted tests**

Run from `MAVIS-Frontend`: `npm run typecheck` and `node --test tests/architecture.test.cjs tests/course-learning-ui.test.cjs`
Expected: all pass.

- [ ] **Step 2: Run the frontend and exercise navigation**

Use the repository's existing browser test/setup for lecturer LMS; check desktop and narrow viewport, expand a class, open Overview/Setup/Members/Assignments/Lab Authoring/Submissions/Results, and verify active state plus retained workspace query.

- [ ] **Step 3: Check the final diff**

Run: `git diff --check` and inspect only task-scoped frontend diffs. Confirm pre-existing WIP files remain unchanged and no API/permission files changed.

## Implementation Notes

- Keep query parsing tolerant of the class-only query parameters; do not infer workspace identity from labels or class titles.
- Do not change backend readiness, course publishing, grading, or submission behavior.
- The prior `/workspaces` wide-content variant in `MAVIS-Frontend/app/[screen]/page.tsx` is existing user WIP for the immediately preceding layout adjustment. Preserve it; do not include it in this feature unless a verified integration issue requires it.
