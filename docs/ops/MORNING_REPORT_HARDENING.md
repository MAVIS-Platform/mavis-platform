# Báo Cáo Nghiệm Thu Sáng — Studio Live Hardening (Batch 1 → Batch 4A)

- **Thời điểm hoàn tất:** 2026-11-23 (local, **chưa `git push`** lên `origin/main` để tránh kích hoạt deploy production tự động).
- **Nhánh:** `main` (4 commit hardening cục bộ trên nền `2b84cf38`, cộng commit báo cáo này).
- **3 quyết định đã khóa (tuân thủ 100%):**
  1. Giữ ảnh snapshot định dạng **PNG**, chỉ thu nhỏ kích thước (`1280 → 960 → 720`, ≤ `440_000` ký tự FE / `450_000` ký tự BE), không chuyển JPEG.
  2. Profile thực thi mặc định **`512 MiB` / `0.5 CPU` / `300s`** (không hạ 384 MiB để tránh RabbitMQ chạm ngưỡng báo động bộ nhớ 40%).
  3. Giữ nguyên cơ chế ký HMAC/SHA-256 ở backend, song ngữ EN/VI, giao diện sạch ở `1366×768`, 3D view, Light/Dark theme và các panel kéo/resize.
- **Khóa phạm vi:** Không sửa bất kỳ file `.docx` BM nào, không thêm dependency mới (`package.json`, `pom.xml`, `*.csproj` đều sạch), không làm Task 4.7 / 4.8 (Batch 4B).

---

## 1. Bảng Trạng Thái Từng Task (Batch 1 → Batch 4A)

| Batch | Task | Nội dung tóm tắt | Trạng thái | Commit |
|---|---|---|---|---|
| **Batch 1** | 1.1 | Chặn (blocklist) biến env của project có tiền tố `PATH`, `HOME`, `TMPDIR`, `SHELL`, `ENV`, `BASH_ENV`, `LD_`, `DOTNET_`, `COREHOST_`, `CORECLR_`, `ASPNETCORE_`, `DOCKER_`, `MAVIS_` trong `RuntimeRunnerDispatcher.java` | `DONE` | `71f215d1` |
| **Batch 1** | 1.2 | Chặn ghi `runtime-config` và build sandbox image theo loại project `STUDENT_WORKING` (trả HTTP `403 STUDENT_RUNTIME_CONFIG_FORBIDDEN` ở `saveConfiguration` và `buildSandboxImages`) | `DONE` | `71f215d1` |
| **Batch 1** | 1.3 | Enforce `allowedActions` ở server trong `RuntimeStudioService.submit()` (trả HTTP `403 STUDIO_ACTION_NOT_ALLOWED`) | `DONE` | `71f215d1` |
| **Batch 1** | 1.4 | Sửa `saveVisualExercise` ở `standalone-studio-live.tsx` giữ đủ 5 trường Change Impact | `DONE` | `71f215d1` |
| **Batch 1** | 1.5 | Sửa `docker container prune -f --filter 'label!=com.docker.compose.project'` ở CI & `deploy-vps.sh`, thêm vòng drain `mavisrun-*` (360s), nâng timeout deploy lên 25 phút | `DONE` *(containerized `deploy-vps.test.sh`: `READY_FOR_OPS_VERIFY` trên CI)* | `71f215d1` |
| **Batch 2** | 2.1 | Tự mở panel Change Impact Prediction 1 lần/phiên khi bài yêu cầu + cảnh báo amber trong Lab Mission | `DONE` *(đã kiểm chứng trên Chromium local `1366×768`)* | `efe55506` |
| **Batch 2** | 2.2 | Khóa nút `Finish Studio` khi 0 snapshot kèm tooltip song ngữ | `DONE` *(đã kiểm chứng trên Chromium local `1366×768`)* | `efe55506` |
| **Batch 2** | 2.3 | Đồng bộ nút Light/Dark (`CPU 25/50/100%`, `SET_LOAD 5/15/30/50 RPS`), helper `servicePhase()`, sửa `Resume` ở cả Light & Dark, trạng thái `Paused` ở Dark mode | `DONE` *(đã kiểm chứng trên Chromium local `1366×768`)* | `efe55506` |
| **Batch 2** | 2.4 | Xóa `sampleDossier`/`flawedSample`, điểm preview `8.8` và các field `RubricPreview`/`ScorePreview` ở `lab-submission-v2.tsx` | `DONE` | `efe55506` |
| **Batch 2** | 2.5 | Nút `Open Studio Canvas` ở Admin trỏ `/workspaces` (`Open Studio Live (choose a lab)`), bỏ `/administration/studio` | `DONE` | `efe55506` |
| **Batch 2** | 2.6 | Hiển thị `exerciseEvaluation` mở sẵn dạng `"Auto-check (grading hint, not a score)"` (F1 %, chip TP/FP/FN, checklist rule) ở màn chấm bài của GV | `DONE` *(đã kiểm chứng trên Chromium local `1366×768`)* | `efe55506` |
| **Batch 3** | 3.1 | Đặt profile mặc định `512 MiB / 0.5 CPU / 300s` (`PlatformRuntimeSettings.java`) + sửa fallback `cpus` mặc định `1.0 → limit.cpus()` (`RuntimeSessionServiceImpl.java`) | `DONE` | `dd9191aa` |
| **Batch 3** | 3.2 | Giới hạn `Scale 1..3` cho thao tác mới ở BE (`RuntimeStudioService`, `LabStudioExerciseService`, `RuntimeSessionServiceImpl`, `RuntimePlanningService`, `CsharpCourseraCatalog`), `.NET` Runner (`DockerComposeSession.cs`), và FE; giữ nguyên validator lịch sử `≤ 8` | `DONE` | `dd9191aa` |
| **Batch 3** | 3.3 | Thu nhỏ ảnh snapshot **PNG** (`1280 → 960 → 720`, ≤ `440_000` ký tự FE / `450_000` ký tự BE) | `DONE` | `dd9191aa` |
| **Batch 3** | 3.4 | Giãn `docker compose cp mavis-collector:/traces/.` mỗi lần publish thứ 3 (hoặc ngay sau action ack) và giãn readiness poll lên `2000ms` | `DONE` | `dd9191aa` |
| **Batch 3** | 3.5 | Bỏ `recordUiHeartbeat` khỏi SSE keepalive (`StudioTelemetryHub`), thêm heartbeat theo tab hiển thị 30s + `visibilitychange` (`use-studio-session.ts`), sửa reaper quét `QUEUED` không xóa nhầm heartbeat `QUEUED` đang sống (`RuntimeQueueCoordinator`), hiển thị thông báo song ngữ khi phiên chờ bị hủy | `DONE` | `dd9191aa` |
| **Batch 3** | 3.6 | Cấu hình `MAVIS_RUNTIME_MAX_QUEUED_STUDIO_SESSIONS` / `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS` trên `.env.production` VPS (chỉ cấu hình, đã ghi rõ trong Runbook §6.4) | `READY_FOR_OPS_VERIFY` | `41bf46f1` *(Runbook)* |
| **Batch 4A** | 4.0 | Người dùng chuẩn bị Runner VM (Ubuntu 24.04, 8 vCPU / 16 GB / ≥ 100 GB SSD) + cấu hình `MAVIS_RUNNER_SANDBOX_REGISTRY` | `READY_FOR_OPS_VERIFY` *(thuộc bước thủ công của người dùng)* | — |
| **Batch 4A** | 4.1 | Worker tự đủ trong `WorkerPoolLoop.cs` + `ManagedRuntimeAdapter.cs`: tự seed volume OTel (`mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3` đúng 4 label), tự build `mavis-poc-runner:4` nếu thiếu, tự override `scenarioRunnerImage` placeholder/`mcr.microsoft.com/dotnet/aspnet`/missing-local và volume lỗi thời | `DONE` *(test đơn vị xanh; chạy end-to-end trên Runner VM thật: `READY_FOR_OPS_VERIFY`)* | `41bf46f1` |
| **Batch 4A** | 4.2 | Worker hygiene mỗi 5 phút + startup `deliver-pending` (`WorkerPoolLoop.cs`): dọn `mavisrun-*` mồ côi, `image/builder prune`, xóa `mavis-sandbox-*` không dùng > 14 ngày, dọn state root > 7 ngày, log `diskFreeMiB`. Backend ghi `lastWorkerPollAt` (ở `/claim` và `studio/commands` poll) và trả `READY`/`DEGRADED` theo ngưỡng 30s ở `REMOTE_WORKER` | `DONE` *(test đơn vị BE + .NET xanh; xác minh kill-worker thật trên Runner VM: `READY_FOR_OPS_VERIFY`)* | `41bf46f1` |
| **Batch 4A** | 4.3 | Tài liệu hóa quy trình bật `MAVIS_RUNNER_MODE=REMOTE_WORKER` và khởi chạy `deploy/compose.runner-worker.yml` (giữ nguyên `docker.sock` trên control plane cho giai đoạn 4A) | `READY_FOR_OPS_VERIFY` *(chuyển công tắc trên VPS thật)* | `41bf46f1` |
| **Batch 4A** | 4.4 | Thêm `--backup-only <dest>` vào `deploy/apply-course-schema.py`, tạo `deploy/backup-db.sh` (LF, `chmod +x`), cập nhật `deploy/deploy-vps.sh` (copy cả `apply-course-schema.py` & `backup-db.sh` + cài `/etc/cron.d/mavis-db-backup` idempotent) và `.github/workflows/deploy-production.yml` (`retry_scp`) | `DONE` *(chạy `backup-db.sh` thật trên VPS + kiểm tra Aiven backup: `READY_FOR_OPS_VERIFY`)* | `41bf46f1` |
| **Batch 4A** | 4.5 | Tạo script load test zero-dependency `deploy/loadtest/studio-concurrency.mjs` (hỗ trợ cả Cookie `/api/backend`+`/api/mavis` lẫn Bearer `/api/v1`, xuất JSON Go/No-Go) + test stub end-to-end `deploy/tests/test_studio_loadtest.mjs` | `DONE` *(test stub xanh; chạy 10 phiên × 3 vòng thật trên Runner VM: `READY_FOR_OPS_VERIFY`)* | `41bf46f1` |
| **Batch 4A** | 4.6 | Bổ sung §6 Ops Runbook vào cuối `docs/ops/STUDIO_HARDENING_PLAN.md` | `DONE` | `41bf46f1` |
| **Batch 5** | 5.1 | Giữ nguyên receipt chưa có `.ack.json` và các manifest `.allocation-*` / `.recovery-*`; chỉ xóa cặp receipt đã ack cũ > 7 ngày trong `WorkerPoolLoop.cs` | `DONE` | *(Batch 5)* |
| **Batch 5** | 5.2 | Khóa orphan reaper sau `MAVIS_WORKER_DEDICATED_HOST=1` (`compose.runner-worker.yml` đặt mặc định `1`, bỏ gợi ý hybrid trên Control VPS) và bỏ qua project đang giữ lock `runner-<project>.lock` | `DONE` | *(Batch 5)* |
| **Batch 5** | 5.3 | Đo dung lượng đĩa trống trên `stateRoot` (bind mount của host) và đổi tên log thành `hostStateFreeMiB` | `DONE` | *(Batch 5)* |
| **Batch 5** | 5.4 | Khôi phục `refreshDockerAndRuntimeProbe()` trong `RuntimeQueueCoordinator.getRuntimeHealth` ở chế độ `REMOTE_WORKER` (trả `DEGRADED` khi Docker control-plane lỗi ở 4A) | `DONE` | *(Batch 5)* |
| **Batch 5** | 5.5 | Thêm cookie jar tự cập nhật `Set-Cookie` và chặn thoát mã `2` nếu thiếu tài khoản (`< CONCURRENCY`) trong `studio-concurrency.mjs` + test stub | `DONE` | *(Batch 5)* |
| **Batch 5** | 5.6 | Sửa mô tả Batch 1 / phạm vi test trong báo cáo sáng cho khớp code và thêm câu SQL chỉ đọc kiểm Scale > 3 (Batch 6) vào Runbook §6.6 | `DONE` | *(Batch 5)* |

**Không có task nào `BLOCKED`.**

---

## 2. Bằng Chứng Kiểm Thử & Build

### 2.1 Java Backend (`mavis-be`, Java 21)
Lệnh chạy bộ **194 test chọn lọc (11 class)** bao phủ các unit + acceptance test liên quan từ Batch 1 đến Batch 4A (không phải toàn bộ test suite của backend):
```powershell
cd MAVIS-Platform/mavis-be
.\mvnw.cmd -B -ntp -pl mavis-bootstrap -am "-Dsurefire.failIfNoSpecifiedTests=false" "-Dtest=RuntimeRunnerDispatcherTest,RuntimeSessionServiceImplTest,RuntimeStudioServiceTest,RuntimePlanningServiceTest,RuntimeQueueCoordinatorTest,StudioExerciseEvaluatorTest,StudioTelemetryHubTest,CourseLabStudentServiceTest,LabStudioExerciseServiceTest,Wf03AcceptanceMatrixTest,RunnerReceiptIngestServiceImplTest" test
```
**Kết quả:** `BUILD SUCCESS` — **194/194 test chọn lọc PASS, 0 Failures, 0 Errors, 0 Skipped**:
- `mavis-platform`: `LabStudioExerciseServiceTest` (6)
- `mavis-analyzer`: `RunnerReceiptIngestServiceImplTest` (23), `RuntimeQueueCoordinatorTest` (16 — gồm test mới `QUEUED` reaper + `REMOTE_WORKER` heartbeat 30s), `RuntimeRunnerDispatcherTest` (16), `RuntimeSessionServiceImplTest` (31), `RuntimePlanningServiceTest` (33), `RuntimeStudioServiceTest` (25), `StudioExerciseEvaluatorTest` (5), `StudioTelemetryHubTest` (2) → 151 tests
- `mavis-bootstrap`: `Wf03AcceptanceMatrixTest` (28), `CourseLabStudentServiceTest` (9) → 37 tests

> **Ghi chú trung thực về phạm vi local:** Không chạy `*ApiIntegrationTest` / `*PostgresTest` trên máy local vì file `.env.backend.local` đang trỏ tới **Aiven PostgreSQL production DB thật** và Docker Desktop local đang tắt. Các integration test Spring+Postgres và `deploy/tests/deploy-vps.test.sh` (trong container Alpine) sẽ chạy tự động trên GitHub Actions CI với Postgres disposable khi người dùng quyết định push.

### 2.2 `.NET` Worker & Runner (`MAVIS.Worker`, .NET 10 SDK)
Lệnh chạy cuối Batch 4A:
```powershell
dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --configuration Release --verbosity normal
```
**Kết quả:** `Build succeeded (0 Warnings, 0 Errors)` — **282 Passed, 0 Failed, 6 Skipped** (288 total; 6 skipped là các Docker-daemon integration tests tự skip khi không có Docker daemon local; đã chạy xanh 4 test mới trong `WorkerPoolHardeningTests.cs` và test `SCALE 1..3` / reject `4` trong `StudioInfrastructureActionTests.cs`).

### 2.3 Frontend (`MAVIS-Frontend`, Node v24.14.0)
Lệnh chạy cuối Batch 4A:
```powershell
cd MAVIS-Frontend
npm run typecheck
npm test
npm run build   # chạy xác nhận cuối Batch 2 (16.5s) và Batch 3 (8.6s); Batch 4A không sửa FE
```
**Kết quả:**
- `tsc --noEmit --incremental false`: **0 errors**
- `npm test`: **541/541 PASS, 0 Failed, 0 Skipped**
- `next build`: **PASS** (Batch 2: `16.5s`, Batch 3: `8.6s`)
- Kiểm chứng trình duyệt Chromium headless tích hợp sẵn ở `1366×768` chạy trên **fixture server giả lập cục bộ** (không phải backend thật có Docker, Batch 2): **4/4 PASS** (Light auto-open Prediction + cảnh báo amber + preset CPU/Load + 0 overflow; Light Pause → `PAUSED` + `Resume` mở + `Finish Studio` khóa khi 0 snapshot; Dark Pause/Resume/Stop đồng nhất; màn chấm `?view=grading` mở sẵn `Auto-check` F1 100% + chip TP + rule).

### 2.4 Deploy Scripts, Schema Backup & Concurrency Load Test
```powershell
& "C:\Program Files\Git\bin\bash.exe" -n deploy/backup-db.sh deploy/deploy-vps.sh deploy/tests/deploy-vps.test.sh
python -B deploy/tests/test_course_schema.py
node --check deploy/loadtest/studio-concurrency.mjs
node deploy/tests/test_studio_loadtest.mjs
```
**Kết quả:**
- `bash -n`: **PASS** (0 lỗi cú pháp; đã chuẩn hóa pure LF cho `deploy/backup-db.sh` và `deploy/deploy-vps.sh`).
- `test_course_schema.py`: **Ran 10 tests — OK (skipped=1)** (gồm test mới `test_backup_only_cli_mode_invokes_postgres_backup_without_migration`; 1 skipped yêu cầu `MAVIS_TEST_PG_CONTAINER`).
- `test_studio_loadtest.mjs`: **PASS** — xác minh toàn luồng `startSession → poll RUNNING → STOP/START CONFIRMED → capture (không ảnh) → finish COMPLETED → Go/No-Go JSON` cho **cả hai chế độ** `Cookie` (`/api/backend` + `/api/mavis/*` kèm header `Origin`) và `Bearer` (`/api/v1/*`).

---

## 3. Các Sai Lệch / Điều Chỉnh So Với Kế Hoạch Gốc (`STUDIO_HARDENING_PLAN.md`)

Tất cả các điều chỉnh dưới đây đều xuất phát từ lỗi thật phát hiện khi đối chiếu mã nguồn và chạy test — không mở rộng phạm vi trái Non-Goals:

1. **Batch 2 (`live-sandbox-parity.tsx`):** Bổ sung hiển thị trạng thái `Paused` và khóa nút `Start` khi service đang `PAUSED` ở Dark mode để khớp hoàn toàn với helper `servicePhase()` của Light mode (Task 2.3).
2. **Batch 2 (`administration/screens.tsx`):** Không gắn link mở từng phiên cụ thể theo dòng vì `runtimeReadSchema` không chứa `workspaceId` (đã đúng ghi chú trong Task 2.5); giữ nút top-level trỏ `/workspaces`.
3. **Batch 3 (`RuntimeSessionServiceImpl.java` ~L1619):** Khi hạ profile mặc định xuống `512 MiB / 0.5 CPU`, 6 test trong `RuntimeSessionServiceImplTest` phát hiện bug thật: code cũ fallback `pinnedProfile.path("cpus").asDouble(1)` khi `cpus` bị bỏ trống, khiến `1.0 > 0.5` bị từ chối oan. Đã sửa thành `asDouble(limit.cpus())`.
4. **Batch 3 (`RuntimePlanningService.java`, `studio-exercise-editor.tsx`, `locale-context.tsx`):** Đồng bộ thêm 3 chỗ còn nhắc giới hạn `Scale 1..8` ngoài danh sách dòng ước lượng trong plan để UI tác giả bài tập, i18n và backend plan nhất quán `1..3`.
5. **Batch 4A (`deploy/deploy-vps.sh`):** Ngoài copy `backup-db.sh` và cài `/etc/cron.d/mavis-db-backup`, bổ sung dòng copy `$incoming/apply-course-schema.py` sang `/opt/mavis/deploy/apply-course-schema.py` — trước đây `deploy-vps.sh` chưa copy file này sang `/opt/mavis/deploy/`, nếu thiếu thì cron `backup-db.sh` sẽ lỗi không tìm thấy `--backup-only`.
6. **Batch 4A (`RuntimeStudioService.java` `poll()`):** Ghi thêm `queueCoordinator.recordWorkerPoll()` khi worker gọi `/studio/commands` (ngoài `/workers/claim`), tránh trường hợp worker đang chạy full 10/10 slot bị kẹt chờ semaphore không gọi `/claim` trong > 30s rồi bị báo nhầm `DEGRADED`.
7. **Batch 4A (`deploy/tests/test_studio_loadtest.mjs`):** Thêm 1 test nhỏ tự chạy bằng `node:http` stub để xác minh `deploy/loadtest/studio-concurrency.mjs` không bị lỗi runtime trước khi chạy trên VPS thật.
8. **Chênh lệch số dòng:** Một số anchor `~Lnnn` trong `STUDIO_HARDENING_PLAN.md` (tính tại `2b84cf38`) đã dịch nhẹ sau các commit Batch 1–3; mọi sửa đổi đều đối chiếu trực tiếp theo symbol/logic thực tế.

---

## 4. Checklist Vận Hành Thủ Công Buổi Sáng (Cho Người Dùng)

Thực hiện theo thứ tự, **ngoài giờ học**:

1. **Kiểm tra nhanh lịch sử commit cục bộ trước khi push:**
   ```bash
   git log --oneline -6
   git diff --stat origin/main..HEAD
   ```
2. **Push lên `main` (ngoài giờ học) và theo dõi GitHub Actions CI/Deploy:**
   - CI sẽ chạy đầy đủ `deploy-vps.test.sh` (trong Docker Alpine), `test_course_schema.py`, full backend suite (gồm Postgres integration tests), `.NET` tests, và Frontend build/tests trước khi deploy lên Control VPS.
3. **Kiểm tra DB Backup trên Control VPS + Aiven (Task 4.4):**
   - Trên Control VPS chạy tay 1 lần để kiểm chứng:
     ```bash
     bash /opt/mavis/deploy/backup-db.sh
     ls -lh /opt/mavis/db-backups/
     ```
   - Xác nhận `/etc/cron.d/mavis-db-backup` đã được tạo (nếu user deploy không phải `root`, làm theo lệnh `sudo tee` trong Runbook §6.5).
   - Đăng nhập bảng điều khiển **Aiven** xác nhận automated backups / PITR vẫn đang bật.
4. **Kiểm chứng nhanh trên trình duyệt production (`https://maviss.site`, `1366×768`):**
   - Mở một Lab có yêu cầu Change Impact: xác nhận panel Prediction tự mở, `Finish Studio` khóa khi 0 snapshot, Pause/Resume + CPU/Load đủ ở cả Light & Dark, Scale chỉ còn `×1 / ×2 / ×3`, chụp snapshot PNG < 450 KB (DevTools Network).
   - Mở trang chấm bài của GV: xác nhận khung `"Auto-check (grading hint, not a score)"` mở sẵn.
   - Mở **Admin › Studio**: xác nhận nút dẫn về `/workspaces` và `surveyReadiness = READY`.
5. **Tách Runner VM & chạy cổng Go/No-Go Load Test (Tasks 4.0, 4.3, 4.5, 3.6):**
   - Dựng Runner VM (8 vCPU / 16 GB / ≥ 100 GB SSD) + cấu hình `MAVIS_RUNNER_SANDBOX_REGISTRY` trên Control VPS.
   - Bật `MAVIS_RUNNER_MODE=REMOTE_WORKER` + `MAVIS_RUNTIME_MAX_QUEUED_STUDIO_SESSIONS=40` (giữ `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2`) và khởi chạy `deploy/compose.runner-worker.yml` trên Runner VM (xem Runbook §6.3–6.4 trong `docs/ops/STUDIO_HARDENING_PLAN.md`).
   - Chạy thử 1 phiên Studio thật xác nhận `RUNNING → COMPLETED` có span OTel và receipt ingest thành công, không báo `SCENARIO_CONTAINER_FAILED` hay `INSTRUMENTATION_BUNDLE_UNAVAILABLE`.
   - Chạy `deploy/loadtest/studio-concurrency.mjs` (`CONCURRENCY=10 ROUNDS=3`). Chỉ nâng `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=10` khi đạt đủ 4 tiêu chí Go (`fail < 5%`, `boot p95 < 60s`, `control API p95 < 3s`, và `0` stack `mavisrun-*` mồ côi sau 10 phút).
6. **Quyết định sau 4A:** Task 4.7 (thêm `AddStandardResilienceHandler()` vào repo `.NET` lớp) và Task 4.8 (Batch 4B — gỡ `docker.sock` khỏi backend sau khi repo lớp dùng image pin `@sha256:`) chỉ thực hiện sau khi bạn xác nhận.

---

## 5. `git status` Cuối Cùng

Trạng thái cây làm việc ngay trước khi commit file báo cáo này (`git status -sb` sau commit sẽ hoàn toàn sạch — 0 file modified, 0 file untracked, nhánh `main` ahead `origin/main` 5 commits cục bộ):

```text
## main...origin/main [ahead 4]
?? docs/ops/MORNING_REPORT_HARDENING.md
```

Các commit cục bộ đã tạo (chưa push):
- `71f215d1` — `hardening(batch-1): filter runner env, lock student runtime-config, enforce allowedActions, preserve author exercise, drain deploy`
- `efe55506` — `hardening(batch-2): fix studio UX traps, unify light/dark controls, show grading hint`
- `dd9191aa` — `hardening(batch-3): tune 512m/0.5cpu profile, cap scale 1..3, downscale PNG snapshots, throttle trace cp, reap abandoned queued sessions`
- `41bf46f1` — `hardening(batch-4a): self-sufficient remote worker, orphan/disk reaper, daily db backup, concurrency load test, ops runbook`
- *(HEAD)* — `docs(ops): add morning hardening verification report`
