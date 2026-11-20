package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;
import com.mavis.platform.workspace.service.CourseQuizService;

import java.util.List;

/**
 * Standardized 5-Module / 12-Chapter Coursera C# 12 / .NET 8 Microservices V2 Curriculum Catalog ({@code CSHARP-MS-2026}):
 * - Aligned with {@code docs/curriculum/Giao_Trinh_Csharp_Microservices.md} & Project Trai Cay
 * - 12 in-depth V2 Chapters ({@code csharp-v2-ch01}..{@code csharp-v2-ch12})
 * - 48 validated Quiz Gate questions (4 per chapter, pass threshold >= 70%)
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
                module2YarpDiscoveryRoslyn()
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
                "Lab 01 · Project Trái Cây Solution Structure, DDD & DI Captive Dependency Audit",
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
                "Lab 02 (.NET) · YARP Gateway Routes, Roslyn CALL_SITE & Cycle-Safe Reverse BFS",
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
}
