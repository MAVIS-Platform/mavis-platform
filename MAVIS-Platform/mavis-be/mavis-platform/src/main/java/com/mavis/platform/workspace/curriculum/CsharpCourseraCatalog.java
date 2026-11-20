package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;
import com.mavis.platform.workspace.service.CourseQuizService;

import java.util.List;

/**
 * Standardized 5-Module / 12-Chapter Coursera C# 12 / .NET 8 Microservices V2 Curriculum Catalog ({@code CSHARP-MS-2026}):
 * - 5 Modules aligned with {@code docs/curriculum/Giao_Trinh_Csharp_Microservices.md} & Project Trai Cay
 * - 12 in-depth V2 Chapters ({@code csharp-v2-ch01}..{@code csharp-v2-ch12})
 * - 48 validated Quiz Gate questions (4 per chapter, pass threshold >= 70%)
 * - 5 architectural Essay assignments with 100-point Rubrics
 * - 5 Visual Architecture / Runtime Studio labs linked to {@code fruit-shop-dotnet-microservices}
 */
public final class CsharpCourseraCatalog {
    public static final String COURSE_CODE = "CSHARP-MS-2026";
    public static final String COURSE_TITLE =
            "Kiến Trúc & Phát Triển C# .NET 8 Microservices Toàn Diện (Chuẩn Coursera · V2)";
    public static final String COURSE_DESCRIPTION =
            "Giáo trình V2 gồm 5 Học phần · 12 Chương chuẩn Microsoft .NET 8 / eShop & Project Trái Cây "
                    + "(fruit-shop-dotnet-microservices): C4 Model (C1–C3), DDD & CQRS, ASP.NET Core 8 DI Lifetime, "
                    + "Docker DNS & IOptions<T>, YARP API Gateway & JWT, Typed HttpClient & Roslyn Reverse BFS, "
                    + "EF Core 8 & Redis, MassTransit RabbitMQ & Outbox, Saga, Polly v8 Resilience & OpenTelemetry .NET.";

    public static final String CURATED_REPO_SLUG = "fruit-shop-dotnet-microservices";
    public static final List<String> CURATED_SERVICES = List.of(
            "ApiGateway",
            "FruitCatalog.API",
            "FruitBasket.API",
            "FruitOrdering.API"
    );

    private CsharpCourseraCatalog() {}

    public static List<CourseraModuleSpec> modules() {
        return List.of(
                module1DotNetFoundations(),
                module2YarpDiscoveryRoslyn(),
                module3EfCoreEventBusSaga(),
                module4PollyResilienceOtel(),
                module5DockerTestingFruitShop()
        );
    }

    public static List<LessonSpec> allLessons() {
        return modules().stream()
                .flatMap(module -> module.lessons().stream())
                .toList();
    }

    public static CourseQuizService.Publish toQuizPublishRequest(CourseraModuleSpec module) {
        return V2CurriculumJsonLoader.toQuizPublishRequest(module);
    }

    private static CourseraModuleSpec module1DotNetFoundations() {
        List<String> chapterIds = List.of("csharp-v2-ch01", "csharp-v2-ch02", "csharp-v2-ch03");
        return new CourseraModuleSpec(
                1,
                "Module 1 · Nền Tảng Kiến Trúc .NET 8 Microservices, DDD/CQRS & Phân Tầng C3",
                "Đọc cấu trúc Solution .sln/.csproj theo C4 Model, phân biệt CRUD vs DDD + CQRS và kiểm soát DI Lifetime + ProblemDetails RFC 7807.",
                "Project Trái Cây Solution Structure, DDD & DI Captive Dependency Audit",
                "Khám phá cấu trúc .sln của Project Trái Cây (fruit-shop-dotnet-microservices) ở Static View C1–C3 và kiểm tra ranh giới DI Lifetime.",
                "csharp-v2-ch01",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch01",
                                "Containerized .NET Microservices, mô hình C4 (C1–C3), quy tắc .sln/.csproj và Roslyn Static Analysis."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch02",
                                "Áp dụng tỉnh táo CRUD đơn giản vs DDD + CQRS, Aggregate Root và Domain Events bằng C# 12."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch03",
                                "ASP.NET Core 8 Web API chuẩn C3, bẫy Captive Dependency (Singleton giữ Scoped DbContext) và IExceptionHandler.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 1 (.NET 8) · Ranh giới Bounded Context & Captive Dependency trong Project Trái Cây",
                        "Thiết kế ranh giới FruitCatalog.API vs FruitOrdering.API và xử lý chuẩn DI Lifetime.",
                        """
                        ### Tình huống thiết kế (Project Trái Cây · `fruit-shop-dotnet-microservices`)
                        1. Giải thích vì sao `FruitCatalog.API` chỉ nên theo mô hình Data-Driven CRUD gọn nhẹ trong khi `FruitOrdering.API` cần áp dụng **DDD Aggregate Root + CQRS**.
                        2. Phân tích lỗi **Captive Dependency** khi tiêm `FruitOrderingDbContext` (`Scoped`) vào một `BackgroundService` hoặc class đăng ký `AddSingleton`, và trình bày cách khắc phục bằng `IServiceScopeFactory`.
                        """,
                        List.of(
                                new RubricCriterion("1. Lựa chọn CRUD vs DDD & Ranh giới .csproj", 35,
                                        "Phân biệt đúng độ phức tạp miền nghiệp vụ và tránh tạo SharedModels.csproj chứa chung DbContext."),
                                new RubricCriterion("2. Thiết kế Rich Domain Model C# 12", 35,
                                        "Dùng private set, record Value Object bất biến và bảo toàn invariant trong Aggregate Root Order."),
                                new RubricCriterion("3. Kiểm soát DI Lifetime & IExceptionHandler", 30,
                                        "Xác định đúng cách dùng IServiceScopeFactory và chuẩn hóa lỗi HTTP ProblemDetails RFC 7807.")
                        )
                ),
                new VisualLabSpec(
                        "STATIC_LAB",
                        "Studio Lab 01 (.NET) · C1–C3 Solution & DI Boundary Check",
                        "Mở Solution Project Trái Cây ở Static View, kiểm tra đối ứng .csproj -> C2 Container và ranh giới C3 Controller -> DbContext.",
                        false,
                        List.of("C4_CONTAINER", "C4_COMPONENT")
                )
        );
    }

    private static CourseraModuleSpec module2YarpDiscoveryRoslyn() {
        List<String> chapterIds = List.of("csharp-v2-ch04", "csharp-v2-ch05", "csharp-v2-ch06");
        return new CourseraModuleSpec(
                2,
                "Module 2 · Docker Service Discovery, YARP API Gateway & Typed HttpClient (Roslyn Reverse BFS)",
                "Cấu hình Docker DNS & IOptions<T> ValidateOnStart, YARP Reverse Proxy + JWT Bearer/RBAC và Typed HttpClient để Roslyn dựng Reverse BFS.",
                "YARP Gateway Routes, Roslyn CALL_SITE & Cycle-Safe Reverse BFS",
                "Kiểm tra cấu hình YARP Gateway, trích xuất CALL_SITE giữa FruitOrdering.API -> FruitCatalog.API và phân tích vùng ảnh hưởng Reverse BFS.",
                "csharp-v2-ch04",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch04",
                                "Service Discovery qua Docker Embedded DNS / .NET Service Discovery và cấu hình an toàn bằng IOptions<T> ValidateOnStart()."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch05",
                                "Xây dựng API Gateway hiệu năng cao với Microsoft YARP Reverse Proxy, Rate Limiting và bảo mật JWT Bearer / RBAC."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch06",
                                "Khắc phục Socket Exhaustion bằng IHttpClientFactory (Typed Client), bằng chứng Roslyn CALL_SITE và thuật toán Reverse BFS.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 2 (.NET 8) · YARP Gateway Security & Phân Tích Roslyn CALL_SITE",
                        "Thiết kế định tuyến YARP, JWT ValidateOnStart và Typed Client cho FruitOrdering.API.",
                        """
                        ### Bài tập Kiến trúc Gateway & Sync IPC (.NET 8)
                        1. Viết đoạn cấu hình `ReverseProxy` (YARP) điều hướng `/api/fruits/**` tới `FruitCatalog.API` và `/api/orders/**` tới `FruitOrdering.API` qua Docker DNS, kèm cơ chế ẩn thông tin topology nội bộ.
                        2. Giải thích vì sao `new HttpClient()` lặp lại trong từng request gây **Socket Exhaustion (`TIME_WAIT`)** và cách `AddHttpClient<ICatalogClient, CatalogClient>()` giúp cả hiệu năng lẫn bộ phân tích tĩnh Roslyn nhận diện chính xác `CALL_SITE`.
                        """,
                        List.of(
                                new RubricCriterion("1. YARP Routing & JWT ValidateOnStart", 35,
                                        "Cấu hình đúng Cluster/Route YARP qua Docker DNS và kiểm tra JWT signing key bằng ValidateOnStart."),
                                new RubricCriterion("2. Typed HttpClient vs Socket Exhaustion", 35,
                                        "Giải thích chính xác HttpMessageHandler pooling + DNS refresh và cách tiêm Typed Client sạch."),
                                new RubricCriterion("3. Roslyn CALL_SITE & Cycle-Safe Reverse BFS", 30,
                                        "Xác định đúng Direct Callers vs Indirect Callers và tránh vòng lặp khi đồ thị có cycle.")
                        )
                ),
                new VisualLabSpec(
                        "IMPACT_LAB",
                        "Studio Lab 02 (.NET) · Roslyn CALL_SITE & Reverse BFS Impact",
                        "Kiểm chứng đường gọi đồng bộ từ ApiGateway -> FruitOrdering.API -> FruitCatalog.API và tính Direct/Indirect Callers.",
                        false,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }

    private static CourseraModuleSpec module3EfCoreEventBusSaga() {
        List<String> chapterIds = List.of("csharp-v2-ch07", "csharp-v2-ch08", "csharp-v2-ch09");
        return new CourseraModuleSpec(
                3,
                "Module 3 · Database-per-Service (EF Core 8 & Redis), Event Bus & Saga Pattern",
                "Phân tách DbContext độc lập cho mỗi .NET service, triển khai Redis IDistributedCache, Event Bus RabbitMQ/Outbox và Saga bù trừ hoàn kho.",
                "Polyglot Persistence (PostgreSQL/Redis), MassTransit Event Bus & Saga",
                "Kiểm tra cô lập DbContext giữa FruitCatalog.API, FruitOrdering.API, Redis ở FruitBasket.API và luồng Saga Eventual Consistency.",
                "csharp-v2-ch07",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch07",
                                "Data Sovereignty với EF Core 8, khắc phục Shared Database Smell và tăng tốc đọc với Redis Cache + TTL."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch08",
                                "Event Bus (RabbitMQ / MassTransit), Idempotent Consumer và IntegrationEventOutbox bảo toàn sự kiện khi broker lỗi."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch09",
                                "Saga Choreography & Orchestration cho quy trình Đặt Trái Cây (Giữ kho -> Tạo đơn -> Xóa giỏ / Bù trừ hoàn kho).")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 3 (.NET 8) · Data Sovereignty & Saga Compensation Project Trái Cây",
                        "Thiết kế Polyglot Persistence, Integration Event Log (Outbox) và Consumer Idempotency trong EF Core 8.",
                        """
                        ### Bài tập Kiến trúc Dữ liệu .NET 8
                        1. Trình bày mô hình Polyglot Persistence của Project Trái Cây (`FruitCatalog.API` dùng PostgreSQL `catalog_db`, `FruitOrdering.API` dùng `ordering_db`, `FruitBasket.API` dùng Redis) và lý do cấm `AddDbContext` dùng chung chuỗi kết nối.
                        2. Thiết kế `IntegrationEventLog` Outbox cùng một `DbContext` Transaction để phát `OrderCreatedIntegrationEvent` và xóa giỏ hàng gián tiếp an toàn qua RabbitMQ.
                        """,
                        List.of(
                                new RubricCriterion("1. EF Core 8 Data Sovereignty & Polyglot Store", 35,
                                        "Giải thích chính xác cô lập DbContext, Redis IDistributedCache TTL và lỗi SHARED_DATABASE."),
                                new RubricCriterion("2. Integration Event Outbox & Idempotency", 35,
                                        "Bảo đảm ACID cục bộ khi lưu Outbox và chống xử lý trùng khi RabbitMQ giao lại thông điệp."),
                                new RubricCriterion("3. Saga Compensation Flow", 30,
                                        "Xây dựng đủ luồng forward và hoàn kho trái cây khi thanh toán/đơn hàng thất bại.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 03 (.NET) · RabbitMQ Event Bus & Polyglot Data Flows",
                        "Theo dõi luồng sự kiện RabbitMQ giữa FruitOrdering.API, FruitCatalog.API và FruitBasket.API trong Runtime Studio.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }

    private static CourseraModuleSpec module4PollyResilienceOtel() {
        List<String> chapterIds = List.of("csharp-v2-ch10", "csharp-v2-ch11");
        return new CourseraModuleSpec(
                4,
                "Module 4 · Khả Năng Chịu Lỗi (Polly v8) & Observability (.NET Health Checks / OpenTelemetry)",
                "Cấu hình Microsoft.Extensions.Http.Resilience (Polly v8), tách bạch /health/live vs /health/ready, Serilog và OpenTelemetry .NET Traces.",
                "Polly v8 Circuit Breaker Chaos Test & OpenTelemetry Trace Diff",
                "Thực hành dừng FruitCatalog.API trên MAVIS Studio để kích hoạt Polly v8 Circuit Breaker + Fallback và đối chiếu p95 Latency Trước/Sau.",
                "csharp-v2-ch10",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch10",
                                "Polly v8 & AddStandardResilienceHandler(): Total Request Timeout, Exponential Backoff + Jitter và Circuit Breaker Fail-Fast."),
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch11",
                                "ASP.NET Core Health Checks (/health/live vs /health/ready), Structured Logging và OpenTelemetry W3C Traceparent trong .NET 8.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 4 (.NET 8) · Polly v8 Resilience Pipeline & Health Probe Isolation",
                        "Phân tích vòng đời Polly v8, bẫy Dependency Health Check gây restart hàng loạt và đọc OTel Traces.",
                        """
                        ### Bài tập Chịu lỗi & Giám sát .NET 8
                        1. Vì sao **Liveness Probe** (`/health/live`) KHÔNG được kiểm tra kết nối PostgreSQL/RabbitMQ, trong khi **Readiness Probe** (`/health/ready`) lại bắt buộc phải kiểm tra?
                        2. Khi `FruitOrdering.API` bật `AddStandardResilienceHandler()`, giải thích thứ tự thực thi của Total Timeout, Rate Limiter, Retry (+Jitter) và Circuit Breaker khi dừng container `FruitCatalog.API`.
                        """,
                        List.of(
                                new RubricCriterion("1. Polly v8 Resilience Strategy Pipeline", 40,
                                        "Hiểu rõ tầng Total Timeout -> Retry+Jitter -> CircuitBreaker -> Attempt Timeout."),
                                new RubricCriterion("2. Liveness vs Readiness Probe Discipline", 30,
                                        "Tránh được bẫy Cascading Pod/Container Restart nhờ tách Health Check tags."),
                                new RubricCriterion("3. OpenTelemetry .NET Before/After Analysis", 30,
                                        "Nêu đủ quy tắc đối chiếu p95, Error Rate với cùng Workload và Sample Size.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 04 (.NET) · Polly v8 Stop/Fallback Chaos Experiment",
                        "Dừng FruitCatalog.API trên MAVIS Studio để đo Circuit Breaker Fail-Fast `503` và kiểm tra W3C traceparent spans.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }

    private static CourseraModuleSpec module5DockerTestingFruitShop() {
        List<String> chapterIds = List.of("csharp-v2-ch12");
        return new CourseraModuleSpec(
                5,
                "Module 5 · Docker Multi-Stage (.NET 8), Testing & Capstone Project Trái Cây",
                "Đóng gói Docker Multi-Stage cho ASP.NET Core 8 (Non-Root), kiểm thử WebApplicationFactory + Testcontainers và đối soát 10 tiêu chí Project Trái Cây.",
                "Project Trái Cây Scale 1→8 Replicas & Production-Readiness Audit",
                "Scale replica FruitCatalog.API & FruitOrdering.API trên MAVIS Studio (1 -> 4+ instances), kiểm tra Round-Robin và Production-Readiness Checklist.",
                "csharp-v2-ch12",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("csharp-v2-ch12",
                                "Docker Multi-Stage Layer Cache (.csproj restore), ASPNETCORE_HTTP_PORTS 8080, WebApplicationFactory & 10 tiêu chí Project Trái Cây.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Capstone (.NET 8) · Thẩm Định 10 Tiêu Chí Project Trái Cây (`fruit-shop-dotnet-microservices`)",
                        "Đánh giá hoàn chỉnh Solution .NET 8 từ Docker Multi-Stage đến Zero Secret Leaks & Horizontal Scale 1→8.",
                        """
                        ### Đồ án Tổng kết (`CSHARP-MS-2026` · Project Trái Cây)
                        Kiểm toán Solution `fruit-shop-dotnet-microservices` theo **10 tiêu chí Checklist Phụ lục C**:
                        1. Giải thích tối ưu Docker Layer Cache khi tách `COPY *.csproj` + `dotnet restore` trước `COPY . .`, và vì sao từ .NET 8 container mặc định chạy cổng `8080` với user `app` (non-root).
                        2. Chứng minh Solution sẵn sàng **Scale `1 -> 8` bản sao** trên MAVIS Studio (không hard-code `container_name`, không lưu session local, có `IDistributedCache` + `healthcheck`).
                        """,
                        List.of(
                                new RubricCriterion("1. Docker Multi-Stage & .NET 8 Non-Root Security", 35,
                                        "Trình bày đúng tối ưu layer cache SDK -> aspnet:8.0 runtime gọn nhẹ và port 8080 non-root."),
                                new RubricCriterion("2. Testing Pyramid (WebApplicationFactory & Testcontainers)", 35,
                                        "Phân biệt Integration Test dùng WebApplicationFactory + Testcontainers PostgreSQL/RabbitMQ."),
                                new RubricCriterion("3. Horizontal Scale 1→8 & Zero Secret Leaks", 30,
                                        "Đạt đủ checklist stateless, bỏ container_name cứng và ValidateOnStart cho mọi bí mật.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 05 (.NET) · Project Trái Cây Replica Scaling 1→8 & Production Audit",
                        "Scale replica trên MAVIS Studio cho fruit-shop-dotnet-microservices, đo Throughput/p95 Latency và hoàn tất kiểm toán.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }
}
