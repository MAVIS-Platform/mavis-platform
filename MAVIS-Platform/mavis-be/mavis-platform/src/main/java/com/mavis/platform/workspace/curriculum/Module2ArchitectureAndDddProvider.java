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
                        # 📖 Bài 2.1: Monolith -> Microservices, Scale Cube & C4 Model (C1–C3)

                        ## 1. Khối lập phương Mở rộng 3 chiều (`The Scale Cube`)
                        - **Trục X**: Nhân bản ngang các replica sau Load Balancer.
                        - **Trục Z**: Phân mảnh dữ liệu theo người dùng hoặc vùng địa lý.
                        - **Trục Y (Microservices)**: Phân rã theo **chức năng nghiệp vụ độc lập** (`Order`, `Payment`, `Inventory`), giúp phát triển, build và deploy tách biệt.

                        ## 2. Tư duy phân tầng C4 Model (`C1`, `C2`, `C3`)
                        | Tầng C4 | Câu hỏi trả lời | Phần tử hợp lệ | Sai lầm cần tránh |
                        | :--- | :--- | :--- | :--- |
                        | **C1 Context** | Ai dùng hệ thống & nói chuyện với hệ thống ngoài nào? | Actor, Software System, Stripe/SMTP | Vẽ Microservice hay bảng DB vào C1 |
                        | **C2 Container** | Gồm những ứng dụng & DB triển khai độc lập nào? | `api-gateway`, `order-service`, `Order DB`, `Kafka` | Vẽ từng class Java vào C2 |
                        | **C3 Component** | Bên trong 1 service có các module trách nhiệm nào? | `@RestController`, `@Service`, `@FeignClient`, `@Repository` | Coi mọi class Java là 1 Microservice |
                        """
                ),
                new LessonSpec(
                        "java-02",
                        "Bài 2.2 (java-02): DDD Bounded Context, Database-per-Service & Phản mẫu Shared Database",
                        "Phân rã theo Bounded Context, Anti-Corruption Layer (ACL) và kiểm toán phản mẫu Shared Database.",
                        50,
                        """
                        # 📖 Bài 2.2: DDD Bounded Context, Database-per-Service & Shared DB Anti-pattern

                        ## 1. Domain-Driven Design Chiến lược
                        - **`Ubiquitous Language` & `Bounded Context`**: Mỗi ngữ cảnh có ranh giới mô hình riêng (`Account` ở `Identity` khác với `Account` ví tiền ở `Payment`).
                        - **`Anti-Corruption Layer (ACL)`**: Lớp dịch thuật ngăn mô hình dữ liệu cũ làm ô nhiễm dịch vụ mới.

                        ## 2. `Database-per-Service` vs Phản mẫu `Shared Database`
                        - Hai dịch vụ chạy cùng công nghệ PostgreSQL (hoặc cùng 1 server vật lý) **nhưng tách riêng database/schema & credential** là hợp lệ.
                        - **Vi phạm thật sự (`Shared Database`)**: Khi 2 dịch vụ cùng kết nối chung schema/tài khoản và đọc/ghi trực tiếp trên cùng một bảng dữ liệu!
                        """
                ),
                new LessonSpec(
                        "java-03",
                        "Bài 2.3 (java-03): Cấu trúc nội bộ C3 Component trong Spring Boot & DDD Aggregate Root",
                        "Thiết kế Entity, Value Object, Aggregate Root, tham chiếu qua ID và Constructor Injection minh bạch cho C3.",
                        50,
                        """
                        # 📖 Bài 2.3: Cấu trúc nội bộ C3 Component & DDD Aggregate Root

                        ## 1. 5 Khối xây dựng DDD chiến thuật
                        1. **Entity**: Có định danh duy nhất tồn tại suốt vòng đời (`Order.id`).
                        2. **Value Object**: Bất biến, định nghĩa bằng giá trị (`Money(amount, currency)`).
                        3. **Aggregate & Aggregate Root**: Cụm nhất quán giao dịch (`Order` + `OrderLineItem`). Không giữ tham chiếu `@ManyToOne` xuyên dịch vụ mà chỉ giữ **ID tham chiếu (`restaurantId`, `customerId`)**.
                        4. **Repository** & **Application Service**: Tiêm phụ thuộc bằng **Constructor Injection** để lộ rõ các cạnh phụ thuộc nội bộ tầng `C3`.
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
