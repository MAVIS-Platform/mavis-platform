package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 2: Monolith to Microservices, Scale Cube, C4 Model (C1-C3) & Domain-Driven Design.
 */
public final class Module2ArchitectureAndDddProvider {
    private Module2ArchitectureAndDddProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-01",
                        "Bài 2.1 (java-01): Tiến hóa từ Monolith sang Microservices, Scale Cube & Mô hình C4 (C1–C3)",
                        "Giải phẫu 5 bi kịch Monolithic Hell, trục Y của Scale Cube và cô lập 3 tầng sơ đồ C4 Model.",
                        50,
                        """
                        # Bài 2.1: Monolith -> Microservices, Scale Cube & C4 Model (C1–C3)

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Nhận diện chính xác khi nào một hệ thống Monolith gặp "Monolithic Hell" (nghẽn build, khóa công nghệ, triển khai mạo hiểm) và khi nào Modular Monolith lại tốt hơn Microservices.
                        - Phân rã hệ thống theo **Scale Cube 3 trục** và truyền đạt kiến trúc nhất quán qua **C4 Model (C1 Context, C2 Container, C3 Component)**.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Tầng C4 | Câu hỏi trả lời | Phần tử hợp lệ | Sai lầm cần tránh |
                        | :--- | :--- | :--- | :--- |
                        | **C1 Context** | Ai dùng hệ thống & nói chuyện với hệ thống ngoài nào? | Actor (`Customer`, `Lecturer`), Software System, `Stripe/SMTP` | Vẽ Microservice hay bảng DB vào C1 |
                        | **C2 Container** | Gồm những ứng dụng & DB triển khai độc lập nào? | `api-gateway`, `order-service`, `Order DB`, `Kafka` | Vẽ từng class Java vào C2 |
                        | **C3 Component** | Bên trong 1 service có các module trách nhiệm nào? | `@RestController`, `@Service`, `@FeignClient`, `@Repository` | Coi mọi class Java là 1 Microservice |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```yaml
                        # docker-compose.yml phản ánh đúng tầng C2 Container độc lập
                        services:
                          api-gateway:
                            image: mavis/api-gateway:curated
                            ports: ["8080:8080"]
                          order-service:
                            image: mavis/order-service:curated
                            ports: ["8081:8081"]
                          order-db:
                            image: postgres:16
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Scale Cube**: Trục X = nhân bản ngang (replicas), Trục Z = sharding theo user/region, **Trục Y = Microservices (phân rã theo chức năng nghiệp vụ)**.
                        - **Microservices không phải viên đạn bạc**: Với đội < 5 người hoặc domain chưa rõ ràng, chi phí mạng và giao dịch phân tán có thể phản tác dụng.
                        """
                ),
                new LessonSpec(
                        "java-02",
                        "Bài 2.2 (java-02): DDD Bounded Context, Database-per-Service & Phản mẫu Shared Database",
                        "Phân rã theo Bounded Context, Anti-Corruption Layer (ACL) và kiểm toán phản mẫu Shared Database.",
                        50,
                        """
                        # Bài 2.2: DDD Bounded Context, Database-per-Service & Shared DB Anti-pattern

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Xác định ranh giới dịch vụ bằng **DDD Strategic Design (`Ubiquitous Language`, `Bounded Context`, `Context Map`)**.
                        - Áp dụng **Database-per-Service** đúng bản chất và phát hiện chính xác **Shared Database Anti-pattern** trong mã nguồn/cấu hình.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Khía cạnh | Thiết kế chuẩn (`Database-per-Service`) | Phản mẫu (`Shared Database`) |
                        | :--- | :--- | :--- |
                        | **Quyền sở hữu dữ liệu** | Mỗi service độc quyền schema/DB riêng | Hai service cùng trỏ chung DB/schema/credential |
                        | **Giao tiếp xuyên ranh giới** | Qua REST/OpenFeign hoặc Domain Events | `JOIN` trực tiếp sang bảng của dịch vụ khác |
                        | **Bảo vệ mô hình cũ** | Dùng **Anti-Corruption Layer (`ACL`)** dịch DTO | Cho phép entity nội bộ phụ thuộc schema ngoài |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        @Component
                        public class PaymentGatewayAcl {
                            public InternalPaymentStatus translate(ExternalStripeChargeResponse external) {
                                return switch (external.rawState()) {
                                    case "succeeded" -> InternalPaymentStatus.AUTHORIZED;
                                    case "requires_action" -> InternalPaymentStatus.PENDING_CHALLENGE;
                                    default -> InternalPaymentStatus.REJECTED;
                                };
                            }
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Bẫy Shared DB giả**: 2 service cùng dùng PostgreSQL `16` (chung engine hoặc chung cụm host) **nhưng tách riêng database/schema & user** là **HỢP LỆ**.
                        - **Vi phạm thật sự**: `order-service` và `billing-service` cùng cấu hình `SPRING_DATASOURCE_URL` tới cùng schema `public` và query chung bảng `orders`.
                        """
                ),
                new LessonSpec(
                        "java-03",
                        "Bài 2.3 (java-03): Cấu trúc nội bộ C3 Component trong Spring Boot & DDD Aggregate Root",
                        "Thiết kế Entity, Value Object, Aggregate Root, tham chiếu qua ID và Constructor Injection minh bạch cho C3.",
                        50,
                        """
                        # Bài 2.3: Cấu trúc nội bộ C3 Component & DDD Aggregate Root

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Thiết kế **DDD Tactical Building Blocks** (`Entity`, `Value Object`, `Aggregate Root`, `Repository`) gọn nhẹ, chuẩn ranh giới nhất quán giao dịch.
                        - Chuẩn hóa **Constructor Injection** để bộ phân tích tĩnh C3 nhận diện 100% các cạnh phụ thuộc bên trong dịch vụ.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Khối DDD | Định danh / So sánh | Quy tắc tham chiếu xuyên Aggregate | Ghi chú Spring Boot / JPA |
                        | :--- | :--- | :--- | :--- |
                        | **Entity** | Có ID riêng (`Order.id`) | Nằm trong Aggregate Root | Quản lý vòng đời qua Aggregate Root |
                        | **Value Object** | Không ID, so sánh theo giá trị | Java `record Money(BigDecimal amount, String currency)` | Bất biến, dùng `@Embeddable` hoặc JSONB |
                        | **Aggregate Root** | Cụm nhất quán transaction (`Order`) | **Chỉ giữ ID (`UUID restaurantId`)**, CẤM `@ManyToOne` xuyên service | Xuất Domain Event sau khi commit |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        @Service
                        public class OrderApplicationService {
                            private final OrderRepository orderRepository;
                            private final PaymentClient paymentClient;

                            // Constructor Injection giúp C3 Component Graph thấy rõ cạnh phụ thuộc
                            public OrderApplicationService(OrderRepository orderRepository, PaymentClient paymentClient) {
                                this.orderRepository = orderRepository;
                                this.paymentClient = paymentClient;
                            }
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Vì sao cấm `@ManyToOne` sang Entity dịch vụ khác?** Phá vỡ Database-per-Service, buộc tải chéo bảng và khóa transaction cục bộ.
                        - **Anemic Domain Model**: Tránh nhét hết rule nghiệp vụ vào Service rồi biến Entity thành getter/setter rỗng.
                        """
                )
        );
    }

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m2-q1",
                        "Theo mô hình Scale Cube (Microservices Patterns), kiến trúc Microservices tương ứng trực tiếp với trục mở rộng nào?",
                        "SINGLE_CHOICE",
                        List.of("Trục X (Nhân bản nguyên khối)",
                                "Trục Y (Phân rã theo năng lực nghiệp vụ độc lập)",
                                "Trục Z (Sharding dữ liệu)",
                                "Không thuộc trục nào"),
                        1,
                        "Trục Y (Functional Decomposition) tách ứng dụng theo năng lực nghiệp vụ thành các dịch vụ độc lập.", 1),
                new QuizQuestionSpec("m2-q2",
                        "Trong C4 Model, sơ đồ C1 (System Context Diagram) chủ yếu thể hiện điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Các phương thức private Java",
                                "Cấu hình docker-compose.yml",
                                "Người dùng (Actors), Hệ thống trung tâm và Hệ thống bên ngoài",
                                "Khóa ngoại PostgreSQL"),
                        2,
                        "C1 đặt hệ thống phần mềm trong bức tranh toàn cảnh gồm người sử dụng và các hệ thống ngoại vi.", 1),
                new QuizQuestionSpec("m2-q3",
                        "Sơ đồ C3 (Component Diagram) phóng to phạm vi nào?",
                        "SINGLE_CHOICE",
                        List.of("Các thành phần kiến trúc nội bộ (Controllers, Services, Repositories, Clients) bên trong MỘT container",
                                "Toàn bộ trung tâm dữ liệu toàn cầu",
                                "Cơ cấu phòng ban công ty",
                                "Trình duyệt người dùng"),
                        0,
                        "C3 mở nắp một container cụ thể từ C2 để cho thấy cách các Component nội bộ phối hợp.", 1),
                new QuizQuestionSpec("m2-q4",
                        "Hai module Java (order và billing) đóng gói chung trong 1 tệp app.jar duy nhất chứng minh điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Đây là 2 Microservices độc lập",
                                "Mỗi module có server DB riêng",
                                "Mới chỉ là ranh giới Modular Monolith (triển khai chung 1 container), chưa phải 2 Microservices độc lập",
                                "Hệ thống đang dùng Kafka"),
                        2,
                        "Microservice phải là đơn vị triển khai độc lập; đóng gói chung 1 JAR vẫn chỉ là 1 container.", 1),
                new QuizQuestionSpec("m2-q5",
                        "Bằng chứng nào mạnh nhất cho thấy hai dịch vụ vi phạm phản mẫu Shared Database?",
                        "SINGLE_CHOICE",
                        List.of("Cả hai dùng Java 21",
                                "Cả hai chọn PostgreSQL nhưng tách DB và tài khoản riêng",
                                "Cả hai kết nối cùng 1 schema và đọc/ghi trực tiếp lên cùng một bảng dữ liệu",
                                "Hai dịch vụ gọi nhau qua REST API"),
                        2,
                        "Chia sẻ quyền đọc/ghi trực tiếp cùng một bảng phá vỡ đóng gói Bounded Context.", 1),
                new QuizQuestionSpec("m2-q6",
                        "Trong DDD, lớp dịch thuật đứng chắn giữa Microservice mới và hệ thống cũ để ngăn ô nhiễm mô hình miền gọi là gì?",
                        "SINGLE_CHOICE",
                        List.of("Shared Kernel", "Conformist", "Anti-Corruption Layer (ACL)", "Database Trigger"),
                        2,
                        "Anti-Corruption Layer (ACL) dịch qua lại giữa mô hình bên ngoài và mô hình miền sạch bên trong Bounded Context.", 1),
                new QuizQuestionSpec("m2-q7",
                        "Trong thiết kế DDD cho Microservices, Order Aggregate tham chiếu tới Restaurant Aggregate bằng cách nào?",
                        "SINGLE_CHOICE",
                        List.of("Dùng @ManyToOne trực tiếp giữa 2 DB",
                                "Lưu trữ định danh giá trị (UUID restaurantId / khóa ngoại mềm) thay vì giữ tham chiếu đối tượng xuyên dịch vụ",
                                "Gộp chung thành 1 bảng 200 cột",
                                "Không lưu thông tin nhà hàng"),
                        1,
                        "Các Aggregate tham chiếu nhau qua Identity Reference (ID) để giữ tính độc lập giao dịch.", 1),
                new QuizQuestionSpec("m2-q8",
                        "Tại sao Constructor Injection trong Spring Boot lại hữu ích khi phân tích sơ đồ C3?",
                        "SINGLE_CHOICE",
                        List.of("Giúp giấu kín phụ thuộc",
                                "Làm lộ rõ mọi phụ thuộc bắt buộc của Component trên hàm khởi tạo và dễ viết Unit Test",
                                "Tự động biến SQL thành GraphQL",
                                "Không cần biên dịch"),
                        1,
                        "Constructor Injection thể hiện tường minh các cạnh phụ thuộc nội bộ ở mức C3.", 1),
                new QuizQuestionSpec("m2-q9",
                        "Loại test nào kiểm tra URL mapping, @Valid, HTTP status và JSON serialization của Controller mà không cần DB thật?",
                        "SINGLE_CHOICE",
                        List.of("Web Layer Slice Test với @WebMvcTest và MockMvc",
                                "Đếm số package",
                                "Chỉ đọc README.md",
                                "Chạy tải production"),
                        0,
                        "@WebMvcTest chỉ nạp tầng Web/Controller để kiểm tra chính xác hợp đồng HTTP và Validation.", 1),
                new QuizQuestionSpec("m2-q10",
                        "Chỉ nhìn thấy tên class kết thúc bằng Service (VD: HelperService) có đủ kết luận là tầng điều phối nghiệp vụ chuẩn C3 không?",
                        "SINGLE_CHOICE",
                        List.of("Luôn đủ 100%",
                                "Không; cần đối chiếu bằng chứng mã nguồn thực tế (ai gọi, nó gọi đâu, hành vi bên trong)",
                                "Chỉ cần có 2 method",
                                "Chỉ cần tên viết hoa"),
                        1,
                        "Ranh giới kiến trúc nằm ở luồng gọi và hành vi thực tế trong mã nguồn (Code Evidence), không chỉ ở hậu tố tên class.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 2: Phân rã Hệ thống Thương mại Điện tử theo DDD & C4 Model",
                "Đề xuất tách Monolith chia sẻ bảng sang Bounded Context, Database-per-Service và đặc tả C1–C3.",
                """
                ### Đề bài Tự luận Chương 2: Phân rã Monolith Thương mại Điện tử & Đặc tả C4 Model
                Công ty của bạn đang chạy một Monolith gồm `Orders`, `Payments`, `Inventory`, `Notifications` dùng chung `ecommerce_shared_db`, dẫn tới khóa bảng nặng khi báo cáo tồn kho.

                **Yêu cầu bài viết (400 – 600 từ)**:
                1. **Phân rã theo `Bounded Context` & `Database-per-Service`**: Chỉ rõ từng Microservice, trách nhiệm cốt lõi, `Aggregate Root` chính và các bảng sở hữu độc quyền. Giải thích cách `order-service` lấy tồn kho mà không được phép `JOIN` chéo DB.
                2. **Đặc tả 3 tầng `C1`, `C2`, `C3`**: Liệt kê chính xác các Nodes và Edges ở C1 Context, C2 Container, và C3 Component bên trong `order-service`.
                """,
                List.of(
                        new RubricCriterion("1. Phân định Bounded Context & Database-per-Service", 40,
                                "Tách rõ 4 dịch vụ/4 DB riêng, xác định Aggregate Root đúng và thay SQL JOIN chéo bằng API/Events."),
                        new RubricCriterion("2. Cô lập nghiêm ngặt 3 tầng C1, C2, C3", 40,
                                "Phân bổ đúng phần tử cho từng mức C1, C2, C3; không lẫn Database/Class vào C1 hoặc Class nhỏ vào C2."),
                        new RubricCriterion("3. Cấu trúc nội bộ C3 của order-service", 20,
                                "Thể hiện rõ OrderController -> OrderApplicationService -> Order Aggregate / Repository & Outbound Client Ports.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "STATIC_LAB",
                "Mô hình Trực quan #1: Khám phá Sơ đồ Tĩnh C1–C3 & Kiểm toán Shared Database (3E)",
                "Quan sát mô hình kiến trúc tham chiếu C1 Context, C2 Container, C3 Component và kiểm tra 5 quy tắc bằng chứng 3E.",
                false,
                List.of("C4_CONTEXT", "C4_CONTAINER", "C4_COMPONENT")
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                2,
                "Chương 2 · Từ Monolith Đến Microservices, C4 Model (C1–C3) & Domain-Driven Design",
                "Phân rã hệ thống theo Scale Cube Y-axis, DDD Bounded Context, Database-per-Service và phân tầng kiến trúc C1–C3.",
                "Lab 02 · C1–C3 Static Architecture & Shared Database Audit",
                "Khám phá sơ đồ C1 System Context, C2 Container, C3 Component và kiểm toán ranh giới Database-per-Service.",
                "java-01",
                lessons(),
                quizQuestions(),
                essay(),
                visualLab()
        );
    }
}
