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
                        # 📖 BÀI 3.1 (`java-04`): GIAO TIẾP ĐỒNG BỘ VỚI `SPRING CLOUD OPENFEIGN` & THUẬT TOÁN `CYCLE-SAFE REVERSE BFS`

                        ### 1. Giao Tiếp Đồng Bộ (`Synchronous Request/Response`) Với `Spring Cloud OpenFeign`
                        Theo Chương 3 cuốn *Microservices Patterns* (Chris Richardson) và tài liệu [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/spring-cloud-openfeign.html), khi `order-service` cần gọi sang `payment-service` qua giao thức HTTP/REST, thay vì phải viết hàng chục dòng code `RestTemplate` nối chuỗi URL thủ công, lập trình viên chỉ cần khai báo một **Declarative HTTP Client Interface** với `@FeignClient`:

                        ```java
                        package com.mavis.ecommerce.order.infrastructure.client;

                        import org.springframework.cloud.openfeign.FeignClient;
                        import org.springframework.web.bind.annotation.PostMapping;
                        import org.springframework.web.bind.annotation.RequestBody;

                        // Điểm khai báo phụ thuộc từ order-service (Caller) sang payment-service (Provider)
                        @FeignClient(name = "payment-service", path = "/api/v1/payments")
                        public interface PaymentFeignClient {

                            @PostMapping("/authorize")
                            PaymentAuthorizationResponse authorizePayment(@RequestBody AuthorizePaymentRequest request);
                        }
                        ```

                        - **Quy tắc Đối chiếu Bằng chứng Hợp đồng (`Contract Matching Evidence`)**:
                          - Việc chỉ tồn tại một interface `@FeignClient` trong source code mới chỉ chứng minh **"Có khai báo Client"**. Để khẳng định thực sự có mối phụ thuộc gọi hàm ở mức tĩnh, ta phải kiểm tra đủ **3 điểm**:
                            1. **Điểm gọi (`Call-site`)**: Phương thức `paymentFeignClient.authorizePayment(...)` thực sự được gọi từ bên trong `OrderService`.
                            2. **Khớp Hợp đồng (`Method + Path Match`)**: HTTP Verb (`POST`) và đường dẫn ghép đầy đủ (`/api/v1/payments/authorize`) của `PaymentFeignClient` bên `order-service` khớp hoàn toàn với `@RequestMapping("/api/v1/payments") + @PostMapping("/authorize")` tại `PaymentController` bên `payment-service`!
                            3. **Phân biệt Khả năng Tĩnh vs. Thực tế Runtime**: Đồ thị tĩnh cho biết **khả năng tác động theo thiết kế mã nguồn**, còn muốn biết lúc chạy thực tế có bao nhiêu gói tin đã đi qua cạnh đó thì phải đối chiếu với **OpenTelemetry Runtime Trace**.

                        ### 2. Đồ Thị Phụ Thuộc & Thuật Toán `Cycle-Safe Reverse BFS` Tính Bán Kính Ảnh Hưởng (`Blast Radius`)
                        Giả sử trên Đồ thị Phụ thuộc Dịch vụ (`Service Dependency Graph`), cạnh có hướng `A → B` mang ý nghĩa: **"Dịch vụ `A` phụ thuộc vào (gọi sang) dịch vụ `B`"**:

                        `api-gateway → order-service → payment-service`

                        Bây giờ, nếu **`payment-service` bị sập hoặc thay đổi hợp đồng API**, dịch vụ nào sẽ bị lỗi theo?
                        - Tác động lỗi sẽ **lan truyền NGƯỢC chiều mũi tên phụ thuộc** (từ dịch vụ được gọi `Provider` ngược về dịch vụ gọi nó `Caller`):

                          `payment-service (Tâm chấn) ⇝ order-service (Hop 1 — Trực tiếp) ⇝ api-gateway (Hop 2 — Gián tiếp)`

                        - **Tại sao bắt buộc phải dùng tập `visited` (`Cycle-Safe Reverse BFS`)?**:
                          Trong các hệ thống thực tế, đôi khi lập trình viên vô tình tạo ra **chu trình phụ thuộc vòng (`Cyclic Dependency`: `A → B → C → A`)**. Nếu duyệt ngược mà không có tập `Set<String> visited` ghi nhớ các dịch vụ đã thăm, thuật toán sẽ chạy vòng tròn vô tận làm treo cứng CPU!

                        ```java
                        package com.mavis.ecommerce.impact;

                        import java.util.*;

                        public class ReverseBfsImpactAnalyzer {

                            public record ImpactedService(String serviceId, int hopDistance, String impactType) {}

                            /**
                             * Thuật toán Cycle-Safe Reverse BFS:
                             * @param forwardEdges Danh sách cạnh phụ thuộc xuôi (caller -> provider)
                             * @param targetService Dịch vụ tâm chấn bị thay đổi hoặc gặp sự cố
                             */
                            public List<ImpactedService> computeBlastRadius(Map<String, List<String>> forwardEdges,
                                                                            String targetService) {
                                // Bước 1: Đảo ngược toàn bộ chiều mũi tên (provider -> danh sách các callers)
                                Map<String, List<String>> reverseGraph = new HashMap<>();
                                forwardEdges.forEach((caller, providers) -> {
                                    for (String provider : providers) {
                                        reverseGraph.computeIfAbsent(provider, k -> new ArrayList<>()).add(caller);
                                    }
                                });

                                // Bước 2: Duyệt BFS trên đồ thị ngược với tập visited để chống vòng lặp vô tận (Cycle-safe)
                                List<ImpactedService> result = new ArrayList<>();
                                Set<String> visited = new HashSet<>();
                                Queue<Map.Entry<String, Integer>> queue = new ArrayDeque<>();

                                visited.add(targetService); // Không bao giờ thêm chính dịch vụ tâm chấn vào danh sách bị ảnh hưởng
                                queue.offer(Map.entry(targetService, 0));

                                while (!queue.isEmpty()) {
                                    var current = queue.poll();
                                    String currentService = current.getKey();
                                    int currentHop = current.getValue();

                                    for (String upstreamCaller : reverseGraph.getOrDefault(currentService, List.of())) {
                                        if (visited.add(upstreamCaller)) { // Chỉ duyệt nếu chưa từng thăm
                                            int nextHop = currentHop + 1;
                                            String type = (nextHop == 1) ? "DIRECT" : "INDIRECT";
                                            result.add(new ImpactedService(upstreamCaller, nextHop, type));
                                            queue.offer(Map.entry(upstreamCaller, nextHop));
                                        }
                                    }
                                }
                                return result;
                            }
                        }
                        ```
                        """
                ),
                new LessonSpec(
                        "java-05",
                        "Bài 3.2 (java-05): Khám phá dịch vụ động Eureka Registry & Client-Side Load Balancing",
                        "Phân biệt Eureka Client-Side Discovery với Docker Compose DNS và điều kiện nhận tải khi Scale Replicas.",
                        50,
                        """
                        # 📖 BÀI 3.2 (`java-05`): KHÁM PHÁ DỊCH VỤ ĐỘNG (`SERVICE DISCOVERY` VỚI EUREKA) & CÂN BẰNG TẢI NHIỀU INSTANCE

                        ### 1. Tại Sao Không Thể Gán Cứng Địa Chỉ IP Trong Môi Trường Đám Mây & Container?
                        Theo Chương 3 cuốn *Microservices Patterns* (Chris Richardson) và Chương 4–5 cuốn *Mastering Microservices with Java* (Sourabh Sharma), trong môi trường container hóa (Docker / Kubernetes), các instances của một dịch vụ liên tục được tạo mới hoặc thu hồi khi **Scale Up / Scale Down**, khiến địa chỉ IP và Port thay đổi liên tục.
                        Để giải quyết, hệ thống sử dụng **Service Registry (Sổ đăng ký dịch vụ — ví dụ `Spring Cloud Netflix Eureka`)**:
                        1. **Cơ chế Tự đăng ký (`Self-Registration`)**: Mỗi khi một instance của `inventory-service` khởi động, nó gửi tên định danh logic (`spring.application.name=inventory-service`) cùng địa chỉ `IP:Port` của nó lên đăng ký với `Eureka Server` và định kỳ gửi tín hiệu nhịp tim (`Heartbeat`) để báo rằng nó vẫn còn sống.
                        2. **Bản chất cực kỳ quan trọng cần nhớ**:
                           - **Eureka Registry chỉ lưu giữ và cung cấp danh sách các instances đang đăng ký**, chứ **bản thân Eureka Server KHÔNG phải là một proxy đứng giữa để chia tải cho mọi request**!
                           - Việc chọn gọi vào instance nào trong danh sách đó do **Client-Side Load Balancer (`Spring Cloud LoadBalancer`)** nằm ngay bên trong phía gọi (`order-service` hoặc `api-gateway`) thực hiện (thường theo thuật toán xoay vòng *Round-Robin*).

                        ### 2. Phân Biệt `Application Discovery (Eureka)` Với `Docker Compose DNS Discovery`
                        | Tiêu chí so sánh | `Spring Cloud Eureka` (Client-Side Discovery) | `Docker Compose DNS` (Server/Network DNS Discovery) |
                        | :--- | :--- | :--- |
                        | **Cơ chế hoạt động** | Ứng dụng Java chủ động đăng ký `IP:Port` lên Eureka Server; phía gọi tải bảng danh bạ về RAM và tự chọn instance bằng `Spring Cloud LoadBalancer`. | Mạng nội bộ của Docker tích hợp sẵn máy chủ DNS ở địa chỉ `127.0.0.11`, tự động phân giải tên service trong `docker-compose.yml` (ví dụ `http://inventory-service:8083`) sang IP của các containers. |
                        | **Điều kiện để nhận tải sau khi Scale** | Instance mới phải khởi động xong Spring Context, đăng ký thành công lên Eureka (`UP`), và phía Client đã làm mới (refresh) bộ nhớ đệm danh bạ. | Container phải ở trạng thái `running` / `healthy` trong mạng Docker Compose và không bị xung đột cổng `hostPort` cố định trên máy chủ! |

                        ```yaml
                        eureka:
                          client:
                            service-url:
                              defaultZone: ${EUREKA_URI:http://discovery-service:8761/eureka/}
                            registry-fetch-interval-seconds: 5
                        ```
                        """
                ),
                new LessonSpec(
                        "java-06",
                        "Bài 3.3 (java-06): Spring Cloud Gateway (Predicates, Filters & Defense in Depth)",
                        "Thiết kế định tuyến Gateway với RewritePath/StripPrefix và bảo mật Defense in Depth cho dịch vụ nội bộ.",
                        50,
                        """
                        # 📖 BÀI 3.3 (`java-06`): CỔNG ĐỊNH TUYẾN TẬP TRUNG `SPRING CLOUD GATEWAY` (`PREDICATES`, `FILTERS` & BẢO MẬT)

                        ### 1. Cấu Trúc Hoạt Động Của `Spring Cloud Gateway`
                        Theo Chương 8 cuốn *Microservices Patterns* (Chris Richardson) và [Spring Cloud Gateway Documentation](https://spring.io/projects/spring-cloud-gateway/), mọi yêu cầu từ bên ngoài đi vào hệ thống đều đi qua `api-gateway`. Một quy tắc định tuyến (`Route`) trong Gateway gồm 3 thành phần:
                        1. **`id` & `uri` (Đích đến)**: Địa chỉ dịch vụ hạ nguồn (ví dụ `lb://order-service` để kết hợp cân bằng tải hoặc `http://order-service:8081`).
                        2. **`predicates` (Điều kiện khớp yêu cầu)**: Kiểm tra xem request đến có thỏa mãn điều kiện về đường dẫn (`Path=/api/public/orders/**`), phương thức (`Method=GET,POST`), hoặc Header hay không.
                        3. **`filters` (Bộ lọc biến đổi trước và sau khi chuyển tiếp)**:
                           - Ví dụ `StripPrefix=2` hoặc `RewritePath=/api/public/(?<segment>.*), /api/v1/${segment}`: Đường dẫn mà khách hàng nhìn thấy bên ngoài (`/api/public/orders/123`) sẽ được **viết lại (rewrite)** thành `/api/v1/orders/123` trước khi gửi tới `order-service`!
                           - **Quy tắc Đối chiếu Đường dẫn**: Khi có `RewritePath` hoặc `StripPrefix`, ta bắt buộc phải lấy **đường dẫn SAU khi đã biến đổi** để đối chiếu với `@RequestMapping` của Controller phía dưới!

                        ```yaml
                        # File: api-gateway/src/main/resources/application.yml
                        spring:
                          cloud:
                            gateway:
                              routes:
                                - id: order-service-route
                                  uri: lb://order-service
                                  predicates:
                                    - Path=/external/v1/orders/**
                                    - Method=GET,POST
                                  filters:
                                    # Biến đổi /external/v1/orders/99 -> /api/v1/orders/99 trước khi gửi xuống order-service
                                    - RewritePath=/external/v1/(?<segment>.*), /api/v1/${segment}
                                    - AddRequestHeader=X-Gateway-Verified, true
                        ```

                        ### 2. Nguyên Tắc Phòng Thủ Chiều Sâu (`Defense in Depth`)
                        - Mặc dù `API Gateway` thường thực hiện xác thực chữ ký `JWT` ở cửa ngõ (Edge Authentication), **các Microservices phía dưới (`order-service`, `payment-service`) VẪN PHẢI tự kiểm tra quyền truy cập tài nguyên (`Authorization / RBAC & Resource Ownership`)**! Tuyệt đối không giả định rằng cứ request nào lọt qua Gateway thì người dùng đó được phép xóa hay sửa đơn hàng của người khác.
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
                ### Đề bài Tự luận Chương 3: Thiết kế Định tuyến API Gateway & Tính toán Bán kính Ảnh hưởng (`Reverse BFS`)
                Cho một hệ thống gồm 6 dịch vụ với các mối phụ thuộc gọi đồng bộ (`Synchronous HTTP/OpenFeign`) như sau:
                - `api-gateway` gọi sang `order-service`, `catalog-service`, và `loyalty-service`.
                - `order-service` gọi sang `payment-service`, `inventory-service`, và `loyalty-service`.
                - `loyalty-service` gọi sang `payment-service` (để tra cứu lịch sử chi tiêu tích điểm).
                - `payment-service` gọi ngược sang `order-service` (để lấy thông tin chi tiết đơn hàng — **chú ý: có chu trình phụ thuộc vòng!**).

                **Yêu cầu bài viết tự luận (400 – 600 từ)**:
                1. **Truy vết từng bước Thuật toán `Cycle-Safe Reverse BFS`**: Giả sử đội phát triển **`payment-service`** thay đổi cấu trúc JSON trả về của API thanh toán (hoặc `payment-service` bị sập). Hãy biểu diễn lại **Đồ thị Ngược (`Reverse Graph`)** và trình bày từng bước chạy của hàng đợi `Queue` cùng tập `visited` (Hop 1, Hop 2...) để liệt kê chính xác các dịch vụ bị ảnh hưởng **Trực tiếp (`DIRECT`)** và **Gián tiếp (`INDIRECT`)**. Giải thích chuyện gì sẽ xảy ra tại chu trình `order-service <-> payment-service` nếu thuật toán thiếu tập `visited`.
                2. **Thiết kế Cấu hình `Spring Cloud Gateway` & Loại bỏ Chu trình Phụ thuộc**:
                   - Hãy viết đoạn cấu hình `spring.cloud.gateway.routes` trong `application.yml` để định tuyến đường dẫn bên ngoài `/public/shop/orders/**` vào `lb://order-service` với đường dẫn nội bộ `/api/v1/orders/**`.
                   - Đề xuất cách thiết kế lại dữ liệu gửi đi giữa `order-service` và `payment-service` để **xóa bỏ hoàn toàn chu trình phụ thuộc vòng (`order-service <-> payment-service`)**.
                """,
                List.of(
                        new RubricCriterion("1. Truy vết chính xác Reverse BFS & Tập visited", 45,
                                "Đảo chiều đúng các cạnh, xác định đúng Hop 1 (order-service, loyalty-service) và Hop 2 (api-gateway), giải thích rõ cách tập visited chặn vòng lặp order-service <-> payment-service."),
                        new RubricCriterion("2. Cấu hình Spring Cloud Gateway (Predicates & Filters)", 30,
                                "Viết đúng cú pháp uri: lb://order-service, Path=/public/shop/orders/** và RewritePath sang /api/v1/orders/..."),
                        new RubricCriterion("3. Giải pháp Phá vỡ Chu trình Phụ thuộc (Cycle Breaking)", 25,
                                "Đề xuất đúng việc truyền đủ dữ liệu cần thiết trong DTO của AuthorizePaymentRequest (hoặc dùng sự kiện) để payment-service không phải gọi ngược lại order-service.")
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
