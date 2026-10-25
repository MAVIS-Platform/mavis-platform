# Kế hoạch giao sản phẩm gấp — 22/10/2026

Mục tiêu: ra bản tích hợp Java–Worker/Runner có thể demo và bàn giao, tận dụng các slice đã pass. Không hứa thời điểm hoàn thành chưa có cơ sở và không đánh đồng bản demo với production acceptance.

## Mốc 1 — Release candidate backend

### 1. Chốt source và giữ các test đã pass

- Java: worktree branch feat/java-runtime-contract-fixes, base 9243cfa, gồm V9/V10 và fixes đã kiểm chứng.
- .NET: feat/runtime-allocation; tách runtime task khỏi local edits cũ.
- Fetch main, kiểm conflict/migration số trùng trước khi đóng gói. Không reset hoặc stage toàn bộ working tree.
- Dừng mở feature mới; giữ contract definition/lifecycle/receipt đã chạy thật. Không đổi thuật toán static hoặc UI trong đợt này.

### 2. Timeout và startup failure — làm trước

- Dùng managed adapter và Java/PostgreSQL thật; thêm executable scenarios vào harness hiện có.
- Startup failure: workload không ready/entrypoint fail → không chạy scenario, receipt ghi đúng Failed/NotRun, cleanup Confirmed khi tài nguyên đã hết.
- Timeout: deadline hết khi đang allocate/ready/scenario → giữ phân biệt TimedOut và Cancelled, vẫn preserve evidence/cleanup và deliver receipt bằng token mới.
- Java giữ latest model; receipt thất bại vẫn commit, replay không sinh revision, không fabricate trace/model.
- Acceptance: assertions trên HTTP/DB/receipt/ack và Docker resource checks, không chỉ exit code. Sửa tối thiểu khi case tái hiện lỗi; dừng mở rộng sau khi pass.

### 3. Crash recovery có kiểm soát — đường ngắn để giao

- Giữ explicit operator recovery; chưa xây daemon tự động hoặc distributed queue mới.
- Lưu durable allocation manifest đủ sáu pinned IDs/resourceProject trước Docker start. Kiểm migration manifest cũ: thiếu scope phải fail rõ, không đoán latest.
- Chốt recovery-result schema additive với Java: session/allocation, recovery ID, cleanup outcome/time/diagnostics bounded. Không gọi đó là execution receipt nếu chưa biết scenario outcome.
- Java endpoint riêng có service auth + pinned scope + session lock + idempotency; không ghi đè receipt terminal đã commit, không promote model từ recovery.
- Runner recovery chỉ exact owned allocation, sau kiểm containers/networks/volumes mới ghi recovery result/outbox và gửi Java. Không tự chạy workload lại.
- Test process chết sau allocate và trước receipt; recover giữ resource ID reservation, Java không còn RUNNING sai. Duplicate delivery cùng kết quả an toàn; kết quả xung đột bị reject. Cleanup Incomplete phải giữ trạng thái cần operator xử lý, không báo Confirmed.
- Nếu schema này chưa qua tests, giao fallback operator runbook rõ và đánh dấu chức năng recovery chưa tự đồng bộ; không che gate bằng đổi DB thủ công.

### 4. Regression cuối và release evidence

- Chạy các test bị thay đổi trước, sau đó một lượt regression phù hợp trên source cuối.
- Giữ evidence success/cancel/scenario failure/concurrent analyze đã có; chạy lại khi code thay đổi ảnh hưởng các đường đó.
- Một release manifest ghi SHA Java/.NET, migration version, commands, config names không secret, input corpus commits, pass/fail/skip, known limitations.
- Không cộng chồng các test chạy lại thành số coverage giả.

## Mốc 2 — Bản chạy chung cho nhóm và FE

### 5. Đóng gói và PR

- Commit riêng Java fixes/migrations, race regression và .NET integration theo diff reviewable; chưa push main trực tiếp.
- Java server additive contract/migrations trước, .NET consumer sau; liên kết counterpart commit/PR.
- Không đưa cache/target/bin/obj/.artifacts/credentials vào commit. Giữ bản source/artefact test cũ để đối chiếu.
- Push/PR theo quyền người dùng giao; merge/release chỉ khi concrete candidate đã có evidence và được cho phép.

### 6. Staging/demo tối thiểu

- Dùng PostgreSQL staging riêng hoặc schema test được chỉ định, private Worker và operator Runner state-root có quyền hạn chế; không tự migrate Aiven đang dùng chung.
- Cấu hình bằng biến môi trường/secret ngoài Git; service key riêng, cloud credential bị commit cần rotate bởi owner.
- Smoke: Java health/auth/project → upload → analyze/poll → graph/evidence/impact/export → managed runtime → stop/receipt/sequence.
- FE hiện demo/mock: nối một luồng thật trước (project/upload/analyze/job/graph/impact). UI chưa nối API không được quảng bá thành sản phẩm E2E hoàn chỉnh.
- Handover hai đường: demo thao tác được và runbook API/CLI tái lập. Không để FE readiness chặn nghiệm thu backend độc lập.

## Những việc hoãn để bảo vệ deadline

- Arbitrary customer source builds/runtime, multi-tenant concurrent execution, remote-host automatic recovery, full cloud HA/backup disaster recovery/load certification.
- Feature/UI mới ngoài flow demo cốt lõi. Không gọi các mục hoãn là đã hoàn tất.

## Trình tự thực thi ngay

1. Kiểm main/cặp nhánh và script hiện có.
2. Viết/chạy startup failure và timeout managed E2E; sửa lỗi thực tế nếu có.
3. Triển khai recovery-result additive và kill/recover/replay E2E trong sandbox.
4. Regression + diff review + release manifest.
5. Chuẩn bị commit/PR, bàn giao candidate; staging/cloud chỉ dùng môi trường owner chỉ định.

Kế hoạch ưu tiên khả năng giao sản phẩm, không yêu cầu vượt production acceptance để demo được. Production readiness chỉ được ghi theo evidence thực tế. Đây là kế hoạch triển khai; chưa phát sinh bằng chứng test mới chỉ vì tài liệu được tạo.
