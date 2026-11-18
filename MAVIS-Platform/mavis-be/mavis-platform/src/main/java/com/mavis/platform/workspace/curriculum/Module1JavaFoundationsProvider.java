package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 1: Modern Java 21 Foundations, Collections/Streams & Spring Boot Build Ecosystem.
 */
public final class Module1JavaFoundationsProvider {
    private Module1JavaFoundationsProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-f01",
                        "Bài 1.1 (java-f01): Ranh giới kiểu dữ liệu, Java Record, Interface & Validation ở biên HTTP",
                        "Thiết kế DTO bằng Java 21 Record bất biến sâu, tách hợp đồng Interface khỏi implementation và chặn lỗi dữ liệu ở biên HTTP.",
                        45,
                        """
                        # 📖 Bài 1.1: Ranh giới kiểu dữ liệu, Java 21 Record & Validation ở biên

                        ## 1. Tư duy 3 lớp ranh giới trong Java Microservices
                        Khi một HTTP request (ví dụ `POST /api/v1/orders`) đi vào dịch vụ Spring Boot 3, dữ liệu đi qua 3 lớp ranh giới rõ ràng:
                        1. **Lớp DTO ở biên (`Java 21 Record`)**: Khai báo dữ liệu truyền tải bất biến nông. **Cạm bẫy quan trọng ("Shallow Immutability")**: Một `record` chứa `List<OrderLineDto>` chỉ khóa tham chiếu, không tự khóa danh sách bên trong — bắt buộc dùng **Compact Constructor + `List.copyOf(...)`** để bất biến sâu (*Deep Immutability*).
                        2. **Lớp Hợp đồng Nghiệp vụ (`Interface`)**: Như `InventoryClientPort` chỉ mô tả **What**, tách biệt khỏi **How** (`@Service`).
                        3. **Phân biệt Lỗi dữ liệu biên (`400/422`) vs Lỗi hạ tầng (`500/503`)**: Chặn `quantity <= 0` ngay tại `@Valid` (`@Min`, `@NotBlank`, `@Future`).

                        ```java
                        public record CreateOrderRequest(
                                @NotBlank String customerId,
                                @NotEmpty @Valid List<OrderLineDto> items
                        ) {
                            public CreateOrderRequest {
                                items = items != null ? List.copyOf(items) : List.of();
                            }
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-f02",
                        "Bài 1.2 (java-f02): Cấu trúc dữ liệu Collections, Stream API & Pipeline không tác dụng phụ",
                        "Chọn đúng List, Set, Map theo ngữ nghĩa bài toán và viết Stream pipeline thuần khiết, xử lý trùng khóa an toàn.",
                        45,
                        """
                        # 📖 Bài 1.2: Collections, Stream API & Pipeline không tác dụng phụ

                        ## 1. Chọn đúng cấu trúc dữ liệu (`List` vs `Set` vs `Map`)
                        | Cấu trúc | Ngữ nghĩa cốt lõi | Dùng trong Microservices | Tránh dùng khi |
                        | :--- | :--- | :--- | :--- |
                        | `List<T>` | Giữ thứ tự, cho phép trùng | Danh sách `OrderLine`, chuỗi bước kịch bản | Tra cứu nhanh theo `serviceId` |
                        | `Set<T>` | Phần tử duy nhất, `O(1)` lookup | Tập `visited` chống lặp vô hạn trong `Reverse BFS` | Cần đếm tần suất lặp lại |
                        | `Map<K, V>` | Ánh xạ khóa duy nhất -> giá trị `O(1)` | Index `ServiceElement` theo ID, gom routes theo service | `Collectors.toMap()` thiếu hàm gộp khi trùng khóa |

                        ## 2. Nguyên tắc vàng khi viết `Stream API`
                        - **Không gây tác dụng phụ (`No Side Effects`)**: Cấm gọi HTTP/DB hoặc sửa `List` ngoài bên trong `.filter()` / `.map()`.
                        - Luôn khai báo quy tắc gộp khóa hoặc dùng `Collectors.groupingBy` với `LinkedHashMap` / `LinkedHashSet` để giữ thứ tự xác định.
                        """
                ),
                new LessonSpec(
                        "java-f03",
                        "Bài 1.3 (java-f03): Quản trị Build Maven BOM, Maven Wrapper & Cấu hình đa môi trường",
                        "Hiểu dependencyManagement BOM, Maven Wrapper (./mvnw), thứ tự ưu tiên Spring Profiles và Zero Secret Leaks.",
                        40,
                        """
                        # 📖 Bài 1.3: Quản trị Build Maven BOM & Cấu hình đa môi trường

                        ## 1. `<dependencies>` vs `<dependencyManagement>` (BOM)
                        - `<dependencyManagement>` (như `spring-cloud-dependencies` BOM) **chỉ quy định bảng phiên bản chuẩn tương thích**, không tự tải dependency vào JAR nếu chưa khai báo trong `<dependencies>`.
                        - **Ma trận chuẩn JDK 21**: Spring Boot `3.2.x / 3.3.x` đi kèm Spring Cloud `2023.0.x (Leyton)` trên namespace `jakarta.*`.
                        - Dùng **`./mvnw` (`Maven Wrapper`)** để ghim đúng phiên bản Maven giữa mọi máy lập trình viên và CI/CD Docker.

                        ## 2. Thứ tự ưu tiên Externalized Configuration & Zero Secret Leaks
                        1. `application.yml` mặc định trong JAR.
                        2. `application-{profile}.yml` (theo `SPRING_PROFILES_ACTIVE=docker|prod`).
                        3. **Biến môi trường (`Environment Variables`)**: Ghi đè các tệp YAML trong JAR!
                        - **Tuyệt đối không commit mật khẩu DB, `JWT_SECRET`, API Key lên Git**. Luôn dùng `${SPRING_DATASOURCE_PASSWORD}` truyền từ biến môi trường.
                        """
                )
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                1,
                "Chương 1 · Nền Tảng Java 21, Collections/Streams & Hệ Sinh Thái Spring Boot",
                "Nắm vững Java 21 Record bất biến sâu, Interface Contract, Stream API thuần khiết, Maven BOM và cấu hình đa môi trường.",
                "Lab 01 · Java 21 DTO Boundaries, Stream Pipeline & Multi-Environment Config",
                "Thực hành phân tích ranh giới dữ liệu DTO/Interface, xử lý Collections/Streams và chuẩn hóa cấu hình Spring Boot đa môi trường.",
                "java-f01",
                lessons(),
                List.of(),
                null,
                null
        );
    }
}
