# MAVIS E2E — báo cáo sáng 2026-11-17

## SHA / trạng thái
- Nhánh: `main`.
- Commit triển khai chính: **`5ba76f0`** (Submission v2) + **`3b55766`** (student Studio session/submission) + **`5972cd6`** (frozen topology T33) + **`50d0bb6`** (per-session Runner lock).
- Baseline đầu phiên: `6c4bf1d`.
- GitHub Actions: run `43959961856` cho `5ba76f0` success; run `44000347337` cho `3b55766` success.
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
- Studio student: session `45c2aee9-0403-44ac-96e8-9fa33795476c` (student6, assignment Lab2) STOP/START/SCALE payment 1→2, 2 snapshots, Finish `COMPLETED/PASSED/CONFIRMED`, receipt `sha256:a94f109029bc1…`.
- Frozen topology T33 (dataset mới `fe051171-8fc5-4209-bd88-93e30337be98`): teacher freeze revision 3 (`orders`/`payment`, payment `canScale=true`), sau đó reference profile đổi label thành `B-orders`.
- Hai student hoàn thành Lab1 hợp lệ; cùng nhận frozen A:
  - S1 project `069020da-6a75-434b-a680-dabd33dfa433`, session `7a5cac54-de0e-4965-919c-d41ca2407e50`, submission `dfcecae8-0f56-45cb-9e5b-d3cb9fcf9395`, receipt `sha256:4a6557ec5f8…`.
  - S2 project `195a18bc-0443-41b3-995a-575be003752d`, session `1bded760-4fe2-4f0a-a0a3-4ce33a10c89f`, submission `873e071b-66d5-4919-9047-1cc45ade3f39`, receipt `sha256:23649ab95c9…`.
- Hai session chạy đồng thời: STOP payment ở S1 chỉ làm mất `payment` của resource `6ebdd…`; SCALE payment S2 1→2 chỉ tạo `payment-1/2` của resource `b2635…`; teacher profile vẫn `B-orders`, frozen A vẫn `orders`.
- Grade cả hai submission 86.67, snapshot 9.0/8.5/8.5; `course_lab_results` cả hai Lab1+Lab2 passed.
- Runner lock fix `50d0bb6`: chuyển `runner.lock` toàn cục sang lock theo `mavisrun-*`, cho hai session local đồng thời; `RuntimeAllocationTests` 11 pass, 1 skip.
- Priority 2 mới: Passkey hết hạn trả HTTP 400 `INVALID_OR_EXPIRED_PASSKEY`; cross-workspace non-member trả 403; sửa title Lab sau nộp không đổi evidence digest/answer; draft/stale đã có unit test hiện hành.
- Negative: missing frozen topology và frozen chứa service ngoài scope bị từ chối; teacher session, sai student, sai assignment, sai workspace bị từ chối trong unit test.
- Studio submission `9deb7b8a-592c-4d09-85d3-a5d200c8b9bc` chứa theory + 2 Studio snapshots + receipt; grade `86.67`, các section 9.0/8.5/8.5; `course_lab_results` Lab2 passed=true.
- Review UI hiển thị Theory explanation và 2 Studio snapshot 9.00/8.50; evidence package `sha256:1d1f9854…`.
- Ảnh: `MAVIS-Frontend/.artifacts/e2e-local/{42-student-theory-submitted,52-student-studio-finished,60-review-v2}.png`.

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
1. **T33**: siết student session kế thừa frozen topology assignment và test negative teacher-session/cross-assignment.
2. **T51/T57**: chạy full regression CI mở rộng và cập nhật docs nguồn sự thật; thêm test UI cho form v2/returned state.
3. **T56**: nhận test accounts qua cơ chế credential được cấp (không gửi mật khẩu chat), sau đó chạy full flow production trong không gian test và cleanup dữ liệu test.

## Rủi ro
- Studio v2 functional flow và frozen topology inheritance đã PASS. Student dùng project/session riêng nhưng topology lấy từ assignment frozen; không dùng teacher session. Hai-student positive chưa chạy vì prerequisite; guard sai student đã unit-test.
- Draft grade/409 stale, Passkey expiry, cross-workspace negative cases chưa test.
- Local runner/docker chỉ chứng minh môi trường local, không chứng minh Runner production.
