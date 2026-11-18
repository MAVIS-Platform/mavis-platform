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
                        # Bài 5.1: Saga Pattern & Transactional Outbox

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Giải quyết bài toán nhất quán dữ liệu trải dài qua nhiều Microservices mà không cần khóa 2-Phase Commit (`2PC/XA`).
                        - Triển khai **Compensating Transactions** lũy đẳng và mẫu **Transactional Outbox** để loại bỏ lỗi **Dual-Write** giữa PostgreSQL và Message Broker.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Cơ chế Saga / Outbox | Bản chất vận hành | Ưu điểm nổi bật | Điều kiện bắt buộc |
                        | :--- | :--- | :--- | :--- |
                        | **Choreography Saga** | Service phát Event và lắng nghe phản ứng lẫn nhau | Ít thành phần điều phối, hợp 2–3 bước | Tránh vòng lặp sự kiện khi quy trình phình to |
                        | **Orchestration Saga** | Saga Orchestrator giữ máy trạng thái trung tâm | Tầm nhìn rõ luồng & thứ tự bù trừ ngược | Gắn `sagaId / correlationId` xuyên suốt & bù trừ lũy đẳng |
                        | **Transactional Outbox** | Ghi `orders` + `outbox_messages` trong 1 `@Transactional` DB | Không bao giờ mất sự kiện sau commit | Relay Publisher hỗ trợ `At-Least-Once` & Consumer chống trùng |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        @Transactional
                        public UUID createPendingOrder(CreateOrderCommand cmd) {
                            Order order = orders.save(Order.pendingApproval(cmd));
                            outbox.save(OutboxMessage.forEvent("OrderCreated", order.getId(), toJson(order)));
                            return order.getId();
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Bẫy Dual-Write**: Gọi `orderRepo.save()` rồi gọi ngay `kafkaTemplate.send()` trong 1 hàm không Outbox -> DB commit xong mà Broker rớt mạng sẽ mất vĩnh viễn sự kiện!
                        - **Semantic Lock**: Dùng trạng thái trung gian `PENDING_APPROVAL` trong khi Saga chưa hoàn tất để chặn user sửa/hủy trùng lặp.
                        """
                ),
                new LessonSpec(
                        "java-11",
                        "Bài 5.2 (java-11): Spring Cloud Config, Redacted Secrets & Bảo mật OAuth 2.0 / JWT",
                        "Kiểm toán Zero Secret Leaks ([REDACTED]), xác minh JWT (Signature, iss, aud, exp) và phân biệt 401 vs 403.",
                        55,
                        """
                        # Bài 5.2: Spring Cloud Config, Redacted Secrets & OAuth 2.0 / JWT

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Quản lý cấu hình tập trung với Spring Cloud Config và kiểm toán **Zero Secret Leaks (`[REDACTED]`)** trong log/report.
                        - Cấu hình OAuth 2.0 Resource Server xác minh chữ ký JWT chặt chẽ và chống lỗ hổng **BOLA/IDOR**.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Lớp kiểm tra JWT / AuthZ | Mã HTTP khi vi phạm | Ý nghĩa bảo mật |
                        | :--- | :--- | :--- |
                        | Thiếu token, sai Signature, hết `exp`, sai `iss`/`aud` | **`401 Unauthorized`** | Chưa xác thực được danh tính hợp lệ (`Authentication` fail) |
                        | JWT hợp lệ nhưng thiếu `@PreAuthorize` Role hoặc đọc tài nguyên của người khác (`BOLA/IDOR`) | **`403 Forbidden`** | Đã biết là ai nhưng không có quyền truy cập tài nguyên (`Authorization` fail) |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        @GetMapping("/api/v1/workspaces/{workspaceId}/course-essays")
                        public List<EssaySubmissionView> list(@PathVariable UUID workspaceId) {
                            User actor = access.requireCurrentActiveUser();
                            // Kiểm tra BOLA/IDOR: Sinh viên chỉ được thấy bài của chính mình!
                            return isLecturer(actor) ? findAll(workspaceId) : findByStudent(workspaceId, actor.getId());
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Zero Secret Leaks**: Khi xuất báo cáo cấu hình tĩnh cho Lecturer/Admin, mọi giá trị nhạy cảm như `JWT_SECRET` hay `SPRING_DATASOURCE_PASSWORD` phải được che thành `[REDACTED]`, chỉ giữ tên khóa và đường dẫn tệp.
                        """
                ),
                new LessonSpec(
                        "java-a02",
                        "Bài 5.3 (java-a02): Truy vấn phân tán (API Composition vs CQRS) & Chống Lost Update PostgreSQL",
                        "Áp dụng CQRS, UNIQUE CONSTRAINT ở DB và Whole Transaction Retry khi gặp SQLSTATE 40001.",
                        55,
                        """
                        # Bài 5.3: API Composition vs CQRS & Cạnh tranh giao dịch PostgreSQL

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Chọn đúng mẫu truy vấn dữ liệu trải qua nhiều Microservices (**API Composition** vs **CQRS Read Model**).
                        - Xử lý triệt để Race Condition, Lost Update và **Serialization Failure (`SQLSTATE 40001`)** trong PostgreSQL dưới tải đồng thời.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Pattern | Cách lấy dữ liệu chéo service | Điểm mạnh | Hạn chế cần lường trước |
                        | :--- | :--- | :--- | :--- |
                        | **API Composition** | API Composer gọi song song các service và merge trong RAM | Đơn giản, luôn đọc dữ liệu mới nhất | Tốn memory nếu join bộ dữ liệu lớn hoặc 1 service bị nghẽn |
                        | **CQRS** | Projector nghe Event tạo bảng đọc (`Read Model`) phi chuẩn hóa | Tốc độ query đọc cực nhanh, lọc/sort thoải mái | Chấp nhận độ trễ nhất quán cuối cùng (*Eventual Consistency*) |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```sql
                        -- Chống race condition ghi danh/nộp bài đồng thời trực tiếp ở tầng PostgreSQL
                        ALTER TABLE course_item_submissions
                            ADD CONSTRAINT uq_course_item_student_submission
                            UNIQUE (course_item_id, student_id);
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Cấm pattern `SELECT` rồi mới `INSERT` trong code Java để check trùng** khi có concurrent request: bắt buộc dùng `UNIQUE CONSTRAINT` + `ON CONFLICT DO UPDATE / DO NOTHING` ngay trong DB!
                        - **Whole Transaction Retry**: Khi gặp `SQLSTATE 40001` (`Serialization Failure`), PHẢI retry lại toàn bộ block giao dịch từ đầu (và không gọi HTTP/email ra ngoài trước khi transaction commit xong!).
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
