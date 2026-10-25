# Kế hoạch hoàn thiện BE trước khi nối FE

Ngày 22/10/2026. Mục tiêu: một bản BE Java + Worker + Runner đồng bộ trên main/release candidate, cấu hình cloud rõ ràng, không còn implementation dở trong phạm vi giao hàng. FE và browser E2E được thực hiện sau. Kiểm thử backend thiết yếu không trì hoãn tới lúc nối FE.

## Định nghĩa hoàn tất

BE hoàn tất cho bản giao khi: code đã hợp nhất và review; schema/migration tương thích; contract có tài liệu khớp implementation; Java/Worker/Runner chạy được theo runbook; lifecycle và failure paths không báo trạng thái sai; cấu hình không phụ thuộc credential hardcoded; các kiểm chứng backend quan trọng pass trên đúng release candidate; không còn blocker bị ẩn bằng workaround. Không đồng nghĩa mọi loại repo/runtime hoặc mọi yêu cầu production quy mô lớn đều được hỗ trợ.

## 1. Chốt phạm vi và hợp nhất nguồn làm việc

- Xác minh main và status của workspace chính `feat/runtime-allocation` cùng Java worktree `feat/java-runtime-contract-fixes`.
- Kiểm kê modified/untracked có mục tiêu: task runtime, local edits Worker có trước, docs/fixtures cần giữ và output generated không đưa vào Git. Không xóa hoặc stage công việc của người dùng chỉ vì chưa rõ nguồn gốc.
- Đưa Java fixes, migrations V9/V10, .NET integration thành commits reviewable. V9/V10 đã apply cloud: giữ nguyên tên/nội dung/checksum; migration mới dùng số kế tiếp sau kiểm main.
- Đồng bộ branch base trước khi mở PR, giải quyết conflict theo contract thật. Không để local Java cũ được hiểu là source release mới.

Đầu ra: danh sách commit/PR và source authority duy nhất; không còn patch cần thiết chỉ nằm trong thư mục test hoặc bản sao sandbox.

## 2. Đóng các gate runtime còn thiếu

- Timeout và startup failure managed E2E: trạng thái execution/scenario/evidence/cleanup đúng; receipt commit ngay cả khi không có model; latest-valid không đổi sai.
- Crash trước receipt: triển khai recovery-result additive Java–Runner có manifest scope, service auth, lock/idempotency và cleanup thực tế. Không bịa scenario outcome hoặc dùng execution receipt giả. Duplicate recover/delivery an toàn, conflicting result reject, allocation không tái sử dụng.
- Crash sau receipt: resend/deliver-pending dùng đúng receipt bất biến và ack digest; không chạy workload lại.
- Kiểm tra concurrent receipt/session publication cùng project, stop/ack/receipt races, strict service auth và negative project access. Sửa đúng failure có bằng chứng.

Đầu ra: runtime có đường success/failure/timeout/cancel/recovery rõ ràng; không có Java RUNNING giả hoặc cleanup Confirmed khi còn resource.

## 3. Chuẩn hóa cấu hình và dùng cloud thật

- Đưa profile cloud secret-environment vào code release, rà datasource/JWT/mail/AI/Worker/Runner config có liên quan. Không in secret trong docs/log; credential đã commit phải được owner rotate, không chỉ xóa khỏi file rồi coi an toàn.
- Aiven hiện V10: xác minh Flyway history/checksum bằng read-only, không clean/reset DB. Mặc định Java cloud ddl-auto validate; migrate có bước explicit.
- Xác định Java host, Worker private URL, artifact staging mount/path mapping và Runner state-root. Cloud DB không tự cung cấp source files hoặc remote Docker execution.
- Khởi động Java release candidate với cloud, strict auth, Worker được cấu hình; smoke giới hạn bằng project/account kiểm thử riêng. Không chạy fault/corpus/load test trên dữ liệu chung.
- Chốt mail/AI provider: nếu chưa cấu hình, API trả disabled/fallback rõ ràng theo contract, không báo đã gửi email/called AI khi chưa có bằng chứng. Google OAuth cần config thật để nghiệm thu, nếu hoãn thì ghi ngoài scope bản giao.

Đầu ra: runbook một môi trường BE có thể tái lập; app cloud startup và smoke pass, không chỉ schema có bảng.

## 4. Audit chức năng BE theo nhóm FR, đóng scope rõ ràng

Kiểm tra theo API/controller/service đang có, không scan toàn repo vô mục đích:

- Account/session/roles và project/workspace/member/assignment/reference.
- ZIP/GitHub snapshot → explicit analyze/idempotency → job/attempt/cancel/history → atomic publication.
- Model/graph/evidence, diagrams/layout/export, revision/diff, evaluation và impact Java→.NET.
- Runtime configuration/session/lifecycle/receipt/sequence và recovery.
- AI grounded/fallback/cache/evidence scope; submission pinned artifacts/feedback/export; admin/audit.

Mỗi nhóm phân biệt implemented/verified/disabled/deferred. Với API đang được giao: sửa sai scope/auth/error handling và bất biến dữ liệu; với feature chưa có trong phạm vi release: đánh dấu không hỗ trợ thay vì tạo endpoint giả. Không tự mở thêm feature vì tên xuất hiện trong PDF.

Đầu ra: danh mục BE release chính xác, không claim 100% trên mọi FR chỉ dựa controller tồn tại.

## 5. Dọn BE có giới hạn, không redesign

- Legacy `/api/analysis` và `/api/jobs` tiếp tục disabled nếu chưa có consumer bắt buộc. Ghi rõ trong OpenAPI hoặc ẩn legacy khỏi UI khi phù hợp, không tự xóa compatibility đang dùng.
- Đồng bộ DTO, HTTP codes, route, timestamp/outcome labels và version docs giữa Java/.NET. Không thêm lớp abstraction hay dependencies chỉ để đổi style.
- Chuẩn hóa ProblemDetails/ApiResponse errors cần thiết: invalid content type/input/unknown route về 4xx; không lộ exception/paths/secret ở public response.
- Rà generated/cache/target/bin/obj/.artifacts tracking và ignore; chỉ bỏ khỏi index những artifact đã xác nhận generated trong scope BE, không xóa dữ liệu/source người dùng.
- Gỡ code thử nghiệm task đã chứng minh không dùng, imports/dead helpers task tạo ra; không refactor toàn module làm tăng rủi ro.
- Docs duy nhất cho setup/contract/status; tài liệu lịch sử giữ nhãn baseline để tránh agent/FE dùng endpoint cũ.

Đầu ra: diff gọn, source build được từ checkout sạch, không cần lấy file từ .doc_review/.artifacts để ứng dụng chạy.

## 6. Kiểm chứng backend trước bàn giao

- Narrow tests theo mỗi fix; kết thúc bằng regression Java/.NET phù hợp trên cặp commits cuối. Không lấy số pass cũ gán cho code vừa đổi.
- Fresh PostgreSQL migrations → startup validation; cloud schema validation và smoke riêng.
- Real corpus eShop/Petclinic với commit pin: analyze/replay/concurrency, một attempt/model, graph/evidence/impact/export. Không SQL workaround.
- Trusted local runtime workload: success/cancel/failure/timeout/startup/crash recovery và actual Docker resource checks.
- Package JAR/.NET publish và kiểm classpath/runtime config từ source sạch, không chỉ IDE tests.
- Ghi test inputs, commit pair, môi trường, pass/fail/skip, giới hạn. Không đưa dump database hoặc log có secret vào PR.

Đầu ra: release evidence đủ để FE tích hợp ổn định. Test layout/browser và UX E2E để sau, nhưng không hoãn kiểm tra integrity/security/lifecycle BE.

## 7. PR, main và bàn giao FE

- PR Java server/migration/fixes trước, consumer .NET tương thích sau hoặc merge theo dependency đã kiểm chứng; liên kết commits counterpart.
- Review diff cuối, migrations/secret/generated-files check. Push/PR/merge theo yêu cầu được giao; không suy ra cho phép deploy cloud chung hoặc force-push.
- Sau merge xác minh main chính là release candidate đã test; chạy lại affected checks nếu merge đổi source liên quan.
- Bàn giao FE một bộ: base URLs/config, OpenAPI, auth flow, ApiResponse/errors, IDs/version context, sample safe payloads, import→analyze→poll workflow, graph/impact/evidence shapes và runtime statuses.
- Hướng dẫn FE không gọi Worker trực tiếp hoặc cầm service key. FE chỉ gọi Java public API; Java giữ authority project/model/session.

## Thứ tự thực hiện ngay

1. Baseline/commits và audit local edits.
2. Timeout/startup + recovery-result code và backend tests.
3. Hoàn thiện cloud config/startup/smoke.
4. Audit FR gaps/error contracts và cleanup có giới hạn.
5. Regression/package/PR/main, rồi mới nối FE.

Nếu phát hiện blocker mới, ghi repro và sửa trong nhóm tương ứng; không kéo dài bằng cải thiện ngoài scope. Release blockers phải được xử lý hoặc loại scope minh bạch trước khi ghi hoàn tất.

## Những mục chưa được coi đã làm chỉ vì có plan

Kế hoạch này chưa chạy thêm test, chưa merge code, chưa xác nhận Java cloud startup, chưa hoàn thiện recovery-result. Backup và V9/V10 cloud đã hoàn tất ở lượt trước; success/cancel/scenario-failure/corpus replay đã có evidence nhưng phải gắn đúng baseline. Tiến độ triển khai tiếp theo sẽ cập nhật từng mục bằng commit và evidence, không bằng phần trăm ước lượng.

## Checkpoint triển khai tiếp

- Java commit `6ade22a` trên feat/java-runtime-contract-fixes: runtime/replay fixes, migration V9/V10/V11, recovery-result additive, cloud profile/env datasource. Credential cloud bị commit trước đây cần owner rotate; không coi việc bỏ khỏi source là đã rotate.
- .NET commit `936bdd2` trên feat/runtime-allocation: managed lifecycle/receipt/outbox, managed-recover và tests/fixtures/docs. Các local edits API có trước vẫn ngoài commit, chưa được gộp mặc định vào release.
- Managed actual Java/PostgreSQL/Docker: success/replay 16/16; timeout 10/10; startup failure 15/15; kill Runner + managed recovery 15/15. Recovery replay an toàn, conflicting recovery và late execution receipt sau recovery đều 409; actual resources empty.
- Java targeted recovery/session/receipt/digest 24/24; .NET recovery/lifecycle 8/8. Đây là checks/suites riêng, không cộng chồng evidence cũ.
- Cloud backup pre-V11 verified, Flyway V11 success. Java sửa chạy thật với Aiven, read-only datasource, schema validate; OpenAPI 200 và unauthenticated protected API 403. Không tạo project/fault workload trên cloud chung.
- Chưa push/PR/merge main hoặc nối FE. Cần thống nhất các local edits Worker API còn lại, review release candidate kết hợp hai commits, kiểm config provider/mail/auth scope theo nhóm FR và chuẩn bị bàn giao FE. Không ghi toàn bộ plan đã hoàn tất từ checkpoint này.
