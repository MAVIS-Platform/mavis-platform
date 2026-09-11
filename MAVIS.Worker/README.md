# MAVIS.Worker

Phân tích microservices và build dependency graph cho hệ thống **MAVIS** (Microservices Architecture Visualization and Change Impact Analysis).

## Kiến trúc

```
MAVIS.Worker/
├── MAVIS.Worker.sln
├── src/
│   ├── MAVIS.Worker.Domain/          # Entities, Enums, Exceptions (không phụ thuộc gì)
│   ├── MAVIS.Worker.Application/     # Contracts + Interfaces (Orchestrator, Graph, Impact)
│   ├── MAVIS.Worker.Infrastructure/  # Roslyn analyzer, Serialization
│   └── MAVIS.Worker.Api/             # ASP.NET Core Web API - entry point
└── tests/
    └── MAVIS.Worker.Tests/           # xUnit tests
```

## Build & Run

```bash
# Build toàn bộ
dotnet build

# Chạy API
dotnet run --project src/MAVIS.Worker.Api

# Test
dotnet test
```

## Flow làm việc với Spring Boot (Java)

```
[Spring Boot] --POST /api/analysis--> [.NET Worker]
                                          │
                                          ├─ Normalize raw findings
                                          ├─ (Optional) Roslyn cho .cs/.csproj
                                          ├─ Resolve dependencies
                                          ├─ Build directed graph
                                          └─ (Optional) Compute impact
                                          │
[Spring Boot] <-- { manifest, impact }--- ┘
```

## Stack

- .NET 8
- ASP.NET Core Web API (Controllers)
- Roslyn (`Microsoft.CodeAnalysis.CSharp` 4.10)
- xUnit
