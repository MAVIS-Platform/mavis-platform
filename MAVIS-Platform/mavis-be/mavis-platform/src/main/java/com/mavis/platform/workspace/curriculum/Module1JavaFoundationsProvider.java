package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 1: Modern Java 21 Foundations, Collections/Streams & Spring Boot Build Ecosystem.
 */
public final class Module1JavaFoundationsProvider {
    private Module1JavaFoundationsProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-f01",
                        "Bài 1.1 (java-f01): Ranh giới kiểu dữ liệu, Java Record, Interface & Validation ở biên HTTP",
                        "Thiết kế DTO bằng Java 21 Record bất biến sâu, tách hợp đồng Interface khỏi implementation và chặn lỗi dữ liệu ở biên HTTP.",
                        45,
                        """
                        # Bài 1.1: Ranh giới kiểu dữ liệu, Java 21 Record & Validation ở biên

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Phân tách rõ **biên giao tiếp (`Edge DTO`)**, **hợp đồng nghiệp vụ (`Port Interface`)** và **thực thi dịch vụ (`@Service`)** trong kiến trúc Java Microservices.
                        - Loại bỏ lỗi rò rỉ đột biến (`Shallow Immutability`) khi nhận payload `POST /api/v1/orders` hay `POST /api/v1/bookings`.
                        - Chặn dữ liệu không hợp lệ sớm bằng Bean Validation (`jakarta.validation`) với mã `400/422` thay vì để nổ `500` ở tầng PostgreSQL.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Lớp ranh giới | Thành phần Java 21 / Spring Boot 3 | Trách nhiệm chính | Sai lầm phổ biến |
                        | :--- | :--- | :--- | :--- |
                        | **Edge DTO** | `public record ...` + Compact Constructor | Chứa dữ liệu truyền qua HTTP, khóa tham chiếu bằng `List.copyOf` | Truyền thẳng JPA `@Entity` ra `@RestController` |
                        | **Contract Port** | `InventoryClientPort` (`interface`) | Định nghĩa hành vi (**What**), tách caller khỏi implementation | Hardcode gọi class cụ thể gây khóa chặt dependency |
                        | **Boundary Validation** | `@Valid`, `@NotBlank`, `@Min`, `@Future` | Phân biệt `400/422` (lỗi input) với `500/503` (lỗi hạ tầng) | Trả `200 OK` hoặc `500` khi client gửi `quantity <= 0` |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        public record CreateOrderRequest(
                                @NotBlank String customerId,
                                @NotEmpty @Valid List<OrderLineDto> items
                        ) {
                            public CreateOrderRequest {
                                items = items != null ? List.copyOf(items) : List.of();
                            }
                        }

                        @RestController
                        @RequestMapping("/api/v1/orders")
                        public class OrderController {
                            private final OrderApplicationService service;
                            public OrderController(OrderApplicationService service) { this.service = service; }

                            @PostMapping
                            public ResponseEntity<OrderSummaryDto> create(@Valid @RequestBody CreateOrderRequest req) {
                                return ResponseEntity.status(HttpStatus.CREATED).body(service.placeOrder(req));
                            }
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Bẫy Shallow Immutability**: Khi caller sửa `List` gốc sau khi khởi tạo `record`, đối tượng vẫn bị biến đổi nếu thiếu `List.copyOf(...)` trong Compact Constructor.
                        - **Evidence Kiểm toán 3E**: Kiểm tra `GlobalExceptionHandler` ánh xạ `MethodArgumentNotValidException` sang `400 Bad Request` và `BusinessException` có mã lỗi rõ ràng.
                        """
                ),
                new LessonSpec(
                        "java-f02",
                        "Bài 1.2 (java-f02): Cấu trúc dữ liệu Collections, Stream API & Pipeline không tác dụng phụ",
                        "Chọn đúng List, Set, Map theo ngữ nghĩa bài toán và viết Stream pipeline thuần khiết, xử lý trùng khóa an toàn.",
                        45,
                        """
                        # Bài 1.2: Collections, Stream API & Pipeline không tác dụng phụ

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Chọn đúng cấu trúc dữ liệu (`List`, `Set`, `Map`) khi dựng đồ thị phụ thuộc dịch vụ, lọc finding kiểm toán và gom nhóm route Gateway.
                        - Viết `Stream API` thuần khiết (pure pipeline), không gây hiệu ứng phụ (`side-effect free`) và xử lý an toàn trường hợp trùng khóa (`Duplicate Key`).

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Cấu trúc | Ngữ nghĩa cốt lõi | Dùng trong Microservices | Tránh dùng khi |
                        | :--- | :--- | :--- | :--- |
                        | `List<T>` | Giữ thứ tự, cho phép trùng | Danh sách `OrderLine`, chuỗi bước kịch bản | Tra cứu nhanh theo `serviceId` |
                        | `Set<T>` | Phần tử duy nhất, `O(1)` lookup | Tập `visited` chống lặp vô hạn trong `Reverse BFS` | Cần đếm tần suất lặp lại |
                        | `Map<K, V>` | Ánh xạ khóa duy nhất -> giá trị `O(1)` | Index `ServiceElement` theo ID, gom routes theo service | `Collectors.toMap()` thiếu hàm gộp khi trùng khóa |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        public Map<String, Integer> aggregateDishQuantities(List<PreOrderedDishDto> dishes) {
                            return dishes.stream()
                                    .collect(Collectors.toMap(
                                            PreOrderedDishDto::dishId,
                                            PreOrderedDishDto::quantity,
                                            Integer::sum,
                                            LinkedHashMap::new
                                    ));
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Bẫy `IllegalStateException: Duplicate key`**: Gọi `Collectors.toMap(keyFn, valFn)` thiếu `mergeFunction` (`Integer::sum`) sẽ sập ngay khi có 2 phần tử trùng khóa.
                        - **Bẫy Side Effect**: Không thay đổi `List` bên ngoài hoặc gọi HTTP/DB bên trong `.map()` / `.filter()` vì có thể phá vỡ hành vi khi chuyển sang parallel stream.
                        """
                ),
                new LessonSpec(
                        "java-f03",
                        "Bài 1.3 (java-f03): Quản trị Build Maven BOM, Maven Wrapper & Cấu hình đa môi trường",
                        "Hiểu dependencyManagement BOM, Maven Wrapper (./mvnw), thứ tự ưu tiên Spring Profiles và Zero Secret Leaks.",
                        40,
                        """
                        # Bài 1.3: Quản trị Build Maven BOM & Cấu hình đa môi trường

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Quản lý hàng chục thư viện Spring Boot 3 & Spring Cloud đồng bộ phiên bản bằng Bill of Materials (BOM).
                        - Bảo đảm build tái lập 100% giữa máy lập trình viên Windows/macOS và CI/CD Docker Linux bằng Maven Wrapper (`./mvnw`).
                        - Bảo mật tuyệt đối cấu hình DB/JWT/API Key xuyên suốt nhiều môi trường (`dev`, `ci`, `prod`).

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Cơ chế Maven / Spring | Vai trò kỹ thuật | Lưu ý quan trọng | Rủi ro nếu dùng sai |
                        | :--- | :--- | :--- | :--- |
                        | `<dependencyManagement>` (BOM) | Khai báo bảng phiên bản chuẩn | Không tự đưa JAR vào classpath | Nhầm tưởng khai báo BOM là đã import thư viện |
                        | `./mvnw` / `mvnw.cmd` | Ghim chính xác phiên bản Maven | Commit `mvnw` & `.mvn/` lên Git | Mỗi máy CI cài 1 bản Maven khác nhau gây lệch build |
                        | Environment Variables | Ghi đè `application.yml` trong JAR | Dùng placeholder `${SPRING_DATASOURCE_PASSWORD}` | Hardcode secret thật vào Git (`Secret Leak`) |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```yaml
                        spring:
                          application:
                            name: order-service
                          datasource:
                            url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/orders_db}
                            username: ${SPRING_DATASOURCE_USERNAME:orders_user}
                            password: ${SPRING_DATASOURCE_PASSWORD}
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Ma trận JDK 21**: Spring Boot `3.2.x / 3.3.x` + Spring Cloud `2023.0.x (Leyton)` trên namespace `jakarta.*` (tuyệt đối không trộn `javax.*`).
                        - **Thứ tự ưu tiên cấu hình**: Command-line args & Environment Variables (`SPRING_DATASOURCE_URL`) luôn thắng `application-{profile}.yml` và `application.yml` trong JAR.
                        """
                )
        );
    }

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m1-q1",
                        "Trong thiết kế dịch vụ Java, một interface ở tầng nghiệp vụ chủ yếu biểu diễn điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Hợp đồng gọi (Call contract) định nghĩa khả năng cung cấp cho bên gọi",
                                "Danh sách container Docker đang chạy",
                                "Tệp biến môi trường hệ điều hành",
                                "Bảng dữ liệu trong PostgreSQL"),
                        0,
                        "interface định nghĩa hợp đồng giao tiếp (tên hàm, đầu vào/đầu ra), giúp tách rời bên gọi khỏi lớp cài đặt cụ thể.", 1),
                new QuizQuestionSpec("m1-q2",
                        "Một Java record chứa trường List<OrderItem> có tự động bất biến sâu (deeply immutable) không?",
                        "SINGLE_CHOICE",
                        List.of("Có, JDK 21 đóng băng mọi object bên trong",
                                "Không, record chỉ bất biến tham chiếu nông; cần List.copyOf(...) trong compact constructor",
                                "Có, nếu biên dịch bằng Maven Wrapper",
                                "Chỉ bất biến trên Linux"),
                        1,
                        "record chỉ đặt final cho tham chiếu trường dữ liệu; cần sao chép phòng vệ bằng List.copyOf(...) để chặn caller sửa danh sách gốc.", 1),
                new QuizQuestionSpec("m1-q3",
                        "Khi khách hàng gửi quantity = -5, dịch vụ nên kiểm tra và xử lý ở đâu?",
                        "SINGLE_CHOICE",
                        List.of("Chỉ kiểm tra màu CSS ở trình duyệt",
                                "Lưu thẳng số âm vào Database",
                                "Chặn ngay tại biên nhận dữ liệu (DTO @Min(1) / Compact Constructor), trả về HTTP 400/422",
                                "Khởi động lại container Docker"),
                        2,
                        "Boundary Validation giúp bảo vệ Domain và Database khỏi dữ liệu sai và phân biệt rõ lỗi client 4xx với lỗi hệ thống 5xx.", 1),
                new QuizQuestionSpec("m1-q4",
                        "Cấu trúc dữ liệu nào tra cứu nhanh Microservice theo serviceId với độ phức tạp O(1)?",
                        "SINGLE_CHOICE",
                        List.of("LinkedList không có chỉ mục",
                                "Map<String, ServiceInfo> (HashMap / LinkedHashMap)",
                                "Stream đã đóng",
                                "Mảng char[]"),
                        1,
                        "Map lưu cặp Key -> Value theo bảng băm, tra cứu theo khóa serviceId trong O(1).", 1),
                new QuizQuestionSpec("m1-q5",
                        "Dùng Set<String> sẽ gây SAI LỆCH ngữ nghĩa trong trường hợp nào?",
                        "SINGLE_CHOICE",
                        List.of("Lưu visited chống lặp trong Reverse BFS",
                                "Lưu danh sách role không trùng lặp",
                                "Cần giữ lại chính xác số lần xuất hiện (tần suất) của từng mã lỗi HTTP theo thời gian",
                                "Loại bỏ tên route bị trùng"),
                        2,
                        "Set tự động loại bỏ phần tử trùng lặp, làm mất số lần xuất hiện lặp lại của sự kiện.", 1),
                new QuizQuestionSpec("m1-q6",
                        "Điều gì xảy ra nếu dùng Collectors.toMap() gặp 2 bản ghi trùng khóa mà KHÔNG có mergeFunction?",
                        "SINGLE_CHOICE",
                        List.of("Tự giữ cả 2 bản ghi",
                                "Ném IllegalStateException: Duplicate key tại runtime",
                                "Tự đổi tên package",
                                "Database tự rollback"),
                        1,
                        "Collectors.toMap mặc định ném IllegalStateException khi gặp khóa trùng; phải truyền mergeFunction hoặc dùng groupingBy.", 1),
                new QuizQuestionSpec("m1-q7",
                        "Thẻ <dependencyManagement> (import BOM) trong pom.xml có tác dụng gì?",
                        "SINGLE_CHOICE",
                        List.of("Tự động thêm cả 200 thư viện Spring Cloud vào JAR",
                                "Quản lý tập trung bảng phiên bản chuẩn, nhưng chỉ thư viện khai báo trong <dependencies> mới được nạp vào dự án",
                                "Thay thế PostgreSQL",
                                "Tự sinh Unit Test"),
                        1,
                        "BOM đóng vai trò bảng tra cứu phiên bản tương thích; dự án chỉ đóng gói những artifact được khai báo ở <dependencies>.", 1),
                new QuizQuestionSpec("m1-q8",
                        "Công dụng cốt lõi của Maven Wrapper (./mvnw) là gì?",
                        "SINGLE_CHOICE",
                        List.of("Build dự án bằng đúng phiên bản Maven được ghim chuẩn trong repo trên mọi máy và CI/CD",
                                "Tự mã hóa mật khẩu DB",
                                "Biên dịch Java sang C#",
                                "Thay thế Docker Engine"),
                        0,
                        "Maven Wrapper khóa chặt phiên bản Maven qua maven-wrapper.properties, loại bỏ sai khác môi trường build.", 1),
                new QuizQuestionSpec("m1-q9",
                        "Nếu spring.datasource.url có ở cả application.yml lẫn biến môi trường SPRING_DATASOURCE_URL, giá trị nào thắng?",
                        "SINGLE_CHOICE",
                        List.of("Luôn dùng application.yml",
                                "Biến môi trường SPRING_DATASOURCE_URL được ưu tiên hơn và ghi đè YAML trong JAR",
                                "Spring Boot từ chối chạy",
                                "Phụ thuộc dung lượng ổ đĩa"),
                        1,
                        "Theo Spring Boot Externalized Configuration, Environment Variables luôn ghi đè application.yml đóng gói trong JAR.", 1),
                new QuizQuestionSpec("m1-q10",
                        "Khi phân tích tĩnh Spring Boot, bằng chứng nào đáng tin cậy nhất để biết lớp nào triển khai một Interface?",
                        "SINGLE_CHOICE",
                        List.of("Đoán theo độ dài tên file",
                                "Đối chiếu @Service/@Component cài đặt Interface và cấu hình @Bean/@Primary/@Qualifier",
                                "Đếm số dòng comment",
                                "Xem ngày tạo file"),
                        1,
                        "Spring DI nối Interface với class thực thi qua annotation bean và binding @Primary/@Qualifier tại cấu hình.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 1: Thiết kế DTO & Cấu hình Đa môi trường cho OTRS",
                "Áp dụng Java 21 Record (Deep Immutability), Stream API thuần khiết và Spring Externalized Configuration cho booking-service.",
                """
                ### Đề bài Tình huống (Case Study: Hệ thống Đặt Bàn OTRS)
                Dựa trên nghiên cứu điển hình **OTRS (Online Table Reservation System)** trong *Mastering Microservices with Java*, bạn được giao xây dựng dịch vụ `booking-service` bằng Java 21 & Spring Boot 3 nhận đặt bàn (`restaurantId`, `userId`, `reservationTime`, `partySize`, `preOrderedDishes`).

                **Yêu cầu bài viết (300 – 500 từ kèm code minh họa)**:
                1. Viết `CreateBookingRequest` bằng **Java 21 Record** đảm bảo **bất biến sâu (`List.copyOf`)** và chặn mọi dữ liệu sai ở biên (`partySize` từ `1..50`, ngày đặt ở tương lai). Giải thích mã HTTP `400/422` vs `500/503`.
                2. Viết hàm dùng **`Stream API` thuần khiết** gom nhóm `preOrderedDishes` trùng `dishId` thành `Map<String, Integer>` cộng dồn số lượng.
                3. Trình bày cấu trúc `application.yml` kết hợp biến môi trường (`SPRING_DATASOURCE_PASSWORD`, `STRIPE_API_KEY`) đảm bảo **Zero Secret Leaks**.
                """,
                List.of(
                        new RubricCriterion("1. Thiết kế Java 21 Record DTO & Deep Immutability", 35,
                                "Dùng đúng Java record, có List.copyOf() trong compact constructor, đủ @NotBlank/@Min/@Max/@Future và phân biệt 4xx với 5xx."),
                        new RubricCriterion("2. Stream API thuần khiết & Xử lý trùng khóa", 35,
                                "Dùng Collectors.toMap(..., Integer::sum) hoặc groupingBy + summingInt sạch sẽ, không có side effects."),
                        new RubricCriterion("3. Cấu hình application.yml & Zero Secret Leaks", 30,
                                "Tách bạch giá trị mặc định local và ${ENV_VAR}, tuyệt đối không hardcode secret hay password thật.")
                )
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                1,
                "Chương 1 · Nền Tảng Java 21, Collections/Streams & Hệ Sinh Thái Spring Boot",
                "Nắm vững Java 21 Record bất biến sâu, Interface Contract, Stream API thuần khiết, Maven BOM và cấu hình đa môi trường.",
                "Lab 01 · Java 21 DTO Boundaries, Stream Pipeline & Multi-Environment Config",
                "Thực hành phân tích ranh giới dữ liệu DTO/Interface, xử lý Collections/Streams và chuẩn hóa cấu hình Spring Boot đa môi trường.",
                "java-f01",
                lessons(),
                quizQuestions(),
                essay(),
                null
        );
    }
}
