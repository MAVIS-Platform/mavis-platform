# Development và verification runbook

Baseline đối chiếu: main c0121fe, 21/10/2026. Đây là hướng dẫn tái lập; lệnh chưa chạy trong lượt docs không được coi là kết quả mới. Xem [test evidence](IMPLEMENTATION_STATUS.md).

## 1. Chọn source và môi trường

- Java active reactor: `MAVIS-Platform/mavis-be/pom.xml`; Java 21, Maven, Spring Boot 3.3.0, PostgreSQL.
- Worker solution: `MAVIS.Worker/MAVIS.Worker.slnx`; .NET 10, SDK pin 10.0.204 trong Worker global.json, NuGet locks.
- Runner: `MAVIS.Worker/src/MAVIS.Runner/MAVIS.Runner.csproj`; CLI executable riêng.
- Docker Desktop Linux Engine được dùng cho local PoC và Java/Worker integration harness; production cần môi trường riêng.
- Kiểm tra `git status` trước build/publish. Không stage local edits/secrets/generated outputs của người khác; không dùng dirty legacy Program.cs làm release evidence.

Không cài/chạy một project C# cũ ngoài active solution chỉ vì tên tương tự. Không preload bin/obj/target/.artifacts hoặc source module không liên quan.

## 2. Java database và cấu hình

Flyway authority: `MAVIS-Platform/mavis-be/mavis-bootstrap/src/main/resources/db/migration/`.

- V1 init schema.
- V2 user OTP.
- V3 Worker evidence provenance.
- V4 model revision lineage.
- V5 explicit analysis request idempotency.
- V6 durable analysis attempt lifecycle.

Dùng database/schema test riêng, quyền DDL phù hợp và uuid-ossp theo migration. Hibernate production `ddl-auto=validate`; không dùng update để che thiếu migration. Không sửa migration đã apply; tạo V7+ khi có thay đổi mới.

`mavis-bootstrap/src/main/resources/application.yml` hiện là dev setup, có datasource/JWT/mail/provider placeholders/defaults và dev-bypass. Override bằng environment/config riêng cho môi trường; không copy secret/default key sang deployment hoặc docs.

Các biến Spring chuẩn có thể dùng: SPRING_DATASOURCE_URL, SPRING_DATASOURCE_USERNAME, SPRING_DATASOURCE_PASSWORD. Production cần `mavis.security.dev-bypass-enabled=false` và audit SecurityUtils fallback/method policy; chỉ tắt filter bypass chưa đủ.

Chạy bootstrap từ repository root sau khi cấu hình DB/migrations:

```powershell
cd MAVIS-Platform/mavis-be
mvn -pl mavis-bootstrap -am package -DskipTests
mvn -pl mavis-bootstrap spring-boot:run
```

Lệnh package trên bỏ test một cách tường minh để chuẩn bị dependencies, không phải verification. Nếu reactor dependencies chưa install/resolvable khi dùng goal spring-boot:run riêng, dùng `mvn install -DskipTests` tại reactor trước. Không gọi đó là test pass. Java API mặc định dev port 8080; không chạy Worker cùng cổng host.

## 3. Bật Java → Worker có chủ đích

Xem [integration example](../MAVIS-Platform/mavis-be/mavis-analyzer/src/main/resources/worker-integration-example.yml) và [runbook chi tiết](../MAVIS.Worker/INTEGRATION_RUNBOOK.md).

Java `mavis.worker` config: enabled, dotnet-url, service-key, grant-key-id, grant-key, snapshot-root, artifact-root. Integration example không tự được import chỉ vì có file trong repo; nạp qua Spring config của deployment. Disabled mặc định trong example; set đầy đủ trước bật.

Worker tương ứng dùng WorkerAccess__ApiKey, ArtifactScope__Root, ArtifactScope__GrantKeys__<keyId>. service-key và signing key là hai mục đích khác nhau. Java path tới archive/extraction và Worker mount path phải ánh xạ cùng snapshot bất biến; không lấy host absolute path của Java rồi kỳ vọng container/remote Worker tự đọc được.

HTTP body Worker v1 chỉ `{schemaVersion:"1.0",artifactGrant:"..."}`. Mọi `/api/v1` cần X-Mavis-Worker-Key. Direct raw SourceLocation thuộc contract cũ, không dùng. API reference: [DOTNET_API_V1](../MAVIS.Worker/DOTNET_API_V1.md), [N01](../MAVIS.Worker/N01.md).

Artifact ZIP raw SHA khác analysis inputDigest. InputDigest chuẩn hóa relative path theo ordinal và UTF-8 decoded text/BOM rules; shared Java client/fixtures là authority, không tự hash raw ZIP thay digest.

## 4. Workflow API cần giữ đúng

- `POST /api/v1/analyzer/upload` hoặc `/import/github`: import snapshot; chưa phân tích.
- `POST /api/v1/analyzer/snapshots/{id}/analyze`, header Idempotency-Key: tạo/nhận job; cùng key khác snapshot trả conflict.
- Job/history/cancel/attempts: xem controllers trong orchestrator và integration runbook; đọc analysisState/dotnetStatus/promotedLatest.
- `/models/{id}/diagrams`, `/diagrams/{id}/layout`, `/evidences/element/{id}`, `/evidences/relationship/{id}`: persisted model views; layout body là bounded coordinate-only nodes.
- `/projects/{id}/models`, `/models/{id}`, `/models/{base}/revisions`, `/models/compare`: explicit versions, owner/latest-base guard.
- `/models/{id}/impact`: versioned .NET impact output; `/impact` detailed Java DTO, `/impact/simple` node list; sessionId = modelVersionId.
- `/models/{id}/evaluate` và `/evaluations/...`: deterministic rule results.
- `/runtime/...`: Java session/trace APIs; không coi DB approve/stop là actual Dedicated Runner acknowledgement.
- Platform `/api/v1/submissions`, `/assignments/{id}/submissions`, `/projects/{id}/submissions`, `/submissions/{id}/feedbacks`, `/feedbacks/{id}` và `/api/v1/admin/...`: chặng 6, cần full policy testing.

Không đoán request DTO từ tên route; mở controller/DTO trực tiếp khi implement consumer. Chưa có public production OpenAPI snapshot được nghiệm thu thay cho source.

## 5. Worker test và publish

Trong Worker directory để SDK resolver dùng đúng global.json:

```powershell
cd MAVIS.Worker
dotnet --version
dotnet restore MAVIS.Worker.slnx --locked-mode
dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --no-restore --verbosity minimal
dotnet publish src/MAVIS.Worker.Api/MAVIS.Worker.Api.csproj -c Release --no-restore -p:UseAppHost=false -o .artifacts/worker-publish
```

Test Linux symlink bị skip trên Windows phải được verify trên Linux riêng. Linux SDK image đã dùng là 10.0.402 compatibility, chưa phải SDK 10.0.204 reproducibility. Không sửa global.json trong repo để che khác patch rồi báo cùng môi trường.

Image build từ repository root, sau clean publish:

```powershell
docker build -t mavis-worker:local -f MAVIS.Worker/Dockerfile MAVIS.Worker
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-N01Image.ps1 -Image mavis-worker:local -BenchmarkIterations 5
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-Dependencies.ps1
```

Image smoke kiểm readiness/scoped result/401/403/legacy-disabled và cleanup; benchmark chỉ tiny fixture wall time + một Docker memory sample. Advisory audit chỉ NuGet direct/transitive tại thời điểm query, không phải Maven/OS/agent audit.

## 6. Java–Worker–PostgreSQL integration

Từ repository root, cần .artifacts/worker-publish đã publish sạch và Docker Linux Engine:

```powershell
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-JavaWorkerIntegration.ps1 -Database
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-JavaWorkerIntegration.ps1 -Database -TestFilter '*Test,!RealFruitMicroservicesDetectionTest'
```

Lệnh đầu là selected integration suite của harness; lệnh thứ hai mở rộng client/common/analyzer unit + integration tests có thể tái lập, trừ dataset ngoài repo đã nêu. Harness copy source sang tmpfs/container, dùng isolated network/DB và finally cleanup resource do nó tạo. Shared scoped artifacts/Maven cache giữ trong ignored .artifacts. Không prune Docker toàn máy để sửa một test.

Harness target `mavis-analyzer -am`: không bao gồm toàn bộ platform/bootstrap chặng 6. Muốn kiểm stage 6 phải cấu hình PostgreSQL test riêng rồi chạy reactor/platform/bootstrap tests, ví dụ từ `mavis-be`:

```powershell
mvn -pl mavis-bootstrap -am test '-Dtest=*Test,!RealFruitMicroservicesDetectionTest' -Dsurefire.failIfNoSpecifiedTests=false
```

Lệnh này là hướng dẫn, chưa được chạy trong lượt cập nhật docs. Các @SpringBootTest dùng DB/config bootstrap; không chạy vào DB dùng chung có dữ liệu cần giữ. Worker live tests có thể cần env do harness cấp; xem điều kiện của từng test và không ghi skipped tests thành pass.

## 7. Runtime PoC

Từ repository root:

```powershell
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Initialize-Poc.ps1
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case Success
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case SecondProject
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case Failure
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case StartupFailure
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case Timeout
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case Cancel
```

Initialize build trusted samples/Runner, download SHA-verified agent artifacts, validate Collector, giữ reusable images/agent volume. Mỗi runtime session phải cleanup riêng containers/networks/volumes và trả cleanup status; reusable profile artifacts không phải resource leak của session. Samples .NET 8 không đổi chỉ vì executable Runner target .NET 10.

[RUNNER.md](../MAVIS.Worker/RUNNER.md) có CLI preflight/plan/scenario/run/correlate/recover. Recovery chỉ đúng generated resourceProject dưới operator state root; không dùng arbitrary project name/path. Receipt outbox không reconstruct outcome nếu process chết trước khi ghi, không là Java delivery acknowledgement. Cần operator-owned permissions/quota/retention.

## 8. Quy trình thay đổi và báo cáo

1. Xác định baseline/branch/current diff; giữ edits không liên quan.
2. Đọc đúng context/status/ticket và code scope; sửa minimal producer+consumer khi đổi contract.
3. Thêm migration mới nếu cần; update DTO/fixtures/profile warnings/runbook.
4. Chạy targeted test trước, broaden khi integration change cần; ghi failures/skips/dataset/environment thật.
5. Update IMPLEMENTATION_STATUS, NEXT_TASKS nếu scope thay đổi và subsystem docs. Không append “done” vào nhật ký mà bỏ checklist tổng thể cũ sai.
6. Commit conventional feat:/fix:/docs:/test: lên feature branch được người dùng chỉ định; không tự merge main. Fetch main để kiểm conflict trước PR.

Với thay đổi chỉ Markdown, kiểm link/path/coverage/version consistency là verification phù hợp; không cần chạy Docker/Maven/.NET lại và không giả báo test đã chạy mới.
