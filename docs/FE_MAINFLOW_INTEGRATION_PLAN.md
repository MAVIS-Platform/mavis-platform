# Plan nối API FE mainflow — 22/10/2026

## Mục tiêu và phạm vi

Thực hiện trên nhánh feat/fe-mainflow-integration mới từ main cập nhật, giữ thiết kế và lịch sử Git đã chia sẻ. Không triển khai code trong bước lập plan này.

Luồng ưu tiên: đăng nhập → chọn/tạo personal project tối thiểu → upload ZIP → bắt đầu analysis → poll job → graph model thật → chọn node/edge xem evidence → impact → AI explanation → export diagram.

GitHub import sau ZIP. Không làm màn CRUD workspace, thành viên, assignment, submission, feedback, admin hoặc dashboard thống kê. Đăng nhập và project tối thiểu là dependency mainflow, không mở rộng thành bộ quản trị.

## Hiện trạng đã đối chiếu

Next.js 15/React 19, có React Query. app/*/page.tsx trỏ sang src/routes/{import,architecture,impact,explain}.tsx. Graph hiện ở src/lib/graph-data.ts là dữ liệu mẫu; import dùng timer, impact/explain có kết quả mô phỏng. Các chỉ số health, p95, RPS, instances, vulnerability trong mẫu không được suy ra từ static analysis.

Java đang chạy localhost:8081, Worker localhost:5082. FE chỉ gọi Java. Không đưa DB password, Worker grant hoặc Runner key xuống trình duyệt. Dùng OpenAPI thực /v3/api-docs để xác định DTO/params, không suy ý nghĩa từ tên path (đặc biệt graph có path parameter tên sessionId).

## P0. Nền kết nối và phiên đăng nhập

- Kiểm tra main mới và FE AGENTS; tạo nhánh mới, giữ các thay đổi local có sẵn ngoài phạm vi.
- Cấu hình Java base URL phía server; ưu tiên Next same-origin proxy giới hạn /api/v1, giữ method/status/content type, hỗ trợ multipart và download, không trở thành proxy tùy ý. Xác minh auth contract trước khi chọn cookie HttpOnly và cơ chế CSRF/logout phù hợp; không hardcode JWT.
- API client unwrap ApiResponse.data, chuẩn hóa lỗi HTTP; xử lý 401/403, timeout và AbortSignal, không tự retry POST mutation.
- Thêm login/logout tối thiểu với tài khoản test đã xác minh; không tắt RBAC để demo. Mail/register/reset password không thuộc scope giao diện đợt này; chuẩn bị tài khoản hợp lệ trước browser acceptance.
- Lưu context projectId/snapshotId/jobId/modelVersionId trong URL/state; React Query key có project và version, xóa cache khi logout/đổi project.
- Gate: đăng nhập thật, tải project được phép, người ngoài bị từ chối; browser không lộ service keys.

## P1. Import và analysis thật

- Giữ form Import; chọn project hoặc tạo personal project bằng một thao tác tối thiểu khi cần.
- POST /api/v1/analyzer/upload multipart đúng OpenAPI, lưu snapshot ID; không tự chạy analysis khi upload nếu BE chưa yêu cầu.
- POST /api/v1/analyzer/snapshots/{snapshot}/analyze với Idempotency-Key ổn định cho cùng thao tác. Retry sau lỗi mạng dùng lại key; thao tác phân tích mới dùng key mới.
- GET /api/v1/analyzer/jobs/{jobId} để poll có khoảng nghỉ/backoff, dừng khi terminal/unmount; hỗ trợ POST /api/v1/analyzer/jobs/{job}/cancel.
- Bỏ timer phần trăm giả; dùng trạng thái BE, thông báo partial/warning/failure thực. Chỉ mở graph khi có modelVersionId đã publish, không đoán từ job hoặc snapshot ID.
- Gate: ZIP Java và C# thật đều tạo model; C# đi qua Worker. Double-click không sinh job trùng; refresh tiếp tục theo job; lỗi/cancel không hiển thị thành công.

## P2. Architecture và evidence

- GET model detail và graph cho đúng model ID theo OpenAPI. Thay imports dataset tĩnh bằng adapter DTO → view model dùng chung giữa 3 màn.
- Giữ UUID node/relationship từ BE; bỏ serviceById giả định luôn có phần tử. Hỗ trợ graph rỗng, isolated node, nhiều loại element và relationship.
- Tách tọa độ/layout khỏi ngữ nghĩa model. Chỉ lưu layout bằng endpoint diagram khi đã có diagramId; kéo node không sửa semantic graph.
- Chọn node/edge gọi GET /api/v1/analyzer/evidences/element/{elementId} hoặc /relationship/{relationshipId}. Hiển thị path/line/kind/confidence BE thực cung cấp; không tạo code snippet giả hoặc runtime claim.
- Trường health/latency/RPS/instances/vulnerability không có dữ liệu thì ẩn hoặc ghi chưa có dữ liệu; không gán default healthy.
- Gate: đổi model/project không lẫn graph/evidence; refresh URL giữ version; search/filter hoạt động với dữ liệu thật.

## P3. Impact, AI và diagram export

- Impact: GET /api/v1/analyzer/models/{model}/impact với params theo OpenAPI, dùng element ID thật; bỏ thuật toán demo nếu được trình bày như kết quả BE.
- Explain: POST /api/v1/analyzer/ai/explain đúng target/model scope; lấy nội dung/evidence links từ response, không giữ câu trả lời mẫu. Hiện rõ fallback, unavailable, rate limit và loading; không chặn graph khi AI lỗi.
- Diagram: dùng create/list/detail của model theo nhu cầu, GET /api/v1/analyzer/diagrams/{diagramId}/export; download đúng content type/tên file, xử lý lỗi JSON thay vì lưu thành file hỏng.
- Gate: impact/AI/export cùng model đã chọn, target ID hợp lệ; AI không có key vẫn hiển thị fallback trung thực.

## P4. Mainflow mở rộng sau khi P1–P3 pass

- GitHub import: POST /api/v1/analyzer/import/github rồi tái dùng snapshot/job pipeline; không thêm GitHub credential vào FE nếu API không hỗ trợ.
- Evaluation/revision: dùng evaluate/findings, controlled revisions và compare theo version pinning; tách revision nháp khỏi model published, không sửa model bằng graph layout.
- Runtime: preflight → create session → approve → operator Runner thực thi → poll session/sequence/enriched graph → stop. FE không gọi run-definition/receipt/lifecycle/recovery callbacks bằng service key.
- Runner hiện là CLI/operator adapter, không tự chạy vì nhấn approve. Trước khi thiết kế nút Run phải xác định tiến trình host/dispatch và shared state root cho cancel. Nếu chưa có dispatcher, UI ghi chờ operator và chỉ bật phần đã thực sự vận hành; không báo RUNNING từ approve.
- Gate runtime: workload thật, trạng thái execution/scenario/evidence/cleanup riêng; cancel/timeout hiển thị đúng và cleanup confirmed. Không coi P4 pass chỉ vì static mainflow đã pass.

## P5. Kiểm thử và bàn giao

Kiểm thử từng lát ngay khi nối API, sau đó browser E2E toàn luồng; không đợi gắn hết mới test. Dùng DB cloud test với project/tài khoản riêng, source/artifact lưu local chung Java/Worker. Không mock response trong acceptance.

- Build/typecheck/lint theo scripts hiện có; thêm test có giá trị cho adapter, idempotency/polling và chuyển version.
- Browser: login → ZIP Java → graph/evidence → impact → AI fallback → export; lặp lại C# để chứng minh Worker có tham gia.
- Negative: auth hết hạn/403, ZIP sai, job fail/partial/cancel, timeout/mất kết nối, refresh đang poll, đổi project/model, graph rỗng, AI unavailable.
- Chỉ kiểm P4 khi đã triển khai phần đó; ghi rõ pass/fail/skipped và lý do. Không mở scope CRUD để giải quyết dữ liệu demo.
- Commit theo lát: nền/auth; import/jobs; graph/evidence; impact/AI/export; mainflow mở rộng nếu trong phạm vi đã chốt; tests/docs. PR vào main sau verification, không force-push lịch sử Git đã chia sẻ.

## Tiêu chí chốt đợt ưu tiên

P0–P3 và P5 pass trên browser với Java/Worker thật và DB cloud; bốn màn hiện có không còn dùng dữ liệu mẫu trong mainflow. P4 báo trạng thái riêng, không chặn bàn giao luồng static nhưng chưa được gán hoàn tất. Business CRUD tiếp tục để ngoài scope.

## Cập nhật GitHub import

Đã triển khai phần GitHub của P4 theo yêu cầu bổ sung: repo public + branch/commit SHA → snapshot → analysis → graph. Acceptance thực với Petclinic pass (branch-only và pinned SHA, graph 24 elements). Private repo tiếp tục dùng ZIP do API Java chưa nhận GitHub credential. Các mục evaluation/revision/runtime của P4 vẫn để riêng.
