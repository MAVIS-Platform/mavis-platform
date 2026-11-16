# MAVIS Project Handoff — 16/11/2026

Đây là điểm bắt đầu cho một agent chưa có ngữ cảnh. Đọc hết tài liệu này trước khi sửa code. Workspace chuẩn:

```text
C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform
```

Repo phụ (microservice seed cho Studio Live):

```text
C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-live-seed
https://github.com/MAVIS-Platform/mavis-studio-live-seed
```

## 1. Trạng thái bàn giao đã xác minh ngày 16/11/2026

- **Mốc production mới nhất trên `origin/main`: `9f26918`** (`fix(frontend): restore homepage layout and match themes`, PR #100, 16/11 20:25 +0700). Run **#360** "Build and deploy production" completed/success: https://github.com/MAVIS-Platform/mavis-platform/actions/runs/43875618501.
- Ngay trước đó `origin/main` có `72fca7f` (public homepage, PR #98) và `e1053e7` (refine homepage, PR #99). Cả ba commit chỉ chạm homepage/app shell/frontend tests, không đổi backend course/Runtime/Studio.
- Mốc đã xác minh V35 vẫn là `612836d` + run **#353** success: https://github.com/MAVIS-Platform/mavis-platform/actions/runs/43848625455. `183c849` (docs infra + thêm `CourseAuthoringServiceTest` vào CI) có run **#354** success: https://github.com/MAVIS-Platform/mavis-platform/actions/runs/43851965673. Log VPS xác nhận V35 schema already present và Deployment healthy đúng SHA; website và `/api/auth-config` trả HTTP 200 sau deploy.
- **`main` đã đồng bộ và push lên origin** ngày 16/11/2026: merge `origin/main` (homepage PR #98–#100) vào các commit lecturer UI; `git rev-list --left-right --count origin/main...HEAD` trả **0 0** sau push. Không force-push.
- Working tree chưa sạch: 3 test backend đang sửa (`RuntimeSetupControllerTest`, `CourseAccessServiceTest`, `CourseSetupServiceTest`) và mới có `docs/MAVIS_DEV_ENVIRONMENT_2026-11-16.md`, `scripts/bootstrap-dev-linux.sh`. Không dùng `git add .`; chỉ commit khi thuộc đúng task.
- Test mới `exposesConfigurationReadyWithoutVerifyingRunnerHealth` ghi nhận `RuntimeSetupController.runnerReady` hiện chỉ phản chiếu `ConfigurationView.ready()` (profile đủ điều kiện), **không** gọi health Runner thật. Đây là điểm cần chốt contract, xem mục 10.
- Lỗi #352 là probe V35 kiểm tra sai tên index; đã sửa theo unique constraint trong migration. Không kết luận thiếu SSH secret từ dòng retry chung. Đọc docs/DEPLOY_V35_CLAUDE_HANDOFF.md.
- Context vận hành đầy đủ ở docs/MAVIS_PROJECT_INFRA_CONTEXT_2026-11-16.md. Đọc cùng file này trước khi sửa Git, VPS, DB hoặc CI.
- Origin local đã chuyển sang HTTPS và bỏ core.sshCommand trỏ tới key /sessions đã mất. Fetch/push HTTPS hoạt động. Đây là cấu hình máy, không nằm trong commit.
- Seed repo local ở mavis-studio-live-seed, mốc kiểm tra be7df9b. Có Desktop - Shortcut.lnk chưa track từ trước; không thêm vào commit task này.

## 1b. Cập nhật refactor giao diện giảng viên (16/11/2026 tối)

- Giao diện lớp học dùng `CourseWorkspaceShell` + `CourseOutline`: danh sách lớp gọn, bốn tab Nội dung lớp / Thành viên / Bài nộp / Kết quả, và lộ trình module → activity.
- Course Builder soạn THEORY/ESSAY trực tiếp (không còn textarea JSON), thêm/sửa/sắp xếp/xóa activity trong bản nháp; API mới `PUT /course/modules/{id}`, `POST .../move`, `PUT/DELETE .../items/{id}`, `POST .../items/{id}/move`. Endpoint `startDraft` của frontend đã sửa từ `/course/draft/start` sang `/course/draft`.
- BFF `app/api/backend/[...path]/route.ts` đã export thêm `PUT/PATCH/DELETE`; trước đó proxy chỉ có `GET/POST` nên lưu nháp, sửa/xóa course item và chấm điểm bằng PUT/DELETE bị `405`.
- Lab Workspace theo bố cục Coursera: breadcrumb Lớp → Module → Lab, sidebar mục lục/tiến độ, lý thuyết lấy từ published Course snapshot, preview `preview=1` chỉ đọc (không tạo Quiz attempt/session/submission). Preview bỏ qua điều kiện roadmap `LOCKED`; `moveModule` giữ bất biến module tiên quyết đứng trước.
- `/assignments` được tách thành danh sách Lab gọn; **Create a Lab** mở `/lab-authoring` với sáu bước: Lab information → Theory → Reference source → Quiz → Studio Live → Check & publish. `CreateAssignment` cũ đã bị xóa khỏi flow; seed/course checklist nằm trong **Course tools** riêng.
- Lỗi production "Could not load class content" trên lớp chưa có Course draft đã sửa: `404` từ `/course` hoặc `/course/published` được coi là empty state, không phải lỗi tải.
- Trang giảng viên: `docs/LECTURER_LAB_AUTHORING_UI.md`. Screenshot fixture: `MAVIS-Frontend/tests/lecturer-lms.browser.cjs` và `.artifacts/lecturer-lms/{class-content,lab-coc,assignments,lab-authoring}.png`.
- Kiểm chứng trong phiên: frontend typecheck PASS, `npm test` **410/410**, build PASS, route smoke **44/44** trên server production port 3092, browser fixture PASS; backend `CourseAuthoringServiceTest` **14/14**, full `mavis-platform` + `mavis-common` **221 tests, 0 failure**. Chưa chạy real Docker Runner hay nghiệm thu hai tài khoản staging.
- Các thay đổi UI/backend trên đã commit và push lên `origin/main`; CI run #361 được kích hoạt cho merge commit `9296fcf`. Các file test backend đang sửa dở của agent khác và `docs/MAVIS_DEV_ENVIRONMENT_2026-11-16.md`, `scripts/bootstrap-dev-linux.sh` vẫn để ngoài commit.

## 2. Sản phẩm và phạm vi

MAVIS là nền tảng học kiến trúc microservices. Luồng chính:

1. Giảng viên tạo workspace/lớp, gắn curated repository và reference model.
2. Sinh viên nhập Passkey, làm Quiz Gate, mở Lab 4 bước.
3. Sinh viên phân tích tĩnh C1–C3, làm quiz, chạy Docker Runtime/Studio, chụp bằng chứng.
4. Sinh viên nộp gói bằng chứng; giảng viên chấm từng snapshot; Lab kế tiếp mở khi đạt.

MAVIS Studio có hai chế độ:

- **Sandbox**: mô phỏng, canvas 2D/3D, block library, scenario, telemetry giả, video cục bộ. Dùng để thử ý tưởng.
- **Live**: Docker thật, telemetry thật, stop/start/scale thật, snapshot/receipt thật. Chỉ bật các năng lực có backend/Runner thật; control mô phỏng bị disable kèm lý do.

Phần mở rộng **Prepared Live** đã được duyệt trong phiên làm việc, không phải nguyên văn Review 2:

- Block ánh xạ service đã ghim trong Compose/profile + confirmed mappings. Add = START, Remove = STOP.
- Dây ánh xạ route-controller thật trong call path. Connect = START controller, Disconnect = STOP.
- Chỉ block `canScale` mới được SCALE/Clone; tối đa 8 replica.
- `initiallyStopped` được stop sau readiness và trước baseline.
- Không có latency giả trong Live; dây cấu hình nét đứt, trace quan sát là lớp dữ liệu riêng.

## 3. Thứ tự đọc docs

Ultimate Docs mô tả scope gốc; phần mở rộng được duyệt được ghi riêng. Dùng trạng thái bàn giao mới nhất cho vận hành và xác minh lại bằng code/Git. Các tài liệu chính:

1. `docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md` (file này), cùng `docs/MAVIS_PROJECT_INFRA_CONTEXT_2026-11-16.md` về kiến trúc và hạ tầng.
2. `docs/MAVIS_STUDIO_DEEPSEEK_HANDOFF.md` — bối cảnh Studio Live cũ, vị trí code, test.
3. `docs/PREPARED_LIVE_STUDIO.md` — contract topology v1, route-controller, V34 freeze, readiness.
4. `docs/STUDIO_LIVE_PARITY.md` — ma trận REAL/PREPARED/OBSERVE/UNAVAILABLE.
5. `docs/MAVIS_STUDIO_RUNTIME.md` — API Studio, telemetry, snapshot, receipt, submission.
6. `docs/MAVIS_ULTIMATE_PROJECT_MASTER_CONTEXT.md` — BR-07/08, FR-EDU-03, FR-IMP-03/04, FR-RT-01/07, phần mở rộng cuối file.
7. `docs/WF01_COURSE_ACCESS.md` — passkey, publish Lab, roadmap, course-setup, freeze-topology.
8. `docs/WF02_STATIC_QUIZ_C02.md` — curated source, C1–C3, Quiz Gate.
9. `docs/WF03_RUNTIME_STUDIO_C03.md` — runtime plan/session/Studio/receipt.
10. `docs/WF04_SUBMISSION_GRADING_C04.md` — nộp bài, chấm từng snapshot, auto-unlock.
11. `docs/DEPENDABOT_REMEDIATION_2026-11-15.md` — dependency security history.
12. `docs/WF-01_CUSTOMER_HANDOFF_VI.md`, `docs/MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md` — lịch sử/nghiệm thu cũ, đối chiếu trước khi dùng.

## 4. Luồng giảng viên hiện tại

### 4.1 Tạo lớp và seed/import nguồn

- Tạo teaching workspace ở `/workspaces` (`CreateWorkspace`).
- Thêm thành viên ở `/members`.
- Vào `/roadmap?workspace=...` để thấy `CourseSetupPanel` mới.
- Nếu chưa có Lab, panel cho seed:
  - `STANDARD_DEMO`: 3 Lab;
  - `FULL_CURRICULUM`: 13 Lab.
- Có thể tạo Lab thủ công ở `/assignments`: `CreateAssignment` + `AssignmentSourcePicker` để import GitHub (commit SHA đầy đủ) hoặc ZIP và chạy phân tích.

### 4.2 Checklist Course Setup

Panel gọi:

```text
GET /api/v1/workspaces/{workspaceId}/course-setup
```

Trả:

- workspace status/course mode;
- reference project/model/snapshot + revision;
- runtime applications, `studioTopology`, revision;
- Labs và state (`READY`, `NEEDS_STUDIO`, `NEEDS_FREEZE`, `NEEDS_QUIZ`, `DRAFT`);
- quiz version;
- Passkey active/enrolled;
- các bước `workspace`, `reference`, `runtime`, `studio`, `labs`, `quiz`, `passkey`, `preview`;
- `nextAction` và `previewAssignmentId`.

UI nằm ở `MAVIS-Frontend/src/features/courses/course-setup.tsx`; mỗi bước còn thiếu link trực tiếp tới `/assignments`, `/runtime-config?project=...`, Passkey hoặc Lab preview. Trang Assignments có link “Course setup checklist” và link “Configure runtime & Studio Live”.

### 4.3 Runtime/Studio readiness

Panel gọi thêm:

```text
GET /api/v1/analyzer/projects/{projectId}/runtime-setup-readiness
```

Endpoint trả:

- `preflightCompatible`, `runnerReady`;
- `applications`, `mappings`, `detectedServices`;
- `runnerIssues`, `prerequisites`, `warnings`;
- `topology`.

Nếu `runnerReady=false`, bước Studio bị hạ xuống `ACTION` dù profile đã có topology. Đây là điểm quan trọng: không coi "đã lưu profile" là "chạy được".

### 4.4 Publish, quiz và Passkey

- Publish Lab: `POST /workspaces/{id}/course-labs/{assignmentId}/publish`.
- Publish quiz: `POST .../quiz` hoặc `.../quiz/curriculum` (CurriculumPublisher trên Assignments).
- Passkey: `POST /workspaces/{id}/course-passkey` (phần CoursePasskey trên Roadmap).
- Freeze topology: `POST /workspaces/{id}/course-labs/{assignmentId}/freeze-topology` (nút trên Assignments sau khi Lab publish).

## 5. Đóng băng topology (V34)

Đây là thay đổi quan trọng mới nhất:

- Migration `V34__Assignment_Studio_Topology_Snapshot.sql`:
  - `assignments.studio_topology_snapshot JSONB`;
  - `assignments.studio_topology_revision INTEGER`.
- Publish Lab copy `studioTopology` từ runtime profile của reference project nếu profile khớp đúng `source_snapshot_id` và `model_version_id`.
- `freeze-topology` copy lại sau khi giảng viên hoàn tất profile.
- `RuntimePlanningService.start` cho Guided Lab dùng frozen snapshot trước; chỉ fallback reference profile khi Lab chưa freeze (dữ liệu cũ).
- Vì vậy sửa reference profile sau freeze không làm đổi topology của Lab đã đóng băng.

Điểm cần nhớ: seeder publish Lab trước khi cấu hình runtime, nên các Lab seed có thể chưa frozen. Sau khi cấu hình runtime/Studio, giảng viên phải bấm **Freeze Studio topology** trên Assignments cho từng Lab cần runtime; checklist sẽ chuyển `nextAction` sang `freeze-topology`.

## 6. Luồng sinh viên

1. Nhập Passkey (`/courses` hoặc enrollment).
2. Roadmap: Lab 1 `UNLOCKED`, Lab sau `LOCKED` theo prerequisite.
3. Mở Lab 4 bước:
   - Step 1: curated source/static C1–C3.
   - Step 2: theory + Quiz Gate (`>= 70%` version hiện hành).
   - Step 3: Runtime/Studio.
   - Step 4: capture/Finish/receipt/submit.
4. Studio Live:
   - `/sessions?project=...&studio=1` hoặc `/studio` Live tab.
   - Start Interactive Studio session, chờ `RUNNING`, telemetry.
   - Add block = START; Remove = STOP; Connect/Disconnect route-controller; Clone/Scale 1..8; capture snapshot; Finish; cleanup.
5. Submit: composer ghép static snapshot + các Studio snapshot đã chụp; `evidencePackageDigest` SHA-256; receipt HMAC.
6. Lecturer chấm từng snapshot `0..10`; mọi snapshot phải `> 5.0`; summary bắt buộc; `PASSED` mở Lab kế tiếp, ngược lại `NEEDS_REVISION`.

Các rule bảo vệ:

- BR-07: preflight Compose, timeout ≤ 300s, replica 1..8.
- BR-08: cần OTel span thật + ít nhất một Stop/Start/Scale thật + Before/After + cleanup 0 orphan + receipt HMAC.
- BR-09: đủ 4 bước + snapshot giải trình; gói SHA-256 bất biến.
- BR-10: chấm từng snapshot, `> 5.0`, summary bắt buộc, auto-unlock Lab kế tiếp.

## 7. Code map

### Frontend

- `MAVIS-Frontend/src/features/courses/screens.tsx` — Courses, CourseRoadmap, LabWorkspace.
- `courses/course-setup.tsx` — checklist giảng viên, readiness, link freeze.
- `courses/course-quiz.tsx` — theory + quiz.
- `courses/curriculum.tsx` — curriculum publisher.
- `workspaces/course-access.tsx` — roadmap/passkey/publish/seed/freeze hooks.
- `assignments/screens.tsx`, `create.tsx`, `source-picker.tsx` — tạo Lab, gắn source, publish.
- `runtime/backend.tsx` — Runtime Configuration/Scenarios/Sessions.
- `runtime/studio-controls.tsx`, `live-studio-workbench.tsx` — Live workbench.
- `runtime/live-sandbox-parity.tsx`, `studio-live-capabilities.ts` — parity panel/state.
- `runtime/prepared-topology-editor.tsx`, `prepared-live-topology.tsx` — prepared topology authoring/rendering.
- `runtime/studio-observability.tsx`, `use-studio-session.ts` — canvas/telemetry/session commands.
- `submissions/composer.tsx`, `grading.tsx`, `frozen-artifacts.tsx` — nộp/chấm/bằng chứng.
- `lib/api/backend-path.ts`, `contracts.ts`, `java-operations.ts` — BFF allowlist và contract.
- `app/[screen]/page.tsx` — route `/roadmap`, `/assignments`, `/sessions`, `/studio`, `/lab`.
- `homepage/public-homepage.tsx`, `homepage/homepage.css`, `homepage/request-demo.tsx`, `app/page.tsx` — public homepage và CTA demo (PR #98–#100), không thuộc flow course.

### Backend

- `MAVIS-Platform/mavis-be/mavis-platform/.../workspace/service/`:
  - `CourseAccessService.java` — publish, freeze topology, passkey, roadmap.
  - `CourseSetupService.java` — checklist state.
  - `CourseLabSeederService.java` — seed reference/labs/quizzes.
  - `CourseQuizService.java` — versioned quiz.
  - `CourseProgressionService.java` — auto-unlock.
- `mavis-platform/.../workspace/controller/CourseAccessController.java` — course endpoints.
- `mavis-analyzer/.../runtime/service/RuntimePlanningService.java` — start session, copy topology, readiness config.
- `RuntimePlanningService.ConfigurationView` — preflight/profile view.
- `mavis-analyzer/.../runtime/service/PreparedStudioTopology.java` — topology validation/normalization.
- `mavis-analyzer/.../runtime/service/RuntimeStudioService.java` — state/actions/ack/telemetry/snapshot.
- `mavis-analyzer/.../runtime/controller/RuntimeStudioController.java` — Studio API.
- `mavis-analyzer/.../runtime/controller/RuntimeSetupController.java` — readiness API.
- `mavis-analyzer/.../runtime/service/impl/RuntimeSessionServiceImpl.java` — session create/dispatch, guided source/gate.
- `mavis-analyzer/.../runtime/service/impl/RunnerReceiptIngestServiceImpl.java` — receipt/HMAC.
- `mavis-platform/.../submission/service/impl/SubmissionServiceImpl.java` — freeze evidence/submission digest.
- `mavis-platform/.../submission/service/impl/SubmissionReviewService.java` — per-snapshot grading/unlock.
- `mavis-common/.../entity/Assignment.java` — `studioTopologySnapshot`, `studioTopologyRevision`.
- `mavis-common/.../entity/RuntimeSession.java` — `hasVerifiedStudioEvidence`.
- Migrations `V26..V35` ở `mavis-bootstrap/src/main/resources/db/migration/`.

### Runner

- `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs` — Docker actions, readiness, telemetry, cleanup.
- `ComposeOverrideBuilder.cs` — security/resource override, StudioTopology record.
- `RuntimeSessionLifecycle.cs` — prepare → readiness → baseline → commands → evidence → cleanup.
- `JavaRuntimeClient.cs` — poll/ack/telemetry/HMAC.
- `RunnerProgram.cs` — managed runner entry; `MAVIS_RUNNER_DEBUG=1` prints opt-in exceptions.
- `RuntimeDefinitionReader.cs` — run definition validation.
- `samples/runtime-poc/` — sample stack; `route-controller`; `Initialize-Poc.ps1`.
- `tests/MAVIS.Worker.Tests/Integration/ManagedDockerRuntimeTests.cs` — real Docker prepared test.
- `tests/.../StudioInfrastructureActionTests.cs` — action unit tests.

### Deploy

- `deploy/apply-course-schema.py` — V26..V35 probes.
- `deploy/deploy-vps.sh` — backup/apply V26..V35 then deploy.
- `deploy/tests/test_course_schema.py` — schema tests.
- `.github/workflows/deploy-production.yml` — verify, images, deploy.

### Seed repo

`MAVIS.Worker/samples/runtime-poc` is the local PoC. The public seed repo is separate:

- `orders`, `payment`, `orders-payment-route`.
- `topology.example.json`.
- `scripts/pin-images.sh`.
- README with the expected START/STOP/SCALE exercise.

## 8. Test commands

### Frontend

```bash
cd MAVIS-Frontend
npm run typecheck
npm test
npm run build
node tests/course-setup.browser.cjs
node tests/studio-ui.browser.cjs
node tests/studio-workbench.browser.cjs
```

### Backend unit/acceptance

```bash
cd MAVIS-Platform/mavis-be
./mvnw.cmd -pl mavis-platform -am test
./mvnw.cmd -pl mavis-analyzer -am test
./mvnw.cmd -pl mavis-bootstrap -am test \
  "-Dtest=Wf01AcceptanceMatrixTest,Wf02AcceptanceMatrixTest,Wf03AcceptanceMatrixTest,Wf04AcceptanceMatrixTest" \
  "-Dsurefire.failIfNoSpecifiedTests=false"
```

### PostgreSQL integration (isolated)

```bash
docker run -d --name mavis-ci-pg \
  -e POSTGRES_USER=mavis_ci \
  -e POSTGRES_PASSWORD=isolated_migration_ci_only \
  -e POSTGRES_DB=mavis_ci \
  -p 127.0.0.1:15438:5432 postgres:16
```

```bash
MAVEN_OPTS='-Duser.timezone=UTC' \
MAVIS_MIGRATION_TEST_JDBC_URL='jdbc:postgresql://127.0.0.1:15438/mavis_ci' \
MAVIS_MIGRATION_TEST_JDBC_USER='mavis_ci' \
MAVIS_MIGRATION_TEST_JDBC_PASSWORD='isolated_migration_ci_only' \
MAVIS_DB_URL='jdbc:postgresql://127.0.0.1:15438/mavis_ci' \
MAVIS_DB_USERNAME='mavis_ci' \
MAVIS_DB_PASSWORD='isolated_migration_ci_only' \
./mvnw.cmd -pl mavis-bootstrap -am \
  -Dtest=CourseHttpAcceptanceTest,MigrationUpgradeTest,CourseAccessPostgresTest,RuntimeStudioApiIntegrationTest \
  -DargLine='-Duser.timezone=UTC' \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

`-Duser.timezone=UTC` là cần thiết trên máy Windows có timezone `Asia/Saigon` khi PostgreSQL container không nhận alias đó.

### Real Docker + .NET Runner

Runner DLL trong `samples/runtime-poc/artifacts/runner-publish` phải được rebuild từ source hiện tại:

```bash
dotnet publish MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj -c Release \
  -o MAVIS.Worker/samples/runtime-poc/artifacts/runner-publish \
  --property:UseAppHost=false
```

Sau đó đặt `MAVIS_MANAGED_DOCKER_TEST_ROOT` tới absolute path `MAVIS.Worker/samples/runtime-poc` và chạy:

```bash
MAVIS_MANAGED_DOCKER_TEST_ROOT='C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform/MAVIS.Worker/samples/runtime-poc' \
... \
./mvnw.cmd -pl mavis-bootstrap -am \
  -Dtest=RuntimeStudioApiIntegrationTest#realManagedDotnetRunnerAndDockerFullStackStudioFlow \
  -DargLine='-Duser.timezone=UTC' \
  -Dsurefire.failIfNoSpecifiedTests=false test
```

Kết quả đã xác nhận ngày 16/11/2026: STOP payment 0%→100%, START 100%→0%, SCALE orders 1→2, snapshot before/after, HMAC receipt, submission, grading, unlock, cleanup `CONFIRMED`.

### Deploy schema

```bash
python -B -m unittest discover -s deploy/tests -p "test_*.py" -v
```

## 9. Bằng chứng test lịch sử và mốc deploy cập nhật

- Frontend: **400/400**, typecheck PASS, build PASS.
- Backend platform: **175/175**.
- Analyzer: `RuntimePlanningServiceTest` **24/24**, `RuntimeSetupControllerTest` **1/1**.
- WF acceptance: **120/120**.
- HTTP course flow: PASS, gồm `course-setup`, `freeze-topology`, quiz, submission, grading.
- PostgreSQL/migration/course-access: PASS.
- Full-stack MockMvc Studio: PASS.
- Real Docker + .NET Runner full-stack: PASS.
- Deploy schema tests trong task sửa V35: **9/9 PASS** khi chạy với PostgreSQL 18 thử riêng, gồm regression retry SSH.
- Run #353 tại 612836d đã success cả verify, images và deploy. Các số lượng test phần khác phía trên là báo cáo của phiên cũ; đối chiếu log CI nếu cần số hiện tại.
- Run #354 tại `183c849` success; CI regression list từ nay có `CourseAuthoringServiceTest`.
- Run #360 tại `9f26918` success cả verify, build image và deploy production — đây là mốc production hiện tại.
- Bằng chứng môi trường dev Linux 16/11/2026 (`docs/MAVIS_DEV_ENVIRONMENT_2026-11-16.md`): focused backend **35/35** (CourseAccess 5/5, CourseSetup 4/4, RuntimePlanning 24/24, RuntimeSetupController 2/2, đã gồm các test đang sửa trong working tree), `StudioInfrastructureActionTests` **7/7**, deploy unit **8** test (1 test PostgreSQL thật bị skip). Real Docker Runner **SKIPPED** vì container không có Docker CLI/socket — không tính là nghiệm thu Docker.

## 10. Khoảng trống và quyết định mở

1. **Staging/two-account acceptance**: chưa chạy UI thật bằng hai tài khoản trên staging. Local HTTP acceptance và real Docker test dùng tài khoản/tài nguyên tạo trong test.
2. **`runnerReady` semantics (ưu tiên)**: `RuntimeSetupController` trả `runnerReady = ConfigurationView.ready()`, tức chỉ là profile đủ điều kiện cấu hình; test mới `exposesConfigurationReadyWithoutVerifyingRunnerHealth` xác nhận controller không có Runner health client. Mục 4.3 lại coi `runnerReady=false` là "không chạy được". Cần tách `configurationReady` khỏi `runnerReady` thật hoặc gọi health Runner trước khi cho Lab vào trạng thái sẵn sàng.
3. **Deploy schema**: đã xác nhận qua V35 tại run #353/#354 và deploy homepage tại run #360. Nghiệm thu hai tài khoản và nghiệp vụ thực tế tiếp tục là hạng mục riêng.
4. **Theory artifact**: hiện theory là `course_quizzes.lesson` (text trong quiz), chưa phải Markdown document/version pin độc lập như FR-EDU-03 mô tả.
5. **Course creation wizard**: chưa có một wizard duy nhất từ tạo workspace → source → runtime/Studio → publish → quiz → passkey; hiện là các trang + checklist.
6. **Bulk publish/quiz**: Lab tự tạo vẫn publish/quiz từng Lab; seed thì một-click.
7. **Multiple reference projects**: checklist toàn cục vẫn lấy reference của Lab đầu tiên (test mới `multipleReferenceProjectsUseFirstLabReferenceForGlobalSummary` ghi nhận hành vi này); trạng thái từng Lab đúng nhưng `nextAction`/summary có thể bỏ sót reference khác.
8. **Quiz version đổi giữa phiên**: mỗi Studio action kiểm tra Quiz hiện hành; publish quiz version mới giữa phiên có thể khóa action tiếp theo. Cần quyết định policy.
9. **Runner DLL stale**: nếu sửa Runner, rebuild DLL trước real Docker test; lỗi generic “Input could not be processed” thường là definition/DLL lệch.
10. **.NET SDK**: `MAVIS.Worker/global.json` yêu cầu `10.0.403`; máy dev cũ có 10.0.204. Chạy `dotnet test` trong `MAVIS.Worker` có thể fail; real Docker test dùng DLL đã publish. CI dùng SDK theo global.json.
11. **Docker verification trong môi trường dev hiện tại**: container Linux không có Docker CLI/socket, nên real Docker Runner/managed-Docker tests SKIPPED; chỉ unit/acceptance chạy được. Cần máy có Docker Engine để xác minh lifecycle/OTel/cleanup trước khi tin kết quả nghiệm thu Studio.
12. **Tài liệu cũ**: `MAVIS_STUDIO_DEEPSEEK_HANDOFF.md` dòng “thay đổi local chưa track” đã cũ; code đã commit. `PREPARED_LIVE_STUDIO.md` từng ghi 22 test planning, thực tế hiện 24. Đối chiếu code trước khi tin số liệu cũ.

## 11. Kế hoạch nghiệm thu 99%

### Chuẩn bị

- Deploy cùng SHA backend/frontend/Runner; DB đã áp V34; Linux Docker Engine; OTel collector; Runner credential; `MAVIS_RUNTIME_ENVIRONMENT_KEY`; image digest-pinned.
- Curated repo đúng seed hoặc repo đã chuẩn bị; application + confirmed mappings; route-controller thật; readiness `/health`.
- Lab bắt buộc `requireRuntimeTrace=true`.
- Baseline phải PASS ngay cả khi dependency `initiallyStopped` (dùng expected 5xx hoặc `allowClientError`).

### Giảng viên

1. Tạo workspace, thêm member.
2. Seed/import reference, phân tích model.
3. Cấu hình runtime applications/mappings/images; lưu `studioTopology`.
4. Publish Lab; freeze topology cho Lab cần runtime.
5. Publish quiz; issue Passkey.
6. Kiểm tra `course-setup` chuyển `nextAction` đúng; mở Lab preview.

### Sinh viên

1. Redeem Passkey; roadmap Lab 1 mở, Lab 2 khóa.
2. Quiz <70% bị chặn; >=70% mở Runtime.
3. Tạo project từ reference snapshot; phân tích; mở Step 4.
4. Start Interactive Studio; kiểm tra frozen topology.
5. Add/remove block, connect/disconnect route, scale 1..8, capture Before/After.
6. Finish; nhận receipt HMAC; cleanup 0 orphan; submit.
7. Lecturer chấm từng snapshot; một snapshot <=5.0 → NEEDS_REVISION, Lab 2 khóa; sửa và nộp lại; all >5.0 + summary → PASSED, Lab 2 mở.
8. Ghi SHA, session/snapshot/receipt digest/signature, metric Before/After, cleanup, ảnh/log.

### Ca âm

- Student sửa topology → 403.
- SCALE non-canScale/controller/0/9 → 400.
- Cặp dây ngoài danh mục → không queue.
- Ack/receipt sai resourceProject/session → 409/400.
- Session sai source/model/reference → 400.
- Reload giữa phiên; cancel; timeout; cleanup.
- Quiz version đổi giữa phiên; multiple reference; missing mapping; failed action.

## 12. Quy tắc Git/commit

- Conventional Commits: `feat(scope):`, `fix(scope):`, `docs:`, `test(scope):`, `refactor(scope):`, `chore(scope):`.
- Merge commit cũng dùng subject Conventional, không dùng `Merge branch '...'` trần.
- Commit do Claude tạo dùng author `Claude <noreply@anthropic.com>` (liên kết GitHub `claude`) và kết thúc message bằng `Co-Authored-By: Claude Code <noreply@anthropic.com>`. Override theo từng commit bằng `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit ...`; không đổi `git config` global/repo. Commit tay của người dùng vẫn giữ identity `Nhwt <nhutlmao251@gmail.com>` (Nhwt666). Quy tắc cũ (gán mọi commit cho Nhwt666, không trailer Claude) đã được người dùng đổi ngày 16/11/2026.
- Branch: `feat/...`, `fix/...`, `test/...`, `chore/...`.
- Không push nếu người dùng chưa yêu cầu; không force-push rewrite lịch sử cũ nếu chưa xác nhận.

## 13. Prompt bàn giao

```text
Bạn tiếp quản MAVIS Studio Live và luồng course/lab của giảng viên.

Workspace: C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform
Repo phụ: C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-live-seed
Nhánh: main
Mốc production trên origin/main: 9f26918 (run #360 success). Mốc đã xác minh V35 trước đó: 612836d (run #353).
Local main có thể đang phân kỳ: HEAD b955718 chưa push và thiếu 3 commit homepage; chạy git rev-list --left-right --count origin/main...HEAD trước khi sửa.
Seed repo commit: be7df9b24342eea0f0f8eda9cdb15fb293f5656f

Đọc trước, theo thứ tự:
1. docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md
2. docs/MAVIS_STUDIO_DEEPSEEK_HANDOFF.md
3. docs/PREPARED_LIVE_STUDIO.md
4. docs/STUDIO_LIVE_PARITY.md
5. docs/MAVIS_STUDIO_RUNTIME.md
6. docs/WF01_COURSE_ACCESS.md
7. docs/WF02_STATIC_QUIZ_C02.md
8. docs/WF03_RUNTIME_STUDIO_C03.md
9. docs/WF04_SUBMISSION_GRADING_C04.md

Sau đó:
- chạy git status --short --branch, git log -1 --oneline, git ls-files --others --exclude-standard;
- kiểm tra CI run mới nhất; mốc #353 đã deploy thành công qua V35;
- chạy lại test liên quan trước khi sửa.

Mục tiêu:
- hoàn thiện flow giảng viên tạo course → reference source → runtime/Studio readiness → publish Lab → freeze topology → quiz → Passkey → sinh viên học/quiz/Studio/nộp → giảng viên chấm → mở Lab kế tiếp;
- giữ BR-07/BR-08, telemetry/receipt thật, không fake;
- không phá các contract session/source/model, idempotency, digest, HMAC, snapshot bất biến.

Quy tắc commit:
- Conventional Commits, merge subject Conventional;
- commit do Claude tạo: author `Claude <noreply@anthropic.com>`, trailer `Co-Authored-By: Claude Code <noreply@anthropic.com>`;
- commit tay của người dùng: identity Nhwt666.

Khi tài liệu và code khác nhau, chỉ rõ chỗ lệch và kiểm tra bằng test. Không sửa ngoài scope nếu chưa xác nhận.
```

## 14. Prompt dạy đọc docs (copy-paste)

Dùng prompt này khi giao dự án cho agent mới, hoặc dán vào đầu phiên để agent tự đọc đúng chỗ thay vì đọc tràn lan.

```text
Bạn là agent mới của MAVIS. Trước khi sửa code, hãy đọc tài liệu theo phương pháp sau.

Điểm bắt đầu duy nhất:
- docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md

Cách tìm tài liệu mới nhất:
- chạy `ls -lt --time-style=long-iso docs`
- đọc trạng thái bàn giao mới nhất và đối chiếu scope Ultimate Docs, sau đó mở tài liệu liên quan tới câu hỏi hiện tại.
- không đọc toàn bộ 80+ file docs theo thứ tự alphabet; dùng bản đồ dưới đây.

Thứ tự đọc theo lớp:
1. Bối cảnh sản phẩm và phạm vi
   - docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md
   - docs/MAVIS_ULTIMATE_PROJECT_MASTER_CONTEXT.md (BR-07/08, FR-EDU-03, FR-IMP-03/04, FR-RT-01/07, phần mở rộng cuối file)
2. Workflow contracts
   - docs/WF01_COURSE_ACCESS.md
   - docs/WF02_STATIC_QUIZ_C02.md
   - docs/WF03_RUNTIME_STUDIO_C03.md
   - docs/WF04_SUBMISSION_GRADING_C04.md
3. Studio Live và prepared topology
   - docs/PREPARED_LIVE_STUDIO.md
   - docs/STUDIO_LIVE_PARITY.md
   - docs/MAVIS_STUDIO_RUNTIME.md
   - docs/MAVIS_STUDIO_DEEPSEEK_HANDOFF.md (lịch sử, đối chiếu Git)
4. Lịch sử và bằng chứng cũ (chỉ đọc khi cần)
   - docs/MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md
   - docs/WF-01_CUSTOMER_HANDOFF_VI.md
   - docs/DEPENDABOT_REMEDIATION_2026-11-15.md
5. Code entry points (sau khi đã hiểu contract)
   - MAVIS-Frontend/src/features/courses/course-setup.tsx
   - MAVIS-Frontend/src/features/workspaces/course-access.tsx
   - MAVIS-Frontend/src/features/runtime/live-studio-workbench.tsx
   - MAVIS-Frontend/src/features/runtime/studio-controls.tsx
   - MAVIS-Platform/mavis-be/mavis-platform/.../workspace/service/CourseSetupService.java
   - MAVIS-Platform/mavis-be/mavis-platform/.../workspace/service/CourseAccessService.java
   - MAVIS-Platform/mavis-be/mavis-analyzer/.../runtime/service/RuntimePlanningService.java
   - MAVIS-Platform/mavis-be/mavis-analyzer/.../runtime/service/RuntimeStudioService.java
   - MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs
   - MAVIS.Worker/src/MAVIS.Runner/RuntimeSessionLifecycle.cs

Với mỗi tài liệu, ghi lại ngắn gọn:
- mục đích của tài liệu;
- quyết định/phạm vi đã chốt;
- contract/API/DB liên quan;
- invariant/giới hạn an toàn;
- open item hoặc chỗ tài liệu có thể đã cũ;
- file code thật cần đối chiếu.

Quy tắc đối chiếu:
- code + test + git log là nguồn sự thật cuối cùng; docs có thể cũ.
- nếu docs nói một đằng, code làm một nẻo: ghi rõ chỗ lệch, không tự chọn bên có lợi cho giả thuyết của mình.
- không suy ra topology, không bịa telemetry, không coi nút UI là bằng chứng.
- trước khi sửa: chạy `git status`, đọc diff, chạy test liên quan.
- sau khi đọc: tóm tắt 5–10 dòng gồm “đã hiểu gì”, “còn chưa chắc gì”, “sẽ kiểm tra bằng file/test nào”.

Khi được hỏi “nên đọc từ đâu”, trả lời đúng thứ tự:
1. handoff doc;
2. context hạ tầng và trạng thái bàn giao đã xác minh;
3. Ultimate context + WF01..WF04;
4. PREPARED_LIVE_STUDIO + STUDIO_LIVE_PARITY + MAVIS_STUDIO_RUNTIME;
5. code entry points;
6. test/deploy.

Không đọc hết docs nếu câu hỏi chỉ liên quan một workflow; đọc đúng lớp, đúng file, rồi mở code.
```

