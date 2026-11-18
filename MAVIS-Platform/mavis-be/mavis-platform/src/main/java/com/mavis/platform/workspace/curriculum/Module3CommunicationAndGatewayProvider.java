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
                        # Bài 3.1: OpenFeign & Cycle-Safe Reverse BFS

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Đọc hiểu chính xác khai báo `@FeignClient` kết hợp Call-site và đối chiếu chữ ký Controller đích (`HTTP Verb` + `Path` + `DTO`).
                        - Vận dụng thuật toán **Cycle-Safe Reverse BFS** để tính **Vùng ảnh hưởng (`Blast Radius`)** khi một dịch vụ trung tâm gặp sự cố hoặc đổi API.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Khái niệm | Định nghĩa | Vai trò trong MAVIS | Bẫy thường gặp |
                        | :--- | :--- | :--- | :--- |
                        | **Call-site Evidence** | Nơi `@Service` thực sự gọi method `@FeignClient` | Chứng minh cạnh phụ thuộc tĩnh có được dùng | Chỉ có interface `@FeignClient` mà không ai gọi |
                        | **Hop 1 (`DIRECT`)** | Caller gọi trực tiếp tới tâm chấn `payment-service` | Gãy hợp đồng ngay lập tức khi Provider đổi DTO/sập | Nhầm chiều mũi tên xuôi vs ngược |
                        | **Hop >= 2 (`INDIRECT`)** | Dịch vụ phụ thuộc bắc cầu qua Caller Hop 1 | Bị ảnh hưởng dây chuyền về độ trễ & SLA | Vòng lặp vô tận nếu đồ thị có cycle mà thiếu `visited` |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```java
                        public Set<String> findBlastRadius(Map<String, List<String>> reverseAdj, String epicenter) {
                            Set<String> visited = new LinkedHashSet<>();
                            ArrayDeque<String> queue = new ArrayDeque<>();
                            visited.add(epicenter);
                            queue.add(epicenter);
                            while (!queue.isEmpty()) {
                                String current = queue.poll();
                                for (String caller : reverseAdj.getOrDefault(current, List.of())) {
                                    if (visited.add(caller)) {
                                        queue.add(caller);
                                    }
                                }
                            }
                            return visited;
                        }
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Chứng minh hợp đồng 2 chiều**: `@FeignClient(name = "payment-service")` + `@PostMapping("/api/payments/authorize")` phải khớp `@PostMapping("/authorize")` + class prefix `@RequestMapping("/api/payments")` bên `PaymentController`.
                        """
                ),
                new LessonSpec(
                        "java-05",
                        "Bài 3.2 (java-05): Khám phá dịch vụ động Eureka Registry & Client-Side Load Balancing",
                        "Phân biệt Eureka Client-Side Discovery với Docker Compose DNS và điều kiện nhận tải khi Scale Replicas.",
                        50,
                        """
                        # Bài 3.2: Netflix Eureka Discovery & Spring Cloud LoadBalancer

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Phân biệt **Client-Side Discovery (Eureka + Spring Cloud LoadBalancer)** với **Server-Side Discovery (Docker Compose DNS / Kubernetes Service)**.
                        - Nắm vững điều kiện để replica mới thực sự nhận được traffic khi scale ngang trong sản xuất.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Cơ chế | Bên giữ danh sách IP:Port | Ai chia tải? | Lưu ý khi Scale Replicas |
                        | :--- | :--- | :--- | :--- |
                        | **Eureka Client-Side** | Eureka Registry + Local Cache ở Client | `Spring Cloud LoadBalancer` (`lb://...`) | Cần đợi Heartbeat + cache refresh (`registryFetchIntervalSeconds`) |
                        | **Docker DNS Server-Side** | DNS nội bộ của mạng Docker bridge | Kernel VIP / Round-Robin DNS | Tránh ghim cứng `ports: "8081:8081"` ra host khiến port conflict khi scale > 1 |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```yaml
                        eureka:
                          client:
                            service-url:
                              defaultZone: ${EUREKA_URI:http://discovery-service:8761/eureka/}
                            registry-fetch-interval-seconds: 5
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Eureka không phải Proxy**: Request dữ liệu KHÔNG đi xuyên qua Eureka Server; Caller dùng danh bạ cục bộ gọi thẳng sang instance đích.
                        - **Self-Preservation Mode**: Khi nhiều instance mất heartbeat do nghẽn mạng ngắn hạn, Eureka tạm giữ danh bạ để tránh xóa nhầm node còn sống.
                        """
                ),
                new LessonSpec(
                        "java-06",
                        "Bài 3.3 (java-06): Spring Cloud Gateway (Predicates, Filters & Defense in Depth)",
                        "Thiết kế định tuyến Gateway với RewritePath/StripPrefix và bảo mật Defense in Depth cho dịch vụ nội bộ.",
                        50,
                        """
                        # Bài 3.3: Spring Cloud Gateway & Defense in Depth

                        ## 1. Mục tiêu học tập & Bài toán thực tế
                        - Cấu hình chính xác một **Route** của `Spring Cloud Gateway` (`uri`, `predicates`, `filters`).
                        - Kiểm toán nhất quán giữa Public Edge URL và Internal Controller Path sau bước biến đổi (`StripPrefix`, `RewritePath`), kết hợp **Defense in Depth**.

                        ## 2. Nguyên lý Kiến trúc & Bảng đối chiếu
                        | Thành phần Route | Chức năng | Ví dụ thực tế | Sai lầm thường gặp |
                        | :--- | :--- | :--- | :--- |
                        | `uri` | Đích đến qua LoadBalancer | `lb://order-service` | Hardcode `http://localhost:8081` mất khả năng scale |
                        | `predicates` | Điều kiện khớp HTTP Request | `Path=/external/v1/orders/**` | Khớp thừa wildcard che mất route cụ thể hơn |
                        | `filters` | Biến đổi URL/Header trước chuyển tiếp | `StripPrefix=1`, `RewritePath=...` | Quên tính bước rewrite khi đối chiếu Controller đích |

                        ## 3. Triển khai chuẩn với Java 21 & Spring Boot 3
                        ```yaml
                        spring:
                          cloud:
                            gateway:
                              routes:
                                - id: order-public-api
                                  uri: lb://order-service
                                  predicates:
                                    - Path=/external/v1/orders/**
                                  filters:
                                    - RewritePath=/external/v1/(?<segment>.*), /api/v1/${segment}
                        ```

                        ## 4. Checklist Kiểm toán 3E & Các bẫy thường gặp khi vấn đáp
                        - **Defense in Depth**: Dù Gateway đã xác thực JWT ở biên, dịch vụ nội bộ (`order-service`) vẫn BẮT BUỘC tự xác minh role (`@PreAuthorize`) và quyền sở hữu (`AccessPolicyService`), phòng trường hợp kẻ tấn công lọt vào mạng nội bộ hoặc gọi chéo service.
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
