# MAVIS E2E — báo cáo sáng 2026-11-17

## SHA / trạng thái
- Nhánh: `main`.
- Commit triển khai chính: **`5ba76f0`** — `feat(lab): add theory submission v2 with return and resubmit flow`.
- Baseline đầu phiên: `6c4bf1d`.
- GitHub Actions run `43959961856` cho `5ba76f0`: **completed success** (verify/images/deploy theo workflow hiện hành).
- Migration mới: **V38__Submission_V2_Lab_Mode.sql**.

## Đã hoàn thành trong lượt này
- Thêm discriminator `assignments.lab_mode`: `LEGACY`, `THEORY_QUIZ`, `THEORY_QUIZ_STUDIO`; mặc định LEGACY.
- Submission v2:
  - Student không gửi/chọn project, model version hay diagram.
  - Backend lấy reference model/source server-side, nhận `theoryAnswers`, lưu `theory_evidence` JSONB, tạo digest SHA-256.
  - Studio Lab yêu cầu runtime session thuộc chính student, đúng assignment/source/model và verified.
- UI Lab:
  - Form nộp giải trình inline, không có selector diagram/model.
  - Hiển thị bài đã nộp, digest và feedback RETURNED/GRADED.
  - Nút “Revise and resubmit” tạo submission mới.
- Grading/progression:
  - Review UI đọc được explanation và điểm từng section.
  - RETURNED → sửa/nộp lại → GRADED.
  - Mọi section >5.0 mới PASSED; kết quả ghi `course_lab_results`, Lab kế tiếp chuyển UNLOCKED.
- Hạ tầng deploy: V38 được đăng ký trong `apply-course-schema.py`, `deploy-vps.sh`, workflow và schema tests.

## Bằng chứng local mới
- Môi trường: Windows, Java 21/Maven 3.9.16, Node 24, PostgreSQL 16 container, backend + managed .NET Runner, Chrome Playwright.
- Lecturer `hoangnt@fpt.edu.vn`; workspace `a93d0eee-43db-41d6-89ee-8541d80739ed`.
- Lab1 `6b2951ab-1910-4b85-82f1-f900929951c2` (`THEORY_QUIZ`, published); Lab2 `0e0dc00d-9e28-4ea8-acea-bff90d5f15fa`.
- Student submission đầu: `0bfd6e4d-b6d1-4b11-8719-51afd75e6cc1`.
- Review RETURNED revision 1 với lý do; student resubmit `a666dcbd-b815-4b87-9578-1790b4488483`.
- Grade GRADED 90/100, snapshot `THEORY_THEORY = 9.0`; `course_lab_results.passed=true`; roadmap: Lab1 `PASSED`, Lab2 `UNLOCKED`.
- Review UI hiển thị nguyên văn giải trình “The orders service calls payment through the prepared route controller…”.
- Ảnh: `MAVIS-Frontend/.artifacts/e2e-local/{42-student-theory-submitted,60-review-v2}.png`.

## Lệnh và kết quả mới
- Frontend: `npm run typecheck` PASS; `npm test` **420 pass, 0 fail**; `npm run build` PASS.
- Backend focused: `SubmissionServiceImplTest,SubmissionReviewServiceTest,AssignmentServiceImplTest` **51 pass, 0 fail**.
- Migration: `MigrationUpgradeTest` **1 pass, 0 skip** trên PostgreSQL 16 port 15438 (đã chạy qua V38).
- Deploy schema: `python -B deploy/tests/test_course_schema.py` **9 OK, 1 skip** (skip PostgreSQL-only theo thiết kế).
- CI: run `43959961856` success cho đúng SHA `5ba76f0`.

## Artifact / dữ liệu
- Code: `SubmissionServiceImpl.java`, `SubmissionCreateRequest.java`, `SubmissionSnapshot.java`, `lab-submission-v2.tsx`, `validate-response.ts`, `V38__Submission_V2_Lab_Mode.sql`.
- Dữ liệu test nằm trong PostgreSQL container local port 55432; không phải dữ liệu production.
- Không đưa secret/token/mật khẩu vào báo cáo.

## Local / staging / production
- Local: đã PASS luồng theory-only tới unlock, gồm RETURNED/resubmit/GRADED.
- Staging/production: **chưa nghiệm thu** vì không có test account LECTURER/STUDENT. `maviss.site` chỉ được xác nhận login page 200; session chưa đăng nhập.
- T56: **BLOCKED** — thiếu credential test accounts; không tạo user SQL production và không bypass OTP.

## WIP giữ nguyên
Không stage: `course-outline.tsx`, `course-workspace-shell.tsx`, `lab-toc.tsx`, `submissions/screens.tsx`, `workspaces/screens.tsx`, `navigation.ts`, `tests/course-learning-ui.test.cjs`, fixture observed-sequence, ba backend test `RuntimeSetupControllerTest`, `CourseAccessServiceTest`, `CourseSetupServiceTest`, docs/bootstrap chưa tracked. `courses/screens.tsx` chỉ stage 6 hunk v2, phần còn lại vẫn unstaged.

## Còn thiếu / ba bước tiếp theo
1. **T35/T52 Studio v2**: chạy student Studio Lab thật (student session → STOP/START/SCALE → Finish → submit v2 → grade) để xác minh nhánh `THEORY_QUIZ_STUDIO`.
2. **T51/T57**: chạy full regression CI mở rộng và cập nhật docs nguồn sự thật; thêm test UI cho form v2/returned state.
3. **T56**: nhận test accounts qua cơ chế credential được cấp (không gửi mật khẩu chat), sau đó chạy full flow production trong không gian test và cleanup dữ liệu test.

## Rủi ro
- Studio v2 backend đã có guard nhưng Student Step 3 hiện chỉ mở assignment legacy, chưa có action tạo student runtime project/session. Vì vậy Studio Lab2 mới dừng ở runtime gate; chưa có student Studio submission thật.
- Draft grade/409 stale, Passkey expiry, cross-workspace negative cases chưa test.
- Local runner/docker chỉ chứng minh môi trường local, không chứng minh Runner production.
