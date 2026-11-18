package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 6: OpenTelemetry Observability, Testcontainers/Contract Testing & Production-Ready Microservices.
 */
public final class Module6ObservabilityAndPrdProvider {
    private Module6ObservabilityAndPrdProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-12",
                        "Bài 6.1 (java-12): Quan sát hệ thống với OpenTelemetry Causal Spans & Đánh giá Trước/Sau",
                        "Làm chủ 3 trụ cột Traces/Metrics/Logs, W3C traceparent và phương pháp khoa học khi so sánh Before vs After.",
                        55,
                        """
                        # 📖 BÀI 6.1 (`java-12`): QUAN SÁT TOÀN DIỆN VỚI `OPENTELEMETRY` & PHƯƠNG PHÁP ĐÁNH GIÁ TRƯỚC/SAU (`BEFORE VS AFTER`)

                        ### 1. Ba Trụ Cột Của `OpenTelemetry` (`Traces`, `Metrics`, `Logs`) & Quan Hệ Nhân Quả Cha–Con (`Causal Spans`)
                        Theo [OpenTelemetry Signals Documentation](https://opentelemetry.io/docs/concepts/signals/), [OpenTelemetry Java Instrumentation](https://opentelemetry.io/docs/languages/java/) và Chương 11 cuốn *Microservices Patterns* (Chris Richardson):
                        1. **`Distributed Traces` (Vết thực thi phân tán)**:
                           - Một **`Trace`** biểu diễn toàn bộ hành trình của một yêu cầu đi xuyên qua nhiều Microservices, được định danh bằng một mã `traceId` chung.
                           - Mỗi chặng xử lý bên trong một dịch vụ (ví dụ: nhận HTTP tại `api-gateway`, gọi Feign ở `order-service`, truy vấn SQL ở `OrderRepository`) là một **`Span`** có `spanId` riêng và trỏ về **`parentSpanId`** của chặng đã gọi nó.
                           - Nhờ chuẩn truyền ngữ cảnh **[W3C Trace Context (`traceparent` HTTP Header / Message Header)](https://opentelemetry.io/docs/concepts/context-propagation/)**, các dịch vụ nối được các `Span` rời rạc thành một cây nhân quả cha–con chính xác 100% mà không sợ lệch đồng hồ giữa các máy chủ (*Clock Skew*)!
                        2. **`Metrics` (Chỉ số định lượng theo chuỗi thời gian)**:
                           - Ghi nhận xu hướng tổng hợp như: Thông lượng (`Throughput — Requests/sec`), Tỷ lệ lỗi (`Error Rate %`), và Phân vị độ trễ **`p95 / p99 Latency`** (thời gian mà 95% hoặc 99% số yêu cầu hoàn thành nhanh hơn mức đó).
                        3. **`Structured Logs` (Nhật ký sự kiện có cấu trúc)**:
                           - Ghi lại chi tiết sự kiện hoặc ngoại lệ kèm theo `traceId` và `spanId` để khi thấy một `Span` bị đỏ trên đồ thị, kỹ sư nhảy thẳng tới dòng log tương ứng ngay lập tức.

                        ### 2. Phương Pháp Khoa Học Khi So Sánh Trước/Sau (`Before vs After`) & Đối Chiếu Mô Hình Tĩnh vs Runtime
                        Khi thực hiện một thay đổi hạ tầng trên phòng Lab (ví dụ: `Stop` một dịch vụ phụ hoặc `Scale Replicas` từ `1` lên `4`), để kết luận có giá trị kỹ thuật thực sự (`java-12`):
                        1. **Một Trace đơn lẻ KHÔNG BAO GIỜ đủ để kết luận về độ trễ `p95`!** Muốn so sánh `p95 Latency` và `Error Rate` giữa trạng thái Trước (`Baseline`) và Sau (`After Intervention`), bắt buộc phải giữ **tải đầu vào (`Workload`) và khoảng thời gian đo tương đương**, đồng thời ghi rõ **kích thước mẫu (`Sample Count`, ví dụ `N = 100` requests)**.
                        2. **Phân biệt rõ câu hỏi của Mô hình Tĩnh (`Static Model`) và Bằng chứng Thực thi (`Runtime Evidence`)**:
                           - **Mô hình Tĩnh** trả lời câu hỏi: *"Theo cấu trúc mã nguồn và cấu hình hiện tại, dịch vụ A CÓ KHẢ NĂNG gọi đi đâu và phụ thuộc vào đâu?"*
                           - **Bằng chứng Runtime (Trace)** trả lời câu hỏi: *"Trong kịch bản chạy thử nghiệm vừa rồi, những cạnh nào ĐÃ THỰC SỰ có gói tin đi qua và mất bao nhiêu mili-giây?"*
                           - Do đó, nếu trên đồ thị tĩnh có cạnh `A → C` nhưng trong phiên chạy thử không thấy `Span` nào đi qua `C`, ta **không được vội kết luận dịch vụ `C` không tồn tại hay bị hỏng**, mà phải kết luận chính xác là: **"Kịch bản thử nghiệm vừa chạy chưa kích hoạt nhánh code gọi tới `C` (Chưa đủ bằng chứng Runtime)"**!

                        ```yaml
                        management:
                          tracing:
                            sampling:
                              probability: 1.0
                          otlp:
                            tracing:
                              endpoint: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:http://otel-collector:4318/v1/traces}
                        ```
                        """
                ),
                new LessonSpec(
                        "java-a01",
                        "Bài 6.2 (java-a01): Kim tự tháp kiểm thử (Unit, @WebMvcTest, Testcontainers PostgreSQL & Contract Test)",
                        "Thiết kế chiến lược kiểm thử 4 tầng phát hiện lỗi SQL/Flyway với Testcontainers và lệch JSON Contract.",
                        55,
                        """
                        # 📖 BÀI 6.2 (`java-a01`): CHIẾN LƯỢC KIỂM THỬ MICROSERVICES (`UNIT`, `WEB SLICE`, `TESTCONTAINERS POSTGRESQL` & `CONTRACT TEST`)

                        ### 1. Kim Tự Tháp Kiểm Thử Hiện Đại Cho Dịch Vụ Spring Boot
                        Theo Chương 9 & Chương 10 cuốn *Microservices Patterns* (Chris Richardson) và tài liệu [Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html):

                        | Tầng Kiểm Thử | Công Cụ Chuẩn Trong Spring Boot 3 | Mục Tiêu Phát Hiện Lỗi | Giới Hạn Nếu Chỉ Dùng Tầng Này |
                        | :--- | :--- | :--- | :--- |
                        | **1. Unit Test (Kiểm thử đơn vị)** | `JUnit 5` + `Mockito` | Kiểm tra cực nhanh (vài mili-giây) các quy tắc quyết định nghiệp vụ bên trong `Domain Aggregate` (`Order`) và `Application Service`. | Không phát hiện được lỗi viết sai đường dẫn HTTP, lỗi JSON mapping hay lỗi cú pháp SQL thực tế. |
                        | **2. Web Slice Test (Kiểm thử tầng Web)** | `@WebMvcTest` + `MockMvc` | Kiểm tra định tuyến URL, kiểm tra dữ liệu đầu vào (`@Valid`), mã trạng thái HTTP (`200`, `400`, `401`, `403`, `404`), và cấu trúc JSON trả về theo [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html). | Repository bị mock nên không kiểm tra được câu lệnh SQL hay migration. |
                        | **3. Data / Integration Test trên Engine Thật** | `@SpringBootTest` / `@DataJpaTest` + **`Testcontainers PostgreSQL`** | Khởi chạy một container PostgreSQL thật cô lập để kiểm tra các tập tin `Flyway Migration`, cú pháp SQL đặc thù của PostgreSQL (`JSONB`, `ON CONFLICT`), khóa giao dịch và ràng buộc `UNIQUE`. | Chạy chậm hơn Unit Test vài giây vì cần khởi tạo container DB. |
                        | **4. Consumer-Driven Contract Test (Kiểm thử Hợp đồng)** | `Spring Cloud Contract` / `Pact` | Đảm bảo khi dịch vụ cung cấp (`Provider` — `payment-service`) sửa đổi API, nó vẫn không làm gãy cấu trúc trường dữ liệu mà các dịch vụ tiêu thụ (`Consumer` — `order-service`) đang kỳ vọng, cả ở ca thành công lẫn ca lỗi! | Không thay thế cho kiểm thử nghiệp vụ nội bộ của từng dịch vụ. |

                        ```java
                        package com.mavis.ecommerce.order.integration;

                        import org.junit.jupiter.api.Test;
                        import org.springframework.boot.test.context.SpringBootTest;
                        import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
                        import org.testcontainers.containers.PostgreSQLContainer;
                        import org.testcontainers.junit.jupiter.Container;
                        import org.testcontainers.junit.jupiter.Testcontainers;

                        @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
                        @Testcontainers
                        class OrderPostgreSqlIntegrationTest {

                            // Tự động khởi chạy PostgreSQL 16 thật trong Docker và nối thẳng vào Spring DataSource!
                            @Container
                            @ServiceConnection
                            static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

                            @Test
                            void flywayMigrationsAndUniqueOrderConstraintWorkOnRealPostgres() {
                                // Kiểm chứng toàn bộ Flyway V1..Vn chạy sạch và kiểm tra ràng buộc UNIQUE thật trên PostgreSQL
                            }
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-a03",
                        "Bài 6.3 (java-a03): Tiêu chuẩn Production-Ready Microservices (Health Probes & Chống High Cardinality)",
                        "Phân biệt Liveness vs Readiness Probes, ngăn bùng nổ High Cardinality Metrics và rò rỉ PII trong Baggage/Log.",
                        55,
                        """
                        # 📖 BÀI 6.3 (`java-a03`): TIÊU CHUẨN `PRODUCTION-READY MICROSERVICES` (SUSAN FOWLER) — `HEALTH PROBES`, `CARDINALITY` & TRIỂN KHAI AN TOÀN

                        ### 1. Phân Biệt `Liveness Probe` (Còn Sống) Với `Readiness Probe` (Sẵn Sàng Nhận Tải)
                        Theo Chương 3, 4 & 7 cuốn *Production-Ready Microservices* (Susan J. Fowler) và tài liệu [Spring Boot Observability & Actuator](https://docs.spring.io/spring-boot/reference/actuator/observability.html), một dịch vụ đạt chuẩn vận hành thực tế phải cung cấp 2 đầu mối kiểm tra sức khỏe phục vụ cho **hai quyết định hoàn toàn khác nhau** của hệ thống điều phối (Kubernetes / Load Balancer):
                        1. **`Liveness Probe` (`/actuator/health/liveness` — Ứng dụng còn sống không?)**:
                           - Kiểm tra xem tiến trình JVM của ứng dụng có bị treo cứng (*Deadlock*) hay hỏng hoàn toàn không.
                           - **Quyết định**: Nếu `Liveness` báo `DOWN`, hệ thống điều phối sẽ **khởi động lại (Kill & Restart) container đó**.
                        2. **`Readiness Probe` (`/actuator/health/readiness` — Ứng dụng có sẵn sàng nhận lưu lượng khách hàng không?)**:
                           - Kiểm tra xem ứng dụng đã nạp xong cấu hình, kết nối được tới Database/Broker thiết yếu và sẵn sàng xử lý request hay chưa.
                           - **Quyết định**: Nếu `Readiness` báo `DOWN` (ví dụ Database đang bảo trì 30 giây), bộ cân bằng tải sẽ **tạm thời ngắt không chuyển lưu lượng request mới vào instance này** (nhưng **KHÔNG giết container**), chờ khi kết nối hồi phục thì tự động đưa instance trở lại nhận tải!

                        ### 2. Hai Cạm Bẫy Vận Hành Cần Tránh Tuyệt Đối Trong `Observability` (`java-a03`)
                        1. **Cấm gắn Định danh Không Giới hạn (`Unbounded ID` như `userId`, `orderId`, `email`) làm Nhãn của Metric (`Metric Tag / Label`)**:
                           - Trong hệ thống thu thập Metric (Micrometer / Prometheus), mỗi tổ hợp nhãn (`Tag`) mới sẽ tạo ra một chuỗi thời gian (*Time Series*) riêng trong bộ nhớ RAM. Nếu bạn gắn `userId` (có 1 triệu người dùng) làm nhãn của Metric (`counter("orders.placed", "userId", userId)`), nó sẽ tạo ra **1 triệu chuỗi thời gian (High Cardinality Explosion)** làm tràn bộ nhớ sập luôn máy chủ giám sát, đồng thời làm rò rỉ thông tin cá nhân!
                           - **Cách làm đúng**: Nhãn của Metric chỉ được dùng cho tập giá trị hữu hạn nhỏ (như `status="200"`, `method="POST"`, `service="order-service"`), còn `userId` / `orderId` chỉ được phép ghi trong **Span Attribute (đã kiểm soát)** hoặc **Log**!
                        2. **Không đưa Thông tin Nhạy cảm (`Credentials`, `JWT Token`, `PII`) vào `OpenTelemetry Baggage` hoặc `Log`**:
                           - `Baggage` được truyền tự động qua các HTTP Header sang mọi dịch vụ hạ nguồn; đặt token hay mật khẩu vào đó sẽ làm lộ thông tin sang các dịch vụ không được phép.

                        ```yaml
                        management:
                          endpoint:
                            health:
                              probes:
                                enabled: true
                          health:
                            livenessstate:
                              enabled: true
                            readinessstate:
                              enabled: true
                        ```
                        """
                )
        );
    }

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m6-q1",
                        "Trong chuẩn OpenTelemetry, một Distributed Trace được cấu thành từ những phần tử nào?",
                        "SINGLE_CHOICE",
                        List.of("Danh sách roles",
                                "Tập hợp các Span có liên kết nhân quả cha-con (parentSpanId -> spanId) chung traceId",
                                "Danh sách PDF",
                                "Ảnh biểu tượng trình duyệt"),
                        1,
                        "Mỗi chặng xử lý sinh ra một Span gắn chung traceId và nối cây qua parentSpanId.", 1),
                new QuizQuestionSpec("m6-q2",
                        "Để so sánh p95 Latency trước và sau Scale Replicas một cách khoa học, điều kiện BẮT BUỘC là gì?",
                        "SINGLE_CHOICE",
                        List.of("Chỉ gửi 1 request",
                                "Duy trì mức tải Workload và thời gian đo tương đương, thu thập đủ Sample Size và ghi kèm Error Rate",
                                "Chỉ nhìn màu sơ đồ",
                                "Đổi tên dịch vụ"),
                        1,
                        "Phân vị p95 chỉ có ý nghĩa thống kê khi mẫu đủ lớn dưới cùng mức tải chuẩn.", 1),
                new QuizQuestionSpec("m6-q3",
                        "Nếu cạnh A -> B có trong mô hình tĩnh nhưng KHÔNG có Span đi qua B lúc chạy kịch bản thử nghiệm, kết luận đúng là gì?",
                        "SINGLE_CHOICE",
                        List.of("Chắc chắn B đã bị xóa",
                                "Tất cả API bị hỏng",
                                "Chưa đủ bằng chứng Runtime cho cạnh đó (kịch bản chạy thử chưa kích hoạt nhánh gọi tới B)",
                                "Hệ thống không dùng Java"),
                        2,
                        "Mô hình tĩnh biểu diễn khả năng thiết kế; Runtime Trace chỉ ghi nhánh thực sự được kích hoạt bởi request thử.", 1),
                new QuizQuestionSpec("m6-q4",
                        "Mô hình kiến trúc tĩnh trích xuất từ mã nguồn và cấu hình thể hiện điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Số người online lúc này",
                                "Cấu trúc thành phần và kết nối có khả năng xảy ra tại Commit/Snapshot đã phân tích",
                                "Độ trễ Internet toàn cầu",
                                "RAM trống Production"),
                        1,
                        "Static Analysis chỉ ra cấu trúc thiết kế và phụ thuộc mã nguồn mà không cần chạy ứng dụng.", 1),
                new QuizQuestionSpec("m6-q5",
                        "Loại kiểm thử nào phát hiện tốt nhất lỗi SQL PostgreSQL (JSONB, ON CONFLICT) và lỗi Flyway Migration?",
                        "SINGLE_CHOICE",
                        List.of("Unit Test mock toàn bộ Repository",
                                "UI Snapshot Test",
                                "Integration Test chạy trên PostgreSQL engine thật với Testcontainers",
                                "Kiểm tra chính tả README"),
                        2,
                        "Chỉ chạy SQL & Flyway trực tiếp trên container PostgreSQL thật mới phát hiện lỗi engine DB.", 1),
                new QuizQuestionSpec("m6-q6",
                        "Khi Provider sửa Response Contract của REST API, họ cần kiểm tra gì để không làm gãy Consumers?",
                        "SINGLE_CHOICE",
                        List.of("Đếm dòng code",
                                "Kiểm tra tương thích hợp đồng với toàn bộ Consumers cho cả 2xx thành công lẫn 4xx/5xx báo lỗi",
                                "Trả 200 rỗng",
                                "Đổi tên biến cục bộ"),
                        1,
                        "API Contract bao gồm schema đầu vào, phản hồi thành công và cả cấu trúc lỗi 4xx/5xx.", 1),
                new QuizQuestionSpec("m6-q7",
                        "Tại sao trong kiểm thử tự động Microservices cần bộ dữ liệu mẫu cố định (Deterministic Test Fixtures)?",
                        "SINGLE_CHOICE",
                        List.of("Để mọi lần chạy lại trên mọi máy và CI đều tái lập chính xác cùng hành vi, loại bỏ flaky tests",
                                "Tự sinh Production secret",
                                "Khỏi cần assertEquals",
                                "Tăng dung lượng đĩa"),
                        0,
                        "Deterministic Fixture đảm bảo tính tái lập 100% khi kiểm chứng kết quả và hồi quy.", 1),
                new QuizQuestionSpec("m6-q8",
                        "Đầu mối Readiness Probe (/actuator/health/readiness) giúp hệ thống điều phối quyết định điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Kiểm tra chính tả DB",
                                "Đổi Java sang Python",
                                "Quyết định instance đã sẵn sàng nhận lưu lượng (traffic) hay cần tạm ngắt khỏi danh sách chia tải",
                                "Xóa tài khoản Admin"),
                        2,
                        "Readiness quyết định việc điều phối traffic vào instance (khác với Liveness quyết định restart).", 1),
                new QuizQuestionSpec("m6-q9",
                        "Vì sao CẤM gắn userId, orderId, email làm Metric Tag/Label trong Micrometer/Prometheus?",
                        "SINGLE_CHOICE",
                        List.of("Micrometer cấm chuỗi",
                                "Gây bùng nổ High Cardinality làm tràn RAM giám sát và có nguy cơ rò rỉ PII",
                                "Đổi GET sang DELETE",
                                "Đổi màu giao diện"),
                        1,
                        "Mỗi giá trị tag duy nhất sinh 1 time-series riêng; ID không giới hạn gây tràn bộ nhớ.", 1),
                new QuizQuestionSpec("m6-q10",
                        "Hai dịch vụ order-service và payment-service dựa vào cơ chế nào để nối các Span thành cùng 1 Distributed Trace?",
                        "SINGLE_CHOICE",
                        List.of("Tên file pom.xml giống nhau",
                                "Trace Context Propagation qua HTTP/Message Header chuẩn W3C traceparent chứa traceId & parentSpanId",
                                "Màu icon Docker",
                                "Đoán theo tên hàm"),
                        1,
                        "W3C Trace Context (traceparent) truyền traceId & spanId xuyên ranh giới dịch vụ chính xác tuyệt đối.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 6 (Tổng kết): Hồ sơ Production-Readiness Review (PRR)",
                "Lập hồ sơ PRR gồm Ma trận kiểm thử 4 tầng, Health Probes + Observability an toàn và quy trình Chaos/Scale Before vs After.",
                """
                ### Đề bài Tự luận Tổng kết Khóa học: Hồ sơ Đánh giá Sẵn sàng Sản xuất (`Production-Readiness Review — PRR`)
                Theo đúng tinh thần cuốn *Production-Ready Microservices* (Susan J. Fowler), trước khi hệ thống Thương mại điện tử gồm 4 dịch vụ (`api-gateway`, `order-service`, `payment-service`, `inventory-service`) được phép phát hành chính thức lên môi trường Production phục vụ 100.000 khách hàng, Kiến trúc sư trưởng yêu cầu bạn lập **Hồ sơ Nghiệm thu Sẵn sàng Sản xuất (`PRR Document`)**.

                **Yêu cầu bài viết tự luận tổng kết (500 – 800 từ)**:
                1. **Ma trận Kiểm thử 4 Tầng (`Testing Matrix`)**: Hãy mô tả cụ thể bạn sẽ viết những bài test nào ở từng tầng (*Unit Test*, *@WebMvcTest*, *Testcontainers PostgreSQL Integration Test*, và *Contract Test*) cho tính năng Đặt hàng & Thanh toán để đảm bảo không bao giờ xảy ra lỗi tạo đơn trùng hoặc lỗi lệch hợp đồng JSON giữa `order-service` và `payment-service`.
                2. **Thiết kế Cấu hình `Health Probes` & `Observability` An toàn**:
                   - Phân biệt rõ cách cấu hình `/actuator/health/liveness` và `/actuator/health/readiness` cho `order-service` khi cơ sở dữ liệu `order-db` bị mất kết nối tạm thời trong 20 giây (tại sao không được để Kubernetes giết và khởi động lại `order-service` trong lúc đó?).
                   - Liệt kê các nhãn (`Tags`) ĐƯỢC PHÉP gắn và các trường CẤM gắn vào Metric `http.server.requests`, cùng quy tắc che giấu thông tin nhạy cảm (`Secret & PII Redaction`) trong `OpenTelemetry Spans` và `Logs`.
                3. **Phương án Thực nghiệm Hạ tầng Trước/Sau (`Before vs After Chaos & Scale Experiment`)**: Trình bày quy trình chuẩn để thực hiện một phép thử nhân bản `inventory-service` từ `1` lên `4` instances và ngắt thử `payment-service`: bạn sẽ cố định những biến số nào, thu thập những chỉ số nào (`Sample Count`, `p95 Latency`, `Error Rate`, `Trace ID`), và dựa vào đâu để kết luận hệ thống đã đạt chuẩn *Production-Ready*.
                """,
                List.of(
                        new RubricCriterion("1. Chiến lược Kiểm thử 4 Tầng & Testcontainers", 35,
                                "Phân định rõ trách nhiệm của Unit, Web Slice, Testcontainers PostgreSQL (kiểm tra Flyway + Unique Constraint) và Consumer-Driven Contract Test."),
                        new RubricCriterion("2. Thiết kế Liveness/Readiness & Chống High Cardinality", 35,
                                "Giải thích chuẩn xác vai trò của Readiness (ngắt tải tạm thời thay vì restart container) và quy tắc cấm dùng userId/orderId làm nhãn Metric."),
                        new RubricCriterion("3. Phương pháp Đo lường Thực nghiệm Before vs After", 30,
                                "Nêu rõ yêu cầu cố định Workload, kích thước mẫu đủ lớn để tính p95, mã traceId đối chiếu và phân biệt rõ bằng chứng tĩnh với bằng chứng Runtime.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "RUNTIME_LAB",
                "Mô hình Trực quan #5: Nghiệm thu OpenTelemetry Spans Trước/Sau Scale trên 2D Studio",
                "Chạy Baseline traffic, Scale Replicas & Stop/Start service trên 2D Studio Live, kiểm tra Causal Spans & Before/After.",
                true,
                List.of("C4_CONTAINER", "RUNTIME_PROCESS")
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                6,
                "Chương 6 · OpenTelemetry, Testcontainers / Contract Test & Tiêu chuẩn Production-Ready",
                "Nắm vững 3 trụ cột OpenTelemetry, kiểm thử 4 tầng với Testcontainers và nghiệm thu vận hành Production-Ready (PRR).",
                "Lab 06 · OpenTelemetry Causal Spans & Production-Readiness Studio",
                "Thực hành đối chiếu p95 Latency, Throughput và cây nhân quả Spans Trước/Sau khi Scale Replicas trên 2D Studio Live.",
                "java-12",
                lessons(),
                quizQuestions(),
                essay(),
                visualLab()
        );
    }
}
