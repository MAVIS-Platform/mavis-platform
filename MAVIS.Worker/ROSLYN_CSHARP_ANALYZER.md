# C# Roslyn Analyzer

## 📝 Tổng quan

Worker giờ có khả năng **tự động scan C# source code** bằng Roslyn để tìm dependencies giữa các services, không cần Java gửi findings C# sẵn. Điều này cho phép:

1. **Chạy độc lập**: Đưa folder chứa C# code vào → Worker tự scan → vẽ graph (không cần Java)
2. **Tích hợp với Java**: Java gửi findings (generic + Java) kèm `SourceLocation` → Worker scan thêm C# → merge tất cả → graph đầy đủ

---

## 🏗️ Kiến trúc

```
┌─────────────┐
│   Java      │ → findings (generic + java) + SourceLocation
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│      .NET Worker API                    │
│  POST /api/jobs/submit                  │
└──────────┬──────────────────────────────┘
           │
           ▼
    AnalysisOrchestrator
           │
           ├─→ CSharpAnalyzer.IsApplicable(sourceLocation)
           │       └─→ có .csproj? → true
           │
           ├─→ CSharpAnalyzer.AnalyzeAsync(sourceLocation)
           │       │
           │       ├─→ tìm tất cả .cs files (skip bin/obj)
           │       ├─→ parse từng file bằng Roslyn
           │       └─→ detect patterns:
           │           • httpClient.GetAsync("http://...")
           │           • httpClient.PostAsync/PutAsync/DeleteAsync
           │           • IHttpClientFactory.CreateClient("ServiceName")
           │           • IConfiguration["Services:X:Url"]
           │
           ├─→ merge: RawFindings từ Java + C# findings
           │
           └─→ Normalizer → Resolver → Graph → Impact
```

---

## 🔍 Patterns được detect

### 1. HttpClient calls
```csharp
private readonly HttpClient _http;

await _http.GetAsync("http://order-service/api/orders");
await _http.PostAsync("http://payment-service/api/charge", content);
```

**Output:**
- `Kind`: `HTTP_REST_CALL`
- `Target`: `order-service` (extracted từ URL)
- `HttpMethod`: `GET`, `POST`, etc.
- `Url`: URL đầy đủ

### 2. IHttpClientFactory
```csharp
var client = _factory.CreateClient("OrderServiceClient");
```

**Output:**
- `Kind`: `HTTP_CLIENT_FACTORY`
- `Target`: `OrderServiceClient`

### 3. Configuration references
```csharp
var url = _config["Services:OrderService:Url"];
var host = _configuration["PaymentService:Host"];
```

**Output:**
- `Kind`: `CONFIG_REFERENCE`
- `Target`: config key (e.g., `Services:OrderService:Url`)

---

## 🧪 Testing

### Unit tests: `CSharpAnalyzerTests.cs`
- Test từng pattern riêng (HttpClient GET/POST, CreateClient, config)
- Test skip bin/obj folders
- Test infer ServiceId từ folder structure
- **13 tests** cover các edge cases

### Integration tests: `CSharpScanEndToEndTests.cs`
- Tạo project C# thật trên disk (temp folder)
- Submit job với `RawFindings = []` (không có Java findings)
- Verify Worker tự scan C# và build graph
- Test merge Java findings + C# findings
- **2 E2E tests** với WebApplicationFactory

### Kết quả
```
Passed!  - Failed:     0, Passed:    66, Skipped:     0, Total:    66
```

---

## 🔌 Integration với Java

### Luồng hiện tại (Java → Worker)

1. **Java** nhận ZIP upload → giải nén ra `C:/mavis/uploads/{projectId}/extracted/`
2. **Java** scan generic (docker-compose, env files) + Java source (FeignClient, RestTemplate)
3. **Java** gọi Worker API:
   ```json
   POST /api/jobs/submit
   {
     "projectId": "uuid",
     "projectName": "MyProject",
     "sourceLocation": "C:/mavis/uploads/{projectId}/extracted/",
     "rawFindings": [ /* findings từ Java */ ],
     "computeImpact": true
   }
   ```
4. **Worker** nhận request:
   - Check `sourceLocation` có .csproj không?
   - Có → chạy `CSharpAnalyzer` → tìm thêm C# findings
   - Merge `rawFindings (Java)` + `csharpFindings` → pipeline tiếp

### Yêu cầu deployment

- **Share volume** giữa Java service và Worker service (để Worker đọc được source đã giải nén)
- Ví dụ docker-compose:
  ```yaml
  services:
    java-analyzer:
      volumes:
        - mavis-uploads:/mavis/uploads
    
    worker-api:
      volumes:
        - mavis-uploads:/mavis/uploads
  
  volumes:
    mavis-uploads:
  ```

---

## 📦 Files thay đổi

### Mới tạo
- `src/MAVIS.Worker.Infrastructure/CSharp/CSharpAnalyzer.cs` (249 dòng)
- `tests/MAVIS.Worker.Tests/CSharp/CSharpAnalyzerTests.cs` (325 dòng)
- `tests/MAVIS.Worker.Tests/Integration/CSharpScanEndToEndTests.cs` (204 dòng)

### Sửa đổi
- `src/MAVIS.Worker.Infrastructure/CSharp/ICSharpAnalyzer.cs`
  - Đổi return type từ `IReadOnlyList<DependencyEdge>` → `IReadOnlyList<RawFindingDto>` (consistency)
- `src/MAVIS.Worker.Infrastructure/Analysis/AnalysisOrchestrator.cs`
  - Inject `ICSharpAnalyzer`
  - Thêm logic: check applicable → scan C# → merge findings
- `src/MAVIS.Worker.Infrastructure/DependencyInjection.cs`
  - Đăng ký `services.AddSingleton<ICSharpAnalyzer, CSharpAnalyzer>()`
- `tests/MAVIS.Worker.Tests/Analysis/AnalysisOrchestratorTests.cs`
  - Mock `ICSharpAnalyzer`
  - Thêm 2 tests: verify C# scan được gọi, verify merge findings

---

## 🚀 Next steps

### Đã hoàn thành ✅
- [x] Implement `CSharpAnalyzer` với Roslyn
- [x] Wire vào `AnalysisOrchestrator`
- [x] DI registration
- [x] Unit tests cho analyzer
- [x] Integration E2E tests
- [x] 66/66 tests pass

### Còn lại (khi Java sẵn sàng)
- [ ] Java emit `RawFindingDto` từ visitors (hiện tại chỉ log)
- [ ] Java orchestrator gọi Worker API với findings + sourceLocation
- [ ] Java lưu kết quả vào Postgres (ServiceNode, DependencyEdge, Evidence, ImpactIndex)
- [ ] Setup docker-compose với shared volume cho source files
- [ ] Test full pipeline: upload ZIP → Java scan → Worker scan C# → merge → graph → impact → DB

---

## 💡 Lưu ý

### Hiện tại
- `CSharpAnalyzer` dùng **syntax-only parsing** (không load full MSBuild workspace) → nhanh, không cần restore packages
- Chỉ detect **literal strings** và **identifier names** trong HTTP calls (chưa resolve biến phức tạp)
- ServiceId được infer từ **tên thư mục đầu tiên** trong path tương đối (ví dụ: `OrderService/Controllers/X.cs` → ServiceId = `OrderService`)

### Tương lai (nếu cần)
- Semantic analysis: resolve biến, constant, config values
- Refit interface detection: `[Get("/path")]`, `[Post]` attributes
- RestSharp detection: `new RestClient(url)`, `RestRequest`
- Hỗ trợ multi-target (.NET Framework, .NET Standard)
