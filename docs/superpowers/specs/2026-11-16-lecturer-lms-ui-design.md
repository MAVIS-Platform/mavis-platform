# Lecturer LMS UI + Coursera Lab — design

**Date:** 2026-11-16
**Scope:** MAVIS-Frontend lecturer experience; read-only reuse of existing backend contracts plus minimal Course Authoring CRUD.

## Intent

Give lecturers one class-centric LMS surface and one Lab workspace that reads like a course player, while preserving the four-step MAVIS Lab model, Quiz Gate, runtime readiness and frozen evidence.

## Goals

- Class list and class workspace with clear tabs: Content, Members, Submissions, Results.
- Module → activity outline with type labels and truthful status from existing APIs.
- Coursera-style Lab: breadcrumb, left table of contents, progress, lock reasons, previous/next, wide content column.
- Theory written in Course Builder is visible to students in the Lab step 2.
- Lecturer preview is explicitly read-only; it never creates Quiz attempts, runtime sessions or submissions.
- Course structure supports add, edit, reorder and publish for draft courses.

## Non-goals

- No new dashboard KPI wall, hero marketing panel, glow/gradient decoration.
- No change to four-step ordering, Quiz Gate, runtime lifecycle, V34 freeze or grading thresholds.
- No synthetic preview data, telemetry or success states.
- No new third-party dependency.

## Constraints

- Existing APIs are the source of truth. Class content comes from `GET /workspaces/{id}/course`, `/course/published`, assignments and course roadmap.
- Student-visible theory comes from the published Course version snapshot only.
- Lab step 2 keeps the versioned Quiz as the gate; lesson text remains the fallback when a module has no THEORY item.
- Lecturers may preview any Lab; students only open Labs allowed by the roadmap.
- Runtime readiness must distinguish profile eligibility from a real Runner health check. UI labels use what the API returns and do not upgrade it to "verified".
- User asked to keep changes local; no commit/push/deploy.

## Approaches considered

1. **Rewrite as new routes/components.** Best visual control, but duplicates working course, quiz, runtime and grading logic and risks contract drift.
2. **In-place composition (chosen).** Add a shared class shell and outline, refactor the existing screens and hooks, and reuse Course Builder, Course Setup, Quiz, Studio and Grading. Lower risk and reviewable in small diffs.
3. **Backend-first LMS model.** Would need a large schedule/gradebook schema not in V35; rejected because the spec says use actual backend capability.

## Decisions

- `CourseWorkspaceShell` owns the class header and tabs; `/workspace-overview`, `/members`, `/submissions` reuse it.
- `CourseOutline` merges the published Course version (preferred) or current draft with assignments and roadmap state. It never invents completion state for THEORY items.
- Lab table of contents is derived from the four steps plus the current Course module items. Locked steps explain the backend condition.
- Theory rendering searches the published snapshot for the module containing the current `assignmentId`, then renders `content.body` items.
- Lecturer preview (`preview=1`) renders the student view with a banner and disables mutation entry points.
- Course structure edit/reorder uses small new authoring endpoints; published versions remain immutable.

## Open items

- Real staging two-account acceptance is environment-blocked.
- Runtime `runnerReady` remains configuration eligibility in the current backend; the UI must not claim a Runner health check that does not exist.
