# Lecturer application architecture

The Lecturer frontend is split into two application scopes:

1. **Global Lecturer Workspace** (`/workspaces`)
   - managed course list, lifecycle status, search/filtering
   - global grading queue and course creation
2. **Course Workspace** (`?workspace=<id>`)
   - overview
   - course content and Labs
   - students
   - grades/submissions
   - settings

## Lifecycle rule

Course write access is decided only by `application/course-access-policy.ts`:

- `ACTIVE` -> published and read-only for curriculum/Lab content
- `INACTIVE` -> editable; students temporarily cannot access the Course
- `ARCHIVED` -> terminal legacy/archive state

Existing feature implementations remain in their current domain folders while
the migration is incremental. New Lecturer orchestration belongs in this
feature boundary; shared UI and API contracts stay outside it.
