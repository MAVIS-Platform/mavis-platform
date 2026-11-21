# MAVIS — Bàn giao Worker/Runner cho phía Java

**Người gửi:** phía C#/.NET Worker — Huỳnh Anh Nhựt (SE180710).

**Người nhận:** phía Java Platform/Analyzer — Hoàng Vũ và Lê Minh Triết, cùng coding agent của hai bên.

**Ngày:** 21/10/2026. **Baseline đối chiếu:** main `fb3a703` (code baseline `c0121fe`, Java chặng 0–6 + Worker đã merge).

**Mục đích:** một tài liệu độc lập để hiểu phần Worker đã có, contract đang chạy, trách nhiệm Java và các dependency còn thiếu. Các mục “cần làm” là backlog tích hợp, không phải khẳng định Java chưa có bất kỳ code nào liên quan.

## 1. Kết luận bàn giao

**Static Java ↔ C# đã nối được và có kiểm thử thực. Dedicated Runtime Runner đã chạy độc lập trên Docker Desktop Linux; runtime Java ↔ Runner liên máy chưa hoàn thiện.**

Vì vậy phía Java không cần viết lại C# analyzer, Worker client hoặc impact BFS. Công việc tích hợp quan trọng tiếp theo là profile/scenario/version persistence, authenticated dispatch, durable receipt delivery/ack, runtime state reconciliation và mapping trace đúng model. Static còn các gate policy/corpus/retry/retention, không phải chờ xây analyzer từ đầu.

Không coi toàn hệ thống đã hoàn tất hoặc đạt production chỉ vì Worker tests hay PoC đã pass. Frontend mới chưa được xác nhận sẵn sàng; các task backend/Runner bên dưới có thể làm và test độc lập với FE.

## 2. Ranh giới của hai bên

### Java sở hữu

- Public API, người dùng/quyền, project/workspace/assignment/submission và admin.
- PostgreSQL/business entities, Flyway, SourceSnapshot, artifact storage và version references.
- Durable Job/attempt/orchestration, canonical model merge, atomic publication và latest-valid.
- Service ownership/alias mapping, persisted model IDs, diagrams/revisions/rules/impact API và evidence query.
- Runtime profile/config/scenario approval, quota/capacity và secrets policy cần hoàn thiện.
- Durable RuntimeSession/result/trace persistence, quyết định khi nào một phiên được công bố và artifact nào hợp lệ để nộp bài.

### Worker/Runner sở hữu

- C# discovery/Roslyn supported analysis profile; findings/evidence/coverage/warnings và input digest.
- Versioned .NET service impact engine. Java chuẩn bị graph và enrich output, không traverse lại.
- Executable Runner riêng: strict preflight, Compose override, instrumentation/readiness, HTTP scenario, OTLP capture, causal normalization, deadline/cancel/cleanup/recover và local receipt.

**Worker không kết nối business DB. Java không nên trực tiếp chạy arbitrary source hoặc giữ Docker socket trong business service.** Runner dùng Docker Engine trong môi trường operator kiểm soát; workload không được mount socket hoặc host directory tùy ý.

## 3. Những gì Worker đã triển khai

### 3.1 Static C# analysis — profile `dotnet-static/1.9`

- .NET 10, SDK pin 10.0.204, NuGet lock files; API nội bộ có service auth, signed artifact scope, attempt/deadline/digest, readiness và sanitized errors.
- Đọc .sln/.csproj/project references/selected compile items/.cs/appsettings theo profile source-only; không chạy MSBuild/targets/build scripts hoặc source ứng dụng.
- Namespace/type/interface/partial declarations và selected inheritance/interface/code dependency findings.
- Controller/Minimal API/route-group endpoint patterns trong phạm vi hỗ trợ.
- Selected HttpClient/factory/named/typed/config/Refit outgoing patterns; giữ host/port, unresolved/ambiguous khi thiếu căn cứ.
- Selected DI/DbContext/DbSet/query/save/data-access patterns; phân biệt code dependency, HTTP service call và database access.
- Evidence file/dòng và hashes/provenance; không gửi secret/config values hoặc source snippets qua findings contract.
- Bounded files/bytes/path/deadline, path/symlink scope validation và local cancellation.

**Giới hạn phải giữ khi Java hiển thị/merge:** không full MSBuild evaluation, full target framework/NuGet semantic resolution, toàn bộ Spring/ASP.NET/DI/EF semantics hoặc mọi dynamic configuration. `ResolvedSymbol` trong bounded compilation không chứng minh runtime interaction. Project/class/client name không mặc định là model service.

### 3.2 Change Impact

- Nhận typed graph đã chọn model/revision, reverse BFS đúng chiều dependent, shortest path mỗi dependent và edge/evidence references.
- Kiểm scope/version/readiness/target; depth/path limits và truncation/warnings rõ ràng.
- Có chain/cycle/diamond/parallel/isolated/depth/runtime-context regression.
- Runtime context không được dùng để xóa static edges chưa được scenario quan sát.

### 3.3 Dedicated Runtime Runner

- Executable riêng, hiện là local operator CLI; **chưa có authenticated remote Runner HTTP service để Java tự gọi**.
- Strict image-only Linux Compose profile; từ chối host mounts/socket/privileges/host networking/published workload ports theo profile.
- Temporary override tự gắn pinned OpenTelemetry .NET/Java agents và Collector; readiness/HTTP runner nằm trong internal network.
- Kiểm tra actual Docker CPU/RAM/PIDs/read-only/capability/no-new-privileges/network settings.
- Ordered HTTP requests, expected status, JSON bodies/variables/dependencies và protected header references qua memory/stdin.
- Trace correlation giữ trace/span/parent IDs, causal parent-child edges, mapping/quality warnings và redaction.
- Một lifecycle cho success/failure/timeout/cancel; cleanup kiểm tra containers/networks/volumes; recover chỉ đúng generated resource project.
- Receipt ghi file trước stdout tại `<state-root>/receipts/<resource-project>.json`, flush rồi atomic rename/no overwrite. Đây là local outbox, chưa phải platform delivery acknowledgement.

**Giới hạn:** Docker Desktop local PoC là shared-kernel container execution; chưa nghiệm thu dedicated production isolation, arbitrary source builds, platform secret store, stateful reset hoặc generic source↔image attestation.

## 4. Java đã tích hợp rồi — giữ lại, không dựng lại

Những phần này đã có trong baseline chung, dù một phần được làm trên nhánh Worker trước khi merge:

- Shared Java client core và Spring `DotnetWorkerClientServiceImpl` gọi scoped Worker API thật.
- Source import tạo snapshot riêng; explicit analyze dùng Idempotency-Key; dispatch AFTER_COMMIT.
- Bounded server-named artifact storage, ZIP hash validation/sealed extraction và shared artifact staging.
- `WorkerCanonicalImporter`, `WorkerModelPublisher`: validate provenance, map IDs/evidence, lock job/project, fence attempt/deadline, publish model/diagrams/job trong một transaction.
- Explicit service bindings và cross-language service edges Java→C# / C#→Java. Partial kết quả không tự promote latest.
- Diagram/evidence APIs, controlled revision/diff, Java detailed/simple/versioned impact APIs delegate cùng engine .NET.
- Durable static attempt ledger, cancel/history, pending-event redispatch/deadline reconciliation.
- Java runtime session/preflight/approve/stop/trace-ingest/sequence APIs và persistence; Java stage 6 submission/feedback/admin code cũng đã có.

**Điểm chưa nối:** Java runtime approve đổi DB sang RUNNING và sinh override chưa chứng minh Runner đã allocate/start. Java stop đổi DB chưa chứng minh Docker đã dừng/cleanup. Existing trace-ingest DTO chưa tự đồng nghĩa ingest trực tiếp Dedicated Runner receipt. Cần adapter và acknowledgement thật, không nối bằng cách đổi tên status.

## 5. Contract static đang dùng: Java gửi gì, Worker trả gì

### 5.1 Java chuẩn bị

1. Authorize người dùng với project/snapshot; lấy stored snapshot/job làm authority, không tin path từ event/client.
2. Lưu archive bất biến, kiểm raw artifact SHA và extract theo bounded policy.
3. Stage extracted input dưới artifact scope được Worker đọc; Worker mount read-only. Java host path và Worker path có thể khác nhưng phải trỏ cùng immutable input. Đường tích hợp đã kiểm chứng dùng shared filesystem/mount; chưa có arbitrary remote artifact download protocol. Chỉ đổi URL sang Worker khác host không làm artifact tự xuất hiện trên host đó.
4. Tính analysis inputDigest đúng shared fingerprint implementation và tạo signed grant.
5. Gọi Worker ngoài DB publication transaction; validate response rồi mới publish trong transaction.

Hai giá trị khác nhau:

- **SourceSnapshot artifactHash:** SHA của raw ZIP archive.
- **expectedInputDigest/inputDigest:** fingerprint supported analysis inputs. Không dùng ZIP SHA thay input digest. Canonical implementation là `InputFingerprint.java` và C# counterpart/fixtures; includes normalized relative paths, decoded text/BOM/line-ending rules.

### 5.2 HTTP request

```http
POST /api/v1/dotnet/analyze
Content-Type: application/json
X-Mavis-Worker-Key: <service-key>
```

```json
{
  "schemaVersion": "1.0",
  "artifactGrant": "<keyId>.<payload-base64url>.<signature-base64url>"
}
```

Grant claims có schemaVersion, audience, projectId, sourceSnapshotId, jobId, attemptId, artifactId, expectedInputDigest và deadlineUtc. artifactId là opaque 64-hex ID, không phải đường dẫn và không tự khẳng định là ZIP hash. Dùng shared signer/fixtures; không tự đoán audience hoặc cách serialize/sign.

HTTP DTO reject unknown fields, gồm sourceLocation/extractedSourcePath. Internal analyzer local-path request không phải public/internal HTTP transport contract. Service API key và grant signing key là hai mục đích khác nhau.

### 5.3 Response

Shared Java `WorkerContract.Result` có:

```text
schemaVersion, projectId, sourceSnapshotId, jobId, attemptId,
analyzerVersion, inputDigest,
projects[], findings[], coverage, warnings[], canonical
```

- Finding: kind/projectPath/target/httpMethod, evidence, optional subject/id/additionalEvidence/confidence/resolutionStatus/properties/origin/evidenceIds.
- Location: snapshot-relative filePath, startLine/endLine, optional columns; line numbering 1-based.
- Warning là object có code/message/filePath, không phải string[] tự chế.
- Canonical bundle có schemaVersion, requiresCanonicalMerge, elements/relationships/evidence. Đây là transport findings bundle, không phải JPA model đã publish.
- Worker logical IDs/hashes và evidence associations phải được giữ trong properties/provenance khi chuyển sang Java UUIDs.

Java phải xác minh IDs/snapshot/attempt/inputDigest/deadline, limits và các reference trong result. Worker timeout/auth/malformed response không được biến thành successful empty C# model. Không có .NET input là NOT_APPLICABLE; có C# mà Worker chưa cấu hình không phải phân tích C# thành công.

### 5.4 Configuration, readiness và error handling

Java Spring adapter đang đọc các property sau, disabled mặc định cho static integration:

```text
mavis.worker.enabled
mavis.worker.dotnet-url
mavis.worker.service-key
mavis.worker.grant-key-id
mavis.worker.grant-key
mavis.worker.snapshot-root
mavis.worker.artifact-root
```

Worker cần cấu hình tương ứng, ví dụ environment variable names:

```text
WorkerAccess__ApiKey
ArtifactScope__Root
ArtifactScope__GrantKeys__<keyId>
```

- Java service-key phải khớp Worker API key; grant-key-id và signing key phải khớp grant key của Worker. Không dùng API key thay signing key.
- Grant issuer thật là `ArtifactGrantIssuer.java`: audience `mavis-worker-analysis`, HMAC-SHA256 trên ASCII `keyId + "." + payload-base64url`, signature/payload base64url không padding; secret UTF-8 tối thiểu 32 bytes ở issuer hiện tại.
- Issuer hiện chỉ phát grant có remaining lifetime >0 và <=300 giây. Worker còn có limit cấu hình riêng; thay một phía không tự nới phía kia. Đồng bộ clock; deadline trong fixture lịch sử không được copy nguyên để gọi live.
- Java snapshot-root và artifact-root phải hợp scope và không overlap trái policy; Java ghi/stage ở artifact-root, Worker đọc cùng storage qua ArtifactScope__Root read-only. Remote-host storage delivery là phần deployment cần chốt, không phải tính năng HTTP source download hiện có.
- `GET /api/health/ready` trả 200 khi local service key/grant keys/root/lifetime config usable; nếu chưa sẵn sàng trả 503. Ready không chứng minh Java DB/network/host khác đã nối được.
- Legacy `/api/analysis` và `/api/jobs` tắt mặc định. Không bật legacy để né lỗi v1 hoặc migrate consumer sang raw SourceLocation.

Versioned error contract là application/problem+json với type/title/status/code/traceId. Consumer không parse text exception, không log grant/key/source paths và không coi lỗi là successful empty result:

- 400 INVALID_REQUEST; 401 SERVICE_AUTH_REQUIRED; 403 ARTIFACT_SCOPE_DENIED.
- 404 NOT_FOUND; 408 DEADLINE_EXCEEDED; 409 ATTEMPT_CONFLICT.
- 429 CAPACITY_EXHAUSTED; 503 WORKER_NOT_READY; 500 WORKER_FAILURE.

Các code trên là Worker API error envelope. Shared Java adapter còn có Outcome.code riêng như WORKER_HTTP_403/WORKER_UNAVAILABLE/TRANSPORT_TIMEOUT/INVALID_RESULT_OR_SCOPE; không mặc định chúng là cùng một vocabulary với Worker error code.

### 5.5 Timeout/response limits và publication outcomes hiện hành

Các giá trị dưới đây được đọc từ code hiện tại, không phải SRS throughput/latency targets:

- Java static orchestrator hiện tạo attempt deadline khoảng 120 giây kể từ begin.
- `ScopedWorkerClient` hiện giới hạn một synchronous HTTP call tối đa 30 giây; connection timeout 5 giây, response body mặc định tối đa 8 MiB. Vì vậy grant/attempt còn 120 giây không bảo đảm client chờ analyzer 120 giây. Nếu corpus cần dài hơn, hai bên phải review bounded transport/profile hoặc async workflow và test lại; không chỉ tăng grant TTL.
- Worker execution còn bị chặn bởi remaining absolute deadline và DotnetAnalysis timeout; queue time cũng nằm trong absolute deadline. Timeout/cancel/failure không được publish thành model complete.
- Java-only + không có C# có thể có NOT_APPLICABLE và publish kết quả Java. Pure C# mà Worker không complete thì fail, không publish model rỗng thành công.
- Mixed input có Java thành công nhưng C# không complete có thể giữ model draft PARTIAL, promotedLatest=false. Raw Job.status vẫn có thể là COMPLETED vì pipeline đã xử lý xong; phải đọc DTO analysisState/dotnetStatus/modelVersionId/promotedLatest và manifest completeness.
- ADAPTERS_COMPLETED/promoted latest không có nghĩa mọi service mapping đã VALIDATED. Manifest giữ canonicalMapping=REQUIRES_REVIEW và kết quả có thể là COMPLETED_WITH_REVIEW.
- Không dựa duy nhất HTTP 200, raw COMPLETED hoặc latest flag để khẳng định analysis đầy đủ/chính xác. Fixtures/tests phải kiểm cả provenance, warnings, partial và promotion outcome.

### 5.6 Async jobs và durable ownership

Worker còn có `POST /api/v1/dotnet/jobs`, poll/cancel theo jobId + attemptId. Queue/records này **ephemeral**, không restart-safe. Java static orchestrator hiện đã có đường gọi synchronous analyze; không cần chuyển sang async chỉ vì endpoint tồn tại.

Java giữ durable attempts/publication; Worker execution status không thay Java model outcome. CANCELLING khác CANCELLED; deadline/cancel request không chứng minh external cleanup nếu chưa có acknowledgement.

## 6. Service mapping và impact: Java cần giữ những gì

### 6.1 Explicit service ownership

Snapshot có thể cung cấp `mavis.bindings.json`, ví dụ:

```json
{
  "schemaVersion": "1.0",
  "bindings": [
    {
      "service": "java-gateway",
      "projects": [],
      "sourceRoots": ["services/gateway/src"],
      "endpoints": ["http://java-gateway:8080", "http://localhost:5001"]
    },
    {
      "service": "dotnet-orders",
      "projects": ["services/orders/Orders.csproj"],
      "sourceRoots": [],
      "endpoints": ["http://dotnet-orders:8080", "http://localhost:5002"]
    }
  ]
}
```

Service names phải map vào service nodes đã tồn tại, ownership và alias phải unambiguous. Missing/duplicate/multiple owners giữ unresolved/ambiguous. Giữ host và effective port; localhost:5001 không tự bằng localhost:5002. Hash binding artifact là provenance riêng với analysis digest.

Automatic Compose/config mapping rộng hơn có thể mở rộng nhưng cần fixtures/ground truth review. Không gọi naming heuristic là resolved evidence, không tạo service giả từ src/project/class/client names.

### 6.2 Impact request/response

`POST /api/v1/impact`, cùng Worker service authentication.

```text
Request:
modelVersionId, graphModelVersionId, graphRevisionId, graphReady,
targetServiceId, serviceIds[],
edges[{id, from, to, kind, evidenceIds[]}], maxDepth, maxPaths, runtime[]

Response:
modelVersionId, graphRevisionId, targetServiceId,
affectedServices[{serviceId, classification, distance, hops[], edgeIds[], evidenceIds[]}],
truncated, warnings[], runtimeContext[]
```

Graph edge A→B nghĩa A phụ thuộc/gọi B; khi B đổi thì A có thể bị ảnh hưởng. Path trả từ dependent đến selected target. Java loader hiện chọn SERVICE_CONTAINER nodes và confirmed/config-bound SERVICE_HTTP_CALL edges, không chuyển containment/CODE_DEPENDENCY/DATABASE_ACCESS tùy ý thành impact HTTP edges.

Java đã có `ImpactGraphLoader`, `WorkerImpactService`, `ImpactWorkerClient` và versioned/detailed/simple APIs. **Không thêm Java BFS fallback.** Worker unavailable phải có failure rõ, không trả successful empty set. Java adapter hiện chưa tích hợp runtime context; không tự gửi telemetry chưa xác nhận mapping vào request.

## 7. Runtime contract hiện có và khoảng cách cần Java nối

### 7.1 Input Runner đã nhận được

`RuntimeRunDefinition` gồm:

```text
sessionId, modelVersionId, sourceSnapshotId,
profileVersionId, runConfigurationVersionId, scenarioVersionId,
composeYaml, profile, scenario, confirmedServiceMappings
```

Các version references trên cần có nghĩa và được verify; dù vài trường nullable trong C# transport record, local execution validator vẫn yêu cầu provenance cần thiết.

`RunnerExecutionProfile` hiện có collectorImage, instrumentationVolume, applications[runtime/containerPort/readinessPath], memoryMiB, cpus, timeoutSeconds, approvedForLocalPoc, scenarioRunnerImage và instrumentation versions. Image/content/volume/profile phải thuộc operator-approved inputs; flag ApprovedForLocalPoc không phải production approval model.

CLI local hiện hành:

```text
MAVIS.Runner preflight <compose.yml>
MAVIS.Runner plan <session.json> <collector.yaml>
MAVIS.Runner run <session.json> <collector.yaml> <state-root>
MAVIS.Runner recover <state-root> <generated-resource-project>
```

Không gọi một HTTP URL Runner chưa được implement. Cần chốt gateway/transport/deployment với phía .NET trước khi Java viết dispatcher consumer.

### 7.2 Receipt trả được

```text
sessionId, modelVersionId, sourceSnapshotId,
profileVersionId, runConfigurationVersionId, scenarioVersionId,
resourceProject, actualImageIds, declaredInstrumentationVersions,
sandboxEnforcementConfirmed, outcome,
imageSourceCorrespondence, profileAcceptance
```

`outcome` tách executionStatus, scenarioStatus, evidenceStatus, cleanupStatus, scenario, trace, diagnostics, traceQuality, mappingStatus, persistenceStatus.

- Completed execution có thể đi với Failed scenario và Available trace.
- Mapped service names không chứng minh image thuộc source snapshot; imageSourceCorrespondence/profileAcceptance còn Unverified trong generic local profile.
- Cleanup Confirmed chỉ khi Docker kiểm tra không còn session containers/networks/volumes; đây khác việc Java gọi stop thành công.
- persistenceStatus vẫn CallerOwned: local receipt file không có nghĩa Java đã lưu bền vững.
- Nếu allocator chết trước lúc ghi receipt, outbox không tự reconstruct in-memory result. recover thu hồi resource, không giả khôi phục evidence chưa flush.

### 7.3 Runtime service mapping

Java cần cung cấp mapping runtime service → canonical service ID đúng model/source/version; Worker/Runner không tự suy persisted UUID từ display name. Trace/span/parent IDs và quality warnings phải được giữ khi ingest; sequence dựa saved evidence. Không ghép parent-child khác trace hoặc dùng timestamp-only để suy dependency.

### 7.4 Khác biệt DTO Java–Runner đã xác nhận từ code

Đây là gap cần xử lý trong WJ-01/WJ-04, không phải chỉ đổi URL:

- Java `RuntimeSessionCreateRequest` hiện gồm projectId, sourceSnapshotId, triggeredById, profileName, scenarioName, scenarioConfig. Nó chưa phải RuntimeRunDefinition có explicit modelVersionId/profileVersionId/runConfigurationVersionId/scenarioVersionId. Cần versioned persistence/lookup/validation, không tự nhét opaque IDs vào tên profile.
- Java `RuntimeTraceIngestRequestDTO` hiện nhận scenarioOutcome (default PASSED) và spans[]. Runner receipt lại có outcome với nhiều trạng thái riêng và outcome.trace chứa correlated spans/causalEdges/interactions/warnings. Không POST cả receipt vào DTO này rồi cho rằng đủ dữ liệu.
- Java OtelSpanDTO có serviceName, operationName/httpMethod/httpUrl, durationMs và attributes; Runner CorrelatedSpan có runtimeService, modelServiceId, kind, scenarioStepId, startTimeUnixNano/durationNanoseconds (string), spanStatus/httpStatusCode.
- Adapter phải map runtimeService→serviceName và preserve confirmed modelServiceId theo persistence contract; thời lượng cần xử lý đơn vị/overflow/rounding có kiểm thử. Không giả định durationNanoseconds là durationMs hoặc start time string là Java Long luôn hợp lệ.
- Runner đã bỏ operation names/raw URLs/attributes/events nhạy cảm trong redacted projection. Java không được điền giả hoặc yêu cầu phục hồi bí mật vào DTO để đủ field; cần DTO/persistence chấp nhận thông tin không có.
- Runner scenarioStatus Passed/Failed/NotRun phải map có chủ đích. Không để default PASSED của Java biến một phiên startup failure/timeout/NotRun thành scenario pass. Execution/trace quality/mapping/cleanup vẫn phải lưu riêng; một scenarioOutcome không diễn đạt hết receipt.
- Causal edges và observed service interactions đã có trong receipt. Nếu Java tự tái chiếu, phải giữ cùng trace/parent-child semantics và missing-parent/unmapped warnings; không đánh rơi quality khi chuyển DTO hoặc tự ghép theo timestamp.

Giữ Java ingest API cũ nếu đang có consumer, nhưng cần adapter/versioned contract rõ và test producer/consumer thực trước khi nói runtime tích hợp xong.

## 8. Những việc Worker còn cần Java làm/phối hợp

Các ID WJ dưới đây chỉ dùng cho bàn giao này, không thay thế mã V/T/N trong phân công.

### WJ-01 — Chốt runtime profile/config/scenario persistence và contract

**Owner:** Vũ (V14/V15) + Nhựt (N15); Triết review mapping (T13).

- Java cần làm: lưu và version profile/run-configuration/scenario, approval authority, selected model/source, approved image/agent/resource policy và secret references.
- Worker cung cấp: RuntimeRunDefinition/Profile/Scenario/receipt types, supported profile validators và PoC payload.
- Cần chốt chung: transport schema version, authority từng field, status vocabulary, deadline/attempt semantics và callback/result acknowledgement. Không tự đặt DTO Java khác rồi yêu cầu Worker đoán.
- Output: shared fixtures + request/result schema + DB migrations nếu cần + mapping document.
- Done: unapproved/stale/cross-project/wrong version/invalid mapping bị chặn trước allocate; raw secrets không có trong request logs/receipt/arguments.

**Worker có thể tiếp tục:** harden adapters/tests theo contract. **Đang chờ phối hợp:** authoritative Java versions/approval/persistence và quyết định deployment/transport, không phải chờ C# analyzer.

### WJ-02 — Dispatch Runner thật, nhận receipt bền vững và ack

**Owner:** Vũ platform, Nhựt runner/gateway adapter; phụ thuộc WJ-01.

- Java cần làm: durable dispatch/outbox, authenticated worker identity, session/attempt idempotency, receipt validation/persistence/deduplication và acknowledgement/retry.
- .NET cần phối hợp làm: remote trusted entry point theo transport đã chọn; delivery adapter từ local receipt outbox. Phần gateway liên máy này **chưa phải chức năng đã có sẵn**.
- Reuse: local Runner execution/lifecycle/receipt đã có; không viết lại execution trong Java hoặc mount Docker socket vào business container.
- Done: Java chỉ chuyển actual running/completed từ acknowledgement/receipt đáng tin; network restart/resend không làm mất hoặc double-save kết quả; receipt sai session/model/source/version bị reject.

**Worker đang cần Java:** consumer/persistence/ack và dispatch contract thống nhất để biến local PoC thành platform workflow.

### WJ-03 — Capacity, stop acknowledgement, heartbeat và janitor

**Owner:** Vũ + Nhựt, phụ thuộc WJ-02.

- Java cần làm: platform capacity/quota lease, durable cancel request/status reconciliation, timeout/dead-runner detection và operator recovery visibility.
- Worker đã có: local lease/cancel marker, bounded execution/teardown, scoped recover và cleanup receipt.
- Cần bổ sung chung: heartbeat/lease semantics và automated reconciliation; không coi static analysis attempt ledger là runtime lease service đã xong.
- Done: stop requested khác stop confirmed; mất allocator/cleanup failure giữ recovery-required outcome; janitor chỉ xóa resource của session có authority, không prune shared Docker/store.

**Worker đang cần Java:** durable lifecycle/control authority và policy capacity; phía .NET phải nối local acknowledgement vào authority đó.

### WJ-04 — Ingest trace/receipt đúng model và đưa vào saved views

**Owner:** Triết (T13/T16) + Vũ persistence; Nhựt (N12/N13) cung cấp normalized receipt.

- Java cần làm: adapter từ Dedicated Runner receipt sang Java trace/evidence persistence, verify version/mapping, idempotent ingest và query theo selected model/session.
- Reuse: existing Java ingest/sequence service và Runner causal correlator. Không chỉ assume hai DTO tự tương thích.
- Done: giữ trace/span/parent/evidence IDs và redaction/quality flags; wrong mapping/partial evidence không thành validated complete data; sequence/impact runtime context dựa đúng saved evidence; không xóa static edges chưa observed.

**Worker đang cần Java:** DB links, canonical mapping, saved artifact IDs và acceptance fixtures của phía consumer.

### WJ-05 — Static policy, restart/retry và retention còn thiếu

**Owner:** Vũ (V04/V08/V17); Nhựt review grant/attempt semantics.

- Java đã có: scoped calls, durable attempt ledger, cancellation/deadline reconciliation và atomic publication.
- Java còn cần: production auth/owner/member/lecturer/admin policy; renewable distributed lease/automatic bounded retry; artifact quota/retention dựa references của model/submission.
- Worker queue là ephemeral; không chuyển trách nhiệm durable history/retry authority vào .NET in-memory jobs.
- Done: wrong-user/cross-project requests bị chặn; duplicate dispatch/late reply/restart không double-promote; retention không xóa snapshot/evidence đang được version/bài nộp tham chiếu.

**Không phải block cho local analysis:** Worker vẫn chạy supported static profile. **Là gate cho vận hành hệ thống:** Java phải giữ authority/quyền/lifecycle bền vững.

### WJ-06 — Review canonical service mappings và corpus

**Owner:** Triết (T01/T07/T17), Nhựt N02–N05/N18; Vũ artifact pipeline.

- Java/nhóm cần: thống nhất canonical enum/identity/ownership rules, fixtures expected graph/evidence và ngưỡng nghiệm thu được duyệt.
- Worker cung cấp: findings/raw IDs/warnings/hashes, supported static profile, tests và explicit binding examples.
- Done: Java-only/C#-only/mixed, duplicate names/ports, dynamic/unresolved/ambiguous cases được review; không báo resolved dựa naming heuristic; Java transport giữ evidence hashes/provenance.
- External fruit-market-microservices.zip hiện thiếu trong repo: cần đưa fixture được phép chia sẻ vào bộ test hoặc thay bằng corpus reproducible có chủ đích, không hardcode đường dẫn riêng máy.

**Worker đang cần Java/nhóm:** ground truth/service semantics, không cần một C# parser thứ hai.

### WJ-07 — Dedicated environment, secret store và business scenarios

**Owner:** Vũ DevOps/V13/V16 + Nhựt N08/N16/N17; review nhóm.

- Java/nhóm cần cung cấp: execution host/VM tách biệt, approved profiles, secret lifecycle/reference resolution, capacity policy và authenticated/stateful scenario/reset expectations.
- Worker đã có: Linux image-only local PoC, bounded scenario engine, instrumentation, redaction và failure/cleanup matrix.
- Done: chạy lại success/HTTP/startup/timeout/cancel/allocator death/delivery failure/cleanup failure trên môi trường mục tiêu; giữ actual image/agent/provenance và cleanup evidence; source-image correspondence được chốt theo pipeline.

**Worker có thể tiếp tục:** local test/failure hardening. **Đang chờ môi trường/policy để nghiệm thu:** dedicated production isolation, credentials/reset và source-image acceptance.

### WJ-08 — Submission runtime requirements và system acceptance

**Owner:** Vũ (V11/V17), Triết model/evidence, Nhựt review Runner outcomes.

- Java stage 6 đã có submission/feedback/admin code; chưa chạy lại toàn bộ platform/bootstrap trong bộ Worker regression đã báo.
- Java cần verify: bài tập yêu cầu runtime thì pin đúng source/model/session/profile/scenario và required outcome; không chỉ kiểm runtime cùng project hoặc fallback latest source khi source của selected model thiếu.
- Done: submission giữ artifact immutable; cập nhật latest model/runtime không đổi bài cũ; feedback anchor cùng model đã nộp; tests cả foreign IDs/missing/unaccepted runtime/permission/deadline.

**Worker cung cấp:** versioned receipt và quality/status distinctions. **Java quyết định theo business rule:** trace/outcome nào được chấp nhận để nộp bài, không gán quyết định đó cho Runner.

## 9. Thứ tự triển khai đề nghị cho agent Java

1. Đọc existing code; giữ phần static đã tích hợp và kiểm baseline test chặng 6, quyền/version requirements.
2. WJ-01: chốt runtime versions/authority/shared contract với phía .NET.
3. WJ-02: triển khai dispatch/receipt persistence/ack cùng gateway adapter; test bằng fake transport trước, rồi Runner thật.
4. WJ-03 và WJ-04: remote stop/recovery/capacity và trace mapping/persistence.
5. WJ-05/WJ-06 làm song song trong phạm vi không đổi contract thiếu review: static resilience, policy và approved corpus.
6. WJ-07/WJ-08: dedicated host/business scenarios/submission acceptance; FE nghiệm thu sau khi baseline frontend sẵn sàng.

Trước khi code consumer runtime, gửi lại: contract được chọn, Java DTO/migration dự kiến, authority IDs, status transitions và sample request/result. Không cần gửi secrets. Nếu đổi producer field/enum/hash/schema, update fixture và consumer tests cùng task.

## 10. Source map cho agent mở đúng chỗ

Các đường dẫn dưới đây tương đối từ repository root, có trong baseline chung:

- Shared transport: `MAVIS.Worker/integration/java-client/src/main/java/com/mavis/workerclient/WorkerContract.java`, `InputFingerprint.java`, `ArtifactGrantIssuer.java`, `ScopedWorkerClient.java`, `ResultValidator.java`, `ImpactWorkerClient.java`.
- Signed scope: `MAVIS.Worker/src/MAVIS.Worker.Application/Analysis/ScopedDotnetRequest.cs`; grant format/fixtures trong `MAVIS.Worker/N01.md`, `MAVIS.Worker/contracts/n01/`.
- Roslyn implementation: `MAVIS.Worker/src/MAVIS.Worker.Infrastructure/CSharp/DotnetProjectAnalyzer.cs`; supported semantics ở `MAVIS.Worker/STATIC_PROFILES.md`.
- .NET impact: `MAVIS.Worker/src/MAVIS.Worker.Application/Impact/VersionedImpactContracts.cs`, `MAVIS.Worker/src/MAVIS.Worker.Infrastructure/Impact/VersionedImpactAnalyzer.cs`.
- Runner input/profile: `MAVIS.Worker/src/MAVIS.Runner/DockerComposeSession.cs`, `ComposeOverrideBuilder.cs`, `HttpScenarioRunner.cs`.
- Runner execution/result: cùng thư mục `RunnerProgram.cs`, `RuntimeSessionLifecycle.cs`, `RuntimeReceiptStore.cs`, `SessionRecovery.cs`, `TraceCorrelator.cs`.
- Java Spring adapters/publication: `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/workerclient/service/impl/` — DotnetWorkerClientServiceImpl, WorkerCanonicalImporter, WorkerModelPublisher, ServiceBindingIndex, CrossLanguageServiceLinker.
- Java orchestration: cùng analyzer base package `orchestrator/`; impact loader/adapter trong `impact/`.
- Java runtime: analyzer base package `runtime/`; session controller/service, trace ingest/correlation và sequence projection.
- Java educational data/policy: `MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/submission/`, `workspace/`, `assignment/`, `security/`, `admin/`.
- DB authority: `MAVIS-Platform/mavis-be/mavis-bootstrap/src/main/resources/db/migration/`, V1–V6 hiện hành. Tạo migration mới khi cần, không sửa migration đã apply.

Supplemental docs trong repo: `docs/mavis-context.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/NEXT_TASKS.md`, `MAVIS.Worker/INTEGRATION_RUNBOOK.md`, `MAVIS.Worker/RUNNER.md`. Nội dung bàn giao cốt lõi đã nằm trong file này để có thể gửi nguyên file cho agent Java.

## 11. Bằng chứng kiểm thử và cách tái lập

**Đã chạy trước thời điểm bàn giao:**

- Java client/common/analyzer expanded regression 140/140 pass, gồm real Worker/PostgreSQL và Java runtime/evaluation tests. Final compatibility checks diagram/model/API 23/23 pass; không cộng chúng như 23 case mới.
- Loại công khai một external dataset test RealFruitMicroservicesDetectionTest do thiếu fruit-market-microservices.zip; chưa tuyên bố unfiltered full Maven suite pass.
- Worker Windows 189 pass + 1 Linux-only skip / 190 total sau receipt outbox. Linux compatibility trước receipt 187/187 trên SDK 10.0.402; repo pin 10.0.204. Không coi là cùng-patch/full latest Linux verification.
- Runner .NET 10: .NET→Java, Java→.NET, HTTP failure, startup failure, timeout, cancel và abandoned allocator recovery pass, cleanup Confirmed. Receipt smoke xác nhận file saved khớp stdout. Evidence committed trong `MAVIS.Worker/samples/runtime-poc/POC_EVIDENCE.json` (net10RunnerRegression) và Worker README.
- Production JWT/RBAC, dedicated-host isolation, credentials/stateful workflows, toàn bộ stage 6 platform/bootstrap và FE/browser acceptance chưa được chứng nhận bởi các kết quả trên.

**Lệnh từ repo root, cần clean Worker publish và Docker Linux Engine:**

```powershell
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-JavaWorkerIntegration.ps1 -Database
pwsh -NoProfile -File MAVIS.Worker/scripts/Test-JavaWorkerIntegration.ps1 -Database -TestFilter '*Test,!RealFruitMicroservicesDetectionTest'
```

Harness target analyzer và dependencies, không bao gồm toàn bộ platform/bootstrap. Muốn test chặng 6 cần DB test/config riêng và chạy đúng modules; không chạy destructive setup vào DB dùng chung.

**Runtime PoC:**

```powershell
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Initialize-Poc.ps1
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case Success
pwsh -NoProfile -File MAVIS.Worker/samples/runtime-poc/Invoke-Poc.ps1 -Case SecondProject
```

Các case còn lại: Failure, StartupFailure, Timeout, Cancel. Read `RUNNER.md` trước khi run/recover. Generated local results/cache không thay committed acceptance evidence. Không chạy lệnh từ tài liệu một cách máy móc nếu environment/config chưa đúng.

## 12. Những quy tắc hai agent phải cùng giữ

- Không viết lại chức năng đã có chỉ vì nhìn một tài liệu cũ nói “chưa triển khai”. Đối chiếu baseline/source/tests trước.
- Không dùng legacy raw-path `/internal/v1/dotnet/analyze` contract; scoped API thật là `/api/v1/dotnet/analyze`.
- Không gọi Worker từ GraphBuilder lần hai; publication pipeline hiện hành đã gọi/validate/import kết quả.
- Không tạo Java impact BFS fallback. Rule cycle DFS là nghiệp vụ rule khác, không bị cấm vì impact dùng .NET.
- Không biến candidate/resolved-source finding thành observed runtime evidence hoặc validated service mapping khi thiếu căn cứ.
- Không báo actual runtime RUNNING/STOPPED/CLEANED chỉ từ DB update hoặc accepted HTTP request.
- Không coi receipt local là Java persisted result; cần durable ingest/ack.
- Giữ explicit model/source/session/version/provenance và immutable submissions. Không tự chọn latest thay selected version.
- Không lấy absence trong trace để xóa static edges; không trộn các trace theo timestamp.
- Thay schema/DTO/enum/status phải cập nhật producer + consumer + fixtures/tests + docs; migration theo authority Java.
- Không tự merge main hoặc stage edits ngoài task. File này là tài liệu phối hợp, không tự cấp quyền thay policy/deploy/send secrets.

**Điều phía Worker cần nhận lại từ Java:** baseline/commit mới, phần đã triển khai trong WJ-01–WJ-08, contract/fixtures được chốt, lệnh test và các dependency còn thiếu. Nhờ vậy hai bên có thể tiếp tục từ cùng một version thay vì mỗi agent tự suy một giao thức riêng.

## 13. Checklist đồng bộ trước khi bắt đầu code runtime chung

Các mục này chưa được tự đánh dấu done từ tài liệu bàn giao:

- [ ] Java và .NET xác nhận cùng baseline/commit và giữ static contract đang chạy.
- [ ] Chốt remote dispatch transport/gateway và cách cấp/đổi credential service, không chuyển secrets qua chat/docs.
- [ ] Chốt authoritative version IDs, service mappings, approved profile và source↔image policy.
- [ ] Chốt shared storage/artifact delivery nếu Java/Worker/Runner ở khác host; readonly mount là execution constraint, không phải cơ chế chuyển file qua mạng.
- [ ] Chốt runtime request/receipt schema, adapter sang Java DTO/DB, duration units và missing/redacted field semantics.
- [ ] Chốt idempotency/attempt/dispatch/result ack/late callback rules và bounded retry.
- [ ] Chốt actual state machine, cancel acknowledgement, lease/heartbeat/quota và cleanup/recovery ownership.
- [ ] Chốt secret reference resolution, retention/quota và artifact ownership theo submission/model versions.
- [ ] Có fixtures success/partial/failure/NotRun/mismatch/replay và test chạy Java consumer với .NET producer thật.

**Double-check ngày 21/10/2026:** đã đối chiếu lại shared Java transport/grant/staging, Worker request/impact types, Java publication/impact loader, Runner profile/outcome/correlated spans và Java runtime create/ingest DTOs. Đây là kiểm tra tài liệu với source, không phải lần chạy mới Maven/.NET/Docker hoặc nghiệm thu giao thức runtime liên máy.