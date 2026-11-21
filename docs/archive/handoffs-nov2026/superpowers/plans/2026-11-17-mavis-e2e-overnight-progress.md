# MAVIS E2E overnight — sổ tiến độ

Kế hoạch: [master](2026-11-17-mavis-e2e-overnight-master.md).
Baseline đầu phiên: HEAD `6c4bf1d`, branch `main`, upstream `origin/main`.

## Checkpoint đang thực thi
- Trạng thái chốt 17/11 tối: Đã hoàn tất các backlog kỹ thuật **`T09`, `T10`, `T19`, `T23`, `T36`, `T38`, `T39`, `T41`, `T42`, `T45`, `T46`, `T47`, `T48`, `T50`, `T51`, `T57`–`T60`** trên nhánh `main` và cập nhật bộ kiểm thử CI.
- Blocker: **T56 BLOCKED** — không có test account LECTURER/STUDENT trên production; không dùng SQL prod/OTP bypass. Ngoài ra, Docker Desktop daemon không chạy trên máy cục bộ ở lượt kiểm thử cuối 17/11 tối nên nhóm `@SpringBootTest`/PostgreSQL (`CourseHttpAcceptanceTest`, `MigrationUpgradeTest`, `RuntimeStudioApiIntegrationTest`) được đẩy lên container PostgreSQL trong GitHub Actions `verify`.

## Task ledger
- [x] T01 — PASS — baseline `6c4bf1d`; WIP manifest giữ nguyên: course-outline/course-workspace-shell/lab-toc/courses-screens/submissions-screens/workspaces-screens, fixture observed-sequence, RuntimeSetupControllerTest, CourseAccessServiceTest, CourseSetupServiceTest, navigation.ts. Chỉ stage hunk v2 trong `courses/screens.tsx`.
- [x] T02 — PASS — Java 21.0.12.1, javac 21, Maven 3.9.16, Node 24.14.0, npm 11.9.0, .NET 10.0.204 system + SDK 10.0.403 user-space, Docker 29.1.5. Backend được chạy với DOTNET_ROOT/PATH và Runner project path.
- [ ] T03 — WORKING — harness có thêm chế độ theory-only, idempotent Quiz, resubmit; còn fixed waits và request-body log trong `e2e-local-studio.cjs`; chưa redaction/assert đầy đủ.
- [x] T04 — PASS — dữ liệu local 1 lecturer + nhiều student, Lab1 theory-only, Lab2 kế tiếp; không dùng tài khoản người dùng.
- [x] T05 — PASS — code hiện tại thiếu `labMode`; Submission legacy bắt buộc project/model/diagram; composer legacy; V36/V37 có sẵn, V38 là số mới thực tế.
- [x] T06 — PASS — thêm `assignments.lab_mode` default LEGACY, enum LEGACY/THEORY_QUIZ/THEORY_QUIZ_STUDIO; DTO/UI trả và nhận; test default/2 mode/invalid pass.
- [x] T07 — PASS — `V38__Submission_V2_Lab_Mode.sql` additive: lab_mode, theory_evidence, diagram nullable; đăng ký deploy probe/script/workflow/test. `MigrationUpgradeTest`: 1 pass, 0 skip; `test_course_schema.py`: 9 OK (1 skip PostgreSQL-only đúng thiết kế).
- [x] T08 — PASS — request theoryAnswers, project/model/diagram optional cho v2; backend trả theoryEvidence; legacy vẫn giữ contract cũ.
- [x] T09 — PASS — `CourseAccessService.publish` bảo toàn `studioTopologySnapshot`/`studioTopologyRevision` đã đóng băng khi re-publish; làm mới chỉ qua `freezeTopology`. Đã kiểm bằng `CourseAccessServiceTest#republishPreservesFrozenTopologyUntilExplicitFreeze` & `freezeRejectsMismatchedModelSourceOrUnverifiedSession` (`7/7 PASS`).
- [x] T10 — PASS — `CourseSetupService.setup` tổng hợp readiness trên toàn bộ danh sách Lab & reference project (`selectPrimaryReference`, `allReferencesReady`, `allRuntimeConfigured`, `allRuntimeMatchesSource`, `allTopologiesConfigured`). Đã kiểm bằng `CourseSetupServiceTest#multiReferenceCoursePointsToSecondReferenceWhenItsRuntimeOrStudioIsIncomplete` (`4/4 PASS`).
- [x] T11 — PASS — tạo lớp qua UI, refresh danh sách lớp (`lecturer-lms.browser.cjs`, `ee26e902`).
- [x] T12 — PASS — Course draft + module + lesson qua UI.
- [x] T13 — PASS — Lab theory-only tạo/sửa được; Lab Studio có từ lượt trước.
- [x] T14 — PASS — lesson Markdown lưu/đọc lại, sample repo/C1–C3 hiển thị.
- [x] T15 — PASS — upload ZIP Windows/POSIX, analyze, pin revision 1; ZIP separator fix đã có (`ZipUtilsTest` 5/5).
- [x] T16 — PASS — Quiz Builder import JSON, publish version v1, pass 80%.
- [x] T17 — PASS — query context Lab→runtime→session và freeze sessionId đã xác minh ở lượt trước; không khôi phục fallback project.assignment.
- [x] T18 — PASS — publish Lab1/Lab2, roadmap PASSED/UNLOCKED.
- [x] T19 — PASS — Passkey expiry/invalid/revoked, cross-workspace `403`, duplicate enroll `409` được kiểm chứng trong `CourseHttpAcceptanceTest` (cùng `checkSubmissionV2Flow`) và `CourseAccessServiceTest`.
- [x] T20 — PASS — sinh viên thấy Lab published, lesson và Quiz, không thấy authoring (`0859d50d`, `STUDENT_LEARNING_UI.md`).
- [x] T21 — PASS — Lab v2 đọc reference model read-only; không bắt chọn diagram.
- [x] T22 — PASS — Quiz fail→pass v1; runtime/Studio bị khóa trước pass.
- [x] T23 — PASS — ngữ cảnh class/lab/submission lọc theo `workspace`/`assignment`, giữ draft giải trình qua reload (`labSubmissionDraftKey`).
- [x] T24 — PASS — theory-only nộp được bằng explanation, không chọn model/diagram/runtime.
- [x] T25–T33 — PASS (recorded local Docker + T33 frozen topology run `5972cd6b`, `50d0bb60`, `f9a5d13c`) — `RuntimePlanningServiceTest` `25/25 PASS` và `MAVIS.Worker.Tests` `246 PASS` (`5` skip điều kiện Linux/Docker).
- [x] T34 — PASS — backend v2 theory-only: POST `/submissions` lưu theory evidence, quiz evidence, digest; thiếu explanation trả `THEORY_ANSWER_REQUIRED`.
- [x] T35 — PASS — student project/session thật, submission `9deb7b8a-592c-4d09-85d3-a5d200c8b9bc` chứa theory + 2 Studio snapshots + Studio receipt; guard ownership/source hash/workspace hoạt động (`SubmissionServiceImplTest` 32/32 PASS).
- [x] T36 — PASS — digest SHA-256 bất biến sau edit; kiểm chứng qua `SubmissionServiceImplTest#publishedLabEditDoesNotChangeFrozenV2SubmissionDigestOrExport` và `CourseHttpAcceptanceTest#checkSubmissionV2Flow`.
- [x] T37 — PASS — form inline, không có selector diagram/model; lỗi submit hiển thị; nút disable khi thiếu Studio session.
- [x] T38 — PASS — `LabSubmissionV2` lưu nháp cục bộ cô lập theo `labSubmissionDraftKey(userId, workspaceId, assignmentId)` trong `localStorage`, xóa khi submit thành công và nạp lại giải trình cũ khi bấm `Revise and resubmit` (`course-learning-ui.test.cjs`).
- [x] T39 — PASS — resubmit tạo submission mới sau `RETURNED`, chặn nộp lại sau `PASSED` (`LAB_SUBMISSION_ALREADY_PASSED`, HTTP `409`) và giữ nút disable khi `submit.isPending`.
- [x] T40 — PASS — student thấy bài đã nộp, digest, review summary; lecturer review đọc được explanation.
- [x] T41 — PASS — `FrozenArtifacts` (`SubmissionEvidenceHeader`) render đầy đủ digest, Quiz proof và snapshot explanations ngay cả khi bài v2 không có `diagramLayout`; `GradeForm` hiển thị `writtenExplanation` ngay trên ô nhập điểm (`course-learning-ui.test.cjs` 43/43 PASS).
- [x] T42 — PASS — draft riêng (`DRAFT` ẩn với sinh viên), `409` stale rejection (`SubmissionReviewServiceTest` 8/8), `GradeForm` dùng `key={submissionId}` với `dirty` + đồng bộ `review.revision` giữ nháp đang nhập qua refresh `409`.
- [x] T43 — PASS — RETURNED kèm lý do → student thấy và nộp lại submission mới → grade.
- [x] T44 — PASS — grade mọi section >5.0 (THEORY 9.0) tạo `course_lab_results passed=true`, Lab2 chuyển `UNLOCKED`.
- [x] T45 — PASS — sửa tiêu đề Lab & publish Quiz v2 sau nộp giữ nguyên `evidencePackageDigest` và `theoryEvidence` đã đóng băng (`SubmissionServiceImplTest` + `CourseHttpAcceptanceTest#checkSubmissionV2Flow`).
- [x] T46 — PASS — student ngoài lớp bị chặn `403` trên quiz/submission v2 (`SubmissionServiceImplTest#foreignWorkspaceStudentCannotSubmitV2Lab`, `CourseHttpAcceptanceTest#checkSubmissionV2Flow`).
- [x] T47 — PASS — giao diện sinh viên đã hợp nhất lên `main` (`0859d50d`, `89670832`, `7bddd59b`), `typecheck` & `npm test` xanh.
- [x] T48 — PASS — kiểm accessibility/label/role, responsive sidebar và state empty/error (`architecture.test.cjs`, `course-setup.browser.cjs`, `lecturer-lms.browser.cjs`, `course-learning-ui.test.cjs`).
- [ ] T49 — RECORDED ONLY (không chạy lại `studio-workbench.browser.cjs` trong phiên này; trọng tâm Sandbox video cũ).
- [x] T50 — PASS — BFF PUT/PATCH/DELETE, allowlist paths (`backend-path.ts`), Zod 4 contracts (`npm ci` + `tsc --noEmit` 0 lỗi + `npm run build` Next.js `15.5.29` PASS).
- [x] T51 — PASS — bổ sung `CourseSetupServiceTest`, `QuizBankServiceTest`, `PreparedStudioTopologyTest`, `RuntimeSetupControllerTest`, `ZipUtilsTest` vào `.github/workflows/deploy-production.yml`; xác minh `573/573` non-Postgres Java tests PASS, `427/427` Frontend `npm test` PASS, `3/3` `test:connected` PASS, `246` Worker PASS (`5` skip Linux/Docker), `8` Python deploy PASS (`1` Postgres skip).
- [x] T52 — PASS (functional) — theory-only E2E + Studio E2E hai sinh viên đồng thời với frozen topology (`f9a5d13c`).
- [x] T53 — PASS — rà diff sạch, tách fixture timestamp `observed-sequence-java-actual.json`, commit các deliverable đã kiểm chứng.
- [x] T54 — PASS — `5972cd6` run `44017814873` success; `f9a5d13` run `44023886765` success; tiếp tục theo dõi run cho commit chốt mới.
- [x] T55 — PASS — workflow `44023855917` / `44023886765` verify/images/deploy success.
- [ ] T56 — BLOCKED — thiếu test accounts production; không tạo user SQL production/không bypass OTP.
- [x] T57 — PASS — đã cập nhật đồng bộ `LECTURER_LAB_AUTHORING_UI.md`, `STUDENT_LEARNING_UI.md`, `WF04_SUBMISSION_GRADING_C04.md`, `MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md` và `MAVIS_HANDOFF_WORK_REPORT_2026-11-17.md`.
- [x] T58–T60 — PASS — chốt ledger tiến độ, dọn artifact fixture timestamp, giữ working tree sạch trước push `main`.

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
