# MAVIS — Handoff báo cáo công việc (2026-11-17)

Tài liệu bàn giao cho phiên/đội tiếp theo. Không chứa mật khẩu, token, khóa hay nội dung `.env.production`.

## 1. Trạng thái repo

- Repo: `C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform`.
- Branch: `main`, upstream `origin/main`.
- HEAD: **`f9a5d13`** `docs: record fresh two-student frozen topology run`.
- Code chính đã push:
  - `5ba76f0` — Submission v2 (theory-only, return/resubmit, grading, unlock).
  - `3b55766` — student Studio session + submission flow.
  - `5972cd6` — student Studio bắt buộc frozen topology của assignment.
  - `50d0bb6` — Runner lock theo resource, cho hai session local chạy đồng thời.
- CI gần nhất:
  - `50d0bb6` → run `44023855917`: **completed success** (verify/images/deploy).
  - `f9a5d13` → run `44023886765`: **completed success**.
- Production: pipeline success; `https://maviss.site/login` trả 200. Chưa có nghiệm thu hai tài khoản production — xem mục 9.

### WIP phải giữ nguyên

Không commit các file sau vì thuộc agent khác/ngoài task:

- `MAVIS-Frontend/src/features/courses/course-outline.tsx`
- `MAVIS-Frontend/src/features/courses/course-workspace-shell.tsx`
- `MAVIS-Frontend/src/features/courses/lab-toc.tsx`
- `MAVIS-Frontend/src/features/submissions/screens.tsx`
- `MAVIS-Frontend/src/features/workspaces/screens.tsx`
- `MAVIS-Frontend/src/lib/navigation.ts`
- `MAVIS-Frontend/tests/course-learning-ui.test.cjs`
- `MAVIS-Frontend/tests/fixtures/observed-sequence-java-actual.json`
- `RuntimeSetupControllerTest.java`, `CourseAccessServiceTest.java`, `CourseSetupServiceTest.java`
- `docs/MAVIS_DEV_ENVIRONMENT_2026-11-16.md`, `scripts/bootstrap-dev-linux.sh`
- Các script E2E local đang untracked: `MAVIS-Frontend/scripts/e2e-local-studio.cjs`, `e2e-studio-action.cjs`, `e2e-student-studio-flow.cjs`, `e2e-review-check.cjs`.

`courses/screens.tsx` có WIP layout của agent khác; các hunk v2 của task này đã được stage chọn lọc, phần còn lại vẫn unstaged.

## 2. Phạm vi đã hoàn thiện

### Lab v2 và authoring

- `/assignments` là danh sách Lab; **Create a Lab** mở `/lab-authoring` sáu bước.
- Lab Info bỏ diagram/model, chọn **Theory + Quiz** hoặc **Theory + Quiz + Studio**.
- Theory: lesson Markdown + preview, sample repo, C1–C3 read-only, module/lesson CRUD.
- Reference source: GitHub SHA/ZIP, analyze, pin model; ZIP Windows separator đã sửa trong `ZipUtils`.
- Quiz Builder: single/multi/true-false, explanation/points, import/export JSON-CSV, question bank, versions; mặc định pass **80%**; `GET draft/versions` không dùng write lock.
- Studio authoring: visual prepared topology, giữ `assignment` xuyên suốt runtime config/scenarios/sessions, freeze gửi `sessionId`.

### Submission v2 và grading

- `assignments.lab_mode`: `LEGACY`, `THEORY_QUIZ`, `THEORY_QUIZ_STUDIO` (V38).
- Student nộp theory answer, không chọn project/model/diagram; backend lấy reference server-side.
- Studio Lab yêu cầu runtime session của chính student, đúng assignment/workspace/source.
- `submission_snapshots.theory_evidence` JSONB; `diagram_version_id` nullable.
- `student_snapshots` tái dùng cho grading: `THEORY_THEORY`, `STUDIO_<id>`.
- Review: draft riêng, RETURNED kèm lý do, resubmit tạo submission mới, GRADED; mọi section >5.0 mới PASSED và mở Lab kế tiếp.
- UI nộp inline trong Lab; hiển thị submitted, digest, return reason, điểm.

### Studio Live / Runner

- Giảng viên freeze topology A; student session dùng đúng frozen A, không fallback reference profile hiện tại.
- `PreparedStudioTopology` giữ blocks, connections/controllerService, `canScale`, `initiallyStopped`.
- `RuntimeStudioService` chặn action ngoài prepared block/controller, SCALE ngoài `canScale`, replica ngoài 1–8.
- Runner local trước đây dùng một `runner.lock` toàn cục làm session thứ hai exit code 2. Đã đổi sang lock theo resource `mavisrun-*` (`DockerComposeSession`, `SessionRecovery`).

## 3. Migration / deploy

- **V36** Quiz authoring (đã có).
- **V37** `runtime_sessions.assignment_id`.
- **V38** `assignments.lab_mode`, `submission_snapshots.theory_evidence`, `diagram_version_id` nullable.
- V38 đã đăng ký trong `deploy/apply-course-schema.py`, `deploy/deploy-vps.sh`, `.github/workflows/deploy-production.yml`, `deploy/tests/test_course_schema.py`.

## 4. Bằng chứng E2E local mới

### Dataset mới, không sửa bài PASSED cũ

- Workspace: `fe051171-8fc5-4209-bd88-93e30337be98`.
- Lab1: `3b0393c0-90b6-4ad7-a3fb-b98268d3143e`.
- Lab2 Studio: `65d91d1a-0187-495b-8f51-143780159606`.
- Frozen topology revision **3**, label `orders`, payment `canScale=true`.
- Teacher runtime profile sau freeze đổi label thành **`B-orders`**.
- Hai student đều hoàn thành Lab1 bằng flow hợp lệ.

### Hai student chạy đồng thời

| | S1 | S2 |
|---|---|---|
| Project | `069020da-6a75-434b-a680-dabd33dfa433` | `195a18bc-0443-41b3-995a-575be003752d` |
| Session | `7a5cac54-de0e-4965-919c-d41ca2407e50` | `1bded760-4fe2-4f0a-a0a3-4ce33a10c89f` |
| Receipt | `sha256:4a6557ec5f8ffae158cb24ab82f72b32695651cd4aea1bdd2cf3dba8cab8efd8` | `sha256:23649ab95c98e542e1e29cae12113ddcc29f11a0bfc15414b094947aff6a1aec` |
| Submission | `dfcecae8-0f56-45cb-9e5b-d3cb9fcf9395` | `873e071b-66d5-4919-9047-1cc45ade3f39` |

- Cả hai nhận frozen A (`orders`), không nhận `B-orders`.
- STOP payment S1 chỉ ảnh hưởng container S1; S2 vẫn đủ container.
- SCALE payment S2 1→2 chỉ tạo `payment-2` của S2; S1 không đổi.
- Teacher profile vẫn `B-orders`; assignment frozen vẫn revision 3 label `orders`.
- Cả hai Finish `COMPLETED/CONFIRMED`; grade **86.67 PASSED**; `course_lab_results` cả hai Lab1+Lab2 `passed=true`.

### Bằng chứng cũ vẫn giữ để tham chiếu

- Session `335ed1eb-b2a8-4597-9399-a2304884ec53` (STOP/START/SCALE teacher, receipt `sha256:6fb1d01b…`).
- Submission `9deb7b8a-592c-4d09-85d3-a5d200c8b9bc` (Studio v2, grade 86.67).
- Không dùng các bản ghi này thay cho dataset mới ở trên.

## 5. Test / CI đã chạy (Cập nhật cuối 17/11/2026 sau khi hoàn tất T09/T10/T36/T38/T41/T42/T45/T46/T51/T57–T60)

- Frontend (sau `npm ci` đồng bộ Zod `4.6.7`, Next.js `15.5.29`): `npm run typecheck` PASS; `npm test` **427/427 pass, 0 fail**; `npm run test:connected` **3/3 pass**; `test:three-e-ui`, `test:course-setup`, `test:lecturer-lms` PASS; `npm run build` PASS.
- Backend (non-Postgres local CI subset):
  - `mavis-common`: **23/23 PASS** (`AccessPolicyServiceImplTest` 16, `GitHubRepositoryUrlsTest` 2, `ZipUtilsTest` 5).
  - `mavis-platform`: **163/163 PASS** (bao gồm `CourseAccessServiceTest` 7/7 cho `T09`, `CourseSetupServiceTest` 4/4 cho `T10`, `SubmissionServiceImplTest` 32/32 cho `T36`/`T45`/`T46`, `SubmissionReviewServiceTest` 8/8, `CourseAuthoringServiceTest` 14/14, `CourseQuizServiceTest` 9/9, `QuizBankServiceTest` 2/2, `AssignmentServiceImplTest` 15/15).
  - `mavis-analyzer`: **240/240 PASS** (bao gồm `RuntimePlanningServiceTest` 25/25, `PreparedStudioTopologyTest` 4/4, `RuntimeSetupControllerTest` 1/1).
  - `mavis-bootstrap`: **147 executed PASS + 6 conditional Postgres skips** (`0` fail, `0` error; gồm 120/120 `Wf01`..`Wf04`). Tổng **573/573 executed PASS**.
  - Lưu ý môi trường: Docker Desktop daemon không chạy trên máy cục bộ trong lượt cuối này nên `RuntimeStudioApiIntegrationTest` (`3` test `@SpringBootTest`) và `6` lớp Postgres (`CourseHttpAcceptanceTest` đã bổ sung `checkSubmissionV2Flow`, `MigrationUpgradeTest` v.v.) chạy trong container PostgreSQL của GitHub Actions `verify`.
- Worker: **246 pass, 5 skip** Linux/Docker (`251` tổng, `0` fail, `7 s`).
- Deploy schema: **8 OK, 1 skip** PostgreSQL-only (`9` tổng, `0.281s`).
- Đã đăng ký thêm `CourseSetupServiceTest`, `QuizBankServiceTest`, `PreparedStudioTopologyTest`, `RuntimeSetupControllerTest`, `ZipUtilsTest` vào `.github/workflows/deploy-production.yml`.

## 6. Đã hoàn thiện thêm ở lượt chốt 17/11/2026

- **T09 (`CourseAccessService` + `CourseAccessServiceTest`):** Re-publish Lab đã có `studioTopologySnapshot` không ghi đè lại snapshot/revision đã đóng băng cho tới khi giảng viên gọi rõ `freezeTopology`; kiểm thử negative/positive cho model/source mismatch và unverified session.
- **T10 (`CourseSetupService` + `CourseSetupServiceTest`):** Tổng hợp readiness qua mọi Lab & reference project (`selectPrimaryReference` chỉ đúng reference còn thiếu runtime/topology thay vì dừng ở reference đầu tiên).
- **T36 / T45 / T46 (`SubmissionServiceImplTest` + `CourseHttpAcceptanceTest#checkSubmissionV2Flow`):** Bổ sung unit test & HTTP acceptance test cho Submission v2 (`THEORY_QUIZ` không diagram), return/resubmit, `DRAFT` privacy, cross-workspace `403`, và bất biến digest/evidence khi sửa tiêu đề Lab hoặc publish Quiz v2.
- **T38 / T41 / T42 (`lab-submission-v2.tsx`, `frozen-artifacts.tsx`, `grading.tsx`, `course-learning-ui.test.cjs`):** Cô lập nháp giải trình trong `localStorage` theo `(userId, workspaceId, assignmentId)` & xóa sau khi nộp; `FrozenArtifacts` render gói v2 không diagram; `GradeForm` hiển thị `writtenExplanation` của từng Snapshot trên thẻ chấm và giữ nháp đang nhập khi gặp refresh revision (`409`).

## 7. Cách chạy local

DB test local: container `mavis-e2e-db`, PostgreSQL 16, port `55432`, DB/user `mavis`; mật khẩu test chỉ dùng local, không ghi vào repo.

Backend (ví dụ, thay key bằng secret local):

```bash
cd mavis-platform
export DOTNET_ROOT="$HOME/.local/opt/mavis/dotnet"
export PATH="$DOTNET_ROOT:$PATH"
MAVIS_DB_URL='jdbc:postgresql://127.0.0.1:55432/mavis' \
MAVIS_DB_USERNAME=mavis \
MAVIS_DB_PASSWORD='<local-test-password>' \
MAVIS_RUNTIME_ENVIRONMENT_KEY='<local-key>' \
MAVIS_RUNNER_SERVICE_KEY='<local-runner-key>' \
MAVIS_RUNNER_STATE_ROOT='<repo>/.e2e-runner-state' \
MAVIS_RUNNER_PROJECT_PATH='<repo>/MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj' \
MAVIS_RUNNER_COLLECTOR_CONFIG='<repo>/MAVIS.Worker/samples/runtime-poc/collector.yaml' \
java -Duser.timezone=UTC -jar MAVIS-Platform/mavis-be/mavis-bootstrap/target/mavis-bootstrap-0.0.1-SNAPSHOT.jar
```

Frontend:

```bash
cd MAVIS-Frontend
MAVIS_API_MODE=backend MAVIS_JAVA_URL=http://127.0.0.1:8080 \
MAVIS_BACKEND_URL=http://127.0.0.1:8080 \
npm run start -- --hostname 127.0.0.1 --port 3000
```

Tài khoản local dùng để test: lecturer `hoangnt@fpt.edu.vn`; student `trietlmse181979@fpt.edu.vn`, `student2@fpt.edu.vn`, `student6@fpt.edu.vn`. Mật khẩu local test do người bàn giao giữ, không đưa vào repo/docs.

## 8. File/code chính cần đọc

- Authoring: `MAVIS-Frontend/src/features/assignments/lab-authoring.tsx`, `lab-info-form.tsx`, `lab-theory-section.tsx`, `quiz-builder.tsx`, `lab-studio-section.tsx`.
- Student: `MAVIS-Frontend/src/features/courses/screens.tsx`, `lab-submission-v2.tsx`, `course-quiz.tsx`, `submissions/grading.tsx`, `frozen-artifacts.tsx`.
- Backend submission: `SubmissionServiceImpl.java`, `SubmissionReviewService.java`, `SubmissionCreateRequest.java`, `SubmissionSnapshot.java`, `SubmissionResponseDTO.java`.
- Backend runtime: `RuntimePlanningService.java`, `PreparedStudioTopology.java`, `RuntimeStudioService.java`, `RuntimeRunnerDispatcher.java`.
- Runner: `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs`, `SessionRecovery.cs`.
- Migration: `V38__Submission_V2_Lab_Mode.sql`.
- Progress/report: `docs/superpowers/plans/2026-11-17-mavis-e2e-overnight-progress.md`, `docs/MAVIS_E2E_MORNING_REPORT_2026-11-17.md`.

## 9. Blocker / việc tiếp theo

1. **T56 — BLOCKED:** chưa có test accounts LECTURER/STUDENT production. Không tạo user SQL production, không bypass OTP. Cần cấp credential qua cơ chế an toàn rồi chạy full flow production trong class test riêng.
2. Production chưa được nghiệm thu bằng hai tài khoản thật; HTTP 200 chỉ là smoke.
3. WIP UI giao diện sinh viên từ lượt trước đã được agent dọn và hợp nhất lên `main` (`0859d50d`, `7bddd59b`); chỉ giữ lại tại local các script E2E helper untracked nếu chưa dọn (`e2e-local-studio.cjs`, v.v.).
4. Theo dõi run GitHub Actions cho commit chốt vừa đẩy để xác nhận `CourseHttpAcceptanceTest` (gồm `checkSubmissionV2Flow`) và `RuntimeStudioApiIntegrationTest` PASS trên container PostgreSQL CI.
