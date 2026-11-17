# MAVIS E2E overnight — sổ tiến độ

Kế hoạch: [master](2026-11-17-mavis-e2e-overnight-master.md).
Baseline đầu phiên: HEAD `6c4bf1d`, branch `main`, upstream `origin/main`.

## Checkpoint đang thực thi
- Task tiếp theo: **T57/T60**; Priority 2 còn lại chỉ là chạy/tham chiếu test draft/stale hiện có; Passkey expired, cross-workspace HTTP, published-edit immutability đã kiểm mới.
- Branch/SHA thực tế: `main` / commit task `5ba76f0`; baseline `6c4bf1d`.
- Môi trường: local Windows, PostgreSQL 16 container port 55432, backend jar + managed .NET Runner, frontend port 3000, Chrome Playwright.
- Actor/dataset: lecturer `hoangnt@fpt.edu.vn`; students `trietlmse181979`, `student2`…`student6`; workspace `a93d0eee-43db-41d6-89ee-8541d80739ed`; Lab1 `6b2951ab-1910-4b85-82f1-f900929951c2` (THEORY_QUIZ, published Lab1); Lab2 `0e0dc00d-9e28-4ea8-acea-bff90d5f15fa` (published Lab2); submission S6 `a666dcbd-b815-4b87-9578-1790b4488483`.
- Process/tài nguyên thử đang giữ: backend/frontend đã dừng; container `mavis-e2e-db` (55432) giữ dữ liệu local cho phiên sau; `mavis-mig-db` đã xóa; không còn container `mavisrun-*`.
- Blocker: **T56 BLOCKED** — không có test account LECTURER/STUDENT trên production; không dùng SQL prod/OTP bypass.

## Task ledger
- [x] T01 — PASS — baseline `6c4bf1d`; WIP manifest giữ nguyên: course-outline/course-workspace-shell/lab-toc/courses-screens/submissions-screens/workspaces-screens, fixture observed-sequence, RuntimeSetupControllerTest, CourseAccessServiceTest, CourseSetupServiceTest, navigation.ts. Chỉ stage hunk v2 trong `courses/screens.tsx`.
- [x] T02 — PASS — Java 21.0.12.1, javac 21, Maven 3.9.16, Node 24.14.0, npm 11.9.0, .NET 10.0.204 system + SDK 10.0.403 user-space, Docker 29.1.5. Backend được chạy với DOTNET_ROOT/PATH và Runner project path.
- [ ] T03 — WORKING — harness có thêm chế độ theory-only, idempotent Quiz, resubmit; còn fixed waits và request-body log trong `e2e-local-studio.cjs`; chưa redaction/assert đầy đủ.
- [x] T04 — PASS — dữ liệu local 1 lecturer + nhiều student, Lab1 theory-only, Lab2 kế tiếp; không dùng tài khoản người dùng.
- [x] T05 — PASS — code hiện tại thiếu `labMode`; Submission legacy bắt buộc project/model/diagram; composer legacy; V36/V37 có sẵn, V38 là số mới thực tế.
- [x] T06 — PASS — thêm `assignments.lab_mode` default LEGACY, enum LEGACY/THEORY_QUIZ/THEORY_QUIZ_STUDIO; DTO/UI trả và nhận; test default/2 mode/invalid pass.
- [x] T07 — PASS — `V38__Submission_V2_Lab_Mode.sql` additive: lab_mode, theory_evidence, diagram nullable; đăng ký deploy probe/script/workflow/test. `MigrationUpgradeTest`: 1 pass, 0 skip; `test_course_schema.py`: 9 OK (1 skip PostgreSQL-only đúng thiết kế).
- [x] T08 — PASS — request theoryAnswers, project/model/diagram optional cho v2; backend trả theoryEvidence; legacy vẫn giữ contract cũ.
- [ ] T09 — TODO — publish/freeze semantics chưa chỉnh trong lượt này.
- [ ] T10 — TODO — readiness nhiều reference chưa chỉnh.
- [x] T11 — PASS — tạo lớp qua UI, refresh danh sách lớp.
- [x] T12 — PASS — Course draft + module + lesson qua UI.
- [x] T13 — PASS — Lab theory-only tạo/sửa được; Lab Studio có từ lượt trước.
- [x] T14 — PASS — lesson Markdown lưu/đọc lại, sample repo/C1–C3 hiển thị.
- [x] T15 — PASS — upload ZIP Windows/POSIX, analyze, pin revision 1; ZIP separator fix đã có.
- [x] T16 — PASS — Quiz Builder import JSON, publish version v1, pass 80%.
- [x] T17 — PASS — query context Lab→runtime→session và freeze sessionId đã xác minh ở lượt trước; không khôi phục fallback project.assignment.
- [x] T18 — PASS — publish Lab1/Lab2, roadmap PASSED/UNLOCKED.
- [ ] T19 — WORKING — thêm member qua API; Passkey/expiry/negative case chưa test.
- [x] T20 — PASS — sinh viên thấy Lab published, lesson và Quiz, không thấy authoring.
- [x] T21 — PASS — Lab v2 đọc reference model read-only; không bắt chọn diagram.
- [x] T22 — PASS — Quiz fail→pass v1; runtime/Studio bị khóa trước pass.
- [ ] T23 — WORKING — reload/deep link mới kiểm tra một phần.
- [x] T24 — PASS — theory-only nộp được bằng explanation, không chọn model/diagram/runtime.
- [ ] T25–T33 — WORKING — chưa chạy lại toàn bộ Studio student path trong lượt này; bằng chứng Runner/Docker cũ chỉ là lịch sử, không dùng thay run mới.
- [x] T34 — PASS — backend v2 theory-only: POST `/submissions` lưu theory evidence, quiz evidence, digest; thiếu explanation trả `THEORY_ANSWER_REQUIRED`.
- [x] T35 — PASS — student project/session thật, submission `9deb7b8a-592c-4d09-85d3-a5d200c8b9bc` chứa theory + 2 Studio snapshots + Studio receipt; guard ownership/source hash/workspace hoạt động.
- [x] T36 — PASS — digest SHA-256 của assignment/mode/source/quiz/theory/studio/notes; response trả theoryEvidence và snapshot THEORY.
- [x] T37 — PASS — form inline, không có selector diagram/model; lỗi submit hiển thị; nút disable khi thiếu Studio session.
- [ ] T38 — WORKING — chưa có draft autosave; resubmit toggle giữ nội dung trong phiên.
- [ ] T39 — WORKING — resubmit tạo submission mới; chưa test concurrent/idempotency mạng.
- [x] T40 — PASS — student thấy bài đã nộp, digest, review summary; lecturer review đọc được explanation.
- [x] T41 — PASS — review UI hiển thị Theory explanation, 90/100, snapshot grade THEORY_THEORY.
- [ ] T42 — WORKING — publish grade pass; draft grade + 409 stale chưa test UI.
- [x] T43 — PASS — RETURNED kèm lý do → student thấy và nộp lại submission mới → grade.
- [x] T44 — PASS — grade mọi section >5.0 (THEORY 9.0) tạo `course_lab_results passed=true`, Lab2 chuyển `UNLOCKED`.
- [ ] T45 — TODO — sửa Course/Quiz version sau publish chưa test.
- [ ] T46 — TODO — negative cross-workspace/role chưa test.
- [ ] T47 — WORKING — WIP UI sinh viên giữ nguyên, chưa hoàn thiện.
- [ ] T48–T50 — TODO/partial — chưa chạy a11y/snapshot/route boundary đầy đủ.
- [x] T51 — PASS — typecheck PASS, frontend 420 pass, backend focused 37+46 pass, migration 1 pass; CI run `44000347337` cho `3b55766` success.
- [x] T52 — PASS (functional) — theory-only E2E tới unlock; Studio E2E student thật: Quiz → own session → STOP/START/SCALE → 2 snapshots → Finish COMPLETED/PASSED/CONFIRMED → submit v2 → grade 86.67, mọi section >5. Còn thiếu kế thừa frozen topology (T33).
- [x] T53 — PASS — commit `5ba76f0` chỉ gồm backend/schema/contracts/UI v2/deploy; WIP khác giữ ngoài stage.
- [x] T54 — PASS — `5972cd6` run `44017814873` success; `75b1d0b` run `44017843290` success; runner-lock fix `50d0bb6` đã push, chờ run mới.
- [x] T55 — PASS — workflow `44000347337` verify/images/deploy success; production login page 200 (không phải nghiệm thu tài khoản).
- [ ] T56 — BLOCKED — thiếu test accounts production; không tạo user SQL production/không bypass OTP.
- [ ] T57 — WORKING — đã tạo báo cáo sáng `docs/MAVIS_E2E_MORNING_REPORT_2026-11-17.md`; docs handoff gốc chưa cập nhật v2.
- [ ] T58–T60 — WORKING — report đã viết; đã dừng process và xóa mig-db/temp; giữ DB local có dữ liệu Lab1/Lab2 cho phiên sau. Cần chốt ledger cuối.

## Nhật ký bằng chứng theo task
- T01: `git status --short --branch` main...origin/main; SHA `6c4bf1d`.
- T06/T08: `AssignmentServiceImplTest` 15/15; `SubmissionServiceImplTest` 29/29.
- T07: `MigrationUpgradeTest` 1/1 pass trên PostgreSQL 15438 (không skip); `deploy/tests/test_course_schema.py` 9 OK, 1 skip PostgreSQL-only.
- T34/T37/T43/T44: local web UI — S6 Quiz pass, submit `0bfd6e4d`; PUT review RETURNED rev1; resubmit `a666dcbd`; PUT review GRADED 90 với snapshot `THEORY_THEORY=9`; `course_lab_results` passed=true; roadmap Lab1 `PASSED`, Lab2 `UNLOCKED`.
- T41: `/submissions/a666dcbd-...` hiển thị `Theory explanation`, answer “The orders service calls payment…”, `90 / 100`, summary.
- Frontend: `npm run typecheck` PASS; `npm test` 420 pass, 0 fail; `npm run build` PASS.
- Backend focused: `SubmissionServiceImplTest,SubmissionReviewServiceTest,AssignmentServiceImplTest` 51 pass, 0 fail.
- Commit: `5ba76f0` pushed to `origin/main`.

## Bảo toàn WIP
Không stage: `course-outline.tsx`, `course-workspace-shell.tsx`, `lab-toc.tsx`, `submissions/screens.tsx`, `workspaces/screens.tsx`, `navigation.ts`, `tests/course-learning-ui.test.cjs`, fixture `observed-sequence-java-actual.json`, `RuntimeSetupControllerTest`, `CourseAccessServiceTest`, `CourseSetupServiceTest`, docs/bootstrap chưa tracked. `courses/screens.tsx` chỉ stage đúng 6 hunk v2; phần còn lại vẫn unstaged.

## Quyết định/khác biệt contract
- Discriminator chọn `assignments.lab_mode` (LEGACY/THEORY_QUIZ/THEORY_QUIZ_STUDIO), additive và default LEGACY.
- Lab v2 dùng reference model/project server-side; student không gửi project/model/diagram. `diagram_version_id` nullable; `theory_evidence` JSONB.
- Grading tái dùng `snapshotGrades`; theory answer sinh `THEORY_THEORY`, Studio sinh `STUDIO_<id>`; mọi section phải >5.0.
- `validateResponse` bỏ ràng buộc model/snapshot id khi request v2 không có các id đó; legacy giữ nguyên.
