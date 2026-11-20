package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;
import com.mavis.platform.workspace.service.CourseQuizService;

import java.util.List;

/**
 * Standardized 5-Module / 12-Chapter Coursera Java 21 Microservices V2 Curriculum Catalog ({@code JAVA-MS-2026}):
 * - 5 Modules aligned with {@code docs/curriculum/Giao_Trinh_Java_Microservices.md}
 * - 12 in-depth V2 Chapters ({@code java-v2-ch01}..{@code java-v2-ch12})
 * - 48 validated Quiz Gate questions (4 per chapter, pass threshold >= 70%)
 * - 5 architectural Essay assignments with 100-point Rubrics
 * - 5 Visual Architecture / Runtime Studio labs linked to Moc Huong Shop reference topology
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

    public static final String CURATED_REPO_SLUG = "moc-huong-shop";
    public static final List<String> CURATED_SERVICES = List.of(
            "service-discovery",
            "api-gateway",
            "identity-service",
            "catalog-service",
            "order-service",
            "notification-service",
            "payment-service"
    );

    private JavaCourseraCatalog() {}

    public static List<CourseraModuleSpec> modules() {
        return List.of(
                module1Foundations(),
                module2SyncGatewayDiscovery(),
                module3DataMessagingSaga(),
                module4ResilienceObservability(),
                module5ProductionMocHuong()
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
                "Mộc Hương Shop C1–C3 Decomposition & DTO Boundaries",
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
                "API Gateway Routing, OpenFeign Call Sites & Cycle-Safe Reverse BFS",
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

    private static CourseraModuleSpec module3DataMessagingSaga() {
        List<String> chapterIds = List.of("java-v2-ch07", "java-v2-ch08", "java-v2-ch09");
        return new CourseraModuleSpec(
                3,
                "Module 3 · Database-per-Service, Apache Kafka Outbox & Giao Dịch Phân Tán Saga",
                "Loại bỏ Anti-Pattern Shared Database, triển khai CQRS/API Composition, Kafka Idempotency + Transactional Outbox và Saga Choreography/Orchestration.",
                "Shared DB Audit, Kafka Outbox & Saga Compensation Flows",
                "Kiểm tra ranh giới Database độc lập của Mộc Hương Shop và mô phỏng chuỗi sự kiện Order -> Catalog/Inventory -> Notification.",
                "java-v2-ch07",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch07",
                                "Nguyên tắc Database-per-Service, phát hiện mùi Shared Database và giải pháp API Composition / CQRS / Redis Cache."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch08",
                                "Apache Kafka Event-Driven Messaging, Consumer Idempotency-Key và Transactional Outbox chống mất sự kiện."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch09",
                                "Thiết kế Saga Pattern (Choreography & Orchestration) với Pivot Transaction và Compensating Transactions.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 3 · Phá Bỏ Shared Database & Thiết Kế Saga Hoàn Kho Mộc Hương Shop",
                        "Thiết kế bảng Outbox, Idempotent Consumer và chuỗi Compensating Transaction khi thanh toán thất bại.",
                        """
                        ### Bài tập Kiến trúc Dữ liệu Phân tán
                        1. Hai dịch vụ `order-service` và `catalog-service` đang nối chung một `moc_huong_db`. Hãy chỉ ra 3 rủi ro nghiêm trọng (*Shared Database Smell*) và lộ trình tách thành 2 database độc lập.
                        2. Viết quy trình **Transactional Outbox** đảm bảo khi lưu `Order` xuống PostgreSQL thì sự kiện `order.created` chắc chắn được đẩy sang Kafka mà không gặp bài toán *Dual-Write*.
                        3. Vẽ chuỗi bước **Saga Compensation** khi bước trừ tồn kho thành công nhưng bước thanh toán thất bại.
                        """,
                        List.of(
                                new RubricCriterion("1. Phân tích Shared DB Smell & Tách DB", 35,
                                        "Nhận diện đúng coupling schema, contention lock và đề xuất giao tiếp qua API/Event."),
                                new RubricCriterion("2. Transactional Outbox & Idempotency", 35,
                                        "Giải thích rõ ACID local commit với outbox_events và bảng processed_events tránh xử lý trùng."),
                                new RubricCriterion("3. Saga Forward & Compensating Flows", 30,
                                        "Xác định chính xác Pivot Transaction, Semantic Lock / PENDING state và hành động bù trừ.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 03 · Kafka Event Bus, Data Boundaries & Runtime Spans",
                        "Quan sát ranh giới Data Store độc lập và chuỗi OpenTelemetry Span cho đơn hàng bất đồng bộ trên MAVIS Studio.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }

    private static CourseraModuleSpec module4ResilienceObservability() {
        List<String> chapterIds = List.of("java-v2-ch10", "java-v2-ch11");
        return new CourseraModuleSpec(
                4,
                "Module 4 · Khả Năng Chịu Lỗi (Resilience4j) & Quan Sát Hệ Thống (OpenTelemetry)",
                "Áp dụng Timeout, Retry có Exponential Backoff, Circuit Breaker & Bulkhead bằng Resilience4j cùng Actuator + OpenTelemetry Distributed Tracing.",
                "Resilience4j Chaos Stop Container & OpenTelemetry W3C Traceparent",
                "Thực hiện thí nghiệm Chaos: dừng payment-service trên MAVIS Studio, quan sát Circuit Breaker chuyển OPEN và đối chiếu Latency p95 Trước/Sau.",
                "java-v2-ch10",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch10",
                                "Phá vòng xoáy Cascading Failure với Resilience4j: TimeLimiter, Retry + Jitter, CircuitBreaker (CLOSED/OPEN/HALF_OPEN) và Bulkhead."),
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch11",
                                "Observability 3 trụ cột: Spring Boot Actuator (/health/liveness, /readiness), MDC Correlation ID và OpenTelemetry Traceparent.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Module 4 · Cấu hình Resilience4j & Đối Chiếu Before/After trên MAVIS Studio",
                        "Thiết lập thứ tự Decorator Resilience4j chuẩn và phương pháp đo p95 Latency khi dịch vụ downstream sập.",
                        """
                        ### Bài tập Chịu lỗi & Observability
                        1. Giải thích vì sao thứ tự bọc chuẩn trong Resilience4j là `Bulkhead -> TimeLimiter -> CircuitBreaker -> Retry` (hoặc `Retry` ngoài/trong tùy mục tiêu tránh Retry Storm).
                        2. Khi thí nghiệm **Stop `payment-service`** trên MAVIS Studio, trình bày cách đọc W3C `traceparent` qua 3 dịch vụ và cách so sánh `p95 Latency` + `Error Rate %` Trước/Sau một cách khoa học (cùng workload và sample count `N`).
                        """,
                        List.of(
                                new RubricCriterion("1. Resilience4j Patterns & Anti-Retry-Storm", 40,
                                        "Phân tích đúng vai trò Timeout, Exponential Backoff + Jitter, Circuit Breaker Fail-Fast và Fallback."),
                                new RubricCriterion("2. Actuator Probes & W3C Traceparent", 30,
                                        "Phân biệt liveness vs readiness probe và cách traceId/spanId/parentSpanId nối cây nhân quả."),
                                new RubricCriterion("3. Phương pháp thực nghiệm Before vs After", 30,
                                        "Nêu đủ yêu cầu giữ cố định workload, cỡ mẫu N và phân biệt Static khả năng vs Runtime bằng chứng.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 04 · Resilience4j Chaos Experiment & OTel Trace Diff",
                        "Dừng dịch vụ phụ trên MAVIS Studio để kiểm chứng Circuit Breaker Fallback và xem Diff vết thực thi OpenTelemetry.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }

    private static CourseraModuleSpec module5ProductionMocHuong() {
        List<String> chapterIds = List.of("java-v2-ch12");
        return new CourseraModuleSpec(
                5,
                "Module 5 · Đóng Gói Docker Compose, Testing Pyramid & Capstone Mộc Hương Shop",
                "Đóng gói Multi-Stage Dockerfile Java 21 Non-Root, hoàn thiện chiến lược Testcontainers & Contract Testing và đối soát 10 tiêu chí Production-Ready.",
                "Mộc Hương Shop Scale 1→8 Replicas & Production-Readiness Audit",
                "Mở rộng replica order-service trên MAVIS Studio (1 -> 4+ instances), kiểm tra Load Balancing round-robin và hoàn tất Production-Readiness Checklist.",
                "java-v2-ch12",
                List.of(
                        V2CurriculumJsonLoader.toLessonSpec("java-v2-ch12",
                                "Docker Multi-Stage Build (JRE 21 Non-Root), Testing Pyramid Microservices và 10 tiêu chí Production-Readiness cho Mộc Hương Shop.")
                ),
                V2CurriculumJsonLoader.toQuizQuestions(chapterIds),
                new EssaySpec(
                        "Tự luận Capstone · Thẩm định Production-Readiness Hệ Thống Mộc Hương Shop (10 Tiêu Chí)",
                        "Đánh giá toàn diện kiến trúc C1–C3, Clean Secrets, Horizontal Scaling 1→8 và SLA Vận hành.",
                        """
                        ### Đồ án Tổng kết (Mộc Hương Shop · `JAVA-MS-2026`)
                        Dựa theo **10 tiêu chí Production-Ready Checklist** ở Chương 12 & Phụ lục C:
                        1. Kiểm tra rà soát **Stateless Design**: Những lỗi nào sẽ phát sinh khi tăng `order-service` từ `1` lên `4` bản sao trong Docker Compose (ví dụ `container_name` cứng, `server.port` đụng nhau, local in-memory session)?
                        2. Lập bảng kiểm *Testing Pyramid* (Unit, `@WebMvcTest`, Testcontainers Postgres/Kafka, Consumer-Driven Contract) cho 4 dịch vụ lõi của Mộc Hương Shop.
                        """,
                        List.of(
                                new RubricCriterion("1. Horizontal Scale Readiness (1 → 8 Replicas)", 40,
                                        "Chỉ ra đầy đủ điều kiện stateless, bỏ container_name/host-port cứng trên worker service và dùng healthcheck."),
                                new RubricCriterion("2. Docker Multi-Stage & Security Hygiene", 30,
                                        "Giải thích lợi ích image tối giản JRE 21, user non-root và Zero Secret Leaks (.env.example)."),
                                new RubricCriterion("3. Testing Pyramid & Production Checklist", 30,
                                        "Áp dụng đúng Testcontainers thay H2 giả lập và bao phủ các hạng mục Susan Fowler Checklist.")
                        )
                ),
                new VisualLabSpec(
                        "RUNTIME_LAB",
                        "Studio Lab 05 · Mộc Hương Shop Replica Scaling & Production Audit",
                        "Thực hành Scale replica trên MAVIS Studio (1 -> 4+) cho Mộc Hương Shop, đo Throughput & Error Rate và xuất báo cáo tổng kết.",
                        true,
                        List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
                )
        );
    }
}
