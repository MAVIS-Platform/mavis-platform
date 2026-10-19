# MAVIS.Worker C#/.NET

Worker phân tích tĩnh C#/.NET bằng Roslyn và trả kết quả có bằng chứng cho Java hợp nhất vào Shared Architectural Model. Nhựt còn phụ trách thuật toán Change Impact phối hợp Triết và Dedicated Runtime Runner ở các giai đoạn sau.

README là kế hoạch và sổ tiến độ riêng của phần C#. Chỉ đánh dấu hoàn thành sau khi có implementation và verification; các contract dưới đây là thiết kế đề xuất, chưa phải API đã được nghiệm thu.

## 1. Tài liệu làm căn cứ

Đối chiếu ngày 20/10/2026 với `../.doc_review/main/`:

- `Chia nhiệm vụ.docx`: trách nhiệm thành viên và ba giai đoạn triển khai.
- `Report 1.docx`: phạm vi, giới hạn phân tích/runtime, versioning và provenance.
- `System architecture.drawio.png`: Java quản lý DB/artifact storage, Worker giao tiếp HTTP/JSON, Runner tách biệt.
- `Mainflow.drawio.png`: CF-02 phân tích; CF-07 impact; CF-09 cấu hình; CF-10 scenario; CF-11 thực thi; CF-12 hủy.
- `Mainflow business.drawio.png`: SF-07/SF-08 quản trị profile/session; runtime tùy mục tiêu dự án cá nhân và yêu cầu bài tập.
- Context, use case, ERD, package và screen flows: kết quả được dùng theo đúng phiên bản và bằng chứng.

Lane “Analysis Worker” trong CF-02 mô tả pipeline đa ngôn ngữ tổng thể. Không mặc định mọi thao tác trong lane đều nằm trong executable .NET: phân công và sơ đồ kiến trúc giao Java hợp nhất mô hình, Worker trả findings C#.

ERD hiện chưa thể hiện đủ runtime/scenario/trace/profile; schema do Vũ phối hợp Triết/Nhựt chốt. Những trang nhúng draw.io cũ không tự trở thành thiết kế đã được thông qua.

## 2. Phân chia để không chồng việc

### Java Backend

- Vũ: platform giáo dục, quyền truy cập, schema, lưu phiên bản/provenance, quản trị profile và runtime.
- Triết: ingestion ZIP/Git, SourceSnapshot, Java/config analysis, Worker client, hợp nhất mô hình, diagram/rules/AI và API điều phối runtime.
- Java lưu model, matching graph, evidence, coverage và warnings nhất quán trước khi công bố analysis job COMPLETED theo CF-02.

### Worker C#

- Nhận source snapshot reference và phạm vi/profile phân tích.
- Đọc source/config C# được hỗ trợ, trích xuất elements, typed relationships, endpoints, evidence, coverage và warnings.
- Trả findings C# cho Java kiểm tra, hợp nhất và lưu; không ghi trực tiếp database nghiệp vụ.
- Impact nhận graph đã có, không chạy lại Roslyn. Docs giao Triết/Nhựt phối hợp; đề xuất Nhựt sở hữu traversal/path engine, Triết sở hữu API, lấy graph và liên kết diagram/AI. Vị trí engine cần chốt.
- Workspace, assignment, submission, AI explanation và sinh diagram không thuộc Worker.

### Dedicated Runner

- Nhựt: Compose preflight, môi trường thực thi, HTTP Scenario Runner, instrumentation, Collector và trace mapping; Triết làm API điều phối.
- Executable và môi trường tách khỏi Worker phân tích/platform; không cấp Docker quyền cho API Roslyn để phục vụ runtime.
- Ranh giới tạo Compose override, xử lý/mapping trace và truyền artifact giữa Java/Runner cần chốt bằng contract.
- Java lưu kết quả; Vũ quản trị profile/limits và giám sát, Hậu làm UI.

## 3. Baseline trước Preview 1

Các mục sau được xác nhận bằng đọc code, chưa đồng nghĩa build/test đã thành công:

- Bốn project Api/Application/Domain/Infrastructure, target .NET 8; solution hiện là `MAVIS.Worker.slnx`.
- Roslyn syntax walker nhận diện một số HTTP calls, named clients và configuration references.
- Pipeline cũ: C# scan + RawFindings -> Normalize -> Resolve -> Graph -> optional Impact.
- Reverse BFS có khoảng cách, một shortest path cho mỗi affected service và giới hạn độ sâu mặc định.
- Job queue/results nằm trong RAM, mất khi restart; có background service và test source cho analyzer/graph/impact/jobs/integration.
- API đồng bộ còn bắt buộc RawFindings và target khi computeImpact=true; chưa có API source-only mới.
- Chưa có đầy đủ cấu trúc project, inbound API, DI, EF Core, coverage/warnings và snapshot contract theo yêu cầu mới.
- Chưa có Dedicated Runner/OTel pipeline trong phần Worker đã rà soát.
- Chưa xác minh baseline build/test trong lần cập nhật README này.

`WORKER_API_CONTRACT.md`, `worker-contract-sample.json` và `ROSLYN_CSHARP_ANALYZER.md` là tài liệu chuyển tiếp của baseline cũ. Không xem ví dụ cũ là contract mới đã chốt. Worker không render UI graph.

## 4. Nhận gì, làm gì, trả gì

### Phân tích C# độc lập

Nhận đề xuất: schema version, job ID, project ID, source snapshot ID, source reference và phạm vi/profile phân tích.

Làm: kiểm tra source scope -> nhận diện project -> đọc cấu trúc/API/HTTP/DI/DB/config -> tạo typed relationships và evidence -> kiểm tra tham chiếu -> đóng gói findings.

Trả đề xuất: input references, analyzer/profile version, elements, endpoints, relationships, evidence, unresolved items, coverage, warnings và diagnostics. Đây chưa phải model đa ngôn ngữ chính thức đã lưu.

Local dùng source directory dưới root được cấu hình cho phép, không cần Java/DB/Docker. Tách máy/container cần cơ chế artifact hoặc controlled mount; không mặc định đường dẫn trên máy Java tồn tại ở Worker.

Static analysis không build/run ứng dụng đích. Không tự chạy MSBuild targets, restore scripts hoặc code của repository để đọc project. Khi thiếu semantic references phải ghi rõ giới hạn.

### Change Impact

Nhận graph/model revision, selected service, nodes, typed edges, evidence references, traversal limits và runtime observations tùy chọn.

Làm kiểm tra revision/readiness -> chọn loại cạnh phù hợp -> reverse traversal -> dựng affected services/paths -> gắn evidence và warnings.

Trả direct/indirect impacts, dependency paths, source evidence, runtime context tương thích và giới hạn; giữ nguyên định danh input versions.

### Runtime

Nhận session ID, source/model/profile/configuration/scenario versions đã cố định, source/image references, service mappings và protected secret references.

Làm revalidate -> allocate -> build/verify images -> instrument -> readiness -> approved setup/reset và HTTP requests -> bounded trace drain -> preserve data -> cleanup -> correlation.

Trả image digests thực dùng, scenario outcomes, traces/artifact references, mappings, diagnostics và execution/persistence/cleanup states riêng biệt. Generate Diagram là CF-03 riêng.

## 5. Kế hoạch và tiêu chí nghiệm thu

M0–M3 phục vụ giai đoạn 1 trong phân công; M4 phục vụ giai đoạn 2; M5–M7 phục vụ giai đoạn 3. Các checkbox hiện là việc cần làm, không phải tính năng đã hoàn thành.

### M0 — Xác minh baseline và ranh giới

- [x] Build/test baseline: SDK 10.0.204, 66/66 tests pass ngày 20/10/2026.
- [ ] Chốt với Triết ownership model merge, service identity, vị trí impact engine và source access.
- [ ] Chọn sample C# đã rà soát và expected findings làm chuẩn.

Nghiệm thu: baseline có bằng chứng; quyết định tích hợp và giới hạn được ghi rõ; Worker local không cần thay đổi Java.

### M1 — Contract và API phân tích C# độc lập

- [x] Tạo request/result schema 1.0, job/snapshot references, findings riêng; không trả manifest chung.
- [x] Thêm use case IDotnetProjectAnalyzer riêng, không cần RawFindings và không chạy impact.
- [x] Implement POST /api/v1/dotnet/analyze cho local source-only; Java consumer chưa tích hợp.
- [ ] Dùng chung validation cho điểm vào trực tiếp/job; kiểm tra source scope, symlink/junction escape và input limits.
- [ ] Chốt canonical evidence IDs với Java. Hiện có snapshot-relative file/dòng từ 1, không trả snippets/config values; HTTP candidate chỉ trả host, bỏ URL/query/credentials.
- [ ] Errors, cancellation propagation, warnings và coverage rõ ràng.
- [ ] Kiểm tra consumer trước khi deprecate endpoint cũ; cập nhật contract và JSON mẫu theo response thật.

Nghiệm thu: gửi source C# không có findings Java, nhận JSON/evidence đúng; source không hợp lệ bị từ chối; không thực thi code đích, không cần Java/DB/Docker.

### M2 — Project discovery và cấu trúc

- [ ] Đọc .sln/.csproj, project references, .cs, appsettings.json và biến thể theo profile.
- [ ] Phân biệt solution/project/namespace với service; thay suy luận thư mục đầu tiên luôn là service.
- [ ] Trích xuất namespace, class, interface, inheritance/implementation và code dependencies được hỗ trợ.
- [ ] Bổ sung semantic analysis khi đủ dữ liệu; trả fallback/unresolved khi thiếu references/config.
- [ ] Loại generated/build/dependency files; giới hạn số file, dung lượng và thời gian.
- [ ] Giữ valid partial findings; không nuốt lỗi/cancellation thành kết quả đầy đủ.

Nghiệm thu: sample nhiều project và thiếu references trả đúng coverage/evidence; identity lặp lại ổn định theo quy tắc đã chốt.

### M3 — ASP.NET Core findings và bàn giao Java

- [ ] Controller routes/HTTP verbs/[ApiController] theo supported profile.
- [ ] Minimal API, MapGet/MapPost và route groups theo profile.
- [ ] HttpClient, named/typed IHttpClientFactory, Refit; resolve base address/config khi đủ bằng chứng.
- [ ] DI registrations/injection và EF Core DbContext/database access.
- [ ] Tách service call/code dependency/containment/DB access; không biến mọi reference thành service call.
- [ ] Giữ unresolved target và mapping warnings thay vì đoán quan hệ chắc chắn.
- [ ] Contract fixtures với Triết; kiểm thử endpoint và evidence trên sample.

Nghiệm thu độc lập: expected findings đúng qua API. Nghiệm thu tích hợp riêng: Java nhận JSON, hợp nhất Java/C# và frontend mở đúng code evidence. Không đánh dấu tích hợp xong chỉ bằng Worker tests.

### M4 — Impact theo CF-07

- [ ] API/use case nhận graph đã có; không chạy lại source analysis.
- [ ] A -> B nghĩa A phụ thuộc B; thay đổi B duyệt ngược đến A.
- [ ] Chỉ dùng loại cạnh có ngữ nghĩa impact; không tự traversal containment.
- [ ] Cycle/isolated node/empty result/selected service validation.
- [ ] Chốt max depth/path limits và path policy; một shortest path không phải toàn bộ paths.
- [ ] Paths gắn source evidence; runtime chỉ bổ sung khi provenance/mapping tương thích.
- [ ] Không xóa static edges khi thiếu runtime; runtime-only/unmapped interactions giữ riêng để review.
- [ ] Chuyển Java sang một engine chính sau đối chiếu, tránh hai bản BFS tiếp tục phát triển độc lập.

Nghiệm thu: chain/diamond/cycle/mixed-edge fixtures cho kết quả đúng; reject graph sai revision; warnings khi giới hạn hoặc runtime không tương thích.

### M5 — Compose preflight và profile PoC

- [ ] Tạo executable Runner riêng; vị trí project chốt khi bắt đầu.
- [ ] Preflight Linux Compose cho Java Spring Boot/ASP.NET Core theo profile được kiểm chứng.
- [ ] Kiểm tra services, build context/images, mounts/privileges/network policy, missing settings và mappings.
- [ ] Preflight không build/start; không coi validation là isolation hoặc readiness.
- [ ] Chốt contract với Triết và profile/limits với Vũ; phân biệt supported/unsupported/unverified.

Nghiệm thu: Compose fixtures trả compatibility/rejection lý do rõ; chưa allocate tài nguyên; profile chỉ được công bố validated khi có PoC evidence.

### M6 — Dedicated Runner và HTTP scenarios

- [ ] Isolation tách platform data; hạn chế Docker socket, host mounts, privileges và network destinations.
- [ ] Temporary Compose override gắn Java agent/.NET automatic instrumentation, pin phiên bản qua PoC.
- [ ] CPU/memory/concurrency/session deadlines; readiness/Collector checks có bounded waits.
- [ ] Ordered requests, variables/dependencies, authentication references, approved setup/reset và expected outcomes.
- [ ] Revalidate mỗi lần chạy; cố định input versions, ghi image digests thực dùng.
- [ ] Một lifecycle cho success/failure/timeout/cancel/Admin stop; idempotency và terminal-state races.
- [ ] Preserve evidence, cleanup cả khi persistence lỗi; background reconciliation/recovery cho stop/cleanup chưa xác nhận.

Nghiệm thu: Java/.NET sample chạy độc lập trên execution host phù hợp; success, startup failure, request failure, timeout, cancellation, repeat/reset và leaked resources được kiểm tra. Báo scenario outcome tách cleanup status.

### M7 — Trace correlation và tích hợp

- [ ] Collector OTLP và redaction trước khi dữ liệu đi vào saved/exported results.
- [ ] Giữ traceId/spanId/parentSpanId, session/step references; dựng quan hệ nhân quả.
- [ ] Không nối unrelated traces; báo missing spans và uncertain/unmapped services.
- [ ] Kiểm tra provenance/image-source correspondence và model mappings.
- [ ] Không giữ runner sống chỉ để chờ post-capture mapping review.
- [ ] Java lưu evidence; diagram generation và evidence exploration dùng saved results.
- [ ] Đo accuracy/coverage/repeatability/cleanup trên sample được rà soát; ngưỡng nghiệm thu định trước trong SRS.

Nghiệm thu: trace đúng snapshot/model/session/scenario; failed request vẫn giữ useful trace; execution/scenario/trace/persistence/cleanup không gộp thành một cờ success. Java/UI integration có verification riêng.

## 6. Những quyết định cần thống nhất với nhóm

- Schema versioning, enum/relationship semantics, canonical IDs và mapping sang DB IDs.
- Source artifact access, integrity/hash, root scope và thời hạn truy cập.
- Job correlation/retry/idempotency/timeouts, payload/concurrency limits và status mapping.
- Queue RAM chỉ là baseline local; chốt recovery/lease trước khi tuyên bố chịu restart. Java sở hữu public job status; worker completion không đồng nghĩa model đã được Java lưu thành công.
- Evidence redaction và protected secret references; không để secrets vào logs/JSON.
- Model merge/graph projection ở Java, traversal engine và đồng bộ revisions.
- Compose override ownership, trace mapping và artifact/outcome delivery giữa Runner/Java.

Worker có thể phát triển với contract fixtures khi Java chưa chạy. Các quyết định chưa chốt phải ghi rõ, không giả định là đã được thành viên khác đồng ý.

## 7. Build và chạy baseline

Chạy từ thư mục MAVIS.Worker. Cần SDK hỗ trợ target .NET 8. Lệnh dùng project trực tiếp để không phụ thuộc CLI hỗ trợ solution .slnx:

```powershell
dotnet build src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj
dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj
dotnet run --project src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj --launch-profile http
```

Profile http hiện dùng http://localhost:5082, Swagger bật ở Development.

```powershell
Invoke-RestMethod http://localhost:5082/api/health
```

API hiện có trong code, chưa xác minh chạy trong lần cập nhật này:

- GET /api/health: health; không chứng minh mọi source đều phân tích được.
- POST /api/analysis: synchronous pipeline cũ, còn yêu cầu RawFindings.
- POST /api/jobs/submit: queue pipeline cũ.
- GET /api/jobs/{jobId}: status/result trong RAM.

API source-only đã có và được test độc lập ở mục 9. M1 còn phần tích hợp/job contract cần chốt; impact riêng và runtime chưa triển khai. Các endpoint cũ được giữ nguyên.

## 8. Tiến độ thực tế

### 20/10/2026 — Lập kế hoạch

- Hoàn thành: đối chiếu docs mới, rà code liên quan, ghi ranh giới/backlog/tiêu chí nghiệm thu vào README.
- Chưa làm trong lần này: sửa implementation, chạy build/test, chốt contract với thành viên khác hoặc tích hợp Java/UI.
- Tiếp theo: M0 xác minh baseline, sau đó M1 source-only analysis.

### Cập nhật sau mỗi phần triển khai

1. Chỉ tick mục đã thực hiện và kiểm chứng; không tick cả mốc khi còn thiếu tiêu chí.
2. Ghi ngày, hành vi/API thay đổi, lệnh verification và kết quả thực tế, giới hạn còn lại và bước tiếp theo.
3. API đổi thì cập nhật endpoint, request/result mẫu và contract trong cùng thay đổi.
4. Phân biệt có code, đã test độc lập và đã tích hợp Java/UI.
5. Docs nguồn thay đổi thì ghi ảnh hưởng trước khi đổi scope triển khai.

## 9. API source-only đã triển khai ngày 20/10/2026

Nhánh: `feat/worker-standalone-analysis`. Endpoint mới không dùng pipeline graph cũ và không ghi DB. Những thay đổi có sẵn trước nhánh được giữ nguyên.

Cấu hình bắt buộc: `DotnetAnalysis:AllowedSourceRoots`. Mặc định danh sách rỗng, từ chối tất cả source; không tự mở quyền đọc toàn máy. Chỉ dùng API local hoặc mạng nội bộ được kiểm soát; chưa có xác thực dịch vụ. Source snapshot cần bất biến trong suốt phiên đọc; chưa xác minh hash/artifact provenance.

Chạy từ thư mục MAVIS.Worker, chọn thư mục chứa source được phép:

```powershell
$env:DotnetAnalysis__AllowedSourceRoots__0 = 'C:/samples/mavis'
dotnet run --project src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj --launch-profile http
```

Trong terminal khác:

```powershell
$body = @{
    schemaVersion = '1.0'
    jobId = 'local-job-001'
    projectId = 'local-project'
    sourceSnapshotId = 'snapshot-001'
    sourceLocation = 'C:/samples/mavis/Orders'
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:5082/api/v1/dotnet/analyze' -ContentType 'application/json' -Body $body
```

DTO hiện tại nằm ở `src/MAVIS.Worker.Application/Analysis/IDotnetProjectAnalyzer.cs`. Response có schemaVersion/jobId/projectId/sourceSnapshotId/analyzerVersion, findings, coverage và warnings. Findings gồm kind/projectPath/target/httpMethod/evidence; evidence là filePath/startLine/endLine. Source không có .csproj bị từ chối. Mọi response thành công hiện ghi coverage.mode=`PartialSyntax` và cảnh báo `SYNTAX_ONLY`.

Capabilities hiện tại: class/interface/type declarations và outgoing HTTP syntax candidates. HTTP receiver type chưa được semantic binding; host chưa phải model service ID. Project ownership suy từ .csproj gần nhất chứa file, chưa evaluate include/exclude/linked files; không nên coi đây là danh sách compile items chính xác. Không có endpoint/DI/DB/config/Refit analysis mới, model merge hay impact trong API này. M2/M3 vẫn chưa hoàn thành.

Source access: chặn path ngoài allowed roots (kể cả prefix sibling), reparse points/symlinks/junctions trên source path và trong traversal; bỏ bin/obj/.git/.vs/node_modules. Chưa có dedicated OS isolation; source phải là snapshot bất biến do môi trường tin cậy chuẩn bị, không coi kiểm tra path là sandbox cho repository bị thay đổi đồng thời.

Limits mặc định: MaxFiles=2000 (file .cs/.csproj), MaxFileBytes=1048576, MaxTotalBytes=20971520 (đọc .cs), TimeoutSeconds=60; cấu hình cùng section DotnetAnalysis. Cancellation được truyền qua discovery/read/parse. Invalid request/source trả ProblemDetails 400, deadline trả 408; lỗi hệ thống dùng exception handler hiện có. Các lỗi quyền/IO không trả chi tiết đường dẫn source qua endpoint mới.

API mới là synchronous local use case; jobId do caller cấp để correlation, không phải enqueue/polling hoặc public job completion. Các API jobs cũ vẫn dùng pipeline cũ và validation cũ; chưa có source-only job. Không gửi request contract mới vào /api/jobs/submit.

Verification 20/10/2026:

- Baseline trước thay đổi: `dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --verbosity minimal`: 66/66 pass, SDK 10.0.204.
- Sau triển khai: `dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --verbosity minimal`: 74/74 pass (66 cũ + 8 cases mới), build thành công.
- Cases mới: source-only qua HTTP, snapshot/relative line evidence, không lộ sentinel trong URL query, root scope, contract validation, byte limit, cancellation, syntax warnings và bỏ obj, prefix sibling.
- Chưa verify thực nghiệm symlink/junction, deadline exhaustion, Linux execution hoặc Java/UI integration; không đánh dấu những phần này hoàn thành.

Tiến độ: hoàn thành lát cắt đầu M1; M0 còn các quyết định phối hợp và sample chuẩn, M1 còn job contract/shared validation, IDs và lifecycle integration. Tiếp theo triển khai project discovery/structural analysis M2 sau khi chốt contract; không mở runtime trong mốc này.
