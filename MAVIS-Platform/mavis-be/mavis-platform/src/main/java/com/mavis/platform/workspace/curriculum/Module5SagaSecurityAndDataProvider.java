package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 5: Distributed Transactions (Saga Pattern, Transactional Outbox), Config Server, OAuth2/JWT & CQRS.
 */
public final class Module5SagaSecurityAndDataProvider {
    private Module5SagaSecurityAndDataProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-10",
                        "Bài 5.1 (java-10): Giao dịch phân tán Saga Pattern & Transactional Outbox",
                        "So sánh Orchestration vs Choreography Saga, thiết kế Compensating Transactions & Transactional Outbox.",
                        55,
                        """
                        # 📖 BÀI 5.1 (`java-10`): QUẢN LÝ GIAO DỊCH PHÂN TÁN VỚI `SAGA PATTERN` & `TRANSACTIONAL OUTBOX`

                        ### 1. Tại Sao `2PC (Two-Phase Commit)` Không Phù Hợp Cho Microservices & Sự Ra Đời Của `Saga Pattern`
                        Theo Chương 4 cuốn *Microservices Patterns* (Chris Richardson):
                        - Khi mỗi Microservice sở hữu một cơ sở dữ liệu riêng (`Database-per-Service`), một quy trình đặt hàng cần cập nhật dữ liệu ở cả 3 dịch vụ: `order-service → payment-service → inventory-service`. Giao dịch phân tán truyền thống kiểu **2PC (Two-Phase Commit)** yêu cầu khóa đồng thời tài nguyên trên cả 3 Database và giảm tính sẵn sàng của hệ thống (nếu 1 dịch vụ bảo trì, toàn bộ giao dịch bị treo cứng).
                        - Giải pháp chuẩn là **`Saga Pattern`**: Chia một quy trình nghiệp vụ xuyên dịch vụ thành một chuỗi các **Giao dịch Cục bộ (`Local Transactions` `T1`, `T2`, `T3`)**.
                          - Mỗi giao dịch cục bộ `Ti` cập nhật và `COMMIT` ngay vào Database riêng của dịch vụ thứ `i`, đồng thời đặt trạng thái trung gian rõ ràng (ví dụ `Order.status = PENDING_APPROVAL` — gọi là **Khóa ngữ nghĩa / `Semantic Lock`** để báo rằng đơn hàng đang trong tiến trình xử lý).
                          - Nếu bước thứ 3 (`T3` tại `inventory-service`) bị thất bại (ví dụ hết hàng), vì `T1` và `T2` đã `COMMIT` vào DB mất rồi nên không thể gọi lệnh SQL `ROLLBACK` được nữa! Thay vào đó, Saga phải chạy ngược lại các **Giao dịch Bù trừ (`Compensating Transactions`: `C2 → C1`)** mang ý nghĩa nghiệp vụ đối ngược để hoàn tác những gì đã làm (ví dụ: `C2 = RefundPayment` hoàn tiền lại cho khách, `C1 = RejectOrder` đổi trạng thái đơn hàng thành `REJECTED`)!

                        ### 2. So Sánh Hai Kiểu Phối Hợp Saga (`Choreography` vs `Orchestration`) & Mẫu `Transactional Outbox`

                        | Tiêu chí so sánh | `Choreography-Based Saga` (Vũ đạo sự kiện phi tập trung) | `Orchestration-Based Saga` (Nhạc trưởng điều phối tập trung) |
                        | :--- | :--- | :--- |
                        | **Cách hoạt động** | Không có nhạc trưởng trung tâm; dịch vụ A xong việc thì phát sự kiện, dịch vụ B lắng nghe và tự làm bước tiếp theo rồi phát sự kiện mới. | Có một đối tượng điều phối trung tâm (`OrderSagaOrchestrator`) ra lệnh tuần tự cho từng dịch vụ và quyết định chạy bước bù trừ nào khi có lỗi. |
                        | **Khi nào nên dùng?** | Quy trình rất đơn giản chỉ có 2–3 bước và ít nhánh lỗi. | Quy trình phức tạp có nhiều bước, nhiều nhánh rẽ và cần theo dõi trạng thái tập trung mà không tạo phụ thuộc vòng giữa các dịch vụ. |

                        - **Mẫu `Transactional Outbox` (Chống mất tin nhắn khi vừa ghi DB vừa gửi Event)**:
                          - Nếu `order-service` gọi `orderRepository.save(order)` xong rồi mới gọi `rabbitTemplate.convertAndSend(event)`, lỡ máy chủ mất điện đúng vào mili-giây giữa hai lệnh đó thì đơn hàng đã lưu trong DB nhưng sự kiện không bao giờ được phát đi!
                          - Với **`Transactional Outbox`** (Chương 3 *Microservices Patterns*), trong cùng một giao dịch `@Transactional` của PostgreSQL, dịch vụ vừa `INSERT` vào bảng `orders`, vừa `INSERT` bản tin sự kiện vào bảng `outbox_messages`. Sau đó một tiến trình nền (*Message Relay / Polling Publisher*) sẽ đọc bảng `outbox_messages` để đẩy lên Broker một cách an toàn tuyệt đối!

                        ```java
                        package com.mavis.ecommerce.order.saga;

                        import java.util.UUID;

                        /**
                         * Minh họa máy trạng thái OrderCreationSaga (Orchestration Pattern)
                         * có gắn correlationId xuyên suốt để truy vết toàn bộ tiến trình và các bước bù trừ.
                         */
                        public class OrderSagaOrchestrator {

                            public enum SagaStepState {
                                STARTED, PAYMENT_RESERVED, INVENTORY_RESERVED, COMPLETED,
                                COMPENSATING_PAYMENT, REJECTED
                            }

                            public record SagaContext(
                                    UUID sagaId,          // Correlation ID dùng để truy vết toàn bộ Saga
                                    UUID orderId,
                                    SagaStepState state,
                                    String failureReason
                            ) {}

                            public SagaContext onInventoryFailed(SagaContext current, String reason,
                                                                 PaymentCompensationPort paymentPort,
                                                                 OrderStatePort orderPort) {
                                // Bước 1: Kích hoạt giao dịch bù trừ (Compensating Transaction) hoàn tiền tại payment-service
                                // Truyền kèm sagaId làm khóa lũy đẳng để nếu gửi lại lệnh bù trừ cũng không bị hoàn tiền 2 lần!
                                paymentPort.refundPaymentIdempotently(current.sagaId(), current.orderId());

                                // Bước 2: Chuyển trạng thái đơn hàng từ PENDING sang REJECTED
                                orderPort.markOrderRejected(current.orderId(), reason);

                                return new SagaContext(current.sagaId(), current.orderId(), SagaStepState.REJECTED, reason);
                            }
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-11",
                        "Bài 5.2 (java-11): Spring Cloud Config, Redacted Secrets & Bảo mật OAuth 2.0 / JWT",
                        "Kiểm toán Zero Secret Leaks ([REDACTED]), xác minh JWT (Signature, iss, aud, exp) và phân biệt 401 vs 403.",
                        55,
                        """
                        # 📖 BÀI 5.2 (`java-11`): CẤU HÌNH TẬP TRUNG (`SPRING CLOUD CONFIG`), QUẢN LÝ SECRET & BẢO MẬT `OAUTH 2.0 / JWT`

                        ### 1. Cấu Hình Tập Trung Với `Spring Cloud Config Server` & Bảo Vệ Thông Tin Nhạy Cảm
                        Theo Chương 11 cuốn *Microservices Patterns* (Chris Richardson) và Chương 6 cuốn *Mastering Microservices with Java* (Sourabh Sharma):
                        1. **`Spring Cloud Config Server`**: Cung cấp cấu hình tập trung có đánh phiên bản (backed by Git/Vault) cho hàng chục Microservices theo từng môi trường (`dev`, `staging`, `prod`).
                        2. **Quy tắc Ghi nhận Bằng chứng Cấu hình An toàn (`Redacted Config Evidence — java-11`)**:
                           - Khi viết báo cáo kiểm toán kiến trúc hoặc trích xuất bằng chứng tĩnh, ta chỉ ghi nhận **đường dẫn tệp cấu hình và tên khóa biến (`property key` / `env var name`) kèm giá trị đã được che (`[REDACTED]`)**, tuyệt đối không bao giờ sao chép giá trị thật của mật khẩu, Private Key hay Access Token vào tài liệu hay ảnh chụp màn hình!

                        ### 2. Xác Thực & Phân Quyền Dịch Vụ Với `OAuth 2.0` và `JWT Resource Server`
                        Theo tài liệu [Spring Security OAuth 2.0 Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) và Chương 6 cuốn *Mastering Microservices with Java*:
                        - **4 Vai trò trong OAuth 2.0**:
                          1. `Resource Owner` (Người dùng cuối).
                          2. `Client` (Ứng dụng Web/Mobile).
                          3. `Authorization Server` (Máy chủ cấp phát thẻ bài Token sau khi xác thực người dùng).
                          4. `Resource Server` (Chính là các Microservices như `order-service`, `payment-service` đứng bảo vệ dữ liệu nghiệp vụ).
                        - **4 Kiểm tra Bắt buộc Khi Một `Resource Server` Xác minh Thẻ bài `JWT`**:
                          1. **Chữ ký số (`Signature`)**: Kiểm tra bằng khóa công khai (`Public Key / JWKS`) để đảm bảo nội dung JWT không bị kẻ gian sửa đổi.
                          2. **Đơn vị phát hành (`iss — Issuer`)**: Token có thực sự do đúng `Authorization Server` tin cậy phát hành hay không.
                          3. **Đối tượng thụ hưởng (`aud — Audience`)**: Token này có được cấp để gọi vào `Resource Server` hiện tại hay không (ngăn việc lấy token cấp cho dịch vụ đọc tin tức đem đi gọi dịch vụ chuyển tiền!).
                          4. **Thời hạn hiệu lực (`exp — Expiration`)**: Từ chối ngay lập tức (`HTTP 401 Unauthorized`) nếu token đã hết hạn.
                        - **Phân biệt `Authentication (401)` và `Authorization (403)`**:
                          - Một `JWT` hợp lệ (đúng chữ ký, đúng issuer, đúng audience, chưa hết hạn) chỉ chứng minh **Danh tính đã được xác thực (`Authentication`)**.
                          - Dịch vụ vẫn phải kiểm tra tiếp xem danh tính đó có **Quyền thực hiện hành động (`Authorization`: `@PreAuthorize("hasRole('LECTURER')")` hoặc kiểm tra chủ sở hữu tài nguyên `order.getCustomerId().equals(currentUserId)`)** hay không; nếu thiếu quyền, phải từ chối với mã **`HTTP 403 Forbidden`**!

                        ```java
                        @GetMapping("/api/v1/workspaces/{workspaceId}/course-essays")
                        public List<EssaySubmissionView> list(@PathVariable UUID workspaceId) {
                            User actor = access.requireCurrentActiveUser();
                            // Kiểm tra BOLA/IDOR: Sinh viên chỉ được thấy bài của chính mình!
                            return isLecturer(actor) ? findAll(workspaceId) : findByStudent(workspaceId, actor.getId());
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-a02",
                        "Bài 5.3 (java-a02): Truy vấn phân tán (API Composition vs CQRS) & Chống Lost Update PostgreSQL",
                        "Áp dụng CQRS, UNIQUE CONSTRAINT ở DB và Whole Transaction Retry khi gặp SQLSTATE 40001.",
                        55,
                        """
                        # 📖 BÀI 5.3 (`java-a02`): TRUY VẤN PHÂN TÁN (`API COMPOSITION` vs `CQRS`) & CẠNH TRANH GIAO DỊCH TRONG POSTGRESQL

                        ### 1. Hai Mẫu Truy Vấn Dữ Liệu Xuyên Dịch Vụ (`API Composition` vs `CQRS`)
                        Theo Chương 7 cuốn *Microservices Patterns* (Chris Richardson), khi dữ liệu nằm rải rác ở nhiều Microservices, làm sao để hiển thị màn hình *"Chi tiết Đơn hàng kèm Trạng thái Thanh toán, Tồn kho và Lộ trình Giao hàng"*?
                        1. **`API Composition Pattern` (Tổng hợp qua API)**: Một bộ tổng hợp (*API Composer* ở Gateway/BFF) gọi song song sang 3–4 dịch vụ rồi ghép kết quả JSON trong bộ nhớ. Dễ cài đặt nhưng kém hiệu quả nếu cần tìm kiếm/phân trang trên tập dữ liệu lớn.
                        2. **`CQRS (Command Query Responsibility Segregation)`**: Tách riêng mô hình Ghi (*Command*) và mô hình Đọc (*Query View Database*). Dịch vụ đọc lắng nghe các sự kiện (`OrderCreated`, `PaymentAuthorized`, `ShipmentUpdated`) để cập nhật vào một bảng/chỉ mục tối ưu sẵn cho truy vấn (như PostgreSQL Read Model hoặc Elasticsearch).

                        | Pattern | Cách lấy dữ liệu chéo service | Điểm mạnh | Hạn chế cần lường trước |
                        | :--- | :--- | :--- | :--- |
                        | **API Composition** | API Composer gọi song song các service và merge trong RAM | Đơn giản, luôn đọc dữ liệu mới nhất | Tốn memory nếu join bộ dữ liệu lớn hoặc 1 service bị nghẽn |
                        | **CQRS** | Projector nghe Event tạo bảng đọc (`Read Model`) phi chuẩn hóa | Tốc độ query đọc cực nhanh, lọc/sort thoải mái | Chấp nhận độ trễ nhất quán cuối cùng (*Eventual Consistency*) |

                        ### 2. Chống `Lost Update`, Mức Cô Lập Giao Dịch (`Isolation Levels`) & Ràng Buộc Duy Nhất (`Unique Constraint`)
                        Theo tài liệu [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html):
                        - Khi hai yêu cầu đến **cùng một thời điểm** (ví dụ khách hàng bấm đúp chuột gửi 2 request thanh toán có cùng mã thao tác `idempotencyKey`, hoặc 2 người cùng mua món hàng cuối cùng trong kho):
                          1. **Không bao giờ chỉ kiểm tra trùng bằng câu lệnh `SELECT` trong code Java rồi mới `INSERT`** (vì 2 luồng chạy song song sẽ cùng thấy `SELECT` trả về rỗng và cùng `INSERT` thành công!). Bắt buộc phải đặt **Ràng buộc Duy nhất (`UNIQUE CONSTRAINT`) ngay tại tầng Cơ sở dữ liệu PostgreSQL**!
                          2. **Chống mất cập nhật (`Lost Update`)**: Sử dụng khóa lạc quan (`@Version` trong JPA — *Optimistic Locking*), khóa bi quan (`SELECT ... FOR UPDATE`), hoặc mức cô lập **`REPEATABLE READ` / `SERIALIZABLE`**. Khi PostgreSQL báo lỗi xung đột tuần tự hóa (`Serialization Failure — SQLSTATE 40001`), ứng dụng cần **thử lại toàn bộ giao dịch (Retry Whole Transaction)** theo ngân sách đã định, và lưu ý rằng việc `ROLLBACK` giao dịch DB **không tự động thu hồi được các tác dụng phụ đã phát ra ngoài DB** (như email đã gửi hay lệnh HTTP đã bắn đi)!

                        ```sql
                        -- Chống race condition ghi danh/nộp bài đồng thời trực tiếp ở tầng PostgreSQL
                        ALTER TABLE course_item_submissions
                            ADD CONSTRAINT uq_course_item_student_submission
                            UNIQUE (course_item_id, student_id);
                        ```
                        """
                )
        );
    }

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m5-q1",
                        "Trong Saga Pattern, khái niệm Compensating Transaction (Giao dịch bù trừ) là gì?",
                        "SINGLE_CHOICE",
                        List.of("Lệnh ROLLBACK tự động của một DB duy nhất",
                                "Hành động nghiệp vụ chạy ngược để hoàn tác ngữ nghĩa cho Local Transaction đã COMMIT trước đó khi bước sau thất bại",
                                "Xóa logs máy chủ",
                                "Tắt Docker Engine"),
                        1,
                        "Vì Local Transaction đã commit vào DB từng dịch vụ, Saga phải phát lệnh nghiệp vụ bù trừ (như hoàn tiền, nhả tồn kho).", 1),
                new QuizQuestionSpec("m5-q2",
                        "Điểm khác biệt cốt lõi giữa Orchestration Saga và Choreography Saga là gì?",
                        "SINGLE_CHOICE",
                        List.of("Orchestration chỉ dùng cho C#",
                                "Orchestration có bộ điều phối trung tâm (Saga Orchestrator) giữ máy trạng thái và điều lệnh bù trừ; Choreography để các service tự phản ứng qua sự kiện",
                                "Choreography bắt buộc dùng chung 1 DB",
                                "Orchestration không cần Broker"),
                        1,
                        "Saga Orchestrator quản lý luồng tập trung, tránh rối phụ thuộc vòng ở các quy trình nhiều bước.", 1),
                new QuizQuestionSpec("m5-q3",
                        "Hệ thống Saga cần thông tin gì để truy vết toàn bộ hành trình xuyên nhiều dịch vụ?",
                        "SINGLE_CHOICE",
                        List.of("Tên thư mục code",
                                "Mã tương quan xuyên suốt (Correlation ID / sagaId) trong mọi bản tin và trạng thái từng bước",
                                "Số container chạy",
                                "Tên trình duyệt"),
                        1,
                        "Correlation ID (sagaId) nối toàn bộ lệnh xuôi và lệnh bù trừ của cùng 1 giao dịch.", 1),
                new QuizQuestionSpec("m5-q4",
                        "Nếu lệnh bù trừ (VD: RefundPayment) gặp lỗi mạng tạm thời, Saga nên xử lý ra sao?",
                        "SINGLE_CHOICE",
                        List.of("Bỏ qua coi như xong",
                                "Xóa đơn hàng",
                                "Ghi trạng thái đang bù trừ và Retry lũy đẳng theo chính sách tới khi hoàn tất hoặc chuyển hàng đợi cảnh báo",
                                "Đổi mật khẩu user"),
                        2,
                        "Compensating Transaction phải idempotent và được retry tới khi trạng thái hệ thống nhất quán trở lại.", 1),
                new QuizQuestionSpec("m5-q5",
                        "Giá trị thực của Secrets (mật khẩu DB, khóa ký JWT, API Key) nên được lưu và hiển thị thế nào?",
                        "SINGLE_CHOICE",
                        List.of("Commit thẳng vào Git",
                                "Chụp ảnh dán vào báo cáo",
                                "Lưu trong Secret Manager/Biến môi trường bảo mật; khi trích xuất bằng chứng chỉ ghi đường dẫn + khóa kèm [REDACTED]",
                                "Nhúng vào JavaScript frontend"),
                        2,
                        "Giữ bí mật ngoài Git và che giá trị khi báo cáo tuân thủ quy tắc Zero Secret Leaks.", 1),
                new QuizQuestionSpec("m5-q6",
                        "Khi Resource Server xác nhận JWT có chữ ký số hợp lệ và chưa hết hạn, điều đó có nghĩa gì?",
                        "SINGLE_CHOICE",
                        List.of("Được quyền xóa mọi dữ liệu",
                                "Danh tính đã xác thực (Authentication), vẫn phải kiểm tra tiếp Authorization (Role/Audience/Scope/chủ sở hữu)",
                                "Không cần check iss/aud",
                                "Không cần validate input"),
                        1,
                        "Authentication (401) và Authorization/Resource Ownership (403) là hai tầng kiểm tra độc lập.", 1),
                new QuizQuestionSpec("m5-q7",
                        "Trường aud (Audience) trong JWT payload dùng để kiểm tra điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Kiểm tra token có thực sự được cấp cho Resource Server đích này hay không",
                                "Kiểm tra RAM container",
                                "Kiểm tra số queue RabbitMQ",
                                "Kiểm tra tốc độ mạng"),
                        0,
                        "Kiểm tra Audience ngăn lấy token của một dịch vụ khác đem gọi trái phép vào dịch vụ hiện tại.", 1),
                new QuizQuestionSpec("m5-q8",
                        "Khi 2 request song song gửi cùng mã idempotencyKey, cách nào ĐÁNG TIN CẬY NHẤT để chống tạo 2 bản ghi trùng?",
                        "SINGLE_CHOICE",
                        List.of("Check bằng JS trên trình duyệt",
                                "Đặt tên biến khác nhau",
                                "Đặt UNIQUE CONSTRAINT / UNIQUE INDEX trực tiếp tại PostgreSQL",
                                "Dùng Thread.sleep(100)"),
                        2,
                        "Chỉ ràng buộc UNIQUE nguyên tử tại tầng DB mới chống được race condition đa instance.", 1),
                new QuizQuestionSpec("m5-q9",
                        "Khi PostgreSQL trả về lỗi Serialization Failure (SQLSTATE 40001), phạm vi Retry đúng đắn là gì?",
                        "SINGLE_CHOICE",
                        List.of("Chỉ retry SELECT đầu tiên",
                                "Tải lại CSS",
                                "Rollback giao dịch xung đột và Retry TOÀN BỘ khối giao dịch (Whole Transaction Retry) từ đầu",
                                "Bỏ qua trả 200 OK"),
                        2,
                        "Toàn bộ giao dịch bị hủy bỏ khi gặp SQLSTATE 40001 nên phải chạy lại cả transaction từ đầu.", 1),
                new QuizQuestionSpec("m5-q10",
                        "Trong hàm @Transactional gửi Email ra SMTP rồi sau đó DB rollback, Email có tự thu hồi không?",
                        "SINGLE_CHOICE",
                        List.of("Có, Postgres tự xóa email",
                                "Có nếu timeout < 1s",
                                "Không; gửi Email/HTTP là External Side Effect không rollback theo DB — phải dùng Transactional Outbox hoặc AFTER_COMMIT",
                                "Chỉ tự hủy trên JDK 21"),
                        2,
                        "DB rollback chỉ hoàn tác các bảng DB, không hoàn tác được tác dụng phụ đã phát ra mạng ngoài.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 5: Máy trạng thái Order Saga, Transactional Outbox & Bảo mật JWT",
                "Lập bảng trạng thái OrderSagaOrchestrator kèm Compensating Transactions, thiết kế bảng Outbox và kịch bản JWT 401/403.",
                """
                ### Đề bài Tự luận Chương 5: Đặc tả Máy trạng thái `Order Saga`, `Transactional Outbox` & Bảo mật `JWT`
                Hệ thống Thương mại điện tử của bạn cần xử lý quy trình **Đặt hàng trả trước** đi qua 3 dịch vụ có Database riêng:
                1. `order-service`: Tạo đơn hàng.
                2. `payment-service`: Trừ tiền ví điện tử của khách hàng.
                3. `inventory-service`: Giữ chỗ và xuất kho sản phẩm.

                **Yêu cầu bài viết tự luận (450 – 650 từ)**:
                1. **Bảng Trạng thái `Order Saga` & Chuỗi Giao dịch Bù trừ (`Compensation Table`)**:
                   - Hãy lập bảng mô tả từng bước của `OrderSagaOrchestrator` trong trường hợp: Bước 1 (`order-service` tạo đơn `PENDING`) thành công → Bước 2 (`payment-service` trừ tiền) thành công → Bước 3 (`inventory-service` giữ kho) **THẤT BẠI do kho vừa hết hàng**.
                   - Chỉ rõ trạng thái của từng dịch vụ ở mỗi thời điểm, lệnh bù trừ nào được phát ra, và cách xử lý nếu bản tin bù trừ `RefundPaymentCommand` bị gửi trùng 2 lần tới `payment-service`.
                2. **Ứng dụng Mẫu `Transactional Outbox`**: Giải thích tại sao trong Bước 1, `order-service` không được vừa `save(order)` xong đã bắn thẳng bản tin lên RabbitMQ ngoài giao dịch DB, và mô tả cấu trúc bảng `outbox_events` để khắc phục triệt để lỗi này.
                3. **Kịch bản Kiểm thử Bảo mật `JWT` (`401` vs `403`)**: Thiết kế 3 ca kiểm thử (Test Cases) gửi request tới endpoint `POST /api/v1/orders/{orderId}/cancel`:
                   - Ca 1: Token đã hết hạn (`exp` ở quá khứ) hoặc sai `aud`.
                   - Ca 2: Token hợp lệ của Sinh viên/Khách hàng `User_A`, nhưng lại truyền `orderId` thuộc sở hữu của `User_B`.
                   - Ca 3: Token hợp lệ của chính chủ `User_A`.
                   Chỉ rõ mã HTTP Status trả về ở từng ca.
                """,
                List.of(
                        new RubricCriterion("1. Thiết kế Bảng Trạng thái Saga & Lũy đẳng Bù trừ", 40,
                                "Lập bảng đầy đủ luồng thuận và luồng bù trừ ngược (RefundPayment -> CancelOrder), có gắn correlationId / sagaId để chống hoàn tiền trùng."),
                        new RubricCriterion("2. Thiết kế Transactional Outbox", 30,
                                "Giải thích rõ nguy cơ Dual-Write (lưu DB thành công nhưng mất bản tin Broker) và mô tả đúng việc ghi chung giao dịch vào bảng outbox_events."),
                        new RubricCriterion("3. Phân biệt Chính xác 401 Unauthorized & 403 Forbidden", 30,
                                "Xác định đúng Ca 1 trả về 401, Ca 2 trả về 403 (vi phạm quyền sở hữu tài nguyên BOLA/IDOR), Ca 3 trả về 200/202.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "STATIC_LAB",
                "Mô hình Trực quan #4: Kiểm toán Luồng Saga & Quy tắc Bảo mật Zero Secret Leaks",
                "Đối chiếu sơ đồ thành phần Saga Orchestration, kiểm tra bằng chứng Outbox và quy tắc che giấu Secret.",
                false,
                List.of("C4_CONTAINER", "C4_COMPONENT")
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                5,
                "Chương 5 · Saga Pattern, Transactional Outbox, CQRS, Config Server & Bảo mật JWT",
                "Làm chủ giao dịch phân tán với Saga + Outbox, CQRS/Unique Constraint và xác thực/phân quyền OAuth2/JWT.",
                "Lab 05 · Distributed Saga & Zero-Secret Security Audit",
                "Thực hành phân tích máy trạng thái Order Saga, Transactional Outbox và kiểm toán ranh giới bảo mật 401/403.",
                "java-10",
                lessons(),
                quizQuestions(),
                essay(),
                visualLab()
        );
    }
}
