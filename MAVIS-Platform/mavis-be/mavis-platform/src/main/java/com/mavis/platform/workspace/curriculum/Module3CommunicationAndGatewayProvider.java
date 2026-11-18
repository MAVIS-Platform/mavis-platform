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

    public static List<QuizQuestionSpec> quizQuestions() {
        return List.of(
                new QuizQuestionSpec("m3-q1",
                        "Cạnh có hướng A -> B nghĩa là A gọi B. Khi B đổi hợp đồng API hoặc sập, Reverse BFS duyệt theo chiều nào?",
                        "SINGLE_CHOICE",
                        List.of("Duyệt xuôi từ A sang B",
                                "Duyệt ngược từ B về A (Hop 1), rồi ngược tiếp về các dịch vụ gọi A (Hop 2)",
                                "Chọn ngẫu nhiên node cô lập",
                                "Chỉ kiểm tra DB của B"),
                        1,
                        "Khi provider B gặp sự cố, các caller phụ thuộc ngược vào nó hứng chịu hậu quả trực tiếp rồi gián tiếp.", 1),
                new QuizQuestionSpec("m3-q2",
                        "Trong Reverse BFS, tập visited giải quyết nguy cơ nào?",
                        "SINGLE_CHOICE",
                        List.of("Sai mật khẩu DB",
                                "Vòng lặp vô tận và đếm trùng khi đồ thị có chu trình (Cyclic Dependency)",
                                "Thiếu ổ cứng Docker",
                                "Hết hạn SSL"),
                        1,
                        "visited đảm bảo mỗi dịch vụ chỉ vào hàng đợi đúng 1 lần dù có chu trình A -> B -> C -> A.", 1),
                new QuizQuestionSpec("m3-q3",
                        "Thấy interface @FeignClient(name=\"payment-service\") trong mã nguồn tĩnh chứng minh được điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Mọi request production đều HTTP 200",
                                "Có khai báo HTTP client tới payment-service, cần kiểm tra thêm call-site và khớp path Controller đích",
                                "payment-service không bao giờ lỗi",
                                "Dùng chung DB"),
                        1,
                        "@FeignClient chưa gọi ở đâu là dead code; cần đối chiếu call-site và HTTP verb + path đích.", 1),
                new QuizQuestionSpec("m3-q4",
                        "Eureka Server (Registry) lưu trữ thông tin gì?",
                        "SINGLE_CHOICE",
                        List.of("Toàn bộ lịch sử thanh toán",
                                "Danh bạ các instances đang đăng ký (tên service, IP, Port, trạng thái UP/DOWN)",
                                "Toàn bộ file .java",
                                "Ảnh giao diện"),
                        1,
                        "Service Registry là cuốn danh bạ động ánh xạ serviceId sang danh sách địa chỉ mạng của instances.", 1),
                new QuizQuestionSpec("m3-q5",
                        "Chỉ riêng việc 1 instance mới đăng ký vào Eureka có tự động chia đều traffic sang nó ngay lập tức không?",
                        "SINGLE_CHOICE",
                        List.of("Luôn 100% tự động",
                                "Không; việc chia tải phụ thuộc Client-Side LoadBalancer, chu kỳ làm mới cache danh bạ và Readiness của instance",
                                "Chỉ cần đổi tên DB",
                                "Eureka tự tắt instance cũ"),
                        1,
                        "Eureka không làm proxy trung gian; client hoặc Gateway phải refresh registry cache và chia tải qua LoadBalancer.", 1),
                new QuizQuestionSpec("m3-q6",
                        "Sau khi Scale Replicas từ 1 lên 3, bằng chứng nào xác nhận việc nhân bản có hiệu quả thực sự?",
                        "SINGLE_CHOICE",
                        List.of("Nhìn tên Docker image",
                                "Xác nhận cả 3 instances nhận request qua OpenTelemetry Spans/Instance ID và so sánh throughput, p95, error rate trước/sau",
                                "Đếm dòng trống pom.xml",
                                "Xem kích thước ZIP"),
                        1,
                        "Hiệu quả scale phải được chứng minh bằng phân bổ span thực tế và cải thiện latency/error dưới tải.", 1),
                new QuizQuestionSpec("m3-q7",
                        "Trong Spring Cloud Gateway, thành phần Predicate giữ vai trò gì?",
                        "SINGLE_CHOICE",
                        List.of("Tạo bảng PostgreSQL",
                                "Kiểm tra điều kiện khớp HTTP request với quy tắc Route",
                                "Chấm điểm tự luận",
                                "Nén file RAR"),
                        1,
                        "Predicate trả về true/false để chọn Route trước khi chạy Filters và forward tới uri.", 1),
                new QuizQuestionSpec("m3-q8",
                        "Khi Gateway dùng StripPrefix=1 hoặc RewritePath, ta phải đối chiếu Controller đích theo đường dẫn nào?",
                        "SINGLE_CHOICE",
                        List.of("Đường dẫn gốc trước khi vào Gateway",
                                "Đường dẫn SAU KHI đã qua Filter biến đổi để khớp với @RequestMapping của dịch vụ đích",
                                "Thư mục cài đặt Java",
                                "Không cần đối chiếu"),
                        1,
                        "Dịch vụ đích nhận URL sau khi Gateway Filter đã rewrite.", 1),
                new QuizQuestionSpec("m3-q9",
                        "Khi API Gateway đã xác thực JWT, Microservice phía sau có cần kiểm tra phân quyền (Authorization) nữa không?",
                        "SINGLE_CHOICE",
                        List.of("Không cần",
                                "Có; theo Defense in Depth, mỗi Microservice vẫn kiểm tra Role/Scope và quyền sở hữu tài nguyên",
                                "Chỉ cuối tuần",
                                "Chỉ kiểm tra tên trình duyệt"),
                        1,
                        "Gateway kiểm tra danh tính ở biên; quyền sở hữu từng bản ghi (BOLA/IDOR) phải kiểm tra tại từng dịch vụ.", 1),
                new QuizQuestionSpec("m3-q10",
                        "Thấy 1 Route trong application.yml của api-gateway tự nó chứng minh điều gì?",
                        "SINGLE_CHOICE",
                        List.of("Mọi request đã trả 200",
                                "Chứng minh thiết kế định tuyến tĩnh; cần đối chiếu Runtime Trace để khẳng định traffic thực tế đã đi qua",
                                "Không bao giờ quá tải",
                                "Không cần Eureka"),
                        1,
                        "YAML thể hiện Design/Config Evidence, còn OpenTelemetry Trace thể hiện Runtime Evidence.", 1)
        );
    }

    public static EssaySpec essay() {
        return new EssaySpec(
                "Bài tập Tự luận Chương 3: Định tuyến API Gateway & Truy vết Reverse BFS",
                "Truy vết Cycle-Safe Reverse BFS trên đồ thị có chu trình, viết cấu hình Spring Cloud Gateway và phá vỡ chu trình phụ thuộc.",
                """
                ### Đề bài Tự luận Chương 3: Blast Radius (Reverse BFS) & Spring Cloud Gateway
                Cho 6 dịch vụ gọi đồng bộ:
                - `api-gateway` -> `order-service`, `catalog-service`, `loyalty-service`
                - `order-service` -> `payment-service`, `inventory-service`, `loyalty-service`
                - `loyalty-service` -> `payment-service`
                - `payment-service` -> `order-service` *(Chu trình phụ thuộc vòng!)*

                **Yêu cầu bài viết (400 – 600 từ)**:
                1. Khi `payment-service` sập, dựng **Reverse Graph** và truy vết từng bước `Queue` + `visited` (Hop 1, Hop 2...) để liệt kê `DIRECT` và `INDIRECT`. Giải thích vai trò của `visited` tại chu trình `order-service <-> payment-service`.
                2. Viết `spring.cloud.gateway.routes` định tuyến `/public/shop/orders/**` vào `lb://order-service` (`/api/v1/orders/**`), và đề xuất cách phá vỡ chu trình `order-service <-> payment-service`.
                """,
                List.of(
                        new RubricCriterion("1. Truy vết chính xác Reverse BFS & tập visited", 45,
                                "Đảo chiều đúng, Hop 1 (order-service, loyalty-service), Hop 2 (api-gateway), giải thích chặn vòng lặp vô hạn."),
                        new RubricCriterion("2. Cấu hình Spring Cloud Gateway Predicates & Filters", 30,
                                "Viết đúng uri lb://order-service, Path Predicate và RewritePath Filter."),
                        new RubricCriterion("3. Giải pháp phá vỡ chu trình phụ thuộc", 25,
                                "Truyền đủ dữ liệu trong AuthorizePaymentRequest DTO hoặc tách sự kiện bất đồng bộ.")
                )
        );
    }

    public static VisualLabSpec visualLab() {
        return new VisualLabSpec(
                "IMPACT_LAB",
                "Mô hình Trực quan #2: Đồ thị Phụ thuộc & Mô phỏng Lan truyền Ngược Reverse BFS",
                "Chọn node tâm chấn trên đồ thị phụ thuộc tĩnh để quan sát Hop 1 (trực tiếp), Hop 2+ (gián tiếp) và cô lập chu trình.",
                false,
                List.of("C4_CONTAINER", "DEPENDENCY_GRAPH")
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
                quizQuestions(),
                essay(),
                visualLab()
        );
    }
}
