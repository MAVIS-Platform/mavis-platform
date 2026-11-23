# Studio Live Hardening — Kế hoạch tiếp theo (sau Batch 4A)

> Nền: `main` ahead `origin/main` 5 commit (`71f215d1` → `2b0d9bd5`), **chưa push**.
> Nguồn: phản biện báo cáo `MORNING_REPORT_HARDENING.md` ngày 2026-11-23.
> Quy tắc giữ nguyên: không push trong giờ học, không sửa `.docx`, không thêm dependency, không chạy test vào `.env.backend.local` (Aiven production), không xóa/tắt test.

---

## 1. Phạm vi & Non-Goals

**Làm:** sửa 2 rủi ro mất dữ liệu/giết phiên ở Worker, sửa health REMOTE_WORKER, sửa load test, sửa báo cáo cho khớp code, audit dữ liệu Scale > 3, rồi push + kiểm trên VPS/Runner VM.

**Không làm đợt này:** Task 4.7 (resilience repo .NET), Task 4.8 / Batch 4B (gỡ `docker.sock`), gVisor bắt buộc, Local Runner, Shared Observe, auto-grade, S3/OTLP rewrite, sửa file BM `.docx` (người dùng tự làm theo checklist §4 của `STUDIO_HARDENING_PLAN.md`).

---

## 2. Batch 5 — Sửa code trước khi push (local, 1 commit)

Commit: `hardening(batch-5): safe worker state cleanup, lease-guarded orphan reaper, remote health docker probe, loadtest cookie refresh`

### 5.1 Không xóa receipt chưa ack và manifest khôi phục
- **File:** `MAVIS.Worker/src/MAVIS.Runner/WorkerPoolLoop.cs` → `CleanStaleStateEntries`.
- **Sửa:**
  - Trong `receipts/`: chỉ xóa `<project>.json` khi **đã có** `<project>.ack.json`; xóa cặp `.json` + `.ack.json` + `.delivery.lock` cùng lúc. Receipt chưa ack **không bao giờ xóa** (log cảnh báo nếu > 7 ngày).
  - Ở state root: **luôn bỏ qua** `.allocation-*.json`, `.recovery-*.json`, `.recovery-*.ack.json`.
- **Test** (thêm vào `WorkerPoolHardeningTests.cs`): receipt cũ 10 ngày không có ack → còn nguyên; receipt cũ có ack → bị xóa cả cặp; `.allocation-*` cũ → còn nguyên.

### 5.2 Orphan reaper chỉ chạy trên host chuyên dụng và tôn trọng lease
- **File:** `WorkerPoolLoop.cs` → `RunMaintenanceCycleAsync`; `deploy/compose.runner-worker.yml`.
- **Sửa:**
  1. Chỉ reap khi env `MAVIS_WORKER_DEDICATED_HOST=1`. Đặt mặc định `"1"` trong `compose.runner-worker.yml`, bỏ dòng comment gợi ý "keep `AUTO` for hybrid local + remote workers", thay bằng: *"Không chạy worker này trên Control VPS."*
  2. Trước khi `compose down` một project: thử mở `stateRoot/runner-<project>.lock` với `FileShare.None`; mở **không được** → project đang có tiến trình giữ lease (backend local hoặc worker khác) → **bỏ qua**. (`DockerComposeSession` giữ lock này suốt phiên.)
- **Test:** không có env → 0 lệnh `compose down`; có env + lock đang bị giữ → bỏ qua project đó; có env + lock tự do → reap.

### 5.3 Log dung lượng đĩa đúng chỗ
- **File:** `WorkerPoolLoop.cs` → `GetDockerFreeDiskMiB`.
- **Sửa:** đo trên `stateRoot` (bind mount `/tmp/mavis-runner-state` của host), đổi tên log thành `hostStateFreeMiB`. Thêm `// shortcut: đo ổ chứa /tmp của host, giả định cùng ổ với /var/lib/docker; nâng cấp nếu Runner VM tách ổ Docker.`

### 5.4 Health REMOTE_WORKER vẫn kiểm Docker của Control VPS
- **File:** `RuntimeQueueCoordinator.getRuntimeHealth(Instant)`.
- **Lý do:** ở 4A, control vẫn build image lab qua `docker.sock`.
- **Sửa:** luôn gọi `refreshDockerAndRuntimeProbe()`. Ở `REMOTE_WORKER`, nếu Docker không tới được → `DEGRADED` + cảnh báo *"Control-plane Docker unreachable: lab image builds unavailable."* (không `BLOCKED`).
- **Test:** cập nhật `remoteWorkerHealthRequiresRecentWorkerPollWithin30Seconds` để stub `runHostCommand` trả `docker info` OK; thêm case Docker lỗi → `DEGRADED` có đúng cảnh báo.

### 5.5 Load test: cookie tự refresh + chặn thiếu tài khoản
- **File:** `deploy/loadtest/studio-concurrency.mjs`, `deploy/tests/test_studio_loadtest.mjs`.
- **Sửa:**
  - Chế độ Cookie: mỗi SV ảo giữ cookie jar riêng (chấp nhận dòng auth chứa cả `mavis_session=...; mavis_refresh=...`), cập nhật từ `res.headers.getSetCookie()` sau mỗi response.
  - Nếu số dòng auth < `CONCURRENCY` → thoát mã `2` kèm thông báo (tránh 1 SV mở nhiều phiên làm fail giả).
  - Runbook §6.4: ghi rõ production chỉ dùng được chế độ Cookie (backend Java không public), mỗi dòng cần cả `mavis_session` và `mavis_refresh`.
- **Test stub:** server trả `Set-Cookie: mavis_session=rotated` ở lần gọi thứ 2 → các request sau phải gửi cookie mới; thiếu tài khoản → exit 2.

### 5.6 Sửa báo cáo cho khớp code
- **File:** `docs/ops/MORNING_REPORT_HARDENING.md`.
- **Sửa:**
  - 1.1: "chặn (blocklist) biến env của project có tiền tố `PATH`, `HOME`, `LD_`, `DOTNET_`, `DOCKER_`, `MAVIS_`…" — không phải whitelist.
  - 1.2: "chặn theo **loại project** `STUDENT_WORKING`, trả `403 STUDENT_RUNTIME_CONFIG_FORBIDDEN` ở `saveConfiguration` và `buildSandboxImages`" — không phải theo role.
  - 1.3: trả HTTP **403** `STUDIO_ACTION_NOT_ALLOWED` (không phải 400).
  - §2.1: ghi "194 test **chọn lọc** (11 class)". §2.3: ghi kiểm chứng trình duyệt chạy trên **fixture local**, không phải backend thật.
  - Thêm mục Batch 5 vào bảng trạng thái.

### 5.7 Kiểm Batch 5
```powershell
dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --configuration Release
cd MAVIS-Platform/mavis-be; .\mvnw.cmd -B -ntp -pl mavis-bootstrap -am "-Dsurefire.failIfNoSpecifiedTests=false" "-Dtest=RuntimeQueueCoordinatorTest,RuntimeStudioServiceTest,RuntimeRunnerDispatcherTest,RuntimeSessionServiceImplTest,Wf03AcceptanceMatrixTest" test
node --check deploy/loadtest/studio-concurrency.mjs; node deploy/tests/test_studio_loadtest.mjs
& "C:\Program Files\Git\bin\bash.exe" -n deploy/backup-db.sh deploy/deploy-vps.sh
```
Đạt khi tất cả xanh, `git status` sạch sau commit.

---

## 3. Batch 6 — Audit dữ liệu Scale > 3 (chỉ đọc, người dùng chạy)

**Vì sao:** Batch 3 chặn Scale mới > 3. Lab đã publish có rule/hướng dẫn Scale 4..8 sẽ khiến SV không đạt được rule.

- Agent viết sẵn câu SQL **chỉ đọc** vào Runbook (đọc tên bảng/cột thật từ `V41__Lab_Studio_Exercise.sql` và entity của assignment/lab): tìm `studio_exercise_snapshot` / `studio_exercise` chứa `"replicas"` > 3 hoặc rule SCALE > 3.
- Người dùng chạy trên Aiven console (read-only).
- **Nếu có kết quả:** GV mở từng lab trong editor, sửa về ≤ 3, publish lại. Không viết migration tự động đợt này.

---

## 4. Batch 7 — Push & CI (người dùng xác nhận, ngoài giờ học)

1. `git log --oneline origin/main..HEAD` kiểm danh sách commit.
2. `git push origin main` → `gh run watch <id> --exit-status`.
3. CI phải xanh: `deploy-vps.test.sh` (container), `test_course_schema.py`, toàn bộ backend gồm Postgres integration test, `dotnet test`, frontend `typecheck/test/build`.
4. Smoke test production chỉ đọc (theo §4 bước 4 của báo cáo sáng).
5. Lỗi → `git revert` commit lỗi, push lại. Không sửa nóng trên VPS.

---

## 5. Batch 8 — Vận hành thật (người dùng làm, agent hỗ trợ đọc log)

| # | Việc | Đạt khi |
|---|---|---|
| 8.1 | `bash /opt/mavis/deploy/backup-db.sh` trên Control VPS | Có `daily-*.dump` > 0 byte; `/etc/cron.d/mavis-db-backup` tồn tại; Aiven backup/PITR đang bật |
| 8.2 | Dựng Runner VM (8 vCPU/16 GB/≥100 GB), đặt `MAVIS_RUNNER_SANDBOX_REGISTRY`, bật `REMOTE_WORKER`, chạy `compose.runner-worker.yml` | Admin › Studio = `READY`; log worker có `instrumentationVolume=` và `scenarioRunnerImage=sha256:` |
| 8.3 | Chạy **1 phiên Studio thật** | `RUNNING → COMPLETED`, có span OTel, receipt `PROMOTED`, không có `SCENARIO_CONTAINER_FAILED` / `INSTRUMENTATION_*` (kiểm việc worker thay image runner) |
| 8.4 | Kill worker giữa phiên, khởi động lại | ≤ 10 phút: 0 `mavisrun-*` mồ côi; receipt tồn đọng được gửi; receipt chưa ack **không bị xóa** |
| 8.5 | Load test `CONCURRENCY=10 ROUNDS=3` (Cookie, 10 tài khoản SV) | fail < 5%, boot p95 < 60s, API p95 < 3s, 0 mồ côi sau 10 phút → đặt `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=10`. Không đạt → giữ 2, gửi JSON kết quả cho agent phân tích |

---

## 6. Batch 9 — Để sau, cần người dùng duyệt
- Task 4.7: `AddStandardResilienceHandler()` cho repo `.NET` lớp (nếu muốn dạy Circuit Breaker thật).
- Task 4.8 / Batch 4B: gỡ `docker.sock` khỏi backend sau khi repo lớp dùng image pin `@sha256:`.
- Cập nhật BM `.docx` theo checklist §4 của `STUDIO_HARDENING_PLAN.md` (người dùng tự sửa).

---

## 7. Thứ tự & điểm dừng
Batch 5 (agent) → **dừng, người dùng duyệt** → Batch 6 (song song, người dùng) → Batch 7 (người dùng chọn giờ push) → Batch 8 (theo thứ tự 8.1 → 8.5) → Batch 9 tùy quyết định.
