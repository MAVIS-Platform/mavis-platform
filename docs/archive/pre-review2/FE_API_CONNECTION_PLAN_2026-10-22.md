# Kế hoạch nối API cho FE main 02c663b — 22/10/2026

## Kết quả cần đạt

Nối FE component mới của PR #29 với Java/Worker thật mà vẫn giữ luồng ZIP/GitHub → snapshot → analysis → graph/evidence → impact/explanation/export đã kiểm thử. Màn mới không được tự trở về mock khi backend lỗi hoặc thiếu API. Thứ tự ưu tiên vẫn là mainflow; business CRUD được kiểm kê đầy đủ nhưng không tự mở rộng vào đợt ưu tiên.

Đây là plan triển khai, chưa sửa code và chưa bật các feature mới. Xem inventory chi tiết: [FE_API_INVENTORY_2026-10-22.md](FE_API_INVENTORY_2026-10-22.md). Bản khảo sát: FE main 02c663b, 39 operation adapter; Java 88 và Worker 10 operation trong OpenAPI runtime. Số endpoint không phải số nghiệp vụ đã pass E2E.

## Các quyết định kỹ thuật trước khi code

1. Dùng AppProvider/QueryClient chung và session thống nhất làm hướng tích hợp. Giữ `/api/backend`/FlowFrame hiện có tương thích tạm thời; chỉ loại provider/client trùng sau khi route thay thế vượt qua acceptance. Không thay toàn bộ mainflow đang chạy bằng một proxy generic chưa map.
2. Dùng server operation handlers có kiểu rõ ràng để: chuyển cookie HttpOnly JWT → Bearer cho Java, encode path/query IDs, unwrap ApiResponse.data, ghép các response cần thiết, validate wire DTO rồi validate view DTO. JSON env `MAVIS_API_OPERATIONS` không đủ cho path interpolation, composite calls hoặc DTO translation.
3. Dùng MAVIS_JAVA_URL làm base Java chuẩn hoặc alias có migration rõ ràng cho MAVIS_BACKEND_URL; mock/backend được chọn rõ. Không gửi URL upstream, DB/Worker/Runner key xuống client. Browser chỉ gọi API cùng origin của FE.
4. Chọn project/model bằng URL chuẩn, AppProvider đồng bộ theo URL. Query key tối thiểu theo user/project/model hoặc snapshot/job tương ứng. Không chọn latest bằng models.at(-1) nếu API chưa xác nhận thứ tự; dùng revision/isLatestValid được pin.
5. Không sửa wire DTO BE chỉ để giữ các giả định trong mock. Đổi view schema cho unknown/pending/partial/nullable khi thiếu progress, coverage, classification hoặc telemetry; không dựng dữ liệu giả để Zod pass.
6. Chức năng chưa có BE hoặc dispatcher phải hiện unavailable/chờ operator đúng nghĩa, không biến 501 hay no data thành thành công. Mock mode chỉ để preview/test và luôn có nhãn.

## P0 — Hợp nhất kết nối, auth và context (bắt buộc đầu tiên)

Phạm vi FE: app/layout.tsx; AppProvider; mainflow/provider và shell; lib/api/backend-adapter.ts; lib/api/contracts.ts; app/api/mavis/[operation]/route.ts; app/api/backend/[...path]/route.ts; /login; permissions.

- Tái sử dụng login thật `POST /api/v1/auth/login`, lưu JWT HttpOnly server cookie, bỏ token khỏi JSON trả browser.
- Một session trả userId/fullName/email/role đáng tin cậy và được Java xác thực. API Java hiện chưa có `/auth/me`; phương án ưu tiên là thêm `GET /api/v1/auth/me` trả user hiện tại, không secret. Đây là endpoint đề xuất, chưa tồn tại trong inventory. Có thể dùng metadata login đã lưu server để chuyển tiếp, nhưng không coi decode JWT hoặc boolean từ cookie là kiểm chứng role hiện tại.
- /login mới dùng login thật ở backend mode. mockLogin không được gọi trên backend. Logout xóa cùng cookie/caches giữa mọi màn; chưa gọi local logout là revoke token toàn hệ thống. Không tự sáng tạo refresh token flow.
- Chốt role code từ Java → student/lecturer/admin và quyền theo resource/membership. Không dùng vai trò FE cố định để chặn lecturer xem project được phân quyền hoặc cấp quyền vượt BE.
- Chốt same-origin/CSRF theo host thực, thử cả localhost và 127.0.0.1. Bearer chỉ ở server→Java; không forward cookie mong Java tự hiểu JWT.
- Thêm handler operation rõ ràng, chuẩn lỗi 400/401/403/404/409/413/422/429/5xx, abort/timeouts và correlation ID nếu BE cung cấp. Không tự retry mutation.
- Đồng bộ selection và cache; đổi user/project/model hủy request cũ, reset selection phụ thuộc. Chưa gỡ luồng cũ trước khi chứng minh luồng mới chạy được.

Gate P0: student/lecturer/admin hợp lệ vào đúng màn; JWT hết hạn/invalid bị xử lý; logout ở một màn làm các màn còn lại mất session; không thấy token/service key trong browser JSON. Request thiếu mapping được báo chưa hỗ trợ, không trả sample. Test mock mode vẫn độc lập và không đụng Java/cloud.

## P1 — Project, source và analysis history (mainflow tối thiểu)

FE operations: projects, project, importSource, startAnalysis, analysisJobs, analysisJob; thêm GitHub import và cancel typed operations. Có sẵn BE cho các thao tác này.

- Map GET/POST projects và GET project detail. Project services count/runtime capability phải có căn cứ hoặc unknown, không tự điền.
- Nối project cards/overview vào selection thật. Giữ tạo/chọn personal project tối thiểu; chưa cần hoàn thiện edit/delete/workspace CRUD.
- ZIP dùng multipart `file`, `projectId` ở query đúng API Java; thống nhất 100 MB file/101 MB request. Sửa giới hạn 200 MB ở schema/form mới.
- GitHub public dùng JSON `projectId/repositoryUrl/branchName/commitSha`; giữ kiểm URL/ref hiện có ở cả client/proxy. Không thu PAT nếu BE chưa có contract, private repo dùng ZIP.
- Import chỉ tạo snapshot; cần explicit analyze. Giữ Idempotency-Key qua retry/refresh; lần phân tích mới có key mới. Snapshot import thành công vẫn có thể thất bại khi validate/extract/parse, không gán validation=valid sớm.
- Map `jobId→id`, `sourceSnapshotId→snapshotId` ở view khi cần, giữ status/analysisState/dotnetStatus/completeness/promotedLatest. Bổ sung cancelling/cancelled/timed-out/review/partial; không bịa phần trăm progress.
- Nối GET project jobs/job attempts, status poll và cancel. Terminal phải dừng polling; lỗi mạng cho retry GET status, không replay analyze tự động. Chỉ mở graph khi có modelVersionId đã publish và scope khớp.

Gate P1: Petclinic Java + eShop C# chạy từ FE mới, từ ZIP và ít nhất GitHub public; C# có Worker status thật. Refresh lúc đang chạy, double click/retry cùng key, cancel, timeout/failure, ZIP hỏng, repo/branch sai và project không có quyền có kết quả đúng. Giữ model đã thành công khi job mới thất bại/cancel.

## P2 — Snapshot catalog, graph/evidence/diagram, impact và AI (chốt static mainflow)

BE gap nhỏ cần làm trước màn Source Snapshots hoàn chỉnh:

- Đề xuất `GET /api/v1/projects/{projectId}/snapshots` và `GET /api/v1/analyzer/snapshots/{snapshotId}`: quyền đọc project, metadata an toàn, source/hash/ref/createdAt/published và validation/coverage nếu có căn cứ. Hai endpoint này chưa có trong 88 API.
- Không dùng jobs làm danh sách snapshot đầy đủ: snapshot vừa import chưa analyze sẽ bị mất khỏi list. Không expose đường dẫn filesystem nếu người dùng chỉ cần locator tương đối.

Graph/model:

- `models` chỉ list summary; chọn một model rồi lấy metadata + graph. Không tải graph/evidence mọi version để ghép modelSchema khổng lồ.
- Map NodeDTO id/name/type/sourcePath và EdgeDTO id/sourceNodeId/targetNodeId/kind. Layer chưa xác định cho phép unclassified/unknown; giữ type thật và UUID. Không suy health/latency từ static source.
- Evidence lazy theo element/relationship, pin model/snapshot. Chỉ hiển thị excerpt/locator BE cung cấp, không code mẫu. Đổi selection không giữ lời giải thích/evidence của target cũ.
- Nối `/diagrams` riêng, vì route này hiện không tự chạy ModelFlow live. List/detail/export/layout với diagramId và modelVersionId đúng; kéo node chỉ đổi layout, không semantic graph.
- Export trả ApiResponse chứa `content`; download đúng text/format sau khi validate model, không lưu cả envelope/error JSON thành sơ đồ.
- Impact gọi versioned API bằng SERVICE_CONTAINER ID, giữ limits/truncated/excluded edges và evidence paths. Empty impact khác unsupported/unavailable.
- AI map explanationText/providerMode/epistemicBadge/cache/citations; sample=false không đồng nghĩa đã gọi LLM. Giữ fallback trung thực và target/model scope, không chặn graph khi AI thiếu key hoặc rate limit.

Gate P2: snapshot mới chưa analyze xuất hiện; project/model switch không lẫn data; graph rỗng/lớn có UX đúng; evidence node/edge hợp scope; export Mermaid và ít nhất JSON parse được; impact limitations và AI fallback/citations có mặt. Không có mock dataset trong backend mainflow. P0–P2 là mốc bàn giao mainflow ưu tiên.

## P3 — Controlled revision, compare và evaluation

- Read properties/description hiện tại trước khi cho sửa. Graph và model summary hiện chưa cung cấp đủ editable properties; chọn mở rộng read DTO hoặc thêm element detail endpoint có quyền đọc (endpoint đề xuất), không điền rỗng rồi overwrite.
- Map saveModel sang `POST /analyzer/models/{baseModelVersionId}/revisions`, dùng `modifiedElements` và properties đúng schema. Java không có trường expectedRevision giống FE; chốt policy stale base (409 hay nhánh immutable mới) với contract/test rõ ràng trước khi bật Save.
- Không lấy role/createdById từ browser làm nguồn quyền. Model trả về phải ID mới, revision hợp lệ và source pin phù hợp; evidence của inferred/manual changes có provenance tương ứng.
- Compare gọi API baseVersionId/targetVersionId, không chỉ diff hai dataset FE chưa đủ dữ liệu. Giữ labels added/removed/changed từ BE.
- Thêm operation evaluate/list/detail/findings và một section trong model detail. Pin evaluationRunId để export/submission, không coi mọi model đã evaluate.

Gate P3: sửa một element thành revision mới, bản cũ không đổi; compare đúng hai version; conflict/stale policy theo contract; findings và score pin đúng model; đổi selection giữa lúc save không hiện kết quả vào model khác.

## P4 — Runtime thật, tách khỏi static mainflow

Dependencies BE/Runner phải chốt:

- Hiện có preflight/create/approve/stop/detail/list theo project/sequence; chưa có CRUD registry profile/config/scenario version tương ứng form FE. Chọn cấu hình operator provisioned/read-only trước, hoặc triển khai registry version hóa riêng. Không sinh UUID/version giả trong browser.
- Create DTO thực gồm projectId/sourceSnapshotId/modelVersionId, profile/runConfiguration/scenario version IDs, scenarioConfig và confirmedServiceMappings. FE `startRuntime` hiện không map 1:1.
- Luồng: preflight(snapshot) → create pinned session → explicit approve → READY_FOR_DISPATCH → operator/dispatcher gọi Runner → ALLOCATED/RUNNING → receipt/cleanup → kết quả/sequence/enriched model. Approve không tự chứng minh Docker chạy.
- Trước khi hứa nút Run tự động, phải có host/dispatcher thực, ownership/lease/idempotency, state root dùng chung cho cancel, timeout/recovery và delivery receipt. Nếu còn chạy operator thì UI ghi chờ operator, không giả tự động.
- Hiển thị executionStatus, scenarioStatus, evidenceStatus, cleanupStatus, traceQuality, mappingStatus riêng. Không flatten thành running/completed/terminated và tự gán outcome.
- Stop Java hiện không nhận action cancel/terminate. Dùng đúng một hành động Stop/Cancel; chỉ thêm Terminate khác nghĩa sau khi có BE contract thực.
- Browser không gọi internal receipt/lifecycle/recovery/run-definition bằng service keys. Trace không có thì hiển thị không có, không lấy static graph làm bằng chứng runtime.

Gate P4: workload thật được khởi chạy bởi bridge đã chọn, trace/evidence theo session, stop được ghi nhận, cleanup confirmed, không đổi PASSED khi stop phiên đã terminal; timeout/startup fail/crash recovery đúng trạng thái. P4 chưa pass không chặn chốt static mainflow, nhưng chưa gọi toàn bộ runtime UI hoàn tất.

## P5 — Education/business sau mainflow (không tự mở scope đợt ưu tiên)

- Workspaces/members/assignments: nối list/detail trước; members lazy endpoint riêng, quyền theo workspace; rồi mới các form CRUD đã có yêu cầu.
- References: published snapshots + model đúng sourceSnapshotId; quyền publish rõ. Không ghép reference snapshot với latest model khác nguồn.
- Submission list theo project/assignment đã có API; nếu cần My submissions toàn bộ thì thêm API được phân quyền, không giả có global list.
- Submission view lấy metadata/export/feedback và các artifact theo IDs đã pin. Không đổi thành model mới nhất của project.
- Submit bổ sung projectId + diagramVersionId bắt buộc và evaluation/runtime khi cần. Java suy nguồn từ model, FE phải kiểm returned sourceSnapshotId khớp; không chỉ gửi modelId/snapshotId rồi hy vọng đủ contract.
- Feedback gửi commentText và optional element/relationship ID; response là FeedbackDTO, không phải SubmissionDTO. Refetch/composition sau write để đáp ứng view; giữ resource RBAC.

Gate P5: student chỉ nộp nguồn/artifact hợp lệ của mình; lecturer đúng workspace đọc/comment; người ngoài 403. Sửa model sau nộp không đổi submission đã pin; form lỗi không mất dữ liệu người dùng.

## P6 — Administration sau mainflow (có API và thiếu API tách riêng)

Nối trước các API đã có: users/status/role, audit-logs, dashboard totals. Map status thật, không tự bịa LOCKED; scope ADMIN kiểm ở Java.

Các gap chưa được tính là đã triển khai:

- Integrations/profiles CRUD: chưa có endpoint registry list/save trong inventory. Có thể để unavailable/read-only hoặc bổ sung BE; UI không thu secret.
- Global admin jobs/runtime sessions: hiện API list theo project; cần endpoint aggregate được phân quyền/pagination hoặc đổi UX sang project-scoped. Không truyền projectId=* vào UUID route.
- Health/usage/runtime summary: Java dashboard là totals, không phải live running count hay dependency health. Ping chỉ nói Java phản hồi. Hiển thị unknown cho số liệu chưa có; muốn health tổng thể cần probe server-side có timeout và provenance.

Gate P6: thao tác admin đúng role/status, audit có dữ liệu thật, dashboard không tạo số liệu giả, API thiếu được báo chưa hỗ trợ và không fallback mock.

## P7 — Acceptance và release theo từng lát

Thực hiện kiểm thử ngay trong P0…P6, không đợi nối xong mọi màn:

- Contract fixtures từ payload BE thật đã bỏ secret: success, validation, unauthorized/forbidden, conflict, partial và unavailable. Test translator/cross-scope/state semantics thay vì chỉ test component tự lặp implementation.
- Kiểm mock và backend riêng; backend không import dataset mock làm fallback. Bổ sung test /api/mavis handlers cho path interpolation, bearer translation, unwrap, multipart boundary/query projectId, same-origin/CSRF và response scope.
- Browser student: login → tạo/chọn project → ZIP/GitHub → poll/refresh/cancel → graph/evidence → impact → AI fallback → export. Cả Java và C#; người ngoài bị chặn. Các lát revision/runtime/education/admin chỉ gán pass sau khi thực hiện test của lát đó.
- DB cloud test: namespace project/account riêng, không thay seed/chạy reset. Source/artifact/state root vẫn phải mount đúng; DB cloud không thay Docker host/source storage.
- Build/typecheck/lint phù hợp file thay đổi, test backend cho endpoint mới và test ảnh hưởng. Không chạy fault/load suite đại trà trên cloud chung.
- Mỗi PR có nguồn commit, phạm vi API bật thật, test pass/fail/skipped và giới hạn. Giữ lịch sử Git đã chia sẻ; không force-push/squash commit đã push. Dọn generated files khỏi commit, không commit .next/logs/cookies/DB backup.

## Chia commit/PR dự kiến

1. `feat/fe-api-auth-context`: bearer/session/me, unified provider/context, explicit translators nền. BE /auth/me là commit riêng có test.
2. `feat/fe-api-source-jobs`: project/read overview, ZIP/GitHub + job history/cancel/idempotency; tiếp tục giữ compatibility luồng cũ đến khi UI mới pass.
3. `feat/fe-api-architecture`: snapshot list/detail BE; model summaries/detail/evidence/diagram/impact/AI. Chốt static mainflow ở đây.
4. `feat/fe-api-revisions-evaluation`: read editable detail, revision policy, compare/evaluation.
5. `feat/fe-api-runtime`: registry/operator capabilities/dispatcher đã thống nhất, runtime lifecycle/trace/stop.
6. Education/admin: hai nhóm PR độc lập sau mainflow, chỉ bật operation đã có API và acceptance tương ứng.

Tên nhánh là đề xuất, chưa tạo nhánh hay commit source trong lần lập plan. Khi bắt đầu triển khai phải lấy origin/main mới nhất, kiểm tra AGENTS và bảo toàn local Worker/FE edits hiện có; không coi việc đã copy FE files vào checkout cũ là đã đồng bộ lịch sử Git toàn repo.

## Thứ tự triển khai đề nghị

Làm P0 → P1 → P2 trước để FE #29 dùng sản phẩm thật từ đầu đến cuối và không mất GitHub mainflow đã chạy. Sau gate static mainflow mới P3 → P4. P5/P6 vẫn là backlog business theo yêu cầu tạm bỏ CRUD trước đây. Không cần đợi bên Java xác nhận lại API đã có; chỉ những gap/schema/semantics nêu rõ ở trên cần được bổ sung/chốt bằng code và test trong lát tương ứng.

## Điều kiện chốt

- Chốt đợt mainflow: P0–P2 và acceptance tương ứng pass trên FE mới, không mock/không giả progress/coverage, ZIP và GitHub thật, Java/C# thật, resource auth thật.
- Chốt toàn bộ tính năng: thêm P3/P4 và các nhóm business/admin được chọn, cùng các API/dispatcher còn thiếu. Inventory 88+10 operation hoặc một lần build thành công không đủ gọi toàn sản phẩm 100%.
