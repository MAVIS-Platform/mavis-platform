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
                        # 📖 BÀI 4.1 (`java-07`): PHÒNG CHỐNG LỖI DÂY CHUYỀN VỚI `RESILIENCE4J CIRCUIT BREAKER` & `FALLBACK`

                        ### 1. Giải Phẫu Một Vụ Sập Dây Chuyền (`Cascading Failure`) & Máy Trạng Thái `Circuit Breaker`
                        Theo Chương 3 cuốn *Microservices Patterns* (Chris Richardson), Chương 5 cuốn *Mastering Microservices with Java* (Sourabh Sharma) và Chương 3 cuốn *Production-Ready Microservices* (Susan Fowler):
                        - Khi `order-service` gọi đồng bộ sang `payment-service` mà `payment-service` bị treo hoặc quá tải, nếu không có cơ chế bảo vệ, mọi luồng xử lý (*Worker Threads*) trong `order-service` sẽ bị kẹt cứng để chờ phản hồi. Chỉ sau vài giây, bể luồng (*Thread Pool*) của `order-service` cạn sạch, làm `order-service` và `api-gateway` chết theo dây chuyền!
                        - **Bộ ngắt mạch (`Circuit Breaker` — cài đặt bằng `Resilience4j` trong Spring Cloud Circuit Breaker)** hoạt động giống hệt chiếc cầu dao điện tự động trong nhà với **3 trạng thái**:

                        ```
                                             Tỷ lệ lỗi hoặc cuộc gọi chậm vượt ngưỡng
                                             (VD: failureRateThreshold >= 50% trong cửa sổ trượt 10 cuộc gọi)
                              +-------------------------------------------------------------------------+
                              |                                                                         v
                        +------------+                                                           +-------------+
                        |   CLOSED   |                                                           |    OPEN     |
                        | (Đóng mạch |                                                           | (Ngắt mạch  |
                        |  Gọi bình  |                                                           | Chặn gọi sớm|
                        |  thường)   |                                                           | -> Fallback)|
                        +------------+                                                           +-------------+
                              ^                                                                         |
                              |              Cho phép N cuộc gọi thăm dò (permittedCallsInHalfOpen)     |
                              |                      +--------------------------------------------------+
                              |                      v
                              |               +-------------+
                              +---------------|  HALF_OPEN  |
                               Thăm dò thành  | (Bán mở để  |---> Nếu thăm dò vẫn lỗi: Lập tức quay lại OPEN!
                               công -> Đóng!  |  thăm dò)   |
                                              +-------------+
                        ```

                        ### 2. Nguyên Tắc Thiết Kế `Fallback` Đúng Ngữ Nghĩa Nghiệp Vụ (Cấm Trả Thành Công Giả!)
                        - Một sai lầm rất nguy hiểm khi viết hàm `fallbackMethod` là: Khi `payment-service` bị sập, hàm fallback lại trả về `"status: PAID"` (thành công giả) khiến kho xuất hàng đi mà khách chưa hề trả tiền!
                        - **Quy tắc chuẩn (`java-07`)**: Hàm `Fallback` phải phản ánh trung thực **mức suy giảm dịch vụ có kiểm soát (*Graceful Degradation*)** và bảo toàn ngữ nghĩa thật của giao dịch. Ví dụ:
                          - Với thao tác **Đọc dữ liệu phụ trợ** (gợi ý sản phẩm, điểm thưởng): Có thể trả về dữ liệu từ bộ nhớ đệm (*Cache*) hoặc danh sách rỗng tạm thời.
                          - Với thao tác **Giao dịch quan trọng** (Thanh toán): Phải trả về trạng thái rõ ràng như **`PAYMENT_PENDING_VERIFICATION` / `QUEUED_FOR_ASYNC_PAYMENT`** (Đơn hàng đã được tiếp nhận và xếp hàng chờ xử lý thanh toán sau) hoặc báo lỗi `HTTP 503` thân thiện ngay lập tức trong `2ms` mà không làm treo `order-service`!

                        ```java
                        package com.mavis.ecommerce.order.infrastructure.resilience;

                        import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
                        import org.slf4j.Logger;
                        import org.slf4j.LoggerFactory;
                        import org.springframework.stereotype.Component;

                        @Component
                        public class ResilientPaymentGateway {

                            private static final Logger log = LoggerFactory.getLogger(ResilientPaymentGateway.class);
                            private final PaymentFeignClient paymentFeignClient;

                            public ResilientPaymentGateway(PaymentFeignClient paymentFeignClient) {
                                this.paymentFeignClient = paymentFeignClient;
                            }

                            @CircuitBreaker(name = "paymentServiceBreaker", fallbackMethod = "authorizePaymentFallback")
                            public PaymentResult authorize(AuthorizePaymentRequest request) {
                                return paymentFeignClient.authorizePayment(request);
                            }

                            /**
                             * Hàm Fallback bảo toàn đúng ngữ nghĩa nghiệp vụ:
                             * KHÔNG BAO GIỜ trả về "PAID" giả khi chưa thu được tiền!
                             * Trả về trạng thái QUEUED_FOR_ASYNC_PAYMENT để xử lý bất đồng bộ hoặc thông báo rõ cho người dùng.
                             */
                            public PaymentResult authorizePaymentFallback(AuthorizePaymentRequest request, Throwable cause) {
                                log.warn("Circuit Breaker paymentServiceBreaker kích hoạt cho orderId={}: {}",
                                        request.orderId(), cause.getMessage());
                                return new PaymentResult(
                                        request.orderId(),
                                        "QUEUED_FOR_ASYNC_PAYMENT",
                                        "Hệ thống thanh toán đang bận tạm thời. Đơn hàng của bạn đã được giữ chỗ và sẽ tự động xử lý lại."
                                );
                            }
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-08",
                        "Bài 4.2 (java-08): Ngân sách Timeout, Retry + Exponential Backoff/Jitter & Bulkhead",
                        "Tính End-to-End Timeout Budget, quy tắc Idempotency cho Retry, chống Retry Storm bằng Jitter và Bulkhead.",
                        50,
                        """
                        # 📖 BÀI 4.2 (`java-08`): NGÂN SÁCH THỜI GIAN (`TIMEOUT`), `RETRY + JITTER` & VÁCH NGĂN `BULKHEAD`

                        ### 1. Thiết Kế Ngân Sách Thời Gian Đầu Cuối (`End-to-End Timeout Budget`) & Nguy Cơ Khuếch Đại Tải Do `Retry`
                        Theo tài liệu [Build Resilient HTTP Apps](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience) và Chương 3–4 cuốn *Production-Ready Microservices* (Susan Fowler):
                        1. **Cách tính Ngân sách Thời gian (`Timeout Budget`)**:
                           - Giả sử `api-gateway` chỉ cho phép một yêu cầu từ người dùng chờ tối đa **`5000ms` (`Gateway Timeout`)**.
                           - Nếu ở bên dưới, `order-service` đặt timeout mỗi lần gọi `payment-service` là `2000ms` và cho phép thử lại 3 lần (`maxAttempts = 3`) với khoảng nghỉ giữa các lần là `500ms` và `1000ms`, thì **Tổng thời gian tối đa ở trường hợp xấu nhất (`Worst-Case Total Duration`)** là:

                             `T_max = (3 × 2000ms) + 500ms + 1000ms = 7500ms > 5000ms!`

                           - Hậu quả: Ở giây thứ 5, `api-gateway` đã cắt kết nối báo lỗi cho khách hàng, trong khi ở bên dưới `order-service` vẫn cố đấm ăn xôi bắn lần retry thứ 3 hoàn toàn vô ích! Vì vậy, **tổng thời gian của mọi lần thử và khoảng chờ (`Backoff`) phải luôn nhỏ hơn ngân sách thời gian đầu cuối (`End-to-End Budget`)**.
                        2. **Khi Nào ĐƯỢC `Retry` và Khi Nào CẤM `Retry`?**:
                           - **Thao tác Đọc (`GET`) hoặc Thao tác Ghi có Khóa Lũy đẳng (`Idempotency-Key`)**: Được phép `Retry` khi gặp lỗi mạng tạm thời.
                           - **Thao tác Ghi KHÔNG có tính lũy đẳng (Non-idempotent Write — ví dụ API trừ tiền không kiểm tra mã giao dịch trùng)**: **CẤM tự động `Retry`**, vì nếu gói tin đầu tiên đã trừ tiền xong nhưng chỉ bị rớt mạng ở chiều trả về, việc `Retry` sẽ trừ tiền khách hàng **2 lần**!
                        3. **`Exponential Backoff + Jitter` (Khoảng chờ tăng theo hàm mũ kèm độ lệch ngẫu nhiên)**:
                           - Nếu 1.000 clients cùng bị lỗi ở giây thứ 0 và tất cả đều hẹn đúng `1000ms` sau gọi lại cùng một lúc, chúng sẽ tạo thành một "đợt sóng thần" (**Retry Storm / Thundering Herd**) đánh sập luôn dịch vụ vừa mới hồi phục. Thêm **`Jitter` (độ lệch ngẫu nhiên `± 200ms`)** giúp rải đều các cuộc gọi thử lại theo thời gian.

                        ### 2. Cô Lập Tài Nguyên Bằng Vách Ngăn Khoang Tàu (`Bulkhead Pattern`)
                        - Tàu thủy được chia thành nhiều khoang kín nước bằng vách ngăn thép (*Bulkhead*): nếu một khoang bị thủng, nước chỉ ngập khoang đó chứ không làm chìm cả con tàu.
                        - Trong Microservices, `@Bulkhead` của `Resilience4j` chia nhỏ bể luồng hoặc giới hạn số cuộc gọi đồng thời (`maxConcurrentCalls`) cho từng dịch vụ phụ thuộc. Nhờ đó, dù `payment-service` có bị chậm đến mức chiếm hết 10 slot trong khoang của nó, thì các luồng còn lại của `order-service` vẫn phục vụ bình thường cho các tính năng tra cứu đơn hàng và kiểm tra kho!

                        ```yaml
                        resilience4j:
                          retry:
                            instances:
                              paymentClient:
                                max-attempts: 3
                                wait-duration: 150ms
                                enable-exponential-backoff: true
                                enable-randomized-wait: true
                        ```
                        """
                ),
                new LessonSpec(
                        "java-09",
                        "Bài 4.3 (java-09): Messaging bất đồng bộ RabbitMQ/Kafka & Idempotent Consumer",
                        "Phân biệt Publish != Eventual Consistency và thiết kế Idempotent Consumer với bảng processed_events.",
                        55,
                        """
                        # 📖 BÀI 4.3 (`java-09`): GIAO TIẾP BẤT ĐỒNG BỘ (`MESSAGING`) & XỬ LÝ BẢN TIN TRÙNG (`IDEMPOTENT CONSUMER`)

                        ### 1. Giao Tiếp Bất Đồng Bộ Hướng Sự Kiện (`Publisher → Broker → Consumer`)
                        Theo Chương 3 cuốn *Microservices Patterns* (Chris Richardson) và [Spring Cloud Stream](https://spring.io/projects/spring-cloud-stream/):
                        - Thay vì bắt khách hàng đứng chờ trên kết nối HTTP, dịch vụ phát hành (`Publisher / Producer`) đóng gói sự kiện (ví dụ `OrderCreatedEvent` kèm `eventId` duy nhất) và gửi vào một kênh tin (`Topic / Exchange` trên **RabbitMQ** hoặc **Apache Kafka**). Dịch vụ tiêu thụ (`Consumer`) sẽ nhận và xử lý sự kiện đó một cách độc lập.
                        - **Hai chân lý quan trọng khi phân tích hệ thống Messaging (`java-09`)**:
                          1. **"Publish thành công ≠ Toàn hệ thống đã nhất quán"**: Khi `order-service` gửi bản tin vào Broker thành công, điều đó mới chỉ chứng minh bước `Publish` đã hoàn tất; hệ thống chỉ đạt **Tính nhất quán cuối cùng (*Eventual Consistency*)** sau khi `Consumer` lấy bản tin ra xử lý xong mà không bị kẹt ở hàng đợi lỗi (*Dead-Letter Queue — DLQ*).
                          2. **Cơ chế giao nhận `At-Least-Once Delivery` luôn có khả năng giao trùng bản tin**: Hầu hết các Message Brokers (RabbitMQ, Kafka) đảm bảo giao bản tin *ít nhất một lần*. Nếu `Consumer` vừa xử lý xong nghiệp vụ nhưng rớt mạng đúng lúc chưa kịp gửi tín hiệu xác nhận (`ACK`) về cho Broker, Broker sẽ **gửi lại chính bản tin đó lần thứ 2**!

                        ### 2. Xây Dựng Bộ Tiêu Thụ Lũy Đẳng (`Idempotent Consumer`) Chống Trùng Sự Kiện
                        Để khi nhận cùng một `eventId` đến 2 hay 10 lần mà kết quả nghiệp vụ vẫn chỉ xảy ra **đúng 1 lần duy nhất**, `Consumer` phải sử dụng **Khóa chống trùng ổn định (`eventId` / `messageId`)** lưu trong cùng giao dịch Database với dữ liệu nghiệp vụ:

                        ```java
                        package com.mavis.ecommerce.notification.messaging;

                        import org.springframework.amqp.rabbit.annotation.RabbitListener;
                        import org.springframework.jdbc.core.JdbcTemplate;
                        import org.springframework.stereotype.Component;
                        import org.springframework.transaction.annotation.Transactional;
                        import java.util.UUID;

                        @Component
                        public class IdempotentOrderEventConsumer {

                            private final JdbcTemplate jdbc;

                            public IdempotentOrderEventConsumer(JdbcTemplate jdbc) {
                                this.jdbc = jdbc;
                            }

                            public record OrderPlacedEvent(UUID eventId, UUID orderId, String customerEmail) {}

                            @RabbitListener(queues = "order.notification.queue")
                            @Transactional
                            public void handleOrderPlaced(OrderPlacedEvent event) {
                                // Bước 1: Chèn eventId vào bảng processed_events có khóa chính (PRIMARY KEY) là event_id.
                                // Nếu eventId đã tồn tại (do Broker gửi lại lần 2), câu lệnh INSERT ON CONFLICT DO NOTHING trả về 0!
                                int inserted = jdbc.update(\"\"\"
                                        INSERT INTO processed_events (event_id, order_id, processed_at)
                                        VALUES (?, ?, now())
                                        ON CONFLICT (event_id) DO NOTHING
                                        \"\"\", event.eventId(), event.orderId());

                                if (inserted == 0) {
                                    // Sự kiện trùng lặp -> Bỏ qua an toàn (Idempotent No-Op)!
                                    return;
                                }

                                // Bước 2: Thực hiện tác vụ nghiệp vụ đúng 1 lần duy nhất
                                jdbc.update(\"\"\"
                                        INSERT INTO notification_outbox (id, order_id, recipient_email, status)
                                        VALUES (gen_random_uuid(), ?, ?, 'QUEUED')
                                        \"\"\", event.orderId(), event.customerEmail());
                            }
                        }
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
                ### Đề bài Tự luận Chương 4: Thiết kế Kiến trúc Chịu lỗi & Bất đồng bộ cho Ngày hội Siêu giảm giá
                Trong sự kiện Flash Sale 11/11, dịch vụ `order-service` nhận lưu lượng tăng gấp 10 lần bình thường. Để xử lý một đơn hàng, `order-service` hiện đang:
                1. Gọi đồng bộ (`OpenFeign`) sang `payment-service` (thời gian phản hồi trung bình bình thường là `300ms`, nhưng khi quá tải có lúc vọt lên `15.000ms`).
                2. Gọi đồng bộ (`OpenFeign`) sang `loyalty-service` để cộng điểm thưởng.
                3. Gọi đồng bộ (`OpenFeign`) sang `notification-service` để gửi Email xác nhận đơn hàng.
                Ngân sách thời gian tối đa (`SLA Timeout`) mà `api-gateway` cho phép cho API đặt hàng là **`3.000ms`**.

                **Yêu cầu bài viết tự luận (400 – 600 từ)**:
                1. **Tái cấu trúc Đồng bộ vs. Bất đồng bộ**: Trong 3 cuộc gọi trên (`payment`, `loyalty`, `notification`), cuộc gọi nào nên giữ lại hoặc chuyển sang cơ chế **Messaging Bất đồng bộ (`RabbitMQ / Kafka`)**? Giải thích lý do và trình bày cách thiết kế **Bảng chống trùng (`processed_events`)** tại `notification-service` để khách hàng không bao giờ nhận 2 email giống hệt nhau khi Broker giao lại tin nhắn.
                2. **Tính toán Ngân sách `Timeout`, `Retry` & Cấu hình `Circuit Breaker + Bulkhead`**:
                   - Với cuộc gọi sang `payment-service`, hãy thiết lập bộ thông số cụ thể cho: `TimeLimiter (timeoutDuration)`, `Retry (maxAttempts, waitDuration)` sao cho tổng thời gian xấu nhất vẫn nằm gọn trong ngân sách **`3.000ms`** của `api-gateway`. Giải thích điều kiện bắt buộc (`Idempotency-Key`) để được phép bật `Retry` cho lệnh thanh toán.
                   - Thiết kế cấu hình `@CircuitBreaker` và `@Bulkhead` để bảo vệ `order-service` khi `payment-service` bị treo.
                """,
                List.of(
                        new RubricCriterion("1. Tách luồng Bất đồng bộ & Thiết kế Idempotent Consumer", 35,
                                "Chuyển notification-service (và loyalty-service) sang Event-Driven Messaging; thiết kế đúng bảng processed_events(event_id PRIMARY KEY) chống trùng."),
                        new RubricCriterion("2. Toán học Ngân sách Timeout + Retry & Idempotency-Key", 35,
                                "Tính đúng tổng thời gian attempts * timeout + backoff < 3000ms (ví dụ: 2 lần thử x 1000ms + 300ms backoff = 2300ms) và nêu rõ yêu cầu Idempotency-Key."),
                        new RubricCriterion("3. Thiết kế Circuit Breaker, Fallback & Bulkhead", 30,
                                "Cấu hình rõ ngưỡng mở mạch, vách ngăn Bulkhead bảo vệ bể luồng và viết hàm Fallback không trả kết quả thanh toán giả.")
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
