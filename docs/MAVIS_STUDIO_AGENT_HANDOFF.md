# Bàn giao MAVIS Studio cho agent tiếp theo

Cập nhật ngày 14/11/2026. Tài liệu này ghi trạng thái nhánh Studio, bằng chứng kiểm thử và các bước tiếp tục. Các tên chức năng mô tả hành vi đã có trong code.

## 1 Điểm tiếp tục và Git

- Worktree làm việc là C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-session.
- Nhánh là feat/wf03-studio-session. Merge code mới nhất tại thời điểm kiểm tra là 9f866bf, đã chứa origin/main 594cb99.
- Main vừa thêm aa88e5b và 594cb99 để sửa tương thích auth/logout. Merge hai commit này thành công bằng chiến lược ort, không phát sinh conflict.
- ef6abae là mốc hoàn thiện Studio trước lần đồng bộ auth/logout này. bcf5652 bổ sung observability và evidence. 7cb1f16 bổ sung phiên tương tác.
- Nhánh Studio hiện được lưu local trên máy này. Upstream của nhánh đang là origin/main. Dùng git fetch origin và kiểm tra diff trước khi chủ động merge main vào nhánh.
- Worktree C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform đang ở main a873ba2 và có WIP trong 5 file runtime/frontend-performance/RuntimePlanningService. Bộ DOCX Review 2 nằm ở docs/Docs after review 2 của worktree đó.
- Worktree mavis-review2-origin trên feat/wf03-runtime-studio tại 1fc0039 chứa PoC cũ. Code hoàn thiện tiếp tục tại worktree mavis-studio-session.

Các lệnh xác định trạng thái trước khi nhận việc

    Set-Location C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-session
    git status --short --branch
    git log -5 --oneline
    git fetch origin
    git rev-list --left-right --count HEAD...origin/main
    git diff --name-only HEAD...origin/main

## 2 Phần đã triển khai

- Phiên Studio giữ stack Docker sống, nhận từng action Start/Stop/Scale theo thứ tự và chống gửi trùng bằng action UUID.
- Scale có input số nguyên và slider 1–8. Runner kiểm replica thực tế, giữ kết quả action khi bước sau thất bại và cleanup khi cancel/timeout.
- Chaos Monkey chọn một service đang chạy theo telemetry, hiển thị tên để người học xác nhận rồi gửi STOP thật. Action và service cụ thể được ghi lại.
- Đồ thị 2D và phép chiếu phối cảnh 3D có xoay camera, tự fit, selection chung và replica markers. Đường tĩnh lấy từ model ghim, đường runtime lấy từ trace đã thu.
- Inspector đọc source evidence, gọi impact API của Worker và hiển thị các đường upstream. Traversal phía frontend dùng helper cycle-safe hiện có làm tham chiếu.
- Telemetry trong phiên gồm replica, CPU/RAM/network Docker, log đã redaction, OTel spans và interactions. Runner lấy mẫu sau mỗi action và định kỳ tám giây sau khi mẫu trước hoàn tất.
- Chi tiết action có Before/After latency, error rate và trace IDs khi workload GET/HEAD có thể replay. Dữ liệu đo thiếu được hiển thị rõ.
- Snapshot ghim PNG, explanation, session/source/model, telemetry và actions, kèm canonical SHA-256. Capture kiểm observedAt để tránh ghim ảnh theo một mẫu đã bị thay thế.
- Có lựa chọn hai snapshot để đối chiếu ảnh và số liệu tài nguyên, xuất SVG/PNG và tải gói evidence JSON.
- Receipt tương tác có HMAC-SHA256 trên canonical receipt digest. Java xác minh signature trước khi commit.
- Gói nộp sao chép Studio evidence vào submission bất biến và liên kết digest của snapshot vào evidence-package digest. UI tự đưa snapshot vào các mục chấm và có trình xem ảnh đã nộp.

## 3 File cần đọc theo công việc

Frontend

- MAVIS-Frontend/src/features/runtime/studio-controls.tsx giữ action, capture, finish/cancel, lịch sử và download.
- studio-observability.tsx giữ graph/camera, Worker impact, trace filtering, logs và ảnh.
- studio-snapshot-comparison.tsx đối chiếu hai bản evidence đã ghim.
- MAVIS-Frontend/src/features/runtime/backend.tsx nối chế độ interactiveStudio vào luồng startRuntime.
- MAVIS-Frontend/src/features/courses/screens.tsx nối Step 4 tới sessions với studio=1.
- MAVIS-Frontend/src/features/submissions/composer.tsx gắn snapshot thật vào các mục chấm.
- MAVIS-Frontend/src/features/submissions/studio-evidence.tsx xem ảnh và giải thích từ submission export.
- MAVIS-Frontend/src/lib/api/contracts.ts và java-operations.ts khai báo BFF contracts.
- MAVIS-Frontend/src/lib/i18n/locale-context.tsx chứa nhãn EN/VI.

Java và dữ liệu

- RuntimeStudioController và RuntimeStudioService trong mavis-analyzer giữ state, queue, polling, acknowledgement, telemetry và snapshot.
- RuntimePlanningService và RuntimeSessionServiceImpl truyền interactiveStudio trong definition.
- RuntimeSession giữ studio_control JSONB. Các mutation lấy pessimistic lock theo session.
- RunnerReceiptIngestServiceImpl, RunnerServiceAuthGuard và CanonicalReceiptDigestUtils giữ xác thực và integrity.
- RunnerOutcomeDTO phải giữ infrastructureActions nằm trong outcome. Việc bỏ field này làm digest thay đổi qua DTO.
- SubmissionServiceImpl sao chép Studio evidence và liên kết các snapshot đã chụp với các mục của bài nộp.

.NET

- MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs giữ thao tác Docker, sampling, trace preservation và cleanup.
- JavaRuntimeClient.cs giữ polling, acknowledgement, telemetry callback và header HMAC receipt.
- RuntimeSessionLifecycle.cs giữ đường teardown chung cùng evidence của action đã thực hiện.
- ReceiptCanonicalJson.cs chuẩn hóa cả số nguyên và decimal bị chặn trong miền hỗ trợ, phục vụ tỷ lệ lỗi có phần thập phân.

## 4 Contract và migration

API nền là /api/v1/analyzer/runtime/sessions/{sessionId}/studio.

- GET state, POST actions, POST finish và POST snapshots dùng quyền người dùng theo project/Lab.
- GET commands, POST ack và POST telemetry dùng Runner credential và kiểm resourceProject.
- GET snapshots/{snapshotId} tải evidence bất biến, GET receipt tải receipt cùng signature hiện có.
- Mỗi phiên tối đa 32 action, tối đa 8 snapshot, và giới hạn phiên theo profile tối đa 300 giây.
- Mutation kiểm trạng thái thật của phiên. Finish chờ action hoàn tất và yêu cầu ít nhất một action đã xác nhận.
- Snapshot image là PNG tối đa 1.500.000 ký tự data URL, kích thước tối đa 2000 x 2000.
- V32__Runtime_Studio_Control.sql bổ sung runtime_sessions.studio_control.
- V33__Submission_Studio_Evidence.sql bổ sung submission_snapshots.studio_evidence.
- V29–V31 trên main được giữ theo nội dung của main. Hai migration Studio được đánh số V32/V33 khi còn chưa phát hành để tránh trùng version.
- deploy/apply-course-schema.py, deploy/deploy-vps.sh và workflow deploy đã đóng gói, probe và áp dụng V32/V33 theo cơ chế additive hiện hành.

## 5 Kiểm thử và phạm vi bằng chứng

Các kết quả đã ghi nhận trong vòng triển khai trước merge auth/logout. Mốc source bàn giao Studio là ef6abae

- Production build Next.js và typecheck.
- 126 ca frontend thuộc runtime-planning, course-learning-ui và java-contract.
- Browser fixture trên Chrome cho controls, pending lock, selection 2D/3D, Worker impact, PNG, hai snapshot, xem ảnh nộp bài, EN/VI và màn hình nhỏ.
- Ma trận Java WF-03 28 ca, WF-04 33 ca, cùng regression Studio, receipt, submission và review.
- 35 ca Runner gồm Docker thật, interactive Stop/Start/Scale, telemetry, HMAC callback và cleanup.
- Bảy test helper migration deploy.

Browser test dùng API fixture. Managed Docker test dùng Java transport fixture và Docker Engine thật. Java API integration dùng Spring MockMvc và PostgreSQL test riêng. Nghiệm thu full-stack frontend xác thực thật, Java HTTP, Runner, Docker và bài nộp trên staging là bước tiếp tục.

Sau merge 594cb99, kiểm tra hẹp tập trung vào Spring startup, RuntimeStudioServiceTest và RuntimeStudioApiIntegrationTest để bao phủ các constructor auth/logout mới. Kết quả cuối của lần kiểm tra này được ghi trong phần cập nhật bên dưới.

Lệnh kiểm thử từ worktree root

    Set-Location MAVIS-Frontend
    npm run typecheck
    npm run build
    node tests/studio-ui.browser.cjs

Đặt MAVIS_DB_URL, MAVIS_DB_USERNAME và MAVIS_DB_PASSWORD vào database test riêng trước khi chạy Spring integration. Dùng JDK 21, chuyển tới MAVIS-Platform/mavis-be và chạy

    ./mvnw.cmd -pl mavis-bootstrap -am test "-Dtest=RuntimeStudioServiceTest,RuntimeStudioApiIntegrationTest" "-Dsurefire.failIfNoSpecifiedTests=false"

.NET global.json yêu cầu SDK 10.0.403. Máy hiện có SDK 10.0.204 và các lần kiểm tra local đã chạy từ worktree root, giữ nguyên global.json của repo. CI cần dùng SDK theo global.json.

    dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj -c Release --filter "FullyQualifiedName~ManagedRuntimeTests|FullyQualifiedName~RuntimeLifecycleTests"

Để chạy Docker thật, khởi tạo samples/runtime-poc/Initialize-Poc.ps1 từ worktree root và đặt MAVIS_MANAGED_DOCKER_TEST_ROOT tới thư mục sample tuyệt đối trước khi chọn ManagedDockerRuntimeTests. Fixture tạo image/agent có digest và allocation riêng.

Frontend hiện dùng junction node_modules tới C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform/MAVIS-Frontend/node_modules. Agent trên máy khác cần chuẩn bị dependencies theo lockfile của nhánh.

## 6 Ưu tiên cho agent tiếp theo

1. Chạy một lượt full-stack trên môi trường tích hợp với auth thật, Lab/Quiz thật, managed Runner, telemetry, capture trước/sau, finish, submission và chấm các snapshot.
2. Ghi SHA ứng dụng, SHA Runner, DB schema, session ID, snapshot ID, receipt digest và kết quả cleanup cho cùng lượt chạy.
3. Đo NFR theo fixtures trong kế hoạch. Tỷ lệ latency cải thiện phải lấy từ số đo thực của workload và cách cân bằng tải của repo mẫu.
4. Rà policy key rotation và trusted local outbox recovery. Đường callback Studio thường xác minh HMAC. Đường recovery nội bộ giữ compatibility bypass hiện có.
5. Đánh giá UI với repo mẫu nhiều service, các trace thiếu, mất kết nối, timeout và resubmit. Graph 3D dùng SVG với phép chiếu phối cảnh.
6. Kiểm tra lại origin/main và số migration trước mỗi PR. Chạy checks theo file thay đổi và cập nhật tài liệu bằng chứng.
7. Đối chiếu bản DOCX Review 2 trong worktree mavis-platform nếu có câu hỏi phạm vi. Các khác biệt giữa gate Quiz và Canvas/Ground Truth cần theo quyết định nhóm đã được ghi nhận trong code/main và hồ sơ mới nhất.

## 7 Prompt tiếp tục có thể giao cho agent

Tiếp tục MAVIS Studio tại C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-session, nhánh feat/wf03-studio-session. Đọc docs/MAVIS_STUDIO_AGENT_HANDOFF.md và docs/MAVIS_STUDIO_RUNTIME.md. Kiểm git status và origin/main trước khi sửa. Ưu tiên chạy nghiệm thu full-stack trên staging và hoàn tất bằng chứng cùng SHA. Giữ contracts session/source/model, idempotency, canonical digest, chữ ký và snapshot bất biến khi sửa. Cập nhật các test liên quan và tài liệu bàn giao sau mỗi thay đổi.

## 8 Kết quả xác minh sau lần đồng bộ này

- Origin main đã kiểm tra là 594cb99, merge code tại 9f866bf.
- Merge hoàn tất sạch. Git xác nhận origin/main là ancestor của HEAD.
- RuntimeStudioServiceTest có 7 ca pass.
- RuntimeStudioApiIntegrationTest có 1 ca pass, 0 lỗi và 0 skip. Spring context khởi động với các constructor auth/logout mới và chạy API Studio trên PostgreSQL 18 test riêng.
- Database test chạy migration đến V33. Sau kiểm tra, container test được dọn theo đúng label mavis.studio.handoff.
- git diff --check pass. Commit tài liệu bàn giao được lưu local sau commit merge.
