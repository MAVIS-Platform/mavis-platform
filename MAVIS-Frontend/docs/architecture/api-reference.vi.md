# MAVIS — Danh mục đầy đủ endpoint, HTTP method, request và response

Đối chiếu mã nguồn ngày **22/10/2026**. Phạm vi gồm **5 endpoint backend được khai báo**, **38 endpoint public đề xuất** và cách gọi **38 operation qua proxy Next.js**. `mockLogin` là thao tác mock riêng, không phải API đăng nhập backend.

**Trạng thái kiểm chứng:** kiểm tra tĩnh từ source; chưa khởi chạy/gọi backend. Tất cả ID, thời gian, đường dẫn và JSON dưới đây là **ví dụ minh họa**, không phải response đã thu từ server. Các endpoint public trong mục 2 đều **PROPOSED, chưa có implementation tương thích**.

OpenAPI có thể dùng làm tài liệu máy đọc:

- [5 endpoint có khai báo trong source](backend-implemented.openapi.yaml).
- [38 endpoint public đề xuất, cùng toàn bộ JSON Schema](openapi.yaml).

## Quy ước chung

- Spring local: `http://localhost:8080`; Worker development: `http://localhost:5082` hoặc `https://localhost:7175`. Worker có HTTPS redirection; cổng production chưa được xác định.
- Public draft dùng prefix `/api/v1`. JSON request có `Content-Type: application/json`; response thành công `application/json`, lỗi đề xuất `application/problem+json`. Upload dùng `multipart/form-data` với boundary do HTTP client tạo.
- `{id}` trong URL là path parameter bắt buộc. GET không có request body. ID public draft là chuỗi; chỉ `projectId` của upload Spring hiện tại được bind thành UUID.
- Trong schema TypeScript minh họa, `?` là field không bắt buộc; `| null` là nhận/trả null. Số nguyên và giới hạn được ghi trong comment; đây là ký hiệu tài liệu, không phải source DTO mới.
- Thành công Spring có `{code,message,data,timestamp}`. Worker trả object trực tiếp. Frontend/public draft yêu cầu object hoặc array trực tiếp, không bọc `ApiResponse`.
- Cookie `MAVIS_SESSION` và phân quyền public draft mới là đề xuất. Spring hiện `permitAll` và tắt CSRF; Worker không có `[Authorize]` trong các controller đã đọc.
- Với public draft có ID lặp trong path và body, hai giá trị phải được thống nhất khi triển khai adapter. Proxy hiện chưa nội suy `{id}` vào path.

## 1. Backend đã khai báo trong mã nguồn

Đây là 5 application endpoints tìm thấy trong controller. Không tính route Swagger do framework tự sinh. Chưa xác minh runtime.

### 1.1. `GET /api/v1/system/ping`

Kiểm tra kết nối Spring.

Không có request body. SecurityConfig hiện permitAll. Ping không xác nhận sức khỏe database, worker hay runtime.

**Request:** không có path/query/body.

```http
GET /api/v1/system/ping HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response HTTP 200:** Thành công.

Content-Type: `application/json`; schema: `SpringStringResponse`.

```json
{
  "code": 200,
  "message": "Thao tác thành công",
  "data": "Pong! MAVIS System is up and running.",
  "timestamp": "2026-10-22T10:00:00"
}
```

**Response HTTP 500:** Ngoại lệ chưa được xử lý.

Content-Type: `application/json`; schema: `SpringError`.

```json
{
  "code": 500,
  "message": "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau",
  "timestamp": "2026-10-22T10:00:00"
}
```

### 1.2. `POST /api/v1/analyzer/upload`

Upload ZIP và phát AnalyzeRequestEvent.

Kiểm tra file không rỗng và tên kết thúc .zip; lưu file, phát event phân tích rồi trả đường dẫn máy chủ. Không trả snapshot hay jobId. Không có field name; không thấy giới hạn upload tùy chỉnh trong application.yml. Lỗi binding multipart/UUID chưa được kiểm thử runtime; không gán tất cả thành 400.

**Request multipart, cả hai field bắt buộc:**

- `file`: file không rỗng, tên kết thúc `.zip` (không phân biệt hoa thường). Controller hiện chỉ kiểm tra tên file và file rỗng; không có `name` hay `snapshotId`.
- `projectId`: UUID, ví dụ `11111111-1111-4111-8111-111111111111`.

```powershell
curl.exe -X POST "http://localhost:8080/api/v1/analyzer/upload" `
  -F "projectId=11111111-1111-4111-8111-111111111111" `
  -F "file=@C:/path/source-demo.zip"
```

**Response HTTP 200:** Đã lưu và phát event; chưa chứng minh phân tích hoàn tất.

Content-Type: `application/json`; schema: `SpringStringResponse`.

```json
{
  "code": 200,
  "message": "Tải file ZIP thành công và đã phát tín hiệu phân tích",
  "data": "C:\\mavis\\uploads\\12345678-1234-4234-8234-123456789abc_source-demo.zip",
  "timestamp": "2026-10-22T10:00:00"
}
```

**Response HTTP 400:** BusinessException luôn trả HTTP 400, kể cả code FILE_UPLOAD_FAILED=5001.

Content-Type: `application/json`; schema: `SpringError`.

Ví dụ `emptyFile`:

```json
{
  "code": 400,
  "message": "File tải lên không được để trống",
  "timestamp": "2026-10-22T10:00:00"
}
```

Ví dụ `wrongExtension`:

```json
{
  "code": 400,
  "message": "Chỉ chấp nhận file định dạng .zip",
  "timestamp": "2026-10-22T10:00:00"
}
```

Ví dụ `storageFailure`:

```json
{
  "code": 5001,
  "message": "Lỗi khi lưu trữ file ZIP xuống hệ thống",
  "timestamp": "2026-10-22T10:00:00"
}
```

**Response HTTP 500:** Ngoại lệ khác do GlobalExceptionHandler xử lý.

Content-Type: `application/json`; schema: `SpringError`.

```json
{
  "code": 500,
  "message": "Đã xảy ra lỗi hệ thống, vui lòng thử lại sau",
  "timestamp": "2026-10-22T10:00:00"
}
```

Lưu ý từ source: mọi `BusinessException` đều được handler gán HTTP **400**, kể cả lỗi lưu file có `code:5001`. Thiếu field, UUID sai và lỗi multipart đi qua binding/framework/catch-all; chưa kiểm thử nên không khẳng định chúng luôn là HTTP 400. Thành công upload không có jobId và không bảo đảm phân tích đã hoàn tất.

### 1.3. `POST /api/Jobs/submit`

Xếp hàng phân tích bất đồng bộ.

**Request JSON:** `AnalysisRequest` — schema đầy đủ ở mục 1.6. `projectId` phải không rỗng; các field còn lại dùng mặc định trong DTO khi bị bỏ.

```json
{
  "projectId": "11111111-1111-4111-8111-111111111111",
  "projectName": "MAVIS Demo",
  "sourceLocation": "",
  "rawFindings": [
    {
      "language": "java",
      "serviceId": "order-service",
      "kind": "HTTP_REST_CALL",
      "target": "user-service",
      "httpMethod": "GET",
      "url": "http://user-service/api/users",
      "filePath": "order-service/OrderClient.java",
      "startLine": 42,
      "endLine": 42,
      "snippet": "GET http://user-service/api/users"
    }
  ],
  "computeImpact": true,
  "impactTargetServiceId": "user-service"
}
```

**Response HTTP 202:** Đã xếp hàng; chưa có kết quả.

Content-Type: `application/json`; schema: `JobSubmitResponse`.

```json
{
  "jobId": "1234567890abcdef1234567890abcdef",
  "message": "Analysis job submitted successfully",
  "projectId": "11111111-1111-4111-8111-111111111111"
}
```

**Response HTTP 400:** ProjectId rỗng có WorkerError. JSON/body sai cấu trúc có thể do [ApiController] trả ValidationProblemDetails.

Content-Type: `application/json`; schema: `WorkerError`.

```json
{
  "error": "ProjectId is required"
}
```

Content-Type: `application/problem+json`; schema: `object do framework sinh`.

**Response HTTP 500:** Không thấy custom error envelope cho ngoại lệ Worker; body phụ thuộc environment.

### 1.4. `GET /api/Jobs/{jobId}`

Lấy trạng thái và kết quả job.

Hàng đợi lưu trong RAM; restart Worker làm mất job. Job thất bại vẫn GET HTTP 200 với status=Failed và error có nội dung.

**Request:** `jobId` trong path; không có query/body.

```http
GET /api/Jobs/1234567890abcdef1234567890abcdef HTTP/1.1
Host: localhost:5082
Accept: application/json
```

**Response HTTP 200:** Trạng thái hiện tại; resultJson có thể null.

Content-Type: `application/json`; schema: `JobStatus`.

```json
{
  "jobId": "1234567890abcdef1234567890abcdef",
  "jobType": "AnalysisRequest",
  "status": "Completed",
  "enqueuedAt": "2026-10-22T03:00:00Z",
  "startedAt": "2026-10-22T03:00:00Z",
  "completedAt": "2026-10-22T03:00:00Z",
  "error": null,
  "resultJson": "{\"ProjectId\":\"11111111-1111-4111-8111-111111111111\",\"Manifest\":{\"ProjectId\":\"11111111-1111-4111-8111-111111111111\",\"ProjectName\":\"MAVIS Demo\",\"SourceLocation\":\"\",\"Services\":[{\"Id\":\"order-service\",\"Name\":\"order-service\",\"Language\":\"java\",\"Framework\":null,\"SourceRoot\":null,\"ExposedPorts\":[],\"Metadata\":{}},{\"Id\":\"user-service\",\"Name\":\"user-service\",\"Language\":null,\"Framework\":null,\"SourceRoot\":null,\"ExposedPorts\":[],\"Metadata\":{}}],\"Dependencies\":[{\"Id\":\"edge-demo-1\",\"FromServiceId\":\"order-service\",\"ToServiceId\":\"user-service\",\"Kind\":1,\"HttpMethod\":\"GET\",\"Url\":\"http://user-service/api/users\",\"Evidences\":[{\"SourceKind\":\"SourceFile\",\"FilePath\":\"order-service/OrderClient.java\",\"StartLine\":42,\"EndLine\":42,\"Snippet\":\"GET http://user-service/api/users\"}]}]},\"Impact\":{\"TargetServiceId\":\"user-service\",\"AffectedServices\":[{\"ServiceId\":\"order-service\",\"Level\":1,\"Distance\":1}],\"Paths\":[{\"FromServiceId\":\"order-service\",\"ToServiceId\":\"user-service\",\"Hops\":[\"order-service\",\"user-service\"]}]},\"CompletedAt\":\"2026-10-22T03:00:00Z\"}"
}
```

**Response HTTP 404:** Không tìm thấy job.

Content-Type: `application/json`; schema: `WorkerError`.

```json
{
  "error": "Job 1234567890abcdef1234567890abcdef not found"
}
```

**Response HTTP 500:** Ngoại lệ Worker, không có custom envelope được khai báo.

Trạng thái: `Queued → Processing → Completed | Failed`. `startedAt`, `completedAt`, `error`, `resultJson` có thể null. `resultJson` là **chuỗi JSON cần parse thêm một lần**; tên field bên trong dùng **PascalCase**, khác camelCase ở response HTTP ngoài. `DependencyKind` và `ImpactLevel` serialize thành số.

### 1.5. `POST /api/analysis`

Phân tích đồng bộ.

**Request JSON:** `AnalysisRequest` — schema đầy đủ ở mục 1.6. `projectId` phải không rỗng; các field còn lại dùng mặc định trong DTO khi bị bỏ.

```json
{
  "projectId": "11111111-1111-4111-8111-111111111111",
  "projectName": "MAVIS Demo",
  "sourceLocation": "",
  "rawFindings": [
    {
      "language": "java",
      "serviceId": "order-service",
      "kind": "HTTP_REST_CALL",
      "target": "user-service",
      "httpMethod": "GET",
      "url": "http://user-service/api/users",
      "filePath": "order-service/OrderClient.java",
      "startLine": 42,
      "endLine": 42,
      "snippet": "GET http://user-service/api/users"
    }
  ],
  "computeImpact": true,
  "impactTargetServiceId": "user-service"
}
```

**Response HTTP 200:** Manifest và impact nếu được yêu cầu.

Content-Type: `application/json`; schema: `AnalysisResult`.

```json
{
  "projectId": "11111111-1111-4111-8111-111111111111",
  "manifest": {
    "projectId": "11111111-1111-4111-8111-111111111111",
    "projectName": "MAVIS Demo",
    "sourceLocation": "",
    "services": [
      {
        "id": "order-service",
        "name": "order-service",
        "language": "java",
        "framework": null,
        "sourceRoot": null,
        "exposedPorts": [],
        "metadata": {}
      },
      {
        "id": "user-service",
        "name": "user-service",
        "language": null,
        "framework": null,
        "sourceRoot": null,
        "exposedPorts": [],
        "metadata": {}
      }
    ],
    "dependencies": [
      {
        "id": "edge-demo-1",
        "fromServiceId": "order-service",
        "toServiceId": "user-service",
        "kind": 1,
        "httpMethod": "GET",
        "url": "http://user-service/api/users",
        "evidences": [
          {
            "sourceKind": "SourceFile",
            "filePath": "order-service/OrderClient.java",
            "startLine": 42,
            "endLine": 42,
            "snippet": "GET http://user-service/api/users"
          }
        ]
      }
    ]
  },
  "impact": {
    "targetServiceId": "user-service",
    "affectedServices": [
      {
        "serviceId": "order-service",
        "level": 1,
        "distance": 1
      }
    ],
    "paths": [
      {
        "fromServiceId": "order-service",
        "toServiceId": "user-service",
        "hops": ["order-service", "user-service"]
      }
    ]
  },
  "completedAt": "2026-10-22T03:00:00Z"
}
```

**Response HTTP 400:** projectId rỗng có WorkerError. JSON/body sai cấu trúc có thể do [ApiController] trả ValidationProblemDetails.

Content-Type: `application/json`; schema: `WorkerError`.

```json
{
  "error": "projectId is required"
}
```

Content-Type: `application/problem+json`; schema: `object do framework sinh`.

**Response HTTP 500:** Không có custom error envelope được khai báo cho ngoại lệ khi phân tích.

`impact` chỉ có object khi `computeImpact=true` và `impactTargetServiceId` không rỗng; các trường hợp khác trả `impact:null`. Response không phải `Model` của frontend.

### 1.6. Toàn bộ schema backend hiện có

Tên field dưới đây dùng theo JSON HTTP camelCase. Riêng JSON lồng trong chuỗi `resultJson` dùng PascalCase do serializer nội bộ. `RawFinding` không có field bắt buộc được khai báo riêng; `AnalysisRequest.projectId` còn được controller kiểm tra không rỗng.

#### `SpringStringResponse`

```typescript
type SpringStringResponse = {
  // Mã ứng dụng, không phải HTTP status độc lập.; số nguyên
  code: number;
  message: string;
  data: string;
  // LocalDateTime của server, không có offset; giá trị minh họa.
  timestamp: string;
};
```

#### `SpringError`

```typescript
type SpringError = {
  // Có thể khác HTTP status, ví dụ HTTP 400 với code=5001.; số nguyên
  code: number;
  message: string;
  // LocalDateTime của server; data bị bỏ khi null.
  timestamp: string;
};
```

#### `WorkerError`

```typescript
type WorkerError = {
  error: string;
};
```

#### `AnalysisRequest`

```typescript
type AnalysisRequest = {
  // Bắt buộc không rỗng hoặc toàn khoảng trắng.; độ dài tối thiểu=1; pattern="\\S"
  projectId: string;
  // Mặc định chuỗi rỗng.; mặc định=""
  projectName?: string;
  // Vị trí source do dịch vụ nội bộ cung cấp; mặc định chuỗi rỗng. Không phải ZIP upload.; mặc định=""
  sourceLocation?: string;
  // mặc định=[]
  rawFindings?: Array<RawFinding>;
  // mặc định=true
  computeImpact?: boolean;
  // Chỉ tính impact khi computeImpact=true và target không rỗng.
  impactTargetServiceId?: string | null;
};
```

#### `RawFinding`

```typescript
type RawFinding = {
  // mặc định="generic"
  language?: string;
  // mặc định=""
  serviceId?: string;
  // HTTP_REST_CALL/REST_CALL/HTTP_CALL/FEIGN_CLIENT; CONFIG_REFERENCE/CONFIGURATION_REFERENCE; ENV_VAR/ENV_VAR_REFERENCE/ENVIRONMENT_VARIABLE_REFERENCE; DOCKER_NETWORK/DOCKER_NETWORK_REFERENCE. Giá trị khác được ánh xạ Unknown.; mặc định=""
  kind?: string;
  target?: string | null;
  httpMethod?: string | null;
  url?: string | null;
  // mặc định=""
  filePath?: string;
  // số nguyên nếu khác null
  startLine?: number | null;
  // số nguyên nếu khác null
  endLine?: number | null;
  // mặc định=""
  snippet?: string;
};
```

#### `AnalysisResult`

```typescript
type AnalysisResult = {
  projectId: string;
  manifest: ProjectManifest;
  impact: WorkerImpact | null;
  // format="date-time"
  completedAt: string;
};
```

#### `ProjectManifest`

```typescript
type ProjectManifest = {
  projectId: string;
  projectName: string;
  sourceLocation: string;
  services: Array<ServiceNode>;
  dependencies: Array<DependencyEdge>;
};
```

#### `ServiceNode`

```typescript
type ServiceNode = {
  id: string;
  name: string;
  language: string | null;
  framework: string | null;
  sourceRoot: string | null;
  exposedPorts: Array<string>;
  metadata: {
    [key: string]: string;
  };
};
```

#### `DependencyEdge`

```typescript
type DependencyEdge = {
  // ID ổn định do resolver sinh; ví dụ trong tài liệu chỉ minh họa.
  id: string;
  fromServiceId: string;
  toServiceId: string;
  // 0=Unknown, 1=HttpRestCall, 2=ConfigurationReference, 3=EnvironmentVariableReference, 4=DockerNetworkReference.; số nguyên
  kind: 0 | 1 | 2 | 3 | 4;
  httpMethod: string | null;
  url: string | null;
  evidences: Array<WorkerEvidence>;
};
```

#### `WorkerEvidence`

```typescript
type WorkerEvidence = {
  // Chuỗi, không phải enum số.; mặc định="SourceFile"
  sourceKind: string;
  filePath: string;
  // số nguyên nếu khác null
  startLine: number | null;
  // số nguyên nếu khác null
  endLine: number | null;
  snippet: string;
};
```

#### `WorkerImpact`

```typescript
type WorkerImpact = {
  targetServiceId: string;
  affectedServices: Array<ImpactedService>;
  paths: Array<DependencyPath>;
};
```

#### `ImpactedService`

```typescript
type ImpactedService = {
  serviceId: string;
  // 0=None, 1=Direct, 2=Indirect, 3=Transitive.; số nguyên
  level: 0 | 1 | 2 | 3;
  // Khoảng cách qua dependency tới target.; số nguyên
  distance: number;
};
```

#### `DependencyPath`

```typescript
type DependencyPath = {
  fromServiceId: string;
  toServiceId: string;
  hops: Array<string>;
};
```

#### `JobSubmitResponse`

```typescript
type JobSubmitResponse = {
  // Guid.ToString("N"): UUID không dấu gạch ngang.
  jobId: string;
  message: string;
  projectId: string;
};
```

#### `JobStatus`

```typescript
type JobStatus = {
  jobId: string;
  jobType: "AnalysisRequest";
  status: "Queued" | "Processing" | "Completed" | "Failed";
  // format="date-time"
  enqueuedAt: string;
  // format="date-time"
  startedAt: string | null;
  // format="date-time"
  completedAt: string | null;
  error: string | null;
  // JSON dạng chuỗi, không phải object. Deserialize chuỗi sẽ thấy tên thuộc tính PascalCase và enum số do JsonSerializer.Serialize(result) không dùng web options.
  resultJson: string | null;
};
```

## 2. Public REST API đề xuất cho frontend — 38 endpoint

**Toàn bộ mục này là PROPOSED.** Endpoint, status và response lấy từ [openapi.yaml](openapi.yaml); ví dụ được soạn theo [contracts.ts](../../src/lib/api/contracts.ts) và [domain.ts](../../src/types/domain.ts). Chưa có backend tương thích hoặc bằng chứng gọi thành công.

Mỗi endpoint bên dưới ghi cả REST method đề xuất và method proxy hiện tại. Request/response mẫu chứa đủ field theo schema; các schema đầy đủ, nullable, enum và ràng buộc ở mục 3. Dữ liệu danh sách trả array trực tiếp. Các query `page=0`, `size=50` trong OpenAPI chỉ là phân trang đề xuất, chưa được frontend gửi.

### Mục lục endpoint public

- [1. Lấy phiên đăng nhập](#public-session) — `GET /api/v1/session`
- [2. Đăng xuất](#public-signout) — `POST /api/v1/session/logout`
- [3. Danh sách dự án](#public-projects) — `GET /api/v1/projects`
- [4. Chi tiết dự án](#public-project) — `GET /api/v1/projects/{projectId}`
- [5. Danh sách phiên bản source](#public-snapshots) — `GET /api/v1/projects/{projectId}/snapshots`
- [6. Upload ZIP và tạo snapshot](#public-importsource) — `POST /api/v1/projects/{projectId}/snapshots`
- [7. Danh sách job phân tích theo dự án](#public-analysisjobs) — `GET /api/v1/projects/{projectId}/analysis-jobs`
- [8. Bắt đầu phân tích](#public-startanalysis) — `POST /api/v1/projects/{projectId}/analysis-jobs`
- [9. Chi tiết job phân tích](#public-analysisjob) — `GET /api/v1/analysis-jobs/{jobId}`
- [10. Danh sách phiên bản model](#public-models) — `GET /api/v1/projects/{projectId}/models`
- [11. Chi tiết model và graph](#public-model) — `GET /api/v1/models/{modelId}`
- [12. Tạo revision model](#public-savemodel) — `POST /api/v1/models/{modelId}/revisions`
- [13. Đọc cấu hình runtime](#public-runtimeconfiguration) — `GET /api/v1/projects/{projectId}/runtime-configuration`
- [14. Lưu cấu hình runtime](#public-saveruntimeconfiguration) — `PUT /api/v1/projects/{projectId}/runtime-configuration`
- [15. Danh sách kịch bản](#public-scenarios) — `GET /api/v1/projects/{projectId}/scenarios`
- [16. Lưu revision kịch bản](#public-savescenario) — `POST /api/v1/scenarios/{scenarioId}/revisions`
- [17. Danh sách phiên runtime](#public-runtimesessions) — `GET /api/v1/runtime-sessions`
- [18. Phê duyệt và bắt đầu runtime](#public-startruntime) — `POST /api/v1/runtime-sessions`
- [19. Chi tiết phiên runtime](#public-runtimesession) — `GET /api/v1/runtime-sessions/{sessionId}`
- [20. Hủy hoặc kết thúc phiên runtime](#public-stopruntime) — `POST /api/v1/runtime-sessions/{sessionId}/actions`
- [21. Phân tích ảnh hưởng](#public-impact) — `POST /api/v1/models/{modelId}/impact-analyses`
- [22. Giải thích phần tử kiến trúc](#public-explain) — `POST /api/v1/models/{modelId}/elements/{elementId}/explanations`
- [23. Danh sách workspace](#public-workspaces) — `GET /api/v1/workspaces`
- [24. Danh sách bài tập](#public-assignments) — `GET /api/v1/workspaces/{workspaceId}/assignments`
- [25. Danh sách phiên bản tham chiếu](#public-referenceversions) — `GET /api/v1/workspaces/{workspaceId}/reference-versions`
- [26. Danh sách bài nộp](#public-submissions) — `GET /api/v1/submissions`
- [27. Nộp bài](#public-submit) — `POST /api/v1/submissions`
- [28. Chi tiết bài nộp](#public-submission) — `GET /api/v1/submissions/{submissionId}`
- [29. Thêm nhận xét](#public-feedback) — `POST /api/v1/submissions/{submissionId}/feedback`
- [30. Danh sách tài khoản](#public-accounts) — `GET /api/v1/admin/accounts`
- [31. Khóa hoặc mở khóa tài khoản](#public-setaccountlock) — `PATCH /api/v1/admin/accounts/{accountId}/lock`
- [32. Danh sách tích hợp](#public-integrations) — `GET /api/v1/admin/integrations`
- [33. Bật hoặc tắt tích hợp](#public-configureintegration) — `PATCH /api/v1/admin/integrations/{integrationId}`
- [34. Danh sách runtime profile](#public-profiles) — `GET /api/v1/admin/runtime-profiles`
- [35. Bật hoặc tắt runtime profile](#public-configureprofile) — `PATCH /api/v1/admin/runtime-profiles/{profileId}`
- [36. Danh sách bản ghi audit](#public-audit) — `GET /api/v1/admin/audit-records`
- [37. Danh sách toàn bộ job phân tích](#public-adminjobs) — `GET /api/v1/admin/analysis-jobs`
- [38. Tổng quan nền tảng](#public-platformsummary) — `GET /api/v1/admin/platform-summary`

<a id="public-session"></a>

### 2.1. Lấy phiên đăng nhập

**REST đề xuất:** `GET /api/v1/session`  
**Operation / proxy hiện có:** `session` → `GET /api/mavis/session`  
**Vai trò đề xuất:** `anonymous`, `student`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: PROPOSED. Anonymous callers receive user=null; no token is returned.

**Request:**

Không có request body.

```http
GET /api/v1/session HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Session`, `Content-Type: application/json`.

```json
{
  "user": {
    "id": "student-1",
    "name": "Nguyễn An",
    "role": "student"
  }
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-signout"></a>

### 2.2. Đăng xuất

**REST đề xuất:** `POST /api/v1/session/logout`  
**Operation / proxy hiện có:** `signOut` → `POST /api/mavis/signOut`  
**Vai trò đề xuất:** `student`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

Body `application/json`, bắt buộc. Schema: `Record<string, unknown>`.

```json
{}
```

```http
POST /api/v1/session/logout HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Ok`, `Content-Type: application/json`.

```json
{
  "ok": true
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-projects"></a>

### 2.3. Danh sách dự án

**REST đề xuất:** `GET /api/v1/projects`  
**Operation / proxy hiện có:** `projects` → `GET /api/mavis/projects`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Returns an array for current FE schema compatibility. Pagination headers are proposed.

**Request:**

- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/projects?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Project>`, `Content-Type: application/json`.

```json
[
  {
    "id": "project-1",
    "name": "MAVIS Demo",
    "repository": "source-demo.zip",
    "status": "ready",
    "services": 2,
    "runtimeSupported": true
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-project"></a>

### 2.4. Chi tiết dự án

**REST đề xuất:** `GET /api/v1/projects/{projectId}`  
**Operation / proxy hiện có:** `project` → `GET /api/mavis/project`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/projects/project-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Project`, `Content-Type: application/json`.

```json
{
  "id": "project-1",
  "name": "MAVIS Demo",
  "repository": "source-demo.zip",
  "status": "ready",
  "services": 2,
  "runtimeSupported": true
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-snapshots"></a>

### 2.5. Danh sách phiên bản source

**REST đề xuất:** `GET /api/v1/projects/{projectId}/snapshots`  
**Operation / proxy hiện có:** `snapshots` → `GET /api/mavis/snapshots`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.
- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/projects/project-1/snapshots?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Snapshot>`, `Content-Type: application/json`.

```json
[
  {
    "id": "snapshot-1",
    "projectId": "project-1",
    "name": "Source v1",
    "createdAt": "2026-10-22T03:00:00Z",
    "validation": "valid",
    "evidenceComplete": true
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-importsource"></a>

### 2.6. Upload ZIP và tạo snapshot

**REST đề xuất:** `POST /api/v1/projects/{projectId}/snapshots`  
**Operation / proxy hiện có:** `importSource` → `POST /api/mavis/importSource`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: PROPOSED. Do not return storage paths. Frontend local upload maximum is 200 MiB; deployment limit remains TBD.

Browser kiểm tra ZIP không rỗng và tối đa 200 MiB (209715200 byte). Proxy nhận field file và metadata input, rồi chuyển thành file/projectId/name cho upstream. Giới hạn deployment chưa thống nhất.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `multipart/form-data`, bắt buộc.

- `projectId`: `string`; bắt buộc.
- `file`: file ZIP; bắt buộc; format="binary".
- `name`: `string`; bắt buộc; độ dài tối thiểu=1; độ dài tối đa=100.

```powershell
curl.exe -X POST "http://localhost:8080/api/v1/projects/project-1/snapshots" `
  -F "projectId=project-1" `
  -F "name=Source v1" `
  -F "file=@C:/path/source-demo.zip"
```

Lệnh trên chỉ minh họa contract đề xuất, chưa có endpoint tương ứng để gọi.

```http
POST /api/v1/projects/project-1/snapshots HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 201** — schema `Snapshot`, `Content-Type: application/json`.

```json
{
  "id": "snapshot-1",
  "projectId": "project-1",
  "name": "Source v1",
  "createdAt": "2026-10-22T03:00:00Z",
  "validation": "valid",
  "evidenceComplete": true
}
```

**Lỗi:** `413`, `422` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-analysisjobs"></a>

### 2.7. Danh sách job phân tích theo dự án

**REST đề xuất:** `GET /api/v1/projects/{projectId}/analysis-jobs`  
**Operation / proxy hiện có:** `analysisJobs` → `GET /api/mavis/analysisJobs`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.
- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/projects/project-1/analysis-jobs?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<AnalysisJob>`, `Content-Type: application/json`.

```json
[
  {
    "id": "job-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "status": "completed",
    "progress": 100,
    "modelId": "model-1",
    "message": "Phân tích hoàn tất"
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-startanalysis"></a>

### 2.8. Bắt đầu phân tích

**REST đề xuất:** `POST /api/v1/projects/{projectId}/analysis-jobs`  
**Operation / proxy hiện có:** `startAnalysis` → `POST /api/mavis/startAnalysis`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `StartAnalysisRequest`.

```json
{
  "projectId": "project-1",
  "snapshotId": "snapshot-1"
}
```

```http
POST /api/v1/projects/project-1/analysis-jobs HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 202** — schema `AnalysisJob`, `Content-Type: application/json`.

```json
{
  "id": "job-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "status": "queued",
  "progress": 0,
  "modelId": null,
  "message": "Đã xếp hàng"
}
```

**Lỗi:** `409`, `422` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-analysisjob"></a>

### 2.9. Chi tiết job phân tích

**REST đề xuất:** `GET /api/v1/analysis-jobs/{jobId}`  
**Operation / proxy hiện có:** `analysisJob` → `GET /api/mavis/analysisJob`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `jobId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/analysis-jobs/job-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `AnalysisJob`, `Content-Type: application/json`.

```json
{
  "id": "job-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "status": "completed",
  "progress": 100,
  "modelId": "model-1",
  "message": "Phân tích hoàn tất"
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-models"></a>

### 2.10. Danh sách phiên bản model

**REST đề xuất:** `GET /api/v1/projects/{projectId}/models`  
**Operation / proxy hiện có:** `models` → `GET /api/mavis/models`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.
- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/projects/project-1/models?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Model>`, `Content-Type: application/json`.

```json
[
  {
    "id": "model-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "revision": 1,
    "label": "Architecture v1",
    "elements": [
      {
        "id": "order-service",
        "name": "Order Service",
        "layer": "domain",
        "description": "Xử lý đơn hàng",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ]
      },
      {
        "id": "user-service",
        "name": "User Service",
        "layer": "domain",
        "description": "Quản lý người dùng",
        "evidence": []
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "from": "order-service",
        "to": "user-service",
        "protocol": "HTTP",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ],
        "uncertain": false
      }
    ]
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-model"></a>

### 2.11. Chi tiết model và graph

**REST đề xuất:** `GET /api/v1/models/{modelId}`  
**Operation / proxy hiện có:** `model` → `GET /api/mavis/model`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Graph is embedded in the current frontend schema; large-graph pagination is TBD.

**Request:**

- `modelId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/models/model-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Model`, `Content-Type: application/json`.

```json
{
  "id": "model-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "revision": 1,
  "label": "Architecture v1",
  "elements": [
    {
      "id": "order-service",
      "name": "Order Service",
      "layer": "domain",
      "description": "Xử lý đơn hàng",
      "evidence": [
        {
          "id": "evidence-1",
          "kind": "source",
          "location": "order-service/src/OrderClient.java:42",
          "snippet": "GET http://user-service/api/users",
          "complete": true
        }
      ]
    },
    {
      "id": "user-service",
      "name": "User Service",
      "layer": "domain",
      "description": "Quản lý người dùng",
      "evidence": []
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "order-service",
      "to": "user-service",
      "protocol": "HTTP",
      "evidence": [
        {
          "id": "evidence-1",
          "kind": "source",
          "location": "order-service/src/OrderClient.java:42",
          "snippet": "GET http://user-service/api/users",
          "complete": true
        }
      ],
      "uncertain": false
    }
  ]
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-savemodel"></a>

### 2.12. Tạo revision model

**REST đề xuất:** `POST /api/v1/models/{modelId}/revisions`  
**Operation / proxy hiện có:** `saveModel` → `POST /api/mavis/saveModel`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

expectedRevision là phiên bản đang sửa; trả model có ID mới và revision lớn hơn expectedRevision. Mô tả được trim, dài 1–2000 ký tự.

**Request:**

- `modelId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `SaveModelRequest`.

```json
{
  "modelId": "model-1",
  "expectedRevision": 1,
  "elementId": "order-service",
  "description": "Điều phối đơn hàng"
}
```

```http
POST /api/v1/models/model-1/revisions HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 201** — schema `Model`, `Content-Type: application/json`.

```json
{
  "id": "model-2",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "revision": 2,
  "label": "Architecture v1",
  "elements": [
    {
      "id": "order-service",
      "name": "Order Service",
      "layer": "domain",
      "description": "Điều phối đơn hàng",
      "evidence": [
        {
          "id": "evidence-1",
          "kind": "source",
          "location": "order-service/src/OrderClient.java:42",
          "snippet": "GET http://user-service/api/users",
          "complete": true
        }
      ]
    },
    {
      "id": "user-service",
      "name": "User Service",
      "layer": "domain",
      "description": "Quản lý người dùng",
      "evidence": []
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "from": "order-service",
      "to": "user-service",
      "protocol": "HTTP",
      "evidence": [
        {
          "id": "evidence-1",
          "kind": "source",
          "location": "order-service/src/OrderClient.java:42",
          "snippet": "GET http://user-service/api/users",
          "complete": true
        }
      ],
      "uncertain": false
    }
  ]
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-runtimeconfiguration"></a>

### 2.13. Đọc cấu hình runtime

**REST đề xuất:** `GET /api/v1/projects/{projectId}/runtime-configuration`  
**Operation / proxy hiện có:** `runtimeConfiguration` → `GET /api/mavis/runtimeConfiguration`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/projects/project-1/runtime-configuration HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `RuntimeConfiguration`, `Content-Type: application/json`.

```json
{
  "projectId": "project-1",
  "profileId": "profile-1",
  "supported": true,
  "prerequisites": ["Docker khả dụng"],
  "ready": true,
  "revision": 1
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-saveruntimeconfiguration"></a>

### 2.14. Lưu cấu hình runtime

**REST đề xuất:** `PUT /api/v1/projects/{projectId}/runtime-configuration`  
**Operation / proxy hiện có:** `saveRuntimeConfiguration` → `POST /api/mavis/saveRuntimeConfiguration`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Historical immutable config revision support is required but not represented in the current FE response.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `SaveRuntimeConfigurationRequest`.

```json
{
  "projectId": "project-1",
  "profileId": "profile-1",
  "expectedRevision": 1
}
```

```http
PUT /api/v1/projects/project-1/runtime-configuration HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `RuntimeConfiguration`, `Content-Type: application/json`.

```json
{
  "projectId": "project-1",
  "profileId": "profile-1",
  "supported": true,
  "prerequisites": ["Docker khả dụng"],
  "ready": true,
  "revision": 2
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-scenarios"></a>

### 2.15. Danh sách kịch bản

**REST đề xuất:** `GET /api/v1/projects/{projectId}/scenarios`  
**Operation / proxy hiện có:** `scenarios` → `GET /api/mavis/scenarios`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `projectId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/projects/project-1/scenarios HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Scenario>`, `Content-Type: application/json`.

```json
[
  {
    "id": "scenario-1",
    "projectId": "project-1",
    "name": "Tạo đơn hàng",
    "steps": ["Gửi POST /orders", "Kiểm tra phản hồi"],
    "revision": 1
  }
]
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-savescenario"></a>

### 2.16. Lưu revision kịch bản

**REST đề xuất:** `POST /api/v1/scenarios/{scenarioId}/revisions`  
**Operation / proxy hiện có:** `saveScenario` → `POST /api/mavis/saveScenario`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Historical immutable revisions are required for pinned runtime sessions.

name được trim, dài 1–100; steps có 1–30 mục, mỗi mục trim dài 1–500. Response giữ scenarioId và tăng revision. Việc đọc revision lịch sử chưa có contract.

**Request:**

- `scenarioId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `SaveScenarioRequest`.

```json
{
  "scenarioId": "scenario-1",
  "expectedRevision": 1,
  "name": "Tạo đơn hàng v2",
  "steps": ["Gửi POST /orders", "Kiểm tra phản hồi 201"]
}
```

```http
POST /api/v1/scenarios/scenario-1/revisions HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 201** — schema `Scenario`, `Content-Type: application/json`.

```json
{
  "id": "scenario-1",
  "projectId": "project-1",
  "name": "Tạo đơn hàng v2",
  "steps": ["Gửi POST /orders", "Kiểm tra phản hồi 201"],
  "revision": 2
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-runtimesessions"></a>

### 2.17. Danh sách phiên runtime

**REST đề xuất:** `GET /api/v1/runtime-sessions`  
**Operation / proxy hiện có:** `runtimeSessions` → `GET /api/mavis/runtimeSessions`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: projectId=* is reserved for an explicitly authorized administrative scope.

projectId là query bắt buộc. projectId=* dành cho phạm vi Admin được backend cho phép.

**Request:**

- `projectId` (query, bắt buộc): `string`; độ dài tối thiểu=1.
- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/runtime-sessions?projectId=project-1&page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<RuntimeSession>`, `Content-Type: application/json`.

```json
[
  {
    "id": "runtime-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "scenarioId": "scenario-1",
    "configurationRevision": 1,
    "scenarioRevision": 1,
    "status": "completed",
    "outcome": "passed",
    "approvedAt": "2026-10-22T03:00:00Z",
    "events": [
      {
        "at": "2026-10-22T03:00:00Z",
        "message": "Kịch bản đã hoàn tất"
      }
    ],
    "traces": [
      {
        "id": "trace-1",
        "from": "order-service",
        "to": "user-service",
        "durationMs": 25,
        "uncertain": false
      }
    ]
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-startruntime"></a>

### 2.18. Phê duyệt và bắt đầu runtime

**REST đề xuất:** `POST /api/v1/runtime-sessions`  
**Operation / proxy hiện có:** `startRuntime` → `POST /api/mavis/startRuntime`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Current FE request lacks modelVersionId and executionProfileId; resolve before full parity.

approved bắt buộc đúng true; hai revision là số nguyên dương. Request hiện chưa có modelVersionId hoặc executionProfileId.

**Request:**

Body `application/json`, bắt buộc. Schema: `StartRuntimeRequest`.

```json
{
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "scenarioId": "scenario-1",
  "configurationRevision": 1,
  "scenarioRevision": 1,
  "approved": true
}
```

```http
POST /api/v1/runtime-sessions HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 202** — schema `RuntimeSession`, `Content-Type: application/json`.

```json
{
  "id": "runtime-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "scenarioId": "scenario-1",
  "configurationRevision": 1,
  "scenarioRevision": 1,
  "status": "running",
  "outcome": "pending",
  "approvedAt": "2026-10-22T03:00:00Z",
  "events": [
    {
      "at": "2026-10-22T03:00:00Z",
      "message": "Đã khởi chạy"
    }
  ],
  "traces": []
}
```

**Lỗi:** `409`, `422` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-runtimesession"></a>

### 2.19. Chi tiết phiên runtime

**REST đề xuất:** `GET /api/v1/runtime-sessions/{sessionId}`  
**Operation / proxy hiện có:** `runtimeSession` → `GET /api/mavis/runtimeSession`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `sessionId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/runtime-sessions/runtime-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `RuntimeSession`, `Content-Type: application/json`.

```json
{
  "id": "runtime-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "scenarioId": "scenario-1",
  "configurationRevision": 1,
  "scenarioRevision": 1,
  "status": "completed",
  "outcome": "passed",
  "approvedAt": "2026-10-22T03:00:00Z",
  "events": [
    {
      "at": "2026-10-22T03:00:00Z",
      "message": "Kịch bản đã hoàn tất"
    }
  ],
  "traces": [
    {
      "id": "trace-1",
      "from": "order-service",
      "to": "user-service",
      "durationMs": 25,
      "uncertain": false
    }
  ]
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-stopruntime"></a>

### 2.20. Hủy hoặc kết thúc phiên runtime

**REST đề xuất:** `POST /api/v1/runtime-sessions/{sessionId}/actions`  
**Operation / proxy hiện có:** `stopRuntime` → `POST /api/mavis/stopRuntime`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

action chỉ nhận cancel hoặc terminate. Đây là kết quả của một yêu cầu hành động lên phiên đang phù hợp trạng thái, không phải chạy lại phiên đã hoàn tất.

**Request:**

- `sessionId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `StopRuntimeRequest`.

```json
{
  "sessionId": "runtime-1",
  "action": "cancel"
}
```

```http
POST /api/v1/runtime-sessions/runtime-1/actions HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `RuntimeSession`, `Content-Type: application/json`.

```json
{
  "id": "runtime-1",
  "projectId": "project-1",
  "snapshotId": "snapshot-1",
  "scenarioId": "scenario-1",
  "configurationRevision": 1,
  "scenarioRevision": 1,
  "status": "cancelled",
  "outcome": "unknown",
  "approvedAt": "2026-10-22T03:00:00Z",
  "events": [
    {
      "at": "2026-10-22T03:00:00Z",
      "message": "Đã hủy phiên chạy"
    }
  ],
  "traces": [
    {
      "id": "trace-1",
      "from": "order-service",
      "to": "user-service",
      "durationMs": 25,
      "uncertain": false
    }
  ]
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-impact"></a>

### 2.21. Phân tích ảnh hưởng

**REST đề xuất:** `POST /api/v1/models/{modelId}/impact-analyses`  
**Operation / proxy hiện có:** `impact` → `GET /api/mavis/impact`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Results describe potential impact, not guaranteed runtime failure.

Frontend đánh dấu impact là truy vấn: proxy dùng GET, trong khi REST draft dùng POST. Cần sửa/viết adapter riêng; cấu hình mapping hiện tại sẽ từ chối POST upstream cho operation này.

**Request:**

- `modelId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `ImpactRequest`.

```json
{
  "modelId": "model-1",
  "targetId": "user-service"
}
```

```http
POST /api/v1/models/model-1/impact-analyses HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Impact`, `Content-Type: application/json`.

```json
{
  "modelId": "model-1",
  "targetId": "user-service",
  "paths": [["order-service", "user-service"]],
  "limitations": "Suy luận từ các dependency đã phát hiện; không bảo đảm lỗi sẽ xảy ra."
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-explain"></a>

### 2.22. Giải thích phần tử kiến trúc

**REST đề xuất:** `POST /api/v1/models/{modelId}/elements/{elementId}/explanations`  
**Operation / proxy hiện có:** `explain` → `POST /api/mavis/explain`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: AI output is explanatory only and must not mutate the model or expose secrets.

**Request:**

- `modelId` (path, bắt buộc): `string`; độ dài tối thiểu=1.
- `elementId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `ExplainRequest`.

```json
{
  "modelId": "model-1",
  "elementId": "order-service"
}
```

```http
POST /api/v1/models/model-1/elements/order-service/explanations HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Explanation`, `Content-Type: application/json`.

```json
{
  "id": "explanation-1",
  "modelId": "model-1",
  "elementId": "order-service",
  "text": "Order Service gọi User Service qua HTTP.",
  "evidenceIds": ["evidence-1"],
  "sample": true
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-workspaces"></a>

### 2.23. Danh sách workspace

**REST đề xuất:** `GET /api/v1/workspaces`  
**Operation / proxy hiện có:** `workspaces` → `GET /api/mavis/workspaces`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

Không có request body.

```http
GET /api/v1/workspaces HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Workspace>`, `Content-Type: application/json`.

```json
[
  {
    "id": "workspace-1",
    "name": "SE Capstone",
    "members": [
      {
        "id": "student-1",
        "name": "Nguyễn An",
        "role": "student"
      }
    ]
  }
]
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-assignments"></a>

### 2.24. Danh sách bài tập

**REST đề xuất:** `GET /api/v1/workspaces/{workspaceId}/assignments`  
**Operation / proxy hiện có:** `assignments` → `GET /api/mavis/assignments`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `workspaceId` (path, bắt buộc): `string`; độ dài tối thiểu=1.
- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/workspaces/workspace-1/assignments?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Assignment>`, `Content-Type: application/json`.

```json
[
  {
    "id": "assignment-1",
    "workspaceId": "workspace-1",
    "title": "Phân tích kiến trúc microservices",
    "instructions": "Nộp phiên bản source và model tương ứng.",
    "dueAt": "2026-10-30T16:59:00Z"
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-referenceversions"></a>

### 2.25. Danh sách phiên bản tham chiếu

**REST đề xuất:** `GET /api/v1/workspaces/{workspaceId}/reference-versions`  
**Operation / proxy hiện có:** `referenceVersions` → `GET /api/mavis/referenceVersions`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `workspaceId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/workspaces/workspace-1/reference-versions HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<ReferenceVersion>`, `Content-Type: application/json`.

```json
[
  {
    "id": "reference-1",
    "workspaceId": "workspace-1",
    "snapshot": {
      "id": "snapshot-1",
      "projectId": "project-1",
      "name": "Source v1",
      "createdAt": "2026-10-22T03:00:00Z",
      "validation": "valid",
      "evidenceComplete": true
    },
    "model": {
      "id": "model-1",
      "projectId": "project-1",
      "snapshotId": "snapshot-1",
      "revision": 1,
      "label": "Architecture v1",
      "elements": [
        {
          "id": "order-service",
          "name": "Order Service",
          "layer": "domain",
          "description": "Xử lý đơn hàng",
          "evidence": [
            {
              "id": "evidence-1",
              "kind": "source",
              "location": "order-service/src/OrderClient.java:42",
              "snippet": "GET http://user-service/api/users",
              "complete": true
            }
          ]
        },
        {
          "id": "user-service",
          "name": "User Service",
          "layer": "domain",
          "description": "Quản lý người dùng",
          "evidence": []
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "from": "order-service",
          "to": "user-service",
          "protocol": "HTTP",
          "evidence": [
            {
              "id": "evidence-1",
              "kind": "source",
              "location": "order-service/src/OrderClient.java:42",
              "snippet": "GET http://user-service/api/users",
              "complete": true
            }
          ],
          "uncertain": false
        }
      ]
    }
  }
]
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-submissions"></a>

### 2.26. Danh sách bài nộp

**REST đề xuất:** `GET /api/v1/submissions`  
**Operation / proxy hiện có:** `submissions` → `GET /api/mavis/submissions`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/submissions?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Submission>`, `Content-Type: application/json`.

```json
[
  {
    "id": "submission-1",
    "assignmentId": "assignment-1",
    "studentId": "student-1",
    "submittedAt": "2026-10-22T03:00:00Z",
    "model": {
      "id": "model-1",
      "projectId": "project-1",
      "snapshotId": "snapshot-1",
      "revision": 1,
      "label": "Architecture v1",
      "elements": [
        {
          "id": "order-service",
          "name": "Order Service",
          "layer": "domain",
          "description": "Xử lý đơn hàng",
          "evidence": [
            {
              "id": "evidence-1",
              "kind": "source",
              "location": "order-service/src/OrderClient.java:42",
              "snippet": "GET http://user-service/api/users",
              "complete": true
            }
          ]
        },
        {
          "id": "user-service",
          "name": "User Service",
          "layer": "domain",
          "description": "Quản lý người dùng",
          "evidence": []
        }
      ],
      "edges": [
        {
          "id": "edge-1",
          "from": "order-service",
          "to": "user-service",
          "protocol": "HTTP",
          "evidence": [
            {
              "id": "evidence-1",
              "kind": "source",
              "location": "order-service/src/OrderClient.java:42",
              "snippet": "GET http://user-service/api/users",
              "complete": true
            }
          ],
          "uncertain": false
        }
      ]
    },
    "snapshot": {
      "id": "snapshot-1",
      "projectId": "project-1",
      "name": "Source v1",
      "createdAt": "2026-10-22T03:00:00Z",
      "validation": "valid",
      "evidenceComplete": true
    },
    "runtime": {
      "id": "runtime-1",
      "projectId": "project-1",
      "snapshotId": "snapshot-1",
      "scenarioId": "scenario-1",
      "configurationRevision": 1,
      "scenarioRevision": 1,
      "status": "completed",
      "outcome": "passed",
      "approvedAt": "2026-10-22T03:00:00Z",
      "events": [
        {
          "at": "2026-10-22T03:00:00Z",
          "message": "Kịch bản đã hoàn tất"
        }
      ],
      "traces": [
        {
          "id": "trace-1",
          "from": "order-service",
          "to": "user-service",
          "durationMs": 25,
          "uncertain": false
        }
      ]
    },
    "feedback": []
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-submit"></a>

### 2.27. Nộp bài

**REST đề xuất:** `POST /api/v1/submissions`  
**Operation / proxy hiện có:** `submit` → `POST /api/mavis/submit`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

Body `application/json`, bắt buộc. Schema: `SubmitRequest`.

```json
{
  "assignmentId": "assignment-1",
  "modelId": "model-1",
  "snapshotId": "snapshot-1",
  "runtimeSessionId": "runtime-1"
}
```

```http
POST /api/v1/submissions HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 201** — schema `Submission`, `Content-Type: application/json`.

```json
{
  "id": "submission-1",
  "assignmentId": "assignment-1",
  "studentId": "student-1",
  "submittedAt": "2026-10-22T03:00:00Z",
  "model": {
    "id": "model-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "revision": 1,
    "label": "Architecture v1",
    "elements": [
      {
        "id": "order-service",
        "name": "Order Service",
        "layer": "domain",
        "description": "Xử lý đơn hàng",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ]
      },
      {
        "id": "user-service",
        "name": "User Service",
        "layer": "domain",
        "description": "Quản lý người dùng",
        "evidence": []
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "from": "order-service",
        "to": "user-service",
        "protocol": "HTTP",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ],
        "uncertain": false
      }
    ]
  },
  "snapshot": {
    "id": "snapshot-1",
    "projectId": "project-1",
    "name": "Source v1",
    "createdAt": "2026-10-22T03:00:00Z",
    "validation": "valid",
    "evidenceComplete": true
  },
  "runtime": {
    "id": "runtime-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "scenarioId": "scenario-1",
    "configurationRevision": 1,
    "scenarioRevision": 1,
    "status": "completed",
    "outcome": "passed",
    "approvedAt": "2026-10-22T03:00:00Z",
    "events": [
      {
        "at": "2026-10-22T03:00:00Z",
        "message": "Kịch bản đã hoàn tất"
      }
    ],
    "traces": [
      {
        "id": "trace-1",
        "from": "order-service",
        "to": "user-service",
        "durationMs": 25,
        "uncertain": false
      }
    ]
  },
  "feedback": []
}
```

**Lỗi:** `409`, `422` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-submission"></a>

### 2.28. Chi tiết bài nộp

**REST đề xuất:** `GET /api/v1/submissions/{submissionId}`  
**Operation / proxy hiện có:** `submission` → `GET /api/mavis/submission`  
**Vai trò đề xuất:** `student`, `individual-learner-tbd`, `lecturer`, `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `submissionId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Không có request body.

```http
GET /api/v1/submissions/submission-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Submission`, `Content-Type: application/json`.

```json
{
  "id": "submission-1",
  "assignmentId": "assignment-1",
  "studentId": "student-1",
  "submittedAt": "2026-10-22T03:00:00Z",
  "model": {
    "id": "model-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "revision": 1,
    "label": "Architecture v1",
    "elements": [
      {
        "id": "order-service",
        "name": "Order Service",
        "layer": "domain",
        "description": "Xử lý đơn hàng",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ]
      },
      {
        "id": "user-service",
        "name": "User Service",
        "layer": "domain",
        "description": "Quản lý người dùng",
        "evidence": []
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "from": "order-service",
        "to": "user-service",
        "protocol": "HTTP",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ],
        "uncertain": false
      }
    ]
  },
  "snapshot": {
    "id": "snapshot-1",
    "projectId": "project-1",
    "name": "Source v1",
    "createdAt": "2026-10-22T03:00:00Z",
    "validation": "valid",
    "evidenceComplete": true
  },
  "runtime": {
    "id": "runtime-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "scenarioId": "scenario-1",
    "configurationRevision": 1,
    "scenarioRevision": 1,
    "status": "completed",
    "outcome": "passed",
    "approvedAt": "2026-10-22T03:00:00Z",
    "events": [
      {
        "at": "2026-10-22T03:00:00Z",
        "message": "Kịch bản đã hoàn tất"
      }
    ],
    "traces": [
      {
        "id": "trace-1",
        "from": "order-service",
        "to": "user-service",
        "durationMs": 25,
        "uncertain": false
      }
    ]
  },
  "feedback": []
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-feedback"></a>

### 2.29. Thêm nhận xét

**REST đề xuất:** `POST /api/v1/submissions/{submissionId}/feedback`  
**Operation / proxy hiện có:** `feedback` → `POST /api/mavis/feedback`  
**Vai trò đề xuất:** `lecturer`. `individual-learner-tbd` chưa phải role trong enum frontend.

text được trim, dài 1–5000; modelId phải là model trong bài nộp.

**Request:**

- `submissionId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `FeedbackRequest`.

```json
{
  "submissionId": "submission-1",
  "modelId": "model-1",
  "text": "Cần bổ sung giải thích dependency."
}
```

```http
POST /api/v1/submissions/submission-1/feedback HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Submission`, `Content-Type: application/json`.

```json
{
  "id": "submission-1",
  "assignmentId": "assignment-1",
  "studentId": "student-1",
  "submittedAt": "2026-10-22T03:00:00Z",
  "model": {
    "id": "model-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "revision": 1,
    "label": "Architecture v1",
    "elements": [
      {
        "id": "order-service",
        "name": "Order Service",
        "layer": "domain",
        "description": "Xử lý đơn hàng",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ]
      },
      {
        "id": "user-service",
        "name": "User Service",
        "layer": "domain",
        "description": "Quản lý người dùng",
        "evidence": []
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "from": "order-service",
        "to": "user-service",
        "protocol": "HTTP",
        "evidence": [
          {
            "id": "evidence-1",
            "kind": "source",
            "location": "order-service/src/OrderClient.java:42",
            "snippet": "GET http://user-service/api/users",
            "complete": true
          }
        ],
        "uncertain": false
      }
    ]
  },
  "snapshot": {
    "id": "snapshot-1",
    "projectId": "project-1",
    "name": "Source v1",
    "createdAt": "2026-10-22T03:00:00Z",
    "validation": "valid",
    "evidenceComplete": true
  },
  "runtime": {
    "id": "runtime-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "scenarioId": "scenario-1",
    "configurationRevision": 1,
    "scenarioRevision": 1,
    "status": "completed",
    "outcome": "passed",
    "approvedAt": "2026-10-22T03:00:00Z",
    "events": [
      {
        "at": "2026-10-22T03:00:00Z",
        "message": "Kịch bản đã hoàn tất"
      }
    ],
    "traces": [
      {
        "id": "trace-1",
        "from": "order-service",
        "to": "user-service",
        "durationMs": 25,
        "uncertain": false
      }
    ]
  },
  "feedback": [
    {
      "id": "feedback-1",
      "text": "Cần bổ sung giải thích dependency.",
      "createdAt": "2026-10-22T03:00:00Z",
      "authorId": "lecturer-1"
    }
  ]
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-accounts"></a>

### 2.30. Danh sách tài khoản

**REST đề xuất:** `GET /api/v1/admin/accounts`  
**Operation / proxy hiện có:** `accounts` → `GET /api/mavis/accounts`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/admin/accounts?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Account>`, `Content-Type: application/json`.

```json
[
  {
    "id": "student-1",
    "name": "Nguyễn An",
    "role": "student",
    "locked": false
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-setaccountlock"></a>

### 2.31. Khóa hoặc mở khóa tài khoản

**REST đề xuất:** `PATCH /api/v1/admin/accounts/{accountId}/lock`  
**Operation / proxy hiện có:** `setAccountLock` → `POST /api/mavis/setAccountLock`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Account concurrency token is not present in the current FE request; policy remains TBD.

Chưa có expectedRevision cho khóa tài khoản.

**Request:**

- `accountId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `SetAccountLockRequest`.

```json
{
  "accountId": "student-1",
  "locked": true
}
```

```http
PATCH /api/v1/admin/accounts/student-1/lock HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Account`, `Content-Type: application/json`.

```json
{
  "id": "student-1",
  "name": "Nguyễn An",
  "role": "student",
  "locked": true
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-integrations"></a>

### 2.32. Danh sách tích hợp

**REST đề xuất:** `GET /api/v1/admin/integrations`  
**Operation / proxy hiện có:** `integrations` → `GET /api/mavis/integrations`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

Không có request body.

```http
GET /api/v1/admin/integrations HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Integration>`, `Content-Type: application/json`.

```json
[
  {
    "id": "integration-1",
    "name": "AI provider",
    "enabled": false,
    "revision": 1
  }
]
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-configureintegration"></a>

### 2.33. Bật hoặc tắt tích hợp

**REST đề xuất:** `PATCH /api/v1/admin/integrations/{integrationId}`  
**Operation / proxy hiện có:** `configureIntegration` → `POST /api/mavis/configureIntegration`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Credential editing and connection testing are not in the current frontend.

**Request:**

- `integrationId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `ConfigureIntegrationRequest`.

```json
{
  "integrationId": "integration-1",
  "enabled": true,
  "expectedRevision": 1
}
```

```http
PATCH /api/v1/admin/integrations/integration-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Integration`, `Content-Type: application/json`.

```json
{
  "id": "integration-1",
  "name": "AI provider",
  "enabled": true,
  "revision": 2
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-profiles"></a>

### 2.34. Danh sách runtime profile

**REST đề xuất:** `GET /api/v1/admin/runtime-profiles`  
**Operation / proxy hiện có:** `profiles` → `GET /api/mavis/profiles`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

Không có request body.

```http
GET /api/v1/admin/runtime-profiles HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<Profile>`, `Content-Type: application/json`.

```json
[
  {
    "id": "profile-1",
    "name": "Docker Compose",
    "enabled": true,
    "revision": 1
  }
]
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-configureprofile"></a>

### 2.35. Bật hoặc tắt runtime profile

**REST đề xuất:** `PATCH /api/v1/admin/runtime-profiles/{profileId}`  
**Operation / proxy hiện có:** `configureProfile` → `POST /api/mavis/configureProfile`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Profile CRUD and validation/test operations are outside the current frontend contract.

**Request:**

- `profileId` (path, bắt buộc): `string`; độ dài tối thiểu=1.

Body `application/json`, bắt buộc. Schema: `ConfigureProfileRequest`.

```json
{
  "profileId": "profile-1",
  "enabled": false,
  "expectedRevision": 1
}
```

```http
PATCH /api/v1/admin/runtime-profiles/profile-1 HTTP/1.1
Host: localhost:8080
Accept: application/json
Content-Type: application/json
```

**Response đề xuất HTTP 200** — schema `Profile`, `Content-Type: application/json`.

```json
{
  "id": "profile-1",
  "name": "Docker Compose",
  "enabled": false,
  "revision": 2
}
```

**Lỗi:** `409` được ghi riêng trong OpenAPI; `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-audit"></a>

### 2.36. Danh sách bản ghi audit

**REST đề xuất:** `GET /api/v1/admin/audit-records`  
**Operation / proxy hiện có:** `audit` → `GET /api/mavis/audit`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/admin/audit-records?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<AuditRecord>`, `Content-Type: application/json`.

```json
[
  {
    "id": "audit-1",
    "at": "2026-10-22T03:00:00Z",
    "action": "ACCOUNT_LOCKED",
    "actorId": "admin-1",
    "resourceId": "student-1"
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-adminjobs"></a>

### 2.37. Danh sách toàn bộ job phân tích

**REST đề xuất:** `GET /api/v1/admin/analysis-jobs`  
**Operation / proxy hiện có:** `adminJobs` → `GET /api/mavis/adminJobs`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

**Request:**

- `page` (query, tùy chọn): `number`; min=0; mặc định=0. Proposed zero-based page index; current FE does not send this parameter..
- `size` (query, tùy chọn): `number`; min=1; mặc định=50. Proposed page size; server maximum remains TBD..

Không có request body.

```http
GET /api/v1/admin/analysis-jobs?page=0&size=50 HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `Array<AnalysisJob>`, `Content-Type: application/json`.

```json
[
  {
    "id": "job-1",
    "projectId": "project-1",
    "snapshotId": "snapshot-1",
    "status": "completed",
    "progress": 100,
    "modelId": "model-1",
    "message": "Phân tích hoàn tất"
  }
]
```

Header phân trang đề xuất: `Link`, `X-Total-Count`. Proxy hiện chưa chuyển tiếp các header này.

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

<a id="public-platformsummary"></a>

### 2.38. Tổng quan nền tảng

**REST đề xuất:** `GET /api/v1/admin/platform-summary`  
**Operation / proxy hiện có:** `platformSummary` → `GET /api/mavis/platformSummary`  
**Vai trò đề xuất:** `admin`. `individual-learner-tbd` chưa phải role trong enum frontend.

Ghi chú OpenAPI: Health may be available/degraded only when backed by real probes; otherwise unknown.

health=available/degraded chỉ hợp lệ khi có telemetry thực; ví dụ dùng unknown.

**Request:**

Không có request body.

```http
GET /api/v1/admin/platform-summary HTTP/1.1
Host: localhost:8080
Accept: application/json
```

**Response đề xuất HTTP 200** — schema `PlatformSummary`, `Content-Type: application/json`.

```json
{
  "health": "unknown",
  "message": "Ví dụ minh họa; chưa có telemetry thực tế.",
  "projects": 1,
  "users": 3,
  "runningSessions": 0,
  "analysisJobs": 1
}
```

**Lỗi:** `default` dùng `ApiError` (mục 4). Các mã lỗi chung trong mục 4 là quy ước đề xuất theo điều kiện, không phải mọi endpoint đều trả toàn bộ mã.

## 3. Toàn bộ schema public request/response

Các kiểu sau phản ánh toàn bộ `components.schemas` của OpenAPI draft. Field không có `?` là bắt buộc theo draft; phần lớn object không chấp nhận field ngoài schema. Zod frontend hiện có thể strip field ngoài schema, vì vậy đây không phải khẳng định backend đã enforce draft. Số nguyên được biểu diễn bằng `number` kèm comment `số nguyên`.

### `Ok`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Ok = {
  ok: true;
};
```

### `Session`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Session = {
  user: UserIdentity | null;
};
```

### `UserIdentity`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type UserIdentity = {
  id: string;
  name: string;
  role: Role;
};
```

### `Role`

```typescript
type Role = "student" | "lecturer" | "admin";
```

### `Project`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Project = {
  id: string;
  name: string;
  repository: string;
  status: "ready" | "processing" | "failed";
  // số nguyên; min=0
  services: number;
  runtimeSupported: boolean;
};
```

### `Snapshot`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Snapshot = {
  // Stable opaque immutable snapshot ID; never a filesystem path.
  id: string;
  projectId: string;
  name: string;
  // format="date-time"
  createdAt: string;
  validation: "valid" | "invalid" | "unsupported";
  evidenceComplete: boolean;
};
```

### `AnalysisJob`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type AnalysisJob = {
  id: string;
  projectId: string;
  snapshotId: string;
  status: "queued" | "processing" | "completed" | "failed";
  // min=0; max=100
  progress: number;
  modelId: string | null;
  message: string;
};
```

### `StartAnalysisRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type StartAnalysisRequest = {
  projectId: string;
  snapshotId: string;
};
```

### `Evidence`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Evidence = {
  // Stable evidence ID, not an unstable server path.
  id: string;
  kind: "source" | "runtime";
  // Safe, non-secret logical source location.
  location: string;
  // Sanitized evidence excerpt.
  snippet: string;
  complete: boolean;
};
```

### `Element`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Element = {
  id: string;
  name: string;
  layer: "edge" | "domain" | "platform" | "data";
  description: string;
  evidence: Array<Evidence>;
};
```

### `Edge`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Edge = {
  id: string;
  from: string;
  to: string;
  protocol: string;
  evidence: Array<Evidence>;
  uncertain: boolean;
};
```

### `Model`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Model = {
  // Immutable model revision ID.
  id: string;
  projectId: string;
  snapshotId: string;
  // số nguyên; min=1
  revision: number;
  label: string;
  elements: Array<Element>;
  edges: Array<Edge>;
};
```

### `SaveModelRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type SaveModelRequest = {
  modelId: string;
  // số nguyên; min=1
  expectedRevision: number;
  elementId: string;
  // độ dài tối thiểu=1; độ dài tối đa=2000
  description: string;
};
```

### `RuntimeConfiguration`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type RuntimeConfiguration = {
  projectId: string;
  profileId: string;
  supported: boolean;
  prerequisites: Array<string>;
  ready: boolean;
  // số nguyên; min=1
  revision: number;
};
```

### `SaveRuntimeConfigurationRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type SaveRuntimeConfigurationRequest = {
  projectId: string;
  profileId: string;
  // số nguyên; min=1
  expectedRevision: number;
};
```

### `Scenario`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Scenario = {
  id: string;
  projectId: string;
  name: string;
  // số phần tử tối thiểu=1
  steps: Array<string>;
  // số nguyên; min=1
  revision: number;
};
```

### `SaveScenarioRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type SaveScenarioRequest = {
  scenarioId: string;
  // số nguyên; min=1
  expectedRevision: number;
  // độ dài tối thiểu=1; độ dài tối đa=100
  name: string;
  // số phần tử tối thiểu=1; số phần tử tối đa=30
  steps: Array<string>;
};
```

### `StartRuntimeRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type StartRuntimeRequest = {
  projectId: string;
  snapshotId: string;
  scenarioId: string;
  // số nguyên; min=1
  configurationRevision: number;
  // số nguyên; min=1
  scenarioRevision: number;
  approved: true;
  // Required by the target immutable-run policy but absent from current FE request; TBD.
  modelVersionId?: string;
  // Required by the target immutable-run policy but absent from current FE request; TBD.
  executionProfileId?: string;
};
```

### `RuntimeSession`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type RuntimeSession = {
  id: string;
  projectId: string;
  snapshotId: string;
  scenarioId: string;
  // số nguyên; min=1
  configurationRevision: number;
  // số nguyên; min=1
  scenarioRevision: number;
  status: "running" | "completed" | "failed" | "cancelled" | "terminated";
  outcome: "pending" | "passed" | "failed" | "unknown";
  // format="date-time"
  approvedAt: string;
  events: Array<{
    // format="date-time"
    at: string;
    message: string;
  }>;
  traces: Array<{
    id: string;
    from: string;
    to: string;
    // min=0
    durationMs: number;
    uncertain: boolean;
  }>;
};
```

### `StopRuntimeRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type StopRuntimeRequest = {
  sessionId: string;
  action: "cancel" | "terminate";
};
```

### `ImpactRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type ImpactRequest = {
  modelId: string;
  targetId: string;
};
```

### `Impact`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Impact = {
  modelId: string;
  targetId: string;
  paths: Array<Array<string>>;
  limitations: string;
};
```

### `ExplainRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type ExplainRequest = {
  modelId: string;
  elementId: string;
};
```

### `Explanation`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Explanation = {
  id: string;
  modelId: string;
  elementId: string;
  text: string;
  evidenceIds: Array<string>;
  sample: boolean;
};
```

### `Workspace`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Workspace = {
  id: string;
  name: string;
  members: Array<{
    id: string;
    name: string;
    role: string;
  }>;
};
```

### `Assignment`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Assignment = {
  id: string;
  workspaceId: string;
  title: string;
  instructions: string;
  // format="date-time"
  dueAt: string;
};
```

### `ReferenceVersion`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type ReferenceVersion = {
  id: string;
  workspaceId: string;
  snapshot: Snapshot;
  model: Model;
};
```

### `Submission`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Submission = {
  id: string;
  assignmentId: string;
  studentId: string;
  // format="date-time"
  submittedAt: string;
  model: Model;
  snapshot: Snapshot;
  runtime: RuntimeSession | null;
  feedback: Array<Feedback>;
};
```

### `SubmitRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type SubmitRequest = {
  assignmentId: string;
  modelId: string;
  snapshotId: string;
  runtimeSessionId: string | null;
};
```

### `FeedbackRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type FeedbackRequest = {
  submissionId: string;
  modelId: string;
  // độ dài tối thiểu=1; độ dài tối đa=5000
  text: string;
};
```

### `Feedback`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Feedback = {
  id: string;
  text: string;
  // format="date-time"
  createdAt: string;
  authorId: string;
};
```

### `Account`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Account = {
  id: string;
  name: string;
  role: Role;
  locked: boolean;
};
```

### `SetAccountLockRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type SetAccountLockRequest = {
  accountId: string;
  locked: boolean;
};
```

### `Integration`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Integration = {
  id: string;
  name: string;
  enabled: boolean;
  // số nguyên; min=1
  revision: number;
};
```

### `ConfigureIntegrationRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type ConfigureIntegrationRequest = {
  integrationId: string;
  enabled: boolean;
  // số nguyên; min=1
  expectedRevision: number;
};
```

### `Profile`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type Profile = {
  id: string;
  name: string;
  enabled: boolean;
  // số nguyên; min=1
  revision: number;
};
```

### `ConfigureProfileRequest`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type ConfigureProfileRequest = {
  profileId: string;
  enabled: boolean;
  // số nguyên; min=1
  expectedRevision: number;
};
```

### `AuditRecord`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type AuditRecord = {
  id: string;
  // format="date-time"
  at: string;
  action: string;
  actorId: string;
  resourceId: string;
};
```

### `PlatformSummary`

Object không nhận field ngoài schema trong OpenAPI draft.

```typescript
type PlatformSummary = {
  health: "available" | "degraded" | "unknown";
  message: string;
  // số nguyên; min=0
  projects: number;
  // số nguyên; min=0
  users: number;
  // số nguyên; min=0
  runningSessions: number;
  // số nguyên; min=0
  analysisJobs: number;
};
```

### `ApiError`

```typescript
type ApiError = {
  // format="uri"
  type: string;
  title: string;
  // số nguyên
  status: number;
  code: string;
  detail?: string;
  fieldErrors?: Array<{
    field: string;
    code: string;
    message: string;
  }>;
  requestId: string;
};
```

### Các ràng buộc bổ sung từ frontend

- Các ID trong request là chuỗi không rỗng; không mặc định yêu cầu UUID cho public draft.
- Các revision gửi lên là số nguyên dương. `name`, `description`, `steps[]`, `text` trong các mutation được trim theo `contracts.ts`.
- `Model`: ID phần tử và ID cạnh phải duy nhất; `edge.from`/`edge.to` phải tồn tại trong `elements`.
- `Submission`: `model`, `snapshot` và `runtime` nếu có phải thuộc cùng project và snapshot; request submit/feedback phải khớp model được trả về.
- Response phải khớp ID/project/workspace/assignment/snapshot/scenario/model/element/target và các revision có trong request theo `validate-response.ts`. Save model phải tạo ID mới và revision tăng.
- Runtime `approved` phải đúng `true`; `runtimeSessionId` của submit là field bắt buộc, được phép null.
- Upload input frontend gồm `projectId`, `name`, `fileName`, `size`, `archive: Blob`; fileName phải kết thúc .zip, size trong (0, 209715200], proxy còn so size với số byte Blob thực. Wire REST upload dùng file/projectId/name, không dùng JSON archive.

## 4. Lỗi public đề xuất

Đây là error contract **chưa được triển khai**. `Content-Type: application/problem+json`; schema `ApiError`. `type`, `title`, `status`, `code`, `requestId` bắt buộc; `detail` và `fieldErrors` tùy chọn. Ví dụ HTTP 409:

```json
{
  "type": "https://example.invalid/problems/revision-conflict",
  "title": "Revision conflict",
  "status": 409,
  "code": "REVISION_CONFLICT",
  "detail": "expectedRevision không khớp phiên bản hiện tại.",
  "fieldErrors": [
    {
      "field": "expectedRevision",
      "code": "STALE_REVISION",
      "message": "Tải lại phiên bản mới nhất."
    }
  ],
  "requestId": "request-demo-1"
}
```

- `400`: cú pháp request không hợp lệ.
- `401`: không có phiên hợp lệ. Riêng lookup session frontend có thể chuyển 401 thành `{user:null}`.
- `403`: không có quyền với tài nguyên/hành động.
- `404`: không tìm thấy tài nguyên.
- `409`: revision cũ, chuyển trạng thái trùng hoặc tham chiếu phiên bản không khớp.
- `413`: vượt giới hạn upload/body đã cấu hình.
- `422`: dữ liệu đúng cú pháp nhưng không đạt validation/nghiệp vụ.
- `429`: quá giới hạn, đề xuất có header `Retry-After`.
- `500`: lỗi server.
- `503`: dịch vụ/phụ thuộc tạm không khả dụng, đề xuất có `Retry-After` khi biết thời điểm.

Response lỗi này khác `SpringError`, `WorkerError` và lỗi proxy hiện tại. Frontend hiện chỉ xử lý HTTP status và thông báo tổng quát; không parse `ApiError` của backend.

## 5. Proxy Next.js hiện có — cách gọi từ trình duyệt

Route vật lý: [app/api/mavis/[operation]/route.ts](../../app/api/mavis/%5Boperation%5D/route.ts). Chỉ export GET và POST. Các operation và response tương ứng đã liệt kê ở mục 2; proxy không phải 38 implementation nghiệp vụ phía backend. Cần `MAVIS_API_MODE=backend`, `MAVIS_BACKEND_URL`, `MAVIS_SESSION_COOKIES` và mapping `MAVIS_API_OPERATIONS` hợp lệ. Mock là chế độ mặc định; proxy không chạy business mock.

### 5.1. GET operation

Input nằm trong một query tên `input`, là JSON đã URL-encode. Không gửi JSON body. Ví dụ:

```http
GET /api/mavis/project?input=%7B%22projectId%22%3A%22project-1%22%7D HTTP/1.1
Accept: application/json
```

Tương đương input frontend:

```json
{
  "projectId": "project-1"
}
```

Với input rỗng: `/api/mavis/projects?input=%7B%7D`. Proxy flatten input thành query của upstream; không nội suy tham số path.

### 5.2. POST operation

Mọi mutation dùng POST ở chặng browser → proxy, kể cả khi REST upstream đề xuất PUT/PATCH. JSON body là request của operation trong mục 2. Header `Origin` phải đúng origin của ứng dụng; cookie phiên được chuyển tiếp theo allowlist.

```http
POST /api/mavis/saveRuntimeConfiguration HTTP/1.1
Content-Type: application/json
Origin: https://app.example.invalid
```

```json
{
  "projectId": "project-1",
  "profileId": "profile-1",
  "expectedRevision": 1
}
```

URL origin trên chỉ là ví dụ; khi sử dụng phải thay bằng origin thực của frontend.

### 5.3. Upload qua proxy

`POST /api/mavis/importSource`, `multipart/form-data` gồm:

- `file`: Blob/file ZIP thực.
- `input`: chuỗi JSON metadata sau:

```json
{
  "projectId": "project-1",
  "name": "Source v1",
  "fileName": "source-demo.zip",
  "size": 12345
}
```

`size` phải bằng đúng số byte file gửi lên. Proxy đổi thành multipart `file`, `projectId`, `name` cho upstream. Response thành công có schema `Snapshot`.

### 5.4. Response và lỗi proxy

- Thành công trả **HTTP 200** và raw JSON đã được validate; proxy không giữ nguyên 201/202 từ upstream.
- Lỗi do handler `fail()` tạo trả `application/json`, `Cache-Control: no-store` và body:

```json
{
  "error": "Request unavailable"
}
```

- `400`: không đọc được JSON/multipart input.
- `403`: mutation có Origin sai/thiếu.
- `405`: dùng GET cho mutation hoặc POST cho query khi backend mode đang hoạt động; method không được route export có thể do framework xử lý riêng.
- `422`: input không khớp schema hoặc size upload không khớp Blob.
- `501`: chưa backend mode, operation không hợp lệ, mockLogin, cấu hình/mapping/base URL không hợp lệ/thiếu, hoặc method upstream không phù hợp loại operation.
- `400/401/403/404/409/422/429` từ upstream được giữ HTTP status, nhưng body đổi thành thông báo tổng quát bên trên.
- `502`: lỗi upstream khác, response không phải JSON, schema/ID sai hoặc fetch lỗi. Ví dụ upstream 413/503 hiện bị đổi thành 502.
- `504`: timeout/hủy request trong khi gọi upstream. Proxy timeout khoảng 18 giây; adapter trình duyệt khoảng 20 giây.

Các khác biệt cần xử lý trước khi cấu hình REST draft:

- Proxy chưa thay `{projectId}`, `{modelId}`... bằng ID cụ thể.
- Proxy chưa unwrap `ApiResponse.data`.
- `impact` là query nên proxy bắt upstream GET; REST draft là POST. Không thể bật bằng mapping POST đơn thuần.
- Proxy không forward `Link`, `X-Total-Count`, `Retry-After` từ upstream.
- Header `Set-Cookie` chỉ được chuyển nếu tên cookie nằm trong allowlist.

### 5.5. mockLogin

Chỉ adapter mock có input `{role:"student"|"lecturer"|"admin"}` và output `Session`. `/api/mavis/mockLogin` luôn bị từ chối HTTP 501; chưa có endpoint đăng nhập thật, refresh token hay callback danh tính trong source đã đọc.

## 6. Nguồn đối chiếu và giới hạn

- [OpenAPI draft public](openapi.yaml), [phân tích hợp đồng FE–BE](backend-api-contract.md), [checklist tích hợp](api-integration.md).
- [Frontend contracts](../../src/lib/api/contracts.ts), [domain schemas](../../src/types/domain.ts), [response identity validation](../../src/lib/api/validate-response.ts), [browser adapter](../../src/lib/api/backend-adapter.ts), [Next.js proxy](../../app/api/mavis/%5Boperation%5D/route.ts).
- [Spring PingController](../../../MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/admin/controller/PingController.java), [UploadController](../../../MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/upload/controller/UploadController.java).
- [ApiResponse](../../../MAVIS-Platform/mavis-be/mavis-common/src/main/java/com/mavis/common/dto/ApiResponse.java), [ErrorCode](../../../MAVIS-Platform/mavis-be/mavis-common/src/main/java/com/mavis/common/exception/ErrorCode.java), [GlobalExceptionHandler](../../../MAVIS-Platform/mavis-be/mavis-common/src/main/java/com/mavis/common/exception/GlobalExceptionHandler.java).
- [Worker JobsController](../../../MAVIS.Worker/src/MAVIS.Worker.Api/Controllers/JobsController.cs), [AnalysisController](../../../MAVIS.Worker/src/MAVIS.Worker.Api/Controllers/AnalysisController.cs), [request DTO](../../../MAVIS.Worker/src/MAVIS.Worker.Application/Contracts/Requests/AnalysisRequest.cs), [result DTO](../../../MAVIS.Worker/src/MAVIS.Worker.Application/Contracts/Responses/AnalysisResult.cs), [JobStatusView](../../../MAVIS.Worker/src/MAVIS.Worker.Application/Jobs/IJobQueue.cs).

Các chức năng như tạo/sửa/xóa project, workspace, assignment; publish reference; GitHub import; export diagram; login thực chưa có contract/endpoint tương ứng trong phạm vi source đã đọc, nên không bổ sung route giả định.

Kiểm tra tài liệu: đối chiếu đủ 38 operation public và 5 route controller; ví dụ input/output public được validate với schema Zod và kiểm tra ID; schema/reference OpenAPI được kiểm tra cục bộ. Chưa kiểm thử HTTP thực tế hoặc xác nhận build/deployment backend.
