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
                        # 📖 Bài 6.1: OpenTelemetry & Đánh giá Thực nghiệm Before vs After

                        ## 1. 3 Trụ cột Quan sát Hệ thống
                        - **Distributed Traces**: Tập hợp các **`Span`** liên kết cha–con (`parentSpanId -> spanId`) chung một `traceId` qua chuẩn W3C **`traceparent`**.
                        - **Metrics**: Thông lượng, Error Rate %, **p95 / p99 Latency**.
                        - **Structured Logs**: Gắn kèm `traceId` và `spanId`.

                        ## 2. Nguyên tắc Đối chiếu `Before vs After` & Tĩnh vs Runtime
                        - Không bao giờ dùng 1 trace đơn lẻ để kết luận `p95 Latency`! Phải giữ cố định `Workload`, thời gian đo và ghi nhận rõ `Sample Count`.
                        - Thấy cạnh $A \rightarrow C$ trên mô hình tĩnh nhưng chưa thấy span đi qua $C$ ở runtime $\rightarrow$ Kết luận **"Chưa đủ bằng chứng Runtime cho nhánh gọi C"**, không vội kết luận C hỏng!
                        """
                ),
                new LessonSpec(
                        "java-a01",
                        "Bài 6.2 (java-a01): Kim tự tháp kiểm thử (Unit, @WebMvcTest, Testcontainers PostgreSQL & Contract Test)",
                        "Thiết kế chiến lược kiểm thử 4 tầng phát hiện lỗi SQL/Flyway với Testcontainers và lệch JSON Contract.",
                        55,
                        """
                        # 📖 Bài 6.2: Chiến lược Kiểm thử Microservices 4 Tầng

                        ## 1. 4 Tầng kiểm thử chuẩn Spring Boot 3
                        1. **Unit Test (`JUnit 5 + Mockito`)**: Kiểm tra nhanh domain aggregate & service.
                        2. **Web Slice Test (`@WebMvcTest + MockMvc`)**: URL mapping, `@Valid`, HTTP status, JSON schema.
                        3. **Data/Integration Test (`Testcontainers PostgreSQL`)**: Khởi chạy PostgreSQL container thật kiểm tra Flyway migration, `JSONB`, `ON CONFLICT`, `UNIQUE` constraint.
                        4. **Consumer-Driven Contract Test (`Spring Cloud Contract / Pact`)**: Xác nhận Provider giữ tương thích cả payload `2xx` lẫn payload lỗi `4xx/5xx` với mọi Consumer.
                        """
                ),
                new LessonSpec(
                        "java-a03",
                        "Bài 6.3 (java-a03): Tiêu chuẩn Production-Ready Microservices (Health Probes & Chống High Cardinality)",
                        "Phân biệt Liveness vs Readiness Probes, ngăn bùng nổ High Cardinality Metrics và rò rỉ PII trong Baggage/Log.",
                        55,
                        """
                        # 📖 Bài 6.3: Tiêu chuẩn Production-Ready Microservices (Susan Fowler)

                        ## 1. `Liveness Probe` vs `Readiness Probe`
                        - **`Liveness` (`/actuator/health/liveness`)**: JVM có bị deadlock/sập hẳn không? `DOWN` -> Restart container.
                        - **`Readiness` (`/actuator/health/readiness`)**: Có sẵn sàng nhận tải không? Nếu DB bảo trì tạm thời -> `Readiness DOWN` giúp Load Balancer tạm rút traffic mà **không restart container**!

                        ## 2. Chống `High Cardinality Explosion` & An toàn Trace/Log
                        - **CẤM gắn `userId`, `orderId`, `email` làm Metric Tag/Label** (gây bùng nổ hàng triệu Time Series tràn RAM Prometheus và lộ PII). Chỉ dùng tập giá trị hữu hạn (`status`, `method`, `service`).
                        - Không đưa Token/Credentials vào `OpenTelemetry Baggage` hay `Logs`.
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
