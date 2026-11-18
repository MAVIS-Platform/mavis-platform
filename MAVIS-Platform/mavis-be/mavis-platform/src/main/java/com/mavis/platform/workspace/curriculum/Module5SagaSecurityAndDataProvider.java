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
                        # 📖 Bài 5.1: Saga Pattern & Transactional Outbox

                        ## 1. Tại sao bỏ `2PC / XA` trong Microservices?
                        - Mỗi dịch vụ sở hữu DB riêng (`Database-per-Service`); 2PC khóa tài nguyên xuyên dịch vụ và làm giảm tính sẵn sàng.
                        - **`Saga Pattern`**: Chuỗi các **Local Transactions** kèm khóa ngữ nghĩa (`PENDING_APPROVAL`). Nếu bước sau lỗi, chạy ngược **Compensating Transactions** (`RefundPayment` -> `RejectOrder`) gắn kèm `sagaId / correlationId` để bảo đảm bù trừ lũy đẳng!

                        ## 2. `Transactional Outbox` (Chống mất sự kiện Dual-Write)
                        - Ghi cả bản ghi nghiệp vụ (`orders`) lẫn bản tin sự kiện (`outbox_messages`) trong **cùng một `@Transactional` PostgreSQL**, rồi Relay Publisher đẩy sang Broker.
                        """
                ),
                new LessonSpec(
                        "java-11",
                        "Bài 5.2 (java-11): Spring Cloud Config, Redacted Secrets & Bảo mật OAuth 2.0 / JWT",
                        "Kiểm toán Zero Secret Leaks ([REDACTED]), xác minh JWT (Signature, iss, aud, exp) và phân biệt 401 vs 403.",
                        55,
                        """
                        # 📖 Bài 5.2: Spring Cloud Config, Redacted Secrets & OAuth 2.0 / JWT

                        ## 1. `Zero Secret Leaks`
                        - Trong báo cáo kiểm toán cấu hình tĩnh, chỉ ghi đường dẫn tệp + tên khóa (`SPRING_DATASOURCE_PASSWORD=[REDACTED]`), tuyệt đối không lộ Secret thô.

                        ## 2. 4 Kiểm tra bắt buộc trên `JWT Resource Server`
                        1. **Signature** (JWKS public key), 2. **Issuer (`iss`)**, 3. **Audience (`aud`)**, 4. **Expiration (`exp`)**.
                        - Thiếu/hết hạn token $\rightarrow$ **`401 Unauthorized`**. Hợp lệ token nhưng sai Role hoặc truy cập tài nguyên người khác (`BOLA/IDOR`) $\rightarrow$ **`403 Forbidden`**.
                        """
                ),
                new LessonSpec(
                        "java-a02",
                        "Bài 5.3 (java-a02): Truy vấn phân tán (API Composition vs CQRS) & Chống Lost Update PostgreSQL",
                        "Áp dụng CQRS, UNIQUE CONSTRAINT ở DB và Whole Transaction Retry khi gặp SQLSTATE 40001.",
                        55,
                        """
                        # 📖 Bài 5.3: API Composition vs CQRS & Cạnh tranh giao dịch PostgreSQL

                        ## 1. Truy vấn dữ liệu phân tán
                        - **`API Composition`**: API Composer gọi song song các dịch vụ và ghép JSON trong RAM.
                        - **`CQRS`**: Tách Read Model cập nhật từ sự kiện (`OrderCreated`, `PaymentAuthorized`) để tối ưu truy vấn phức tạp.

                        ## 2. Chống `Lost Update` & Trùng khóa đồng thời
                        - Không dựa vào `SELECT` rồi `INSERT` trong code Java: bắt buộc đặt **`UNIQUE CONSTRAINT`** trực tiếp tại PostgreSQL.
                        - Khi PostgreSQL báo **`Serialization Failure (SQLSTATE 40001)`**, phải **Retry toàn bộ khối giao dịch (`Whole Transaction Retry`)**; lưu ý DB rollback không thu hồi được email/HTTP đã phát ra ngoài DB.
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
                ### Đề bài Tự luận Chương 5: Order Saga, Transactional Outbox & Kiểm thử JWT
                Quy trình Đặt hàng trả trước đi qua `order-service`, `payment-service`, `inventory-service` (mỗi service 1 PostgreSQL DB riêng).

                **Yêu cầu bài viết (450 – 650 từ)**:
                1. **Bảng Trạng thái `Order Saga` & Chuỗi Bù trừ**: Mô tả từng bước khi `order-service` & `payment-service` thành công nhưng `inventory-service` thất bại do hết hàng. Giải thích cách chống hoàn tiền trùng nếu `RefundPaymentCommand` gửi lại 2 lần.
                2. **Mẫu `Transactional Outbox`**: Giải thích rủi ro Dual-Write và mô tả cấu trúc bảng `outbox_messages`.
                3. **3 Ca kiểm thử `JWT` (`POST /api/v1/orders/{orderId}/cancel`)**: Token hết hạn/sai `aud`; Token hợp lệ `User_A` hủy đơn `User_B`; Token hợp lệ chính chủ `User_A`. Chỉ rõ HTTP status từng ca.
                """,
                List.of(
                        new RubricCriterion("1. Bảng trạng thái Saga & Lũy đẳng bù trừ", 40,
                                "Lập đủ luồng thuận và luồng bù trừ ngược (RefundPayment -> RejectOrder), gắn sagaId chống hoàn tiền 2 lần."),
                        new RubricCriterion("2. Thiết kế Transactional Outbox", 30,
                                "Giải thích đúng nguy cơ Dual-Write và ghi chung giao dịch vào bảng outbox_messages."),
                        new RubricCriterion("3. Phân biệt 401 Unauthorized vs 403 Forbidden", 30,
                                "Ca 1 -> 401, Ca 2 -> 403 (BOLA/IDOR), Ca 3 -> 200/202.")
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
