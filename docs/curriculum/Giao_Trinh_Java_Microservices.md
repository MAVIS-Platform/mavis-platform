# 📘 GIÁO TRÌNH CHUẨN: KIẾN TRÚC & PHÁT TRIỂN MICROSERVICES VỚI JAVA 21, SPRING BOOT 3 VÀ SPRING CLOUD

> **Mã khóa học trong MAVIS**: `JAVA-MS-V2`  
> **Quy mô**: 5 Học phần (Modules) — 12 Chương chuẩn hóa — 48 Câu hỏi Quiz Gate (4 câu/chương)  
> **Đối tượng**: Sinh viên Kỹ thuật Phần mềm năm cuối & Lập trình viên Backend Java chuyển từ Monolith sang hệ thống phân tán Microservices  
> **Ngưỡng qua cổng Quiz (`BR-06`)**: Đạt $\ge 70\%$ (tối thiểu $3/4$ câu đúng mỗi chương, hoặc $\ge 70\%$ tổng bài kiểm tra Lab) để mở khóa bước thực hành Docker Runtime & MAVIS Studio.

---

## 🎯 MỤC TIÊU KHÓA HỌC & NGUỒN TÀI LIỆU THAM KHẢO CHUẨN

Sau khi hoàn thành trọn bộ 12 chương của giáo trình này trên nền tảng **MAVIS**, người học có khả năng:
1. **Đọc hiểu & phân tách kiến trúc**: Giải thích được bản chất Microservices, phân biệt rõ các tầng kiến trúc **C4 (C1 Context, C2 Container, C3 Component)** và thiết kế ranh giới dịch vụ bằng **Domain-Driven Design (DDD)**.
2. **Xây dựng dịch vụ chuẩn công nghiệp**: Viết mã nguồn Microservice sạch bằng **Java 21 + Spring Boot 3 + Spring Cloud**, tuân thủ phân tầng `Controller → Service → Repository`, DTO bất biến (`record`), bảo mật JWT tại API Gateway và giao tiếp qua OpenFeign / Apache Kafka.
3. **Nhận diện mùi kiến trúc (3E Static Smells) & đánh giá tác động (Reverse BFS)**: Phát hiện và khắc phục các lỗi nghiêm trọng như *Shared Database*, *Cyclic Dependency*, *Tight Coupling*, *Contract Drift*; đọc hiểu đường lan truyền tác động ngược (`Direct Callers` vs. `Indirect Callers`).
4. **Thiết kế chịu lỗi & vận hành thực chiến (Production-Ready)**: Áp dụng *Saga Pattern*, *Resilience4j* (Timeout, Retry, Circuit Breaker, Bulkhead), *OpenTelemetry Distributed Tracing*, đóng gói *Docker Compose* và kiểm chứng hành vi thực tế khi dừng container hoặc mở rộng replica ($1 \to 8$ instances) trên **MAVIS Studio**.

### 📚 Bộ Tài Liệu Gốc Làm Chuẩn Biên Soạn

| Ký hiệu | Tài liệu gốc | Tác giả / Nhà xuất bản | Vai trò trong giáo trình |
| :---: | :--- | :--- | :--- |
| **[R19]** | *Microservices Patterns: With Examples in Java* | Chris Richardson (Manning, 2019) | Xương sống kiến trúc: Decomposition, IPC, Saga, CQRS, API Gateway, Testing, Observability, Deployment. |
| **[S16]** | *Mastering Microservices with Java* | Sourabh Sharma (Packt, 2016) | Thực hành Java/Spring, DDD, Eureka, Bảo mật OAuth2/JWT, Best Practices & Troubleshooting (đã cập nhật hiện đại hóa sang Spring Boot 3 / Spring Cloud 2023+ thay cho các thư viện Netflix OSS cũ đã ngừng hỗ trợ). |
| **[F16]** | *Production-Ready Microservices* | Susan J. Fowler (O'Reilly, 2016) | Tiêu chuẩn độ ổn định (Stability), độ tin cậy (Reliability), khả năng mở rộng (Scalability), tài liệu hóa & Production-Readiness Checklist. |
| **[STD]** | *Java 21 LTS, Spring Boot 3, Spring Cloud, C4 Model (Simon Brown), OpenTelemetry Docs* | Oracle, VMware/Broadcom, C4, CNCF | Chuẩn hóa cú pháp hiện đại (`record`, `Spring Cloud Gateway`, `Resilience4j`, `OTLP`). |

> **Lưu ý hiện đại hóa công nghệ từ sách gốc [S16]**: Trong ấn bản năm 2016, sách *Mastering Microservices with Java* sử dụng bộ Netflix OSS đời đầu gồm **Zuul 1**, **Ribbon**, **Hystrix**. Trong hệ sinh thái Spring Cloud hiện đại (Spring Boot 3 / Java 21), các thư viện đó đã ngừng bảo trì và được thay thế chính thức bởi:
> - `Zuul` $\rightarrow$ **Spring Cloud Gateway**
> - `Ribbon` $\rightarrow$ **Spring Cloud LoadBalancer**
> - `Hystrix` $\rightarrow$ **Resilience4j** (tích hợp qua Spring Cloud Circuit Breaker)

---

## 🗺️ BẢN ĐỒ TỔNG THỂ 5 HỌC PHẦN — 12 CHƯƠNG

```text
MODULE 1: NỀN TẢNG KIẾN TRÚC & JAVA HIỆN ĐẠI (C1–C3)
 ├── Chương 01: Từ Monolith đến Microservices & Mô hình C4 (C1–C3)
 ├── Chương 02: Phân rã hệ thống với Domain-Driven Design (DDD) & Bounded Context
 └── Chương 03: Xây dựng Microservice chuẩn C3 với Java 21 & Spring Boot 3

MODULE 2: ĐỊNH TUYẾN, KHÁM PHÁ & GIAO TIẾP ĐỒNG BỘ (SYNC IPC)
 ├── Chương 04: Service Discovery (Eureka) & Cấu hình hóa bên ngoài (Externalized Config)
 ├── Chương 05: API Gateway Pattern & Bảo mật tập trung (JWT / OAuth 2.0 / RBAC)
 └── Chương 06: Giao tiếp đồng bộ (REST / OpenFeign), Contract & Phân tích tác động Reverse BFS

MODULE 3: DỮ LIỆU PHÂN TÁN, BẤT ĐỒNG BỘ & SAGA
 ├── Chương 07: Database-per-Service, Anti-pattern Shared DB & Truy vấn (API Composition, CQRS, Cache)
 ├── Chương 08: Giao tiếp bất đồng bộ (Apache Kafka), Idempotency & Transactional Outbox
 └── Chương 09: Giao dịch phân tán với Saga Pattern (Choreography & Orchestration)

MODULE 4: KHẢ NĂNG CHỊU LỖI & GIÁM SÁT HỆ THỐNG (RESILIENCE & OBSERVABILITY)
 ├── Chương 10: Thiết kế Microservice chịu lỗi với Resilience4j (Timeout, Retry, Circuit Breaker, Bulkhead)
 └── Chương 11: Observability toàn diện (Actuator Health Check, Correlation ID & OpenTelemetry Tracing)

MODULE 5: ĐÓNG GÓI, KIỂM THỬ & PRODUCTION-READINESS
 └── Chương 12: Đóng gói Docker Compose, Chiến lược Kiểm thử & Production-Readiness Checklist
```

---

# 🏛️ MODULE 1: NỀN TẢNG KIẾN TRÚC MICROSERVICES & JAVA HIỆN ĐẠI (C1–C3)

---

## CHƯƠNG 01: TỪ MONOLITH ĐẾN MICROSERVICES & MÔ HÌNH C4 (C1–C3)

- **Mã chương**: `JAVA-CH01` | **Học phần**: Module 1
- **Nguồn chuẩn**: `[R19]` Ch.1 (*Escaping Monolithic Hell*, tr. 1–32); `[S16]` Ch.1 (*A Solution Approach*); `[F16]` Ch.1 (*Microservices*, tr. 1–24); `[STD]` Simon Brown C4 Model.
- **Mục tiêu học tập**:
  1. Giải thích được hiện tượng *"Monolithic Hell"* và phân tích **Scale Cube** (3 trục mở rộng X, Y, Z).
  2. So sánh rạch ròi ưu – nhược điểm giữa Monolith, Modular Monolith và Microservices (hiểu rằng Microservices *không phải viên đạn bạc*).
  3. Đọc và phân biệt chính xác 3 cấp độ cấu trúc tĩnh **C1 (System Context)**, **C2 (Container)**, **C3 (Component)** và hiểu vì sao MAVIS tách biệt cấu trúc tĩnh với vết gọi runtime.

### 1.1. Bản chất vấn đề: "Monolithic Hell" và Khối lập phương mở rộng (Scale Cube)

Khi một ứng dụng khởi đầu còn nhỏ, kiến trúc **Monolithic** (đóng gói toàn bộ giao diện, nghiệp vụ, truy cập dữ liệu vào một file `.jar`/`.war` duy nhất cùng một cơ sở dữ liệu) là lựa chọn **đơn giản và hiệu quả nhất**: dễ phát triển, dễ kiểm thử cục bộ, dễ triển khai và giao dịch ACID trên một DB duy nhất.

Tuy nhiên, khi quy mô đội ngũ và nghiệp vụ phình to (như ví dụ hệ thống giao đồ ăn FTGO trong `[R19]` hay hệ thống đặt bàn nhà hàng OTRS trong `[S16]`), ứng dụng rơi vào **"Monolithic Hell"** với các triệu chứng điển hình:
- **Mã nguồn quá lớn và chồng chéo**: Không lập trình viên nào nắm hết toàn bộ codebase; thời gian khởi động IDE và build/deploy kéo dài hàng chục phút.
- **Rào cản triển khai liên tục (Continuous Delivery)**: Sửa một dòng code nhỏ ở chức năng *Gửi email* buộc phải build, test và deploy lại cả chức năng *Thanh toán*. Một lỗi rò rỉ bộ nhớ (OutOfMemoryError) ở module ít quan trọng làm sập toàn bộ hệ thống.
- **Khó mở rộng chọn lọc (1D Scaling)**: Chức năng *Tìm kiếm sản phẩm* cần nhiều RAM/CPU nhưng phải nhân bản cả những module không cần thiết.
- **Khóa chặt công nghệ (Technology Lock-in)**: Rất khó nâng cấp phiên bản Java/Spring hoặc áp dụng công nghệ mới cho riêng một bài toán.

Để giải quyết bài toán mở rộng một cách khoa học, `[R19]` giới thiệu **Scale Cube** (trích từ *The Art of Scalability*):

```text
                  Trục Y: Phân rã chức năng (Functional Decomposition)
                  --> Tách thành các MICROSERVICES độc lập!
                       ^
                      /
                     /
                    +-------------------------> Trục X: Nhân bản ngang (Horizontal Duplication)
                    |                           --> Chạy N bản sao sau Load Balancer
                    |
                    v
                  Trục Z: Phân vùng dữ liệu (Data Partitioning / Sharding)
                  --> Định tuyến theo userId, khu vực địa lý...
```

> **Định nghĩa cốt lõi (`[R19]` Ch.1)**: Kiến trúc Microservices là phong cách kiến trúc áp dụng **Trục Y của Scale Cube**, phân rã ứng dụng thành một tập hợp các dịch vụ nhỏ, khớp nối lỏng lẻo (**loosely coupled**), có thể phát triển, kiểm thử và triển khai độc lập (**independently deployable**), mỗi dịch vụ tự sở hữu cơ sở dữ liệu riêng (**Database-per-Service**).

### 1.2. Đánh đổi thực tế: Microservices KHÔNG phải "Viên đạn bạc"

Một kỹ sư kiến trúc giỏi luôn nhìn cả hai mặt (`[R19]` §1.5 & `[F16]` Ch.1):

| Tiêu chí | Monolithic Architecture | Microservices Architecture |
| :--- | :--- | :--- |
| **Độ phức tạp ban đầu** | Thấp, phù hợp startup / dự án nhỏ | Cao ngay từ đầu (mạng, CI/CD, Docker, giám sát) |
| **Triển khai & Rollback** | Triển khai cả khối; lỗi 1 chỗ ảnh hưởng toàn cục | Triển khai và rollback độc lập từng dịch vụ |
| **Mở rộng (Scaling)** | Chỉ mở rộng toàn bộ khối (Trục X) | Mở rộng chính xác dịch vụ bị nghẽn (Trục X + Y) |
| **Giao dịch dữ liệu** | ACID đơn giản trên 1 CSDL | Không dùng 2PC; phải dùng Saga & Eventual Consistency |
| **Độ tin cậy gọi nội bộ** | Gọi hàm trong bộ nhớ (in-process, nanosecond) | Gọi qua mạng (HTTP/gRPC/Kafka — có trễ, có rớt mạng!) |
| **Tổ chức đội ngũ** | Đội lớn dễ giẫm chân nhau | Phù hợp đội nhỏ tự chủ (*Two-Pizza Teams*, Định luật Conway) |

### 1.3. Mô hình C4 (C1–C3) — "Google Maps" cho Kiến trúc Phần mềm

Để tránh tình trạng vẽ sơ đồ hộp-và-mũi-tên tự do không ai hiểu nổi, ngành phần mềm chuẩn hóa bằng **C4 Model** của Simon Brown. Giống như phóng to bản đồ Google Maps:

```text
[C1: System Context]   Bản đồ thế giới  --> Ai dùng hệ thống? Hệ thống giao tiếp với bên ngoài nào?
        |
        v (Phóng to vào Hệ thống)
[C2: Container]        Bản đồ thành phố --> Có những ứng dụng/service độc lập & Database nào?
        |                                   (VD: api-gateway, order-service, catalog-db, kafka)
        v (Phóng to vào 1 Service)
[C3: Component]        Bản đồ đường phố --> Bên trong 1 service gồm những thành phần code nào?
                                            (VD: OrderController -> OrderService -> OrderRepository)
```

- **Quy tắc cách ly tầng (C4 Level Isolation)**: Không bao giờ vẽ lẫn lộn một class Java (`OrderRepository` ở tầng C3) nối trực tiếp ra người dùng cuối (`Customer` ở tầng C1) trên cùng một góc nhìn.
- **Tại sao phân tích tĩnh chỉ xuất C1–C3 & Dependency Graph, KHÔNG xuất sơ đồ UML hành vi (Sequence/Activity/State)?**
  Bởi vì mã nguồn tĩnh chỉ chứa *cấu trúc khai báo* (ai tham chiếu ai), không chứa trạng thái dữ liệu runtime, nhánh điều kiện động hay độ trễ mạng thực tế. Trong MAVIS, thứ tự gọi thực tế theo thời gian được dựng từ **OpenTelemetry Trace Spans** ở bước Runtime!

### 1.4. Góc nhìn trên nền tảng MAVIS
- **Step 1 (Static View)**: Khi MAVIS quét một kho mã nguồn Java mẫu (Curated Repo), hệ thống đọc `docker-compose.yml`, `pom.xml`, `application.yml` để dựng tầng **C2 (Container)** và dùng **JavaParser AST** để trích xuất các lớp `@RestController`, `@Service`, `@Repository` lên tầng **C3 (Component)** kèm bằng chứng vị trí file và dòng code (`file:line`).
- **Step 4 (MAVIS Studio)**: Áp dụng trực tiếp **Trục X của Scale Cube** — sinh viên có thể tăng số replica của một dịch vụ bị nghẽn từ $1 \to 4$ (hoặc tối đa $8$) container ngay khi hệ thống đang chạy để đo sự cải thiện độ trễ.

### 1.5. Cạm bẫy thường gặp (Anti-Patterns)
1. **Distributed Monolith (Khối đơn phân tán)**: Tách ra 6 service nhưng phải deploy đồng loạt cả 6 service cùng lúc mỗi khi sửa một trường JSON. Đây là thảm họa tồi tệ nhất vì hứng đủ độ phức tạp của hệ phân tán mà mất sạch lợi ích độc lập.
2. **Nanoservice (`[S16]` Ch.8)**: Tách dịch vụ quá vụn (mỗi bảng 1–2 API thành 1 microservice), khiến chi phí mạng (network latency) và chi phí vận hành lớn hơn nhiều so với giá trị nghiệp vụ.

### 1.6. Bài tập thực hành Lab 01
- Mở dự án Microservices Java mẫu trong MAVIS ở **Step 1 (Static View)**.
- Chuyển lần lượt qua 3 góc nhìn `C4_CONTEXT (C1)` $\rightarrow$ `C4_CONTAINER (C2)` $\rightarrow$ `C4_COMPONENT (C3)`.
- Liệt kê toàn bộ các Container thuộc nhóm **Application Service**, **Infrastructure** (Gateway, Discovery, Broker) và **Data Store** (Database/Cache); giải thích vai trò của từng dịch vụ theo trục Y của Scale Cube.

### 1.7. Ngân hàng Quiz Gate — Chương 01

**Câu 1.1**: Theo mô hình *Scale Cube* trong *Microservices Patterns* (Chris Richardson), kiến trúc Microservices tương ứng với trục mở rộng nào?
- A. Trục X — Nhân bản toàn bộ ứng dụng phía sau Load Balancer
- B. Trục Y — Phân rã ứng dụng theo chức năng nghiệp vụ thành các dịch vụ độc lập
- C. Trục Z — Phân vùng cơ sở dữ liệu theo định danh người dùng
- D. Kết hợp đồng thời bắt buộc cả 3 trục ngay từ ngày đầu triển khai
> **Đáp án đúng: B.** *Giải thích*: Trục Y (Functional Decomposition) tách ứng dụng theo chức năng/nghiệp vụ thành các service độc lập; sau đó mỗi service có thể tiếp tục scale theo Trục X hoặc Trục Z riêng biệt.

**Câu 1.2**: Trong mô hình C4, sơ đồ nào mô tả các tiến trình thực thi độc lập (như `api-gateway`, `order-service`, `PostgreSQL DB`, `Kafka`) và giao thức giao tiếp giữa chúng?
- A. C1 — System Context Diagram
- B. C2 — Container Diagram
- C. C3 — Component Diagram
- D. C4 — Code / Class Diagram
> **Đáp án đúng: B.** *Giải thích*: Trong C4 Model, "Container" không chỉ là Docker container mà là mọi đơn vị triển khai/thực thi độc lập (web app, microservice, database, message broker) — được biểu diễn ở tầng C2.

**Câu 1.3**: Tại sao nền tảng MAVIS chặn việc sinh sơ đồ *UML Sequence / Activity / State* từ phân tích mã nguồn tĩnh (`BR-05`)?
- A. Vì JavaParser không đọc được cú pháp Java 21
- B. Vì phân tích tĩnh chỉ xác định chính xác cấu trúc khai báo (C1–C3); thứ tự gọi và hành vi phụ thuộc dữ liệu phải quan sát từ vết thực thi runtime (OpenTelemetry spans)
- C. Vì UML đã bị loại bỏ hoàn toàn khỏi ngành phần mềm
- D. Vì sơ đồ Sequence tốn quá nhiều dung lượng cơ sở dữ liệu
> **Đáp án đúng: B.** *Giải thích*: Mã nguồn tĩnh không phản ánh luồng rẽ nhánh theo dữ liệu thật, retry hay lỗi mạng; do đó MAVIS giữ Static View thuần cấu trúc (C1–C3 + Dependency Graph) và dùng OpenTelemetry ở Runtime để dựng chuỗi tương tác nhân quả.

**Câu 1.4**: Dấu hiệu rõ nhất cho thấy một hệ thống đang rơi vào bẫy **Distributed Monolith** là gì?
- A. Hệ thống sử dụng Java 21 và Docker Compose
- B. Các dịch vụ có nhiều đường gọi REST qua API Gateway
- C. Các dịch vụ bị gắn chặt đến mức thay đổi một dịch vụ buộc phải sửa và triển khai lại đồng loạt nhiều dịch vụ khác cùng lúc
- D. Mỗi dịch vụ có một cơ sở dữ liệu PostgreSQL riêng
> **Đáp án đúng: C.** *Giải thích*: Mất khả năng triển khai độc lập (*independent deployability*) là đặc trưng cốt lõi của Distributed Monolith.

---

## CHƯƠNG 02: PHÂN RÃ HỆ THỐNG VỚI DOMAIN-DRIVEN DESIGN (DDD) & BOUNDED CONTEXT

- **Mã chương**: `JAVA-CH02` | **Học phần**: Module 1
- **Nguồn chuẩn**: `[R19]` Ch.2 (*Decomposition Strategies*, tr. 33–64) & Ch.5 (*Designing Business Logic*, tr. 146–167); `[S16]` Ch.3 (*Domain-Driven Design*).
- **Mục tiêu học tập**:
  1. Áp dụng được 2 mẫu phân rã chuẩn: **Decompose by Business Capability** và **Decompose by Subdomain (DDD)**.
  2. Hiểu rõ **Ubiquitous Language**, **Bounded Context**, **Entity**, **Value Object**, **Aggregate** và **Aggregate Root**.
  3. Tránh được bẫy *"God Class"* và hiểu cách phá vỡ sự phụ thuộc khóa ngoại giữa các Aggregate khác dịch vụ.

### 2.1. Câu hỏi khó nhất của Microservices: "Cắt hệ thống ở đâu cho đúng?"

Rất nhiều sinh viên khi làm đồ án Microservices mắc sai lầm **cắt theo bảng cơ sở dữ liệu** hoặc **cắt theo tầng kỹ thuật** (ví dụ: 1 service chỉ làm CRUD bảng `User`, 1 service làm `Role`). Kết quả là mỗi thao tác nghiệp vụ phải gọi lòng vòng 4–5 service.

`[R19]` Ch.2 đề xuất quy trình 3 bước bài bản và 2 mẫu phân rã chuẩn:

1. **Decompose by Business Capability (Phân rã theo năng lực nghiệp vụ)**:
   - Xác định tổ chức làm *cái gì* để tạo ra giá trị (chứ không phải *làm bằng công nghệ gì*).
   - Ví dụ một hệ thống bán lẻ trực tuyến có các năng lực ổn định theo thời gian: *Quản lý danh mục & sản phẩm (Catalog)*, *Quản lý đơn hàng (Order)*, *Quản lý tồn kho (Inventory)*, *Quản lý tài khoản & xác thực (Identity)*, *Thông báo khách hàng (Notification)*.
2. **Decompose by Subdomain — DDD (Phân rã theo miền con)**:
   - Chia miền nghiệp vụ (Domain) thành các **Subdomain** phân loại theo mức độ chiến lược:
     - **Core Subdomain** (Cốt lõi — tạo lợi thế cạnh tranh, cần tập trung kỹ sư giỏi nhất, ví dụ: *Quy trình đặt hàng & định giá*).
     - **Supporting Subdomain** (Hỗ trợ nghiệp vụ chính, ví dụ: *Quản lý danh mục sản phẩm*).
     - **Generic Subdomain** (Phổ thông, có thể dùng thư viện/giải pháp sẵn có, ví dụ: *Xác thực JWT, Gửi thông báo*).

### 2.2. Bounded Context & Ubiquitous Language — Tại sao "Product" ở hai nơi lại khác nhau?

Trong một hệ thống Monolith, mọi người cố nhồi nhét mọi thuộc tính vào một class `Product` khổng lồ (*God Class*) chứa từ mô tả SEO, hình ảnh, giá bán, số lượng tồn kho, vị trí kệ kho, cho đến thông tin vận chuyển.

**DDD (`[S16]` Ch.3 & `[R19]` Ch.2)** giải quyết triệt để bằng **Bounded Context (Ngữ cảnh giới hạn)**:
- Mỗi Microservice lý tưởng nên ánh xạ **1-1 với một Bounded Context**.
- Trong mỗi Bounded Context, cùng một khái niệm chỉ mang đúng các thuộc tính cần thiết cho ngữ cảnh đó:

```text
+-----------------------------------+      +------------------------------------+
|     CATALOG BOUNDED CONTEXT       |      |       ORDER BOUNDED CONTEXT        |
|  (catalog-service)                |      |  (order-service)                   |
|                                   |      |                                    |
|  Product:                         |      |  OrderItem (Value Object/Entity):  |
|   - id, sku, name, description    |      |   - productId (chỉ lưu ID!)        |
|   - unitPrice, category, images   |      |   - productNameSnapshot            |
|   - stockQuantity                 |      |   - unitPriceSnapshot, quantity    |
+-----------------------------------+      +------------------------------------+
```

> **Quy tắc vàng**: Khi khách mua hàng xong, `Order` lưu bản chụp (`snapshot`) tên sản phẩm và giá tại thời điểm mua cùng `productId`. Sau này Catalog có đổi giá sản phẩm, hóa đơn cũ của Order **không bị sai lệch lịch sử**!

### 2.3. Các khối xây dựng chiến thuật của DDD (`[R19]` Ch.5 & `[S16]` Ch.3)

| Khái niệm | Bản chất cốt lõi | Ví dụ trong Java |
| :--- | :--- | :--- |
| **Entity** | Có định danh duy nhất (`id`) bất biến theo thời gian, trạng thái bên trong có thể thay đổi. | `Order`, `Product`, `User` |
| **Value Object** | Không có `id` riêng, **bất biến (immutable)**, so sánh bằng giá trị các thuộc tính. | `Money(BigDecimal amount, String currency)`, `ShippingAddress` |
| **Aggregate** | Một cụm các Entity & Value Object gắn kết chặt chẽ, luôn đảm bảo tính bất biến nghiệp vụ (invariant) trong cùng một giao dịch cục bộ. | Cụm `Order` + danh sách `OrderItem` |
| **Aggregate Root** | Thực thể đại diện duy nhất của Aggregate. Mọi tham chiếu từ bên ngoài chỉ được gọi thông qua Root. | `Order` (không cho phép sửa trực tiếp `OrderItem` bỏ qua `Order`) |

#### Ví dụ mã nguồn Java 21 thiết kế Aggregate & Value Object sạch

```java
// Value Object bất biến bằng Java 21 record
public record Money(BigDecimal amount, String currency) {
    public Money {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Amount must be non-negative");
        }
        if (currency == null || currency.isBlank()) {
            throw new IllegalArgumentException("Currency is required");
        }
    }

    public Money multiply(int quantity) {
        return new Money(amount.multiply(BigDecimal.valueOf(quantity)), currency);
    }
}

// Aggregate Root: Order chỉ tham chiếu sang Product bằng productId (KHÔNG giữ Object Product!)
public class Order {
    private UUID id;
    private UUID customerId;            // Tham chiếu bằng ID, không @ManyToOne sang bảng User!
    private OrderStatus status;
    private final List<OrderItem> items = new ArrayList<>();

    public void addItem(UUID productId, String productNameSnapshot, Money unitPrice, int qty) {
        if (this.status != OrderStatus.PENDING) {
            throw new IllegalStateException("Cannot modify a non-pending order");
        }
        if (qty <= 0) {
            throw new IllegalArgumentException("Quantity must be positive");
        }
        this.items.add(new OrderItem(productId, productNameSnapshot, unitPrice, qty));
    }
}
```

#### Quy tắc vàng của Aggregate (`[R19]` §5.2.3):
1. **Tham chiếu giữa các Aggregate khác nhau bằng Primary Key (`UUID`/`Long`)**, không dùng tham chiếu đối tượng trực tiếp (`@ManyToOne` xuyên service).
2. **Một giao dịch cục bộ (`@Transactional`) chỉ nên tạo hoặc cập nhật đúng MỘT Aggregate**. Cập nhật nhiều Aggregate xuyên dịch vụ sẽ dùng Saga (Chương 9).
3. **Giữ Aggregate đủ nhỏ** để giảm xung đột khóa (lock contention) khi nhiều người dùng cùng truy cập.

### 2.4. Góc nhìn trên nền tảng MAVIS
- Khi thiết kế sai ranh giới Bounded Context (hai service dùng chung entity/bảng hoặc gọi qua lại lẫn nhau để lấy dữ liệu của nhau), bộ kiểm tra **3E Rules** của MAVIS sẽ lập tức đánh dấu cảnh báo **Tight Coupling**, **Shared Database** hoặc **Cyclic Dependency** ngay trên đồ thị C2/C3.
- Quy tắc **Single Responsibility & Common Closure Principle (CCP)**: Các lớp thường xuyên thay đổi vì cùng một lý do nghiệp vụ phải nằm chung một service.

### 2.5. Bài tập thực hành Lab 02
- Chọn một miền nghiệp vụ Thương mại điện tử chuẩn (gồm Khách hàng, Sản phẩm, Đơn hàng, Thông báo).
- Phân chia thành các **Bounded Context** riêng biệt, xác định đâu là **Core / Supporting / Generic Subdomain**.
- Với mỗi Bounded Context, liệt kê các **Aggregate Root**, **Value Object**, và chỉ rõ các khóa tham chiếu bằng ID giữa các ngữ cảnh (chứng minh không có `@ManyToOne` xuyên dịch vụ).

### 2.6. Ngân hàng Quiz Gate — Chương 02

**Câu 2.1**: Theo quy tắc thiết kế DDD Aggregate trong *Microservices Patterns*, một Aggregate (`Order`) nên tham chiếu tới một Aggregate ở dịch vụ khác (`Customer` hoặc `Product`) bằng cách nào?
- A. Dùng trực tiếp `@ManyToOne` của JPA trỏ sang bảng của dịch vụ kia
- B. Lưu định danh (Primary Key / ID) cùng dữ liệu chụp nhanh cần thiết thay vì giữ tham chiếu đối tượng trực tiếp
- C. Sao chép toàn bộ mã nguồn class Entity của dịch vụ kia vào chung một package
- D. Dùng một bảng trung gian trong cơ sở dữ liệu dùng chung
> **Đáp án đúng: B.** *Giải thích*: Tham chiếu bằng ID giữ khớp nối lỏng lẻo giữa các Bounded Context và cho phép mỗi service quản lý CSDL riêng độc lập.

**Câu 2.2**: Điểm khác biệt cốt lõi giữa **Entity** và **Value Object** trong DDD là gì?
- A. Entity luôn lưu ở Redis còn Value Object lưu ở PostgreSQL
- B. Entity có định danh duy nhất theo vòng đời; Value Object không có định danh riêng, bất biến và được so sánh theo giá trị thuộc tính
- C. Value Object có thể kế thừa nhiều lớp còn Entity thì không
- D. Entity chỉ nằm ở tầng Controller còn Value Object nằm ở tầng Repository
> **Đáp án đúng: B.** *Giải thích*: Ví dụ hai tờ tiền `Money(100_000, "VND")` có giá trị như nhau thì hoàn toàn tương đương nhau (Value Object), còn hai đơn hàng có cùng tổng tiền nhưng khác `orderId` vẫn là hai thực thể khác nhau (Entity).

**Câu 2.3**: Trong chiến lược phân rã theo DDD, tại sao khái niệm `Product` ở `catalog-service` và `OrderItem` ở `order-service` không nên gộp chung thành một mô hình dữ liệu duy nhất?
- A. Vì Java không hỗ trợ chia sẻ class giữa hai module Maven
- B. Vì mỗi Bounded Context có góc nhìn, vòng đời và thuộc tính nghiệp vụ khác nhau; tách biệt giúp tránh God Class và bảo vệ lịch sử đơn hàng khi giá sản phẩm thay đổi
- C. Vì `order-service` không được phép biết tên sản phẩm
- D. Vì Spring Boot bắt buộc mỗi service đặt tên class khác nhau
> **Đáp án đúng: B.** *Giải thích*: Bounded Context ngăn mô hình bị phình to và giữ tính toàn vẹn ngữ nghĩa riêng cho từng miền nghiệp vụ.

**Câu 2.4**: Nguyên tắc **Common Closure Principle (CCP)** hướng dẫn điều gì khi gom nhóm chức năng vào một Microservice?
- A. Gom các class có cùng kiểu dữ liệu nguyên thủy vào chung một service
- B. Gom các thành phần thường xuyên thay đổi cùng nhau vì cùng một lý do nghiệp vụ vào chung một service
- C. Tách mỗi endpoint REST thành một service riêng biệt
- D. Đóng toàn bộ cổng kết nối mạng của service vào cuối ngày
> **Đáp án đúng: B.** *Giải thích*: Gom theo CCP giúp mỗi thay đổi nghiệp vụ chỉ cần sửa và triển khai đúng một service duy nhất, giảm thiểu thay đổi dây chuyền.

---

## CHƯƠNG 03: XÂY DỰNG MICROSERVICE CHUẨN C3 VỚI JAVA 21 & SPRING BOOT 3

- **Mã chương**: `JAVA-CH03` | **Học phần**: Module 1
- **Nguồn chuẩn**: `[S16]` Ch.2 (*Setting Up the Development Environment*) & Ch.4 (*Implementing a Microservice*); `[R19]` Ch.11 (§11.4 *Microservice Chassis*); `[STD]` Java 21 LTS & Spring Boot 3.x Official Docs.
- **Mục tiêu học tập**:
  1. Thiết kế đúng cấu trúc phân tầng **C3 Component** bên trong một Spring Boot Microservice (`Controller → Service → Repository`).
  2. Sử dụng thành thạo **Java 21 `record`**, **Bean Validation (`@Valid`)**, **Constructor Injection** và **Global Exception Handling (`@RestControllerAdvice`)**.
  3. Thiết kế RESTful API nhất quán (HTTP status code chuẩn, phân trang, API versioning, hợp đồng `ApiResponse`).

### 3.1. Microservice Chassis & Kiến trúc phân tầng C3 chuẩn

`[R19]` §11.4 gọi Spring Boot + Spring Cloud là một **Microservice Chassis** (khung gầm Microservice): nó cung cấp sẵn các thành phần cắt ngang (*cross-cutting concerns*) như embedded server (Tomcat/Netty), dependency injection, logging, metrics, health check và externalized config để lập trình viên tập trung 100% vào nghiệp vụ.

Bên trong một Microservice Java chuẩn (tầng **C3 Component** trong C4 Model), luồng xử lý phải đi theo một chiều rõ ràng, tuyệt đối không nhảy cóc:

```text
HTTP Request (JSON)
        |
        v
+-----------------------+
|   @RestController     |  <-- Nhận HTTP, kiểm tra @Valid DTO, trả ResponseEntity.
|  (Web / API Layer)    |      KHÔNG viết logic nghiệp vụ, KHÔNG gọi Repository trực tiếp!
+-----------------------+
        | (DTO / Command)
        v
+-----------------------+
|       @Service        |  <-- Xử lý nghiệp vụ, @Transactional, gọi FeignClient / Kafka.
|   (Business Layer)    |      Chuyển đổi Entity <-> Response Record DTO.
+-----------------------+
        | (Entity)
        v
+-----------------------+
|      @Repository      |  <-- Giao tiếp CSDL (Spring Data JPA / JDBC).
| (Persistence Layer)   |      KHÔNG trả trực tiếp JPA Entity ra ngoài API!
+-----------------------+
        |
        v
  [Service Database]
```

### 3.2. Chuẩn hóa Code Java 21 + Spring Boot 3

#### (a) Dùng Java 21 `record` làm DTO bất biến kèm Bean Validation
Thay vì viết hàng trăm dòng getter/setter hoặc lộ trực tiếp `@Entity` ra API (dễ gây lỗi **Mass Assignment** hoặc vòng lặp JSON `LazyInitializationException`), Java 21 dùng `record`:

```java
package com.example.catalog.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

public record CreateProductRequest(
        @NotBlank(message = "SKU is required")
        @Size(max = 50)
        String sku,

        @NotBlank(message = "Product name is required")
        @Size(max = 200)
        String name,

        @NotNull(message = "Price is required")
        @DecimalMin(value = "0.01", message = "Price must be greater than 0")
        BigDecimal unitPrice,

        @Min(value = 0, message = "Stock cannot be negative")
        int stockQuantity
) {}

public record ProductResponse(
        Long id,
        String sku,
        String name,
        BigDecimal unitPrice,
        int stockQuantity
) {}
```

#### (b) Constructor Injection & Controller sạch (C3 chuẩn)
Luôn dùng **Constructor Injection** (`private final`) thay vì `@Autowired` trên field (Field Injection) để dễ viết Unit Test và đảm bảo tính bất biến (immutability):

```java
@RestController
@RequestMapping("/api/v1/products")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.findById(id));
    }

    @PostMapping
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody CreateProductRequest request) {
        ProductResponse created = productService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

#### (c) Xử lý lỗi tập trung theo chuẩn RFC 7807 (`ProblemDetail` của Spring Boot 3)
Không bao giờ trả stack trace thô ra client (lộ cấu trúc nội bộ). Spring Boot 3 hỗ trợ sẵn `ProblemDetail` qua `@RestControllerAdvice`:

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ProblemDetail handleNotFound(ResourceNotFoundException ex) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
        detail.setTitle("Resource Not Found");
        detail.setProperty("errorCode", "RESOURCE_NOT_FOUND");
        return detail;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        ProblemDetail detail = ProblemDetail.forStatusAndDetail(
                HttpStatus.BAD_REQUEST, "Input validation failed");
        detail.setTitle("Validation Error");
        Map<String, String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .collect(Collectors.toMap(
                        FieldError::getField,
                        err -> Objects.requireNonNullElse(err.getDefaultMessage(), "Invalid value"),
                        (first, second) -> first));
        detail.setProperty("errors", fieldErrors);
        return detail;
    }
}
```

### 3.3. Quy ước thiết kế REST API chuẩn (`[S16]` Ch.4 & `[R19]` Ch.3)
- **URL theo danh từ số nhiều + API Versioning**: `/api/v1/orders`, `/api/v1/products/{id}` (tránh dùng động từ như `/getProductById`).
- **HTTP Method & Status Code đúng ngữ nghĩa**:
  - `GET` (an toàn, idempotent) $\rightarrow$ `200 OK` hoặc `404 Not Found`
  - `POST` (tạo mới) $\rightarrow$ `201 Created` (kèm header `Location`)
  - `PUT` / `PATCH` (cập nhật) $\rightarrow$ `200 OK`
  - `DELETE` (xóa) $\rightarrow$ `204 No Content`
  - Lỗi đầu vào $\rightarrow$ `400 Bad Request`; Chưa đăng nhập $\rightarrow$ `401 Unauthorized`; Không đủ quyền $\rightarrow$ `403 Forbidden`; Xung đột nghiệp vụ (trùng SKU / hết tồn kho) $\rightarrow$ `409 Conflict`.

### 3.4. Góc nhìn trên nền tảng MAVIS
- **Trích xuất C3 Component**: JavaParser trong `mavis-analyzer` nhận diện các stereotype annotation (`@RestController`, `@Service`, `@Repository`, `@Component`) và vẽ các cạnh phụ thuộc nội bộ giữa chúng.
- **Phát hiện mùi kiến trúc (3E Rules)**: Nếu một `@RestController` tiêm trực tiếp `@Repository` bỏ qua tầng `@Service` (vi phạm phân tầng), hoặc nếu tên lớp/package không tuân theo chuẩn đặt tên, MAVIS sẽ gắn cảnh báo **Layering / Naming Smell** kèm đúng số dòng mã nguồn.

### 3.5. Bài tập thực hành Lab 03
- Soi tầng **C3 Component** của một service (như `catalog-service` hoặc `order-service`) trên MAVIS.
- Kiểm tra xem có Controller nào gọi thẳng Repository không, DTO đã dùng `record` kèm `@Valid` chưa, và `@RestControllerAdvice` có che giấu stack trace khi phát sinh lỗi `400`/`404` không.

### 3.6. Ngân hàng Quiz Gate — Chương 03

**Câu 3.1**: Tại sao trong Spring Boot 3 không nên trả trực tiếp JPA `@Entity` ra ngoài ở tầng `@RestController`?
- A. Vì Spring Boot 3 không hỗ trợ serialize JPA Entity sang JSON
- B. Vì dễ làm lộ dữ liệu nhạy cảm, dính lỗ hổng Mass Assignment, lỗi `LazyInitializationException` và khóa chặt hợp đồng API vào lược đồ bảng CSDL
- C. Vì JPA Entity chạy chậm hơn `record` gấp 100 lần
- D. Vì OpenFeign không đọc được JSON sinh ra từ Entity
> **Đáp án đúng: B.** *Giải thích*: Tách biệt DTO (`record`) và Entity giúp bảo mật, tránh lỗi Hibernate lazy-loading và cho phép đổi cấu trúc bảng DB mà không làm vỡ API của client.

**Câu 3.2**: Vì sao **Constructor Injection** được khuyến nghị mạnh hơn **Field Injection (`@Autowired` trực tiếp trên thuộc tính)** trong Spring?
- A. Cho phép khai báo phụ thuộc là `final` (bất biến), phát hiện phụ thuộc vòng sớm lúc khởi chạy và dễ viết Unit Test không cần khởi động Spring Context
- B. Vì Field Injection đã bị xóa khỏi Java 21
- C. Vì Constructor Injection giúp bỏ qua hoàn toàn bước kiểm tra `@Valid`
- D. Vì Field Injection không hoạt động trong Docker container
> **Đáp án đúng: A.** *Giải thích*: Constructor Injection làm rõ mọi dependency bắt buộc của class, hỗ trợ `final` và dễ truyền mock object khi test bằng JUnit/Mockito.

**Câu 3.3**: Khi client gửi yêu cầu `POST /api/v1/products` với `unitPrice = -5000` (vi phạm `@DecimalMin`), HTTP Status Code chuẩn mực nào cần trả về?
- A. `200 OK` kèm trường `success: false`
- B. `400 Bad Request` kèm mô tả lỗi trường dữ liệu (ví dụ `ProblemDetail`)
- C. `401 Unauthorized`
- D. `500 Internal Server Error`
> **Đáp án đúng: B.** *Giải thích*: Lỗi dữ liệu đầu vào do phía client gửi lên phải trả về `400 Bad Request` (nhóm `4xx`), không được trả `200` hay để văng `500`.

**Câu 3.4**: Trong kiến trúc phân tầng C3 chuẩn của một Spring Boot Microservice, tầng nào chịu trách nhiệm quản lý ranh giới giao dịch `@Transactional` và điều phối logic nghiệp vụ?
- A. `@RestController`
- B. `@Service`
- C. `record` DTO
- D. `GlobalExceptionHandler`
> **Đáp án đúng: B.** *Giải thích*: Tầng `@Service` chứa quy tắc nghiệp vụ và ranh giới giao dịch; `@RestController` chỉ lo giao thức HTTP còn `@Repository` chỉ lo truy vấn dữ liệu.

---

# 🌐 MODULE 2: ĐỊNH TUYẾN, KHÁM PHÁ DỊCH VỤ & GIAO TIẾP ĐỒNG BỘ (SYNC IPC)

---

## CHƯƠNG 04: SERVICE DISCOVERY (EUREKA) & CẤU HÌNH HÓA BÊN NGOÀI (EXTERNALIZED CONFIG)

- **Mã chương**: `JAVA-CH04` | **Học phần**: Module 2
- **Nguồn chuẩn**: `[R19]` Ch.3 (§3.2.4 *Using Service Discovery*, tr. 80–85) & Ch.11 (§11.2 *Designing Configurable Services*, tr. 360–364); `[S16]` Ch.4 (*Registration and Discovery Service — Eureka*); `[F16]` Ch.3 (*Routing and Discovery*, tr. 39–40).
- **Mục tiêu học tập**:
  1. Hiểu vì sao không thể hard-code địa chỉ IP/Port trong môi trường container động.
  2. Phân biệt **Client-side Discovery** (Eureka + Spring Cloud LoadBalancer) và **Server-side Discovery** (Docker DNS / Kubernetes Service).
  3. Áp dụng mẫu **Externalized Configuration** (12-Factor App) để tách sạch thông tin mật (credentials, URL) ra khỏi mã nguồn và image Docker.

### 4.1. Bài toán địa chỉ động & Service Registry

Trong môi trường truyền thống, một ứng dụng có địa chỉ IP cố định. Nhưng trong Microservices chạy trên Docker/Cloud, các container liên tục được bật/tắt, cấp phát IP động, hoặc nhân bản lên $4$–$8$ instance khi tải cao. Nếu `order-service` hard-code `http://192.168.1.15:8082`, hệ thống sẽ lập tức chết ngay khi container `catalog-service` khởi động lại!

Giải pháp là **Service Registry** (ví dụ **Netflix Eureka Server**) — đóng vai trò như một *"danh bạ điện thoại sống"*:

```text
                   +---------------------------+
                   |    Service Registry       |
                   |     (Eureka Server)       |
                   +---------------------------+
                     ^   ^                   |
     (1) Self-Reg +  |   | (1) Heartbeat     | (2) Lấy danh sách instance sống
         Heartbeat   |   |     mỗi 30s       |     (Cache tại client)
                     |   |                   v
        +------------+   +-------+   +------------------+
        | catalog-service (#1)   |   |  order-service   |
        | catalog-service (#2)   |   |  (LoadBalancer)  |
        +------------------------+   +------------------+
                                             |
                  (3) Gọi trực tiếp theo tên |  http://catalog-service/api/v1/products
                      logic (Round-Robin)    v
```

### 4.2. So sánh hai mô hình Service Discovery (`[R19]` §3.2.4)

| Mô hình | Cách hoạt động | Ví dụ thực tế | Ưu / Nhược điểm |
| :--- | :--- | :--- | :--- |
| **Client-Side Discovery** | Dịch vụ tự đăng ký (Self-Registration) vào Registry. Client truy vấn Registry và tự cân bằng tải. | **Spring Cloud Eureka + Spring Cloud LoadBalancer** | Ít bước trung gian (network hop); nhưng client phải cài thư viện discovery theo đúng ngôn ngữ (Java/C# khác nhau). |
| **Server-Side Discovery** | Nền tảng tự đăng ký (3rd-Party Registration). Client chỉ gọi tới tên miền/router cố định, router tự điều phối. | **Docker Compose DNS**, **Kubernetes Service**, AWS ALB | Code ứng dụng cực sạch, đa ngôn ngữ (polyglot) không cần SDK discovery; phụ thuộc hạ tầng triển khai. |

### 4.3. Cấu hình Eureka Server & Client trong Spring Boot 3

```yaml
# service-discovery/src/main/resources/application.yml
server:
  port: 8761
spring:
  application:
    name: service-discovery
eureka:
  client:
    register-with-eureka: false
    fetch-registry: false
```

```yaml
# catalog-service/src/main/resources/application.yml
server:
  port: ${SERVER_PORT:8082}
spring:
  application:
    name: catalog-service
eureka:
  client:
    service-url:
      defaultZone: ${EUREKA_URI:http://localhost:8761/eureka/}
  instance:
    prefer-ip-address: true
```

### 4.4. Externalized Configuration & Bảo mật Secret (`[R19]` §11.2)

Theo nguyên tắc **Factor III của 12-Factor App** và `[R19]` §11.2: **Một bản build (JAR / Docker Image) duy nhất phải chạy được ở mọi môi trường (`dev`, `staging`, `prod`) chỉ bằng cách thay đổi cấu hình bên ngoài**, không bao giờ build lại code hay commit mật khẩu vào Git!

- **Push-based**: Truyền biến môi trường (`SPRING_DATASOURCE_URL`, `JWT_SECRET`, `KAFKA_BOOTSTRAP_SERVERS`) từ `docker-compose.yml` hoặc Kubernetes ConfigMap/Secret vào container lúc khởi chạy.
- **Pull-based**: Dịch vụ tự kéo cấu hình từ máy chủ tập trung (Spring Cloud Config Server, HashiCorp Vault) lúc khởi động.

```yaml
# ĐÚNG CHUẨN: Đọc từ biến môi trường, tuyệt đối KHÔNG hard-code secret!
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/catalog_db}
    username: ${DB_USERNAME:postgres}
    password: ${DB_PASSWORD}   # Không đặt mật khẩu production làm default!
```

### 4.5. Góc nhìn trên nền tảng MAVIS
- **Quét cấu hình tĩnh**: Phân hệ `detector/config` của MAVIS đọc `application.yml` và `docker-compose.yml` để ánh xạ tên logic `spring.application.name` thành các nút Container (C2) và khớp địa chỉ đích của các lời gọi dịch vụ.
- **Chống lộ Secret (`D2` — Zero-Leak AI)**: Nếu kho mã nguồn vô tình chứa khóa bí mật (`sk-*`, `Bearer ...`, `password`), `SecretRedactor` của MAVIS tự động thay thế thành `[REDACTED]` trước khi gửi ngữ cảnh cho AI Tutor.
- **Mở rộng instance trong MAVIS Studio**: Nhờ Discovery/LoadBalancer, khi em scale `catalog-service` hoặc `order-service` từ $1 \to 4$ container, lưu lượng tự động phân tán mà không cần sửa cấu hình dịch vụ gọi!

### 4.6. Bài tập thực hành Lab 04
- Mở file `application.yml` của tất cả các dịch vụ trong kho mẫu. Xác nhận giá trị `spring.application.name`, cổng mặc định và toàn bộ biến môi trường `${...}`.
- Kiểm tra sự tương ứng giữa tên dịch vụ trong `docker-compose.yml` và tên đăng ký trên Eureka (`service-discovery`).

### 4.7. Ngân hàng Quiz Gate — Chương 04

**Câu 4.1**: Lợi ích trực tiếp nhất của **Service Discovery** trong kiến trúc Microservices là gì?
- A. Giúp cơ sở dữ liệu chạy truy vấn SQL nhanh gấp đôi
- B. Cho phép các dịch vụ tìm thấy địa chỉ mạng động của nhau theo tên logic mà không cần hard-code IP/Port khi container tự động khởi động lại hoặc scale
- C. Thay thế hoàn toàn cơ chế xác thực người dùng JWT
- D. Tự động sửa lỗi biên dịch trong mã nguồn Java
> **Đáp án đúng: B.** *Giải thích*: Trong môi trường container/cloud, IP và số lượng instance luôn thay đổi động; Service Discovery giải quyết ánh xạ tên dịch vụ $\rightarrow$ tập địa chỉ đang sống.

**Câu 4.2**: Cơ chế nào giúp Eureka Server biết một instance của `order-service` đã bị sập (crash) để loại khỏi danh sách định tuyến?
- A. Eureka đọc trực tiếp file log trên ổ cứng của container
- B. Service gửi tín hiệu định kỳ (**Heartbeat** / lease renewal); nếu quá thời hạn không nhận được, Eureka hủy đăng ký (evict) instance đó
- C. Người dùng cuối bấm nút báo lỗi trên trình duyệt
- D. Database PostgreSQL gửi trigger báo cho Eureka
> **Đáp án đúng: B.** *Giải thích*: Theo mẫu Self-Registration, mỗi instance gửi heartbeat định kỳ để gia hạn lease với Registry.

**Câu 4.3**: Điểm khác biệt chính giữa **Client-Side Discovery** (Eureka + Spring Cloud LoadBalancer) và **Server-Side Discovery** (Kubernetes Service / Docker DNS) là gì?
- A. Client-Side Discovery không hỗ trợ HTTP
- B. Trong Client-Side Discovery, bản thân dịch vụ gọi truy vấn Registry và tự chọn instance để gửi request; trong Server-Side Discovery, thành phần định tuyến hạ tầng thực hiện bước này
- C. Server-Side Discovery chỉ chạy được với ngôn ngữ Java
- D. Client-Side Discovery không thể cân bằng tải Round-Robin
> **Đáp án đúng: B.** *Giải thích*: Server-side tách biệt hoàn toàn logic khám phá dịch vụ ra khỏi mã nguồn ứng dụng, rất thuận lợi cho hệ thống đa ngôn ngữ (Java + C#).

**Câu 4.4**: Khi áp dụng **Externalized Configuration**, thực hành nào sau đây là **SAI** và gây rủi ro bảo mật nghiêm trọng?
- A. Truyền `DB_PASSWORD` và `JWT_SECRET` qua biến môi trường của Docker/Vault lúc runtime
- B. Dùng chung một Docker Image cho cả staging và production, chỉ đổi biến môi trường
- C. Ghi trực tiếp khóa API thật và mật khẩu database production vào `application.yml` rồi commit lên GitHub
- D. Tách cấu hình mặc định phát triển cục bộ bằng Spring Profile (`application-dev.yml`)
> **Đáp án đúng: C.** *Giải thích*: Hard-code secret vào Git là nguyên nhân hàng đầu gây rò rỉ dữ liệu; mọi secret phải được cung cấp từ bên ngoài lúc triển khai.

---

## CHƯƠNG 05: API GATEWAY PATTERN & BẢO MẬT TẬP TRUNG (JWT / OAUTH 2.0 / RBAC)

- **Mã chương**: `JAVA-CH05` | **Học phần**: Module 2
- **Nguồn chuẩn**: `[R19]` Ch.8 (*External API Patterns*, tr. 253–278) & Ch.11 (§11.1 *Developing Secure Services*, tr. 349–360); `[S16]` Ch.6 (*Securing Microservices*).
- **Mục tiêu học tập**:
  1. Hiểu lý do không nên để Frontend/Mobile gọi trực tiếp hàng chục Microservice nội bộ.
  2. Cấu hình định tuyến và bộ lọc (Filter) bằng **Spring Cloud Gateway**.
  3. Triển khai mô hình bảo mật **Stateless JWT + Gateway Offloading** và phân quyền theo vai trò (**RBAC**).

### 5.1. Tại sao cần API Gateway (và BFF)?

Giả sử trang chi tiết đơn hàng trên trình duyệt cần dữ liệu từ `identity-service`, `catalog-service`, `order-service`. Nếu trình duyệt gọi trực tiếp từng service:
- **Chatty I/O**: Gửi quá nhiều HTTP request qua mạng di động chậm.
- **Lộ cấu trúc nội bộ**: Đổi port hay gộp/tách 2 service nội bộ sẽ làm hỏng ngay ứng dụng Mobile đã phát hành cho khách hàng!
- **Lặp lại logic bảo mật**: Service nào cũng phải tự xử lý CORS, Rate Limiting, SSL termination, kiểm tra token.

**API Gateway (`[R19]` Ch.8)** đóng vai trò là **điểm vào duy nhất (Single Entry Point)** ở biên hệ thống:

```text
[Web Browser / Mobile App]
            |  HTTPS + Authorization: Bearer <JWT>
            v
+-------------------------------------------------------------+
|                   API GATEWAY (Port 8080)                   |
|  - Routing (/api/v1/products/** -> lb://catalog-service)    |
|  - JWT Signature Verification & Expiration Check            |
|  - Rate Limiting, CORS, Request Logging / Correlation ID    |
|  - Inject Trusted Headers: X-User-Id, X-User-Role           |
+-------------------------------------------------------------+
      |                       |                       |
      v                       v                       v
[identity-service]    [catalog-service]       [order-service]
```

> **Mở rộng — Pattern BFF (Backends for Frontends, `[R19]` §8.2)**: Khi Web Desktop, Mobile App và Đối tác bên thứ 3 cần định dạng dữ liệu quá khác nhau, ta có thể tách thành các Gateway riêng cho từng loại client (Web BFF, Mobile BFF) để tránh một Gateway khổng lồ trở thành nút thắt cổ chai của mọi đội nhóm.

### 5.2. Định tuyến chuẩn với Spring Cloud Gateway

```yaml
# api-gateway/src/main/resources/application.yml
spring:
  application:
    name: api-gateway
  cloud:
    gateway:
      routes:
        - id: identity-service
          uri: lb://identity-service
          predicates:
            - Path=/api/v1/auth/**, /api/v1/users/**
        - id: catalog-service
          uri: lb://catalog-service
          predicates:
            - Path=/api/v1/products/**, /api/v1/categories/**
        - id: order-service
          uri: lb://order-service
          predicates:
            - Path=/api/v1/orders/**
```
*(Tiền tố `lb://` yêu cầu Gateway tìm địa chỉ qua Service Discovery + LoadBalancer).*

### 5.3. Bảo mật Microservices: JWT Stateless & Gateway Offloading (`[R19]` §11.1 & `[S16]` Ch.6)

Trong Monolith, ta có thể lưu **HTTP Session** trong RAM server. Nhưng trong Microservices có nhiều dịch vụ và nhiều replica, lưu session trong RAM sẽ phá vỡ tính độc lập. Thay vào đó, ta dùng **Access Token tự chứa (JWT — JSON Web Token)**:

1. Client gửi thông tin đăng nhập tới `identity-service` (qua API Gateway) $\rightarrow$ nhận về chuỗi JWT ký số (`Header.Payload.Signature`) chứa `sub` (userId), `role` (`CUSTOMER`, `STAFF`, `ADMIN`), `exp` (hạn dùng).
2. Ở các request tiếp theo, Client đính kèm header `Authorization: Bearer <token>`.
3. **API Gateway** xác thực chữ ký và hạn dùng JWT một lần ở biên:
   - Nếu không hợp lệ $\rightarrow$ chặn ngay `401 Unauthorized` trước khi chạm tới dịch vụ nội bộ.
   - Nếu hợp lệ $\rightarrow$ giải mã `userId`, `role` và **gắn vào header nội bộ** (`X-User-Id`, `X-User-Role`) rồi chuyển tiếp xuống service đích (đồng thời **xóa sạch** các header giả mạo cùng tên mà kẻ tấn công cố tình gửi từ ngoài vào!).
4. **Phòng thủ nhiều lớp (Defense in Depth)**: Các service nội bộ không phơi cổng ra Internet công cộng (chỉ nằm trong mạng nội bộ Docker) và vẫn kiểm tra quyền nghiệp vụ RBAC ở tầng Method (`@PreAuthorize("hasRole('ADMIN')")` hoặc kiểm tra chủ sở hữu dữ liệu `order.getCustomerId().equals(currentUserId)`).

```java
// Minh họa GlobalFilter tại Spring Cloud Gateway xác thực JWT và làm sạch header giả mạo
@Component
public class JwtAuthenticationGatewayFilter implements GlobalFilter, Ordered {

    private final JwtTokenVerifier jwtVerifier;

    public JwtAuthenticationGatewayFilter(JwtTokenVerifier jwtVerifier) {
        this.jwtVerifier = jwtVerifier;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        if (isPublicEndpoint(path)) {
            return chain.filter(exchange);
        }

        String authHeader = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        JwtClaims claims = jwtVerifier.verify(authHeader.substring(7));
        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .headers(h -> {
                    h.remove("X-User-Id");      // Chống spoofing từ client ngoài!
                    h.remove("X-User-Role");
                })
                .header("X-User-Id", claims.userId())
                .header("X-User-Role", claims.role())
                .build();

        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    @Override
    public int getOrder() { return -1; }
}
```

### 5.4. Góc nhìn trên nền tảng MAVIS
- **Sơ đồ C1 & C2**: `api-gateway` là nút mặt tiền duy nhất kết nối với tác nhân người dùng bên ngoài (`Customer`, `Admin`) và tỏa nhánh định tuyến đến các service nghiệp vụ phía sau.
- **Mô phỏng trên MAVIS Studio**: Nếu sinh viên dùng Studio dừng `api-gateway`, toàn bộ yêu cầu từ ngoài vào hệ thống lập tức thất bại — chứng minh rõ vai trò **Single Point of Failure (SPOF)** nếu Gateway chỉ chạy 1 instance và lý do ngoài thực tế Gateway luôn cần chạy $\ge 2$ replica.

### 5.5. Cạm bẫy thường gặp (Anti-Patterns)
1. **Nhét logic nghiệp vụ vào API Gateway**: Gateway chỉ nên xử lý *cross-cutting concerns* (routing, auth, rate limit, CORS). Nếu viết logic tính giá hay trừ tồn kho vào Gateway, nó sẽ biến thành một Monolith mới.
2. **Tin mù quáng vào `X-User-Id` khi service nội bộ bị mở cổng công khai**: Nếu service nội bộ lỡ phơi port trực tiếp ra ngoài mà không chặn qua mạng nội bộ hoặc không có chữ ký nội bộ, kẻ tấn công có thể gọi thẳng service và tự gắn `X-User-Role: ADMIN`.

### 5.6. Bài tập thực hành Lab 05
- Kiểm tra cấu hình route của `api-gateway` trên sơ đồ C2 của MAVIS và đối chiếu với file `application.yml`.
- Thử phân tích một luồng đăng nhập và một luồng gọi API cần quyền `ADMIN`: chỉ rõ nơi kiểm tra `401 Unauthorized` (xác thực) và nơi kiểm tra `403 Forbidden` (phân quyền).

### 5.7. Ngân hàng Quiz Gate — Chương 05

**Câu 5.1**: Chức năng nào sau đây **KHÔNG** nên đặt bên trong API Gateway?
- A. Định tuyến yêu cầu (Routing) và cân bằng tải tới các service nội bộ
- B. Xác thực chữ ký JWT, kiểm soát CORS và giới hạn tần suất gọi (Rate Limiting)
- C. Lưu trữ bảng dữ liệu đơn hàng và xử lý quy tắc nghiệp vụ trừ tồn kho
- D. Gắn mã định danh theo dõi (`Correlation ID`) cho mỗi yêu cầu đi vào hệ thống
> **Đáp án đúng: C.** *Giải thích*: Logic nghiệp vụ và dữ liệu miền phải thuộc về từng Microservice chuyên trách; nhồi nghiệp vụ vào Gateway tạo ra nút thắt và Monolith mới.

**Câu 5.2**: Khi API Gateway truyền thông tin người dùng đã xác thực xuống dịch vụ nội bộ qua header `X-User-Id` và `X-User-Role`, bước bảo mật nào là bắt buộc tại Gateway?
- A. Mã hóa toàn bộ nội dung body sang Base64
- B. Xóa/ghi đè mọi header `X-User-Id` và `X-User-Role` do client bên ngoài tự gửi lên trước khi gán giá trị giải mã từ JWT hợp lệ
- C. Cho phép client tự gửi `X-User-Role` nếu không có JWT
- D. Lưu mật khẩu gốc của người dùng vào header `X-User-Password`
> **Đáp án đúng: B.** *Giải thích*: Ngăn chặn lỗ hổng giả mạo danh tính (Header Spoofing) từ phía client gửi lên.

**Câu 5.3**: Sự khác biệt chính xác giữa HTTP `401 Unauthorized` và HTTP `403 Forbidden` là gì?
- A. `401` dùng cho lỗi máy chủ, `403` dùng cho lỗi cơ sở dữ liệu
- B. `401` nghĩa là chưa xác thực được danh tính (thiếu/sai/hết hạn token); `403` nghĩa là đã xác thực danh tính nhưng không có quyền thực hiện hành động đó
- C. Hai mã hoàn toàn giống nhau, dùng mã nào cũng được
- D. `401` chỉ dành cho API Gateway, `403` chỉ dành cho Database
> **Đáp án đúng: B.** *Giải thích*: `401` = Authentication failure (Bạn là ai?); `403` = Authorization failure (Tôi biết bạn là ai, nhưng bạn không có quyền!).

**Câu 5.4**: Mục đích của mẫu **BFF (Backends for Frontends)** là gì?
- A. Loại bỏ hoàn toàn tầng Frontend khỏi dự án
- B. Tạo các API Gateway chuyên biệt cho từng loại client (Web, Mobile, đối tác) để tối ưu dữ liệu trả về và giúp các đội phát triển độc lập
- C. Thay thế cơ sở dữ liệu quan hệ bằng NoSQL
- D. Cho phép trình duyệt kết nối thẳng tới PostgreSQL
> **Đáp án đúng: B.** *Giải thích*: Mỗi loại client có nhu cầu dữ liệu và băng thông khác nhau; BFF giúp tránh một Gateway chung trở nên cồng kềnh.

---

## CHƯƠNG 06: GIAO TIẾP ĐỒNG BỘ (REST / OPENFEIGN), HỢP ĐỒNG API & PHÂN TÍCH TÁC ĐỘNG REVERSE BFS

- **Mã chương**: `JAVA-CH06` | **Học phần**: Module 2
- **Nguồn chuẩn**: `[R19]` Ch.3 (§3.1–§3.2 & §3.4 *Synchronous Communication Reduces Availability*, tr. 66–77, 103–104); `[S16]` Ch.9 (*Cyclic Dependencies and Their Impact*); MAVIS Specification (`D2` & `D4` Cycle-Safe Reverse BFS).
- **Mục tiêu học tập**:
  1. Triển khai giao tiếp đồng bộ liên dịch vụ sạch đẹp bằng **Spring Cloud OpenFeign** (và biết khi nào cân nhắc `RestClient` / `gRPC`).
  2. Tính toán được sự sụt giảm độ khả dụng (Availability) khi chuỗi gọi đồng bộ quá dài.
  3. Nắm vững thuật toán **Cycle-Safe Reverse BFS** và **DFS 3 màu** để đánh giá tác động thay đổi (*Change Impact Analysis*) và phát hiện phụ thuộc vòng (*Cyclic Dependency*).

### 6.1. Giao tiếp đồng bộ (Sync IPC) với Spring Cloud OpenFeign

Trong Spring Cloud, thay vì viết mã ghép URL thủ công rườm rà, **OpenFeign** cho phép khai báo một Java `interface` mô tả hợp đồng giao tiếp với dịch vụ khác:

```java
// order-service gọi sang catalog-service qua OpenFeign (tự động tích hợp Eureka + LoadBalancer)
@FeignClient(name = "catalog-service", path = "/api/v1/products")
public interface CatalogFeignClient {

    @GetMapping("/{productId}")
    ProductSummaryDto getProductById(@PathVariable("productId") Long productId);

    @PostMapping("/{productId}/reserve")
    void reserveStock(@PathVariable("productId") Long productId,
                      @RequestBody ReserveStockRequest request);
}
```

#### Bằng chứng tĩnh (`CALL_SITE`) trong phân tích kiến trúc MAVIS (`D2`)
Khi MAVIS phân tích `order-service`, bộ phân tích JavaParser tìm thấy `@FeignClient(name = "catalog-service")` kết hợp lời gọi thực tế `catalogFeignClient.reserveStock(...)` trong `OrderServiceImpl.java` (ví dụ dòng 84). Nhờ có **bằng chứng tại điểm gọi (`CALL_SITE` với `locator` + `excerpt`)**, MAVIS mới xác nhận chắc chắn cạnh `SERVICE_HTTP_CALL`:

```text
order-service ──[SERVICE_HTTP_CALL: POST /api/v1/products/{id}/reserve]──> catalog-service
```
*(Nếu chỉ thấy tên `catalog-service` xuất hiện trong file cấu hình mà không tìm thấy điểm gọi trong mã nguồn, MAVIS tuân thủ tính trung thực nhận thức `D2` bằng cách gắn nhãn `NEEDS_REVIEW` / `UNVERIFIED_METADATA_ONLY`, tuyệt đối không bịa đặt!)*

### 6.2. Cái giá của chuỗi gọi đồng bộ: Toán học về Độ khả dụng (`[R19]` §3.4)

Mọi lời gọi đồng bộ (HTTP/REST) đều tạo ra **khớp nối thời gian (Temporal Coupling)**: nếu dịch vụ bị gọi chậm hoặc sập, dịch vụ gọi sẽ bị treo luồng theo.

Nếu một thao tác cần gọi đồng bộ qua một chuỗi gồm $n$ dịch vụ độc lập, mỗi dịch vụ có độ khả dụng $A_i$, thì độ khả dụng tổng thể là tích xác suất:

$$A_{\text{total}} = \prod_{i=1}^{n} A_i$$

Ví dụ, nếu mỗi dịch vụ đạt độ khả dụng $99.5\%$ ($0.995$):
- Chuỗi 1 dịch vụ: $A = 0.995 = 99.5\%$
- Chuỗi 3 dịch vụ nối tiếp: $A = 0.995^3 \approx 98.51\%$
- Chuỗi 5 dịch vụ nối tiếp: $A = 0.995^5 \approx 97.52\%$ (tương đương hơn **9 ngày chết hệ thống mỗi năm**!)

> **Bài học kiến trúc**: Giữ độ sâu chuỗi gọi đồng bộ (call chain depth) thật nông (tốt nhất $\le 2$ bước); với các tác vụ không cần kết quả tức thì (gửi email, ghi thông báo, cập nhật thống kê), hãy chuyển sang **giao tiếp bất đồng bộ** (Chương 8).

### 6.3. Phân tích tác động thay đổi (Change Impact) bằng Cycle-Safe Reverse BFS (`D4`)

Giả sử bạn sắp thay đổi API hoặc cấu trúc trả về của `catalog-service`. **Những dịch vụ nào sẽ bị ảnh hưởng?**

Trên đồ thị phụ thuộc có hướng $G = (V, E)$, một cạnh $u \to v$ có nghĩa là *"dịch vụ $u$ gọi tới dịch vụ $v$"*. Để tìm toàn bộ các dịch vụ bị ảnh hưởng khi nút đích $t$ thay đổi, ta phải **duyệt ngược cạnh ($v \leftarrow u$)** xuất phát từ $t$ bằng thuật toán **Reverse BFS (Breadth-First Search ngược)**:

```text
Đồ thị gọi xuôi (Call Graph):
  api-gateway ──> order-service ──> catalog-service
       |                                  ^
       +──────────────────────────────────+

Duyệt ngược từ target = catalog-service (Reverse BFS):
  - Hop 0 (Target)           : catalog-service
  - Hop 1 (Direct Callers)   : order-service, api-gateway   (Ảnh hưởng trực tiếp!)
  - Hop 2 (Indirect Callers) : (nếu có web-bff gọi api-gateway -> hop = 2)
  - Isolated Nodes           : notification-service (0 đường phụ thuộc tới target)
```

#### Tại sao phải "Cycle-Safe" và phát hiện chu trình bằng DFS 3 màu?
1. **Chống lặp vô tận trong Reverse BFS**: Nếu hai dịch vụ vô tình gọi vòng tròn ($A \to B \to A$), thuật toán BFS thông thường không có tập `visited` sẽ chạy vô hạn. Sử dụng hàng đợi **FIFO Queue + tập `visited`** đảm bảo mỗi đỉnh chỉ được duyệt đúng 1 lần với độ phức tạp $O(|V| + |E|)$, cho ra khoảng cách `hop` ngắn nhất chính xác.
2. **Phát hiện Cyclic Dependency không báo giả trên DAG hình thoi**:
   - Xét đồ thị hình thoi $A \to B$, $A \to C$, $B \to D$, $C \to D$. Đỉnh $D$ được chạm 2 lần nhưng **KHÔNG phải chu trình**!
   - Vì vậy, để phát hiện chu trình chính xác, MAVIS dùng **DFS 3 màu**:
     - `WHITE` (0): Chưa thăm.
     - `GRAY` (1): Đang nằm trên ngăn xếp đệ quy hiện tại.
     - `BLACK` (2): Đã duyệt xong toàn bộ nhánh con.
   - Chu trình chỉ tồn tại **khi và chỉ khi** ta gặp một cạnh đi tới đỉnh đang có màu `GRAY` (*back-edge*).

### 6.4. Tiến hóa Hợp đồng API (API Evolution & Contract Drift)
- **Nguyên tắc Robustness (Postel's Law)**: Dễ tính khi nhận (bỏ qua các trường JSON mới lạ chưa biết — `@JsonIgnoreProperties(ignoreUnknown = true)`), chặt chẽ khi gửi.
- **Breaking Change vs. Non-breaking Change**:
  - *Non-breaking*: Thêm một trường tùy chọn mới vào response JSON.
  - *Breaking*: Đổi tên trường, đổi kiểu dữ liệu (`Long` $\to$ `String`), xóa endpoint hoặc bắt buộc thêm trường mới trong request mà không tăng phiên bản (`/api/v1/` $\to$ `/api/v2/`).

### 6.5. Góc nhìn trên nền tảng MAVIS
- **Step 2 (Static Impact Exploration)**: Sinh viên chọn một nút bất kỳ (ví dụ `catalog-service`) trên đồ thị MAVIS để chạy **Reverse BFS**, phân biệt rõ nhóm `Direct Callers (hop = 1)`, `Indirect Callers (hop >= 2)` và `Isolated Nodes` (bán kính ảnh hưởng $= 1$, không lan truyền dây chuyền).
- **Cảnh báo 3E**: MAVIS tự động phát hiện **Cyclic Dependency** (A gọi B, B gọi lại A) và **Contract Drift** (URL/HTTP Method phía Feign Client không khớp với `@RequestMapping` phía Controller đích).

### 6.6. Bài tập thực hành Lab 06
- Trong MAVIS Step 1–2, tìm một cạnh `SERVICE_HTTP_CALL`, bấm xem bằng chứng `file:line` (`CALL_SITE`).
- Chạy **Reverse BFS** lần lượt trên `catalog-service` (nút có nhiều caller) và một nút cô lập (không có caller nào gọi vào), so sánh bán kính tác động (`Blast Radius`) giữa hai trường hợp.

### 6.7. Ngân hàng Quiz Gate — Chương 06

**Câu 6.1**: Giả sử `order-service` gọi đồng bộ `catalog-service`, và `catalog-service` lại gọi đồng bộ `pricing-service`. Nếu mỗi dịch vụ có độ khả dụng là $99\%$ ($0.99$) và hoạt động độc lập, độ khả dụng tổng thể của chuỗi gọi 3 dịch vụ này xấp xỉ bao nhiêu?
- A. $99.00\%$
- B. $97.03\%$ (tính theo $0.99^3$)
- C. $100\%$
- D. $33.00\%$
> **Đáp án đúng: B.** *Giải thích*: Chuỗi gọi đồng bộ nối tiếp nhân xác suất hoạt động của từng mắt xích: $0.99 \times 0.99 \times 0.99 \approx 0.9703 = 97.03\%$.

**Câu 6.2**: Khi chạy thuật toán **Reverse BFS** xuất phát từ nút mục tiêu `catalog-service`, những dịch vụ ở khoảng cách `hop = 1` biểu thị điều gì?
- A. Các dịch vụ mà `catalog-service` gọi tới
- B. Các dịch vụ gọi **trực tiếp** tới `catalog-service` (Direct Callers)
- C. Các dịch vụ hoàn toàn cô lập với hệ thống
- D. Các dịch vụ chỉ gọi gián tiếp qua ít nhất 2 trung gian
> **Đáp án đúng: B.** *Giải thích*: Reverse BFS duyệt ngược chiều mũi tên phụ thuộc nên `hop = 1` là các upstream caller trực tiếp của nút đích.

**Câu 6.3**: Trong thuật toán **DFS 3 màu (`WHITE`, `GRAY`, `BLACK`)** dùng để phát hiện phụ thuộc vòng (*Cyclic Dependency*), điều kiện nào khẳng định đồ thị **chắc chắn có chu trình**?
- A. Gặp một đỉnh đã có màu `BLACK`
- B. Gặp một cạnh đi tới đỉnh đang có màu `GRAY` (đang nằm trên đường đi đệ quy hiện tại)
- C. Số cạnh lớn hơn số đỉnh
- D. Đồ thị có cấu trúc hình thoi $A \to B, A \to C, B \to D, C \to D$
> **Đáp án đúng: B.** *Giải thích*: Đỉnh `BLACK` có thể gặp lại trong DAG hình thoi không có chu trình; chỉ cạnh trỏ về đỉnh `GRAY` (*back-edge*) mới là chu trình thật.

**Câu 6.4**: Thay đổi nào sau đây trên REST API của `catalog-service` là một **Breaking Change** (gây vỡ hợp đồng với các client cũ)?
- A. Thêm một trường tùy chọn `promoTag` vào JSON response
- B. Xóa bỏ trường `unitPrice` hoặc đổi tên thành `priceAmount` trên cùng đường dẫn `/api/v1/products/{id}`
- C. Tối ưu câu truy vấn SQL bên trong `ProductRepository`
- D. Bổ sung thêm log theo dõi trong `ProductService`
> **Đáp án đúng: B.** *Giải thích*: Xóa hoặc đổi tên trường trên cùng version API làm mọi client đang parse trường `unitPrice` bị lỗi hoặc nhận `null`.

---

# 🗄️ MODULE 3: DỮ LIỆU PHÂN TÁN, BẤT ĐỒNG BỘ & TÍNH NHẤT QUÁN (DATA & SAGA)

---

## CHƯƠNG 07: DATABASE-PER-SERVICE, ANTI-PATTERN SHARED DB & CHIẾN LƯỢC TRUY VẤN

- **Mã chương**: `JAVA-CH07` | **Học phần**: Module 3
- **Nguồn chuẩn**: `[R19]` Ch.1 (§1.4.3 *Each Service Has Its Own Database*) & Ch.7 (*Implementing Queries*, tr. 220–242); `[S16]` Ch.8 (*A Separate Data Store for Each Microservice*); `[F16]` Ch.4 (*Scalable Data Storage*, tr. 55–57).
- **Mục tiêu học tập**:
  1. Giải thích sâu lý do **Shared Database** là kẻ thù số 1 phá vỡ kiến trúc Microservices.
  2. Phân biệt 3 cấp độ cách ly dữ liệu: *Private tables*, *Schema-per-service*, *Database server-per-service*.
  3. Áp dụng 2 mẫu truy vấn xuyên dịch vụ (**API Composition** & **CQRS**) và chiến lược **Cache-Aside với Redis**.

### 7.1. Tại sao "Shared Database" là Anti-Pattern chết người?

Khi mới chuyển từ Monolith sang Microservices, rất nhiều sinh viên tách code thành 4 project Spring Boot nhưng lại trỏ cả 4 `application.yml` vào **cùng một database `shop_db`** để tiện viết câu lệnh `JOIN`.

Hệ quả nghiêm trọng (`[R19]` Ch.1 & `[S16]` Ch.8):
1. **Khớp nối thời gian phát triển (Development-time Coupling)**: Đội `catalog-service` muốn đổi tên một cột trong bảng `products` phải đi xin phép đội `order-service` vì đội kia đang viết SQL đọc thẳng vào bảng đó!
2. **Khớp nối thời gian chạy (Runtime Coupling)**: Một truy vấn báo cáo nặng từ `analytics-service` làm khóa bảng (table lock) hoặc ngốn 100% CPU cơ sở dữ liệu khiến `order-service` không thể nhận đơn hàng!
3. **Mất khả năng chọn CSDL phù hợp (Polyglot Persistence)**: Mọi dịch vụ bị ép dùng chung một loại CSDL duy nhất dù mỗi nghiệp vụ có đặc thù khác nhau (PostgreSQL cho đơn hàng, Elasticsearch cho tìm kiếm, Redis cho giỏ hàng).

```text
SAI (Shared DB Anti-Pattern):             ĐÚNG (Database-per-Service):
[order-svc]   [catalog-svc]               [order-svc]          [catalog-svc]
     \             /                           |                     |
      v           v                            v                     v
   +-----------------+                    [(order_db)]         [(catalog_db)]
   |  (shared_db) ❌ |                    (Chỉ order-svc       (Chỉ catalog-svc
   +-----------------+                     được đọc/ghi)        được đọc/ghi)
```

### 7.2. Truy vấn dữ liệu nằm rải rác nhiều dịch vụ (`[R19]` Ch.7)

Khi đã tách riêng DB, ta không còn viết được câu SQL `SELECT ... FROM orders JOIN products JOIN users`. Có 2 mẫu thiết kế chuẩn để giải quyết:

#### (a) API Composition Pattern
Một dịch vụ đóng vai trò **API Composer** (có thể là API Gateway hoặc một dịch vụ tổng hợp) gọi song song các dịch vụ sở hữu dữ liệu qua API rồi ghép kết quả trong bộ nhớ (in-memory join).
- **Ưu điểm**: Đơn giản, dữ liệu luôn mới nhất (real-time), dễ triển khai cho truy vấn đơn giản.
- **Nhược điểm**: Tăng độ trễ mạng, giảm độ khả dụng (nhiều lời gọi đồng bộ), **không phù hợp** để join hàng chục nghìn bản ghi có lọc/phân trang phức tạp.

#### (b) CQRS (Command Query Responsibility Segregation)
Tách biệt hoàn toàn mô hình **Ghi (Command)** và mô hình **Đọc (Query)**:
- Khi `order-service` hoặc `catalog-service` thay đổi dữ liệu, chúng phát sự kiện miền (*Domain Event*) lên Kafka.
- Một dịch vụ chuyên đọc (`order-history-service`) lắng nghe các sự kiện đó và cập nhật một **bảng chiếu đã phi chuẩn hóa (Materialized Read View)** tối ưu riêng cho truy vấn tìm kiếm/báo cáo cực nhanh.
- **Đánh đổi**: Tốc độ đọc cực nhanh, mở rộng độc lập; nhưng tăng độ phức tạp hệ thống và dữ liệu đọc có độ trễ nhất quán cuối cùng (**Eventual Consistency**).

### 7.3. Tối ưu đọc bằng Redis Cache (Mẫu Cache-Aside)

Với dữ liệu đọc nhiều, ít thay đổi như danh mục sản phẩm (`catalog-service`), áp dụng mẫu **Cache-Aside**:
1. Kiểm tra Redis theo key (ví dụ `product:detail:{id}`).
2. **Cache Hit**: Trả ngay dữ liệu từ RAM (tính bằng mili-giây).
3. **Cache Miss**: Đọc từ PostgreSQL $\rightarrow$ ghi vào Redis kèm thời gian sống **TTL** (ví dụ 10 phút) $\rightarrow$ trả về client.
4. **Cache Invalidation**: Khi sản phẩm được cập nhật giá/tồn kho, **xóa key cache tương ứng (`@CacheEvict`)** để tránh trả dữ liệu cũ (stale data).

```java
@Service
public class ProductQueryService {

    private final ProductRepository productRepository;

    public ProductQueryService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }

    @Cacheable(value = "products", key = "#id")
    public ProductResponse getProductById(Long id) {
        return productRepository.findById(id)
                .map(ProductMapper::toResponse)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    @CacheEvict(value = "products", key = "#id")
    @Transactional
    public ProductResponse updatePrice(Long id, BigDecimal newPrice) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
        product.changePrice(newPrice);
        return ProductMapper.toResponse(productRepository.save(product));
    }
}
```

### 7.4. Góc nhìn trên nền tảng MAVIS
- **3E Rule — Shared Database Detection**: MAVIS quét `application.yml` và `docker-compose.yml` của từng dịch vụ để trích xuất URL/Schema kết nối CSDL. Nếu $\ge 2$ microservice cùng trỏ vào một database/schema giống hệt nhau, MAVIS lập tức bật cảnh báo đỏ **SHARED_DATABASE** trên sơ đồ C2.

### 7.5. Bài tập thực hành Lab 07
- Kiểm tra sơ đồ **C2 Container** của hệ thống mẫu trong MAVIS: xác nhận mỗi dịch vụ nghiệp vụ đều có mũi tên kết nối tới đúng 1 cơ sở dữ liệu/schema riêng biệt và không phát sinh cảnh báo `SHARED_DATABASE`.
- Đề xuất phương án (API Composition hay CQRS) cho 2 màn hình: (1) Xem chi tiết 1 đơn hàng vừa đặt, và (2) Tìm kiếm toàn văn & thống kê doanh thu 100.000 đơn hàng theo danh mục sản phẩm.

### 7.6. Ngân hàng Quiz Gate — Chương 07

**Câu 7.1**: Rủi ro kiến trúc lớn nhất khi cho hai Microservice (`order-service` và `catalog-service`) đọc/ghi chung một bảng cơ sở dữ liệu là gì?
- A. Không thể sử dụng kiểu dữ liệu `UUID` trong PostgreSQL
- B. Tạo khớp nối chặt cả lúc phát triển lẫn lúc chạy (đổi cấu trúc bảng làm vỡ service kia, tranh chấp khóa/tài nguyên CSDL), phá vỡ tính độc lập của Microservices
- C. Spring Data JPA không hỗ trợ kết nối 2 ứng dụng vào cùng 1 máy chủ DB
- D. Không thể chạy API Gateway phía trước nữa
> **Đáp án đúng: B.** *Giải thích*: Shared Database là anti-pattern kinh điển làm biến Microservices trở thành Distributed Monolith.

**Câu 7.2**: Trong mẫu **API Composition**, thành phần API Composer thực hiện công việc gì?
- A. Ghi log lỗi ra file văn bản
- B. Gọi API của nhiều dịch vụ sở hữu dữ liệu khác nhau rồi ghép (join) kết quả trong bộ nhớ để trả về cho client
- C. Sao chép tự động các bảng CSDL bằng trigger SQL
- D. Tạo token JWT cho người dùng
> **Đáp án đúng: B.** *Giải thích*: API Composition gom dữ liệu từ nhiều dịch vụ ở tầng ứng dụng thay vì SQL JOIN ở tầng CSDL.

**Câu 7.3**: Khi nào nên ưu tiên dùng **CQRS** thay vì **API Composition**?
- A. Khi cần truy vấn/lọc/phân trang phức tạp trên tập dữ liệu lớn nằm rải rác ở nhiều dịch vụ và chấp nhận nhất quán cuối cùng (Eventual Consistency)
- B. Khi dự án chỉ có duy nhất 1 bảng dữ liệu nhỏ
- C. Khi không muốn sử dụng Message Broker hay sự kiện miền
- D. Khi yêu cầu dữ liệu phải nhất quán tuyệt đối tức thì ở mọi truy vấn đọc
> **Đáp án đúng: A.** *Giải thích*: API Composition sẽ quá tải bộ nhớ và mạng khi phải join/sort hàng chục nghìn bản ghi; CQRS duy trì view đọc tối ưu sẵn sàng phục vụ truy vấn phức tạp.

**Câu 7.4**: Trong mẫu **Cache-Aside** dùng Redis, bước nào quan trọng nhất khi dữ liệu gốc trong PostgreSQL vừa được cập nhật giá bán?
- A. Khởi động lại toàn bộ máy chủ Redis
- B. Xóa hoặc cập nhật ngay khóa cache tương ứng (`@CacheEvict`) để tránh trả dữ liệu cũ (stale data)
- C. Tắt hoàn toàn thời gian sống TTL của Redis
- D. Xóa bản ghi trong PostgreSQL và chỉ giữ trên Redis
> **Đáp án đúng: B.** *Giải thích*: Cache invalidation đảm bảo dữ liệu hiển thị không bị lệch kéo dài so với dữ liệu nguồn trong DB.

---

## CHƯƠNG 08: GIAO TIẾP BẤT ĐỒNG BỘ (APACHE KAFKA), IDEMPOTENCY & TRANSACTIONAL OUTBOX

- **Mã chương**: `JAVA-CH08` | **Học phần**: Module 3
- **Nguồn chuẩn**: `[R19]` Ch.3 (§3.3 *Asynchronous Messaging*, tr. 85–103) & Ch.5 (§5.3 *Publishing Domain Events*, tr. 160–167).
- **Mục tiêu học tập**:
  1. Nắm rõ kiến trúc **Publish/Subscribe** với **Apache Kafka** (Topic, Partition, Consumer Group, Offset).
  2. Thiết kế **Idempotent Consumer** (xử lý chống trùng lặp thông điệp trong cơ chế *At-least-once delivery*).
  3. Hiểu bài toán **Dual-Write Problem** và giải pháp chuẩn **Transactional Outbox Pattern**.

### 8.1. Tại sao cần Giao tiếp Bất đồng bộ (Async Messaging)?

Khi khách hàng bấm **"Đặt hàng"**, hệ thống cần lưu đơn hàng rồi gửi email xác nhận, ghi điểm tích lũy, cập nhật báo cáo. Nếu `order-service` gọi HTTP đồng bộ sang `notification-service` và dịch vụ gửi email đang bảo trì $\rightarrow$ khách hàng không thể đặt hàng được!

Với **Message Broker (Apache Kafka)**, hai dịch vụ được **tách rời về mặt thời gian (Temporal Decoupling)**:

```text
+---------------+   publish("order.created")   +-------------------------+   consume   +----------------------+
| order-service | ───────────────────────────> |   Apache Kafka Broker   | ──────────> | notification-service |
+---------------+                              |  Topic: order.created   |             +----------------------+
  (Trả 201 ngay                                |  [Part 0] [Part 1] ...  |               (Xử lý độc lập; nếu
   cho khách!)                                 +-------------------------+                sập thì đọc lại sau!)
```

#### Khái niệm cốt lõi của Kafka mà lập trình viên Java phải nắm:
- **Topic & Partition**: Một Topic (như `order.created`) được chia thành nhiều Partition để xử lý song song. **Thứ tự thông điệp chỉ được đảm bảo bên trong CÙNG một Partition** $\rightarrow$ luôn dùng `orderId` (hoặc `customerId`) làm **Partition Key** để mọi sự kiện của cùng một đơn hàng (`created` $\to$ `paid` $\to$ `cancelled`) đi đúng thứ tự!
- **Consumer Group**: Các instance của cùng một dịch vụ (ví dụ 2 bản sao của `notification-service`) mang chung `group.id` sẽ chia nhau các partition để mỗi thông điệp chỉ được xử lý bởi **1 instance trong nhóm** (mô hình *Competing Consumers*). Dịch vụ khác (ví dụ `analytics-service`) mang `group.id` khác sẽ nhận bản sao độc lập (mô hình *Pub/Sub*).

### 8.2. Xử lý trùng lặp thông điệp: Idempotent Consumer (`[R19]` §3.3.6)

Trong hệ thống phân tán, cơ chế truyền thông điệp phổ biến và thực tế nhất là **At-Least-Once Delivery** (đảm bảo không mất tin, nhưng **có thể gửi trùng một tin $\ge 2$ lần** nếu mạng chập chờn trước khi consumer xác nhận ACK/commit offset).

Do đó, mọi Consumer **bắt buộc phải có tính Lũy đẳng (Idempotent)**: nhận cùng một sự kiện 1 lần hay 5 lần đều tạo ra **đúng 1 kết quả nghiệp vụ duy nhất**.

```java
// Lưu eventId vào bảng processed_events (có UNIQUE constraint) trong CÙNG @Transactional!
@Service
public class OrderNotificationConsumer {

    private final ProcessedEventRepository processedEventRepository;
    private final NotificationRepository notificationRepository;

    @KafkaListener(topics = "order.created", groupId = "notification-group")
    @Transactional
    public void onOrderCreated(OrderCreatedEvent event) {
        // Bước 1: Kiểm tra đã xử lý eventId này chưa
        if (processedEventRepository.existsById(event.eventId())) {
            return; // Bỏ qua an toàn nếu Kafka gửi trùng!
        }

        // Bước 2: Ghi nhận đã xử lý + thực thi nghiệp vụ trong cùng 1 transaction cục bộ
        processedEventRepository.save(new ProcessedEvent(event.eventId(), Instant.now()));
        notificationRepository.save(Notification.forOrderCreated(event.orderId(), event.customerEmail()));
    }
}
```

### 8.3. Bài toán Dual-Write & Mẫu Transactional Outbox (`[R19]` §3.3.7)

Xét đoạn code sai kinh điển mà 90% người mới viết:
```java
// ⚠️ BẪY DUAL-WRITE!
orderRepository.save(order);                   // (1) Ghi vào PostgreSQL
kafkaTemplate.send("order.created", event);    // (2) Gửi lên Kafka
```
Chuyện gì xảy ra nếu bước (1) commit thành công vào PostgreSQL, nhưng ngay sau đó dịch vụ mất điện hoặc Kafka mất kết nối trước bước (2)? $\rightarrow$ **Đơn hàng nằm trong DB nhưng sự kiện biến mất vĩnh viễn!** Ngược lại, nếu gửi Kafka trước rồi DB rollback $\rightarrow$ **Sự kiện ma (phantom event)** được phát đi cho một đơn hàng không tồn tại!

**Giải pháp chuẩn mực: Transactional Outbox Pattern**:
1. Trong **cùng một giao dịch `@Transactional` cục bộ** trên PostgreSQL, `order-service` vừa `INSERT` vào bảng `orders`, vừa `INSERT` sự kiện cần phát vào bảng `outbox_events` (trạng thái `PENDING`). Vì cả hai nằm trên cùng 1 DB nên đảm bảo nguyên tử **ACID** (hoặc cả hai cùng thành công, hoặc cả hai cùng rollback).
2. Một tiến trình nền độc lập (**Message Relay** — theo kiểu *Polling Publisher* quét định kỳ hoặc *Transaction Log Tailing* dùng Debezium CDC) đọc bảng `outbox_events`, đẩy lên Kafka rồi đánh dấu `PUBLISHED`.

```text
[order-service]
   |
   |--- BEGIN LOCAL DB TRANSACTION ---
   |  1. INSERT INTO orders (...)
   |  2. INSERT INTO outbox_events (event_id, topic, payload, status='PENDING')
   |--- COMMIT -----------------------
             |
             v
   [Outbox Relay / Debezium] ──(đọc & đẩy tin)──> [Apache Kafka]
```

### 8.4. Góc nhìn trên nền tảng MAVIS
- **Trích xuất cạnh bất đồng bộ**: MAVIS nhận diện `@KafkaListener` / `KafkaTemplate` trong mã nguồn và cấu hình Broker trong `docker-compose.yml` để phân biệt rõ giao tiếp bất đồng bộ (qua broker trung gian) với gọi HTTP đồng bộ trực tiếp.
- **Thử nghiệm trên MAVIS Studio**: Khi sinh viên **Stop** `notification-service` trong lúc hệ thống chạy, `order-service` **vẫn đặt hàng thành công bình thường** (không sập dây chuyền!) và thông điệp nằm chờ an toàn trong Kafka; khi **Start** lại `notification-service`, các thông điệp tồn đọng sẽ tự động được xử lý tiếp.

### 8.5. Bài tập thực hành Lab 08
- Thiết kế hợp đồng sự kiện JSON cho 2 topic `order.created` và `order.cancelled` (bắt buộc có `eventId`, `occurredAt`, `correlationId`, `orderId`).
- Giải thích tại sao cần truyền `orderId.toString()` làm **Message Key** khi gọi `kafkaTemplate.send(topic, key, payload)`.

### 8.6. Ngân hàng Quiz Gate — Chương 08

**Câu 8.1**: Trong Apache Kafka, để đảm bảo các sự kiện của **cùng một đơn hàng** (`order.created` rồi mới tới `order.cancelled`) luôn được xử lý đúng thứ tự, lập trình viên cần làm gì?
- A. Gửi sự kiện mà không cần key, để Kafka chia ngẫu nhiên (round-robin)
- B. Sử dụng `orderId` làm **Partition Key** để mọi sự kiện của cùng đơn hàng rơi vào cùng một Partition
- C. Đặt số lượng Consumer bằng 0
- D. Tắt tính năng lưu trữ trên đĩa của Kafka
> **Đáp án đúng: B.** *Giải thích*: Kafka chỉ đảm bảo thứ tự nghiêm ngặt (FIFO) trong phạm vi một Partition; cùng key sẽ băm vào cùng một Partition.

**Câu 8.2**: Tại sao mọi Kafka Consumer trong Microservices cần được thiết kế theo nguyên tắc **Idempotent Consumer**?
- A. Vì Kafka có thể gửi lại cùng một thông điệp nhiều hơn 1 lần (*At-least-once delivery*) khi xảy ra lỗi mạng hoặc consumer restart trước khi commit offset
- B. Vì Kafka tự động mã hóa ngược thông điệp mỗi khi đọc
- C. Để giảm kích thước file JAR khi đóng gói
- D. Vì Spring Boot không cho phép dùng `@Transactional` trong Consumer
> **Đáp án đúng: A.** *Giải thích*: Kiểm tra `eventId` trong bảng `processed_events` giúp tránh trừ tiền hai lần hoặc gửi trùng thông báo.

**Câu 8.3**: **Transactional Outbox Pattern** giải quyết triệt để vấn đề gì?
- A. Lỗi giao diện Frontend không cập nhật
- B. Vấn đề **Dual-Write** — đảm bảo việc cập nhật bảng nghiệp vụ trong CSDL và phát sự kiện ra Message Broker không bao giờ bị lệch nhau (mất sự kiện hoặc phát sự kiện ma)
- C. Vấn đề mật khẩu database bị yếu
- D. Tăng tốc độ gọi đồng bộ qua OpenFeign
> **Đáp án đúng: B.** *Giải thích*: Ghi cả entity nghiệp vụ và bản ghi outbox trong cùng một giao dịch ACID cục bộ, sau đó Relay mới đẩy sang Kafka.

**Câu 8.4**: Trong bài thí nghiệm trên MAVIS Studio, khi `order-service` giao tiếp với `notification-service` qua Kafka (bất đồng bộ), điều gì xảy ra với chức năng đặt hàng nếu ta **Stop** container `notification-service`?
- A. `order-service` lập tức sập theo với lỗi `500 Internal Server Error`
- B. Chức năng đặt hàng tại `order-service` vẫn thành công bình thường; sự kiện được Kafka lưu giữ và `notification-service` sẽ xử lý bù khi khởi động lại
- C. Cơ sở dữ liệu của `order-service` tự động bị xóa sạch
- D. API Gateway tự động chuyển thành `notification-service`
> **Đáp án đúng: B.** *Giải thích*: Đây là giá trị lớn nhất của giao tiếp bất đồng bộ: cô lập lỗi và nâng cao độ khả dụng (*availability*).

---

## CHƯƠNG 09: GIAO DỊCH PHÂN TÁN VỚI SAGA PATTERN (CHOREOGRAPHY & ORCHESTRATION)

- **Mã chương**: `JAVA-CH09` | **Học phần**: Module 3
- **Nguồn chuẩn**: `[R19]` Ch.4 (*Managing Transactions with Sagas*, tr. 110–145).
- **Mục tiêu học tập**:
  1. Hiểu vì sao **2PC (Two-Phase Commit / XA)** không phù hợp với kiến trúc Microservices hiện đại.
  2. Thiết kế **Saga Pattern** với chuỗi giao dịch cục bộ và **giao dịch bù trừ (Compensating Transactions)**.
  3. So sánh **Choreography-based Saga** vs. **Orchestration-based Saga** và biết cách xử lý vấn đề thiếu cô lập (*Lack of Isolation* — Semantic Lock).

### 9.1. Tại sao không dùng Two-Phase Commit (2PC)?

Trong Monolith, một giao dịch ACID duy nhất bao trùm cả việc tạo đơn hàng, trừ tồn kho và trừ tiền. Khi tách thành 3 cơ sở dữ liệu độc lập (`order_db`, `catalog_db`, `payment_db`), giao dịch phân tán kiểu cổ điển **2PC** gặp 3 rào cản chí mạng (`[R19]` §4.1.2):
1. Nhiều công nghệ hiện đại (như Kafka, Redis, MongoDB) **không hỗ trợ 2PC**.
2. **Độ khả dụng thấp**: Chỉ cần 1 dịch vụ tham gia sập giữa chừng, toàn bộ giao dịch bị treo và khóa tài nguyên.
3. **Thông lượng (throughput) kém**: Khóa hàng dữ liệu xuyên mạng trong suốt 2 pha làm sụt giảm hiệu năng nghiêm trọng.

### 9.2. Bản chất Saga Pattern & Giao dịch bù trừ (Compensating Transaction)

**Saga** là một chuỗi các **giao dịch cục bộ (Local Transactions)**. Mỗi giao dịch cục bộ cập nhật CSDL riêng của dịch vụ mình rồi kích hoạt bước tiếp theo. Nếu bước thứ $k$ thất bại vì vi phạm nghiệp vụ (ví dụ: hết tồn kho hoặc thẻ thanh toán bị từ chối), Saga thực thi ngược lại các **Giao dịch bù trừ (Compensating Transactions)** cho các bước $k-1, k-2, \dots, 1$ đã thành công trước đó!

```text
LUỒNG THÀNH CÔNG (Happy Path):
[T1: Order PENDING] ──> [T2: Reserve Stock] ──> [T3: Charge Payment] ──> [T4: Order CONFIRMED]

LUỒNG THẤT BẠI Ở T3 (Compensation Path):
[T1: Order PENDING] ──> [T2: Reserve Stock] ──> [T3: Payment FAILED ❌]
                                                      |
[C1: Order CANCELLED] <── [C2: Release Stock] <───────+
```

> **Lưu ý quan trọng**: Giao dịch bù trừ **không phải là `ROLLBACK` của SQL**! Nó là một hành động nghiệp vụ mới đảo ngược tác động ngữ nghĩa (ví dụ: tạo đơn ở trạng thái `PENDING` $\rightarrow$ bù trừ bằng cách đổi trạng thái thành `CANCELLED`; trừ 5 sản phẩm $\rightarrow$ bù trừ bằng cách cộng trả lại 5 sản phẩm vào kho).

### 9.3. Phân biệt 2 cách điều phối Saga (`[R19]` §4.2)

| Tiêu chí | Choreography (Vũ đạo — Phi tập trung) | Orchestration (Nhạc trưởng — Tập trung) |
| :--- | :--- | :--- |
| **Cách hoạt động** | Không có người chỉ huy; mỗi dịch vụ lắng nghe sự kiện từ dịch vụ trước rồi tự phát sự kiện tiếp theo. | Có một **Saga Orchestrator** (thường nằm ở `order-service`) gửi từng lệnh (Command) tới các dịch vụ tham gia và theo dõi phản hồi. |
| **Ưu điểm** | Đơn giản với luồng ngắn ($2$–$3$ bước), không có điểm tập trung. | Luồng nghiệp vụ rõ ràng ở một chỗ, **không bị phụ thuộc vòng**, dễ quản lý khi luồng dài ($\ge 4$ bước) và nhiều nhánh lỗi. |
| **Nhược điểm** | Luồng dài rất khó theo dõi tổng thể; dễ sinh phụ thuộc vòng (Cyclic Dependency) giữa các service. | Cần tránh nhét quá nhiều logic nghiệp vụ vào Orchestrator (giữ Orchestrator chỉ làm nhiệm vụ điều phối trạng thái). |

### 9.4. Xử lý sự thiếu cô lập (ACD thay vì ACID) (`[R19]` §4.3)

Saga đảm bảo **ACD** (*Atomicity, Consistency, Durability*) nhưng **KHÔNG có Isolation (I)**: trong lúc Saga đang chạy dở dang (đơn hàng vừa tạo xong nhưng chưa thanh toán xong), một giao dịch khác có thể nhìn thấy dữ liệu tạm thời (*Dirty Read*) hoặc sửa đè lên đơn hàng đó (*Lost Update*).

**Biện pháp đối phó chuẩn (`[R19]` §4.3.2)**:
- **Semantic Lock (Khóa ngữ nghĩa)**: Giao dịch đầu tiên đặt cờ trạng thái trung gian như `APPROVAL_PENDING` / `PAYMENT_PENDING`. Mọi thao tác khác (như khách bấm hủy/sửa đơn) phải kiểm tra trạng thái này để từ chối hoặc chờ Saga kết thúc.
- **Commutative Updates (Cập nhật giao hoán)**: Thiết kế các thao tác bù trừ có thể chạy theo bất kỳ thứ tự nào vẫn ra kết quả đúng (ví dụ: cộng/trừ số lượng thay vì ghi đè số tuyệt đối).
- **Idempotency Key (Khóa chống lặp)**: Client gửi kèm một `Idempotency-Key` duy nhất (UUID) cho mỗi lần bấm "Đặt hàng" để tránh việc khách bấm đúp nút mạng lag tạo ra 2 đơn hàng giống hệt nhau.

#### Ví dụ mã nguồn minh họa Orchestration Saga đơn giản kèm Compensation

```java
@Service
public class CreateOrderSagaOrchestrator {

    private final OrderRepository orderRepository;
    private final CatalogFeignClient catalogClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public OrderResponse execute(CreateOrderRequest req, String idempotencyKey) {
        // 0. Chống đặt trùng bằng Idempotency Key
        Optional<Order> existing = orderRepository.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return OrderMapper.toResponse(existing.get());
        }

        // Bước T1 (Semantic Lock): Tạo đơn với trạng thái PENDING
        Order order = orderRepository.save(Order.createPending(req, idempotencyKey));
        List<ReservedItem> reservedItems = new ArrayList<>();

        try {
            // Bước T2: Giữ tồn kho từng mặt hàng
            for (OrderItemRequest item : req.items()) {
                catalogClient.reserveStock(item.productId(), new ReserveStockRequest(item.quantity()));
                reservedItems.add(new ReservedItem(item.productId(), item.quantity()));
            }

            // Bước T3 (Pivot Transaction): Xác nhận đơn hàng
            order.markConfirmed();
            orderRepository.save(order);
            kafkaTemplate.send("order.created", order.getId().toString(), OrderCreatedEvent.from(order));
            return OrderMapper.toResponse(order);

        } catch (Exception ex) {
            // BÙ TRỪ (Compensating Transactions): Hoàn trả lại toàn bộ hàng đã giữ + Hủy đơn!
            compensateReservedStock(reservedItems);
            order.markCancelled("Saga failed: " + ex.getMessage());
            orderRepository.save(order);
            throw new BusinessException("ORDER_SAGA_FAILED", "Order failed and was safely compensated");
        }
    }

    private void compensateReservedStock(List<ReservedItem> reservedItems) {
        for (ReservedItem item : reservedItems) {
            catalogClient.releaseStock(item.productId(), new ReleaseStockRequest(item.quantity()));
        }
    }
}
```

### 9.5. Góc nhìn trên nền tảng MAVIS
- **Kiểm chứng trên MAVIS Studio**: Sinh viên có thể quan sát luồng đặt hàng khi tồn kho không đủ hoặc khi một dịch vụ tham gia bị dừng giữa chừng — đối chiếu bằng chứng trạng thái đơn hàng chuyển `PENDING -> CANCELLED` và số lượng tồn kho được hoàn trả nguyên vẹn.

### 9.6. Bài tập thực hành Lab 09
- Vẽ bảng các bước Saga (`T1, T2, T3` và bù trừ `C1, C2`) cho quy trình **Đặt hàng gồm 3 sản phẩm khác nhau** khi sản phẩm thứ 3 bị hết tồn kho.
- Giải thích vai trò của `Pivot Transaction` (điểm không quay đầu) và trạng thái `PENDING` (*Semantic Lock*) trong quy trình vừa thiết kế.

### 9.7. Ngân hàng Quiz Gate — Chương 09

**Câu 9.1**: Trong **Saga Pattern**, khi bước thứ 3 của một giao dịch phân tán thất bại, hệ thống khôi phục tính nhất quán dữ liệu bằng cách nào?
- A. Gọi lệnh `ROLLBACK` toàn cục trên tất cả các cơ sở dữ liệu cùng lúc bằng giao thức 2PC
- B. Thực thi các **Giao dịch bù trừ (Compensating Transactions)** để đảo ngược tác động nghiệp vụ của các bước đã thành công trước đó
- C. Khởi động lại toàn bộ container Docker
- D. Xóa toàn bộ dữ liệu trong cơ sở dữ liệu
> **Đáp án đúng: B.** *Giải thích*: Mỗi bước của Saga đã commit cục bộ nên không thể SQL rollback; hệ thống phải chạy các hành động nghiệp vụ bù trừ tương ứng.

**Câu 9.2**: Trong 4 tính chất `ACID`, tính chất nào mà **Saga Pattern KHÔNG tự động đảm bảo**, buộc lập trình viên phải bổ sung các biện pháp như *Semantic Lock*?
- A. Atomicity (Tính nguyên tử)
- B. Consistency (Tính nhất quán)
- C. Isolation (Tính cô lập)
- D. Durability (Tính bền vững)
> **Đáp án đúng: C.** *Giải thích*: Saga chỉ đảm bảo ACD; vì các giao dịch cục bộ commit ngay nên dữ liệu trung gian có thể bị giao dịch khác nhìn thấy nếu không có biện pháp đối phó như Semantic Lock.

**Câu 9.3**: Khi nào nên chọn **Orchestration-based Saga** thay vì **Choreography-based Saga**?
- A. Khi luồng giao dịch phức tạp có từ 4 bước trở lên, nhiều nhánh xử lý lỗi và cần một nơi điều phối tập trung dễ theo dõi, tránh phụ thuộc vòng
- B. Khi hệ thống chỉ có 1 dịch vụ Monolith duy nhất
- C. Khi không muốn bất kỳ dịch vụ nào biết trạng thái hiện tại của đơn hàng
- D. Khi muốn tăng tối đa phụ thuộc vòng giữa các dịch vụ
> **Đáp án đúng: A.** *Giải thích*: Choreography gọn nhẹ với luồng 2–3 bước, nhưng Orchestration vượt trội về khả năng kiểm soát và bảo trì khi luồng nghiệp vụ phức tạp.

**Câu 9.4**: Vai trò của trạng thái `PENDING` (kỹ thuật **Semantic Lock**) trên đơn hàng trong lúc Saga đang thực thi là gì?
- A. Khóa cứng toàn bộ bảng `orders` ở tầng PostgreSQL
- B. Báo hiệu cho các thao tác đồng thời khác biết đơn hàng đang trong tiến trình xử lý dở dang, ngăn chặn sửa đổi xung đột hoặc đọc nhầm trạng thái cuối
- C. Tăng tốc độ mạng giữa các dịch vụ
- D. Tự động mã hóa đơn hàng
> **Đáp án đúng: B.** *Giải thích*: Semantic Lock bảo vệ tính đúng đắn ở tầng nghiệp vụ thay vì giữ khóa CSDL xuyên mạng.

---

# 🛡️ MODULE 4: KHẢ NĂNG CHỊU LỖI & GIÁM SÁT HỆ THỐNG (RESILIENCE & OBSERVABILITY)

---

## CHƯƠNG 10: THIẾT KẾ MICROSERVICE CHỊU LỖI VỚI RESILIENCE4J

- **Mã chương**: `JAVA-CH10` | **Học phần**: Module 4
- **Nguồn chuẩn**: `[R19]` Ch.3 (§3.2.3 *Handling Partial Failure Using the Circuit Breaker Pattern*, tr. 77–80); `[F16]` Ch.3 (*Dependencies*, tr. 37–39); `[S16]` Ch.5 (nâng cấp từ Netflix Hystrix sang **Resilience4j**).
- **Mục tiêu học tập**:
  1. Hiểu hiện tượng **Cascading Failure (Sập dây chuyền)** khi một dịch vụ hạ lưu bị chậm (không chỉ khi nó sập!).
  2. Kết hợp đúng bộ tứ bảo vệ trong **Resilience4j**: **Timeout**, **Retry (kèm Backoff)**, **Circuit Breaker** và **Bulkhead**.
  3. Thiết kế **Fallback Method** an toàn, trung thực và phân biệt khi nào *được phép* dùng Fallback.

### 10.1. Kẻ giết người thầm lặng: "Dịch vụ bị chậm" nguy hiểm hơn "Dịch vụ bị sập"!

Nhiều bạn nghĩ rằng khi `catalog-service` bị tắt (connection refused), đó mới là sự cố đáng sợ nhất. Thực tế trong hệ thống phân tán (`[R19]` §3.2.3 & `[F16]` Ch.3), **dịch vụ chạy cực chậm (hanging / high latency)** còn nguy hiểm hơn gấp nhiều lần:
1. `order-service` có Thread Pool gồm 200 luồng Tomcat.
2. `catalog-service` bị nghẽn CSDL, mỗi request treo 60 giây không trả lời.
3. Nếu không có **Timeout**, cả 200 luồng của `order-service` nhanh chóng bị chiếm hết chờ `catalog-service` $\rightarrow$ `order-service` **tê liệt hoàn toàn**, thậm chí các API không hề liên quan đến `catalog-service` cũng chết theo $\rightarrow$ **Cascading Failure** lan ngược lên tới `api-gateway`!

### 10.2. Bộ tứ mẫu chịu lỗi (Resilience Patterns)

| Mẫu chịu lỗi | Giải quyết bài toán gì? | Lưu ý sống còn khi cấu hình |
| :--- | :--- | :--- |
| **Timeout** | Giới hạn thời gian chờ tối đa (ví dụ $2\text{s}$–$3\text{s}$), giải phóng luồng ngay khi hạ lưu treo. | Mọi lời gọi mạng (HTTP/DB/Redis) **bắt buộc** phải đặt cả `connectTimeout` và `readTimeout`. |
| **Retry + Exponential Backoff** | Tự động gọi lại khi gặp lỗi mạng thoáng qua (transient failure). | **CHỈ Retry các thao tác Idempotent** (như `GET` hoặc `POST` có `Idempotency-Key`)! Luôn thêm *jitter* để tránh **Retry Storm** đánh sập dịch vụ đang hồi phục. |
| **Circuit Breaker (Cầu dao điện)** | Ngắt mạch ngay lập tức (*Fail Fast*) khi tỷ lệ lỗi của dịch vụ đích vượt ngưỡng, giúp dịch vụ đích có thời gian thở và phục hồi. | Hoạt động theo máy trạng thái 3 bước: `CLOSED` $\to$ `OPEN` $\to$ `HALF_OPEN`. |
| **Bulkhead (Vách ngăn tàu thủy)** | Cô lập tài nguyên (Thread Pool hoặc Semaphore) cho từng dịch vụ đích riêng biệt. | Nếu `payment-service` bị chậm, chỉ khoang gọi `payment` bị đầy, không làm cạn luồng của khoang gọi `catalog-service`. |

#### Máy trạng thái của Circuit Breaker (Cầu dao điện)

```text
                    Tỷ lệ lỗi >= 50% (ví dụ 5/10 call lỗi)
   +---------+ ──────────────────────────────────────────────> +---------+
   | CLOSED  |                                                 |  OPEN   |
   | (Bình   |                                                 | (Ngắt!  |
   | thường) | <────────────────────────────────────────────── | Trả     |
   +---------+        Thử thành công                           | Fallback|
        ^                                                      | ngay!)  |
        |                                                      +---------+
        |                                                           |
        |              +-----------+   Hết thời gian chờ (VD: 15s)  |
        +──────────────| HALF_OPEN | <──────────────────────────────+
      Nếu thử ổn định  | (Cho qua  |
                       | vài call  | ──(Nếu vẫn lỗi)──> Quay lại OPEN!
                       | thăm dò)  |
                       +-----------+
```

### 10.3. Triển khai chuẩn với Resilience4j trong Spring Boot 3

```yaml
# order-service/src/main/resources/application.yml
resilience4j:
  circuitbreaker:
    instances:
      catalogService:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 10
        minimumNumberOfCalls: 5
        failureRateThreshold: 50          # Mở cầu dao nếu >= 50% request lỗi
        waitDurationInOpenState: 15s      # Ngắt trong 15 giây rồi chuyển HALF_OPEN
        permittedNumberOfCallsInHalfOpenState: 3
  retry:
    instances:
      catalogService:
        maxAttempts: 3
        waitDuration: 300ms
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
```

```java
@Service
public class CatalogIntegrationService {

    private final CatalogFeignClient catalogClient;

    public CatalogIntegrationService(CatalogFeignClient catalogClient) {
        this.catalogClient = catalogClient;
    }

    @CircuitBreaker(name = "catalogService", fallbackMethod = "getProductFallback")
    @Retry(name = "catalogService")
    public ProductSummaryDto fetchProductSafely(Long productId) {
        return catalogClient.getProductById(productId);
    }

    // Fallback chuẩn: cùng tham số + thêm Throwable ở cuối
    private ProductSummaryDto getProductFallback(Long productId, Throwable ex) {
        // Chiến lược Graceful Degradation: trả dữ liệu từ cache cục bộ hoặc báo trạng thái suy giảm có kiểm soát
        throw new ServiceDegradedException(
                "Catalog service is temporarily unavailable for product " + productId, ex);
    }
}
```

> **Cảnh báo thực tế về Fallback**: Không phải lúc nào cũng trả dữ liệu giả! Với thao tác đọc danh sách gợi ý sản phẩm, bạn có thể trả danh sách mặc định từ cache (*Graceful Degradation*). Nhưng với thao tác **thanh toán** hay **trừ tồn kho**, tuyệt đối không được "giả vờ thành công" — phải trả về lỗi `503 Service Unavailable` rõ ràng hoặc đẩy sang hàng đợi xử lý sau.

### 10.4. Góc nhìn trên nền tảng MAVIS
- **Thí nghiệm thực chiến trên MAVIS Studio (Step 4)**: Đây là chương gắn trực tiếp với màn demo ăn điểm nhất trước hội đồng! Khi sinh viên bấm **Stop** một container phụ thuộc (ví dụ `payment-service` hoặc `catalog-service`) trên MAVIS Studio:
  - Quan sát đồ thị **Before vs. After**: Tỷ lệ lỗi tăng lên, nhưng nhờ Timeout + Circuit Breaker, thời gian phản hồi của `order-service` vẫn giữ ở mức mili-giây (**Fail Fast**) thay vì treo cứng, và **Fallback** kích hoạt sạch sẽ!

### 10.5. Bài tập thực hành Lab 10
- Khởi chạy phiên Docker Runtime trên **MAVIS Studio (Step 3–4)**.
- Chụp Snapshot **Before** ở trạng thái hệ thống khỏe mạnh.
- Bấm **Stop** dịch vụ hạ lưu, gửi lưu lượng kiểm thử, chụp Snapshot **After**, đo độ trễ và tỷ lệ lỗi, rồi viết giải trình nguyên nhân hành vi quan sát được dựa trên cơ chế Timeout / Circuit Breaker / Fallback.

### 10.6. Ngân hàng Quiz Gate — Chương 10

**Câu 10.1**: Tại sao một dịch vụ hạ lưu bị **treo chậm (high latency)** thường gây sập dây chuyền (*Cascading Failure*) nghiêm trọng hơn cả khi nó bị tắt hẳn?
- A. Vì khi bị tắt hẳn, kết nối từ chối ngay (fail fast); còn khi treo chậm không đặt Timeout, các luồng (threads) của dịch vụ gọi bị chiếm giữ chờ đợi cho đến khi cạn sạch Thread Pool
- B. Vì khi dịch vụ bị tắt, JVM tự động sửa lại mã nguồn
- C. Vì lỗi chậm không bao giờ ghi vào file log
- D. Vì Docker không cho phép tắt container
> **Đáp án đúng: A.** *Giải thích*: Cạn kiệt tài nguyên (luồng, kết nối mạng) do chờ đợi vô hạn là nguyên nhân gốc rễ của Cascading Failure.

**Câu 10.2**: Trong **Circuit Breaker**, khi trạng thái đang là `OPEN` (mở mạch / ngắt cầu dao), các yêu cầu mới gọi tới dịch vụ đích sẽ được xử lý ra sao?
- A. Vẫn gửi bình thường tới dịch vụ đích và chờ 60 giây
- B. Bị chặn ngay lập tức (*Fail Fast*) và chuyển sang phương thức Fallback (hoặc trả lỗi ngay) mà không gửi yêu cầu qua mạng tới dịch vụ đang hỏng
- C. Tự động tăng gấp đôi số lần Retry
- D. Khởi động lại cơ sở dữ liệu PostgreSQL
> **Đáp án đúng: B.** *Giải thích*: Trạng thái `OPEN` vừa bảo vệ dịch vụ gọi khỏi bị treo, vừa cho dịch vụ đích thời gian hồi phục.

**Câu 10.3**: Khi cấu hình mẫu **Retry**, nguyên tắc an toàn nào sau đây là bắt buộc?
- A. Retry vô hạn lần với khoảng nghỉ 0ms cho mọi API
- B. Chỉ Retry trên các thao tác **Idempotent** (hoặc có `Idempotency-Key`), giới hạn số lần thử và dùng *Exponential Backoff + Jitter*
- C. Luôn Retry cả khi gặp lỗi `400 Bad Request` và `401 Unauthorized`
- D. Tắt hoàn toàn Timeout trước khi bật Retry
> **Đáp án đúng: B.** *Giải thích*: Retry lỗi `4xx` là vô nghĩa, còn Retry không idempotent có thể gây trừ tiền 2–3 lần; Backoff + Jitter tránh tạo bão Retry Storm.

**Câu 10.4**: Mẫu **Bulkhead** (vách ngăn tàu thủy) trong Resilience4j có tác dụng gì?
- A. Mã hóa đường truyền HTTPS giữa các dịch vụ
- B. Phân tách giới hạn tài nguyên (Thread Pool / Semaphore) theo từng dịch vụ đích để sự cố ở một phụ thuộc không làm cạn kiệt tài nguyên của các chức năng khác
- C. Tự động chia nhỏ cơ sở dữ liệu theo ngày
- D. Thay thế hoàn toàn Eureka Server
> **Đáp án đúng: B.** *Giải thích*: Giống các khoang kín nước trên tàu thủy, một khoang ngập nước sẽ không đánh chìm cả con tàu.

---

## CHƯƠNG 11: OBSERVABILITY TOÀN DIỆN (ACTUATOR HEALTH CHECK, LOGGING & OPENTELEMETRY TRACING)

- **Mã chương**: `JAVA-CH11` | **Học phần**: Module 4
- **Nguồn chuẩn**: `[R19]` Ch.11 (§11.3 *Designing Observable Services*, tr. 364–378); `[S16]` Ch.9 (*Use of Correlation ID for Service Calls*); `[F16]` Ch.7 (*Documentation and Understanding*) & Appendix A; `[STD]` OpenTelemetry & Spring Boot Actuator Docs.
- **Mục tiêu học tập**:
  1. Nắm vững **3 trụ cột của Observability**: **Logs**, **Metrics**, và **Distributed Traces**.
  2. Cấu hình **Spring Boot Actuator Health Checks** phân biệt rõ **Liveness Probe** và **Readiness Probe**.
  3. Hiểu cơ chế truyền ngữ cảnh **W3C Trace Context (`traceparent`)** trong **OpenTelemetry** (`Trace ID`, `Span ID`, `Parent Span ID`) để dựng lại chính xác chuỗi gọi runtime trên MAVIS.

### 11.1. Tại sao Microservices "mù" nếu không có Observability?

Trong Monolith, một yêu cầu chạy trong một tiến trình duy nhất — chỉ cần mở một file log là thấy toàn bộ stack trace. Trong Microservices, một cú nhấp chuột "Đặt hàng" đi xuyên qua `api-gateway` $\to$ `order-service` $\to$ `catalog-service` $\to$ `Kafka` $\to$ `notification-service`. Nếu khách báo *"đơn hàng bị chậm 5 giây hoặc lỗi 500"*, làm sao biết nút nào gây ra?

Câu trả lời là **3 trụ cột Observability (`[R19]` §11.3)**:

| Trụ cột | Cho bạn biết điều gì? | Công cụ chuẩn trong Java / MAVIS |
| :--- | :--- | :--- |
| **Logs (Nhật ký có cấu trúc)** | Sự kiện chi tiết đã xảy ra tại một thời điểm (kèm `traceId`, `spanId`, `serviceName` dạng JSON). | SLF4J + Logback JSON + Correlation/Trace ID |
| **Metrics (Chỉ số định lượng)** | Sức khỏe tổng thể theo thời gian: **RED Metrics** (*Rate* — lưu lượng req/s, *Errors* — tỷ lệ lỗi, *Duration* — độ trễ $p50, p95, p99$). | Spring Boot Actuator + Micrometer + OpenTelemetry / Prometheus |
| **Distributed Traces (Vết phân tán)** | Hành trình đầy đủ xuyên suốt nhiều dịch vụ của **một request cụ thể**, chỉ rõ từng chặng mất bao nhiêu mili-giây. | **OpenTelemetry (OTel) Java Agent / Micrometer Tracing + OTLP Collector** |

### 11.2. Health Check API: Liveness vs. Readiness (`[R19]` §11.3.1)

Mọi Microservice chuẩn đều phải cung cấp endpoint kiểm tra sức khỏe qua **Spring Boot Actuator**:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  endpoint:
    health:
      probes:
        enabled: true          # Bật sẵn /actuator/health/liveness và /readiness
      show-details: when_authorized
```

Phân biệt rõ 2 khái niệm cực hay bị hỏi khi bảo vệ:
- **Liveness Probe (`/actuator/health/liveness`)**: *"Tiến trình ứng dụng có còn sống không hay đã rơi vào deadlock/treo cứng?"* $\rightarrow$ Nếu thất bại, Docker/Kubernetes sẽ **khởi động lại (restart)** container.
- **Readiness Probe (`/actuator/health/readiness`)**: *"Dịch vụ đã sẵn sàng nhận traffic chưa (ví dụ: đã kết nối DB xong, đã nạp cache xong chưa)?"* $\rightarrow$ Nếu thất bại, LoadBalancer **tạm ngừng gửi request mới** vào container đó, nhưng **KHÔNG giết/restart** container.

### 11.3. OpenTelemetry Distributed Tracing hoạt động như thế nào?

Mỗi request đi vào API Gateway được cấp một **`Trace ID`** duy nhất. Mỗi bước xử lý tại một dịch vụ tạo ra một **`Span`** (có `Span ID`, thời gian bắt đầu, thời gian kết thúc, mã trạng thái HTTP/lỗi) và tham chiếu tới **`Parent Span ID`** của bước gọi nó.

Khi `order-service` gọi `catalog-service`, OpenTelemetry tự động chèn header chuẩn W3C `traceparent` vào HTTP request (và Kafka message header) để nối liền các mảnh ghép thành một cây nhân quả hoàn chỉnh:

```text
Trace ID: 4bf92f3577b34da6a3ce929d0e0e4736 (Tổng thời gian: 145 ms)
├── Span A [api-gateway: POST /api/v1/orders]                 |================== 145ms ==================|
    └── Span B [order-service: OrderController.create]          |=============== 130ms ================|
        ├── Span C [PostgreSQL: INSERT INTO orders]               |== 15ms ==|
        ├── Span D [catalog-service: POST .../reserve]                       |========= 85ms =========|
        │   └── Span E [PostgreSQL: UPDATE products]                            |==== 40ms ====|
        └── Span F [Kafka Produce: order.created]                                                      |= 12ms =|
```

#### Tích hợp Zero-Code Instrumentation trong Docker
Với **OpenTelemetry Java Agent (`opentelemetry-javaagent.jar`)**, ta không cần sửa hàng trăm file code mà chỉ cần gắn tham số JVM trong Docker:
```bash
java -javaagent:/opt/otel/opentelemetry-javaagent.jar \
     -Dotel.service.name=order-service \
     -Dotel.exporter.otlp.endpoint=http://otel-collector:4318 \
     -jar /app/app.jar
```

### 11.4. Góc nhìn trên nền tảng MAVIS
- **Step 3 (Live Runtime Observation)**: `MAVIS.Runner` tự động tiêm OpenTelemetry instrumentation vào Docker Compose stack của bài Lab, thu thập dữ liệu qua OTLP Collector, dựng **thứ tự nhân quả (Causal Order)** và chiếu trực tiếp lưu lượng sống, độ trễ và nút lỗi lên đồ thị 2D/3D!
- **So sánh Static vs. Runtime**: Sinh viên kiểm chứng trực tiếp xem cạnh nào tồn tại trong code tĩnh (Step 1) và cạnh nào thực sự chạy trong kịch bản HTTP thực tế (Step 3).

### 11.5. Bài tập thực hành Lab 11
- Khởi chạy phiên Runtime trong **MAVIS Step 3**.
- Gửi kịch bản tạo đơn hàng, mở khung **OpenTelemetry Trace Waterfall** để tìm: (1) `Trace ID` chung của cả luồng, (2) mối quan hệ `Parent Span -> Child Span`, và (3) nút dịch vụ chiếm tỷ trọng độ trễ cao nhất (bottleneck).

### 11.6. Ngân hàng Quiz Gate — Chương 11

**Câu 11.1**: Trong 3 trụ cột của Observability (*Logs, Metrics, Traces*), trụ cột nào cho phép lần theo hành trình và độ trễ từng bước của **một request cụ thể** đi xuyên qua nhiều Microservice?
- A. Application Metrics
- B. Distributed Tracing (với `Trace ID` và `Span ID`)
- C. Static Code Analysis
- D. Health Check Liveness
> **Đáp án đúng: B.** *Giải thích*: Distributed Tracing gắn chung một `Trace ID` xuyên suốt các dịch vụ và tách từng chặng thành các `Span` có quan hệ cha-con.

**Câu 11.2**: Sự khác biệt giữa **Liveness Probe** và **Readiness Probe** trong Spring Boot Actuator là gì?
- A. Liveness kiểm tra để quyết định có cần **restart** container bị treo hay không; Readiness kiểm tra xem container đã sẵn sàng **nhận traffic** từ LoadBalancer hay chưa
- B. Liveness chỉ chạy ở môi trường dev, Readiness chỉ chạy ở production
- C. Readiness sẽ xóa database khi kiểm tra thất bại
- D. Hai probe hoàn toàn giống nhau
> **Đáp án đúng: A.** *Giải thích*: Nếu service đang quá tải hoặc đang khởi động chậm (Readiness fail), hạ tầng chỉ cần tạm ngắt traffic vào nó thay vì giết/restart liên tục.

**Câu 11.3**: Nhóm chỉ số **RED Metrics** tiêu chuẩn để giám sát một Microservice gồm 3 đại lượng nào?
- A. RAM, Encryption, Disk
- B. Rate (lưu lượng yêu cầu/giây), Errors (tỷ lệ lỗi), Duration (độ trễ xử lý)
- C. Retry, Eureka, Docker
- D. Read, Edit, Delete
> **Đáp án đúng: B.** *Giải thích*: RED Metrics đo trực tiếp trải nghiệm của người dùng/client đối với từng service endpoint.

**Câu 11.4**: OpenTelemetry nối được `Span` ở `catalog-service` thành con của `Span` ở `order-service` nhờ cơ chế nào?
- A. Hai dịch vụ đọc chung một file tạm trên ổ cứng
- B. Truyền ngữ cảnh vết (Context Propagation) thông qua HTTP/Messaging header chuẩn W3C (`traceparent`)
- C. Tự động đoán dựa trên tên lớp Java
- D. Chạy cùng một cổng TCP 8080
> **Đáp án đúng: B.** *Giải thích*: Header `traceparent` mang theo `trace-id` và `parent-id` đi xuyên qua ranh giới mạng.

---

# 🚀 MODULE 5: ĐÓNG GÓI, KIỂM THỬ & VẬN HÀNH PRODUCTION-READY

---

## CHƯƠNG 12: ĐÓNG GÓI DOCKER COMPOSE, CHIẾN LƯỢC KIỂM THỬ & PRODUCTION-READINESS CHECKLIST

- **Mã chương**: `JAVA-CH12` | **Học phần**: Module 5
- **Nguồn chuẩn**: `[R19]` Ch.9–10 (*Testing Microservices*, tr. 292–347) & Ch.12 (*Deploying Microservices*, tr. 383–399); `[S16]` Ch.5 (*Microservice Deployment Using Containers*); `[F16]` Ch.3 (*Deployment Pipeline*), Ch.4 (*Scalability & Performance*) & Appendix A (*Production-Readiness Checklist*, tr. 75).
- **Mục tiêu học tập**:
  1. Viết **Multi-stage `Dockerfile`** tối ưu, an toàn (non-root user) và **`docker-compose.yml`** chuẩn xác (có `healthcheck`, `depends_on: condition: service_healthy`, tách mạng nội bộ).
  2. Áp dụng **Kim tự tháp kiểm thử Microservices** (Unit Test $\to$ Integration / Contract Test $\to$ Component Test $\to$ E2E Test).
  3. Đánh giá một Microservice đạt chuẩn vận hành thực tế theo **Production-Readiness Checklist** của Susan J. Fowler.

### 12.1. Đóng gói tối ưu với Multi-Stage Dockerfile (`[R19]` Ch.12)

Tuyệt đối không đóng gói cả JDK nặng nề, Maven và mã nguồn vào image chạy thật! Dùng **Multi-Stage Build** để image cuối cùng chỉ chứa **JRE 21 gọn nhẹ** + file `.jar` đã biên dịch, đồng thời chạy bằng **user không có quyền root** để bảo mật:

```dockerfile
# Stage 1: Build artifact bằng Maven + JDK 21
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /workspace
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests -B

# Stage 2: Runtime gọn nhẹ chỉ chứa JRE 21 + Non-root user
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder /workspace/target/*.jar app.jar
USER appuser

EXPOSE 8082
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:8082/actuator/health/readiness || exit 1

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
```

### 12.2. Điều phối cục bộ & Sandbox bằng `docker-compose.yml` chuẩn MAVIS

Một sai lầm rất phổ biến là dùng `depends_on` mặc định trong Docker Compose rồi thắc mắc sao `order-service` vẫn crash vì Database chưa khởi động xong. Lý do: `depends_on` mặc định chỉ đợi container **started**, KHÔNG đợi tiến trình Postgres bên trong **sẵn sàng nhận kết nối**!

Giải pháp chuẩn là kết hợp **`healthcheck` + `condition: service_healthy`**:

```yaml
services:
  catalog-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: catalog_db
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d catalog_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks: [mavis-net]

  catalog-service:
    build: ./catalog-service
    environment:
      DB_URL: jdbc:postgresql://catalog-db:5432/catalog_db
      EUREKA_URI: http://service-discovery:8761/eureka/
    depends_on:
      catalog-db:
        condition: service_healthy
      service-discovery:
        condition: service_healthy
    networks: [mavis-net]
    # Lưu ý cho MAVIS Studio Scale: KHÔNG gán cứng container_name hoặc host port cố định (vd: 8082:8082)
    # cho các service cần mở rộng replica (1 -> 8)! Chỉ phơi port cố định ở api-gateway!

networks:
  mavis-net:
    driver: bridge
```

> **Mẹo vàng thực chiến cho MAVIS Studio (`Scale 1 -> 8`)**: Nếu bạn viết `ports: ["8082:8082"]` hoặc `container_name: catalog-service` trong `docker-compose.yml`, lệnh `docker compose up --scale catalog-service=4` sẽ **lỗi ngay lập tức** vì 4 container không thể cùng chiếm 1 tên hay 1 cổng host! Chỉ phơi cổng host ở `api-gateway`; mọi service phía sau giao tiếp qua mạng nội bộ Docker (`expose`).

### 12.3. Kim tự tháp Kiểm thử Microservices (`[R19]` Ch.9–10)

```text
               /\
              /  \        End-to-End (E2E) Tests (Rất ít — chậm, dễ vỡ)
             /----\       Chạy toàn stack Docker, kiểm tra luồng nghiệp vụ chính
            /      \
           /--------\     Component Tests (Vừa phải)
          /          \    Test 1 service hoàn chỉnh (stub các service phụ thuộc ngoài)
         /------------\
        /              \  Integration & Consumer-Driven Contract Tests (Quan trọng!)
       /                \ Test JPA/Testcontainers + kiểm tra hợp đồng API giữa Caller & Provider
      /------------------\
     /                    \ Unit Tests (Nhiều nhất — cực nhanh, chạy mili-giây)
    /______________________\ Test Entity, Value Object, Service logic, Saga state (JUnit 5 + Mockito)
```

- **Consumer-Driven Contract Testing (`[R19]` §9.1.2)**: Thay vì phải bật cả 10 service để test xem `order-service` gọi `catalog-service` có bị lệch JSON hay không, đội tiêu thụ (`order-service`) viết bản hợp đồng mong đợi (*Contract*), và pipeline CI của `catalog-service` tự động chạy bản hợp đồng đó mỗi khi build để phát hiện sớm **Contract Drift**!

### 12.4. Production-Readiness Checklist (`[F16]` Ch.3, Ch.4 & Appendix A)

Trước khi một Microservice Java được phép lên môi trường Production (theo chuẩn Susan J. Fowler):
1. **Ổn định & Tin cậy (Stability & Reliability)**: Quy trình Git + Code Review + Automated CI test; Deployment Pipeline qua đủ 3 giai đoạn (*Staging $\to$ Canary 5–10% traffic $\to$ Production*); có Timeout, Circuit Breaker, Fallback và kế hoạch rollback nhanh.
2. **Mở rộng & Hiệu năng (Scalability & Performance)**: Nắm rõ nút thắt tài nguyên (CPU/RAM/DB connection pool); hỗ trợ scale ngang không trạng thái (*stateless*), tránh `container_name` và cổng cứng.
3. **Giám sát & Bảo mật (Observability & Security)**: Có `/actuator/health/liveness` & `/readiness`, structured logging kèm `traceId`, RED metrics, OTel tracing; không hard-code secret; chạy container bằng non-root user.
4. **Tài liệu & Hiểu hệ thống (Documentation & Understanding)**: Có sơ đồ kiến trúc C1–C3 cập nhật, danh sách endpoints/dependencies, và tài liệu xử lý sự cố (*On-call Runbook*).

### 12.5. Góc nhìn trên nền tảng MAVIS
- **Preflight Safety Check**: Trước khi khởi chạy Step 3, `MAVIS.Runner` kiểm tra tính hợp lệ của `docker-compose.yml` (cấm đặc quyền `privileged`, kiểm tra cấu hình healthcheck, giới hạn tài nguyên CPU/RAM và khả năng scale không xung đột cổng).
- **Step 4 — Nộp bài & Chấm Rubric (`WF-04`)**: Sinh viên tổng hợp đủ 4 chặng (Static C1–C3 & 3E $\to$ Reverse BFS & Quiz Gate $\to$ OTel Trace $\to$ MAVIS Studio Stop/Scale Before/After Snapshots + Giải trình lý thuyết) để giảng viên chấm điểm thang $0\text{–}10$ (đạt $> 5.0$ để `APPROVED` mở Lab kế tiếp).

### 12.6. Bài tập thực hành Lab 12 (Tổng kết khóa học)
- Kiểm tra toàn bộ `Dockerfile` và `docker-compose.yml` của kho mẫu theo **Production-Readiness Checklist**.
- Chạy kịch bản **Scale** một service chịu tải từ $1 \to 4$ instance trên **MAVIS Studio**, chụp Snapshot Before/After và so sánh độ trễ ($p95$) cũng như phân bố trace span trên các replica.

### 12.7. Ngân hàng Quiz Gate — Chương 12

**Câu 12.1**: Lợi ích cốt lõi của kỹ thuật **Multi-Stage Build** trong `Dockerfile` đối với Microservice Java là gì?
- A. Cho phép chạy đồng thời cả Java và Python trong cùng 1 container
- B. Giảm mạnh kích thước image và thu hẹp bề mặt tấn công vì image chạy thật chỉ chứa JRE và file `.jar` thành phẩm, không mang theo Maven, JDK hay mã nguồn
- C. Bỏ qua bước biên dịch mã nguồn Java
- D. Tự động tạo ra API Gateway
> **Đáp án đúng: B.** *Giải thích*: Image gọn nhẹ kéo về nhanh hơn, khởi động container nhanh hơn khi scale và an toàn hơn nhiều trên production.

**Câu 12.2**: Vì sao khi muốn scale một dịch vụ bằng lệnh `docker compose up --scale order-service=4`, ta **KHÔNG được** khai báo `ports: ["8083:8083"]` hay `container_name` cố định cho `order-service`?
- A. Vì Docker Compose không hỗ trợ mở port lớn hơn 8000
- B. Vì nhiều bản sao container trên cùng một máy chủ không thể dùng chung một tên duy nhất hay cùng chiếm một cổng host cố định, gây lỗi xung đột khi scale
- C. Vì OpenTelemetry chỉ theo dõi được 1 container duy nhất
- D. Vì Java không chạy được trên cổng 8083
> **Đáp án đúng: B.** *Giải thích*: Các service nội bộ chỉ nên dùng `expose` trong mạng nội bộ Docker và tiếp nhận lưu lượng cân bằng tải thông qua `api-gateway` hoặc Discovery.

**Câu 12.3**: Trong *Deployment Pipeline* chuẩn của Susan J. Fowler (*Production-Ready Microservices*), mục đích của giai đoạn **Canary** là gì?
- A. Triển khai thẳng bản build mới cho 100% người dùng ngay lập tức
- B. Đưa bản phát hành mới ra phục vụ một tỷ lệ nhỏ lưu lượng thật (khoảng $5\%\text{–}10\%$) để theo dõi lỗi và hiệu năng trước khi nhân rộng toàn bộ
- C. Xóa toàn bộ dữ liệu cũ của môi trường Staging
- D. Tắt toàn bộ bài Unit Test để deploy nhanh hơn
> **Đáp án đúng: B.** *Giải thích*: Canary giúp giới hạn bán kính ảnh hưởng (*blast radius*) nếu phiên bản mới có lỗi ẩn chỉ xuất hiện dưới lưu lượng thực tế.

**Câu 12.4**: Trong Kim tự tháp kiểm thử Microservices của Chris Richardson, loại kiểm thử nào giúp phát hiện sớm sự lệch hợp đồng JSON giữa dịch vụ gọi và dịch vụ cung cấp mà **không cần bật toàn bộ hệ thống**?
- A. End-to-End (E2E) Test
- B. Consumer-Driven Contract Test
- C. Manual UI Testing
- D. Chaos Engineering
> **Đáp án đúng: B.** *Giải thích*: Consumer-Driven Contract Test xác minh hợp đồng API nhanh, độc lập và ngăn chặn Contract Drift ngay trong pipeline CI.

---

# 📎 PHỤ LỤC CHUẨN HÓA TÍCH HỢP VÀO HỆ THỐNG MAVIS

## PHỤ LỤC A: BẢNG ÁNH XẠ 12 CHƯƠNG ↔ SÁCH GỐC ↔ 4 BƯỚC WORKSPACE MAVIS

| Chương | Chủ đề cốt lõi | Nguồn sách gốc | Điểm nhấn trên 4 Bước Workspace MAVIS |
| :---: | :--- | :--- | :--- |
| **01** | Monolith $\to$ Microservices & C4 (C1–C3) | `[R19]` Ch.1, `[S16]` Ch.1, `[F16]` Ch.1 | **Step 1**: Khám phá C1/C2/C3 & Quy tắc chặn UML tĩnh (`BR-05`) |
| **02** | DDD, Bounded Context & Aggregate | `[R19]` Ch.2 & Ch.5, `[S16]` Ch.3 | **Step 1**: Ranh giới dịch vụ & bằng chứng `file:line` |
| **03** | Java 21, Spring Boot 3 & Tầng C3 | `[S16]` Ch.2 & Ch.4, `[R19]` Ch.11 | **Step 1**: C3 (`Controller -> Service -> Repository`) & 3E Naming/Layering |
| **04** | Service Discovery (Eureka) & External Config | `[R19]` Ch.3 & Ch.11, `[S16]` Ch.4 | **Step 1 & 4**: Ánh xạ `application.yml`, Zero-Leak AI (`D2`), Scale động |
| **05** | API Gateway & Bảo mật JWT/RBAC | `[R19]` Ch.8 & Ch.11, `[S16]` Ch.6 | **Step 1 & 4**: C1/C2 Entry Point & kiểm chứng SPOF khi Stop Gateway |
| **06** | OpenFeign Sync IPC & Reverse BFS | `[R19]` Ch.3, `[S16]` Ch.9 | **Step 1 & 2**: `CALL_SITE` evidence, **Reverse BFS**, DFS 3 màu Cyclic |
| **07** | Database-per-Service, CQRS & Redis | `[R19]` Ch.1 & Ch.7, `[S16]` Ch.8, `[F16]` Ch.4 | **Step 1**: 3E Rule phát hiện `SHARED_DATABASE` trên C2 |
| **08** | Kafka Async, Idempotency & Outbox | `[R19]` Ch.3 & Ch.5 | **Step 3 & 4**: Stop Consumer, quan sát cô lập lỗi (không sập dây chuyền) |
| **09** | Saga Pattern & Compensation | `[R19]` Ch.4 | **Step 2 & 3**: Theo dõi luồng giao dịch & bù trừ khi bước giữa thất bại |
| **10** | Resilience4j (Timeout, Retry, CB, Bulkhead) | `[R19]` Ch.3, `[F16]` Ch.3, `[S16]` Ch.5 | **Step 4**: Stop hạ lưu trên MAVIS Studio, đo Fail-Fast & Fallback |
| **11** | Actuator Health Check & OpenTelemetry | `[R19]` Ch.11, `[S16]` Ch.9, `[F16]` Ch.7 | **Step 3**: Live OTel Traces/Spans/Metrics trên đồ thị 2D/3D |
| **12** | Docker Compose, Testing & Prod-Readiness | `[R19]` Ch.9,10,12, `[S16]` Ch.5, `[F16]` App.A | **Step 3 & 4**: Runner Preflight, Scale $1 \to 4$, Nộp gói 4 bước (`WF-04`) |

---

## PHỤ LỤC B: CẤU TRÚC JSON CHUẨN ĐỂ NẠP VÀO APP MAVIS (`java-csharp-v1.json`)

Khi chuyển đổi bộ giáo trình này thành dữ liệu nạp cho MAVIS (`BR-06` Quiz Gate & Curriculum Manifest), mỗi chương ánh xạ trực tiếp sang một phần tử JSON chuẩn hóa như sau:

```json
{
  "id": "java-ch06-sync-ipc-reverse-bfs",
  "track": "JAVA",
  "module": 2,
  "chapterOrder": 6,
  "phase": "COMMUNICATION",
  "title": "Giao tiếp đồng bộ (REST / OpenFeign), Hợp đồng API & Phân tích tác động Reverse BFS",
  "passPercent": 70,
  "objective": [
    "Triển khai giao tiếp liên dịch vụ bằng Spring Cloud OpenFeign kèm bằng chứng CALL_SITE.",
    "Tính được sự suy giảm độ khả dụng khi chuỗi gọi đồng bộ kéo dài.",
    "Vận dụng Cycle-Safe Reverse BFS và DFS 3 màu để xác định Direct/Indirect Callers và Cyclic Dependency."
  ],
  "sources": [
    "Chris Richardson - Microservices Patterns (Manning, 2019), Chapter 3",
    "Sourabh Sharma - Mastering Microservices with Java (Packt, 2016), Chapter 9",
    "MAVIS Architecture Specification - D2 & D4"
  ],
  "lesson": "<Nội dung Markdown phần 6.1 đến 6.5 của Chương 06>",
  "exercise": "<Nội dung Lab 06 gắn với Curated Reference Repo>",
  "questions": [
    {
      "id": "java-ch06-q1",
      "prompt": "Giả sử order-service gọi đồng bộ catalog-service, và catalog-service gọi đồng bộ pricing-service. Nếu mỗi dịch vụ có độ khả dụng 99% (0.99) và độc lập nhau, độ khả dụng tổng thể xấp xỉ bao nhiêu?",
      "options": ["99.00%", "97.03%", "100%", "33.00%"],
      "correctIndex": 1,
      "explanation": "Chuỗi gọi đồng bộ nối tiếp nhân xác suất hoạt động của từng mắt xích: 0.99^3 = 97.03%."
    }
  ]
}
```

---

## PHỤ LỤC C: CHECKLIST TIÊU CHUẨN CHO REPO GITHUB MẪU JAVA (BƯỚC TIẾP THEO)

Khi tạo bất kỳ kho mã nguồn mẫu chuẩn Java nào (như **Mộc Hương Shop phiên bản Curated Lab cho MAVIS**) để khớp 100% với bộ giáo trình 12 chương này, repo cần thỏa mãn đúng 10 tiêu chí sau:

- [ ] **1. Java 21 + Spring Boot 3.2+ + Spring Cloud 2023+**: Cấu trúc Maven sạch, rõ ràng tầng C3 (`Controller → Service → Repository`), DTO bằng Java 21 `record` có `@Valid` và `@RestControllerAdvice`.
- [ ] **2. Tối thiểu 4–6 Microservices rõ Bounded Context**: `service-discovery` (Eureka), `api-gateway` (Spring Cloud Gateway + JWT), `identity-service`, `catalog-service`, `order-service`, `notification-service` (tuỳ chọn `payment-service` cho demo Stop/Fallback).
- [ ] **3. Database-per-Service tuyệt đối**: Mỗi dịch vụ nghiệp vụ có database/schema PostgreSQL cục bộ riêng chạy trong Docker (không phụ thuộc Cloud DB bên ngoài để Runner chạy ổn định 100%).
- [ ] **4. Giao tiếp đồng bộ có `CALL_SITE` rõ ràng**: Ít nhất 1 cặp `@FeignClient` thật (`order-service -> catalog-service` hoặc `payment-service`) để MAVIS vẽ cạnh `SERVICE_HTTP_CALL` và chạy **Reverse BFS** có đủ `Direct Callers` & `Indirect Callers`.
- [ ] **5. Giao tiếp bất đồng bộ + Compensation**: Có Apache Kafka (`order.created`, `order.cancelled`), kiểm tra `Idempotency-Key` và có logic bù trừ hoàn kho (Saga Compensation).
- [ ] **6. Chịu lỗi bằng Resilience4j**: Gắn `@CircuitBreaker` + `@Retry` + `Fallback` rõ ràng cho ít nhất 1 lời gọi đồng bộ để demo **Stop Container** trên MAVIS Studio thấy ngay khác biệt.
- [ ] **7. Actuator Health Check chuẩn**: Mọi service bật `/actuator/health/liveness` và `/readiness` dùng cho Docker `healthcheck`.
- [ ] **8. Sẵn sàng OpenTelemetry & Scale `1 -> 8`**: Không hard-code `container_name` hay host port cố định ở các service nghiệp vụ; hỗ trợ biến môi trường OTLP.
- [ ] **9. Không phụ thuộc bên thứ 3 gây kẹt Sandbox**: Cắt sạch VNPay, Cloudinary, Gmail SMTP thật, Gemini API Key khỏi đường chạy chính (hoặc thay bằng stub/mock nội bộ).
- [ ] **10. Sạch Secret 100%**: Toàn bộ cấu hình nhạy cảm đọc qua biến môi trường `${...}`, có file `.env.example`, tuyệt đối không commit mật khẩu/API key thật lên GitHub.