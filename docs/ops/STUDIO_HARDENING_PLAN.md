# MAVIS Studio Live — Kế hoạch thi công Hardening (4 Batch)

> **Đối tượng đọc:** agent thực thi (Gemini 4 Neon) và người duyệt.
> **Baseline:** `main` @ `2b84cf38`. Mọi số dòng `~Lnnn` tính tại commit này. Số dòng có thể lệch, nên **luôn grep anchor ghi kèm** trước khi sửa.
> **Mục tiêu vận hành:** hệ thống ổn định; sau khi nâng hạ tầng thì chạy được **≤ 10 phiên Studio đồng thời**. **Không** nhắm tới 30–50 phiên.
> **Quy tắc chung cho agent:**
> - Mỗi thay đổi phải nhỏ nhất mà vẫn đủ. Không thêm abstraction, option hay config "để sau".
> - File CRLF phải giữ nguyên CRLF. Nếu tool edit lỗi thì dùng PowerShell `[IO.File]::ReadAllText/WriteAllText`.
> - **Không sửa file `.docx`.** Không push giữa chừng một Batch (push lên `main` sẽ tự deploy production).

---

## 1. Phạm vi & Non-Goals (khóa chống vẽ thêm)

### 1.1 ĐƯỢC làm
| Batch | Nội dung |
|---|---|
| 1 | Bảo mật, quyền, chặn mất dữ liệu: lọc env cho Runner, chặn SV ghi runtime-config, enforce `allowedActions` ở server, sửa Author Mode làm rơi cấu hình Change Impact, deploy không giết phiên đang chạy |
| 2 | Dọn bẫy UX Studio và nối màn chấm: tự mở Prediction, khóa Finish khi 0 snapshot, đồng bộ nút Light/Dark + sửa Pause/Resume, xóa mẫu hồ sơ + điểm preview, sửa link "Open Studio Canvas", hiển thị `exerciseEvaluation` (dạng gợi ý) ở màn chấm |
| 3 | Tài nguyên và hàng đợi: profile mặc định nhỏ hơn, Scale 1..3, ảnh snapshot ≤ ~330 KB, giãn chu kỳ `docker cp` và readiness poll, reaper quét cả `QUEUED`, heartbeat theo tab đang hiển thị, cấu hình `maxQueued` |
| 4 | Tách Runner VM, an toàn vận hành: Runner tự đủ trên VM riêng (3 lỗ của `WorkerPoolLoop`), backup DB định kỳ, load test 10 phiên (cổng Go/No-Go), runbook |

### 1.2 KHÔNG làm (agent gặp các việc này thì dừng lại hỏi, không tự làm)
- Không PA3 / Local Runner trên máy SV. Không "Shared Warm Observe Stack".
- Không 1-Click AI onboarding / tự sinh payload POST. Không bảng 3 cột Static vs Runtime.
- Không auto-grade 60–70% điểm. `exerciseEvaluation` chỉ hiển thị **gợi ý**, không ghi vào điểm.
- Không chuyển snapshot sang S3/Object Storage. Không viết lại đường truyền trace sang OTLP/HTTP.
- **Không ép gVisor đợt này.** Không đổi `MAVIS_RUNNER_OCI_RUNTIME`.
- **Không xóa 3D view.** Không xóa theme hay tính năng kéo/resize panel. Không xóa mock Studio `/administration/studio` (để backlog), chỉ bỏ link trỏ tới nó.
- Không đổi TTL 300s (`RuntimeSessionLifecycle.cs`, `ComposeOverrideBuilder.cs`, N5).
- Không bỏ HMAC / SHA-256 receipt ở backend.
- Không đổi số lượng test case cam kết trong BM04 (§8: 108/56).
- Không thêm dependency mới (npm / Maven / NuGet). Riêng Task 4.7 nằm ở **repo khóa học riêng** và là tùy chọn.

### 1.3 Sự thật đã kiểm chứng (đọc kỹ trước khi làm)
| # | Sự thật | Bằng chứng |
|---|---|---|
| F1 | **Không có backup DB định kỳ.** DB là PostgreSQL **bên ngoài** (`MAVIS_DB_URL`, bắt buộc `sslmode=require`). `pg_dump` chỉ chạy **một lần trước mỗi migration** (bỏ qua nếu schema đã `ready`). Hiện V26–V46 đã áp dụng hết nên các lần deploy **không còn backup nào**. | `deploy/apply-course-schema.py` `connection()` ~L302-322, `PostgresClient.backup()` ~L349-360, `prepare()` ~L372-383; `deploy/deploy-vps.sh` ~L107-234 |
| F2 | **Lỗi Pause/Resume thực chất nằm ở LIGHT mode, Dark chỉ sai một nửa.** Runner đếm container `paused` là **không chạy**: `ReadServiceState` đếm riêng `paused`; telemetry `ReadAllServiceStatesAsync` chỉ đếm `running`. Sau PAUSE thì `runningReplicas = 0`. **Light** (~L4446-4452): `selStopped = selRunning === 0` → `true`, và `selPaused` đòi `!selStopped` → luôn `false`. Hệ quả: **Resume bị disable sau Pause**, pill hiện Stopped, nút Start lại bật. **Dark** (~L5239): Resume bật khi `running === 0`, nên chạy được với service paused, **nhưng cũng bật với service đã STOP** (gửi RESUME → action FAILED, không làm chết phiên). | `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs` ~L578-597, ~L599-620, ~L495-497; `MAVIS-Frontend/src/features/runtime/live-studio-workbench.tsx` ~L267, ~L4446-4557, ~L5225-5244 |
| F3 | **Repo lớp `.NET` (`github.com/MAVIS-Platform/eshop-bookstore-dotnet-microservices` @ `5034bea`) không có Circuit Breaker / Retry / Polly.** Chỉ có `HttpClient.Timeout = 3s` và `catch` → trả **503** trung thực, cộng Outbox + RabbitMQ (bất đồng bộ thật). Con số `p95 3000ms · 100% err` thấy trên prod chính là **timeout 3s**, không phải lỗi MAVIS. Template `CIRCUIT_BREAKER` và ô "Resilience Signals: Circuit Breaker" sẽ luôn là "—" với repo này. | `src/Services/Ordering/.../Program.cs` (`c.Timeout = 3s`), `OrdersController.cs` (503), `src/Gateways/.../StorefrontController.cs` (503); không có `Polly` / `Microsoft.Extensions.Http.Resilience` trong mọi `.csproj` |
| F4 | Runner (`dotnet MAVIS.Runner.dll`) là **tiến trình con của backend**, nên restart/deploy backend sẽ giết mọi phiên. Chưa kể **CI cũng chạy `docker container prune -f` qua SSH trước khi deploy.** | `RuntimeRunnerDispatcher.java` ~L758; `.github/workflows/deploy-production.yml` ~L219; `deploy/deploy-vps.sh` ~L18 |
| F5 | SV là `owner` của project `projectType = "STUDENT_WORKING"`, nên qua được `requireProjectWriteAccess`. Env từ `PUT /projects/{id}/runtime-config` được gộp vào `pb.environment().putAll(...)` mà không lọc key. | `mavis-bootstrap/.../course/CourseLabStudentService.java` ~L667-680; `RuntimeSessionServiceImpl.java` ~L1756-1828, ~L1860-1880; `RuntimeRunnerDispatcher.java` ~L766-768 |
| F6 | `uiHeartbeats.keySet().retainAll(activeRunningIds)` xóa heartbeat của phiên `QUEUED` sau mỗi lần sweep. `StudioTelemetryHub.sendHeartbeats()` ghi heartbeat mỗi 20s chỉ vì SSE còn mở. | `RuntimeQueueCoordinator.java` ~L487-539; `StudioTelemetryHub.java` ~L180-198 |
| F7 | Ảnh snapshot bị ràng buộc PNG ở **4 chỗ**: backend `CaptureRequest @Size(max=1500000)` + kiểm tra magic PNG; FE zod `runtime/studio-evidence.tsx` ~L19; `studio-snapshot-comparison.tsx` ~L94; `captureStudioImage` ~L3471-3491. | `RuntimeStudioService.java` ~L67-69, ~L183-193 |

---

## 2. Bốn Batch tuần tự

| Batch | Mục tiêu | Deploy độc lập? | Rủi ro chính |
|---|---|---|---|
| 1 | Bảo mật / quyền / chặn mất dữ liệu | Có | Lọc env làm rơi biến hợp lệ của Runner, nên phải lọc **chỉ** map project env |
| 2 | UX Studio + màn chấm | Có | Test `.cjs` dựa trên regex chuỗi UI, nên giữ chuỗi mà test đang assert |
| 3 | Tài nguyên + hàng đợi | Có | Profile quá nhỏ khiến RabbitMQ/Postgres trong stack bị nghẹt; có cổng đo ở Task 3.1 |
| 4A | Runner chạy trên VM riêng (REMOTE_WORKER, 1 node) | Có, cần người dùng chuẩn bị VM | Image scenario-runner và volume OTel trên worker |
| 4B | Gỡ `docker.sock` khỏi backend | **Chỉ khi** repo khóa học đã có image dựng sẵn, pin digest | Tắt build trong app |

---

## 3. Chi tiết Task

> Mẫu cho mỗi task: **File**, **Thay đổi**, **Không được phá**, **Nghiệm thu**.
> Ràng buộc chung cho mọi task:
> - Giữ song ngữ `t("EN","VI")`.
> - Giữ layout dùng được ở **1366×768**: không có panel che nút chính, không scroll ngang.
> - Giữ HMAC/digest ở backend.
> - Giữ 3D view.

### Batch 1 — Bảo mật, quyền & chặn mất dữ liệu

**Lệnh test chung cho Batch 1**
```bash
# Backend (chạy trong MAVIS-Platform/mavis-be)
bash mvnw -B -ntp -pl mavis-bootstrap -am -Dsurefire.failIfNoSpecifiedTests=false \
  -Dtest=RuntimeRunnerDispatcherTest,RuntimeSessionServiceImplTest,RuntimeStudioServiceTest,RuntimePlanningServiceTest,CourseLabStudentServiceTest,LabStudioExerciseServiceTest,Wf03AcceptanceMatrixTest,RuntimeStudioApiIntegrationTest test
# Frontend (chạy trong MAVIS-Frontend)
npm run typecheck && npm test && npm run lint
# Deploy script (chạy ở repo root)
docker run --rm -v "$PWD/deploy:/source:ro" python:3.12-slim bash /source/tests/deploy-vps.test.sh
```
Trước khi push, chạy thêm **toàn bộ danh sách `-Dtest=` trong `.github/workflows/deploy-production.yml` ~L60**.

#### Task 1.1 — Lọc env trước khi khởi chạy Runner
- **File:** `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/runtime/service/impl/RuntimeRunnerDispatcher.java` (anchor `pb.environment().putAll(projectEnv)`, ~L766-768). Test: `.../src/test/java/com/mavis/analyzer/runtime/service/impl/RuntimeRunnerDispatcherTest.java`.
- **Thay đổi:**
  1. Thêm `static Map<String,String> filterProjectEnv(Map<String,String> env)` (package-private) trong cùng class. Chỉ giữ key khớp `^[A-Z][A-Z0-9_]{0,63}$` **và** không bắt đầu bằng một trong các tiền tố: `LD_`, `DOTNET_`, `COREHOST_`, `ASPNETCORE_`, `DOCKER_`, `MAVIS_`, `JAVA_`, `JDK_`, `_JAVA`, `SSL_`, `NODE_`, `PYTHON`.
  2. Đồng thời loại các key chính xác: `PATH`, `HOME`, `TMPDIR`, `SHELL`, `ENV`, `BASH_ENV`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`.
  3. Key bị loại thì log `WARN` **chỉ tên key**, không log giá trị.
  4. Thay `putAll(projectEnv)` bằng `putAll(filterProjectEnv(projectEnv))`. Các biến `MAVIS_RUNNER_*` mà dispatcher tự đặt phải được `put` **sau** bước này để không bị ghi đè.
  5. Kiểm tra xem `MAVIS_RUNNER_SECRET_ALLOWLIST` (Runner có đọc) có được tính từ danh sách key. Nếu có, phải tính từ **map đã lọc**.
- **Không được phá:** biến hợp lệ như `DB_PASSWORD`, `API_KEY`, `ConnectionStrings__X` (có chữ thường) phải được xử lý đúng như hiện tại. Lưu ý: regex trên sẽ loại key có chữ thường; nếu grep thấy repo mẫu dùng key chữ thường (`ConnectionStrings__...`) qua đường env này thì đổi regex thành `^[A-Za-z_][A-Za-z0-9_]{0,63}$` và giữ nguyên danh sách tiền tố cấm (so sánh không phân biệt hoa thường).
- **Nghiệm thu:** test mới, với `LD_PRELOAD`, `DOTNET_STARTUP_HOOKS`, `PATH`, `DOCKER_HOST`, `MAVIS_RUNNER_SERVICE_KEY` bị loại và `DB_PASSWORD`, `API_KEY` được giữ. Toàn bộ `RuntimeRunnerDispatcherTest` xanh.

#### Task 1.2 — Chặn SV ghi runtime-config của project `STUDENT_WORKING`
- **File:** `.../runtime/service/impl/RuntimeSessionServiceImpl.java` (`updateProjectRuntimeConfig` ~L1756, `storeProjectSecrets` ~L1831); `.../runtime/controller/RuntimeSessionController.java` (~L87-95); `.../runtime/controller/RuntimePlanningController.java` cùng `.../runtime/service/RuntimePlanningService.java` (lưu profile step 1 ~L264-307, `buildSandboxImages` ~L185-231).
- **Thay đổi:**
  1. Grep mọi caller của `updateProjectRuntimeConfig`, `storeProjectSecrets`, của hàm lưu profile và của `buildSandboxImages`.
  2. Nếu **không** có caller nội bộ nào gọi các hàm này trên project `STUDENT_WORKING`: thêm guard đầu hàm service: nếu `"STUDENT_WORKING".equals(project.getProjectType())` thì ném `BusinessException(ErrorCode.FORBIDDEN, "STUDENT_RUNTIME_CONFIG_FORBIDDEN", "Runtime configuration of a student sandbox is managed by the lab.")`.
  3. Nếu **có** caller nội bộ (ví dụ `CourseLabStudentService` tự cấu hình sandbox): đặt guard ở **controller** thay vì service.
- **Không được phá:** luồng SV bấm Run Studio trong lab (`CourseLabStudentService` tự tạo profile). Giảng viên cấu hình project `TEACHER_REFERENCE`.
- **Nghiệm thu:** test mới: user là owner của project `STUDENT_WORKING` gọi update thì nhận 403 `STUDENT_RUNTIME_CONFIG_FORBIDDEN`. Test có sẵn của `CourseLabStudentServiceTest` xanh.

#### Task 1.3 — Enforce `allowedActions` ở server; giữ `allowedEnvKeys` / `alternateImages`
- **File:** `.../runtime/service/RuntimeStudioService.java` (`submit(...)` ~L272-412, anchor `labs.requireRuntimeReadiness(session.getProject())`); `mavis-bootstrap/src/main/java/com/mavis/bootstrap/course/CourseLabStudentService.java` (~L400-467, anchor `scenarioConfig.set("allowedActions"`). Test: `RuntimeStudioServiceTest.java`, `CourseLabStudentServiceTest`.
- **Thay đổi:**
  1. Trong `submit`, đọc `session.getScenarioConfig().path("allowedActions")`. Nếu là mảng **không rỗng** và `request.action()` không thuộc mảng thì ném `BusinessException(ErrorCode.FORBIDDEN, "STUDIO_ACTION_NOT_ALLOWED", "This lab does not allow <ACTION>.")`.
  2. Ngoại lệ CONNECT/DISCONNECT: nếu mảng chứa `CONNECT` (hoặc `DISCONNECT`) thì cho phép `START` (hoặc `STOP`) khi `request.service()` là **controller** của một connection trong `studioTopology` của profile phiên (đọc cách `PreparedStudioTopology` xác định controller).
  3. Phiên cá nhân, tức không có `allowedActions`, giữ nguyên, không giới hạn.
  4. Trong `CourseLabStudentService`, chỗ dựng `profileNode` mới (~L400-422): copy thêm `allowedEnvKeys` và `alternateImages` từ profile tham chiếu nếu có (hiện đang bị rơi, khiến `SET_ENV` mặc định cho phép mọi key).
- **Không được phá:** lab mặc định `["START","STOP","SCALE","CONNECT","DISCONNECT"]` phải chạy STOP/START/SCALE và connect/disconnect như cũ.
- **Nghiệm thu:** test: lab cho phép `START,STOP,SCALE`, gọi `THROTTLE_CPU` thì nhận 403; gọi `STOP` thì OK. Test: `allowedEnvKeys` có mặt trong profile phiên course. `Wf03AcceptanceMatrixTest` xanh.

#### Task 1.4 — Author Mode lưu không làm rơi cấu hình Change Impact
- **File:** `MAVIS-Frontend/src/features/runtime/standalone-studio-live.tsx` (type `StudioExerciseView` ~L45-60; `saveVisualExercise()` ~L481-507). Đối chiếu shape đầy đủ ở `src/features/assignments/studio-exercise-editor.tsx`.
- **Thay đổi:**
  1. Bổ sung vào type: `successCriteria.exerciseType?`, `predictionRequired?`, `minImpactF1?`, `targetChangeAction?`, `rules?`.
  2. Payload PUT phải bắt đầu từ `{ ...exercise.data }` và `successCriteria: { ...exercise.data?.successCriteria, ...<các trường visual editor đổi> }`.
  3. `allowedActions`: giữ giá trị đang có. Chỉ khi chưa có mới dùng mặc định server `["START","STOP","SCALE","CONNECT","DISCONNECT"]`.
- **Không được phá:** các preset Author Mode (`outage`, `scale`, `chaos-scale`, `healthy`) vẫn ghi đúng trường của chúng.
- **Nghiệm thu:**
  - `npm run typecheck && npm test` xanh.
  - Kiểm tra trên trình duyệt: (1) mở `/lab-authoring?...&tab=studio`; (2) "Configure Exercise", chọn template `CHANGE_IMPACT`, bật `predictionRequired`, thêm 1 rule, lưu; (3) mở `/studio-live?...&mode=author`, bấm 1 preset rồi "Save Mission"; (4) mở lại modal: `exerciseType`, `predictionRequired`, rule **vẫn còn**. Hoặc kiểm tra JSON của `GET .../studio-exercise`.

#### Task 1.5 — Deploy không giết phiên SV
- **File:** `deploy/deploy-vps.sh` (~L18 và trước dòng `up -d --no-build --remove-orphans` ~L237); `.github/workflows/deploy-production.yml` (~L219 lệnh `retry_ssh "docker container prune -f ..."`; `timeout-minutes` của job deploy ~L155); `deploy/tests/deploy-vps.test.sh`.
- **Thay đổi:**
  1. Ở cả hai nơi, đổi `docker container prune -f` thành `docker container prune -f --filter "label!=com.docker.compose.project"`. Container thuộc compose, trong đó có `mavisrun-*` của SV vừa STOP, không bị xóa.
  2. Thêm drain wait trong `deploy-vps.sh` ngay trước `up -d`:
     ```bash
     drain_deadline=$((SECONDS + 360))
     while docker ps --format '{{.Label "com.docker.compose.project"}}' | grep -Eq '^mavisrun-[0-9a-f]{32}$'; do
       if [ "$SECONDS" -ge "$drain_deadline" ]; then echo "Studio drain timeout; deploying anyway."; break; fi
       echo "Waiting for active Studio sessions to finish..."; sleep 10
     done
     ```
  3. Nâng `timeout-minutes` của job deploy từ 15 lên 25.
- **Không được phá:** logic rollback, healthcheck, migration backup.
- **Nghiệm thu:** `deploy-vps.test.sh` xanh (cập nhật stub `docker` trong test nếu test mock lệnh `docker ps` / `prune`). Lần deploy thật đầu tiên có phiên đang chạy: log có dòng "Waiting for active Studio sessions" và phiên kết thúc `COMPLETED`.

**🛑 Điểm dừng Batch 1** (xem Phần 5).

---

### Batch 2 — Dọn bẫy UX Studio & nối màn chấm (Frontend)

**Lệnh test chung:** `cd MAVIS-Frontend && npm run typecheck && npm test && npm run lint && npm run build`.
**Kiểm tra trên trình duyệt:** viewport **1366×768**, chạy cả theme Light (`daylight`) và Dark (`control`), cả EN và VI.

#### Task 2.1 — Tự mở panel Change Impact Prediction khi bài yêu cầu
- **File:** `MAVIS-Frontend/src/features/runtime/live-studio-workbench.tsx` (`showRight` ~L532; các chỗ render `StudioExercisePanel` ~L4630 bản light, ~L5300 bản dark; Mission card ~L2271-2468). Panel: `src/features/runtime/studio-exercise-panel.tsx`.
- **Thay đổi:**
  1. Tính `needsPrediction = Boolean(data.exerciseCriteria?.predictionRequired || data.exerciseEvaluation?.predictionRequired) && !data.prediction?.predictedServices?.length && !data.actions.some(a => a.status === "CONFIRMED") && data.executionStatus === "RUNNING"`.
  2. Dùng `useRef` để chỉ auto-mở **một lần mỗi session id**: khi `needsPrediction` chuyển sang `true` thì `setShowRight(true)` và đặt `rightCardMode` sang chế độ có render `StudioExercisePanel` (grep `rightCardMode`).
  3. Trong Mission card, khi `needsPrediction` thì hiện một dòng cảnh báo amber: `t("Lock your impact prediction before your first action.", "Hãy khóa dự đoán tác động trước thao tác đầu tiên.")`.
- **Không được phá:** người dùng vẫn đóng được panel. Panel không che nút Finish/Snapshot ở 1366×768.
- **Nghiệm thu:** bài có `predictionRequired`: bấm Run, phiên RUNNING thì panel tự mở, Mission card có cảnh báo. Bài không yêu cầu dự đoán: không tự mở.

#### Task 2.2 — Khóa `Finish Studio` khi chưa có snapshot
- **File:** `live-studio-workbench.tsx` ~L2563-2610 (anchor `const finishDisabledReason`). Grep `Finish Studio` để tìm **mọi** nơi render nút Finish và áp dụng cùng điều kiện.
- **Thay đổi:** thêm điều kiện `(data.snapshots?.length ?? 0) === 0` (xác nhận tên trường snapshot server trong type `Response<"studioState">` tại `src/lib/api/contracts`). Lý do song ngữ: `t("Capture at least one evidence snapshot before finishing.", "Chụp ít nhất 1 snapshot bằng chứng trước khi kết thúc.")`. Thứ tự ưu tiên lý do: sau `!hasConfirmedAction`.
- **Không được phá:** chuỗi đang có ở ~L2582-2583 (test có thể assert).
- **Nghiệm thu:** có action CONFIRMED nhưng 0 snapshot thì Finish disabled, tooltip đúng. Chụp 1 snapshot thì Finish bật.

#### Task 2.3 — Đồng bộ nút Light/Dark + sửa Pause/Resume (theo F2)
- **File:** `live-studio-workbench.tsx` (`runningFor` ~L267; light ~L4446-4600; dark ~L5199-5314).
- **Thay đổi:**
  1. Thêm helper ngay dưới `runningFor`:
     ```ts
     function servicePhase(data: Studio, service: string): "running" | "paused" | "stopped" {
       const running = runningFor(data, service) ?? 0;
       if (running > 0) return "running";
       const last = [...data.actions].reverse().find((a) => a.service === service && a.status === "CONFIRMED");
       return last?.action === "PAUSE" ? "paused" : "stopped";
     }
     ```
  2. **Light:** thay `selStopped` / `selPaused` (~L4449-4452) bằng `servicePhase`. Stop/Pause chỉ bật khi `"running"`, Resume chỉ bật khi `"paused"`, Start chỉ bật khi `"stopped"`. Pill trạng thái hiện `PAUSED` khi phase là `"paused"`.
  3. **Dark:** Pause `disabled` khi phase khác `"running"` (~L5229); Resume `disabled` khi phase khác `"paused"` (~L5239); Start/Stop theo cùng quy tắc.
  4. **Light** thêm preset CPU và Load giống Dark. Preset CPU = hợp của `[25, 50, 100]` (Dark ~L5251) với mọi `cpuPercent` xuất hiện trong template ở `src/features/assignments/studio-exercise-editor.tsx` (grep `cpuPercent`), sắp tăng dần; thay nút đơn `CPU 20%` (~L4583-4586) bằng dãy preset này. Thêm `SET_LOAD` `[5, 15, 30, 50]` (copy logic Dark ~L5274-5290) với class style light đang dùng gần đó.
  5. Nếu `Response<"studioState">` có sẵn `allowedActions`: disable nút có action không thuộc danh sách, tooltip `t("Not allowed in this lab","Lab này không cho phép")`. Nếu **không có sẵn** thì **bỏ qua** bước này: server (Task 1.3) đã chặn, toast lỗi có sẵn sẽ hiện.
- **Không được phá:** 3D view và các theme khác; layout 1366×768 (dãy nút cho phép xuống dòng, không được tràn ngang).
- **Nghiệm thu:** ở **cả Light và Dark**: Pause thì pill PAUSED, chỉ Resume bật; Resume thì RUNNING. Stop thì Resume disabled, Start bật. Light có `CPU 100%` và `Load 30 RPS` gửi lệnh được, action CONFIRMED.

#### Task 2.4 — Xóa mẫu hồ sơ và điểm preview `8.8`
- **File:** `MAVIS-Frontend/src/features/courses/lab-submission-v2.tsx` (preview điểm ~L150-170 với anchor `const baseQuiz = 2.7`; phần render rubric ~L388-438; khối `<details>` "Quick Reference Dossier Templates" ~L439-477).
- **Thay đổi:**
  1. Xóa toàn bộ khối `<details>` mẫu hồ sơ (2 nút "Fill Passing…" / "Fill Revision-Needed…").
  2. Xóa hàm tính điểm preview và phần hiển thị "x.x / 10 APPROVED/Eligible".
  3. Checkbox mitigation (`circuitBreaker`, `databasePerService`, `idempotencyKey`): kiểm tra payload submit. Nếu **không** gửi lên backend thì xóa luôn; nếu có gửi thì giữ.
  4. Xóa import, state và field `sampleDossier` (ở nguồn `rubricProfile`) nếu không còn dùng.
- **Không được phá:** luồng nộp bài thật (chặn khi thiếu snapshot, `capturedSnapshotCount`).
- **Nghiệm thu:** grep `Fill Passing|baseQuiz|sampleDossier` trong `src/` trả về 0 kết quả. Nộp bài thật vẫn chạy. Sửa test `.cjs` nào assert các chuỗi vừa xóa.

#### Task 2.5 — Sửa nút "Open Studio Canvas"
- **File:** `MAVIS-Frontend/src/features/administration/screens.tsx` ~L569 (anchor `href="/administration/studio"`).
- **Thay đổi:** đổi `href` thành `/workspaces`, nhãn thành `t("Open Studio Live (choose a lab)", "Mở Studio Live (chọn Lab)")`. Lý do: `/studio-live` bắt buộc có `?workspace=&assignment=` (`standalone-studio-live.tsx` ~L124-125). Nếu DTO session trong bảng "Live Sessions & Force-Stop" có `workspaceId` và `assignmentId`, thêm link "Open" mỗi dòng bằng `buildStudioLiveHref({ workspaceId, assignmentId, mode: "author", sessionId })` (export ở `standalone-studio-live.tsx` ~L96-111); nếu DTO không có thì bỏ qua.
- **Không được phá:** route `/administration/studio` vẫn tồn tại (không xóa).
- **Nghiệm thu:** Admin › Studio: nút đưa tới `/workspaces`. Không còn link nào trong admin trỏ tới `/administration/studio` (grep).

#### Task 2.6 — Hiển thị `exerciseEvaluation` (gợi ý) ở màn chấm
- **File:** `MAVIS-Frontend/src/features/submissions/studio-evidence.tsx` (~L9-75); nơi dùng: `src/features/submissions/` (grep `StudioEvidence`). Backend chỉ **xác minh, không sửa**: `SubmissionServiceImpl.freezeStudioEvidence` (~L778-785) phải deep-copy `snapshots`, mà mỗi snapshot chứa `exerciseEvaluation` (tạo ở `RuntimeStudioService.capture` ~L174-182).
- **Thay đổi:**
  1. Mở rộng zod cho từng snapshot, `exerciseEvaluation` optional + `.passthrough()`, gồm: `predictionLocked`, `predictedServices[]`, `observedAffectedServices[]`, `impact{precision,recall,f1Score,truePositives[],falsePositives[],falseNegatives[]}?`, `rules[{label,passed,reason,observedValue}]`, `passedRules`, `totalRules`, `autoScorePercent`, `passed`.
  2. Lấy snapshot **mới nhất** có `exerciseEvaluation` và render một khối **mở sẵn**, không nằm trong `<details>`, tiêu đề `t("Auto-check (grading hint, not a score)", "Tự kiểm tra (gợi ý chấm, không phải điểm)")`. Nội dung: F1 %, chip TP (xanh) / FP (vàng) / FN (đỏ), checklist rule pass/fail.
- **Không được phá:** phần receipt digest/signature có sẵn; form chấm điểm hiện tại (không tự điền điểm).
- **Nghiệm thu:** một bài nộp có phiên đã khóa dự đoán: màn chấm của GV hiện F1 và rule. Bài không có thì không hiện khối.

**🛑 Điểm dừng Batch 2.**

---

### Batch 3 — Tối ưu tài nguyên & hàng đợi

**Lệnh test chung:** lệnh backend Batch 1 thêm `RuntimeQueueCoordinatorTest,StudioExerciseEvaluatorTest`; `dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --configuration Release`; frontend như Batch 2.

#### Task 3.1 — Hạ profile mặc định
- **File:** `MAVIS-Platform/mavis-be/mavis-common/src/main/java/com/mavis/common/config/PlatformRuntimeSettings.java` ~L15 (`new Profile(id,id,true,1,1024,2.0,300)`).
- **Thay đổi:**
  1. Trước tiên đọc `MAVIS.Worker/src/MAVIS.Runner/ComposeOverrideBuilder.cs` ~L50-60 để biết `mem_limit` / `cpus` áp cho **mọi service trong compose** (gồm postgres / redis / rabbitmq của repo lớp) hay chỉ `Applications`.
  2. Nếu áp cho cả hạ tầng: đặt mặc định **`512, 0.5`**, vì RabbitMQ chặn publisher khi vượt `0.4 × mem_limit`.
  3. Nếu chỉ áp cho app: đặt **`384, 0.5`**.
  4. Giữ `300`.
  5. Cập nhật test và chuỗi UI nào assert `1024` (grep `1024` trong test BE/FE liên quan tới profile).
- **Không được phá:** admin vẫn sửa được profile qua UI (vẫn in-memory, không làm persistence đợt này).
- **Nghiệm thu:** unit test xanh. Trong load test 4.5: boot p95 < 60s và không có log RabbitMQ `memory resource limit alarm`. Nếu fail thì nâng lên `512, 1.0`.

#### Task 3.2 — Giới hạn Scale 1..3 cho thao tác mới
- **File cần đổi giới hạn từ 8 xuống 3:**
  - `RuntimeStudioService.java` ~L44 (`@Max(8) Integer replicas`).
  - `LabStudioExerciseService.java` ~L242 và ~L272 (kèm message lỗi "1-3").
  - `RuntimeSessionServiceImpl.java` ~L1973 (đọc ngữ cảnh: chỉ đổi nếu là validate input thao tác mới).
  - `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs` (grep giới hạn replicas quanh ~L405-415).
  - FE `live-studio-workbench.tsx` ~L916; `studio-observability.tsx` ~L3202 (preset `[1,2,4,8]` thành `[1,2,3]`, nhãn "Replicas (1–3)"); `live-sandbox-parity.tsx` ~L351 và ~L1135; `prepared-live-topology.tsx` ~L79; `studio-live-capabilities.ts` (chuỗi "1–8", "16 and 32", lý do BR-07); `src/lib/i18n/locale-context.tsx` ~L104.
  - Nội dung khóa học `CsharpCourseraCatalog.java` ~L255 ("Scale `1 -> 8`" thành "`1 -> 3`").
- **KHÔNG đổi** (đây là validate dữ liệu cũ, phải tiếp tục chấp nhận ≤8): `RunnerReceiptIngestServiceImpl.java` ~L1603, `RuntimeStudioService.java` ~L737, `RuntimeSession.java` ~L186.
- **Nghiệm thu:** `SCALE replicas=4` nhận 400. UI chỉ có ×1 ×2 ×3. Test cập nhật xanh (`LabStudioExerciseServiceTest`, `studio-live-capabilities.test.cjs`, Worker tests).

#### Task 3.3 — Ảnh snapshot ≤ ~330 KB
- **Quyết định:** **giữ PNG, thu nhỏ kích thước**, không đổi sang JPEG. Lý do: sơ đồ màu phẳng nén PNG tốt; đổi JPEG phải sửa 4 validator (F7) và làm hỏng tương thích dữ liệu cũ.
- **File:** `MAVIS-Frontend/src/features/runtime/studio-observability.tsx` (`captureStudioImage` ~L3471-3491); backend `RuntimeStudioService.java` (`CaptureRequest @Size(max=1500000)` ~L68 và kiểm tra `length()>1500000` ~L185).
- **Thay đổi:**
  1. FE: vẽ canvas với cạnh dài tối đa **1280px**. Nếu `dataURL.length > 440_000` thì vẽ lại ở 960px, rồi 720px. Nếu vẫn quá thì ném lỗi song ngữ "Snapshot image too large".
  2. Backend: hạ ngưỡng `1500000` xuống `450000` ở cả annotation và check thủ công. Giữ kiểm tra PNG magic và giới hạn ≤2000px.
- **Nghiệm thu:** chụp snapshot ở 1366×768 thì request capture < 450 KB (DevTools Network). Snapshot cũ vẫn hiển thị.

#### Task 3.4 — Giãn `docker cp` trace & readiness poll
- **File:** `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs`.
- **Thay đổi:**
  1. Giữ `TelemetryInterval = 2s` (~L646) cho `ps` / `stats` / `logs`.
  2. Lệnh `cp mavis-collector:/traces/.` (~L817) chỉ chạy **mỗi lần publish thứ 3** (≈6s), **hoặc** ngay sau khi một action được ack: thêm biến đếm và cờ `forceTraceRefresh` set tại chỗ gọi `PublishStudioTelemetrySafeAsync` sau ack, ~L350. Lần không cp thì dùng lại trace đã parse lần trước.
  3. `WaitUntilReadyAsync` `Task.Delay(1000)` (~L236) đổi thành `2000`. `WaitForServiceReadyAsync` `Task.Delay(500)` (~L572) đổi thành `2000`.
- **Không được phá:** span sau action vẫn xuất hiện trên đồ thị trong ≤ ~4s; Before/After của evaluator.
- **Nghiệm thu:** Worker tests xanh. Kiểm tra trên trình duyệt: STOP một service thì cạnh lỗi hiện trong vài giây.

#### Task 3.5 — Reaper quét `QUEUED` + heartbeat theo tab đang hiển thị
- **File:** `.../runtime/service/StudioTelemetryHub.java` (~L180-198); `.../runtime/service/impl/RuntimeQueueCoordinator.java` (~L487-539, ~L771); `MAVIS-Frontend/src/features/runtime/use-studio-session.ts`.
- **Thay đổi:**
  1. `sendHeartbeats()`: **bỏ** dòng `queueCoordinator.recordUiHeartbeat(...)`, vẫn gửi SSE keepalive.
  2. FE `use-studio-session.ts`: khi status thuộc `QUEUED | READY_FOR_DISPATCH | ALLOCATED | RUNNING` **và** `document.visibilityState === "visible"`, cứ 30s gọi lại query state hiện có. `RuntimeStudioService.state()` ~L205-209 đã ghi heartbeat. Dùng `refetch` của query có sẵn, không tạo endpoint mới. Lắng nghe `visibilitychange` để gọi ngay khi tab hiện lại.
  3. `reapAbandonedStudioSessions`: đổi `retainAll(activeRunningIds)` để giữ cả id `QUEUED`. Thêm vòng qua phiên `QUEUED` (`findByExecutionStatusAndCancelRequestedAtIsNullOrderByCreatedAtAsc("QUEUED")`): nếu `now - max(lastHeartbeat, createdAt) > max(300, 2 × abandonedIdleSeconds)` thì hủy bằng **đúng đường hủy phiên QUEUED đang có** (grep nơi user cancel phiên queued, tái sử dụng). Ngưỡng của `RUNNING` giữ nguyên.
  4. FE: khi phiên chuyển `CANCELLED` lúc còn đang chờ, hiện `t("Your queued session was cancelled because the tab was inactive. Click Run again.", "Phiên chờ đã bị hủy do tab không hoạt động. Hãy bấm Run lại.")`. Nếu đã có thông báo tương đương thì dùng lại.
- **Nghiệm thu:** `RuntimeQueueCoordinatorTest`: QUEUED heartbeat cũ thì bị hủy; QUEUED heartbeat mới thì giữ; RUNNING không đổi hành vi. Kiểm tra trên trình duyệt: tab hiển thị đang đọc log 3 phút không bị reap.

#### Task 3.6 — `maxQueued` theo sĩ số (chỉ cấu hình, không sửa code)
- Trong `/opt/mavis/.env.production`: `MAVIS_RUNTIME_MAX_QUEUED_STUDIO_SESSIONS=<sĩ số lớp, ví dụ 40>`. Giữ `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2` cho tới khi qua cổng load test 4.5, sau đó đặt `10`. `deploy-vps.sh` ~L49 chỉ tự ghi đè khi giá trị rỗng hoặc bằng `1`.

**🛑 Điểm dừng Batch 3.**

---

### Batch 4 — Tách Runner VM & an toàn vận hành

#### Task 4.0 — (Người dùng làm) Chuẩn bị Runner VM
- Ubuntu 24.04, **8 vCPU / 16 GB / ≥ 100 GB SSD**, Docker Engine + compose plugin. Inbound chỉ mở SSH. Outbound tới `maviss.site:443` và `ghcr.io`.
- Control VPS: cấu hình `MAVIS_RUNNER_SANDBOX_REGISTRY` (GHCR) cùng thông tin đăng nhập để image lab build trên control được push cho worker kéo về (cơ chế đã có, xem comment `deploy/compose.runner-worker.yml` L9-11).

#### Task 4.1 — Runner tự đủ trên worker (lỗ a + b)
- **File:** `MAVIS.Worker/Dockerfile.runner`; `MAVIS.Worker/src/MAVIS.Runner/WorkerPoolLoop.cs`. Tham chiếu logic Java cần sao chép: `RuntimeRunnerDispatcher.java` ~L514-585 (seed volume `mavis-agents-v1` từ `/app/otel-bundle` có label bundle; build `mavis-poc-runner:4` từ `Runner.Dockerfile` + runner publish), `prepareInstrumentationVolume` / `hasCurrentBundleLabels` ~L635-667; `RuntimeSessionServiceImpl.java` ~L1485-1492 (đặt `scenarioRunnerImage` = image id local của **backend**, nên trên worker sẽ không tồn tại).
- **Thay đổi:**
  1. `Dockerfile.runner`: đảm bảo image chứa `/app/samples/runtime-poc/Runner.Dockerfile` và thư mục runner publish (đã có `/app/otel-bundle/` ~L33).
  2. `WorkerPoolLoop` lúc khởi động:
     - (a) nếu volume instrumentation chưa có label bundle hiện hành thì tạo và seed y hệt Java;
     - (b) `docker image inspect mavis-poc-runner:4`; nếu thiếu thì `docker build` từ các file trong image; lưu image id `sha256:`.
  3. Khi nhận run definition: nếu `profile.scenarioRunnerImage` không tồn tại cục bộ, hoặc là placeholder `...0001`, hoặc bắt đầu bằng `mcr.microsoft.com/dotnet/aspnet`, thì **ghi đè** bằng image id local ở bước (b) trước khi chạy `DockerComposeSession`.
- **Nghiệm thu:** trên Runner VM, một phiên Studio của lab thật chạy **từ RUNNING tới COMPLETED**, có span OTel trên đồ thị và receipt được ingest. Không còn lỗi `SCENARIO_CONTAINER_FAILED` hay `INSTRUMENTATION_BUNDLE_UNAVAILABLE`.

#### Task 4.2 — Orphan reaper, dọn đĩa, heartbeat worker (lỗ c)
- **File:** `WorkerPoolLoop.cs`; backend: endpoint claim của worker (grep `claim` trong `RuntimeQueueCoordinator.java` / controller tương ứng) và `RuntimeQueueCoordinator.runHostWatchdog()` (~L559, hiện thoát sớm khi `REMOTE_WORKER`).
- **Thay đổi:**
  1. Worker, mỗi 5 phút:
     - `docker compose ls` / `docker ps -a` lấy project `^mavisrun-[0-9a-f]{32}$` **không** thuộc phiên đang chạy của worker, rồi `docker compose -p <p> down -v --remove-orphans`.
     - `docker image prune -f`; `docker builder prune -f --filter until=72h`; xóa image `mavis-sandbox-*` không được container nào dùng và cũ hơn 14 ngày.
     - Xóa file trong state root (`/tmp/mavis-runner-state`) cũ hơn 7 ngày, trừ file của phiên đang chạy.
     - Log dung lượng trống của `/var/lib/docker`.
  2. Lúc khởi động và mỗi vòng: gọi chức năng `deliver-pending` receipt có sẵn của Runner (grep `deliver-pending` / `RuntimeReceiptDelivery`).
  3. Backend: ghi `lastWorkerPollAt` (in-memory) mỗi khi worker gọi claim. Ở chế độ `REMOTE_WORKER`, `surveyReadiness` = `READY` nếu poll gần nhất < 30s, ngược lại `DEGRADED`.
- **Nghiệm thu:** kill worker giữa phiên rồi khởi động lại: trong ≤ 10 phút không còn `mavisrun-*` mồ côi; receipt tồn đọng được gửi. Admin › Studio hiện READY khi worker sống.

#### Task 4.3 — Chuyển control sang `REMOTE_WORKER` (4A)
- **File:** `deploy/compose.production.yml` (`MAVIS_RUNNER_MODE`), tài liệu chạy ở Task 4.6.
- **Thay đổi:** control đặt `MAVIS_RUNNER_MODE=REMOTE_WORKER` trong `.env.production`. Runner VM chạy `MAVIS_JAVA_URL=https://maviss.site MAVIS_RUNNER_SERVICE_KEY=<key> MAVIS_WORKER_CONCURRENCY=10 docker compose -f deploy/compose.runner-worker.yml up -d --build`. **Chưa** gỡ `docker.sock` khỏi backend: build image lab vẫn chạy trên control rồi push qua registry.
- **Nghiệm thu:** deploy backend trong lúc có phiên chạy thì phiên **không bị ngắt**, vì runner nằm trên VM khác.

#### Task 4.4 — Backup DB định kỳ
- **File:** `deploy/apply-course-schema.py` (thêm chế độ CLI `--backup-only <dest>` vào `main` ~L386-392, tái dùng `connection()` + `PostgresClient.backup()`); file mới `deploy/backup-db.sh`; `deploy/deploy-vps.sh` (copy và cài cron giống cách copy các script ~L243-246); `.github/workflows/deploy-production.yml` ~L220 (thêm `deploy/backup-db.sh` vào danh sách `retry_scp`); test `deploy/tests/test_course_schema.py`.
- **Thay đổi:** `deploy/backup-db.sh`:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  cd /opt/mavis
  install -d -m 700 /opt/mavis/db-backups
  dest="/opt/mavis/db-backups/daily-$(date -u +%Y%m%dT%H%M%SZ).dump"
  docker compose --project-name mavis --env-file .env.production -f deploy/compose.production.yml config --format json \
    | python3 deploy/apply-course-schema.py --backup-only "$dest"
  find /opt/mavis/db-backups -name 'daily-*.dump' -mtime +14 -delete
  ```
  `deploy-vps.sh` ghi `/etc/cron.d/mavis-db-backup` với nội dung `15 3 * * * root /opt/mavis/deploy/backup-db.sh >> /var/log/mavis-db-backup.log 2>&1` (idempotent). Nếu script deploy không chạy dưới quyền root thì ghi bước cài cron vào runbook để người dùng làm tay.
- **Nghiệm thu:** test python cho `--backup-only` (mock `PostgresClient`) xanh. Trên VPS: chạy tay `backup-db.sh` thì có file `.dump` > 0 byte, và `pg_restore --list` thành công (đã kiểm sẵn trong `backup()`). **Người dùng tự kiểm tra thêm:** nhà cung cấp DB ngoài có snapshot tự động hay không.

#### Task 4.5 — Load test 10 phiên (cổng Go/No-Go)
- **File mới:** `deploy/loadtest/studio-concurrency.mjs` (Node 20, chỉ dùng `fetch` có sẵn, không thêm dependency).
- **Đầu vào (env):** `MAVIS_BASE_URL`, `MAVIS_LOADTEST_AUTH` (một dòng auth mỗi tài khoản SV đã enroll: cookie hoặc bearer, đúng **cơ chế trình duyệt đang dùng**; đọc `MAVIS-Frontend/src/lib/mainflow-api.ts`), `WORKSPACE_ID`, `ASSIGNMENT_ID`, `CONCURRENCY=10`, `ROUNDS=3`.
- **Luồng mỗi SV ảo:** gọi **đúng endpoint FE dùng** để Run Studio của lab (đọc `standalone-studio-live.tsx` và `CourseLabStudentController.java`), rồi:
  1. Poll state mỗi 2s tới `RUNNING`, ghi boot time.
  2. Gửi `STOP` rồi `START` một service, chờ `CONFIRMED`.
  3. Capture 1 snapshot (chỉ giải thích, không ảnh).
  4. Finish, chờ trạng thái kết thúc.
- **Đầu ra:** JSON gồm tổng phiên, fail %, boot p50/p95, lỗi theo mã.
- **Cổng Go:** qua 3 vòng × 10 phiên phải đạt đủ: **fail < 5%** (≤ 1/30), **boot p95 < 60s**, 0 `mavisrun-*` mồ côi sau 10 phút, API control p95 < 3s (N1). Đạt thì đặt `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=10`.

#### Task 4.6 — Runbook (thêm vào cuối file này khi làm xong Batch 4)
Nội dung bắt buộc:
- Cấm deploy (push lên `main`) trong giờ học.
- Cách xem và restart worker: `docker compose -f compose.runner-worker.yml ps|logs|restart`.
- Kiểm tra backup hằng tuần và tải bản `.dump` mới nhất ra máy khác.
- Nâng/hạ số slot.
- Lệnh `deploy/check-studio-readiness.sh`.

#### Task 4.7 — (Tùy chọn, repo khóa học riêng) Resilience thật cho repo `.NET`
- **Repo:** `MAVIS-Platform/eshop-bookstore-dotnet-microservices`.
- **Thay đổi:** thêm `Microsoft.Extensions.Http.Resilience` và `.AddStandardResilienceHandler()` cho `IPaymentApiClient` / `ICatalogApiClient` ở `src/Services/Ordering/.../Program.cs` (khoảng 10 dòng).
- **Nếu không làm:** **không dùng template `CIRCUIT_BREAKER`** cho lab của repo này.

#### Task 4.8 — (4B, chỉ khi người dùng duyệt) Gỡ `docker.sock` khỏi backend
- **Điều kiện:** repo khóa học đã có `docker-compose` dùng image dựng sẵn, pin `@sha256:` (tham khảo workflow mẫu `mavis-studio-live-demo/.github/workflows/publish-images.yml`).
- **Thay đổi:** bỏ mount `/var/run/docker.sock` và `group_add` của `backend` trong `deploy/compose.production.yml` ~L57-63. `RuntimePlanningService.buildSandboxImages` trả 409 `SANDBOX_BUILD_DISABLED` khi `MAVIS_RUNNER_MODE=REMOTE_WORKER`.
- **Nghiệm thu:** lab dùng image pin vẫn chạy end-to-end. Admin health không báo lỗi docker (lấy từ heartbeat worker, Task 4.2).

**🛑 Điểm dừng Batch 4A (sau 4.1–4.6) và 4B (sau 4.8).**

---

## 4. Checklist sửa bộ file BM (chỉ đối chiếu, không sửa `.docx` trong lúc sửa code)

| File BM | Mục cũ (cụm từ để tìm) | Nội dung cần đổi |
|---|---|---|
| BM01 `SEP490_FA26SE289_R2_DesignBrief_VI.docx` | "Controlled C4 Modeling Canvas", "> 80% theo Ground Truth", "HTTP 422" (kéo bảng DB vào C0/C1) | Xóa. Thay bằng "C1–C3 reference views (chỉ đọc) + Quiz tự chấm" cho khớp BM03 dòng 5 và BM04 §5 |
| BM01 | "4 bước" khóa cứng | Mô tả đúng luồng UI hiện tại: Lý thuyết/Quiz → Studio Live (Runtime + Change Impact gộp một không gian) → Nộp bài |
| BM01 | Mục tiêu tải / NFR | Ghi rõ "≤ 10 phiên Studio đồng thời trên Runner VM 8 vCPU / 16 GB". Bỏ mọi ngụ ý 30–50 phiên |
| BM01 / BM04 | Kiến trúc D3 (Dedicated Docker Runner) | Bổ sung: Runner chạy trên **VM riêng** (REMOTE_WORKER, 1 node), Control VPS không chạy stack SV |
| Registration `1_Post_Review2_Final_Registration.docx` (và bản EN) | C4 canvas, "chặn kéo DB … 422" | Đồng bộ như BM01 |
| Registration / mô tả WF-03 | "Kéo thanh trượt Scale Replicas (1 -> 4)" | "Chọn preset ×1 / ×2 / ×3" |
| Registration / mô tả WF-03 | "xem hệ thống … tự bật Circuit Breaker thật" | "quan sát lỗi lan truyền (503 / timeout) thật; Circuit Breaker chỉ khi repo lab có cài (Task 4.7)" |
| BM04 §6.3 WF-03 Trigger, F-07, RF-03 | "Scale Replicas within the configured 1..8 bound", "(1..8 replicas)" | Đổi thành **1..3** |
| BM04 §6.3 DS-03a | "Stop on payment-service and Scales order-service (1 → 4 instances)", "observes live Circuit-Breaker fallback" | "Stop `payment-api`, Scale `ordering-api` (1 → 3)"; "quan sát 503/timeout lan tới `api-gateway`" (tên theo repo `.NET` thật) |
| BM04 §6.3 WF-03 | "2D/3D" | **Giữ nguyên** (3D được giữ) |
| BM04 §3 BR-07 / N5 | "≤ 300s", "Scale [1..8]", "max 32 commands & 8 snapshots" | Giữ 300s, 32 lệnh, 8 snapshot; Scale thành **[1..3]**; thêm "ảnh snapshot ≤ ~330 KB" |
| BM04 BR-08 | HMAC receipt hiển thị như một bước của SV ("seal HMAC receipt") | Ghi HMAC/SHA-256 là **cơ chế nội bộ backend**, không phải thao tác của SV |
| BM04 §6.4 WF-04 / BR-10 | "every required Snapshot scores above 5.0", "LabResult PASSED only when…", khóa vĩnh viễn sau PASSED (409) | Đề xuất: một rubric tổng, đạt khi **≥ 5.0**; cho chấm lại có audit log. *(Cần sửa code ở đợt sau; chưa nằm trong 4 Batch)* |
| BM04 BR-03 | "Lab N+1 LOCKED until Lab N PASSED" | Đề xuất: mở Lab N+1 khi Lab N **đã nộp**. *(Sửa code đợt sau; chưa nằm trong 4 Batch)* |
| BM04 BR-06 / WF-02 | "70%" | Chọn một số thống nhất với code (V36 mặc định 80%): "mặc định 80%, giảng viên chỉnh được" **hoặc** đổi code về 70% ở đợt sau |
| BM04 §5 Out of Scope | (thêm mới) | Local Runner trên máy SV; Shared Observe; auto-grade điểm; bắt buộc gVisor; S3/OTLP rewrite |
| BM02 `SR-xx` (SelfReview) | (thêm mới) | Thêm các phát hiện: env injection vào Runner (F5), `allowedActions` không enforce, deploy giết phiên (F4), không có backup DB (F1), Light-mode Resume (F2); trạng thái "Fixed in Batch N" |
| BM03 `RecordOfChanges` | (thêm dòng v2.2) | Scale 1..3; Runner VM riêng; mục tiêu 10 phiên; backup DB; dọn phần C4 canvas còn sót trong BM01/Registration |
| BM04 §8 | 108 test / 56 CI | **Không đổi** |
| Passkey TTL (BM04 / WF-01) | 1–168h | **Không đổi** (passkey chỉ dùng lúc ghi danh) |

---

## 5. Thứ tự commit & điểm dừng review

1. **Một commit cho mỗi task**, theo Conventional Commits:
   - Batch 1: `fix(runtime): filter project env before spawning runner` (1.1) · `fix(runtime): forbid runtime-config writes on student sandboxes` (1.2) · `fix(studio): enforce lab allowedActions server-side` (1.3) · `fix(studio): preserve change-impact fields on author save` (1.4) · `fix(deploy): drain studio sessions and keep compose containers on deploy` (1.5)
   - Batch 2: `fix(studio): auto-open prediction panel` · `fix(studio): require a snapshot before finish` · `fix(studio): align light/dark controls and pause/resume phase` · `chore(submission): remove sample dossiers and preview score` · `fix(admin): point studio button to studio live` · `feat(grading): show studio auto-check hint`
   - Batch 3: `perf(runtime): smaller default execution profile` · `feat(studio): cap scale at 3 replicas` · `perf(studio): downscale snapshot images` · `perf(runner): throttle trace copy and readiness polling` · `fix(runtime): reap abandoned queued sessions; visible-tab heartbeat`
   - Batch 4: `feat(runner): self-sufficient remote worker` · `feat(runner): orphan and disk reaper, worker heartbeat` · `feat(deploy): daily database backup` · `test(ops): studio concurrency load test` · `docs(ops): studio runbook`
2. **Không push giữa Batch.** Cuối mỗi Batch:
   1. Chạy **toàn bộ** bước kiểm tra như CI (`deploy-production.yml`): deploy test, schema test, backend regression list đầy đủ, `dotnet test`, `npm ci && npm run typecheck && npm test`, `npm run build`.
   2. `git push origin main`, rồi `gh run watch <id> --exit-status`.
   3. Smoke test production **chỉ đọc** theo mục "Nghiệm thu" của từng task. Không tạo dữ liệu lạ trên lớp thật.
   4. **🛑 DỪNG** và báo người dùng theo mẫu: commit list · kết quả test · link CI · ảnh hoặc ghi chú kiểm chứng · việc bỏ qua kèm lý do. **Chỉ sang Batch kế tiếp khi người dùng duyệt.**
3. **Rollback:** nếu CI deploy fail hoặc smoke test fail thì `git revert` commit lỗi trong Batch đó và push lại. Không sửa nóng trên VPS.
4. **Batch 4:** dừng sau 4A (4.1–4.6, có kết quả load test). Task 4.8 (4B) chỉ làm khi người dùng xác nhận đã có image pin cho repo khóa học.

---

## 6. Ops Runbook (Vận hành Production — Task 4.6)

### 6.1 Quy tắc Deploy & Giờ học
- **Cấm push lên `main` trong giờ học.** Push lên `main` kích hoạt workflow tự động `.github/workflows/deploy-production.yml`. Dù `deploy-vps.sh` đã có bước drain phiên đang chạy tối đa 6 phút (`360s`) và timeout workflow 25 phút, việc deploy giữa tiết học vẫn làm gián đoạn tải trang và hàng đợi.
- Khi đã tách Runner VM (`MAVIS_RUNNER_MODE=REMOTE_WORKER`), deploy backend chỉ restart control plane; các container sandbox đang chạy trên Runner VM không bị giết.
- Nếu deploy lỗi hoặc smoke test lỗi: dùng `git revert <commit>` rồi push lại, **không sửa nóng trên VPS**.

### 6.2 Kiểm tra sẵn sàng trước buổi học
Chạy trên Control VPS (và kiểm tra tương tự phần Docker/disk trên Runner VM):
```bash
bash /opt/mavis/deploy/check-studio-readiness.sh
```
Sau đó mở trang **Admin › Studio** kiểm tra trạng thái `surveyReadiness`:
- Phải là **`READY`** trước giờ học.
- Ở chế độ `REMOTE_WORKER`, nếu hiện **`DEGRADED`** với cảnh báo *"No remote worker poll"* hoặc *"Remote worker heartbeat is stale"* (> 30s), kiểm tra ngay container worker trên Runner VM theo §6.3.

### 6.3 Vận hành Runner VM (`REMOTE_WORKER`)
1. **Trên Control VPS** (`/opt/mavis/.env.production`):
   ```env
   MAVIS_RUNNER_MODE=REMOTE_WORKER
   MAVIS_RUNNER_SANDBOX_REGISTRY=ghcr.io/<org>/mavis-sandbox
   ```
   Khởi động lại backend để nhận cấu hình:
   ```bash
   cd /opt/mavis && docker compose --env-file .env.production -f deploy/compose.production.yml up -d --no-build backend
   ```
2. **Trên Runner VM** (Ubuntu 24.04, 8 vCPU / 16 GB RAM / ≥ 100 GB SSD, chỉ mở inbound SSH):
   ```bash
   MAVIS_JAVA_URL=https://maviss.site \
   MAVIS_RUNNER_SERVICE_KEY=<khớp-control-plane> \
   MAVIS_WORKER_CONCURRENCY=10 \
   docker compose -f deploy/compose.runner-worker.yml up -d --build
   ```
   Worker tự seed volume OTel (`mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3`), tự build `mavis-poc-runner:4`, tự gửi lại receipt tồn đọng lúc khởi động, và mỗi 5 phút tự dọn `mavisrun-*` mồ côi + ảnh/cache cũ + ghi log `diskFreeMiB`.
3. **Xem trạng thái, log và restart worker:**
   ```bash
   docker compose -f deploy/compose.runner-worker.yml ps
   docker compose -f deploy/compose.runner-worker.yml logs -f --tail=100
   docker compose -f deploy/compose.runner-worker.yml restart
   ```

### 6.4 Nâng/hạ số slot Studio & Cổng Go/No-Go Load Test
- Sửa trong `/opt/mavis/.env.production` trên Control VPS:
  ```env
  MAVIS_RUNTIME_MAX_QUEUED_STUDIO_SESSIONS=40
  MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2   # chỉ nâng lên 10 sau khi đạt cổng load test bên dưới
  ```
  Áp dụng:
  ```bash
  cd /opt/mavis && docker compose --env-file .env.production -f deploy/compose.production.yml up -d --no-build backend
  ```
- **Chạy load test 10 phiên đồng thời × 3 vòng** (từ máy vận hành có Node 20+):
  ```bash
  MAVIS_BASE_URL=https://maviss.site \
  WORKSPACE_ID=<workspace-uuid> \
  ASSIGNMENT_ID=<assignment-uuid> \
  MAVIS_LOADTEST_AUTH_FILE=/path/to/10-student-cookies.txt \
  CONCURRENCY=10 ROUNDS=3 \
  node deploy/loadtest/studio-concurrency.mjs
  ```
  *(Mỗi dòng trong `10-student-cookies.txt` là `Cookie: mavis_session=...` hoặc `Bearer <jwt>` của 1 tài khoản SV đã enroll).*
- **Tiêu chí Go để nâng lên `10` slot:** `failPercent < 5%` (≤ 1/30), `bootMs.p95 < 60000`, `controlApiMs.p95 < 3000`, và kiểm tra trên Runner VM sau 10 phút có **0** stack `mavisrun-*` mồ côi (`docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -c '^mavisrun-'`).
- Nếu quá tải đột xuất trong giờ học: hạ nhanh `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS` (ví dụ `10` → `5`) và `MAVIS_WORKER_CONCURRENCY`, restart backend/worker (ngoài thời điểm có phiên chạy).

### 6.5 Backup DB định kỳ & Kiểm tra hằng tuần
- Script backup nằm tại `/opt/mavis/deploy/backup-db.sh`, tạo file `/opt/mavis/db-backups/daily-YYYYMMDDTHHMMSSZ.dump`, kiểm tra toàn vẹn bằng `pg_restore --list`, và giữ lại 14 ngày gần nhất.
- **Chạy tay kiểm chứng ngay sau deploy:**
  ```bash
  bash /opt/mavis/deploy/backup-db.sh
  ls -lh /opt/mavis/db-backups/
  ```
- **Cài cron thủ công** (chỉ cần nếu user chạy `deploy-vps.sh` không phải `root` và log báo bỏ qua `/etc/cron.d/mavis-db-backup`):
  ```bash
  printf '15 3 * * * root /opt/mavis/deploy/backup-db.sh >> /var/log/mavis-db-backup.log 2>&1\n' | sudo tee /etc/cron.d/mavis-db-backup >/dev/null
  sudo chmod 0644 /etc/cron.d/mavis-db-backup
  ```
- **Việc kiểm tra hằng tuần (thủ công):**
  1. Kiểm tra `/var/log/mavis-db-backup.log` và xác nhận có file `daily-*.dump` mới với kích thước > 0 byte.
  2. Tải bản `.dump` mới nhất ra máy khác (off-host) bằng `scp`:
     ```bash
     scp <user>@<control-vps>:/opt/mavis/db-backups/$(ssh <user>@<control-vps> 'ls -t /opt/mavis/db-backups/daily-*.dump | head -n 1 | xargs basename') ./
     ```
  3. Kiểm tra bảng điều khiển nhà cung cấp DB ngoài (Aiven) để xác nhận automated backups / point-in-time recovery vẫn đang bật.

