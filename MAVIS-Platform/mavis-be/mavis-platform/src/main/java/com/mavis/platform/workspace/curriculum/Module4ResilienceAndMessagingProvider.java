package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 4: Fault Tolerance (Resilience4j Circuit Breaker, Timeout, Retry, Bulkhead) & Async Messaging.
 */
public final class Module4ResilienceAndMessagingProvider {
    private Module4ResilienceAndMessagingProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-07",
                        "Bài 4.1 (java-07): Chống sập dây chuyền với Resilience4j Circuit Breaker & Fallback",
                        "Vận dụng máy trạng thái CLOSED -> OPEN -> HALF_OPEN và nguyên tắc Fallback bảo toàn ngữ nghĩa thật.",
                        55,
                        """
                        # 📖 Bài 4.1: Resilience4j Circuit Breaker & Fallback chuẩn nghiệp vụ

                        ## 1. Máy trạng thái `CLOSED` -> `OPEN` -> `HALF_OPEN`
                        - Khi `payment-service` treo khiến thread pool của `order-service` cạn sạch -> xảy ra **Cascading Failure**.
                        - **CLOSED**: Cho phép gọi bình thường; theo dõi trượt cửa sổ tỷ lệ lỗi/cuộc gọi chậm.
                        - **OPEN**: Chặn gọi mạng sớm (`Fail-fast` trong 2ms) và chuyển ngay vào `fallbackMethod`.
                        - **HALF_OPEN**: Sau `waitDurationInOpenState`, thả N request thăm dò sức khỏe dịch vụ đích.

                        ## 2. Nguyên tắc viết `Fallback` an toàn
                        - **Cấm trả về thành công giả** (`status = PAID`) khi thanh toán thất bại! Phải trả `QUEUED_FOR_ASYNC_PAYMENT` hoặc `HTTP 503`.
                        """
                ),
                new LessonSpec(
                        "java-08",
                        "Bài 4.2 (java-08): Ngân sách Timeout, Retry + Exponential Backoff/Jitter & Bulkhead",
                        "Tính End-to-End Timeout Budget, quy tắc Idempotency cho Retry, chống Retry Storm bằng Jitter và Bulkhead.",
                        50,
                        """
                        # 📖 Bài 4.2: Timeout Budget, Retry + Jitter & Bulkhead

                        ## 1. Toán học Ngân sách Thời gian Đầu cuối
                        - Nếu Gateway cho tối đa `3000ms`, tổng thời gian của mọi lần `attempts * perCallTimeout + backoffs` **BẮT BUỘC < 3000ms**.
                        - **Cấm `Retry` cho thao tác ghi không lũy đẳng (Non-idempotent)** nếu không có `Idempotency-Key`.
                        - **Exponential Backoff + Jitter**: Độ lệch ngẫu nhiên giúp tránh hiệu ứng sóng thần *Thundering Herd / Retry Storm*.
                        - **Bulkhead**: Cô lập slot / thread pool cho từng dịch vụ đích để 1 dịch vụ chậm không khóa chết toàn hệ thống.
                        """
                ),
                new LessonSpec(
                        "java-09",
                        "Bài 4.3 (java-09): Messaging bất đồng bộ RabbitMQ/Kafka & Idempotent Consumer",
                        "Phân biệt Publish != Eventual Consistency và thiết kế Idempotent Consumer với bảng processed_events.",
                        55,
                        """
                        # 📖 Bài 4.3: Event-Driven Messaging & Idempotent Consumer

                        ## 1. `At-Least-Once Delivery` & Bản tin trùng
                        - Broker đảm bảo giao tin ít nhất 1 lần: nếu Consumer xử lý xong mà rớt mạng chưa kịp gửi `ACK`, Broker sẽ **gửi lại lần 2**.
                        - `Publish thành công != Toàn hệ thống đã nhất quán`: Cần kiểm tra Consumer và `Dead-Letter Queue (DLQ)`.

                        ```sql
                        INSERT INTO processed_events (event_id, order_id, processed_at)
                        VALUES (?, ?, now())
                        ON CONFLICT (event_id) DO NOTHING;
                        ```
                        """
                )
        );
    }

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m4-q1",
                        "Khi Circuit Breaker chuyển sang trạng thái OPEN, hành vi chuẩn của dịch vụ gọi là gì?",
                        "SINGLE_CHOICE",
                        List.of("Tăng gấp 5 lần request",
                                "Ngừng gọi qua mạng, Fail-fast hoặc chạy Fallback ngay",
                                "Xóa DB dịch vụ đích",
                                "Gộp thành Monolith"),
                        1,
                        "Trạng thái OPEN cắt lời gọi mạng để bảo vệ thread pool và cho dịch vụ đích thời gian hồi phục.", 1),
                new QuizQuestionSpec("m4-q2",
                        "Trạng thái HALF_OPEN của Circuit Breaker dùng để làm gì?",
                        "SINGLE_CHOICE",
                        List.of("Thả một vài yêu cầu thăm dò xem dịch vụ đích đã phục hồi chưa trước khi đóng mạch lại",
                                "Đổi JWT secret",
                                "Tắt nửa số bảng PostgreSQL",
                                "Bỏ qua nửa số dòng code"),
                        0,
                        "HALF_OPEN kiểm tra sức khỏe thực tế của phụ thuộc bằng số lượng request thăm dò giới hạn.", 1),
                new QuizQuestionSpec("m4-q3",
                        "Nguyên tắc BẮT BUỘC khi thiết kế Fallback cho tính năng thanh toán lúc payment-service sập là gì?",
                        "SINGLE_CHOICE",
                        List.of("Trả về Thanh toán thành công 100%",
                                "Trả dữ liệu khách khác",
                                "Bảo toàn ngữ nghĩa thật (VD: PAYMENT_QUEUED hoặc báo lỗi 503), tuyệt đối không trả thành công giả",
                                "Trả 200 rỗng"),
                        2,
                        "Trả thành công giả cho giao dịch tài chính gây thất thoát và sai lệch dữ liệu nghiêm trọng.", 1),
                new QuizQuestionSpec("m4-q4",
                        "Để chứng minh Circuit Breaker thực sự đã sang trạng thái OPEN lúc runtime, cần bằng chứng nào?",
                        "SINGLE_CHOICE",
                        List.of("Chỉ nhìn annotation @CircuitBreaker trong code",
                                "Đọc Metric/Event chuyển trạng thái hoặc Runtime Trace trước và sau khi stop phụ thuộc",
                                "Xem tên dự án",
                                "Đếm DTO"),
                        1,
                        "Annotation chỉ là cấu hình; chuyển trạng thái OPEN phải được chứng minh qua Metric/Trace thực tế.", 1),
                new QuizQuestionSpec("m4-q5",
                        "Trước khi bật @Retry cho thao tác GHI (POST/PUT), bắt buộc phải kiểm tra yếu tố nào?",
                        "SINGLE_CHOICE",
                        List.of("Màu nút bấm",
                                "Tính lũy đẳng (Idempotency) và Idempotency-Key để tránh trừ tiền/tạo đơn 2 lần",
                                "Số file CSS",
                                "Hãng bàn phím"),
                        1,
                        "Thao tác ghi không lũy đẳng nếu retry khi timeout trả về có thể thực thi lặp lại 2 lần.", 1),
                new QuizQuestionSpec("m4-q6",
                        "Kết hợp Jitter vào Exponential Backoff khi Retry giúp giảm thiểu hiện tượng nào?",
                        "SINGLE_CHOICE",
                        List.of("Retry Storm / Thundering Herd — hàng loạt client cùng retry tại đúng 1 mili-giây",
                                "Giảm số bảng DB",
                                "Xóa độ trễ mạng vật lý",
                                "Nâng cấp JDK"),
                        0,
                        "Jitter rải đều thời điểm thử lại của các client theo độ lệch ngẫu nhiên.", 1),
                new QuizQuestionSpec("m4-q7",
                        "Mẫu Bulkhead trong Resilience4j giải quyết vấn đề gì?",
                        "SINGLE_CHOICE",
                        List.of("Tăng retry lên 100 lần",
                                "Cô lập tài nguyên (Thread Pool / Semaphore) theo từng phụ thuộc để lỗi 1 nơi không hút cạn toàn bộ dịch vụ",
                                "Gộp các DB",
                                "Thay thế HTTPS"),
                        1,
                        "Bulkhead ngăn 1 phụ thuộc chậm/treo làm tê liệt các luồng phục vụ nghiệp vụ khác.", 1),
                new QuizQuestionSpec("m4-q8",
                        "Khi Broker giao lại bản tin (Redelivery) mà Consumer KHÔNG lũy đẳng, hậu quả là gì?",
                        "SINGLE_CHOICE",
                        List.of("Tự rollback DB",
                                "Phát sinh tác dụng phụ trùng lặp (gửi 2 email, trừ kho 2 lần cho cùng đơn)",
                                "Không ảnh hưởng gì",
                                "Broker xóa code Consumer"),
                        1,
                        "At-Least-Once Delivery có thể giao lại bản tin nhiều lần nên Consumer phải tự chống trùng.", 1),
                new QuizQuestionSpec("m4-q9",
                        "Nên dùng gì làm khóa chống trùng (Deduplication Key) tại Idempotent Consumer?",
                        "SINGLE_CHOICE",
                        List.of("Mã màu UI Broker",
                                "Định danh duy nhất ổn định của sự kiện (eventId / messageId) gắn sẵn trong bản tin",
                                "System.currentTimeMillis() lúc nhận",
                                "Tên Docker image"),
                        1,
                        "eventId giữ nguyên qua mọi lần redelivery, cho phép bảng processed_events bắt trùng chính xác.", 1),
                new QuizQuestionSpec("m4-q10",
                        "order-service gọi rabbitTemplate.convertAndSend(...) thành công chứng minh được điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Mọi Consumer đã xử lý xong ngay lập tức",
                                "Chỉ chứng minh bản tin đã publish tới Broker; cần theo dõi Consumer span và DLQ để xác nhận toàn trình",
                                "HTTP luôn nhanh hơn Messaging",
                                "Consumer không bao giờ lỗi"),
                        1,
                        "Trong event-driven architecture, phát sự kiện và tiêu thụ sự kiện tách rời theo thời gian.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 4: Kiến trúc Chịu lỗi & Messaging cho Ngày hội Flash Sale",
                "Phân tách đồng bộ vs bất đồng bộ, tính toán Timeout/Retry Budget (< 3000ms) và thiết kế Circuit Breaker + Idempotent Consumer.",
                """
                ### Đề bài Tự luận Chương 4: Fault-Tolerant Architecture cho Flash Sale 11/11
                Dịch vụ `order-service` đang gọi đồng bộ tới `payment-service` (trễ tới 15s lúc quá tải), `loyalty-service`, và `notification-service`. Gateway SLA Timeout tối đa là **`3.000ms`**.

                **Yêu cầu bài viết (400 – 600 từ)**:
                1. Chỉ rõ dịch vụ nào chuyển sang **Messaging bất đồng bộ (RabbitMQ/Kafka)** và thiết kế bảng `processed_events` tại `notification-service`.
                2. Thiết lập thông số `TimeLimiter` & `Retry` cho cuộc gọi `payment-service` đảm bảo tổng thời gian xấu nhất **< 3.000ms**, kèm điều kiện `Idempotency-Key`.
                3. Thiết kế cấu hình `@CircuitBreaker` (bảo toàn ngữ nghĩa Fallback) và `@Bulkhead` cho `order-service`.
                """,
                List.of(
                        new RubricCriterion("1. Tách luồng bất đồng bộ & Idempotent Consumer", 35,
                                "Chuyển notification & loyalty sang Messaging, thiết kế bảng processed_events(event_id PK) + ON CONFLICT."),
                        new RubricCriterion("2. Toán học Timeout Budget & Idempotency-Key", 35,
                                "Tính đúng attempts * timeout + backoff < 3000ms và yêu cầu Idempotency-Key trước khi Retry."),
                        new RubricCriterion("3. Circuit Breaker Fallback & Bulkhead", 30,
                                "Cấu hình ngưỡng mở mạch, cô lập slot Bulkhead và Fallback không trả thành công giả.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "RUNTIME_LAB",
                "Mô hình Trực quan #3: Thực nghiệm Ngắt mạch Circuit Breaker & Stop/Scale trên 2D Studio",
                "Chạy lưu lượng Baseline trên 2D Studio, thử nghiệm Stop dịch vụ phụ thuộc và quan sát Fallback + Latency.",
                true,
                List.of("C4_CONTAINER", "RUNTIME_PROCESS")
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                4,
                "Chương 4 · Resilience4j (Circuit Breaker, Timeout, Retry, Bulkhead) & Messaging Bất Đồng Bộ",
                "Ngăn chặn Cascading Failure bằng Circuit Breaker/Bulkhead, tính toán Timeout Budget và xây dựng Idempotent Consumer.",
                "Lab 04 · Circuit Breaker Chaos & Resilient Fallback Studio",
                "Thực hành kịch bản Stop/Start/Scale dịch vụ trên 2D Studio Live để kiểm chứng khả năng chịu lỗi và Fallback.",
                "java-07",
                lessons(),
                quizQuestions(),
                essay(),
                visualLab()
        );
    }
}
