# Lecturer LMS UI + Coursera Lab — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use `- [ ]` tracking. Do not commit: the user asked to keep changes local for review.

**Goal:** Refactor the lecturer experience into a class-centric LMS and a Coursera-style Lab workspace without changing MAVIS business contracts.

**Architecture:** Compose new shared shells/outline components around the existing Course Authoring, Course Setup, Quiz, Runtime and Submission screens. Source content from the published Course snapshot; keep the four Lab steps, Quiz Gate, runtime lifecycle and grading rules untouched. Add minimal Course Authoring edit/reorder endpoints for draft content only.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, TanStack Query, Tailwind, lucide-react; Spring Boot 3 / Java 21 for the small authoring API; existing Node test runner and Playwright fixture pattern.

**Spec:** `docs/superpowers/specs/2026-11-16-lecturer-lms-ui-design.md`

## Global Constraints

- Keep EN/VI labels and existing theme tokens; use `useLocale().t` as the existing screens do.
- Reuse existing components (`Button`, `Badge`, `DetailPanel`, `DataTable`, `RequestState`, etc.); add no dependency.
- Never fabricate completion, Quiz attempts, runtime sessions, telemetry, grades or readiness.
- Preserve four-step Lab semantics: static → quiz gate → runtime → Studio evidence → submit.
- Preserve V34 frozen topology and `> 5.0/10` per-snapshot grading.
- Keep all changes local; no commit, push, merge or deploy.
- Existing local changes from other agents must not be reverted.

## Review Focus

- A student opening a Lab whose module has no THEORY item must still see the Quiz lesson and gate.
- A lecturer preview must not create Quiz attempts, sessions or submissions.
- A class with zero modules/assignments must show an actionable empty state, not a fake outline.
- Switching class or Lab must not leak the previous class's modules, Lab or submissions.
- Locked steps must explain the actual backend condition (Quiz not passed / runtime not observed).

---

### Task 1: Class shell and compact class list

**Files:**
- Create `MAVIS-Frontend/src/features/courses/course-workspace-shell.tsx`
- Modify `MAVIS-Frontend/src/features/workspaces/manage.tsx` (`CreateWorkspace`)
- Modify `MAVIS-Frontend/src/features/workspaces/screens.tsx` (`Workspaces`, `WorkspaceOverview`, `WorkspaceMembers`)
- Modify `MAVIS-Frontend/src/features/submissions/screens.tsx` (`TeachingSubmissions`)
- Test `MAVIS-Frontend/tests/architecture.test.cjs`

**Interfaces:**
- `CourseWorkspaceShell({ workspace, active, children, actions? })` where `workspace` is the `workspaces` response row, `active` is `"content" | "members" | "submissions" | "results"`, `actions?: ReactNode`.
- Renders a compact header (code, name, status, role/member meta) and tab links preserving `?workspace=<id>`.

- [ ] Write static tests asserting: no `"Create a place for learning to take shape"` hero; `"Tạo lớp"` / `"Create class"` compact toggle; class rows include code/name/status; shell tabs `"Nội dung lớp"`, `"Thành viên"`, `"Bài nộp"`, `"Kết quả"`.
- [ ] Run `npm test` and confirm the new assertions fail.
- [ ] Implement the shell, compact create form and class list rows.
- [ ] Use the shell in `WorkspaceOverview`, `WorkspaceMembers` and teaching `Submissions`.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 2: Course outline and class content tabs

**Files:**
- Create `MAVIS-Frontend/src/features/courses/course-outline.tsx`
- Modify `MAVIS-Frontend/src/features/workspaces/screens.tsx` (`WorkspaceOverview`)
- Modify `MAVIS-Frontend/src/features/courses/course-builder.tsx` (export only; structure editor follows in Task 4)
- Test `MAVIS-Frontend/tests/course-learning-ui.test.cjs`

**Interfaces:**
- `CourseOutline({ workspaceId, canManage, active })` consumes `useCourseAuthoring(workspaceId)` and `useCourseRoadmap(workspaceId)` plus `assignments`.
- Module type: `{ id, title, description, position, items: OutlineItem[] }`; item type `{ id, type, title, description, assignmentId, required }`.
- Renders collapsible `<section>` per module, activity rows with icon + type label + status badge + action link.
- Lecturer content tab has secondary tabs `"Lộ trình" | "Soạn nội dung" | "Thiết lập"`.

- [ ] Write tests asserting module titles/activity types render from published data, empty state copy, and that `"Soạn nội dung"` mounts `CourseBuilder`.
- [ ] Run the focused tests; expect failure.
- [ ] Implement `CourseOutline`; prefer `published.data.snapshot.modules`, fall back to draft `course.data.modules`.
- [ ] In `WorkspaceOverview`, replace the KPI grid and long assignment table with the outline + setup aside; keep members/submissions tabs.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 3: Coursera-style Lab workspace

**Files:**
- Modify `MAVIS-Frontend/src/features/courses/screens.tsx` (`LabWorkspace`, `StepContent`)
- Create `MAVIS-Frontend/src/features/courses/lab-toc.tsx`
- Test `MAVIS-Frontend/tests/course-learning-ui.test.cjs`

**Interfaces:**
- `LabToc({ steps, activeStep, moduleItems, progress, preview })` renders the left table of contents, lock reasons and progress bar.
- `LabWorkspace` resolves `module = publishedModules.find(m => m.items.some(i => i.assignmentId === lab.id))`.
- Query param `preview=1` sets read-only preview; default for lecturers.
- Step 2 renders theory items from `module.items.filter(i => i.type === "THEORY")`, using `content.body`; Quiz remains the gate.

- [ ] Write tests asserting breadcrumb `Lớp → Module → Lab`, TOC labels, progress semantics, preview banner, and theory `body` rendering.
- [ ] Run focused tests; expect failure.
- [ ] Implement `LabToc`, breadcrumb, two-column layout, preview banner and theory rendering.
- [ ] Keep `displayedStep`, `runtimeReady`, `studioReady`, `submitHref` and step gating unchanged.
- [ ] Run `npm test`, `npm run typecheck`, `npm run test:routes`.

### Task 4: Course structure editor and Lab authoring tabs

**Files:**
- Modify `MAVIS-Frontend/src/features/courses/course-builder.tsx`
- Modify `MAVIS-Frontend/src/features/workspaces/course-access.tsx` (fix `startDraft` path; add update/move/delete hooks)
- Modify `MAVIS-Frontend/src/features/assignments/create.tsx` (add section tabs and return link)
- Test `MAVIS-Frontend/tests/course-learning-ui.test.cjs`

**Interfaces:**
- `useCourseAuthoring` gains `updateModule`, `moveModule`, `updateItem`, `moveItem`, `deleteItem` mutations.
- `startDraft` calls `POST workspaces/{workspaceId}/course/draft` (not `/draft/start`).
- Course Builder shows module title/description editing, item up/down, item edit and delete in a confirm menu.
- Theory item editor is a textarea bound to `content.body`; Essay item exposes prompt + rubric; Lab item exposes assignment select.

- [ ] Write tests asserting the `startDraft` path, structured theory editor (no raw JSON textarea for THEORY), and reorder controls.
- [ ] Run focused tests; expect failure.
- [ ] Implement hooks and UI.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 5: Minimal Course Authoring edit/reorder API

**Files:**
- Modify `MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/workspace/controller/CourseAuthoringController.java`
- Modify `MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/workspace/service/CourseAuthoringService.java`
- Modify `MAVIS-Platform/mavis-be/mavis-platform/src/test/java/com/mavis/platform/workspace/service/CourseAuthoringServiceTest.java`

**Interfaces:**
- `PUT /api/v1/workspaces/{id}/course/modules/{moduleId}` body `{title, description, prerequisiteModuleId}`.
- `PUT /api/v1/workspaces/{id}/course/modules/{moduleId}/items/{itemId}` body `ItemBody`.
- `DELETE /api/v1/workspaces/{id}/course/modules/{moduleId}/items/{itemId}`.
- `POST /api/v1/workspaces/{id}/course/modules/{moduleId}/items/{itemId}/move` body `{direction: "UP"|"DOWN"}`.
- Published/archived courses reject edits with `409`; unknown ids return `404`; positions stay unique per module.

- [ ] Write service tests for edit, up/down swap, delete renumbering and published-course rejection.
- [ ] Run `./mvnw.cmd -pl mavis-platform -am -Dtest=CourseAuthoringServiceTest test`; expect failure.
- [ ] Implement service/controller using temporary negative positions inside the transaction, then renumber.
- [ ] Run the focused Maven test; expect PASS.
- [ ] Run `npm test` and `npm run typecheck` after wiring the UI.

### Task 6: Submissions LMS filters and review navigation

**Files:**
- Modify `MAVIS-Frontend/src/features/submissions/screens.tsx`
- Modify `MAVIS-Frontend/src/features/submissions/grading.tsx` (back link only)
- Test `MAVIS-Frontend/tests/architecture.test.cjs`

**Interfaces:**
- `TeachingSubmissions` renders the class shell, assignment filter, status filter (`ALL | PENDING | RETURNED | GRADED`) and student search.
- Table columns: Submission, Student, Lab, Frozen model, Review, Outcome, Submitted, Action.
- Review page shows `← Quay lại bài nộp của lớp` preserving `?workspace=`.

- [ ] Write static tests for filters, columns and back link.
- [ ] Run focused tests; expect failure.
- [ ] Implement.
- [ ] Run `npm test` and `npm run typecheck`.

### Task 7: Verification and guide

**Files:**
- Create `MAVIS-Frontend/tests/lecturer-lms.browser.cjs` (fixture + screenshots)
- Create `docs/LECTURER_LAB_AUTHORING_UI.md`
- Modify `docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md` (only if verification changes its state)

- [ ] Run `npm run typecheck`, `npm test`, `npm run test:routes`.
- [ ] Run the browser fixture for the class hub and Lab workspace; capture `.artifacts/lecturer-lms/class-content.png` and `lab-coc.png`.
- [ ] Run the focused Maven authoring test.
- [ ] Write the lecturer authoring guide with the exact UI path and truthful limits.
- [ ] Report PASS / FAIL / environment-blocked items; do not commit.
