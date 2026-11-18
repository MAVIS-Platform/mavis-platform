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
                        # 📖 BÀI 1.1 (`java-f01`): JAVA NỀN TẢNG, RANH GIỚI KIỂU DỮ LIỆU (`RECORD`, `INTERFACE`) & KIỂM TRA DỮ LIỆU Ở BIÊN

                        ### 1. Tư duy Thiết kế Ranh giới Kiểu dữ liệu trong Microservices
                        Khi một yêu cầu HTTP (ví dụ `POST /api/v1/orders`) đi từ khách hàng vào một dịch vụ Java Spring Boot, dữ liệu phải đi qua **3 lớp ranh giới rõ ràng** (theo [Dev.java — Getting to Know the Language](https://dev.java/learn/language/) và Chương 2 cuốn *Mastering Microservices with Java* — Sourabh Sharma):

                        1. **Lớp truyền tải dữ liệu ở biên (`DTO — Data Transfer Object` dùng `Java Record`)**:
                           - Từ JDK 16+ và đặc biệt trong [JDK 21 LTS](https://docs.oracle.com/en/java/javase/21/docs/specs/index.html), từ khóa `record` giúp khai báo một lớp mang dữ liệu bất biến nông (*shallowly immutable data carrier*) chỉ với vài dòng code. Trình biên dịch tự động sinh `constructor`, các hàm đọc (`accessor methods`), `equals()`, `hashCode()` và `toString()`.
                           - **Cạm bẫy quan trọng cần nhớ ("Shallow Immutability")**: Một `record` chỉ khóa chặt tham chiếu của các trường (`final` fields), nhưng **không tự động làm bất biến sâu (deeply immutable)** đối với các đối tượng khả biến nằm bên trong nó (ví dụ một `List<OrderItemDto>`). Nếu truyền một `ArrayList` vào `record`, kẻ gọi vẫn có thể sửa danh sách đó trừ khi chúng ta sao chép phòng vệ bằng `List.copyOf(...)` trong *Compact Constructor*!
                        2. **Lớp hợp đồng nghiệp vụ (`Business Contract` dùng `Interface`)**:
                           - Một `interface` (như `InventoryClientPort` hoặc `OrderApplicationService`) chỉ định nghĩa **"Hệ thống có thể làm được gì" (What)** mà hoàn toàn ẩn đi **"Làm bằng cách nào" (How)**.
                           - Khi phân tích kiến trúc tĩnh, chỉ nhìn thấy `interface` thì mới biết **hợp đồng gọi (Call Contract)**; muốn biết hành vi thực tế lúc chạy, ta phải lần tới **lớp triển khai (`@Service class`)** được gắn qua cơ chế Tiêm phụ thuộc (*Dependency Injection*).
                        3. **Phân biệt Lỗi Dữ liệu Đầu vào (`Client Data Error — 4xx`) với Lỗi Hạ tầng (`Infrastructure Failure — 5xx`)**:
                           - **Lỗi dữ liệu ở biên** (thiếu trường bắt buộc, số lượng đặt hàng `≤ 0`, định dạng email sai): Phải bị chặn ngay tại tầng Controller/DTO bằng `@Valid` (`jakarta.validation`) hoặc *Compact Constructor* và trả về mã lỗi **`HTTP 400 Bad Request` / `422 Unprocessable Entity`** rõ ràng cho phía gọi.
                           - **Lỗi hạ tầng** (mất kết nối PostgreSQL, timeout khi gọi dịch vụ kho): Là lỗi hệ thống, cần được ghi log kèm mã truy vết (`traceId`) và xử lý bằng cơ chế chịu lỗi hoặc trả về **`HTTP 503 Service Unavailable`**.

                        ### 2. Ví dụ Code Java 21 & Spring Boot 3 Chuẩn Mực
                        ```java
                        package com.mavis.ecommerce.order.api.dto;

                        import jakarta.validation.Valid;
                        import jakarta.validation.constraints.Min;
                        import jakarta.validation.constraints.NotBlank;
                        import jakarta.validation.constraints.NotEmpty;
                        import java.math.BigDecimal;
                        import java.util.List;

                        /**
                         * DTO nhận yêu cầu đặt hàng tại biên HTTP.
                         * Dùng Compact Constructor + List.copyOf() để đảm bảo tính bất biến sâu (Deep Immutability).
                         */
                        public record CreateOrderRequest(
                                @NotBlank(message = "Mã khách hàng không được để trống")
                                String customerId,

                                @NotEmpty(message = "Đơn hàng phải có ít nhất 1 sản phẩm")
                                @Valid
                                List<OrderLineDto> items
                        ) {
                            public CreateOrderRequest {
                                // Sao chép phòng vệ (Defensive Copy) để danh sách items không thể bị sửa đổi từ bên ngoài
                                items = items != null ? List.copyOf(items) : List.of();
                            }

                            public record OrderLineDto(
                                    @NotBlank(message = "Mã sản phẩm (SKU) không được để trống")
                                    String skuCode,

                                    @Min(value = 1, message = "Số lượng đặt tối thiểu phải bằng 1")
                                    int quantity,

                                    @Min(value = 0, message = "Đơn giá không được âm")
                                    BigDecimal unitPrice
                            ) {}
                        }
                        ```

                        ```java
                        package com.mavis.ecommerce.order.domain.port;

                        /**
                         * Hợp đồng (Interface) kiểm tra và giữ chỗ tồn kho.
                         * Giúp tách biệt hoàn toàn logic đơn hàng khỏi chi tiết gọi HTTP/Feign hay Database.
                         */
                        public interface InventoryClientPort {
                            boolean checkAndReserveStock(String skuCode, int quantity);
                        }
                        ```

                        ```java
                        package com.mavis.ecommerce.order.api;

                        import com.mavis.ecommerce.order.api.dto.CreateOrderRequest;
                        import jakarta.validation.Valid;
                        import org.springframework.http.HttpStatus;
                        import org.springframework.http.ResponseEntity;
                        import org.springframework.web.bind.annotation.*;

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

                        ### 3. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
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
                        # 📖 BÀI 1.2 (`java-f02`): CẤU TRÚC DỮ LIỆU `COLLECTIONS`, `STREAM API` & PIPELINE KHÔNG TÁC DỤNG PHỤ

                        ### 1. Chọn Đúng Cấu Trúc Dữ Liệu (`List` vs `Set` vs `Map`)
                        Theo [Dev.java — Collections and Streams](https://dev.java/learn/api/collections-and-streams/), mỗi kiểu tập hợp trong Java Collections Framework mang một ngữ nghĩa toán học và độ phức tạp truy xuất riêng:

                        | Cấu trúc | Ngữ nghĩa cốt lõi | Khi nào PHẢI dùng trong Microservices? | Khi nào KHÔNG ĐƯỢC dùng? |
                        | :--- | :--- | :--- | :--- |
                        | **`List<T>`** (`ArrayList`) | Giữ nguyên **thứ tự chèn** (ordered sequence) và **cho phép phần tử trùng lặp**. | Danh sách các bước trong kịch bản kiểm thử, danh sách dòng hàng (`OrderLine`) theo thứ tự khách chọn, lịch sử sự kiện theo thời gian. | Khi cần tra cứu nhanh một dịch vụ theo `serviceId` (vì tìm kiếm tuyến tính `O(n)` rất chậm). |
                        | **`Set<T>`** (`HashSet`, `LinkedHashSet`) | Biểu diễn **tập hợp các phần tử duy nhất** (không trùng lặp); kiểm tra tồn tại `contains()` chỉ tốn `O(1)`. | Tập hợp `visited` trong thuật toán `Reverse BFS` để chống lặp vô tận trên đồ thị có chu kỳ; tập hợp các mã quyền (`Roles / Scopes`) của người dùng. | Khi cần **giữ lại số lần xuất hiện** (tần suất lỗi) hoặc khi cần giữ các bản ghi trùng mã để báo lỗi. |
                        | **`Map<K, V>`** (`HashMap`, `LinkedHashMap`) | Bảng băm ánh xạ từ **Khóa duy nhất (`Key`) sang Giá trị (`Value`)** với tốc độ tra cứu `O(1)`. | Tra cứu nhanh thông tin `ServiceElement` theo `serviceId`, gom nhóm danh sách API Routes theo tên Microservice. | Khi gom nhóm bằng `Collectors.toMap()` mà không khai báo hàm xử lý trùng khóa (`mergeFunction`), sẽ bị nổ lỗi `IllegalStateException: Duplicate key`! |

                        ### 2. Nguyên Tắc Vàng Khi Viết `Stream API` Trong Dịch Vụ Backend
                        - **Cấm gây tác dụng phụ (No Side Effects) bên trong `filter` / `map`**: Không được vừa chạy `.map(...)` vừa sửa đổi một biến `List` bên ngoài hoặc vừa bắn lệnh gọi HTTP/Database bên trong `Stream`! Hãy tách bạch bước **biến đổi dữ liệu thuần túy trong bộ nhớ (Pure In-Memory Transformation)** với bước **gọi I/O bên ngoài**.
                        - **Luôn định nghĩa quy tắc xử lý khóa trùng (`Merge Rule`) khi gom dữ liệu vào `Map`**:

                        ```java
                        package com.mavis.ecommerce.analyzer;

                        import java.util.*;
                        import java.util.stream.Collectors;

                        public class RouteNormalizer {

                            public record EndpointRoute(String serviceName, String httpMethod, String path) {}

                            /**
                             * Gom danh sách các route theo tên service, tự động loại bỏ các route khai báo trùng lặp
                             * nhưng vẫn bảo toàn thứ tự xuất hiện ban đầu (nhờ LinkedHashMap và LinkedHashSet).
                             */
                            public Map<String, List<String>> groupUniqueRoutesByService(List<EndpointRoute> rawRoutes) {
                                if (rawRoutes == null || rawRoutes.isEmpty()) {
                                    return Map.of();
                                }
                                return rawRoutes.stream()
                                        .filter(Objects::nonNull)
                                        .filter(r -> r.serviceName() != null && !r.serviceName().isBlank())
                                        .collect(Collectors.groupingBy(
                                                EndpointRoute::serviceName,
                                                LinkedHashMap::new,
                                                Collectors.collectingAndThen(
                                                        Collectors.mapping(
                                                                r -> r.httpMethod().toUpperCase() + " " + r.path().trim(),
                                                                Collectors.toCollection(LinkedHashSet::new)
                                                        ),
                                                        List::copyOf
                                                )
                                        ));
                            }
                        }
                        ```

                        ### 3. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
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
                        # 📖 BÀI 1.3 (`java-f03`): QUẢN TRỊ BUILD `MAVEN`, `SPRING BOOT / CLOUD BOM` & CẤU HÌNH ĐA MÔI TRƯỜNG

                        ### 1. Hiểu Rõ `pom.xml`, `dependencyManagement (BOM)` và `Maven Wrapper (mvnw)`
                        Theo [Apache Maven Getting Started Guide](https://maven.apache.org/guides/getting-started/index.html) và Chương 2 cuốn *Mastering Microservices with Java* (Sourabh Sharma):
                        1. **`<dependencies>` vs `<dependencyManagement>` (Bill of Materials — BOM)**:
                           - Thẻ `<dependencyManagement>` (ví dụ khi import `spring-cloud-dependencies` BOM) **chỉ quy định bảng phiên bản chuẩn tương thích** giữa các thư viện chứ **KHÔNG tự động tải hay thêm thư viện đó vào ứng dụng**! Muốn dùng thư viện nào (như `spring-cloud-starter-openfeign`), bắt buộc phải khai báo nó trong thẻ `<dependencies>` (nhưng không cần ghi thẻ `<version>` vì BOM đã quản lý giúp).
                        2. **Ma trận Tương thích Phiên bản (`JDK` ↔ `Spring Boot` ↔ `Spring Cloud`)**:
                           - Trong dự án Microservices dùng **JDK 21 LTS**, nếu dùng **Spring Boot `3.2.x` / `3.3.x`** thì bắt buộc phải đi kèm **Spring Cloud `2023.0.x` (tên mã `Leyton`)**. Nếu ghép nhầm Spring Boot 3 với Spring Cloud cũ (`2021.x`), ứng dụng sẽ lỗi ngay lúc khởi động do xung đột namespace `javax.*` và `jakarta.*`.
                        3. **Tại sao luôn dùng `./mvnw` (`Maven Wrapper`) thay vì lệnh `mvn` cài trên máy cá nhân?**:
                           - `Maven Wrapper` (`.mvn/wrapper/maven-wrapper.properties`) khóa chặt phiên bản Maven mà dự án yêu cầu (ví dụ Maven `3.9.6`). Nhờ đó, máy của mọi thành viên trong nhóm và máy chủ CI/CD Docker đều biên dịch bằng đúng một phiên bản Maven duy nhất.

                        ### 2. Thứ Tự Ưu Tiên Cấu Hình Đa Môi Trường (`Externalized Configuration`)
                        Theo [Spring Boot Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html) và Chương 11 cuốn *Microservices Patterns* (Chris Richardson), một dịch vụ không bao giờ được đóng cứng (`hardcode`) địa chỉ Database hay khóa bí mật bên trong code Java. Thay vào đó, Spring Boot nạp cấu hình theo thứ tự ưu tiên từ thấp đến cao:
                        1. Tệp `application.yml` gốc đóng gói trong JAR (giá trị mặc định cho môi trường `local`).
                        2. Tệp cấu hình theo hồ sơ môi trường đang kích hoạt: `application-{profile}.yml` (ví dụ `application-docker.yml` hoặc `application-prod.yml` khi bật `SPRING_PROFILES_ACTIVE=docker`).
                        3. **Biến môi trường của Hệ điều hành / Docker Container (`Environment Variables`)** — **Ghi đè (Override) cả các tệp YAML bên trong JAR**!
                        4. **Nguyên tắc Bảo mật Tuyệt đối (`Zero Secret Leaks`)**: Mật khẩu Database, `JWT_SECRET`, `OPENAI_API_KEY` bắt buộc phải truyền qua biến môi trường hoặc trình quản lý Secret (`Vault` / `Kubernetes Secrets`), tuyệt đối không lưu giá trị thật trong `application.yml` đẩy lên Git!

                        ```yaml
                        # File: order-service/src/main/resources/application.yml
                        spring:
                          application:
                            name: order-service
                          datasource:
                            # Sử dụng cú pháp ${BIẾN_MÔI_TRƯỜNG:giá_trị_mặc_định_local}
                            url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/order_db}
                            username: ${SPRING_DATASOURCE_USERNAME:postgres}
                            password: ${SPRING_DATASOURCE_PASSWORD} # Không bao giờ ghi mật khẩu thật vào file Git!
                        ```
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
                ### Đề bài Tình huống (Case Study: Hệ thống Đặt Bàn Nhà Hàng Trực Tuyến — OTRS)
                Dựa theo nghiên cứu điển hình **OTRS (Online Table Reservation System)** trong Chương 2 & Chương 4 cuốn *Mastering Microservices with Java* (Sourabh Sharma), nhóm của bạn được giao xây dựng dịch vụ **`booking-service`** bằng Java 21 và Spring Boot 3. Dịch vụ này nhận yêu cầu đặt bàn từ khách hàng gồm: Tên nhà hàng (`restaurantId`), Mã khách hàng (`userId`), Ngày giờ đặt (`reservationTime`), Số lượng khách (`partySize`), và Danh sách món đặt trước (`preOrderedDishes`).

                **Yêu cầu bài viết tự luận (300 – 500 từ kèm đoạn code minh họa)**:
                1. **Thiết kế Ranh giới Kiểu dữ liệu (`Record DTO` & `Validation`)**: Hãy viết khai báo `CreateBookingRequest` bằng `Java 21 Record` đảm bảo tính **bất biến sâu (Deep Immutability)** và chặn toàn bộ các trường hợp dữ liệu không hợp lệ ở biên (thiếu mã nhà hàng, số lượng khách `≤ 0` hoặc `> 50`, ngày đặt ở trong quá khứ). Giải thích rõ mã HTTP status nào sẽ trả về khi vi phạm các điều kiện này.
                2. **Xử lý Tập hợp bằng `Stream API`**: Giả sử danh sách `preOrderedDishes` gửi lên có thể chứa nhiều dòng trùng mã món ăn (`dishId`). Hãy viết một hàm sử dụng `Stream API` (không gây tác dụng phụ) để gom nhóm và cộng dồn tổng số lượng theo từng `dishId` vào một `Map<String, Integer>`.
                3. **Chiến lược Cấu hình Đa môi trường & Bảo mật Secret**: Dịch vụ `booking-service` cần kết nối tới PostgreSQL và sử dụng một khóa bí mật `STRIPE_API_KEY`. Hãy trình bày cấu trúc tệp `application.yml` kết hợp biến môi trường để chạy mượt trên cả máy Local của sinh viên lẫn trên Docker Production mà **không lộ bất kỳ Secret nào lên Git**.
                """,
                List.of(
                        new RubricCriterion("1. Thiết kế Record DTO & Deep Immutability", 35,
                                "Sử dụng đúng record của Java 21, có List.copyOf() trong compact constructor để bảo vệ danh sách con, gắn đầy đủ @NotBlank, @Min, @Max, @Future và phân biệt rõ lỗi 400/422 với 500/503."),
                        new RubricCriterion("2. Pipeline Stream API & Xử lý Trùng Khóa", 35,
                                "Viết hàm gom nhóm sang Map<String, Integer> bằng Collectors.toMap(..., Integer::sum) hoặc Collectors.groupingBy(..., Collectors.summingInt(...)) sạch sẽ, không thay đổi danh sách đầu vào."),
                        new RubricCriterion("3. Cấu hình application.yml & Zero Secret Leaks", 30,
                                "Tách biệt rõ cấu hình mặc định và biến môi trường ${ENV_VAR}, tuyệt đối không hardcode STRIPE_API_KEY hay mật khẩu thật vào tệp YAML.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "STATIC_LAB",
                "Mô hình Trực quan: Sơ đồ luồng biến đổi DTO -> Service -> Domain & Cấu hình Đa môi trường",
                "Khám phá ranh giới truyền tải Edge DTO (Java 21 Record), Port Interface, Service Implementation và cấu hình biến môi trường Zero Secret Leaks.",
                false,
                List.of("C4_CONTAINER", "C4_COMPONENT")
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
                visualLab()
        );
    }
}
