# Lab v2 Big Update — Theory, Quiz, Studio Live, Submission

**Date:** 2026-11-17
**Status:** Phase 1 and Phase 2 implemented; Phase 3–4 pending
**Scope:** Lecturer Lab authoring + student Lab + quiz authoring + Studio Live wiring + submission/grading v2.

## 1. Decisions locked with the product owner

1. **Sinh viên không nộp diagram/model.** C1–C3 chỉ là nội dung lý thuyết kèm repo mẫu. Submission mới gồm: lý thuyết/giải trình, Quiz evidence và Studio evidence (nếu Lab runtime).
2. **Quiz editor đầy đủ:** soạn tay, nhiều loại câu hỏi, explanation, question bank, import/export JSON/CSV, preview, versioning. **Ngưỡng đạt mặc định 80%**.
3. **Studio Live dùng thật:** giảng viên chạy session thật từ reference project trong Lab Authoring; sinh viên chạy session riêng ở Lab.
4. Không fake telemetry, receipt, quiz result, submission hay grading.
5. Legacy Labs vẫn chạy flow cũ; Lab mới dùng `LAB_V2`. Không phá dữ liệu đã nộp.

## 2. Current gaps (từ screenshot + code)

- Lab Info vẫn hiển thị **Required architecture views** (legacy diagram submission), trong khi flow mới không nộp diagram.
- Theory tab chỉ có “Add the first module” với một ô module title; không giải thích mục đích, không có lesson editor, không hiển thị repo mẫu/C1–C3, không preview.
- Quiz tab chỉ có dropdown Curriculum; không có soạn tay/import; `CourseQuizService` mặc định 70%; custom quiz API tồn tại nhưng frontend không dùng.
- Studio Live tab báo khóa khi chưa có source; `/studio` Live tab báo “No live Docker session selected” và nút “Prepare and start Live project” không mang project/session context.
- Submission composer/backend vẫn bắt buộc `modelVersionId`, `diagramVersionId`, diagram requirements và ảnh hưởng trực tiếp tới grading.

## 3. Target flow

### Lecturer
1. `/assignments` → **Create a Lab** → `/lab-authoring`.
2. **Lab information:** tên, mô tả/mục tiêu/tiêu chí, deadline, chọn **Theory + Quiz** hoặc **Theory + Quiz + Studio**. Không chọn diagram.
3. **Theory:** chọn/tạo module → lesson title + Markdown content + preview; card repo mẫu (commit, ZIP, snapshot); tab C1/C2/C3 read-only; lưu Course draft.
4. **Reference source:** import GitHub SHA/ZIP → analyze → pin model (giữ nguyên flow hiện tại).
5. **Quiz:** soạn tay hoặc import; preview; lưu draft; publish version; mặc định 80%.
6. **Studio Live:** guided 3 bước: pin source → configure runtime → start real session; Stop/Start/Scale; capture; Finish; **Freeze topology V34**.
7. **Check & publish:** checklist thật; publish Lab; preview như sinh viên.

### Student
1. Passkey → roadmap → Lab.
2. **Step 1:** đọc C1–C3/repo mẫu (read-only theory).
3. **Step 2:** đọc lesson Markdown → làm Quiz đạt ≥80%.
4. **Step 3/4 (nếu Lab Studio):** chạy runtime thật, Stop/Start/Scale, capture snapshot/receipt.
5. **Submit:** giải trình lý thuyết + Quiz evidence + Studio evidence; không chọn diagram/model.

### Lecturer grading
- Chấm từng section: theory answers và từng Studio snapshot (nếu có).
- Mọi section phải > 5.0/10; summary bắt buộc; pass → mở Lab kế tiếp.
- Legacy submission vẫn chấm theo snapshot cũ.

## 4. Compatibility strategy

Thêm `assignments.lab_mode`:
- `LEGACY_STATIC` (mặc định cho dữ liệu cũ): giữ submission/model/diagram hiện tại.
- `THEORY_STUDIO` (Lab mới): dùng flow mới, bỏ diagram requirements.
- `THEORY_ONLY` (không cần Studio): Quiz + theory; submission không cần runtime.

Không đổi hành vi Lab cũ. Feature flag/env `MAVIS_LAB_V2_ENABLED` chỉ bật UI/API v2 cho Lab mới; rollback bằng cách tắt flag.

## 5. Data and API changes

### Migration V36 — Lab mode + submission v2
- `assignments.lab_mode VARCHAR(32) NOT NULL DEFAULT 'LEGACY_STATIC'`.
- `submission_snapshots`:
  - `submission_mode VARCHAR(32) NOT NULL DEFAULT 'STATIC_EVIDENCE'`.
  - `theory_answers JSONB NULL`.
  - `studio_evidence JSONB NULL`.
  - Cho phép NULL `project_id`, `source_snapshot_id`, `model_version_id`, `diagram_version_id` cho submission v2.
- Backfill: mọi submission cũ `STATIC_EVIDENCE`; mọi assignment cũ `LEGACY_STATIC`.

### Migration V37 — Quiz authoring
- `course_quiz_drafts` (`assignment_id PK`, `lesson`, `pass_percent`, `questions JSONB`, `updated_at`).
- `quiz_question_bank` (`id`, `workspace_id`, `module_id NULL`, `question JSONB`, `created_at`, `updated_at`).
- Không đổi bảng `course_quizzes`; version đã publish vẫn bất biến.

### API
- `PUT /workspaces/{id}/course-labs/{assignmentId}/quiz/draft` — lưu nháp.
- `POST /.../quiz/publish` — publish từ draft; mặc định 80%.
- `GET /.../quiz/draft` — đọc nháp.
- `GET/POST/PUT/DELETE /workspaces/{id}/quiz-bank/questions` — bank.
- `POST /submissions` v2:
  ```json
  {
    "mode": "THEORY_STUDIO",
    "theorySections": [{ "sectionId": "...", "title": "...", "answer": "..." }],
    "studioSessionId": "...",
    "studioSnapshots": ["..."],
    "submissionNotes": "..."
  }
  ```
  Backend tự đóng băng Quiz evidence, Studio evidence, SHA-256 package digest.
- `GET /submissions/{id}/review` giữ shape; `snapshotGrades[]` dùng sectionId/Studio snapshotId.

## 6. Implementation phases

### Phase 1 — Lab info + Theory redesign (ship first)
**Files:** `lab-info-form.tsx`, `lab-theory-section.tsx`, `lab-authoring.tsx`, `assignment/screens.tsx`, `CourseOutline`, `MAVIS_Frontend/tests/lecturer-lms.browser.cjs`.
**Changes:**
- Bỏ toàn bộ “Required architecture views” khỏi Lab Info.
- Thêm lựa chọn `Theory + Quiz` / `Theory + Quiz + Studio`.
- Theory tab:
  - Empty state giải thích rõ: “Lesson + sample repo + C1–C3”.
  - Module selector + `Create module`.
  - Lesson title, Markdown body, live preview.
  - Card repo mẫu: commit/snapshot/revision + link ZIP.
  - Tabs C1/C2/C3 read-only từ reference model.
  - Publish Course version; nếu Course published thì yêu cầu draft mới.
- Không gửi `requiredDiagramTypes` cho Lab v2 (gửi `[]` để tương thích).
**Tests:**
- Static UI tests: không còn checkbox diagram; có Markdown preview, repo card, C1–C3.
- Browser fixture: Lab Info + Theory với Course draft/module/lesson.
- Typecheck/build.

### Phase 2 — Quiz authoring system
**Backend:** `CourseQuizService`, `CourseQuizController`, new `QuizBankService`, migrations V37, tests.
**Frontend:** new `quiz-builder.tsx`, `quiz-preview.tsx`, `quiz-import.ts`; update `lab-quiz-section.tsx`.
**Features:**
- Question types: `SINGLE_CHOICE`, `MULTI_CHOICE`, `TRUE_FALSE`.
- Fields: prompt, options, correct answer(s), explanation, points, tags.
- Add/edit/delete/duplicate/reorder; question bank import/export.
- Import/export JSON + CSV; validation report; preview.
- Draft → publish version; version history; fixed pass threshold default **80%**, editable 1–100.
- Backward-compatible decode for existing `questions` JSON.
- Quiz publish allowed once reference model is pinned; student gate still requires published Lab.
**Tests:**
- `CourseQuizServiceTest`: score multi-select, true/false, 80% default, stale version 409, idempotent attempts.
- Import parser unit tests.
- Browser fixture: add/import/preview/publish quiz.
- Existing WF02 tests updated for new types; legacy tests keep.

### Phase 3 — Submission/grading v2
**Backend:** `SubmissionServiceImpl`, `SubmissionReviewService`, `SubmissionResponseDTO`, new `LabSubmissionV2Service`, V36, tests.
**Frontend:** new `lab-submission-form.tsx`; `LabWorkspace` step 4; keep legacy `SubmissionComposer` for `LEGACY_STATIC`.
**Rules:**
- Theory answers required for each lesson section.
- Quiz evidence frozen from a PASSED attempt at current version.
- Studio evidence required only for `THEORY_STUDIO`.
- No diagram/model selection.
- SHA-256 evidence digest; immutable after submit.
- Grading per section > 5.0; summary required; progression auto-unlock unchanged.
**Tests:**
- V2 service/review tests; legacy V1 regression tests unchanged.
- HTTP acceptance: create Lab v2 → student submit theory+quiz → grade → unlock.
- Frontend browser fixture: student submission form without diagram controls.

### Phase 4 — Studio Live real authoring + standalone studio
**Frontend:** `lab-studio-section.tsx`, `studio-workbench.tsx`, `live-studio-workbench.tsx`, `runtime/screens.tsx`.
**Backend:** verify existing runtime/session APIs; add `returnTo`/context query handling only if needed.
**Changes:**
- Lab Authoring Studio:
  - If no source: card explains dependency with **Go to Source**.
  - If source: 3-step guided card (Pin source → Configure runtime → Start Live session).
  - Start session with `project`/`model`/`assignment` context; open `/studio?project=...&model=...&session=...&returnTo=...`.
  - After verified action, enable **Freeze topology**; freeze V34.
- `/studio`:
  - Require/select project; do not call `runtimeReadSessions {projectId:"*"}` without context.
  - “Prepare and start Live project” carries project/model.
  - Auto-select RUNNING session; if none, show start panel instead of all `UNAVAILABLE`.
  - Keep real capability matrix; no simulated controls.
**Verification:**
- Real Docker Runner test (`RuntimeStudioApiIntegrationTest#realManagedDotnetRunnerAndDockerFullStackStudioFlow`).
- Browser fixture with a running session and prepared topology.
- Production readiness: `/api/health/ready`, Runner credentials, Docker socket.

### Phase 5 — Docs, migration, staging
- Update `WF02_STATIC_QUIZ_C02.md`, `WF04_SUBMISSION_GRADING_C04.md`, `LECTURER_LAB_AUTHORING_UI.md`, handoff.
- Add V36/V37 probes to `apply-course-schema.py` and deploy tests.
- Staging two-account acceptance: create v2 Lab, student theory+quiz+Studio, grade, unlock.
- Rollback plan: schema additive; legacy mode remains.

## 7. Acceptance criteria

1. Lecturer creates a v2 Lab without choosing any diagram.
2. Theory tab shows lesson editor + Markdown preview + repo mẫu + C1–C3.
3. Quiz builder supports manual add, import CSV/JSON, preview, publish, version, default 80%.
4. Studio Live starts a real session from the reference project; Stop/Start/Scale works; freeze topology succeeds.
5. Student sees theory, repo, C1–C3, quiz gate 80%, Studio if configured.
6. Student submits theory + Quiz + Studio; no diagram/model selection; digest frozen.
7. Lecturer grades every section >5.0 + summary; Lab next unlocks.
8. Legacy Labs and submissions still work.
9. Real Docker + staging two-account verified.

## 8. Risks and open items

- **Backend contract conflict:** WF02/WF04 docs and acceptance tests assume diagram/model submission. V2 must keep legacy paths and add v2 tests; don't delete legacy code in the first release.
- **Quiz JSON compatibility:** existing `questions` rows have old shape; decode with defaults.
- **80% default:** existing quizzes keep their published threshold; new versions default 80. Decide whether to offer bulk republish; not silent.
- **Studio production:** real Docker/OTel depends on Runner/image/socket; if production lacks them, show honest blocked status, never fake.
- **Markdown renderer:** no Markdown library currently. Phase 1 may use a minimal safe renderer; if full GFM is required, add `react-markdown` + `remark-gfm` with review.
- **Attachments:** no file storage API for theory attachments; phase 1 supports links, not uploaded files.
- **Migration V36/V37:** must be applied before backend/frontend deploy; deploy script must verify probes.

## 9. Suggested delivery order

1. Phase 1 (UI quick wins + remove diagram gate) — smallest deployable.
2. Phase 2 (Quiz builder) — independent.
3. Phase 4 (Studio Live wiring) — independent of submission v2.
4. Phase 3 (Submission/grading v2) — largest, after UI/API stable.
5. Phase 5 docs/staging after each phase.
