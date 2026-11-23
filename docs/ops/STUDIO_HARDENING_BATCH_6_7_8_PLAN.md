# Studio Live Hardening — Kế hoạch Batch 6 · 7 · 8

> **Trạng thái nền (2026-11-23):** `main` đi trước `origin/main` 7 commit, **chưa push**:
> `71f215d1` (B1) → `efe55506` (B2) → `dd9191aa` (B3) → `41bf46f1` (B4A) → `2b0d9bd5` (báo cáo) → `7778a6ba` (B5) → `81f3d744` (B5.1).
>
> **Quy tắc giữ nguyên:** không push/merge vào `main` trong giờ học; không sửa `.docx`; không thêm dependency; không chạy test vào `.env.backend.local` (Aiven production); không xóa/tắt test; mọi câu SQL trên production đều **chỉ đọc**.
>
> **Ký hiệu người làm:** 🤖 agent làm ở local · 👤 người dùng làm (VPS, Aiven, GitHub, trình duyệt).

---

## 0. Ba phát hiện mới khi lập kế hoạch này (ảnh hưởng trực tiếp Batch 7–8)

1. **Runner VM hiện không gọi được Java API.** Worker gọi `https://maviss.site/api/v1/analyzer/runtime/...` (claim, run-definition, receipt, studio commands/telemetry/ack). Nhưng trong `deploy/compose.production.yml`, backend chỉ `expose: 8080` (không publish port ra host), và Nginx trên VPS (nằm ngoài repo, theo `deploy/CI-CD.md`) chỉ trỏ vào frontend `:3000`. Next.js BFF không chuyển tiếp `/api/v1/*`. → **Nếu không sửa, bật `REMOTE_WORKER` sẽ làm hàng đợi đứng hoàn toàn.** Cần Task 7.0a + 8.2.
2. **Ở `REMOTE_WORKER`, giới hạn số phiên thật là `MAVIS_WORKER_CONCURRENCY` trên Runner VM**, không phải `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS`: `claimNextQueuedForRemoteWorker` không kiểm số phiên đang chạy. Biến `MAX_ACTIVE` khi đó chỉ dùng cho hiển thị (`maxSlots`) và cho `CourseLabStudentService`. → Runbook §6.3 đang ghi khởi động worker với `MAVIS_WORKER_CONCURRENCY=10` ngay từ đầu là **sai** so với cổng Go/No-Go. Cần sửa ở Task 7.0b.
3. **CI không build image Runner worker** (`images` chỉ build `backend`, `frontend`, `worker` từ `Dockerfile.production`). `compose.runner-worker.yml` build tại chỗ từ `MAVIS.Worker/Dockerfile.runner` với context `..`. → Runner VM **phải clone repo** đúng commit đã deploy rồi `--build`.

---

## 1. Batch 6 — Audit dữ liệu Scale > 3 (👤, chỉ đọc, làm TRƯỚC khi push)

**Mục tiêu:** biết trước lab nào sẽ "kẹt rule" sau khi Batch 3 giới hạn Scale mới về `1..3`, để sửa ngay trong cùng cửa sổ bảo trì với deploy.

### 6.1 Chạy câu SQL (5 phút)
- **Nơi chạy:** Aiven Console → service PostgreSQL → *Query editor*, hoặc `psql` với URL production.
- **Bắt buộc chạy trong transaction chỉ đọc:**
  ```sql
  BEGIN READ ONLY;
  -- dán nguyên câu SQL ở docs/ops/STUDIO_HARDENING_PLAN.md §6.6
  ROLLBACK;
  ```
- Câu SQL quét cả bản nháp (`lab_studio_exercises.success_criteria`) lẫn bản đã publish (`assignments.studio_exercise_snapshot -> 'successCriteria'`), bắt 4 dấu hiệu: `minReplicas[].count > 3`, `targetChangeAction.action = 'SCALE'` với `replicas > 3`, rule `metric = 'REPLICAS'` với `threshold > 3`, và chữ trong `instructions` có dạng "scale … 4–9" / "×4–9".

### 6.2 Đọc kết quả
| Kết quả | Hành động |
|---|---|
| **0 dòng** | Ghi "Batch 6: 0 lab bị ảnh hưởng" vào báo cáo sáng. Xong. |
| Dòng chỉ khớp `instructions` | Có thể là dương tính giả (regex chữ). Đọc tay, chỉ sửa nếu thật sự yêu cầu SV scale > 3. |
| Dòng khớp `minReplicas` / `targetChangeAction` / `rules` | **Lab bị ảnh hưởng thật.** Ghi lại `workspace_id`, `assignment_id`, `title`, `source` vào bảng ở 6.3. |

### 6.3 Sửa lab bị ảnh hưởng (👤 GV, làm **ngay sau deploy Batch 7**, trước buổi học kế tiếp)
- Lý do làm sau deploy: editor mới (`LabStudioExerciseService`) chặn giá trị > 3, nên GV buộc phải nhập đúng.
- Với từng lab: mở Studio exercise editor của lab → sửa mọi Scale/replicas về `≤ 3` (gợi ý: `1 → 3`) → lưu → **publish lại** để cập nhật `assignments.studio_exercise_snapshot` (snapshot chỉ được ghi lúc publish).
- Chạy lại câu SQL 6.1 → phải còn 0 dòng khớp ở 3 cột cấu trúc.

| workspace_id | assignment_id | title | source | Giá trị cũ | Đã sửa? |
|---|---|---|---|---|---|
| | | | | | |

**Đạt khi:** câu SQL chạy lại không còn dòng nào khớp `minReplicas` / `targetChangeAction` / `rules`.

---

## 2. Batch 7 — Chuẩn bị, push & CI

### 7.0 🤖 Sửa nốt trước khi push (1 commit `hardening(batch-7.0)`)
- **7.0a — Mở đường cho Runner VM gọi Java API (chỉ trên loopback):** `deploy/compose.production.yml`, service `backend`: thêm
  ```yaml
  ports:
    - "127.0.0.1:${MAVIS_BE_PORT:-8081}:8080"
  ```
  Chỉ bind `127.0.0.1` nên **không lộ ra internet**; chỉ Nginx trên chính VPS mới tới được. Kiểm: `deploy/tests/deploy-vps.test.sh` (cú pháp) và mắt đọc lại compose.
- **7.0b — Sửa Runbook `STUDIO_HARDENING_PLAN.md` §6.3–6.4:**
  - Khởi động worker với `MAVIS_WORKER_CONCURRENCY=2`; chỉ nâng lên `10` sau cổng Go/No-Go.
  - Ghi rõ: ở `REMOTE_WORKER`, `MAVIS_WORKER_CONCURRENCY` là giới hạn thật; đặt `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS` **bằng** giá trị đó để UI hiển thị đúng số slot.
  - Thêm mục Nginx (snippet ở 8.2) và yêu cầu clone repo trên Runner VM.
- **7.0c — Báo cáo sáng:** thay "(commit Batch 5.1)" bằng `81f3d744`; thêm dòng Batch 7.0.
- **Kiểm:** `bash -n` các script deploy; `python -B deploy/tests/test_course_schema.py`; `git status` sạch.

### 7.1 👤 Chạy CI "khô" bằng Pull Request (làm lúc nào cũng được, **không deploy**)
Workflow `Build and deploy production` chạy job `verify` + `runtime-docker` cho `pull_request`, nhưng job `images` và `deploy` bị bỏ qua (`if: github.event_name != 'pull_request'`, `if: github.ref == 'refs/heads/main'`). Vì vậy kiểm CI qua PR là an toàn trong giờ học.
```bash
git push origin main:hardening/studio-batch-1-7
gh pr create --base main --head hardening/studio-batch-1-7 \
  --title "Studio Live hardening (Batch 1–7.0)" \
  --body "Xem docs/ops/MORNING_REPORT_HARDENING.md"
gh pr checks --watch
```
(Không có `gh`: tạo PR trên giao diện GitHub, xem tab *Checks*.)

**CI phải xanh toàn bộ** — đây là lần đầu chạy những test không chạy được ở local:
| Bước CI | Kiểm cái gì local chưa kiểm |
|---|---|
| `Deployment and rollback tests` | `deploy-vps.test.sh` trong container (drain phiên, prune có filter, cron backup) |
| `WF-01 schema preparation tests` | `test_course_schema.py` gồm `--backup-only` |
| `Backend regression tests` | ~80 class, **gồm** `RuntimeStudioApiIntegrationTest`, `*PostgresTest`, `MigrationUpgradeTest` trên Postgres CI riêng |
| `Worker tests` | `dotnet test` (291 test) |
| `Frontend tests` + `Production route render smoke test` | `typecheck`, 541 test, `next build`, render route |
| `runtime-docker` (`bm04-docker-qa.yml`) | 6 test Docker-daemon `.NET` bị skip ở local |

**Nếu fail:** 🤖 agent đọc log CI, sửa tối đa 3 vòng trên nhánh PR (commit mới, không force-push sửa lịch sử), không tắt/xóa test. Quá 3 vòng → dừng, báo người dùng.

### 7.2 👤 Merge & deploy (chỉ **ngoài giờ học**, khi không có phiên Studio đang chạy)
1. Kiểm Admin › Studio: `activeSessions = 0` (hoặc chấp nhận `deploy-vps.sh` chờ drain tối đa 360s).
2. Merge PR vào `main` (merge commit hoặc fast-forward đều được). Push lên `main` kích hoạt `verify → runtime-docker → images → deploy`.
3. Theo dõi: `gh run watch --exit-status` (hoặc tab *Actions*). Tổng thời gian dự kiến ~30–45 phút.
4. `deploy-vps.sh` tự health-check và **tự rollback** về image cũ nếu stack mới không khỏe.

### 7.3 👤 Smoke test production chỉ đọc (15 phút, `https://maviss.site`, cửa sổ `1366×768`)
| # | Kiểm | Đạt khi |
|---|---|---|
| a | Đăng nhập GV & SV, mở danh sách lớp | Không lỗi 5xx |
| b | SV mở một lab có yêu cầu Change Impact | Panel Prediction tự mở; `Finish Studio` bị khóa khi 0 snapshot |
| c | Nút Scale trên canvas | Chỉ còn `×1 / ×2 / ×3` |
| d | Light & Dark: Pause → Resume, CPU, Load | Đủ nút ở cả 2 theme |
| e | Chụp 1 snapshot (DevTools › Network) | Request `studioCapture` < 450 KB, ảnh PNG |
| f | GV mở bài nộp có phiên đã khóa dự đoán | Khung "Auto-check (grading hint, not a score)" mở sẵn |
| g | Admin › Studio | Nút dẫn về `/workspaces`; `surveyReadiness = READY` (vẫn ở chế độ `AUTO`) |
| h | Trên VPS: `docker compose -p mavis ps` | `backend`, `frontend`, `worker` đều `Up`; `ss -ltn | grep 8081` chỉ thấy `127.0.0.1:8081` |

### 7.4 Rollback
- Lỗi phát hiện sau deploy: `git revert <sha-commit-lỗi>` → PR → merge ngoài giờ học. **Không sửa nóng trên VPS.**
- Khẩn cấp (hệ thống không dùng được trong giờ học): trên VPS `cat /opt/mavis/.release.env` để lấy tag cũ trong lịch sử deploy, rồi chạy lại `deploy-vps.sh` với commit trước đó theo `deploy/CI-CD.md`.

### 7.5 Sau deploy
- Làm Batch 6.3 (sửa lab Scale > 3) nếu 6.2 có kết quả.
- 8.1 (backup) có thể làm ngay trong cùng cửa sổ.

---

## 3. Batch 8 — Vận hành thật: backup, Runner VM, load test

> **Thứ tự bắt buộc:** 8.1 → 8.2 → 8.3 → 8.4 → 8.5 → 8.6 → 8.7 → 8.8. Mỗi bước có tiêu chí đạt; **không đạt thì dừng**, chụp log gửi agent phân tích.
> Mọi thao tác đổi chế độ chạy (8.4, 8.8) chỉ làm **ngoài giờ học**.

### 8.1 👤 Backup DB lần đầu (Control VPS, 10 phút)
```bash
bash /opt/mavis/deploy/backup-db.sh
ls -lh /opt/mavis/db-backups/daily-*.dump
cat /etc/cron.d/mavis-db-backup || echo "MISSING cron"
```
- Thiếu cron → cài tay theo Runbook §6.5.
- Kiểm Aiven Console: *Backups* bật, PITR (nếu gói hỗ trợ) bật.
- Tải 1 bản `.dump` về máy khác (lệnh `scp` ở §6.5).

**Đạt khi:** có file `daily-*.dump` > 0 byte, cron tồn tại, Aiven backup đang bật, có 1 bản sao ngoài VPS.

### 8.2 👤 Mở đường Runtime API cho Runner VM (Control VPS, 20 phút — cần 7.0a đã deploy)
1. Cấp Runner VM (xem 8.3 bước 1) **trước** để có IP tĩnh `RUNNER_VM_IP`.
2. Thêm vào server block HTTPS của `maviss.site` trong Nginx (đặt **trước** `location /`):
   ```nginx
   location /api/v1/analyzer/runtime/ {
       allow RUNNER_VM_IP;
       deny all;
       proxy_pass http://127.0.0.1:8081;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto https;
       proxy_read_timeout 120s;
       client_max_body_size 40m;   # receipt tối đa 32 MiB
   }
   ```
3. `sudo nginx -t && sudo systemctl reload nginx`.
4. Kiểm từ **máy khác** (không phải Runner VM): `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://maviss.site/api/v1/analyzer/runtime/workers/claim` → phải ra `403` (Nginx chặn).
5. Kiểm từ **Runner VM**: lệnh trên → phải ra `401` hoặc `403` **do backend trả** (thiếu `X-Mavis-Runner-Key`), **không** phải `404`/HTML của Next.js.

**Đạt khi:** máy lạ bị chặn, Runner VM chạm tới backend.

### 8.3 👤 Dựng Runner VM (45–60 phút)
1. **Cấp máy:** Ubuntu 24.04, 8 vCPU / 16 GB RAM / ≥ 100 GB SSD, IP tĩnh. Firewall: inbound **chỉ** SSH; outbound `443` tới `maviss.site` và `ghcr.io`.
2. **Cài Docker Engine + compose plugin** (theo hướng dẫn chính thức Docker). Tùy chọn gVisor: `sudo bash deploy/install-gvisor.sh` (không bắt buộc đợt này).
3. **Clone đúng commit đã deploy:**
   ```bash
   git clone https://github.com/<org>/<repo>.git /opt/mavis-runner && cd /opt/mavis-runner
   git checkout <sha-đã-deploy-ở-7.2>
   ```
4. **Đăng nhập registry** (để kéo image lab do Control VPS push): `echo <PAT read:packages> | docker login ghcr.io -u <user> --password-stdin`.
5. **Tạo `/opt/mavis-runner/deploy/.env`** (quyền `600`):
   ```env
   MAVIS_JAVA_URL=https://maviss.site
   MAVIS_RUNNER_SERVICE_KEY=<giống hệt giá trị trong /opt/mavis/.env.production>
   MAVIS_WORKER_CONCURRENCY=2
   MAVIS_WORKER_ID=runner-vm-1
   MAVIS_WORKER_DEDICATED_HOST=1
   DOCKER_GID=<kết quả: getent group docker | cut -d: -f3>
   ```
6. **Khởi động:**
   ```bash
   cd /opt/mavis-runner/deploy
   docker compose --env-file .env -f compose.runner-worker.yml up -d --build
   docker compose -f compose.runner-worker.yml logs -f --tail=100
   ```

**Đạt khi** log có dòng `ready concurrency=2 ... instrumentationVolume=mavis-agents-java-2-32-0-dotnet-1-17-0-bundle-3 scenarioRunnerImage=sha256:...`, và **không** có `claim error=` lặp lại liên tục (nếu có → quay lại 8.2).

### 8.4 👤 Chuyển Control VPS sang `REMOTE_WORKER` (ngoài giờ học, 0 phiên đang chạy)
1. Trên Control VPS, đăng nhập registry với PAT `write:packages` (để backend push image lab build tại chỗ).
2. Sửa `/opt/mavis/.env.production`:
   ```env
   MAVIS_RUNNER_MODE=REMOTE_WORKER
   MAVIS_RUNNER_SANDBOX_REGISTRY=ghcr.io/<org>/mavis-sandbox
   MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=2
   MAVIS_RUNTIME_MAX_QUEUED_STUDIO_SESSIONS=40
   ```
3. Áp dụng: `cd /opt/mavis && docker compose --env-file .env.production -f deploy/compose.production.yml up -d --no-build backend`.
4. Mở Admin › Studio trong vòng 1 phút.

**Đạt khi:** `surveyReadiness = READY`, không có cảnh báo *"No remote worker poll"*, *"heartbeat is stale"*, *"Control-plane Docker unreachable"*, *"without MAVIS_RUNNER_SANDBOX_REGISTRY"*.

**Rollback 8.4:** đặt lại `MAVIS_RUNNER_MODE=AUTO`, chạy lại lệnh bước 3. Phiên mới sẽ chạy trên Control VPS như trước.

### 8.5 👤 + 🤖 Một phiên Studio thật end-to-end (30 phút)
👤 Dùng tài khoản SV thử trong **lớp thử** (không phải lớp thật):
1. Mở lab có Change Impact → Run → chờ `RUNNING`.
2. Khóa dự đoán → STOP một service → chờ cạnh lỗi hiện trên đồ thị → START lại.
3. Chụp 1 snapshot có ghi chú → Finish Studio → nộp bài.
4. GV mở bài nộp → thấy khung Auto-check.

🤖 Agent đọc log (người dùng gửi):
- Runner VM: `docker compose -f compose.runner-worker.yml logs --since 30m` → có `session=<id> status=Completed cleanup=Confirmed`.
- Control VPS: `docker compose -p mavis logs backend --since 30m | grep -E "<session-id>|PROMOTED|SCENARIO_CONTAINER_FAILED|INSTRUMENTATION_"`.

**Đạt khi:** `RUNNING → COMPLETED`; receipt `gate: PROMOTED`; đồ thị có span OTel; **không** có `SCENARIO_CONTAINER_FAILED`, `INSTRUMENTATION_BUNDLE_UNAVAILABLE`, `INSTRUMENTATION_VERSION_MISMATCH`, `LOCAL_IMAGE_MISSING`. (Bước này kiểm việc worker tự thay `scenarioRunnerImage` và volume OTel.)

Nếu `LOCAL_IMAGE_MISSING:<service>` → image lab chưa có trên registry/Runner VM: kiểm 8.4 bước 1 và 8.3 bước 4.

### 8.6 👤 Thử sự cố: kill worker giữa phiên (20 phút)
1. Bắt đầu 1 phiên như 8.5, chờ `RUNNING`.
2. Runner VM: `docker compose -f compose.runner-worker.yml kill sandbox-runner`.
3. Đợi 1 phút, rồi `docker compose -f compose.runner-worker.yml up -d`.
4. Sau ≤ 10 phút (1–2 chu kỳ dọn 5 phút):
   ```bash
   docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -c '^mavisrun-'
   ls /tmp/mavis-runner-state/receipts/
   docker compose -f compose.runner-worker.yml logs --since 15m | grep -E "hygiene|startup deliveredPendingReceipts|unacknowledged receipt"
   ```

**Đạt khi:** số stack `mavisrun-*` = 0; phiên bị ngắt được backend đánh dấu kết thúc (FAILED/CANCELLED, không treo `RUNNING` quá `stuck-session-seconds`); mọi file `mavisrun-*.json` trong `receipts/` hoặc đã có `.ack.json`, hoặc vẫn còn nguyên (không bị xóa); log có dòng `hygiene hostStateFreeMiB=...`.

### 8.7 👤 Chuẩn bị load test (30 phút)
1. Tạo/enroll **10 tài khoản SV thử khác nhau** vào **lớp thử** có 1 lab Studio đã publish (Scale ≤ 3).
2. Với từng tài khoản: đăng nhập ở cửa sổ ẩn danh → DevTools › Application › Cookies › `https://maviss.site` → copy `mavis_session` và `mavis_refresh` (cookie `HttpOnly` vẫn xem được ở đây).
3. Ghi file `10-student-cookies.txt` trên máy vận hành (Node ≥ 20), mỗi dòng 1 tài khoản:
   ```text
   Cookie: mavis_session=<...>; mavis_refresh=<...>
   ```
   File chứa phiên đăng nhập thật → giữ quyền `600`, **xóa sau khi test**.
4. Ghi lại `WORKSPACE_ID` và `ASSIGNMENT_ID` của lab thử (lấy từ URL trang lab).
5. Tạm nâng giới hạn cho cửa sổ test (ngoài giờ học):
   - Runner VM: `MAVIS_WORKER_CONCURRENCY=10` trong `.env` → `docker compose --env-file .env -f compose.runner-worker.yml up -d`.
   - Control VPS: `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=10` → `up -d --no-build backend`.

### 8.8 👤 + 🤖 Chạy load test & quyết định Go/No-Go (60–90 phút)
1. Mở sẵn 2 cửa sổ theo dõi trên Runner VM: `docker stats` và `watch -n5 free -m`.
2. Chạy từ máy vận hành:
   ```bash
   MAVIS_BASE_URL=https://maviss.site \
   WORKSPACE_ID=<uuid> ASSIGNMENT_ID=<uuid> \
   MAVIS_LOADTEST_AUTH_FILE=./10-student-cookies.txt \
   CONCURRENCY=10 ROUNDS=3 \
   node deploy/loadtest/studio-concurrency.mjs | tee loadtest-result.json
   ```
3. Sau khi chạy xong 10 phút, trên Runner VM:
   ```bash
   docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -c '^mavisrun-'
   docker ps -a --format '{{.Names}}' | grep -i rabbit | xargs -r -n1 docker logs 2>&1 | grep -c "memory resource limit alarm"
   ```
4. Gửi `loadtest-result.json`, ảnh `docker stats` lúc đỉnh và kết quả bước 3 cho 🤖 agent phân tích.

**Cổng Go — phải đạt đủ cả 5:**
| Tiêu chí | Ngưỡng |
|---|---|
| `failPercent` | < 5% (≤ 1/30 phiên) |
| `bootMs.p95` | < 60000 |
| `controlApiMs.p95` | < 3000 |
| Stack `mavisrun-*` mồ côi sau 10 phút | 0 |
| Log RabbitMQ `memory resource limit alarm` | 0 |

**Go →** giữ `MAVIS_WORKER_CONCURRENCY=10` và `MAVIS_RUNTIME_MAX_ACTIVE_STUDIO_SESSIONS=10`. Ghi kết quả vào báo cáo sáng (mục Batch 8).

**No-Go →** đưa cả 2 biến về `2` ngay. Agent phân tích theo mã lỗi trong `errorsByCode`:
| Dấu hiệu | Hướng xử lý (đợt sau) |
|---|---|
| `BOOT_TIMEOUT` nhiều, CPU Runner VM ~100% | Thử `CONCURRENCY=6`; hoặc nâng VM |
| RabbitMQ memory alarm | Nâng profile mặc định lên `512 MiB / 1.0 CPU` (phương án dự phòng đã ghi trong Task 3.1) |
| `HTTP_401` sau phút 15 | Cookie thiếu `mavis_refresh`, hoặc đường làm mới token (Batch 5.1) chưa đúng với BFF thật → agent sửa |
| `controlApiMs.p95` cao | Control VPS quá tải (DB Aiven/CPU) → xem log backend |
| Có `mavisrun-*` mồ côi | Kiểm log `hygiene` và quyền đọc lock trong `/tmp/mavis-runner-state` |

5. **Dọn dẹp:** xóa `10-student-cookies.txt`; đăng xuất 10 tài khoản thử (để vô hiệu refresh token); giữ lại `loadtest-result.json`.

---

## 4. Tổng hợp thời gian & điểm dừng

| Bước | Ai | Khi nào | Thời lượng | Điểm dừng nếu fail |
|---|---|---|---|---|
| 6.1–6.2 SQL audit | 👤 | Bất kỳ lúc nào | 10 phút | — (chỉ đọc) |
| 7.0 Sửa compose/Runbook | 🤖 | Ngay | 20 phút | Test local đỏ |
| 7.1 PR + CI | 👤/🤖 | Bất kỳ lúc nào | 45 phút | CI đỏ sau 3 vòng sửa |
| 7.2–7.3 Merge, deploy, smoke | 👤 | **Ngoài giờ học** | 60 phút | Deploy tự rollback / smoke fail → revert |
| 6.3 Sửa lab Scale > 3 | 👤 GV | Ngay sau 7.3 | 10 phút/lab | — |
| 8.1 Backup | 👤 | Ngay sau 7.3 | 10 phút | Không có `.dump` |
| 8.2–8.3 Nginx + Runner VM | 👤 | Ngày bất kỳ | 1.5 giờ | Runner VM không chạm backend |
| 8.4 Bật `REMOTE_WORKER` | 👤 | **Ngoài giờ học** | 10 phút | Admin không `READY` → rollback `AUTO` |
| 8.5–8.6 Phiên thật + kill test | 👤/🤖 | Ngoài giờ học | 1 giờ | Lỗi runner image / mồ côi / mất receipt |
| 8.7–8.8 Load test | 👤/🤖 | **Ngoài giờ học** | 2 giờ | No-Go → giữ 2 slot |

**Kết thúc Batch 8** khi: Go/No-Go đã có kết luận, báo cáo sáng được cập nhật mục Batch 6–8, và hệ thống chạy ổn định ở số slot đã chốt. Batch 9 (Task 4.7, Batch 4B gỡ `docker.sock`, sửa BM `.docx`) chỉ bắt đầu khi người dùng duyệt.
