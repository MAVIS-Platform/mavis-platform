# Kết quả sandbox Java–Worker với dự án thật

Ngày 22/10/2026. Worker: working tree nhánh `feat/runtime-allocation` (chưa commit, gồm local changes có sẵn). Java: snapshot nguyên trạng main `35eb3fa67a242554fa1695856992fdd6b8ee946e`. Java được lấy bằng git archive vào sandbox, không checkout đè source. Không dùng DB cloud hoặc credential dự án.

## Môi trường và dữ liệu

- Docker Linux Engine 29.1.5; Worker .NET 10; Java 21/Spring Boot 3.3; PostgreSQL riêng.
- Clone eShop `https://github.com/dotnet/eShop`, commit `913acea66708a59595351174cee9b29f37179d29`.
- Clone Petclinic microservices `https://github.com/spring-petclinic/spring-petclinic-microservices`, commit `1d76b00d683e86b62867a6bf59530f8ab301244f`.
- Hai repository ngoài chỉ được phân tích source, không chạy build/source không tin cậy trên host. Runtime dùng mẫu Java/.NET đã có trong `samples/runtime-poc`, không khẳng định đã chạy runtime toàn eShop/Petclinic.
- Sandbox/evidence tại `MAVIS.Worker/.artifacts/real-integration-20261022/`. Scripts và JSON kết quả giữ ở đây để tái lập; chúng không phải source sản phẩm.
- Java HTTP positive workflows dùng seed actor qua dev-bypass, có kiểm login/JWT riêng. Không xem đây là nghiệm thu full production JWT/RBAC matrix. OTP đọc từ DB test; không xác nhận SMTP delivery. AI là deterministic fallback, không gọi provider có phí.

## Kết quả xác minh

### Worker HTTP độc lập: 23/23 checks pass

Gọi thực tất cả 10 operation Worker hiện có: health/ready, direct analysis, async submit/get/cancel, impact, và ba route legacy mặc định bị tắt. Có negative tests service auth/grant/raw path/digest, idempotent submit, conflicting attempt và wrong attempt.

eShop: fingerprint 596 file; 28 projects, 547 C# files discovered, 532 analyzed, 15 skipped, 2024 findings và 562 warnings; profile `dotnet-static/1.9`, `PartialSyntax`. Không phải full compiler/framework semantics. Async Completed và cancellation được kiểm tra. Evidence: `worker-http-results.json`, `eshop-worker-result.json`, `eshop-worker-job-result.json`.

### Java build/regression

- Build reactor main nguyên trạng: BUILD SUCCESS.
- Maven regression đầu tiên dừng ở analyzer do 3 errors của `UploadWorkerApiIntegrationTest`: test context thiếu `DiagramExportService` sau merge export. Không sửa test để ép pass.
- Chạy riêng 12 Bootstrap API integration tests bị reactor chưa tới: 12/12 pass trên PostgreSQL sandbox. Đây là MockMvc với actual Spring/DB, không tự đồng nghĩa HTTP end-to-end ở mọi case.
- Tổng hợp các suite thực chạy: **288 tests, 284 pass, 3 errors, 1 skip**; 0 assertion failures. Skip là external Fruit dataset không có. Các suite analyzer/live client/DB có chạy Worker thật theo harness, bên cạnh các unit/mock tests; không gán tất cả 284 test là real-network.
- Evidence: `java-build.log`, `java-tests.log`, `java-bootstrap-tests.log`, `java-test-summary.json` và surefire XML của snapshot.

### Java HTTP API

- Đã gọi đủ **85 operation OpenAPI** với input validation/not-found probes. Đây là coverage route, không phải 85 business acceptance passes. Một probe upload sai content type trả 500; các probe khác là 2xx/4xx. Một số query trả empty 200 với parent không tồn tại cũng chưa được coi là authorization/consistency đã đúng.
- Auth sandbox register/resend/verify/login/forgot/reset/login mới đã chạy; JWT create-project xác nhận owner là user token. Không lưu token vào báo cáo.
- Workspace/member/batch/assignment/project/upload/GitHub pinned-commit import/admin và các CRUD liên quan đã gọi thật.

## Baseline không pass: các blocker xác minh trên main nguyên trạng

### 1. Schema scope quá ngắn

`model_elements.scope VARCHAR(100)` trong V1 và entity `@Column(length=100)` không đủ cho đường dẫn source thật. Petclinic publication rollback với PostgreSQL SQLState 22001: `value too long for type character varying(100)` khi insert model_elements. Transaction trace xác nhận exception trong CrossLanguageServiceLinker/WorkerModelPublisher.

Repro: create project → upload Petclinic ZIP → explicit analyze một lần → job FAILED với `ANALYSIS_OR_PUBLICATION_FAILED`. Diagnostic chi tiết được ghi trong Java container logs trước cleanup; dữ liệu job nằm `java-no-replay-job.json` và các diagnostic JSON.

### 2. Analyze idempotency replay làm job/attempt lệch trạng thái

Gửi analyze và gửi lại cùng Idempotency-Key trong khi thực thi: API trả 202 nhưng DB job có thể trở lại/stuck PENDING trong khi analysis_attempts RUNNING. Recovery redispatch gặp SQLState 23505, unique `uq_active_analysis_attempt`. Cả eShop/Petclinic tái hiện. Chưa chốt root cause cụ thể trong transaction/entity merge; cần Java kiểm stale entity save/transaction và regression concurrency. Không sửa hoặc gọi đó là đã fix.

Không dùng các model tạo từ job khác để kết luận job bị stuck đã hoàn thành.

## Kiểm tra downstream sau workaround DB sandbox

Để đi tiếp API phía sau, chỉ thay **DB test** bằng `ALTER TABLE model_elements ALTER COLUMN scope TYPE text`; không sửa Java source/migration/main. Gửi analyze đơn lẻ, không replay trong lúc chạy. Đây là kết quả có workaround, không phải main đã đạt acceptance.

- eShop: Java→Worker thực, adapter COMPLETED/OK, publication COMPLETED, model **697 elements, 581 relationships, 3628 evidence**.
- Petclinic: Java AST thực, Worker NOT_APPLICABLE/NO_DOTNET_INPUT, publication COMPLETED, model **24 elements, 21 relationships, 32 evidence**, 11 service containers.
- Đã gọi graph/model/diagram/evidence, impact versioned và compatibility qua HTTP Java→Worker thật; evaluation/history/findings; export MERMAID/PLANTUML/DRAWIO_XML/JSON; deployment projection; grounded deterministic AI/history/detail; controlled revision và diff.
- Layout API chỉ nhận `{nodes:[{id,x,y}]}`. Gửi full layout bị 400 là guard đúng; gửi coordinate-only đã 200. Không gắn lỗi cho guard này.
- Đã nộp Petclinic model thật, query/export submission bundle, lecturer feedback create/read/update/delete và kiểm assignment có submission không được xóa.
- Evidence: `java-single-real-contexts.json`, `java-downstream-results.json`, `java-layout-results.json`, `java-crud-results.json`, `eshop-final-real-graph.json`, `petclinic-real-graph.json`.

## Runtime Runner→Java/PostgreSQL thực

Đã tạo project/snapshot/model từ source mẫu runtime local Java/.NET, Java approve/export definition, rồi gọi Runner Docker thật. Vì Java main chưa hỗ trợ managed contract mới, operator bridge đã bổ sung resourceProject và scenario.sessionId vào definition xuất ra; điều này được ghi rõ, không tính là adapter managed E2E hoàn chỉnh.

Runner scenario Completed/Passed, capture trace và cleanup Confirmed; receipt lưu xuống outbox rồi POST vào Java thật. Ingest, duplicate replay, sync-outbox, session và sequence query trả 200, có persistence thực PostgreSQL.

Hai invariant chưa pass:

- Receipt thay scenarioStatus khác payload vẫn trả **200**, kỳ vọng **409**. Main chưa có digest conflict rejection.
- Gọi stop sau phiên PASSED làm scenarioStatus đổi sang **CANCELLED**. Stop terminal chưa idempotent đúng nghĩa.

Endpoint `lifecycle-ack` mới chưa có; gọi trên main trả 500 bởi generic error handling thay vì route 404 chuẩn. Java receipt response chưa có commit-ack schema/digest mới. Không thể tuyên bố managed lifecycle/delivery mới đã nối được chỉ từ old receipt ingest 200.

Evidence: `runtime-original-java-definition.json`, `runtime-operator-definition.json`, `runtime-real-receipt.json`, `runtime-java-session.json`, `java-runtime-results.json`, `java-final-semantic-results.json`. Actual runtime source là trusted local PoC, không phải externally cloned applications.

## Việc Java cần nhận tiếp

1. Migration phù hợp cho scope/source locators và entity alignment; giữ provenance đầy đủ, không truncate im lặng.
2. Fix job/attempt state khi Idempotency-Key replay và recovery; test HTTP concurrency với PostgreSQL, không chỉ mocks.
3. Sửa test context UploadWorkerApiIntegrationTest thêm exporter dependency thực; chạy lại 3 errors và full affected suites.
4. Implement lifecycle ack, immutable receipt digest/conflict/concurrency/commit ack và terminal-stop policy theo contract vòng 2.
5. Validate exported run-definition đủ chạy: pin resourceProject, scenario session và model/config versions; Java thực thi policy/persistence, không nhờ operator sửa JSON mới chạy được.
6. Chuẩn hóa lỗi unsupported content type/unknown endpoint về 4xx thay vì generic 500.

## Giới hạn kết luận

Worker độc lập và phần lớn downstream backend chạy được trên dữ liệu thật khi bỏ hai blocker nêu rõ. **Chưa đạt 100% E2E trên main nguyên trạng.** Không nghiệm thu production auth/isolation, remote-host lifecycle, Google OAuth/provider AI thật, SMTP, load/concurrent corpus hay runtime của toàn eShop/Petclinic. Không sửa source Java và không publish/commit/push trong lượt test này.
