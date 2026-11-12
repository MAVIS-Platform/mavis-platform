# Giáo trình Java và C# cho MAVIS

Bản 1 · 12/11/2026 · Giáo trình biên soạn cho WF-02 dựa trên hồ sơ KLTN và nguồn gốc của các dự án.

## Cách sử dụng

- Học nền tảng Java từ Dev.java và Spring Boot từ Spring Guides. Khi làm Lab, chọn JDK và cặp Boot/Cloud phù hợp với repo đã ghim. [Spring Cloud](https://spring.io/projects/spring-cloud/)
- Học C# và ASP.NET Core theo Microsoft Learn. Dùng .NET 10 LTS cho ví dụ mới và đọc `global.json`, `TargetFramework` cùng lịch hỗ trợ trước khi chạy fixture cũ. [Lịch hỗ trợ .NET](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)
- Giảng viên mở **Assignments**, công bố Lab có nguồn đã ghim, chọn **Bài giáo trình** rồi bấm **Công bố bài học và Quiz**. Sinh viên mở **Khóa học của tôi → Xem giáo trình** để đọc thư viện hoặc chọn **Học lý thuyết và làm Quiz** ở assignment đã mở.
- Quiz mặc định đạt từ 70%. Với 4 câu đồng trọng số, cần đúng ít nhất 3 câu. Công bố lại đúng nội dung đang áp dụng giữ phiên bản. Đổi bài tạo phiên bản mới. Thao tác Docker chỉ áp dụng với repo mẫu đã duyệt và môi trường thử.

## Tiêu chí nguồn

Tài liệu chính thức của ngôn ngữ, framework và công cụ được dùng cho ví dụ, tính tương thích và hành vi kỹ thuật. Các sách trong ZIP được đối chiếu theo trang nhà xuất bản và dùng làm tài liệu đọc thêm. Bài học và câu hỏi trong MAVIS được biên soạn cho khung KLTN.

## Lộ trình 13 bài

### 01 · Từ monolith đến microservices và C4

**Java · 45 phút**

**Mục tiêu.** Phân biệt ranh giới nghiệp vụ, ranh giới triển khai và các mức C1–C3.

Monolith thường đóng gói nhiều năng lực nghiệp vụ trong một đơn vị triển khai. Tách service đem lại khả năng phát hành riêng nhưng tạo thêm chi phí giao tiếp, dữ liệu và vận hành. C1 đặt hệ thống trong ngữ cảnh người dùng và hệ thống ngoài. C2 phóng to các ứng dụng và kho dữ liệu chạy được. C3 phóng to thành phần bên trong một container. Không mặc định một lớp Java là một microservice.

**Thực hành.** Trong MAVIS, mở nguồn mẫu do giảng viên gán. Chọn một người dùng, một hệ thống ngoài, một container và một component. Ghi mỗi phần tử vào đúng mức, kèm đường dẫn mã hoặc cấu hình. Đánh dấu giả thuyết cần kiểm chứng khi chạy.

- [Dev.java · Java Learning](https://dev.java/learn/)
- [C4 model · C4 diagrams](https://c4model.com/diagrams)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

### 02 · Ranh giới dịch vụ và quyền sở hữu dữ liệu

**Java · 45 phút**

**Mục tiêu.** Nhận diện dấu hiệu shared database và phân biệt chia sẻ hạ tầng với chia sẻ quyền ghi.

Database-per-service là nguyên tắc sở hữu dữ liệu. Hai service có thể cùng dùng một máy chủ PostgreSQL nếu quyền và schema được cô lập. Nguy cơ tăng khi chúng sửa cùng bảng hoặc cùng phụ thuộc một migration. Kết luận cần đối chiếu tên DB/schema, cấu hình runtime và repository thay vì chỉ so tên engine.

**Thực hành.** Tìm cấu hình datasource và một repository ở hai service. Vẽ bảng service → schema → bảng → quyền đọc/ghi. Gắn trạng thái đã xác minh hoặc chưa đủ bằng chứng cho từng kết nối.

- [Spring · Accessing Data with JPA](https://spring.io/guides/gs/accessing-data-jpa/)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [Manning · Microservices Patterns](https://www.manning.com/books/microservices-patterns)

### 03 · C3 và cấu trúc nội bộ Spring Boot

**Java · 45 phút**

**Mục tiêu.** Lần theo controller, service và repository để giải thích phụ thuộc nội bộ.

Controller nhận và chuyển đổi yêu cầu HTTP. Lớp ứng dụng điều phối nghiệp vụ. Repository đại diện đường đi tới lưu trữ. Ranh giới thực tế phụ thuộc code, không chỉ theo hậu tố tên. Constructor injection giúp thấy phụ thuộc trực tiếp. Unit test kiểm logic riêng, còn web test kiểm binding, status và serialization.

**Thực hành.** Chọn một endpoint trong Lab. Lần từ mapping tới service và repository, ghi bằng chứng cho ba điểm. Chỉ ra một cạnh đáng rà soát và đề xuất test phát hiện thay đổi sai.

- [Dev.java · Java Learning](https://dev.java/learn/)
- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)
- [Spring · Testing the Web Layer](https://spring.io/guides/gs/testing-web/)

### 04 · REST, OpenFeign và Reverse BFS

**Java · 50 phút**

**Mục tiêu.** Tìm client và endpoint tương ứng, rồi tính ảnh hưởng theo hướng ngược phụ thuộc.

Cạnh A → B biểu diễn A phụ thuộc B. Khi B đổi contract, lần ngược cạnh đến A và những bên gọi A. Reverse BFS cần tập visited để dừng trên đồ thị có chu kỳ. Interface OpenFeign giúp tìm client, nhưng cần đối chiếu call site và đường dẫn đích. Hướng ảnh hưởng tĩnh là khả năng tác động, trace mới cho biết luồng đã được quan sát.

**Thực hành.** Chọn một endpoint. Đối chiếu HTTP method, path, caller và provider. Tạo một danh sách tác động trực tiếp và gián tiếp. Nếu graph có chu kỳ, ghi mỗi service một lần.

- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)
- [Spring · Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/spring-cloud-openfeign.html)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

### 05 · Service discovery và nhiều instance

**Java · 40 phút**

**Mục tiêu.** Phân biệt định danh service, registry và cân bằng tải theo instance.

Registry giữ thông tin instance đăng ký. Client hoặc gateway cần cơ chế chọn instance, registry không tự chia tải thay mọi client. Eureka và DNS của Compose có ngữ nghĩa khác nhau. Readiness, cập nhật danh sách và cấu hình client ảnh hưởng kết quả khi scale.

**Thực hành.** Trong nguồn Lab có discovery, tìm tên ứng dụng, địa chỉ registry và cơ chế lookup. So sánh danh sách instance trước/sau scale chỉ trên sandbox khi Lab hỗ trợ.

- [Spring · Spring Cloud](https://spring.io/projects/spring-cloud/)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)
- [Docker Docs · Compose scale](https://docs.docker.com/reference/cli/docker/compose/scale/)

### 06 · API Gateway và quy tắc định tuyến

**Java · 40 phút**

**Mục tiêu.** Đọc predicate, filter và URI đích trong cấu hình gateway.

Gateway chuyển tiếp yêu cầu dựa trên predicate. Filter có thể biến đổi header hoặc path. Một URL nhìn từ client có thể khác URL downstream. Tập trung ingress giúp quan sát nhưng downstream vẫn cần thực thi phân quyền phù hợp. Cấu hình route là bằng chứng thiết kế, không tự chứng minh mọi request đã đi qua.

**Thực hành.** Chọn một route và viết một cặp request match/không match. Ghi path trước/sau rewrite và đích. Đối chiếu với endpoint backend hoặc trace nếu có.

- [Spring · Spring Cloud Gateway](https://spring.io/projects/spring-cloud-gateway/)
- [Spring · Spring Cloud](https://spring.io/projects/spring-cloud/)
- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)

### 07 · Circuit breaker và fallback

**Java · 45 phút**

**Mục tiêu.** Giải thích trạng thái breaker và cách kiểm thử sự cố phụ thuộc.

Circuit breaker quan sát lỗi/chậm theo chính sách và có thể từ chối gọi sớm khi open. Half-open cho phép một số yêu cầu thăm dò. Fallback cần diễn đạt mức suy giảm đúng nghiệp vụ. Không trả thành công giả cho giao dịch chưa thực hiện. Điểm mở breaker phụ thuộc cấu hình và tín hiệu quan sát.

**Thực hành.** Tìm nơi bọc lời gọi downstream bằng breaker. Liệt kê tín hiệu khiến breaker mở, giá trị fallback và kỳ vọng trước/sau khi dừng phụ thuộc trong sandbox.

- [Spring · Spring Cloud Circuit Breaker](https://spring.io/projects/spring-cloud-circuitbreaker/)
- [Microsoft Learn · Build resilient HTTP apps](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

### 08 · Timeout, retry và bulkhead

**Java · 45 phút**

**Mục tiêu.** Thiết kế giới hạn thời gian và tránh khuếch đại tải khi downstream chậm.

Timeout đặt giới hạn chờ theo budget đầu cuối. Retry có thể phục hồi lỗi tạm thời nhưng làm tăng lưu lượng; thao tác ghi cần đánh giá idempotency. Backoff và jitter giúp tránh đợt retry đồng loạt. Bulkhead cô lập tài nguyên để lỗi một phụ thuộc không chiếm toàn bộ capacity.

**Thực hành.** Lập bảng timeout, số lần retry và tổng thời gian tối đa của một lời gọi. Nêu lý do được hoặc không được retry lệnh ghi. So sánh p95 và tỷ lệ lỗi trong sandbox nếu có phép thử.

- [Spring · Spring Cloud Circuit Breaker](https://spring.io/projects/spring-cloud-circuitbreaker/)
- [Microsoft Learn · Build resilient HTTP apps](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

### 09 · Messaging và xử lý trùng sự kiện

**Java · 50 phút**

**Mục tiêu.** Đọc producer, consumer và luồng xử lý dữ liệu bất đồng bộ.

Publisher phát sự kiện và consumer xử lý sau. Tùy broker và chế độ xác nhận, thông điệp có thể được giao lại. Consumer cần dedup hoặc tác vụ idempotent. Một sự kiện được publish chưa có nghĩa toàn bộ hệ thống đã nhất quán. Cần quan sát độ trễ hàng đợi và lỗi consumer.

**Thực hành.** Xác định một publisher, topic/queue và consumer trong Lab. Mô tả xử lý khi cùng event ID đến hai lần. Phân biệt cạnh messaging với cạnh HTTP trên graph.

- [Spring · Spring Cloud Stream](https://spring.io/projects/spring-cloud-stream/)
- [Microsoft Learn · Asynchronous message-based communication](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

### 10 · Saga và hành động bù trừ

**Java · 50 phút**

**Mục tiêu.** Giải thích trình tự local transaction và trạng thái lỗi của Saga.

Saga chia một quy trình thành nhiều local transaction. Khi bước sau thất bại, compensation là hành động nghiệp vụ bù cho bước đã hoàn tất, ví dụ hoàn giữ chỗ. Nó có thể cần retry và theo dõi riêng. Orchestration dùng bộ điều phối; choreography phản ứng với sự kiện. Cần correlation ID và trạng thái để truy vết.

**Thực hành.** Vẽ bảng Order → Payment → Inventory. Với lỗi tại Inventory, liệt kê trạng thái từng bước và hành động bù. Giải thích xử lý khi nhận lại thông điệp bù.

- [Manning · Microservices Patterns](https://www.manning.com/books/microservices-patterns)
- [Microsoft Learn · Asynchronous message-based communication](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

### 11 · Cấu hình tập trung và xác thực dịch vụ

**Java · 45 phút**

**Mục tiêu.** Tách cấu hình theo môi trường, secret và kiểm quyền tài nguyên.

Config server giúp phân phối cấu hình có phiên bản. Secret cần dùng cơ chế quản lý phù hợp và không đưa vào Git hay ảnh minh chứng. JWT cần được xác minh chữ ký, issuer, audience và thời hạn. Xác thực danh tính và phân quyền hành động là hai bước khác nhau. Khi phân tích tĩnh, ghi đường dẫn config và tên biến đã che giá trị.

**Thực hành.** Tìm một giá trị config thường và một tham chiếu secret. Ghi bằng chứng đã che giá trị. Thiết kế ca token hết hạn và tài khoản hợp lệ nhưng thiếu quyền.

- [Spring · Spring Cloud Config](https://spring.io/projects/spring-cloud-config/)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [O’Reilly · Production-Ready Microservices](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)

### 12 · OpenTelemetry và đánh giá trước sau

**Java · 55 phút**

**Mục tiêu.** Đối chiếu mô hình tĩnh với trace, metric và log trong một thử nghiệm có kiểm soát.

Trace nối các span của một yêu cầu. Metrics ghi xu hướng theo thời gian và log ghi sự kiện chi tiết. Một trace đơn lẻ không đủ kết luận p95. Khi thử stop hoặc scale, giữ workload và khoảng đo tương đương, ghi số mẫu và tỷ lệ lỗi. Static graph và runtime evidence phục vụ hai câu hỏi khác nhau.

**Thực hành.** Dùng Lab đã được phép chạy. Chọn một thay đổi, lưu baseline và sau thay đổi. Ghi phiên bản nguồn, khoảng thời gian, trace ID, số mẫu và giới hạn kết luận. Nếu không có runtime, lập kế hoạch đo và ghi chưa quan sát.

- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)
- [OpenTelemetry · Java instrumentation](https://opentelemetry.io/docs/languages/java/)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)
- [Docker Docs · Compose scale](https://docs.docker.com/reference/cli/docker/compose/scale/)
- [O’Reilly · Production-Ready Microservices](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)

### 13 · Microservices với C# và ASP.NET Core

**C# · 70 phút**

**Mục tiêu.** Đọc một repo ASP.NET Core bằng Roslyn và so sánh kiến trúc với Lab Java tương đương.

Chuẩn bị C# với kiểu dữ liệu, interface, LINQ và async/await. Trong ASP.NET Core, lần từ Program.cs đến cấu hình dependency injection, middleware và endpoint mapping. Controllers dùng attribute routing; Minimal APIs thường khai báo route ngay trong bootstrap. Typed HttpClient biểu diễn một phụ thuộc HTTP. EF Core DbContext quản lý đơn vị thao tác dữ liệu và thường có lifetime theo request. Khi kiểm thử, dùng host test và nguồn dữ liệu phù hợp để kiểm status, JSON và quyền. Với tracing, đối chiếu span HTTP/database với cạnh tĩnh. Kiểm phiên bản SDK từ global.json và TargetFramework của repo mẫu trước khi chạy.

**Thực hành.** Mở repo C# được gán. Tìm một route, DI registration, HttpClient hoặc DbContext. Đối chiếu C2/C3 trong MAVIS với file/dòng, thêm một ca HTTP hợp lệ và một ca lỗi. Lập bảng Java ↔ C# cho controller, DI và data access. Nếu có Runtime, đối chiếu trace với source, ghi rõ SDK, phiên bản và bằng chứng.

- [Microsoft Learn · C# language documentation](https://learn.microsoft.com/en-us/dotnet/csharp/)
- [Microsoft Learn · ASP.NET Core fundamentals](https://learn.microsoft.com/en-us/training/paths/aspnet-core-fundamentals/)
- [Microsoft Learn · Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)
- [Microsoft Learn · ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Microsoft · .NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [OpenTelemetry · .NET instrumentation](https://opentelemetry.io/docs/languages/dotnet/)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)

## Tài liệu nhóm đã tập hợp

- *Microservices Patterns*, Chris Richardson · phân rã dịch vụ, messaging và Saga. [Manning](https://www.manning.com/books/microservices-patterns)
- *Production-Ready Microservices*, Susan J. Fowler · độ tin cậy và vận hành. PDF nhóm gửi có nhãn chương đọc thử. [O’Reilly](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)
- *Mastering Microservices with Java*, Sourabh Sharma · bản đầu 2016, ISBN 978-1-78528-517-2 theo trang bản quyền trong PDF nhóm gửi. Đối chiếu API và phiên bản với tài liệu Spring hiện hành. [Trang Packt của ấn bản sau](https://www.packtpub.com/en-us/product/mastering-microservices-with-java-9781789530728)
