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

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                2,
                "Chương 2 · Từ Monolith Đến Microservices, C4 Model (C1–C3) & Domain-Driven Design",
                "Phân rã hệ thống theo Scale Cube Y-axis, DDD Bounded Context, Database-per-Service và phân tầng kiến trúc C1–C3.",
                "Lab 02 · C1–C3 Static Architecture & Shared Database Audit",
                "Khám phá sơ đồ C1 System Context, C2 Container, C3 Component và kiểm toán ranh giới Database-per-Service.",
                "java-01",
                lessons(),
                List.of(),
                null,
                null
        );
    }
}
