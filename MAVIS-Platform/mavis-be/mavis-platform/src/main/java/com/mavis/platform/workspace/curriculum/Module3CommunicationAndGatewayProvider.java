package com.mavis.platform.workspace.curriculum;

import com.mavis.platform.workspace.curriculum.CourseraCurriculumModels.*;

import java.util.List;

/**
 * Module 3: Synchronous OpenFeign Communication, Cycle-Safe Reverse BFS, Eureka Discovery & Spring Cloud Gateway.
 */
public final class Module3CommunicationAndGatewayProvider {
    private Module3CommunicationAndGatewayProvider() {}

    public static List<LessonSpec> lessons() {
        return List.of(
                new LessonSpec(
                        "java-04",
                        "Bài 3.1 (java-04): Giao tiếp đồng bộ Spring Cloud OpenFeign & Thuật toán Cycle-Safe Reverse BFS",
                        "Đối chiếu hợp đồng OpenFeign -> Controller và chạy Cycle-Safe Reverse BFS tìm Blast Radius an toàn chu trình.",
                        50,
                        """
                        # 📖 Bài 3.1: OpenFeign & Cycle-Safe Reverse BFS

                        ## 1. Bằng chứng Hợp đồng Giao tiếp (`@FeignClient`)
                        - Khai báo `@FeignClient` mới chỉ là Client declaration; cần kiểm chứng thêm **Call-site** và sự trùng khớp **HTTP Verb + Path** tại Controller đích.

                        ## 2. Đồ thị Phụ thuộc & Thuật toán `Cycle-Safe Reverse BFS`
                        Khi `payment-service` (tâm chấn) sập, lỗi lan truyền **ngược chiều mũi tên phụ thuộc** ($A \rightarrow B$ suy ra $B$ ảnh hưởng $A$ ở Hop 1 DIRECT, các dịch vụ gọi $A$ ở Hop 2 INDIRECT).
                        - **Tập `visited`** là bắt buộc để chặn lặp vô tận khi đồ thị có chu trình (`Cyclic Dependency`).
                        """
                ),
                new LessonSpec(
                        "java-05",
                        "Bài 3.2 (java-05): Khám phá dịch vụ động Eureka Registry & Client-Side Load Balancing",
                        "Phân biệt Eureka Client-Side Discovery với Docker Compose DNS và điều kiện nhận tải khi Scale Replicas.",
                        50,
                        """
                        # 📖 Bài 3.2: Netflix Eureka Discovery & Spring Cloud LoadBalancer

                        ## 1. Eureka Server không phải Proxy trung tâm
                        - Các instance tự đăng ký (`IP:Port`) kèm nhịp tim `Heartbeat` lên Eureka Registry.
                        - **Client-Side LoadBalancer (`Spring Cloud LoadBalancer`)** bên trong phía gọi (hoặc API Gateway) trực tiếp tải danh bạ về và chia tải xoay vòng (*Round-Robin*).
                        - Để Scale Replicas thành công: instance mới phải `UP`, sẵn sàng (`Readiness`), không xung đột hostPort và phía gọi làm mới cache danh bạ.
                        """
                ),
                new LessonSpec(
                        "java-06",
                        "Bài 3.3 (java-06): Spring Cloud Gateway (Predicates, Filters & Defense in Depth)",
                        "Thiết kế định tuyến Gateway với RewritePath/StripPrefix và bảo mật Defense in Depth cho dịch vụ nội bộ.",
                        50,
                        """
                        # 📖 Bài 3.3: Spring Cloud Gateway & Defense in Depth

                        ## 1. Giải phẫu một `Route` trong `Spring Cloud Gateway`
                        1. **`uri`**: Đích đến (như `lb://order-service`).
                        2. **`predicates`**: Điều kiện khớp (`Path=/external/v1/orders/**`, `Method=GET,POST`).
                        3. **`filters`**: Biến đổi request trước khi gửi xuống đích (`StripPrefix`, `RewritePath`). Khi đối chiếu Controller đích, bắt buộc dùng **đường dẫn SAU khi rewrite**!

                        ## 2. Phòng thủ chiều sâu (`Defense in Depth`)
                        Dù Gateway đã kiểm tra JWT tại biên, các Microservices nội bộ vẫn PHẢI tự kiểm tra quyền (`@PreAuthorize`) và quyền sở hữu tài nguyên (`Resource Ownership`).
                        """
                )
        );
    }

    public static CourseraModuleSpec module() {
        return new CourseraModuleSpec(
                3,
                "Chương 3 · OpenFeign, Cycle-Safe Reverse BFS, Eureka Discovery & Spring Cloud Gateway",
                "Truy vết bán kính ảnh hưởng bằng Cycle-Safe Reverse BFS, làm chủ Service Discovery và cấu hình API Gateway an toàn.",
                "Lab 03 · Reverse BFS Impact Explorer & API Gateway Routing",
                "Thực hành phân tích lan truyền lỗi ngược (Reverse BFS) trên đồ thị có chu trình và đối chiếu đường dẫn Gateway.",
                "java-04",
                lessons(),
                List.of(),
                null,
                null
        );
    }
}
