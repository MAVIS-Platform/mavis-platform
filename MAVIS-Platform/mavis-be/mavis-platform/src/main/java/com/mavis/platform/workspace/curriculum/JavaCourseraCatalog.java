package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;
import com.mavis.platform.workspace.service.CourseQuizService;

import java.util.List;

/**
 * Standardized 5-Module / 12-Chapter Coursera Java 21 Microservices V2 Curriculum Catalog ({@code JAVA-MS-2026}):
 * - 5 Modules aligned with Docs/curriculum V2 & Moc Huong Shop Curated Reference Repo
 * - 12 in-depth V2 Chapters (java-v2-ch01..java-v2-ch12)
 * - 48 validated Quiz Gate questions (4 per chapter, pass threshold >= 70%)
 * - 5 architectural Essay assignments with 100-point Rubrics
 * - 5 Visual Architecture / Runtime Studio labs
 */
public final class JavaCourseraCatalog {
    public static final String COURSE_CODE = "JAVA-MS-2026";
    public static final String COURSE_TITLE =
            "Kiến Trúc & Phát Triển Java 21 Microservices Toàn Diện (Chuẩn Coursera · V2)";
    public static final String COURSE_DESCRIPTION =
            "Giáo trình V2 gồm 5 Học phần · 12 Chương chuẩn Java 21 / Spring Boot 3 / Spring Cloud & Mộc Hương Shop Lab: "
                    + "C4 Model (C1–C3), DDD Bounded Context, Eureka & Externalized Config, Spring Cloud Gateway & JWT/RBAC, "
                    + "OpenFeign & Cycle-Safe Reverse BFS, Database-per-Service, Apache Kafka & Outbox, Saga Pattern, "
                    + "Resilience4j, OpenTelemetry Distributed Tracing & Docker Production-Readiness.";

    private JavaCourseraCatalog() {}

    public static List<CourseraModuleSpec> modules() {
        return List.of(
                module1Foundations(),
                module2SyncGatewayDiscovery(),
                Module4ResilienceAndMessagingProvider.module(),
                Module5SagaSecurityAndDataProvider.module(),
                Module6ObservabilityAndPrdProvider.module()
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

    private static CourseraModuleSpec module1Foundations() {
        List<String> chapterIds = List.of("java-v2-ch01", "java-v2-ch02", "java-v2-ch03");
        return new CourseraModuleSpec(
                1,
                "Module 1 · Nền Tảng Kiến Trúc Microservices, DDD & Java 21 / Spring Boot 3",
                "Làm chủ Scale Cube, C4 Model (C1–C3), phân rã Bounded Context với DDD và thiết kế Microservice chuẩn C3 với Java 21 Record + Spring Boot 3.",
                "Lab 01 · C1–C3 Architecture Decomposition & Spring Boot DTO Boundaries",
                "Khám phá kiến trúc C1–C3 của hệ thống Mộc Hương Shop, phân rã Bounded Context (Catalog, Order, Inventory) và kiểm chứng ranh giới Record DTO.",
                "java-v2-ch01",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch01",
                                "So sánh Monolith vs Microservices theo Scale Cube (X/Y/Z) và phân tích cấu trúc C4 (C1–C3) trong MAVIS."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch02",
                                "Phân rã hệ thống theo Business Capability & DDD Subdomain, Aggregate Root và Value Object bất biến."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch03",
                                "Xây dựng dịch vụ Spring Boot 3 phân tầng C3 (Controller → Service → Repository), @Valid và @RestControllerAdvice.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 1 · Phân rã Bounded Context & Hợp đồng DTO Java 21 cho Mộc Hương Shop",
                        "Thiết kế ranh giới Catalog vs Order Context và Record DTO bất biến sâu với Bean Validation.",
                        """
                        ### Tình huống thiết kế (Mộc Hương Shop Microservices)
                        Bạn cần tách hệ thống thương mại điện tử **Mộc Hương Shop** từ Monolith sang kiến trúc Microservices độc lập.
                        1. Trình bày sơ đồ phân rã theo **Core / Supporting / Generic Subdomain** và giải thích vì sao `OrderItem` phải lưu bản chụp giá (`snapshot`) thay vì khóa ngoại trực tiếp sang bảng `Catalog`.
                        2. Viết một **Java 21 `record`** `CreateOrderRequest` dùng `List.copyOf(...)` trong compact constructor để đảm bảo Deep Immutability và xử lý validation tại biên HTTP.
                        """,
                        List.of(
                                new RubricCriterion("1. Phân rã Bounded Context & Data Snapshot", 40,
                                        "Phân biệt rạch ròi Core/Supporting/Generic Subdomain và giải thích rõ cách phá bỏ khóa ngoại giữa Order và Catalog."),
                                new RubricCriterion("2. Thiết kế Java 21 Record & @RestControllerAdvice", 35,
                                        "Sử dụng record với compact constructor chống mutation, gắn @Valid/@Min/@NotBlank và phân tách lỗi 4xx với 5xx."),
                                new RubricCriterion("3. Kiểm chứng phân tầng C3 sạch", 25,
                                        "Thể hiện rõ Controller không gọi trực tiếp Repository và không rò rỉ @Entity ra biên REST.")
                        )
                ),
                new VisualLabSpec(
                        "STATIC_LAB",
                        "Studio Lab 01 · Static View C1–C3 & DDD Boundary Check",
                        "Kiểm tra sơ đồ C1 Context, C2 Container, C3 Component của Mộc Hương Shop trên MAVIS ở chế độ Static View.",
                        false,
                        List.of("C4_CONTAINER", "C4_COMPONENT")
                )
        );
    }

    private static CourseraModuleSpec module2SyncGatewayDiscovery() {
        List<String> chapterIds = List.of("java-v2-ch04", "java-v2-ch05", "java-v2-ch06");
        return new CourseraModuleSpec(
                2,
                "Module 2 · Service Discovery, API Gateway JWT & Giao Tiếp Đồng Bộ Reverse BFS",
                "Triển khai Eureka Discovery, Externalized Config Zero Secret Leaks, Spring Cloud Gateway + JWT RBAC, OpenFeign và thuật toán Reverse BFS.",
                "Lab 02 · API Gateway Routing, OpenFeign Call Sites & Cycle-Safe Reverse BFS",
                "Phân tích chuỗi gọi đồng bộ từ api-gateway -> order-service -> catalog-service và tính toán vùng ảnh hưởng Direct/Indirect Callers bằng Reverse BFS.",
                "java-v2-ch04",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch04",
                                "Đăng ký dịch vụ động với Spring Cloud Eureka và cấu hình 12-Factor Externalized Config không lộ secret."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch05",
                                "Định tuyến tập trung bằng Spring Cloud Gateway, xác thực JWT Bearer và phân quyền RBAC ở biên."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch06",
                                "Giao tiếp đồng bộ OpenFeign, Contract Drift và thuật toán Cycle-Safe Reverse BFS + DFS 3 màu phát hiện vòng lặp.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 2 · Đánh giá Tác động Sync IPC & Bảo mật API Gateway",
                        "Tính độ khả dụng chuỗi gọi đồng bộ và đề xuất kiến trúc phá vỡ Cyclic Dependency.",
                        """
                        ### Bài tập phân tích Kiến trúc Sync IPC
                        1. Một luồng đặt hàng đi qua `api-gateway -> order-service -> catalog-service -> payment-service` (mỗi service có SLA `99.5%`). Hãy tính độ khả dụng tổng thể và giải thích giới hạn của lời gọi đồng bộ nối tiếp.
                        2. Khi phát hiện chu trình `order-service -> payment-service -> order-service` bằng **DFS 3 màu**, đề xuất cách cắt chu trình bằng Event bất đồng bộ.
                        3. Trình bày cơ chế xác thực JWT tại Gateway và truyền ngữ cảnh người dùng (`X-User-Id`, `traceId`) xuống downstream.
                        """,
                        List.of(
                                new RubricCriterion("1. Phân tích Availability & Call Chain", 35,
                                        "Tính chính xác tích xác suất chuỗi gọi đồng bộ và liên hệ với Reverse BFS Direct/Indirect Callers."),
                                new RubricCriterion("2. Giải pháp phá vỡ Cyclic Dependency", 35,
                                        "Chỉ ra cách dùng DFS 3 màu phát hiện cạnh BACK EDGE và tách luồng bất đồng bộ thay thế."),
                                new RubricCriterion("3. Spring Cloud Gateway & Zero Secret Config", 30,
                                        "Cấu hình JWT signing key qua biến môi trường và tách rõ trách nhiệm Gateway vs Service.")
                        )
                ),
                new VisualLabSpec(
                        "IMPACT_LAB",
                        "Studio Lab 02 · OpenFeign Impact Radius & Reverse BFS",
                        "Đánh dấu node mục tiêu catalog-service trong Dependency Graph để kiểm tra Direct/Indirect Callers trên Mộc Hương Shop.",
                        false,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }
}
