# Giáo trình Java và C# cho MAVIS

Bản 2 · 12/11/2026 · Giáo trình biên soạn cho WF-02 dựa trên hồ sơ KLTN và nguồn gốc của các dự án.

## Cách sử dụng

- Học nền tảng Java từ Dev.java và Spring Boot từ Spring Guides. Khi làm Lab, chọn JDK và cặp Boot/Cloud phù hợp với repo đã ghim. [Spring Cloud](https://spring.io/projects/spring-cloud/)
- Học C# và ASP.NET Core theo Microsoft Learn. Dùng .NET 10 LTS cho ví dụ mới và đọc `global.json`, `TargetFramework` cùng lịch hỗ trợ trước khi chạy fixture cũ. [Lịch hỗ trợ .NET](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core)
- Giảng viên mở **Assignments**, công bố Lab có nguồn đã ghim, chọn **Bài giáo trình** rồi bấm **Công bố bài học và Quiz**. Sinh viên mở **Khóa học của tôi → Xem giáo trình** để đọc thư viện hoặc chọn **Học lý thuyết và làm Quiz** ở assignment đã mở.
- Quiz mặc định đạt từ 70%. Với 4 câu đồng trọng số, cần đúng ít nhất 3 câu. Công bố lại đúng nội dung đang áp dụng giữ phiên bản. Đổi bài tạo phiên bản mới. Thao tác Docker chỉ áp dụng với repo mẫu đã duyệt và môi trường thử.

## Tiêu chí nguồn

Tài liệu chính thức của ngôn ngữ, framework và công cụ được dùng cho ví dụ, tính tương thích và hành vi kỹ thuật. Các sách trong ZIP được đối chiếu theo trang nhà xuất bản và dùng làm tài liệu đọc thêm. Bài học và câu hỏi trong MAVIS được biên soạn cho khung KLTN.

## Phạm vi và trình tự học

Bộ giáo trình gồm 30 bài và 120 câu Quiz dùng trong luồng học microservices của MAVIS. Java có 3 bài nền tảng, 12 bài Lab theo hồ sơ KLTN và 3 bài nâng cao. C# có 3 bài nền tảng, 7 Lab theo chủ đề, 1 Lab tổng hợp và 1 bài nâng cao. Có thể học bài nền tảng trước khi vào lớp và dùng các bài nâng cao sau khi đã hoàn tất Lab chính.

Đầu ra Java là giải thích được model C1–C3, luồng gọi và dữ liệu của một Spring Boot/Spring Cloud repo, rồi kiểm tra kết luận qua test hoặc telemetry. Đầu ra C# là lần được endpoint, DI, EF Core và HTTP/messaging từ repo ASP.NET Core, rồi đối chiếu với Roslyn và bằng chứng runtime. Mỗi bài có mục tiêu, phần đọc, một nhiệm vụ và đầu ra thực hành cụ thể. Nguồn tham khảo tập trung vào các chủ đề nằm trong phạm vi MAVIS.

## Bản đồ nguồn

| Nhóm chủ đề | Nguồn dùng để đối chiếu |
| --- | --- |
| Java và build | [Đặc tả và API JDK 21](https://docs.oracle.com/en/java/javase/21/docs/specs/index.html), [Dev.java](https://dev.java/learn/), [Apache Maven](https://maven.apache.org/guides/getting-started/index.html) |
| Spring Boot và Spring Cloud | [Spring Guides](https://spring.io/guides/), [Spring Cloud](https://spring.io/projects/spring-cloud/), [Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html), [Spring Security JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) |
| C# và .NET | [Đặc tả C#](https://learn.microsoft.com/en-us/dotnet/csharp/specification/overview), [C# Guide](https://learn.microsoft.com/en-us/dotnet/csharp/), [ASP.NET Core Fundamentals](https://learn.microsoft.com/en-us/training/paths/aspnet-core-fundamentals/), [Roslyn](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/) |
| API và dữ liệu | [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [EF Core](https://learn.microsoft.com/en-us/ef/core/) |
| Kiến trúc và vận hành | [C4](https://c4model.com/diagrams), [Microsoft .NET Microservices](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/), [Docker Compose](https://docs.docker.com/compose/intro/compose-application-model/), [OpenTelemetry](https://opentelemetry.io/docs/concepts/signals/) |

## Lộ trình Java

### Nền tảng

#### Java nền tảng và ranh giới kiểu dữ liệu

java-f01 · 45 phút

**Mục tiêu.** Đọc record, interface, lớp triển khai và xác định quy tắc kiểm dữ liệu ở biên.

Khi đọc một endpoint, lần theo DTO đầu vào, interface nghiệp vụ và phần triển khai. Một record tiện mang giá trị nhưng không làm bất biến mọi object mà nó tham chiếu. Interface mô tả khả năng gọi. Lớp triển khai quyết định hành vi. Phân biệt lỗi dữ liệu cần trả về cho caller với lỗi hạ tầng cần ghi nhận.

**Thực hành.** Tạo một DTO đơn hàng và một interface tra kho trên repo bài tập. Lập bảng input hợp lệ, thiếu trường, số lượng âm. Bàn giao test và file/dòng từ DTO tới hàm kiểm dữ liệu.

- [Dev.java · Getting to Know the Language](https://dev.java/learn/language/)
- [Oracle · JDK 21 Specifications](https://docs.oracle.com/en/java/javase/21/docs/specs/index.html)

#### Collections, Streams và xử lý dữ liệu

java-f02 · 45 phút

**Mục tiêu.** Chọn List, Set và Map phù hợp; viết pipeline không làm thay đổi đầu vào.

List giữ thứ tự, Set biểu diễn tập hợp và Map tra theo khóa. Chọn semantics theo dữ liệu cần bảo toàn. Với Stream, filter chọn phần tử, map chuyển đổi, terminal operation thu kết quả. Tránh side effect trong pipeline. Tách dữ liệu thuần với lời gọi I/O để test dễ và tránh lặp yêu cầu.

**Thực hành.** Từ danh sách endpoint có trùng, tạo Map theo service và danh sách route theo thứ tự. Chốt cách xử lý khóa trùng. Thêm fixture rỗng và route trùng. Bàn giao kết quả dự kiến cùng test.

- [Dev.java · Collections and Streams](https://dev.java/learn/api/collections-and-streams/)
- [Oracle · JDK 21 Specifications](https://docs.oracle.com/en/java/javase/21/docs/specs/index.html)

#### Build Maven, cấu hình và phiên bản Spring

java-f03 · 40 phút

**Mục tiêu.** Đọc pom, Maven Wrapper và tìm cấu hình theo môi trường.

POM mô tả dependency và plugin. Dependency management quy định phiên bản nhưng không tự thêm dependency. Wrapper giúp nhóm dùng phiên bản Maven đã chọn. Spring có nhiều nguồn cấu hình. Tách profile và biến môi trường, dùng secret từ cơ chế quản lý riêng. Kiểm tương thích JDK, Boot và Cloud trước khi nâng dependency.

**Thực hành.** Từ repo Java, ghi JDK, Maven, Boot và BOM Cloud nếu có. Chạy Maven Wrapper test. Chỉ ra một giá trị được ghi đè bởi profile và một giá trị đến từ biến môi trường.

- [Apache Maven · Maven Getting Started Guide](https://maven.apache.org/guides/getting-started/index.html)
- [Spring · Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Oracle · JDK 21 Specifications](https://docs.oracle.com/en/java/javase/21/docs/specs/index.html)

### Thực hành Lab

#### Từ monolith đến microservices và C4

java-01 · 45 phút

**Mục tiêu.** Phân biệt ranh giới nghiệp vụ, ranh giới triển khai và các mức C1–C3.

Monolith thường đóng gói nhiều năng lực nghiệp vụ trong một đơn vị triển khai. Tách service đem lại khả năng phát hành riêng nhưng tạo thêm chi phí giao tiếp, dữ liệu và vận hành. C1 đặt hệ thống trong ngữ cảnh người dùng và hệ thống ngoài. C2 phóng to các ứng dụng và kho dữ liệu chạy được. C3 phóng to thành phần bên trong một container. Không mặc định một lớp Java là một microservice.

**Thực hành.** Trong MAVIS, mở nguồn mẫu do giảng viên gán. Chọn một người dùng, một hệ thống ngoài, một container và một component. Ghi mỗi phần tử vào đúng mức, kèm đường dẫn mã hoặc cấu hình. Đánh dấu giả thuyết cần kiểm chứng khi chạy.

- [Dev.java · Java Learning](https://dev.java/learn/)
- [C4 model · C4 diagrams](https://c4model.com/diagrams)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

#### Ranh giới dịch vụ và quyền sở hữu dữ liệu

java-02 · 45 phút

**Mục tiêu.** Nhận diện dấu hiệu shared database và phân biệt chia sẻ hạ tầng với chia sẻ quyền ghi.

Database-per-service là nguyên tắc sở hữu dữ liệu. Hai service có thể cùng dùng một máy chủ PostgreSQL nếu quyền và schema được cô lập. Nguy cơ tăng khi chúng sửa cùng bảng hoặc cùng phụ thuộc một migration. Kết luận cần đối chiếu tên DB/schema, cấu hình runtime và repository thay vì chỉ so tên engine.

**Thực hành.** Tìm cấu hình datasource và một repository ở hai service. Vẽ bảng service → schema → bảng → quyền đọc/ghi. Gắn trạng thái đã xác minh hoặc chưa đủ bằng chứng cho từng kết nối.

- [Spring · Accessing Data with JPA](https://spring.io/guides/gs/accessing-data-jpa/)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [Manning · Microservices Patterns](https://www.manning.com/books/microservices-patterns)

#### C3 và cấu trúc nội bộ Spring Boot

java-03 · 45 phút

**Mục tiêu.** Lần theo controller, service và repository để giải thích phụ thuộc nội bộ.

Controller nhận và chuyển đổi yêu cầu HTTP. Lớp ứng dụng điều phối nghiệp vụ. Repository đại diện đường đi tới lưu trữ. Ranh giới thực tế phụ thuộc code, không chỉ theo hậu tố tên. Constructor injection giúp thấy phụ thuộc trực tiếp. Unit test kiểm logic riêng, còn web test kiểm binding, status và serialization.

**Thực hành.** Chọn một endpoint trong Lab. Lần từ mapping tới service và repository, ghi bằng chứng cho ba điểm. Chỉ ra một cạnh đáng rà soát và đề xuất test phát hiện thay đổi sai.

- [Dev.java · Java Learning](https://dev.java/learn/)
- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)
- [Spring · Testing the Web Layer](https://spring.io/guides/gs/testing-web/)

#### REST, OpenFeign và Reverse BFS

java-04 · 50 phút

**Mục tiêu.** Tìm client và endpoint tương ứng, rồi tính ảnh hưởng theo hướng ngược phụ thuộc.

Cạnh A → B biểu diễn A phụ thuộc B. Khi B đổi contract, lần ngược cạnh đến A và những bên gọi A. Reverse BFS cần tập visited để dừng trên đồ thị có chu kỳ. Interface OpenFeign giúp tìm client, nhưng cần đối chiếu call site và đường dẫn đích. Hướng ảnh hưởng tĩnh là khả năng tác động, trace mới cho biết luồng đã được quan sát.

**Thực hành.** Chọn một endpoint. Đối chiếu HTTP method, path, caller và provider. Tạo một danh sách tác động trực tiếp và gián tiếp. Nếu graph có chu kỳ, ghi mỗi service một lần.

- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)
- [Spring · Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/spring-cloud-openfeign.html)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

#### Service discovery và nhiều instance

java-05 · 40 phút

**Mục tiêu.** Phân biệt định danh service, registry và cân bằng tải theo instance.

Registry giữ thông tin instance đăng ký. Client hoặc gateway cần cơ chế chọn instance, registry không tự chia tải thay mọi client. Eureka và DNS của Compose có ngữ nghĩa khác nhau. Readiness, cập nhật danh sách và cấu hình client ảnh hưởng kết quả khi scale.

**Thực hành.** Trong nguồn Lab có discovery, tìm tên ứng dụng, địa chỉ registry và cơ chế lookup. So sánh danh sách instance trước/sau scale chỉ trên sandbox khi Lab hỗ trợ.

- [Spring · Spring Cloud](https://spring.io/projects/spring-cloud/)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)
- [Docker Docs · Compose scale](https://docs.docker.com/reference/cli/docker/compose/scale/)

#### API Gateway và quy tắc định tuyến

java-06 · 40 phút

**Mục tiêu.** Đọc predicate, filter và URI đích trong cấu hình gateway.

Gateway chuyển tiếp yêu cầu dựa trên predicate. Filter có thể biến đổi header hoặc path. Một URL nhìn từ client có thể khác URL downstream. Tập trung ingress giúp quan sát nhưng downstream vẫn cần thực thi phân quyền phù hợp. Cấu hình route là bằng chứng thiết kế, không tự chứng minh mọi request đã đi qua.

**Thực hành.** Chọn một route và viết một cặp request match/không match. Ghi path trước/sau rewrite và đích. Đối chiếu với endpoint backend hoặc trace nếu có.

- [Spring · Spring Cloud Gateway](https://spring.io/projects/spring-cloud-gateway/)
- [Spring · Spring Cloud](https://spring.io/projects/spring-cloud/)
- [Spring · Building a RESTful Web Service](https://spring.io/guides/gs/rest-service/)

#### Circuit breaker và fallback

java-07 · 45 phút

**Mục tiêu.** Giải thích trạng thái breaker và cách kiểm thử sự cố phụ thuộc.

Circuit breaker quan sát lỗi/chậm theo chính sách và có thể từ chối gọi sớm khi open. Half-open cho phép một số yêu cầu thăm dò. Fallback cần diễn đạt mức suy giảm đúng nghiệp vụ. Không trả thành công giả cho giao dịch chưa thực hiện. Điểm mở breaker phụ thuộc cấu hình và tín hiệu quan sát.

**Thực hành.** Tìm nơi bọc lời gọi downstream bằng breaker. Liệt kê tín hiệu khiến breaker mở, giá trị fallback và kỳ vọng trước/sau khi dừng phụ thuộc trong sandbox.

- [Spring · Spring Cloud Circuit Breaker](https://spring.io/projects/spring-cloud-circuitbreaker/)
- [Microsoft Learn · Build resilient HTTP apps](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

#### Timeout, retry và bulkhead

java-08 · 45 phút

**Mục tiêu.** Thiết kế giới hạn thời gian và tránh khuếch đại tải khi downstream chậm.

Timeout đặt giới hạn chờ theo budget đầu cuối. Retry có thể phục hồi lỗi tạm thời nhưng làm tăng lưu lượng; thao tác ghi cần đánh giá idempotency. Backoff và jitter giúp tránh đợt retry đồng loạt. Bulkhead cô lập tài nguyên để lỗi một phụ thuộc không chiếm toàn bộ capacity.

**Thực hành.** Lập bảng timeout, số lần retry và tổng thời gian tối đa của một lời gọi. Nêu lý do được hoặc không được retry lệnh ghi. So sánh p95 và tỷ lệ lỗi trong sandbox nếu có phép thử.

- [Spring · Spring Cloud Circuit Breaker](https://spring.io/projects/spring-cloud-circuitbreaker/)
- [Microsoft Learn · Build resilient HTTP apps](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

#### Messaging và xử lý trùng sự kiện

java-09 · 50 phút

**Mục tiêu.** Đọc producer, consumer và luồng xử lý dữ liệu bất đồng bộ.

Publisher phát sự kiện và consumer xử lý sau. Tùy broker và chế độ xác nhận, thông điệp có thể được giao lại. Consumer cần dedup hoặc tác vụ idempotent. Một sự kiện được publish chưa có nghĩa toàn bộ hệ thống đã nhất quán. Cần quan sát độ trễ hàng đợi và lỗi consumer.

**Thực hành.** Xác định một publisher, topic/queue và consumer trong Lab. Mô tả xử lý khi cùng event ID đến hai lần. Phân biệt cạnh messaging với cạnh HTTP trên graph.

- [Spring · Spring Cloud Stream](https://spring.io/projects/spring-cloud-stream/)
- [Microsoft Learn · Asynchronous message-based communication](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication)
- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)

#### Saga và hành động bù trừ

java-10 · 50 phút

**Mục tiêu.** Giải thích trình tự local transaction và trạng thái lỗi của Saga.

Saga chia một quy trình thành nhiều local transaction. Khi bước sau thất bại, compensation là hành động nghiệp vụ bù cho bước đã hoàn tất, ví dụ hoàn giữ chỗ. Nó có thể cần retry và theo dõi riêng. Orchestration dùng bộ điều phối; choreography phản ứng với sự kiện. Cần correlation ID và trạng thái để truy vết.

**Thực hành.** Vẽ bảng Order → Payment → Inventory. Với lỗi tại Inventory, liệt kê trạng thái từng bước và hành động bù. Giải thích xử lý khi nhận lại thông điệp bù.

- [Manning · Microservices Patterns](https://www.manning.com/books/microservices-patterns)
- [Microsoft Learn · Asynchronous message-based communication](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)

#### Cấu hình tập trung và xác thực dịch vụ

java-11 · 45 phút

**Mục tiêu.** Tách cấu hình theo môi trường, secret và kiểm quyền tài nguyên.

Config server giúp phân phối cấu hình có phiên bản. Secret cần dùng cơ chế quản lý phù hợp và không đưa vào Git hay ảnh minh chứng. JWT cần được xác minh chữ ký, issuer, audience và thời hạn. Xác thực danh tính và phân quyền hành động là hai bước khác nhau. Khi phân tích tĩnh, ghi đường dẫn config và tên biến đã che giá trị.

**Thực hành.** Tìm một giá trị config thường và một tham chiếu secret. Ghi bằng chứng đã che giá trị. Thiết kế ca token hết hạn và tài khoản hợp lệ nhưng thiếu quyền.

- [Spring · Spring Cloud Config](https://spring.io/projects/spring-cloud-config/)
- [Microsoft Learn · .NET Microservices Architecture](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/)
- [O’Reilly · Production-Ready Microservices](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)

#### OpenTelemetry và đánh giá trước sau

java-12 · 55 phút

**Mục tiêu.** Đối chiếu mô hình tĩnh với trace, metric và log trong một thử nghiệm có kiểm soát.

Trace nối các span của một yêu cầu. Metrics ghi xu hướng theo thời gian và log ghi sự kiện chi tiết. Một trace đơn lẻ không đủ kết luận p95. Khi thử stop hoặc scale, giữ workload và khoảng đo tương đương, ghi số mẫu và tỷ lệ lỗi. Static graph và runtime evidence phục vụ hai câu hỏi khác nhau.

**Thực hành.** Dùng Lab đã được phép chạy. Chọn một thay đổi, lưu baseline và sau thay đổi. Ghi phiên bản nguồn, khoảng thời gian, trace ID, số mẫu và giới hạn kết luận. Nếu không có runtime, lập kế hoạch đo và ghi chưa quan sát.

- [OpenTelemetry · Signals](https://opentelemetry.io/docs/concepts/signals/)
- [OpenTelemetry · Java instrumentation](https://opentelemetry.io/docs/languages/java/)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)
- [Docker Docs · Compose scale](https://docs.docker.com/reference/cli/docker/compose/scale/)
- [O’Reilly · Production-Ready Microservices](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)

### Nâng cao

#### Kiểm thử Spring Boot, hợp đồng và PostgreSQL

java-a01 · 55 phút

**Mục tiêu.** Phân biệt test logic, test HTTP và test dữ liệu trên engine thật.

Unit test phản hồi nhanh và kiểm quyết định nghiệp vụ. Web test kiểm status, binding và JSON. Integration test với PostgreSQL test có thể phát hiện khác biệt về SQL, transaction hoặc migration. Contract cần kiểm cả ca tương thích cũ và lỗi. Dùng fixture nhỏ cố định để tái hiện lỗi.

**Thực hành.** Chọn một endpoint đọc và một endpoint ghi. Viết test thành công, sai quyền và xung đột dữ liệu. Chạy migration trên PostgreSQL cô lập. Ghi SHA và kết quả từng tầng.

- [Spring · Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
- [Spring · Testing the Web Layer](https://spring.io/guides/gs/testing-web/)
- [OpenAPI Initiative · OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [PostgreSQL · Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

#### Giao dịch, cạnh tranh và tính nhất quán

java-a02 · 55 phút

**Mục tiêu.** Kiểm lost update, retry giao dịch và ràng buộc duy nhất bằng hai kết nối thử.

Isolation quyết định dữ liệu mỗi giao dịch quan sát được. Hành vi phụ thuộc engine và mức isolation. Dùng ràng buộc duy nhất cho định danh nghiệp vụ. Khi gặp serialization failure, xử lý retry toàn giao dịch theo budget. Với tích hợp ngoài DB, suy luận rõ tác dụng phụ trước khi thử lại.

**Thực hành.** Mô phỏng hai yêu cầu dùng cùng mã thao tác trong database thử. Chứng minh trạng thái cuối bằng số bản ghi và ID, kèm log một ca xung đột. Kiểm rollback khi ghi bước sau thất bại.

- [PostgreSQL · Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Spring · Spring Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)
- [Apache Maven · Maven Getting Started Guide](https://maven.apache.org/guides/getting-started/index.html)

#### Vận hành Spring Boot có xác thực và telemetry

java-a03 · 55 phút

**Mục tiêu.** Ghép kiểm quyền, health check và truy vết để nghiệm thu một API.

Resource server xác minh token trước khi áp chính sách quyền. Health cần phân biệt ứng dụng còn sống và sẵn sàng nhận tải. Truyền context liên dịch vụ giúp nối trace, nhưng dữ liệu nhạy cảm không nên đi trong baggage hoặc log. Tránh gắn ID không giới hạn làm nhãn metric. Kiểm một request hợp lệ và một request bị từ chối.

**Thực hành.** Trên fixture, ghi chứng cứ request hợp lệ, token sai đối tượng và readiness khi dependency thử mất kết nối. Đối chiếu trace và metric, che credential và thông tin cá nhân.

- [Spring · OAuth 2.0 Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)
- [Spring · Spring Boot Observability](https://docs.spring.io/spring-boot/reference/actuator/observability.html)
- [OpenTelemetry · Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)

## Lộ trình C#

### Nền tảng

#### Kiểu dữ liệu C#, interface và nullable

csharp-f01 · 45 phút

**Mục tiêu.** Đọc kiểu giá trị, kiểu tham chiếu, record và hợp đồng nullable.

Interface định nghĩa hợp đồng. Class hoặc record cài đặt hành vi. Nullable reference types cung cấp phân tích và cảnh báo ở thời điểm biên dịch, không thay kiểm tra dữ liệu bên ngoài ở runtime. Phân biệt string rỗng, null và trường thiếu. Cần đọc phiên bản compiler cùng TargetFramework.

**Thực hành.** Tạo DTO đơn hàng và interface kiểm tồn kho trong repo thử. Viết ca null, chuỗi rỗng và ID không tồn tại. So sánh dấu ? với kiểm tra điều kiện trước khi gọi nghiệp vụ.

- [Microsoft Learn · C# language documentation](https://learn.microsoft.com/en-us/dotnet/csharp/)
- [Microsoft Learn · C# Standard Specification](https://learn.microsoft.com/en-us/dotnet/csharp/specification/overview)

#### LINQ, truy vấn và chi phí thực thi

csharp-f02 · 45 phút

**Mục tiêu.** Phân biệt lọc, ánh xạ, materialization và truy vấn qua provider.

LINQ hỗ trợ truy vấn trên collection và provider. IEnumerable thường chạy trên dữ liệu trong bộ nhớ. IQueryable mô tả truy vấn để provider có thể dịch. Một số biểu thức thực thi trì hoãn. Gọi ToList tạo snapshot kết quả tại thời điểm đó. Khi dùng EF Core, kiểm SQL và tránh tải dữ liệu lớn chỉ để lọc ở client.

**Thực hành.** Viết truy vấn lọc đơn theo trạng thái, chọn DTO tối thiểu, thêm ca không có kết quả và nhiều phần tử. Với dữ liệu thử EF Core, kiểm SQL sinh ra và số dòng đọc.

- [Microsoft Learn · LINQ in C#](https://learn.microsoft.com/en-us/dotnet/csharp/linq/)
- [Microsoft Learn · Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)

#### Task, async/await và hủy thao tác

csharp-f03 · 45 phút

**Mục tiêu.** Theo dõi đường đi của Task và CancellationToken trong HTTP API.

Await cho phép tiếp tục khi I/O hoàn tất; nó không biến mọi đoạn code thành xử lý song song. Token hủy cần được truyền qua các tầng tới I/O hỗ trợ. Tránh chặn Task bằng Result trên đường request. Tách timeout, client hủy và lỗi downstream để ghi nhận đúng nguyên nhân.

**Thực hành.** Viết API thử gọi I/O giả có thể hủy. Thử trả về bình thường, client hủy và timeout. Ghi đường đi token và trạng thái cuối từng ca.

- [Microsoft Learn · Asynchronous programming](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/)
- [Microsoft Learn · HTTP resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)

### Thực hành Lab

#### HTTP API ASP.NET Core và hợp đồng OpenAPI

csharp-01 · 50 phút

**Mục tiêu.** Đọc route của Minimal API và Controller rồi đối chiếu với hợp đồng HTTP.

Minimal API có thể khai báo MapGet/MapPost tại Program.cs hoặc extension. Controller dùng attribute routing và binding. So khớp verb, template, request và response giữa code và OpenAPI. Chọn status cho dữ liệu sai, thiếu quyền và tài nguyên không tồn tại. Công cụ phát hiện route cần ghép prefix đúng phạm vi.

**Thực hành.** Tìm hai route trong repo C# mẫu. Ghi verb, prefix, input và output, thêm ba request đúng, sai dữ liệu và tài nguyên không có. So sánh route trong MAVIS với file/dòng.

- [Microsoft Learn · ASP.NET Core Fundamentals](https://learn.microsoft.com/en-us/training/paths/aspnet-core-fundamentals/)
- [Microsoft Learn · Controller-based Web API](https://learn.microsoft.com/en-us/aspnet/core/tutorials/first-web-api)
- [OpenAPI Initiative · OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)

#### Dependency injection, cấu hình và vòng đời service

csharp-02 · 45 phút

**Mục tiêu.** Phân tích đăng ký dịch vụ, lifetime và phạm vi request.

Transient tạo mới khi resolve. Scoped thường theo request web. Singleton tồn tại trong thời gian sống của container DI. Singleton không nên giữ trực tiếp scoped dependency. Cấu hình theo môi trường nên được bind với kiểu options phù hợp và xác minh khi khởi động nếu cần. Ghi nơi đăng ký và nơi tiêu thụ để giải thích C3.

**Thực hành.** Tìm AddScoped, AddTransient hoặc AddSingleton trong repo. Vẽ đường từ controller tới implementation và config. Tạo một test kiểm missing config hoặc captive dependency trên môi trường thử.

- [Microsoft Learn · Dependency injection in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [Microsoft Learn · ASP.NET Core Fundamentals](https://learn.microsoft.com/en-us/training/paths/aspnet-core-fundamentals/)

#### EF Core, migration và dữ liệu theo service

csharp-03 · 55 phút

**Mục tiêu.** Theo dõi DbContext, kiểm migration và ranh giới quyền ghi dữ liệu.

DbContext theo dõi thay đổi và lưu unit of work. Migration mô tả các bước thay đổi schema từ model. Đối chiếu SQL trên provider thật trước khi triển khai. Bảo toàn dữ liệu cũ với ca upgrade. Trong microservices, cần xác định service sở hữu schema và quyền ghi, kể cả khi nhiều service chia máy chủ.

**Thực hành.** Xác định DbContext, entity và migration của một service. Tạo DB thử, kiểm cài sạch, nâng cấp từ schema trước và truy vấn dữ liệu cũ. Ghi cả ca migration lỗi.

- [Microsoft Learn · Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)
- [Microsoft Learn · EF Core migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [PostgreSQL · Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)

#### Typed HttpClient, timeout và resilience

csharp-04 · 50 phút

**Mục tiêu.** Lần từ typed client tới downstream và kiểm xử lý lỗi HTTP.

IHttpClientFactory quản lý cấu hình và vòng đời handler. Typed client đóng gói contract của downstream. Đặt timeout theo tổng budget và chọn retry cho thao tác phù hợp. Bảo vệ lệnh ghi khỏi tác dụng phụ trùng. Circuit breaker hạn chế gọi dependency đang lỗi; phân biệt với retry và timeout.

**Thực hành.** Lần từ đăng ký typed client đến call site. Dùng stub mô phỏng 200, timeout và 503. Kiểm số lần gọi, khoảng chờ và kết quả fallback. Đối chiếu dependency graph với file/dòng.

- [Microsoft Learn · IHttpClientFactory](https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory)
- [Microsoft Learn · HTTP resilience](https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience)
- [OpenTelemetry · Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)

#### Messaging, idempotency và bù trừ Saga

csharp-05 · 55 phút

**Mục tiêu.** Đọc publisher và handler rồi kiểm hành vi khi sự kiện được gửi lại.

Consumer có thể nhận lại thông điệp khi xử lý hoặc xác nhận không hoàn tất. Dùng khóa sự kiện ổn định và giao dịch phù hợp để tránh tác dụng phụ trùng. Trong Saga, mỗi service thực hiện một local transaction và có thể cần hành động bù. Sử dụng correlation ID và trạng thái để truy vết.

**Thực hành.** Tạo fixture hai sự kiện trùng ID và một lỗi ở bước thanh toán. Vẽ đường đi qua broker, ghi tác dụng phụ mong đợi và ca bù thất bại. Kiểm lại sau retry.

- [Microsoft Learn · Asynchronous message-based communication](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication)
- [Microsoft Learn · Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)
- [OpenTelemetry · Context propagation](https://opentelemetry.io/docs/concepts/context-propagation/)

#### JWT bearer, phân quyền và kiểm dữ liệu

csharp-06 · 50 phút

**Mục tiêu.** Đối chiếu cấu hình xác thực với policy kiểm quyền tại resource.

JWT bearer cần xác minh chữ ký, issuer, audience và thời hạn theo cấu hình. Một danh tính đã xác thực vẫn có thể thiếu quyền hành động. Kiểm cả route có policy và ràng buộc owner của tài nguyên. Che secret, token và dữ liệu nhạy cảm khi ghi log hoặc minh chứng.

**Thực hành.** Dùng token fixture thử ca hợp lệ, hết hạn, sai audience và danh tính hợp lệ nhưng thiếu quyền. Ghi status dự kiến và dòng kiểm quyền trên repo thử.

- [Microsoft Learn · JWT bearer authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/configure-jwt-bearer-authentication)
- [Microsoft Learn · ASP.NET Core Fundamentals](https://learn.microsoft.com/en-us/training/paths/aspnet-core-fundamentals/)
- [Microsoft Learn · ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)

#### Kiểm thử ASP.NET Core từ HTTP đến lưu trữ

csharp-07 · 55 phút

**Mục tiêu.** Tạo test host, thay dependency thử và kiểm response thật.

Integration test bằng test host có thể đi qua routing, middleware, DI và serialization. Unit test vẫn hữu ích cho luật nghiệp vụ riêng. Chọn fixture DB phù hợp với yêu cầu kiểm transaction và migration. Kiểm cả ca lỗi, quyền tài nguyên và hợp đồng tương thích.

**Thực hành.** Dùng test host cho một endpoint đọc và một endpoint ghi. Thêm test 2xx, sai dữ liệu và sai quyền. Với PostgreSQL thử, xác nhận dữ liệu và trạng thái cuối sau lỗi.

- [Microsoft Learn · ASP.NET Core integration testing](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests)
- [Microsoft Learn · EF Core migrations](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [OpenAPI Initiative · OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)

#### Microservices với C# và ASP.NET Core

csharp-13 · 70 phút

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

### Nâng cao

#### Docker, health check và OpenTelemetry cho .NET

csharp-a01 · 60 phút

**Mục tiêu.** Phân tích image và Compose rồi đối chiếu bằng chứng tĩnh với telemetry.

Image đóng gói chương trình, Compose mô tả service, mạng và cấu hình. Liveness và readiness phục vụ hai quyết định khác nhau. Truyền trace context nối span giữa services. Aspire là tài liệu mở rộng cho service defaults; lab dùng công cụ theo repo đã ghim. Khi so trước/sau, giữ workload tương đương và ghi số mẫu, tỷ lệ lỗi.

**Thực hành.** Đọc Dockerfile, Compose, mapping health và instrumentation trên repo đã duyệt. Chạy sandbox nếu được cấp, thu trace, ghi readiness và số mẫu trước/sau. Nếu thiếu môi trường, bàn giao kế hoạch đo với trạng thái chưa quan sát.

- [Microsoft Learn · Containerize a .NET app](https://learn.microsoft.com/en-us/dotnet/core/docker/build-container)
- [Docker Docs · How Compose works](https://docs.docker.com/compose/intro/compose-application-model/)
- [Microsoft Learn · ASP.NET Core Health checks](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/health-checks)
- [OpenTelemetry · .NET instrumentation](https://opentelemetry.io/docs/languages/dotnet/)
- [Microsoft Learn · Aspire Service Defaults](https://learn.microsoft.com/dotnet/aspire/fundamentals/service-defaults)
- [Microsoft Learn · Roslyn APIs](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/)

## Tài liệu nhóm đã tập hợp

- *Microservices Patterns*, Chris Richardson · phân rã dịch vụ, messaging và Saga. [Manning](https://www.manning.com/books/microservices-patterns)
- *Production-Ready Microservices*, Susan J. Fowler · độ tin cậy và vận hành. PDF nhóm gửi có nhãn chương đọc thử. [O’Reilly](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/)
- *Mastering Microservices with Java*, Sourabh Sharma · bản đầu 2016, ISBN 978-1-78528-517-2 theo trang bản quyền trong PDF nhóm gửi. Đối chiếu API và phiên bản với tài liệu Spring hiện hành. [Trang Packt của ấn bản sau](https://www.packtpub.com/en-us/product/mastering-microservices-with-java-9781789530728)
