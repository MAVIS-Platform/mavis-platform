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
                        # 📖 BÀI 2.1 (`java-01`): TIẾN HÓA TỪ MONOLITH SANG MICROSERVICES, SCALE CUBE & MÔ HÌNH HÓA C4 (`C1–C3`)

                        ### 1. Từ "Địa Ngục Nguyên Khối" (*Monolithic Hell*) Đến Khối Lập Phương Mở Rộng (*Scale Cube*)
                        Trong Chương 1 cuốn *Microservices Patterns* (Chris Richardson), hệ thống giao đồ ăn **FTGO (Food to Go)** ban đầu được xây dựng như một khối **Monolith** duy nhất (`ftgo-monolith.war`). Khi quy mô tăng lên, nhóm phát triển rơi vào **5 bi kịch của Monolithic Hell**:
                        1. **Độ phức tạp vượt tầm kiểm soát**: Hàng trăm module nghiệp vụ (`Order`, `Delivery`, `Kitchen`, `Accounting`, `Restaurant`) gọi chéo nhau làm không một lập trình viên nào hiểu hết hệ thống.
                        2. **Chu kỳ Build, Test & Deploy cực chậm**: Sửa 1 dòng code nhỏ cũng phải build và khởi động lại toàn bộ ứng dụng mất hàng chục phút.
                        3. **Khó mở rộng quy mô do xung đột tài nguyên**: Module xử lý hình ảnh thực đơn cần nhiều CPU, trong khi module kế toán cần nhiều bộ nhớ RAM — nhốt chung trong 1 tiến trình JVM khiến việc mở rộng cực kỳ lãng phí.
                        4. **Thiếu cô lập lỗi (Lack of Fault Isolation)**: Một lỗi rò rỉ bộ nhớ (*Memory Leak*) ở module báo cáo làm sập toàn bộ JVM, kéo theo tính năng đặt hàng của khách hàng chết ngay lập tức!
                        5. **Bị khóa chặt vào công nghệ cũ (Technology Lock-in)**: Rất khó nâng cấp phiên bản JDK hoặc Spring mới cho toàn bộ khối code khổng lồ cùng một lúc.

                        Để giải quyết, cuốn *Microservices Patterns* và *Production-Ready Microservices* (Susan Fowler, Chương 1) phân tích **Khối lập phương Mở rộng 3 Chiều (`The Scale Cube`)**:

                        ```
                                            Trục Y: Phân rã theo Chức năng Nghiệp vụ (MICROSERVICES!)
                                            (Tách thành Order Service, Payment Service, Inventory Service)
                                                              ^
                                                              |
                                                              |
                                                              +-------------------> Trục X: Nhân bản Ngang sau Load Balancer
                                                             /                      (Chạy N bản sao giống hệt nhau: Replicas 1..N)
                                                            /
                                                           v
                                            Trục Z: Phân mảnh Dữ liệu (Data Partitioning / Sharding)
                                            (Chia request theo vùng địa lý hoặc mã khách hàng Hash(userId))
                        ```

                        - **Trục X (Horizontal Duplication)**: Chạy nhiều bản sao (*Instances / Replicas*) giống hệt nhau phía sau bộ cân bằng tải (*Load Balancer*). Tăng được thông lượng nhưng không giảm được độ phức tạp của code.
                        - **Trục Z (Data Partitioning / Sharding)**: Định tuyến yêu cầu dựa trên thuộc tính dữ liệu (ví dụ khách hàng miền Bắc vào cụm DB Bắc, miền Nam vào cụm DB Nam).
                        - **Trục Y (Functional Decomposition — Chính là Kiến trúc Microservices!)**: Cắt khối Monolith theo từng năng lực nghiệp vụ độc lập thành các dịch vụ nhỏ, mỗi dịch vụ có quy trình phát triển, triển khai và mở rộng hoàn toàn độc lập!

                        ### 2. Tư Duy Phân Tầng Kiến Trúc Với Chuẩn C4 Model (`C1`, `C2`, `C3`)
                        Theo [C4 Model (Simon Brown)](https://c4model.com/diagrams), để không trộn lẫn các khái niệm ở những mức độ trừu tượng khác nhau lên cùng một bức vẽ, kiến trúc phần mềm phải được tách thành các tầng phóng to giống như Google Maps:

                        | Mức C4 | Tên Sơ Đồ | Câu Hỏi Trả Lời | Các Phần Tử Được Phép Có | Sai Lầm Phổ Biến Cần Tránh |
                        | :--- | :--- | :--- | :--- | :--- |
                        | **`C1`** | **System Context Diagram** (Sơ đồ Ngữ cảnh Hệ thống) | Hệ thống của chúng ta phục vụ những ai và giao tiếp với hệ thống bên ngoài nào? | • Người dùng (`Person / Actor`)<br>• Hệ thống trung tâm (`Software System`)<br>• Hệ thống ngoại vi (`External System`: Stripe, Gmail SMTP) | Đưa tên các Microservices nội bộ, bảng PostgreSQL hoặc class Java lên sơ đồ `C1`! |
                        | **`C2`** | **Container Diagram** (Sơ đồ Đơn vị Triển khai) | Hệ thống bao gồm những ứng dụng chạy độc lập (processes/containers) và kho dữ liệu nào? | • Các Microservices (`api-gateway`, `order-service`, `payment-service`)<br>• Các Database (`Order DB`, `Payment DB`)<br>• Message Broker (`RabbitMQ`, `Kafka`) | Nhầm chữ "Container" của C2 là chỉ dùng cho Docker, hoặc vẽ các class Java nhỏ lẻ lên sơ đồ `C2`! |
                        | **`C3`** | **Component Diagram** (Sơ đồ Thành phần Nội bộ) | Bên trong **một** container (ví dụ `order-service`) được chia thành những khối trách nhiệm nào? | • `OrderController` (`@RestController`)<br>• `OrderService` (`@Service`)<br>• `PaymentFeignClient` (`@FeignClient`)<br>• `OrderRepository` (`@Repository`) | Mặc định cứ 1 lớp Java bất kỳ là 1 Microservice, hoặc trộn lẫn nội bộ của tất cả các services vào 1 hình `C3` duy nhất! |
                        """
                ),
                new LessonSpec(
                        "java-02",
                        "Bài 2.2 (java-02): DDD Bounded Context, Database-per-Service & Phản mẫu Shared Database",
                        "Phân rã theo Bounded Context, Anti-Corruption Layer (ACL) và kiểm toán phản mẫu Shared Database.",
                        50,
                        """
                        # 📖 BÀI 2.2 (`java-02`): DOMAIN-DRIVEN DESIGN (`BOUNDED CONTEXT`), `DATABASE-PER-SERVICE` & PHẢN MẪU `SHARED DATABASE`

                        ### 1. Hai Chiến Lược Phân Rã Hệ Thống & Thiết Kế Chiến Lược DDD
                        Theo Chương 2 cuốn *Microservices Patterns* (Chris Richardson) và Chương 3 cuốn *Mastering Microservices with Java* (Sourabh Sharma), để tách một hệ thống lớn thành các Microservices đúng đắn (không bị tách quá nhỏ thành *Nanoservices* hay dính chùm thành *Distributed Monolith*), chúng ta dựa trên 2 phương pháp:
                        1. **Phân rã theo Năng lực Kinh doanh (`Decompose by Business Capability`)**: Xác định các hoạt động cốt lõi tạo ra giá trị của doanh nghiệp (Quản lý Đơn hàng, Xử lý Thanh toán, Quản lý Tồn kho, Giao nhận).
                        2. **Phân rã theo Miền con & Ngữ cảnh Giới hạn của DDD (`Decompose by Subdomain & Bounded Context`)**:
                           - **Ngôn ngữ Chung (`Ubiquitous Language`)**: Ngôn ngữ thống nhất giữa chuyên gia nghiệp vụ và kỹ sư phần mềm trong cùng một miền.
                           - **Ngữ cảnh Giới hạn (`Bounded Context`)**: Ranh giới rõ ràng mà bên trong đó một mô hình miền (*Domain Model*) có ý nghĩa duy nhất. Ví dụ: Khái niệm `"Account"` trong ngữ cảnh `Identity Service` là Tài khoản đăng nhập (Email, PasswordHash), nhưng `"Account"` trong ngữ cảnh `Payment Service` lại là Ví tiền/Số dư tín dụng! Nhờ `Bounded Context`, mỗi Microservice sở hữu mô hình riêng mà không giẫm chân lên nhau.
                           - **Bản đồ Ngữ cảnh (`Context Map` — Chương 3 *Mastering Microservices with Java*)**: Định nghĩa cách các `Bounded Context` tích hợp với nhau thông qua các mẫu như *Customer-Supplier*, *Shared Kernel*, *Open Host Service*, và đặc biệt là **Lớp Chống Thoái Hóa (`Anti-Corruption Layer — ACL`)** giúp chuyển đổi dữ liệu từ hệ thống cũ/ngoại vi mà không làm ô nhiễm mô hình miền bên trong dịch vụ mới.

                        ### 2. Nguyên Tắc Sống Còn: `Database-per-Service` vs. Phản Mẫu `Shared Database`
                        Mỗi Microservice bắt buộc phải là **chủ sở hữu duy nhất (Single Owner)** đối với dữ liệu thuộc `Bounded Context` của nó:

                        ```
                        [PHẢN MẪU: SHARED DATABASE ANTI-PATTERN]                 [CHUẨN MỰC: DATABASE-PER-SERVICE PATTERN]
                        +----------------+      +--------------------+           +----------------+          +--------------------+
                        | order-service  |      | inventory-service  |           | order-service  | --API--> | inventory-service  |
                        +----------------+      +--------------------+           +----------------+          +--------------------+
                                 \\                      /                                |                             |
                                  \\                    /                                 v                             v
                           [ CÙNG GHI VÀO BẢNG orders & inventories ]             [ Order Schema/DB ]          [ Inventory Schema/DB ]
                           ❌ Vi phạm đóng gói: Đổi cột DB làm sập cả 2!          ✅ Cô lập hoàn toàn quyền ghi & schema dữ liệu!
                        ```

                        - **Lưu ý cực kỳ tinh tế khi Kiểm toán Kiến trúc (`java-02`)**:
                          - Hai dịch vụ cùng sử dụng công nghệ PostgreSQL, hoặc thậm chí cùng chạy trên một máy chủ RDS PostgreSQL vật lý để tiết kiệm chi phí hạ tầng **CHƯA CHẮC đã vi phạm `Shared Database`**, miễn là chúng sử dụng **hai Database/Schema hoàn toàn tách biệt** (`order_db` vs `inventory_db`) với tài khoản/quyền truy cập cô lập!
                          - **Dấu hiệu vi phạm thực sự (`Shared Database Violation`)**: Khi hai dịch vụ cùng trỏ chung vào một schema/database VÀ **cùng đọc/ghi trực tiếp lên cùng một bảng dữ liệu** (hoặc dùng chung một bộ tập tin Flyway/Liquibase migration). Nếu khi phân tích tĩnh mà cấu hình quyền truy cập bị thiếu hoặc bị ẩn, người kỹ sư phải kết luận chính xác là **"Chưa đủ bằng chứng (Insufficient Evidence)"** thay vì võ đoán!

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
                        """
                ),
                new LessonSpec(
                        "java-03",
                        "Bài 2.3 (java-03): Cấu trúc nội bộ C3 Component trong Spring Boot & DDD Aggregate Root",
                        "Thiết kế Entity, Value Object, Aggregate Root, tham chiếu qua ID và Constructor Injection minh bạch cho C3.",
                        50,
                        """
                        # 📖 BÀI 2.3 (`java-03`): CẤU TRÚC NỘI BỘ `C3 COMPONENT` TRONG SPRING BOOT & CÁC KHỐI XÂY DỰNG DDD

                        ### 1. Các Khối Xây Dựng Chiến Thuật Của DDD (`Entity`, `Value Object`, `Aggregate`, `Repository`, `Service`)
                        Theo Chương 3 cuốn *Mastering Microservices with Java* (Sourabh Sharma) và Chương 5 cuốn *Microservices Patterns* (Chris Richardson), bên trong một Microservice (tầng `C3`), mô hình miền được cấu thành từ 5 viên gạch:
                        1. **`Entity` (Thực thể định danh)**: Đối tượng có **định danh duy nhất (`ID`)** tồn tại xuyên suốt vòng đời dù các thuộc tính của nó thay đổi (ví dụ: `Order` có `orderId`, trạng thái đổi từ `PENDING → PAID → SHIPPED`).
                        2. **`Value Object` (Đối tượng giá trị)**: Đối tượng được định nghĩa hoàn toàn bởi **giá trị của các thuộc tính** chứ không có ID riêng, và luôn **bất biến (Immutable)** (ví dụ: `Money(amount, currency)`, `DeliveryAddress(street, city)`).
                        3. **`Aggregate` & `Aggregate Root` (Khối tổng hợp & Gốc tổng hợp)**:
                           - Một cụm các `Entity` và `Value Object` (ví dụ: `Order` + danh sách `OrderLineItem`) được gom lại thành một đơn vị nhất quán giao dịch (*Transactional Consistency Boundary*).
                           - Mọi thao tác sửa đổi từ bên ngoài bắt buộc phải đi qua phương thức của **`Aggregate Root` (`Order`)** để bảo toàn các bất biến nghiệp vụ (*Business Invariants*, ví dụ: *"Tổng tiền đơn hàng phải luôn ≥ mức tối thiểu"*).
                           - **Quy tắc kết nối giữa các Aggregate trong Microservices**: Một `Aggregate` (`Order`) chỉ được giữ **khóa định danh (`customerId`, `restaurantId`)** của `Aggregate` khác chứ **không giữ tham chiếu đối tượng JPA `@ManyToOne` trực tiếp** xuyên qua ranh giới dịch vụ!
                        4. **`Repository` (Kho lưu trữ)**: Giao diện chịu trách nhiệm nạp và lưu trữ toàn bộ một `Aggregate Root` xuống cơ sở dữ liệu.
                        5. **`Application / Domain Service`**: Điều phối luồng nghiệp vụ giữa các `Aggregate`, `Repository` và các cổng giao tiếp ngoại vi (`Outbound Ports`).

                        ### 2. Kiến Trúc Nội Bộ 3 Tầng Chuẩn Mực Ở Mức `C3` Của Dịch Vụ Spring Boot
                        Khi đọc hoặc thiết kế mức `C3 Component` của một dịch vụ Spring Boot, hãy luôn sử dụng **Tiêm phụ thuộc qua hàm khởi tạo (`Constructor Injection`)** để mọi phụ thuộc nội bộ lộ rõ ngay trên chữ ký hàm khởi tạo:

                        ```java
                        package com.mavis.ecommerce.order.application;

                        import com.mavis.ecommerce.order.api.dto.CreateOrderRequest;
                        import com.mavis.ecommerce.order.domain.model.Order;
                        import com.mavis.ecommerce.order.domain.port.InventoryClientPort;
                        import com.mavis.ecommerce.order.domain.repository.OrderRepository;
                        import org.springframework.stereotype.Service;
                        import org.springframework.transaction.annotation.Transactional;

                        @Service
                        public class OrderApplicationService {

                            private final OrderRepository orderRepository;
                            private final InventoryClientPort inventoryClient;

                            // Constructor Injection: Nhìn vào đây là thấy rõ ngay sơ đồ phụ thuộc C3!
                            public OrderApplicationService(OrderRepository orderRepository,
                                                           InventoryClientPort inventoryClient) {
                                this.orderRepository = orderRepository;
                                this.inventoryClient = inventoryClient;
                            }

                            @Transactional
                            public Order createOrder(CreateOrderRequest request) {
                                // 1. Kiểm tra tồn kho qua Outbound Port
                                for (var line : request.items()) {
                                    boolean reserved = inventoryClient.checkAndReserveStock(line.skuCode(), line.quantity());
                                    if (!reserved) {
                                        throw new IllegalStateException("Không đủ tồn kho cho mã SKU: " + line.skuCode());
                                    }
                                }
                                // 2. Khởi tạo Aggregate Root (đảm bảo toàn vẹn nghiệp vụ) và lưu qua Repository
                                Order order = Order.createPending(request.customerId(), request.items());
                                return orderRepository.save(order);
                            }
                        }
                        ```
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
                ### Đề bài Tự luận Chương 2: Phân rã Hệ thống Thương mại Điện tử Nguyên khối & Đặc tả C4 Model
                Giả sử công ty của bạn đang vận hành một ứng dụng Thương mại điện tử Nguyên khối (`Monolith`) gồm 4 nhóm chức năng đang dùng chung một cơ sở dữ liệu `ecommerce_shared_db`: (1) Quản lý Đơn hàng (`Orders`), (2) Xử lý Thanh toán (`Payments`), (3) Quản lý Kho hàng (`Inventory`), và (4) Gửi Thông báo Email/SMS (`Notifications`). Trong đợt khuyến mãi vừa qua, việc truy vấn báo cáo tồn kho nặng đã làm khóa bảng Database khiến khách hàng không thể thanh toán đơn hàng.

                **Yêu cầu bài viết tự luận (400 – 600 từ)**:
                1. **Phân rã theo `Bounded Context` & `Database-per-Service`**: Hãy đề xuất phương án tách khối Monolith trên thành các Microservices độc lập. Với mỗi dịch vụ, hãy chỉ rõ: Tên dịch vụ, Trách nhiệm cốt lõi, Tên `Aggregate Root` chính, và các bảng dữ liệu mà nó sở hữu độc quyền. Giải thích cách `order-service` lấy thông tin tồn kho mà không được phép `JOIN` trực tiếp vào bảng của `inventory-service`.
                2. **Đặc tả 3 Tầng Sơ đồ C4 (`C1`, `C2`, `C3`)**: Hãy liệt kê chính xác danh sách các phần tử (`Nodes`) và các mối quan hệ (`Edges` kèm giao thức) sẽ xuất hiện ở từng tầng:
                   - Tầng `C1 (System Context)`
                   - Tầng `C2 (Container Diagram)`
                   - Tầng `C3 (Component Diagram)` khi phóng to vào bên trong `order-service`.
                """,
                List.of(
                        new RubricCriterion("1. Phân định Bounded Context & Quyền sở hữu Dữ liệu", 40,
                                "Tách rõ 4 dịch vụ với 4 schema/DB riêng biệt, chỉ rõ Aggregate Root của từng miền và giải thích đúng việc thay thế câu lệnh SQL JOIN chéo bằng giao tiếp qua API/Events."),
                        new RubricCriterion("2. Tuân thủ nghiêm ngặt Cô lập Tầng C4 (C1, C2, C3)", 40,
                                "Phân bổ đúng phần tử cho từng tầng C1, C2, C3; không trộn lẫn Database/Service vào C1 và không trộn lẫn Class/Component nội bộ vào C2."),
                        new RubricCriterion("3. Thiết kế Cấu trúc Nội bộ C3 của order-service", 20,
                                "Trình bày rõ luồng OrderController -> OrderApplicationService -> Order Aggregate / OrderRepository & Outbound Client Ports.")
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
