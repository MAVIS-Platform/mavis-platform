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
                        # Bài 6.1: OpenTelemetry & Đánh giá Thực nghiệm Before vs After

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Thiết lập quan sát phân tán chuẩn **OpenTelemetry (Traces, Metrics, Logs)** qua header W3C `traceparent`.
                        - Thực hiện đánh giá trước/sau (`Before vs After`) khoa học và diễn giải trung thực các cạnh chưa có dữ liệu runtime (`INCONCLUSIVE` / thiếu bằng chứng runtime).

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Trụ cột / Chỉ số | Vai trò trong kiểm toán Runtime | Quy tắc kết luận khoa học |
                        | :--- | :--- | :--- |
                        | **Distributed Traces (`Span`)** | Dựng cây nhân quả `parentSpanId -> spanId` chung `traceId` | Tĩnh có `A -> C` nhưng Runtime chưa đi qua `C` => **Chưa đủ bằng chứng runtime cho nhánh `C`** |
                        | **Metrics (`p95`, Error %)** | Định lượng hiệu năng đuôi & ổn định sau scale | Bắt buộc giữ nguyên `Workload`, thời gian đo & `Sample Count` giữa Before vs After |
                        | **Structured Logs** | Ghi ngữ cảnh chi tiết gắn kèm `traceId`, `spanId` | Tuyệt đối không log token, password, PII |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```yaml
                        management:
                          tracing:
                            sampling:
                              probability: 1.0
                          otlp:
                            tracing:
                              endpoint: ${OTEL_EXPORTER_OTLP_TRACES_ENDPOINT:http://otel-collector:4318/v1/traces}
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Bẫy 1-Trace Benchmark**: Tuyệt đối không kết luận `p95 Latency` hay hiệu quả scale replicas chỉ dựa trên 1 request đơn lẻ!
                        """
                ),
                new LessonSpec(
                        "java-a01",
                        "Bài 6.2 (java-a01): Kim tự tháp kiểm thử (Unit, @WebMvcTest, Testcontainers PostgreSQL & Contract Test)",
                        "Thiết kế chiến lược kiểm thử 4 tầng phát hiện lỗi SQL/Flyway với Testcontainers và lệch JSON Contract.",
                        55,
                        """
                        # Bài 6.2: Chiến lược Kiểm thử Microservices 4 Tầng

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Phối hợp hiệu quả 4 tầng kiểm thử từ nhanh tới thật: `Unit -> Web Slice -> PostgreSQL Integration -> Contract Test`.
                        - Dùng PostgreSQL thật (thay cho H2) để phát hiện lỗi kiểu `JSONB`, `ON CONFLICT`, Flyway migration trước khi deploy Production.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Tầng kiểm thử | Công cụ Java / Spring | Bắt được lỗi nào? | Điểm mù cần tầng trên bù đắp |
                        | :--- | :--- | :--- | :--- |
                        | **1. Unit Test** | JUnit 5 + Mockito | Sai logic domain, thuật toán Reverse BFS | Không phát hiện sai SQL PostgreSQL hay Spring mapping |
                        | **2. Web Slice Test** | `@WebMvcTest` + `MockMvc` | Sai URL mapping, `@Valid`, mã HTTP 400/403 | Không test được constraint DB |
                        | **3. DB/Migration Test** | PostgreSQL thật / Testcontainers | Sai Flyway SQL, `pgcrypto`, `JSONB`, `UNIQUE` | Chậm hơn unit test nếu lạm dụng |
                        | **4. Contract Test** | Spring Cloud Contract / Pact | Lệch tên field JSON (`points` vs `weightPoints`) hoặc payload lỗi `4xx` | Cần đồng bộ phiên bản contract CI |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        @SpringBootTest
                        class MigrationAndCourseRepositoryTest {
                            @Test
                            void flywayV43SeedsAccountsAndCourse() {
                                // Xác minh migration thật trên PostgreSQL chạy lặp lại idempotent
                            }
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - Mock có thể xanh 100% trong khi PostgreSQL thật lại nổ `column does not exist` — vì vậy luôn cần cả schema validation / DB migration test trên CI!
                        """
                ),
                new LessonSpec(
                        "java-a03",
                        "Bài 6.3 (java-a03): Tiêu chuẩn Production-Ready Microservices (Health Probes & Chống High Cardinality)",
                        "Phân biệt Liveness vs Readiness Probes, ngăn bùng nổ High Cardinality Metrics và rò rỉ PII trong Baggage/Log.",
                        55,
                        """
                        # Bài 6.3: Tiêu chuẩn Production-Ready Microservices (Susan Fowler)

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Đạt tiêu chuẩn vận hành thực tế (**Production-Readiness**) về tính sẵn sàng (`Availability`), khả năng chịu lỗi và quan sát tài nguyên.
                        - Cấu hình đúng `Liveness` vs `Readiness` Probes trong Kubernetes/Docker và chặn triệt để lỗi **High Cardinality Metrics**.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Probe / Quy tắc | Endpoint Actuator | Hệ quả khi báo `DOWN` | Sai lầm chết người |
                        | :--- | :--- | :--- | :--- |
                        | **Liveness Probe** | `/actuator/health/liveness` | Orchestrator **RESTART container** | Nối kiểm tra DB ngoài vào Liveness khiến toàn cụm restart vòng lặp khi DB chớp tắt |
                        | **Readiness Probe** | `/actuator/health/readiness` | Load Balancer **ngừng gửi traffic** vào pod đó | Không cấu hình Readiness nên request vẫn rớt vào pod chưa kịp boot xong |
                        | **Metric Cardinality** | `MeterRegistry.counter(...)` | Giữ RAM Prometheus ổn định nếu tag hữu hạn | Gắn `userId`, `orderId`, `email` làm tag gây OOM Prometheus & lộ PII |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
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

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **An toàn OpenTelemetry Baggage & Logs**: Tuyệt đối không đưa JWT, API key, hay số thẻ thanh toán vào `Baggage` hoặc log span vì Baggage được lan truyền qua mọi hop HTTP!
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
                ### Đề bài Tự luận Tổng kết Môn: Production-Readiness Review (PRR)
                Trước khi phát hành hệ thống gồm `api-gateway`, `order-service`, `payment-service`, `inventory-service` cho 100.000 khách hàng, hãy lập **Hồ sơ Nghiệm thu PRR (500 – 800 từ)**:
                1. **Ma trận Kiểm thử 4 Tầng**: Chi tiết Unit, `@WebMvcTest`, `Testcontainers PostgreSQL` (Flyway + Unique Constraint), và `Contract Test`.
                2. **Cấu hình `Health Probes` & `Observability` An toàn**: Giải thích xử lý khi DB `order-db` mất kết nối 20s giữa `Liveness` vs `Readiness`, liệt kê Tag metric được phép/bị cấm, và quy tắc che Secret/PII.
                3. **Phương án Thực nghiệm `Before vs After`**: Quy trình đo khi Scale `inventory-service` từ `1 -> 4` replicas và Stop `payment-service` (`Workload`, `Sample Count`, `p95 Latency`, `Error Rate`, `traceId`).
                """,
                List.of(
                        new RubricCriterion("1. Chiến lược Kiểm thử 4 Tầng & Testcontainers", 35,
                                "Phân định đúng trách nhiệm từng tầng, kiểm tra Flyway + Unique Constraint bằng PostgreSQL thật và Contract Test."),
                        new RubricCriterion("2. Health Probes (Liveness/Readiness) & Chống High Cardinality", 35,
                                "Giải thích chính xác vai trò Readiness ngắt tải tạm thời thay vì kill container và cấm userId/orderId trong Metric Tags."),
                        new RubricCriterion("3. Phương pháp Đo lường Before vs After", 30,
                                "Cố định Workload, thu thập đủ Sample Count cho p95, đối chiếu traceId và phân biệt bằng chứng tĩnh vs runtime.")
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
