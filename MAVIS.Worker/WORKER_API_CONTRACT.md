# MAVIS Worker API Contract

**Base URL:** `http://localhost:5082` (dev) | `http://worker-service:5000` (production)

---

## 📥 POST /api/analysis

Nhận raw findings từ Java analyzer, xử lý qua pipeline (Normalizer → Resolver → GraphEngine → ImpactAnalyzer), trả về manifest + impact analysis.

### Request Body

```json
{
  "projectId": "string (UUID recommended)",
  "projectName": "string",
  "sourceLocation": "string (absolute path)",
  "rawFindings": [
    {
      "language": "java | csharp | generic",
      "serviceId": "string (tên service)",
      "kind": "string (REST_ENDPOINT | FEIGN_CLIENT | HTTP_CLIENT | CONFIG_REFERENCE)",
      "target": "string? (service đích, chỉ dùng cho call loại)",
      "httpMethod": "string? (GET | POST | PUT | DELETE | PATCH)",
      "url": "string? (endpoint path)",
      "filePath": "string (relative to sourceLocation)",
      "startLine": 0,
      "endLine": 0,
      "snippet": "string (code snippet)"
    }
  ],
  "computeImpact": true,
  "impactTargetServiceId": "string? (required nếu computeImpact=true)"
}
```

### Response (200 OK)

```json
{
  "projectId": "string",
  "manifest": {
    "projectId": "string",
    "projectName": "string",
    "sourceLocation": "string",
    "services": [
      {
        "id": "string",
        "name": "string",
        "language": "string?",
        "framework": "string?",
        "sourceRoot": "string?",
        "exposedPorts": ["string"],
        "metadata": {}
      }
    ],
    "dependencies": [
      {
        "id": "string (hash)",
        "fromServiceId": "string",
        "toServiceId": "string",
        "kind": "HttpRestCall | ConfigurationReference | EnvironmentVariableReference | DockerNetworkReference",
        "httpMethod": "string?",
        "url": "string?",
        "evidences": [
          {
            "sourceKind": "SourceFile | DockerCompose | ConfigFile",
            "filePath": "string",
            "startLine": 0,
            "endLine": 0,
            "snippet": "string"
          }
        ]
      }
    ]
  },
  "impact": {
    "targetServiceId": "string",
    "affectedServices": [
      {
        "serviceId": "string",
        "distance": 0,
        "impactLevel": "Direct | Indirect | Isolated",
        "pathDescription": "string (chain: A → B → target)"
      }
    ]
  },
  "completedAt": "2026-09-18T13:14:19.228Z"
}
```

### Error Response (400 Bad Request)

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "ProjectId": ["The ProjectId field is required."]
  }
}
```

---

## 🩺 GET /api/health

Health check endpoint đơn giản.

### Response (200 OK)

```json
{
  "status": "OK",
  "service": "MAVIS.Worker",
  "timestampUtc": "2026-09-18T13:11:47.948Z"
}
```

---

## 📝 NOTES

1. **Naming Convention:** API dùng `camelCase` (Java/JSON standard), không phải `PascalCase` (C# default).
2. **Enum Serialization:** `DependencyKind` trả về chuỗi (`"HttpRestCall"`) chứ không phải số (`1`).
3. **Validation:** Thiếu required fields → `400` với ProblemDetails JSON.
4. **Exception Handling:** Lỗi runtime → `500` với JSON structure (không phải HTML).
5. **Timeout:** Request có thể chạy lâu (vài giây đến vài phút tùy project size), Java client nên set timeout >= 5 phút.

---

## 🧪 SAMPLE TEST (PowerShell)

```powershell
# Health check
Invoke-RestMethod -Uri http://localhost:5082/api/health

# Analysis request
$body = @{
  projectId = "test-123"
  projectName = "My Project"
  sourceLocation = "C:/projects/myapp"
  rawFindings = @(
    @{
      language = "java"
      serviceId = "order-service"
      kind = "FEIGN_CLIENT"
      target = "payment-service"
      filePath = "OrderService/PaymentClient.java"
      startLine = 15
      endLine = 15
      snippet = "@FeignClient(name = \"payment-service\")"
    }
  )
  computeImpact = $false
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri http://localhost:5082/api/analysis `
  -Method Post `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
```

---

## 🔄 CHANGE LOG

- **2026-09-18:** Initial contract definition với camelCase + JsonStringEnumConverter + ProblemDetails.
