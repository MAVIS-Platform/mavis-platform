# MAVIS.Worker C#/.NET

Worker phân tích tĩnh C#/.NET bằng Roslyn và trả kết quả có bằng chứng cho Java hợp nhất vào Shared Architectural Model. Phần độc lập hiện có API Change Impact và executable Dedicated Runtime Runner riêng; các giới hạn và phần phối hợp Java được ghi rõ bên dưới.

README là kế hoạch và sổ tiến độ riêng của phần C#. Chỉ đánh dấu hoàn thành sau implementation và verification. Các API hiện hành đã test độc lập; contract tích hợp Java vẫn cần nhóm thống nhất. Mục 8–10 và 12–13 là lịch sử, mục 11 là checklist hiện hành.

## Trạng thái triển khai ngày 20/10/2026

- Static profile `dotnet-static/1.5`: source-only analysis/jobs, project/compile metadata, bounded semantic binding, partial types, ASP.NET pattern findings và config keys/hosts có evidence/warnings. Không build/run source đích.
- Versioned impact API: reverse BFS, typed service edges, một shortest path mỗi dependent, evidence và runtime context không xóa static edges.
- Dedicated Runner: executable riêng, strict image-only preflight, Compose override, internal-network HTTP scenario container, agents/Collector, causal correlation, bounded lifecycle/cancel/cleanup/recovery.
- Hai dự án mẫu thật đã chạy cả .NET -> Java và Java -> .NET; có case request fail, startup fail, timeout, cancel và abandoned cleanup. Bằng chứng: [PoC evidence](samples/runtime-poc/POC_EVIDENCE.json).
- Hướng dẫn API: [DOTNET_API_V1.md](DOTNET_API_V1.md). Hướng dẫn Runner và tái tạo PoC: [RUNNER.md](RUNNER.md).
- Chưa phải nghiệm thu toàn bộ MAVIS: Java/UI, canonical IDs/source delivery, durable job/result orchestration, production isolation, secret store và SRS thresholds vẫn là phần tích hợp chưa hoàn thành.

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

`ROSLYN_CSHARP_ANALYZER.md` và các file local cũ `WORKER_API_CONTRACT.md`/`worker-contract-sample.json` (nếu có) là tài liệu chuyển tiếp của baseline cũ. Không xem ví dụ cũ là contract mới đã chốt. Worker không render UI graph.

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

Chạy từ thư mục MAVIS.Worker. Cần đúng SDK 10.0.204 theo global.json; Worker/Runner target .NET 10. Các ứng dụng PoC vẫn target .NET 8. Lệnh dùng project trực tiếp để không phụ thuộc CLI hỗ trợ solution .slnx:

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

## 10. M2 bước đầu — project metadata và cấu trúc source

Triển khai ngày 20/10/2026 trên `feat/worker-standalone-analysis`:

- Discovery thêm `.sln` (chưa hỗ trợ `.slnx` cho source đích). Đọc project entries và `.csproj` ProjectReference dạng đường dẫn literal, kể cả XML namespace MSBuild cũ.
- Không thực thi MSBuild targets, imports hay conditions. Reference chỉ được đối chiếu với project đã discovery dưới source root, không mở file theo reference.
- Project XML không hợp lệ hoặc có DTD/external entities trả `INVALID_PROJECT_XML`; vẫn giữ findings source có thể đọc.
- Conditional/dynamic/missing/outside references trả `UNRESOLVED_PROJECT_REFERENCE`, không tự tạo project edge đã xác nhận.
- Findings thêm `Project`, `Solution`, `ProjectReference`, `SolutionProject`, `Namespace`, `BaseTypeCandidate`. Quan hệ project không phải service call hoặc impact edge mặc định.
- `Type`/`Interface` giữ tương thích tên kind của API bước đầu. Có `subject` là tên đầy đủ gồm namespace/nested type/generic arity; `id` SHA-256 từ project-relative path, kind và qualified identity. BaseTypeCandidate ID gồm source/target syntax. Những ID này chưa phải canonical IDs đã được Java thống nhất.
- Namespace/type/base-type findings có ID ổn định khi đổi dòng hoặc vị trí khai báo trong cùng project. Partial declarations có thể chia sẻ ID và có nhiều vị trí evidence; chưa gom thành một semantic symbol. Đổi project path hoặc tên symbol làm đổi ID, chưa có rename matching.
- Base types chưa phân biệt chắc chắn inheritance với interface implementation; trả `UNRESOLVED_BASE_TYPES` và không nhận là resolved code/service dependency.
- File/byte budgets áp dụng cả metadata đã đọc; `MaxFiles` tính .cs/.csproj/.sln, `MaxTotalBytes` tính .cs + metadata. Evidence reference theo dòng gốc.

Contract schema vẫn 1.0, analyzerVersion tăng `dotnet-syntax/1.1`. Các trường subject/id là bổ sung nullable; các findings metadata/HTTP hiện có thể chưa có ID. Java consumer chưa tích hợp, cần xác nhận xử lý findings kinds mới trước khi dùng thực tế.

Giới hạn M2 còn lại:

- Chưa evaluate Compile Include/Remove/Exclude, imports, framework conditions và generated files. `PROJECT_ITEMS_UNEVALUATED` luôn được trả cho mỗi project; owner dựa trên project directory gần nhất, không phải kết quả build.
- Chưa semantic binding, namespace alias resolution, fully resolved inheritance/implementation, appsettings/config resolution hay service identity mapping.
- Solution entries được đọc để mô tả quan hệ, chưa giới hạn phạm vi phân tích theo solution membership. Các project discovery khác vẫn được phân tích với evidence riêng.
- Không tick toàn bộ M2 vì các giới hạn trên chưa được hoàn tất; các API background job và integration còn như mục 9.

Verification: full Worker suite `dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --verbosity minimal` đạt **80/80 pass**, build thành công. Thêm 6 cases: solution/project refs và target không bị chạy; qualified identity ổn định; missing/outside/conditional/dynamic refs; malformed XML; external-entity XML; metadata byte limit. 74 cases trước vẫn pass.

Tiếp theo: chuẩn hóa project compile-item profile và ownership, mở rộng semantic/reference handling có giới hạn trước khi nhận diện endpoint/DI/EF Core. Chưa triển khai runtime hay thay Java backend trong mốc này.

## 11. Checklist tổng thể đến nghiệm thu

Đây là bảng tiến độ tổng hợp hiện hành; mục 5 giữ kế hoạch và tiêu chí nghiệm thu, mục 8–10 giữ lịch sử. `[x]` chỉ nghĩa là phạm vi được ghi đã có code và verification, không có nghĩa toàn bộ mốc hoặc tích hợp đã hoàn thành. Cập nhật lần cuối: 20/10/2026, Windows: 133 pass, 1 Linux-only skip; Linux: 68 profile tests pass.

### Nền tảng Worker độc lập

- [x] N01 (phần nền tảng): Worker/Runner/tests target .NET 10, pin SDK 10.0.204 và NuGet lock files; Windows regression 133 pass, 1 Linux-only skip.
- [x] N01 Worker code: signed artifact scope thay raw HTTP SourceLocation, service auth, deadline/attempt, health/readiness, error envelope và build image (mục 19).
- [x] N01 contract probe: Java 21/Jackson đọc fixture request/result/error, xác minh HMAC và input digest.
- [ ] N01 nghiệm thu nhóm: Vũ review V02/format grant, Java client/artifact delivery thật và integrated acceptance.
- [x] N01/N18: Linux .NET 10 compatibility regression đạt 148/148 (SDK 10.0.402; xem mục 18).
- [ ] N01/N18: tái lập Linux đúng SDK 10.0.204 và chạy lại hai PoC với Runner image mới.

- [x] API phân tích source C# không cần Java findings.
- [x] Snapshot/job correlation, evidence file/dòng, coverage và warnings.
- [x] Allowed source roots, file/byte budgets, deadline và cancellation propagation trong implementation; các giới hạn thực nghiệm còn bên dưới.
- [x] Source-only background jobs: submit, progress, lấy kết quả, hủy.
- [x] Chung validation giữa API trực tiếp và source-only job.
- [x] Windows junction bị từ chối 400; deadline 1s trả 408 (~1183ms trên pilot); Linux 68 tests gồm file/root symlink rejection.
- [ ] Source snapshot delivery khi Java/Worker khác host/container.
- [x] Analysis input fingerprint và expected digest; mọi API v1 bắt buộc service key; legacy tắt mặc định mọi environment. HTTP source chỉ qua signed artifact grant.
- [ ] Xác minh snapshot origin/delivery và authorization theo project qua Java.
- [ ] Recovery/lease khi restart; queue hiện chỉ nằm trong RAM.

### M2 — Cấu trúc C#

- [x] Đọc .sln/.csproj và literal project references mà không thực thi MSBuild.
- [x] Namespace/type/interface, qualified identity và base-type syntax candidates.
- [x] Test ID ổn định khi thay đổi dòng; project XML/DTD/reference warnings và metadata byte limit.
- [x] Static compile-item profile v1: literal Include/Remove/Exclude, default toggles và per-project ownership trên source đã discovery; có cảnh báo chưa đánh giá MSBuild đầy đủ.
- [x] Include/Remove/Exclude, glob cơ bản, semicolon patterns và shared linked source bên trong snapshot theo static profile.
- [ ] Mở rộng ownership theo SDK/imports/conditions được hỗ trợ; hiện không evaluate conditions/Choose/Target và luôn trả giới hạn.
- [x] Semantic binding có kiểm soát và missing-reference diagnostics.
- [x] Resolve inheritance/interface và field/constructor code dependencies khi host-runtime compilation resolve được symbol.
- [ ] Mở rộng dependency profile và target-specific semantic references; hiện trả SEMANTIC_LIMITATIONS khi thiếu dữ liệu.
- [x] Hợp nhất partial declarations và evidence cùng symbol.
- [x] appsettings JSON keys/HTTP hosts theo profile không trả secret values.
- [ ] Environment merging, configuration binding và service identity resolution.
- [ ] Quy tắc service identity; không đồng nhất project/namespace với service.

### M3 — ASP.NET Core

- [x] Controller route/HTTP verb candidates theo literal/constant pattern đã test.
- [ ] Mở rộng convention/action route/attribute alias semantics ngoài profile v1.
- [x] Minimal API và nested route-group candidates với constant routes; unsupported patterns có warnings.
- [x] HttpClient resolved receiver/method khi đủ references; literal host/base-address candidates, dynamic targets giữ unresolved.
- [x] Named/typed/default registration và factory syntax candidates, có test; không tự đồng nhất client name với model service.
- [x] Refit interface HTTP-attribute candidates trong supported source patterns.
- [x] Generic DI registration candidates và resolved field/constructor type dependencies.
- [ ] DI container/lifetime/factory semantics đầy đủ ngoài supported profile.
- [x] DbContext/registration/DbSet/save candidates có evidence; chưa resolve EF/NuGet semantics đầy đủ.
- [ ] EF query/entity/model mapping ngoài syntax profile.
- [ ] Configuration resolution và unresolved items khi thiếu bằng chứng.
- [ ] Phân biệt service call, code dependency, containment và DB access.
- [x] Tests cho findings/evidence/coverage/warnings trong static profile được công bố; unsupported constructs vẫn có giới hạn.

### Tích hợp phân tích tĩnh với Java/UI

- [ ] Chốt contract/IDs/relationship semantics với Triết.
- [ ] Java client xử lý result/errors/retry/cancellation.
- [ ] Java hợp nhất Java/C#/config thành model đúng revision.
- [ ] Java lưu model, matching graph, evidence, coverage và warnings nhất quán.
- [ ] Frontend mở đúng evidence từ node/edge.
- [ ] Kiểm thử mẫu hỗn hợp Java/C# và đối chiếu expected findings.
- [ ] Ghi kết quả đo, giới hạn và supported analysis profiles.

### M4 — Change Impact

- [x] Reverse BFS và shortest-path implementation trong pipeline cũ; chưa phải API impact riêng đã tích hợp.
- [ ] Chốt ownership/vị trí engine với Triết và chỉ một implementation chính.
- [x] API impact nhận graph, không chạy lại source analysis.
- [x] Kiểm tra model/graph revision/readiness và selected service.
- [x] Traversal đúng chiều và loại cạnh; containment không tự thành impact edge.
- [x] Paths có source evidence; depth/path limits minh bạch.
- [x] Chain/cycle/isolated/empty/depth/version/runtime-context tests và HTTP impact smoke test.
- [x] Diamond/parallel-edge regression tests.
- [ ] Acceptance graph fixtures được nhóm rà soát và tích hợp Java/UI.
- [x] Runtime context tương thích, không xóa static edges chưa quan sát.
- [ ] Java/UI highlight đúng graph/diagram mappings.

### M5–M6 — Dedicated Runtime Runner

- [x] Executable Runner riêng; PoC Docker không mount platform data.
- [ ] Dedicated production execution host và tenant isolation acceptance.
- [x] Strict image-only Linux PoC preflight; không build/start trong preflight.
- [x] Target Compose chặn host mounts/socket/privileges/ports/host networking; override và internal-network scenario verified trên PoC.
- [x] CPU/RAM/PIDs/read-only/capability checks từ Docker inspect; local lease và deadline đã test.
- [ ] Platform-wide capacity policy qua approved profiles của Java/Admin.
- [x] Verify content-addressed images và ghi actual IDs; sample builds tách khỏi session runner.
- [ ] Source-build execution profiles và source/image correspondence được nền tảng xác minh.
- [x] Temporary overrides và .NET 1.17.0/Java 2.32.0 agents; download SHA256 và version-label checks, hai chiều trace thật.
- [x] Readiness/Collector checks chạy trong internal network với bounded waits.
- [x] Ordered HTTP requests, variables/dependencies/status checks, protected references qua in-memory/stdin có tests.
- [ ] Platform secret-store integration và authenticated business-scenario acceptance.
- [ ] Approved setup/reset và expected outcomes.
- [x] Validate version references/profile/scenario và bundle labels trước startup; receipt giữ selected versions và actual image IDs.
- [x] Shared bounded lifecycle cho completion/failure/timeout/cancellation và local cancel marker.
- [ ] Java/Admin stop API và durable cross-host control reconciliation.
- [x] Confirm cleanup của container/network/volume; recover đúng generated project, đã test host chết đột ngột.
- [ ] Automated recovery service và durable evidence delivery khi allocator chết.
- [x] Stateless repeat, request/startup failures, timeout, live cancellation, orphan cleanup trên Docker thật.
- [ ] Stateful reset và môi trường có credentials/business data theo SRS.

### M7 — Trace correlation và nghiệm thu

- [x] OTLP Collector transform allowlist và final projection; giữ timing/status, bỏ message/attributes/events nhạy cảm.
- [x] Trace/span/parent IDs, scenario-step/session references và causal ordering, không sắp bằng timestamp.
- [x] Unrelated traces/cycles/missing parents được giữ tách với warning/trace quality rõ.
- [ ] Runtime-service mapping đúng model revision, provenance và image/source correspondence.
- [x] Uncertain/unmapped evidence có warnings, không tạo synthetic spans/paths.
- [x] Execution/scenario/evidence/trace-quality/mapping/cleanup tách riêng; persistence ghi CallerOwned.
- [x] HTTP 503 vẫn thu được trace và causal service interaction trên PoC thật.
- [ ] Java lưu và frontend khám phá evidence; diagram generation chạy riêng trên saved data.
- [x] Hai sample projects .NET -> Java và Java -> .NET; actual image IDs/agent hashes và outcome evidence được lưu.
- [ ] SRS acceptance thresholds và sample/reference traces do nhóm/giảng viên rà soát chính thức.
- [ ] Chốt/nghiệm thu SRS thresholds, báo cáo đo đạc, limitations, test và vận hành.

### Quy tắc cập nhật bắt buộc trong quá trình triển khai

- Mỗi phần code hoàn thành và verification đạt: cập nhật checklist này và entry tiến độ trong cùng commit; không cần người dùng nhắc lại.
- Chỉ tick phạm vi đã chứng minh; nếu hoàn thành một phần thì tách checkbox thay vì tick toàn bộ.
- Ghi lệnh kiểm thử, số case pass/fail, giới hạn chưa verify và công việc kế tiếp; failure/blocker phải giữ trạng thái chưa xong.
- Thay API thì cập nhật contract/payload/hướng dẫn cùng thay đổi. Tích hợp Java/UI chỉ tick sau verification thực sự.
- Thay supported profiles hoặc phạm vi theo docs thì cập nhật checklist và tiêu chí tương ứng.
- Cập nhật bởi agent trong lúc triển khai; không tạo cron/background automation chỉ để tự tick README.
- Chỉ commit/push lên `feat/worker-standalone-analysis`, theo dạng feat:/fix:/docs:/test:; người dùng tự merge.

20/10/2026: thêm checklist tổng thể và quy tắc cập nhật. Thay đổi chỉ có README; không chạy lại tests cho chỉnh sửa tài liệu, verification gần nhất của code vẫn là 80/80 pass.

## 12. M2 tiếp theo — static compile-item profile v1

Hoàn thành 20/10/2026, analyzerVersion=`dotnet-syntax/1.2`, schemaVersion vẫn 1.0. Mục này thay mô tả ownership tạm thời của mục 9–10; các mục cũ giữ để theo dõi lịch sử.

- Profile mặc định chọn .cs trong cây thư mục project đã qua discovery, loại hidden directories và các thư mục bỏ qua. Không dựa vào nearest-project khi có nhiều project: file có thể thuộc nhiều profile, được parse một lần rồi tạo findings cho từng owner với project-specific IDs.
- Đọc literal EnableDefaultItems/EnableDefaultCompileItems trong PropertyGroup trực tiếp, không điều kiện; giá trị cuối theo từng property, hai cờ cùng quyết định defaults.
- Đọc Compile Include/Exclude/Remove trong ItemGroup trực tiếp, theo thứ tự khai báo. Hỗ trợ slash/backslash, danh sách dấu chấm phẩy, *, ?, ** và **/ khớp 0 hoặc nhiều thư mục.
- Shared source Include=../Shared/File.cs chỉ chọn từ các file đã discovery trong snapshot; không mở path ngoài source root. XML Link metadata không thay đổi evidence path gốc. Filesystem symlink/junction vẫn bị chặn, khác với linked compile item.
- Unsupported expressions, điều kiện, Choose/Target, Update và pattern ngoài profile trả UNSUPPORTED_COMPILE_ITEM. Không đánh giá hoặc chạy MSBuild để đoán kết quả.
- Project thiếu SDK được nhận diện hoặc XML lỗi dùng directory-candidate fallback có COMPILE_PROFILE_FALLBACK. PROJECT_ITEMS_UNEVALUATED vẫn luôn hiện vì imports/SDK targets/generated sources và build properties chưa được đánh giá.
- coverage.analyzedFiles đếm file vật lý đã phân tích, không nhân lên theo số project owners. Source bị loại khỏi mọi profile giữ UNOWNED_SOURCE và không tạo type/HTTP findings.

Supported profile này không phải kết quả compile-item hoàn chỉnh của MSBuild. Chưa resolve Directory.Build.props/targets, DefaultItemExcludes, target-framework conditions, property expansion, path expressions phức tạp hoặc semantic references. Solution membership chưa giới hạn tập project. M2 chưa hoàn tất và Java consumer chưa tích hợp.

Verification: `dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --verbosity minimal` đạt **87/87 pass**, build thành công. Bảy cases mới kiểm tra remove/reinclude order, include/exclude/globs/semicolon/default-off, shared linked source, cùng thư mục nhiều project, conditional/dynamic/target items, Choose/target properties và thứ tự literal default settings.

Checklist mục 11 đã cập nhật theo phạm vi được chứng minh. Tiếp theo: semantic binding/code dependencies và partial-symbol handling theo profile có giới hạn, sau đó appsettings và ASP.NET Core findings. Không thay Java hoặc runtime trong commit này.

## 13. Static profile 1.3, source-only jobs và versioned impact

Ngày 20/10/2026: hoàn thành và kiểm thử độc lập các phần dưới. Xem [contract v1 hiện hành](DOTNET_API_V1.md); tài liệu legacy vẫn là transitional. Mục này thay các mô tả “chưa có” tương ứng ở lịch sử trước.

- Semantic compilation dùng trusted platform assemblies của host và project references trong snapshot; không load target binaries, build/restore hoặc chạy source. Inherits/Implements và field/constructor CodeDependency chỉ xuất khi symbol resolve được, confidence=ResolvedSymbol. Missing-reference diagnostics chỉ trả diagnostic IDs, không lộ source/secret values.
- Gộp partial type declarations và namespace theo identity; giữ các vị trí khác trong additionalEvidence. Chưa khẳng định compile profile trùng target build. AnalyzerVersion=dotnet-static/1.3, schemaVersion=1.0, coverage.mode=PartialSyntax là nhãn tương thích thận trọng.
- Controller routes/HTTP verbs, Minimal API/nested route groups, Refit attributes, DI/DbContext/DbSet/save patterns, named/typed client registration và literal base-address hosts có findings dạng Candidate với confidence=Syntax. Đây là supported pattern detection, không phải mọi ASP.NET construct hoặc resolved runtime service calls. Nonconstant/unsupported routes trả warnings.
- HttpClient method resolve được qua semantic model với literal/constant absolute URL xuất OutgoingHttp confidence=ResolvedSymbol, chỉ giữ host/method. URL query, credentials, source snippets không đi vào result.
- appsettings*.json: ConfigurationKey và ConfiguredHttpHost, không trả values/connection strings. Evidence hiện bao trùm file config; JSON lỗi trả warning, environment/override merging chưa được thực hiện.
- POST /api/v1/dotnet/jobs, GET /api/v1/dotnet/jobs/{jobId}, POST /api/v1/dotnet/jobs/{jobId}/cancel: bounded queue/retention, identical-input idempotency, conflict detection, sanitized failures, actual cancellation/terminal races. Shared request validation với API trực tiếp. Progress hiện là lifecycle states, chưa có phần trăm hoặc per-file events. Jobs ephemeral; restart recovery/durable public state vẫn thuộc integration chưa hoàn thành.
- POST /api/v1/impact: nhận model/graph revisions, allowed typed service edges, source evidence IDs và optional runtime observations. Reuse engine reverse BFS cũ, không tạo bản traversal thứ hai. Reject mismatched/pending graph, kiểm tra nodes/edges, giữ paths/evidence, depth limits, cycle/empty-result warnings. Runtime input chỉ được đối chiếu fields do caller cung cấp; Java phải kiểm chứng artifact/session provenance trước khi gọi.

Verification full suite: `dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --verbosity minimal` **106/106 pass**, build thành công. Tests mới cover semantic/partial/project references, ASP.NET/config redaction, HTTP symbol/base-host extraction, job lifecycle/idempotency/capacity/cancellation race, impact versions/types/paths/evidence/depth/cycle/runtime filtering và HTTP jobs/impact endpoints.

Các checkbox M3 chưa tick toàn bộ vì hiện nhiều capability chỉ là syntax candidate. Chưa hoàn thành Java/UI integration, shared canonical IDs, restart recovery, internal authentication, full ASP.NET/semantic/config coverage hoặc Docker runtime acceptance. Người dùng đã chọn Docker Desktop Linux Engine trên máy này cho PoC; production isolation phải nghiệm thu riêng. Đang tiếp tục Runner/preflight và tracing theo các mốc sau.

## 14. Independent Worker và Runtime PoC — 20/10/2026

Hoàn thiện core độc lập trong các profile được mô tả ở đầu README, không tuyên bố hoàn tất toàn bộ checklist sản phẩm.

- Static 1.4 thêm known SDK implicit-usings profile, dynamic HttpClient destination warnings, input fingerprint/expected digest và internal-service authentication. Production legacy analysis tắt mặc định; health vẫn truy cập được.
- Runner là project riêng trong solution, thêm YamlDotNet 16.3.0 cho strict preflight. Không chạy Compose build trong session; chỉ nhận image digest/local content ID theo image-only profile.
- Tự sinh override, gắn Java/.NET instrumentation đã checksum, kiểm tra khai báo bundle versions, chạy HTTP scenario bằng container nội bộ. Docker inspect xác nhận sandbox limits/network trước scenario.
- Cùng lifecycle cho startup/request failure, timeout và cancel; giữ Collector đến khi apps flush, đọc active/rotated OTLP files, tách outcome/quality/mapping/persistence/cleanup, hỗ trợ operator recovery với exact generated project.
- PoC Windows Docker Desktop Linux Engine đã chạy hai dự án mẫu và các failure cases; script bootstrap/matrix cùng bằng chứng curated nằm trong samples/runtime-poc. Không commit images, agent binaries, publish/bin/obj hoặc raw trace artifacts.
- Test full suite Windows: 133 pass, 1 Linux-only skip; 68 profile tests trên Linux đều pass. Live Docker kiểm chứng success, failure với trace, startup fail, timeout, cancel, repeat, reverse-language project và cleanup sau host kill. Các thay đổi code sau mốc verification phải được kiểm tra lại trước commit.

Phần còn phụ thuộc nhóm: Java source/artifact delivery, canonical IDs/contracts, durable jobs/results, model publication, runtime API/Admin control/secret store, UI diagrams/evidence và production isolation/SRS acceptance. Phần ngoài static/runtime profiles hiện tại vẫn để unchecked; không tự mở rộng tuyên bố hỗ trợ.

Verification bổ sung ở mốc 14: Windows Worker API thật chặn junction (400), stress source deadline 1s trả 408 sau khoảng 1183ms. Linux SDK8 container đọc source readonly chạy 68 profile tests pass, gồm symlink file/root. Windows full suite 133 pass + 1 Linux-only skip. Đây là pilot verification, không thay SRS performance/accuracy acceptance.

## 15. N01 — .NET 10 foundation, 21/10/2026

Căn cứ mới: phân chia nhiệm vụ chi tiết.docx v2.0 trong .doc_review/main. Java giữ durable jobs/artifacts/persistence; .NET giữ analyzer, một impact engine và Runner. Main Java 7b22e63 đã được đối chiếu, chưa merge vào nhánh Worker.

- Sáu project Worker/Runner/tests target net10.0; Microsoft Extensions và MVC Test Host chuyển 10.0.0. Roslyn 4.10 giữ nguyên profile cú pháp hiện có, chưa tuyên bố hỗ trợ C# 14.
- global.json khóa SDK 10.0.204, rollForward disable. Directory.Build.props sinh packages.lock.json; CI bật ContinuousIntegrationBuild sẽ yêu cầu locked restore. Chủ động nâng phiên bản bằng restore --force-evaluate và review lock diff.
- Runner container dùng ASP.NET 10 image digest riêng; sample orders/catalog và OTel profile .NET 8 giữ phiên bản đã kiểm chứng. POC_EVIDENCE.json vẫn là bằng chứng cũ ngày 20/10, không đại diện Runner .NET 10.
- Semantic analysis vẫn dùng host runtime references (nay .NET 10), chỉ phát resolved symbols và warnings; chưa phải reference-pack binding theo TFM của source. Không coi kết quả này là build validation cho source net8/net10.
- Verification: Windows full suite 133 pass, 1 Linux-only skip. Artifact scope, canonical fixtures/enum mapping, durable dispatch và signed runtime envelope vẫn chưa hoàn thành.

Verification bổ sung N01: locked restore toàn solution đạt; publish Runner Release đạt; Docker image net10 khởi động và thực thi preflight thành công với network none/read-only/cap-drop ALL. Đây là Linux CLI smoke, chưa phải Linux full regression hay chạy lại runtime tracing PoC. Theo hướng dẫn Microsoft, SDK được pin chính xác khi dùng lock file: https://learn.microsoft.com/dotnet/core/tools/global-json .

## 16. N02 — HTTP host/port identity, 21/10/2026

- [x] Bảo toàn host và effective port ở config, literal HTTP syntax candidates, resolved HttpClient và BaseAddress. Port mặc định cũng hiện rõ (80/443), IPv6 có brackets. Không gộp localhost khác port; không xuất credentials/path/query/fragment.
- [x] Nâng analyzerVersion lên dotnet-static/1.5 và ghi migration contract trong DOTNET_API_V1.md; không thay canonical IDs của Java.
- [x] Regression CSharp: 46 pass, 1 Linux-only skip; thêm 8 trường hợp về ports/defaults/IPv6 và phân biệt hai dịch vụ localhost.
- [ ] N02 còn lại: thống nhất alias/config mapping với canonical model Java, kiểm chứng Linux và corpus đa project theo nghiệm thu chung.

## 17. N07 — bounded dependency paths, 21/10/2026

- [x] Thêm maxPaths (mặc định 1000, giới hạn 1..10000), ưu tiên distance rồi service ID; chỉ enrich các path trong budget, reuse BFS hiện có.
- [x] Truncated/MAX_PATHS_REACHED phản ánh output thiếu; depth limit độc lập. Giữ static graph và runtime-context semantics hiện có.
- [x] VersionedImpact regression: 12/12 pass, gồm cap boundary, validation, evidence và deterministic order khi đảo input.
- [ ] N07 tích hợp: Java adapter chuyển typed canonical relationships sang contract Worker, graph/model revision provenance và persistence; Java BFS cũ chưa được chuyển sang Worker.

## 18. N18 — Windows/Linux regression, 21/10/2026

- [x] API integration assertion theo profile 1.5 kiểm tra payments:443 và analyzerVersion; thay convention host-only cũ.
- [x] Windows SDK 10.0.204: 147 pass, 1 Linux-only skip, tổng 148 tests.
- [x] Linux SDK 10.0.402: locked restore đạt, full suite 148/148 pass, gồm file/root symlink scope. Snapshot nguồn 06f8e74 cộng bản sửa integration assertion, không mang local edits cũ ở Program/legacy controller/interface vào container.
- Image SDK digest: mcr.microsoft.com/dotnet/sdk@sha256:0d99ebf1ccad15037b5c98c9fe8979d6b8dbac23812feae2277a0b277b5c5ffa. Container read-only, cap-drop ALL/no-new-privileges, 2 CPU/3 GiB; build/cache chỉ trong tmpfs 2 GiB, source mount readonly.
- Registry không có tag SDK 10.0.204 tại thời điểm kiểm tra; chỉ bản copy global.json trong tmpfs đổi sang 10.0.402. Repository vẫn pin 10.0.204. Đây là compatibility evidence, chưa đạt reproducibility với cùng SDK Linux/Windows.
- [ ] N18 còn lại: benchmark cold/warm/memory, dependency audit và corpus/threshold nghiệm thu đã thống nhất; Linux regression không thay cho Java integration hoặc tracing PoC mới.

## 19. N01 — scoped internal Worker API, 21/10/2026

- [x] HTTP analyze/jobs nhận schemaVersion + artifactGrant; không bind raw SourceLocation và reject unknown fields. Grant HMAC-SHA256 ràng buộc audience, project/snapshot/job/attempt, artifact ID, expected analysis digest và absolute deadline; hỗ trợ key ID để rotation.
- [x] Artifact root do operator cấu hình, chỉ map ID hex dưới root; giữ symlink/junction guard, source budgets và read-only analysis. Java chịu trách nhiệm immutable snapshot delivery, ZIP/hash/manifest và cấp grant.
- [x] Queue tính cả thời gian chờ, deadline execution không refresh; TimedOut khác Cancelled. Idempotency/status/cancel theo jobId + attemptId; Java vẫn giữ durable jobs và publication.
- [x] Public liveness/readiness tách biệt; mọi v1 API cần service key; error envelope code/traceId nhất quán và không lộ exception/path/secret. Legacy API chỉ bật khi explicit opt-in, kể cả Development.
- [x] Dockerfile runtime digest .NET 10, non-root UID 1654; script Test-N01Image.ps1 xác minh filesystem/source readonly, auth, scoped analysis và provenance rồi cleanup container.
- [x] Java 21/Jackson fixture consumer PASS: grant HMAC, claim JSON, analysis input digest, result provenance/evidence và error envelope. Đây là compatibility probe, chưa phải platform Java client.

Hướng dẫn đầy đủ và giới hạn nghiệm thu: [N01.md](N01.md). N01 Worker code hoàn thành; không tick P06/P08 Done hay Java integration chỉ dựa vào standalone tests.

Verification N01 (snapshot index sạch, không gồm local edits cũ): Windows SDK 10.0.204 full suite 163 pass + 1 Linux-only skip; Linux SDK 10.0.402 compatibility full suite 164/164 pass, locked restore đạt. Java 21/Jackson consumer BUILD SUCCESS. Publish Release và image smoke đạt; image ID sha256:9153471c4aa55e4110f2ef797374fa504029e75033e920ff0d58a931e4468bd8. Container chạy UID 1654/read-only root/cap-drop ALL/512 MiB/1 CPU và artifact bind readonly; sau smoke không còn container N01. SDK Linux vẫn có giới hạn tái lập phiên bản như mục 18.

## 20. N02 — project/config discovery hoàn thiện profile độc lập

- [x] Project contexts có ID/path/root/name theo csproj, không nhận folder src thành service; default compile ownership chọn project gần nhất, explicit linked Include vẫn giữ profile cũ.
- [x] Config ở thư mục con dùng context gần nhất; aliases xuất ConfigurationHttpReference với host/effective port và trạng thái ConfigurationLiteral/Ambiguous. Không đoán precedence môi trường hay canonical service ID.
- [x] Missing/dynamic references là Unresolved, outside-snapshot là External, không mở file ngoài snapshot. Generated policy mặc định bỏ *.g.cs/*.g.i.cs/*.generated.cs và auto-generated banner; vẫn fingerprint nội dung, có thể tắt ExcludeGeneratedSources.
- [x] CSharp regression: 49 pass, 1 Linux-only skip. Analyzer profile 1.6; contract bổ sung projects/resolutionStatus. Chi tiết supported profile: STATIC_PROFILES.md.
- [ ] N02 nghiệm thu nhóm: Triết review alias conventions/canonical mapping và corpus chung. Project context là source identity, không phải service runtime đã xác nhận.

N02 full Windows regression: 166 pass + 1 Linux-only skip (167 tests). Golden result fixture được export qua analyzer và kiểm tra lại trên snapshot code độc lập. Docker build gặp lỗi cache parent snapshot của Engine; không dùng image cũ làm evidence N02. Fixture export chỉ ghi bản copy test output khi MAVIS_EXPORT_N01_FIXTURE=1, sau đó copy/review có chủ đích vào contracts.

## 21. N03 — structural/endpoint profile hoàn thiện

- [x] Class/interface/struct/record/enum/delegate/namespace và module project context; interface inheritance không bị gắn Implements.
- [x] Controller method Route + template-less verbs, named properties, absolute paths/tokens; NonAction/private/static/generic exclusion; Minimal literal groups/MapMethods và diagnostic cho unsupported patterns.
- [x] Source ranges/endpoint columns, snapshot + adapter version trong envelope; coverage skipped files/profiles. Không restore/build source đầu vào.
- [x] CSharp regression 53 pass + 1 Linux-only skip; fixture chuyển profile 1.7. STATIC_PROFILES.md công bố rõ phần hỗ trợ và phần bị bỏ qua có diagnostic.
- [ ] N03 nghiệm thu nhóm: Triết review endpoint identity/evidence trong canonical model, corpus chung/Java publication vẫn là integration.

N03 full Windows regression: 170 pass + 1 Linux-only skip (171 tests), golden fixture drift check đạt.

## 22. N04 — HttpClient/named-client resolver hoàn thiện profile

- [x] Outgoing HTTP cần resolved HttpClient receiver; loại fallback đoán bằng GetAsync/PostAsync từ syntax walker. Receiver chưa rõ có diagnostic, không thành HTTP relation.
- [x] Named/default/typed registrations, BaseAddress literal/config indexer, relative calls và inline HttpRequestMessage; registration/config evidence được giữ. CreateClient tên bất kỳ không thành service.
- [x] Ambiguous/conditional registration, reassignment và thiếu config giữ trạng thái không resolve; host/effective port dùng cùng alias N02.
- [x] Refit interface adapter có fixture namespace kiểm chứng; không tuyên bố resolve generated calls. RestSharp disabled + diagnostic. Profile limitations trong STATIC_PROFILES.md.
- [ ] N04 nghiệm thu nhóm: Triết nối alias endpoint vào canonical service mapping; runtime/Java merger không nằm trong outgoing resolver độc lập.

N04 verification: 8 outgoing/Refit resolver fixtures pass; full Windows suite 178 pass + 1 Linux-only skip (179 tests), golden response drift check đạt. Analyzer version 1.8.

N04 follow-up: conditional guard bên ngoài AddHttpClient (if/loop/switch) cũng giữ unresolved, không chỉ if trong lambda. 9/9 HTTP profile tests pass. Commit riêng trước khi chốt N05.
