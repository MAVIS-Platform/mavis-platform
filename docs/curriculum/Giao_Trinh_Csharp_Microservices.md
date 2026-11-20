# 📘 GIÁO TRÌNH CHUẨN: KIẾN TRÚC & PHÁT TRIỂN MICROSERVICES VỚI C# 12, .NET 8 VÀ ASP.NET CORE

> **Mã khóa học trong MAVIS**: `CSHARP-MS-V2`
>
> **Quy mô**: 5 Học phần (Modules) — 12 Chương chuẩn hóa — 48 Câu hỏi Quiz Gate (4 câu/chương)
>
> **Đối tượng**: Sinh viên Kỹ thuật Phần mềm năm cuối & Lập trình viên Backend C#/.NET xây dựng hệ thống phân tán Microservices chạy trong Docker Container
>
> **Ngưỡng qua cổng Quiz (`BR-06`)**: Đạt $\ge 70\%$ (tối thiểu $3/4$ câu đúng mỗi chương, hoặc $\ge 70\%$ tổng bài kiểm tra Lab) để mở khóa bước thực hành Docker Runtime & MAVIS Studio.

---

## 🎯 MỤC TIÊU KHÓA HỌC & NGUỒN TÀI LIỆU THAM KHẢO CHUẨN

Sau khi hoàn thành trọn bộ 12 chương của giáo trình này trên nền tảng **MAVIS**, người học có khả năng:

1. **Làm chủ tư duy kiến trúc .NET Microservices**: Phân biệt rõ ranh giới Monolith vs. Microservices, đọc hiểu **C4 Model (C1 Context, C2 Container, C3 Component)** và tách ranh giới nghiệp vụ bằng **Domain-Driven Design (DDD)** theo mô hình chuẩn `eShopOnContainers` của Microsoft.
2. **Xây dựng ASP.NET Core Web API chuẩn C3**: Thiết kế mã nguồn C# 12 / .NET 8 sạch với `record` DTO, **Dependency Injection Lifetime** (`Singleton`, `Scoped`, `Transient`) chuẩn xác, **EF Core DbContext** cô lập theo dịch vụ, **YARP API Gateway** và bảo mật **JWT Bearer / RBAC**.
3. **Phân tích tĩnh bằng Roslyn & Đánh giá tác động (Reverse BFS)**: Hiểu cách `MAVIS.Worker` (dùng **Roslyn SDK**) quét Solution `.sln`/`.csproj`, trích xuất bằng chứng `CALL_SITE` từ **Typed `HttpClient`**, phát hiện mùi kiến trúc 3E (*Shared Database*, *Captive Dependency*, *Cyclic Dependency*) và đọc đồ thị tác động ngược **Reverse BFS**.
4. **Vận hành Production-Ready**: Áp dụng **Event Bus (RabbitMQ / MassTransit)**, **Integration Event Log (Outbox)**, **Saga**, **Resilience (`Polly v8` / `Microsoft.Extensions.Http.Resilience`)**, **ASP.NET Core Health Checks**, **OpenTelemetry .NET** và đóng gói **Docker Multi-Stage + Compose** sẵn sàng Scale ($1 \to 8$ replica) trên **MAVIS Studio**.

### 📚 Bộ Tài Liệu Gốc Làm Chuẩn Biên Soạn

| Ký hiệu | Tài liệu gốc | Tác giả / Nhà xuất bản | Vai trò trong giáo trình |
| --- | --- | --- | --- |
| **\[MS24\]** | *.NET Microservices: Architecture for Containerized .NET Applications* (`eShopOnContainers` / `eShop` Architecture Guide) | Cesar de la Torre, Bill Wagner, Mike Rousos — Microsoft Learn | Xương sống kiến trúc C#/.NET: Containerized Microservices, API Gateway, DDD & CQRS, EF Core Data Sovereignty, `IHttpClientFactory`, Resilience, Event Bus, Health Checks, Testing. |
| **\[F16\]** | *Production-Ready Microservices* | Susan J. Fowler (O'Reilly, 2016) | Tiêu chuẩn độ ổn định (Stability), độ tin cậy (Reliability), khả năng mở rộng (Scalability), Observability & Production-Readiness Checklist. |
| **\[STD\]** | *C# 12 / .NET 8 LTS Official Docs, YARP, EF Core 8, C4 Model (Simon Brown), OpenTelemetry .NET* | Microsoft, C4 Model, CNCF | Chuẩn hóa cú pháp và thư viện hiện đại nhất trong hệ sinh thái .NET 8. |

> **Lưu ý hiện đại hóa công nghệ từ tài liệu \[MS24\] sang .NET 8 LTS**:
> * **API Gateway**: Các bản đời đầu của `eShopOnContainers` dùng **Ocelot**; từ .NET 8 (`eShop` hiện đại), Microsoft chuyển sang **YARP (Yet Another Reverse Proxy)** do chính đội .NET phát triển (hiệu năng cao, cấu hình linh hoạt). Giáo trình trình bày **YARP** làm chuẩn chính và đối chiếu nguyên lý với Ocelot.
> * **Resilience**: Thay cho `Microsoft.Extensions.Http.Polly` cũ (Polly v7), .NET 8 chuẩn hóa bằng **`Microsoft.Extensions.Http.Resilience`** xây dựng trên **Polly v8** (`AddStandardResilienceHandler()`).
> * **Web API & C# 12**: Dùng **Primary Constructors**, `record` DTO, `IExceptionHandler` (.NET 8) chuẩn hóa `ProblemDetails` RFC 7807, và hỗ trợ cả **Controller-based API** lẫn **Minimal API**.

---

## 🗺️ BẢN ĐỒ TỔNG THỂ 5 HỌC PHẦN — 12 CHƯƠNG

```
MODULE 1: NỀN TẢNG KIẾN TRÚC .NET MICROSERVICES & PHÂN TẦNG C3
 ├── Chương 01: Containerized .NET Microservices, Mô hình C4 (C1–C3) & Cấu trúc Solution (.sln/.csproj)
 ├── Chương 02: Domain-Driven Design (DDD), Bounded Context & CQRS trong .NET
 └── Chương 03: ASP.NET Core 8 Web API chuẩn C3, Dependency Injection Lifetime & Validation

MODULE 2: ĐỊNH TUYẾN BIÊN, BẢO MẬT & GIAO TIẾP ĐỒNG BỘ (SYNC IPC)
 ├── Chương 04: Service Discovery trong Docker/.NET & Externalized Configuration (IOptions Pattern)
 ├── Chương 05: API Gateway với YARP (Reverse Proxy) & Bảo mật JWT Bearer / RBAC
 └── Chương 06: Giao tiếp đồng bộ với IHttpClientFactory (Typed Client), Roslyn CALL_SITE & Reverse BFS

MODULE 3: DỮ LIỆU ĐỘC LẬP, EVENT BUS & GIAO DỊCH PHÂN TÁN
 ├── Chương 07: Database-per-Service với EF Core 8 DbContext, Shared DB Anti-Pattern & Redis Cache
 ├── Chương 08: Giao tiếp bất đồng bộ (Event Bus / RabbitMQ), Idempotency & Integration Event Outbox
 └── Chương 09: Giao dịch phân tán với Saga Pattern & Nhất quán cuối cùng (Eventual Consistency)

MODULE 4: KHẢ NĂNG CHỊU LỖI & GIÁM SÁT HỆ THỐNG (RESILIENCE & OBSERVABILITY)
 ├── Chương 10: Thiết kế .NET Microservice chịu lỗi với Polly v8 & Microsoft.Extensions.Http.Resilience
 └── Chương 11: Observability toàn diện (ASP.NET Core Health Checks, Serilog & OpenTelemetry .NET)

MODULE 5: ĐÓNG GÓI, KIỂM THỬ & VẬN HÀNH PRODUCTION-READY
 └── Chương 12: Docker Multi-Stage Build (.NET 8), Kiểm thử với WebApplicationFactory & Production-Readiness
```

---

# 🏛️ MODULE 1: NỀN TẢNG KIẾN TRÚC .NET MICROSERVICES & PHÂN TẦNG C3

## CHƯƠNG 01: CONTAINERIZED .NET MICROSERVICES, MÔ HÌNH C4 (C1–C3) & CẤU TRÚC SOLUTION

* **Mã chương**: `CSHARP-CH01` | **Học phần**: Module 1
* **Nguồn chuẩn**: `[MS24]` Ch.1 (*Microservices Architecture*) & Ch.4 (*Architecting Microservice and Container-Based Applications*); `[F16]` Ch.1 (*Microservices*); `[STD]` Simon Brown C4 Model.
* **Mục tiêu học tập**:
  1. Giải thích bản chất **Microservices đóng gói Container** trong hệ sinh thái .NET và vì sao mỗi microservice chỉ sở hữu một miền nghiệp vụ độc lập.
  2. Phân biệt rạch ròi 3 cấp độ cấu trúc tĩnh **C1 (Context)**, **C2 (Container)**, **C3 (Component)** đối với một Solution C#/.NET.
  3. Tổ chức cấu trúc thư mục `.sln` và các dự án `.csproj` sạch sẽ để cả lập trình viên lẫn bộ phân tích tĩnh **Roslyn (`MAVIS.Worker`)** đọc hiểu chính xác.

### 1.1. Bản chất Containerized Microservices theo chuẩn Microsoft (`[MS24]`)

Trong hướng dẫn kiến trúc chính thức của Microsoft (`eShopOnContainers`), một hệ thống Microservices .NET không phải là một ứng dụng ASP.NET Core lớn chia thành nhiều thư mục (`Folder`), mà là **tập hợp các tiến trình thực thi độc lập (Autonomous Processes)**, mỗi tiến trình là một dự án Web API (`.csproj`) được đóng gói vào **Docker Container riêng**, triển khai độc lập, mở rộng (scale) độc lập và **sở hữu cơ sở dữ liệu riêng**.

So sánh nhanh 3 mô hình phổ biến trong .NET:

| Tiêu chí | Monolithic ASP.NET Core | Modular Monolith | .NET Microservices |
| --- | --- | --- | --- |
| **Đơn vị triển khai** | 1 tiến trình Web App duy nhất | 1 tiến trình, chia rõ các module Class Library độc lập | Nhiều tiến trình Web API độc lập (mỗi service 1 container) |
| **Cơ sở dữ liệu** | 1 `DbContext` chung toàn hệ thống | 1 DB chia nhiều schema riêng biệt | **Database-per-Service** (mỗi service sở hữu DB/Cache riêng) |
| **Scale theo nút thắt** | Phải nhân bản cả ứng dụng | Phải nhân bản cả ứng dụng | Scale chọn lọc đúng service chịu tải cao (ví dụ `Catalog.API` $1 \to 4$) |
| **Độ phức tạp vận hành** | Thấp — lý tưởng cho dự án nhỏ | Trung bình — bước đệm rất tốt | Cao — đòi hỏi Docker, Resilience, Event Bus, Observability |

> **Lời khuyên thực chiến của Microsoft (`[MS24]` Ch.4)**: Nếu ứng dụng mới khởi đầu và đội ngũ nhỏ, đừng ép tách 15 microservice ngay từ tuần đầu. Hãy thiết kế **3–4 dịch vụ cốt lõi rõ ràng theo miền nghiệp vụ** (như `Catalog.API`, `Basket.API`, `Ordering.API`, `ApiGateway`) — đủ tinh gọn để vận hành, nhưng thể hiện trọn vẹn bản chất phân tán.

### 1.2. Ánh xạ Mô hình C4 (C1–C3) sang hệ sinh thái C# / .NET

Để quản lý kiến trúc rõ ràng và không bị rối, mỗi tầng C4 tương ứng trực tiếp với một đơn vị kỹ thuật trong .NET:

```
[C1: System Context]   Tác nhân bên ngoài (Customer, Admin) <---> Hệ thống E-Commerce .NET
        |
        v (Phóng to thành các Container chạy độc lập)
[C2: Container]        Các dự án thực thi (.csproj / Docker Container) & Data Store:
                       - ApiGateway (YARP)
                       - Catalog.API      --> PostgreSQL (catalog_db)
                       - Basket.API       --> Redis (basket_cache)
                       - Ordering.API     --> PostgreSQL (ordering_db)
                       - RabbitMQ (Event Bus)
        |
        v (Phóng to bên trong 1 dự án .csproj)
[C3: Component]        Các lớp nghiệp vụ C# bên trong 1 service:
                       - OrdersController / OrderEndpoints
                       - OrderService (hoặc MediatR CommandHandler)
                       - CatalogHttpClient (Typed HttpClient)
                       - OrderingDbContext / OrderRepository
```

* **Nguyên tắc C4 của MAVIS (`BR-05`)**: Phân tích tĩnh mã nguồn C# bằng Roslyn chỉ xuất 4 góc nhìn cấu trúc (`C4_CONTEXT`, `C4_CONTAINER`, `C4_COMPONENT`, `DEPENDENCY_GRAPH`), **chặn sinh UML hành vi tĩnh** (`Sequence`, `Activity`, `State`) vì hành vi theo thời gian phải thu từ **OpenTelemetry Spans** lúc chạy thật.

### 1.3. Tổ chức Solution (`.sln`) sạch cho hệ thống Microservices .NET

Một lỗi rất thường gặp ở sinh viên C# là tạo một thư viện dùng chung `SharedDomain.csproj` nhét toàn bộ Entity và `DbContext` vào rồi tham chiếu chéo khắp nơi — biến hệ thống thành **Distributed Monolith**. Chuẩn đúng là chỉ chia sẻ những mảnh hạ tầng thuần kỹ thuật (*BuildingBlocks* như `EventBus.Abstractions`, `ServiceDefaults`), tuyệt đối **KHÔNG chia sẻ Entity hay DbContext giữa các service**:

```
MyShop.Microservices.sln
├── src/
│   ├── BuildingBlocks/
│   │   └── EventBus.Contracts/        # Chỉ chứa Integration Event DTO tối giản (record)
│   ├── Gateways/
│   │   └── ApiGateway/                # YARP Reverse Proxy + JWT Auth (ApiGateway.csproj)
│   └── Services/
│       ├── Catalog/
│       │   └── Catalog.API/           # Bounded Context Danh mục + CatalogDbContext
│       ├── Basket/
│       │   └── Basket.API/            # Bounded Context Giỏ hàng + Redis
│       └── Ordering/
│           └── Ordering.API/          # Bounded Context Đặt hàng + OrderingDbContext
└── docker-compose.yml
```

### 1.4. Góc nhìn trên nền tảng MAVIS (`MAVIS.Worker` — Roslyn SDK)

Khác với cách đọc regex thô sơ dễ đoán nhầm, **`MAVIS.Worker`** biên dịch cây cú pháp và mô hình ngữ nghĩa (**SyntaxTree + SemanticModel**) của **Microsoft Roslyn SDK** trên từng file `.csproj`:
* Nhận diện tự động dự án Web API (`Microsoft.NET.Sdk.Web`) $\rightarrow$ ánh xạ thành nút **C2 Container**.
* Phân tích các lớp kế thừa `ControllerBase`, Minimal API `MapGet/MapPost`, lớp kế thừa `DbContext`, và các lời gọi `HttpClient` $\rightarrow$ dựng sơ đồ **C3 Component** kèm bằng chứng `file:line`.

### 1.5. Bài tập thực hành Lab 01

* Mở một Solution .NET Microservices mẫu trên MAVIS ở **Step 1 (Static View)**.
* So sánh sự tương ứng giữa từng dự án `.csproj` trong Solution với các nút Container trên sơ đồ **C2 (`C4_CONTAINER`)**.
* Xác minh quy tắc không có dự án nào tham chiếu trực tiếp tới `DbContext` hay Entity của một Microservice khác.

### 1.6. Ngân hàng Quiz Gate — Chương 01

**Câu 1.1**: Theo tài liệu kiến trúc *.NET Microservices* của Microsoft (`eShopOnContainers`), đặc trưng quan trọng nhất giúp phân biệt Microservices với ứng dụng Monolithic chia nhiều thư mục là gì?
* A. Microservices viết bằng ngôn ngữ C# 12 còn Monolith viết bằng C# 7
* B. Mỗi Microservice là một tiến trình độc lập có vòng đời triển khai, mở rộng (scale) và sở hữu dữ liệu riêng biệt
* C. Microservices bắt buộc phải dùng chung một `DbContext` duy nhất để đảm bảo tốc độ
* D. Microservices không sử dụng giao thức HTTP

> **Đáp án đúng: B.** *Giải thích*: Độc lập về triển khai, mở rộng và quyền sở hữu dữ liệu (*autonomy & data sovereignty*) là bản chất cốt lõi của Microservices.

**Câu 1.2**: Trong sơ đồ **C2 (Container)** của C4 Model cho hệ thống .NET Microservices, thành phần nào sau đây được biểu diễn là một **Container**?
* A. Một phương thức `CalculateTotal()` bên trong lớp `Order`
* B. Một dịch vụ Web API chạy độc lập (như `Ordering.API`), một API Gateway (YARP), một cơ sở dữ liệu PostgreSQL hoặc một Redis instance
* C. Một thuộc tính `decimal Price` trong `record` DTO
* D. Một biến cục bộ trong `Program.cs`

> **Đáp án đúng: B.** *Giải thích*: Trong C4 Model, Container là đơn vị thực thi hoặc lưu trữ dữ liệu chạy độc lập; lớp/thành phần code nằm ở tầng C3 (Component).

**Câu 1.3**: Tại sao việc tạo một project `SharedModels.csproj` chứa toàn bộ Entity và `DbContext` dùng chung cho tất cả các .NET Microservice là một **Anti-Pattern**?
* A. Vì trình biên dịch C# không hỗ trợ tham chiếu giữa hai file `.csproj`
* B. Vì nó tạo ra khớp nối chặt (*tight coupling*) — thay đổi một cột dữ liệu ở một service sẽ ép toàn bộ các service khác phải sửa, biên dịch lại và triển khai đồng loạt (Distributed Monolith)
* C. Vì Docker không thể build Solution có hơn 2 project
* D. Vì Entity Framework Core chỉ chạy được trong project tên `Program`

> **Đáp án đúng: B.** *Giải thích*: Chia sẻ mô hình dữ liệu miền xuyên service phá hủy tính tự chủ của từng Bounded Context.

**Câu 1.4**: Bộ phân tích tĩnh C# của MAVIS (`MAVIS.Worker`) sử dụng công nghệ nào để hiểu chính xác cấu trúc mã nguồn, kiểu dữ liệu và vị trí dòng gọi API (`file:line`)?
* A. Đọc văn bản bằng biểu thức chính quy (Regex) thuần túy
* B. **Microsoft Roslyn SDK** (phân tích cây cú pháp `SyntaxTree` và mô hình ngữ nghĩa `SemanticModel`)
* C. Chụp ảnh màn hình giao diện Visual Studio
* D. Chỉ đọc file `README.md` của kho mã nguồn

> **Đáp án đúng: B.** *Giải thích*: Roslyn là nền tảng biên dịch chính chủ của C#, cho phép trích xuất chính xác symbol, kiểu trả về, route và điểm gọi `CALL_SITE` mà không suy đoán bừa.

---

## CHƯƠNG 02: DOMAIN-DRIVEN DESIGN (DDD), BOUNDED CONTEXT & CQRS TRONG .NET

* **Mã chương**: `CSHARP-CH02` | **Học phần**: Module 1
* **Nguồn chuẩn**: `[MS24]` Ch.5 (*Design a Microservice-Oriented Application*) & Ch.7 (*Design a DDD-Oriented Microservice*).
* **Mục tiêu học tập**:
  1. Phân biệt rõ khi nào một .NET Microservice chỉ cần **CRUD đơn giản** và khi nào nên áp dụng **DDD + CQRS** (không áp dụng máy móc).
  2. Xây dựng đúng **Bounded Context**, **Aggregate Root**, **Value Object**, **Domain Event** bằng C# 12 hiện đại.
  3. Tránh bẫy **Anemic Domain Model** (mô hình miền rỗng tuếch chỉ toàn getter/setter) ở các dịch vụ nghiệp vụ cốt lõi.

### 2.1. Không phải Microservice nào cũng cần DDD phức tạp! (`[MS24]` Ch.7)

Một điểm cực kỳ thực tế và giá trị trong sách của Microsoft (`[MS24]` Ch.7) là sự **tỉnh táo kiến trúc**:

```
+------------------------------------------+     +------------------------------------------+
|     DATA-DRIVEN CRUD MICROSERVICE        |     |     DDD & CQRS MICROSERVICE              |
|     (Ví dụ: Catalog.API, Basket.API)     |     |     (Ví dụ: Ordering.API)                |
|                                          |     |                                          |
|  - Nghiệp vụ đơn giản (đọc/ghi/lọc).     |     |  - Nghiệp vụ phức tạp, nhiều trạng thái  |
|  - Cấu trúc gọn nhẹ: Controller/Endpoint |     |    và quy tắc bất biến (invariants).     |
|    -> Service -> EF Core DbContext.      |     |  - Tách tầng Domain, Application, Infra. |
|  - KHÔNG cần vẽ vời Aggregate/CQRS thừa! |     |  - Dùng Aggregate Root, Value Object,    |
|                                          |     |    Command/Query tách bạch.              |
+------------------------------------------+     +------------------------------------------+
```

> **Bài học Senior**: Nếu `Catalog.API` chỉ làm thêm/sửa/xóa/tìm kiếm mặt hàng, áp dụng kiến trúc 2–3 lớp gọn nhẹ giúp code cực dễ đọc và bảo trì. Hãy dồn sức cho **DDD** tại dịch vụ lõi phức tạp như `Ordering.API`!

### 2.2. Bounded Context & Thiết kế Rich Domain Model trong C# 12

Mỗi Microservice đại diện cho một **Bounded Context**. Trong `Ordering.API`, khái niệm `Order` là một **Aggregate Root** bảo vệ toàn bộ tính bất biến (*invariants*) bên trong nó — tuyệt đối không phơi `public set;` bừa bãi để tầng ngoài muốn sửa trạng thái kiểu gì cũng được (lỗi *Anemic Domain Model*):

```csharp
namespace Ordering.API.Domain;

// Value Object bất biến bằng C# 12 record
public sealed record Address(string Street, string City, string District);

// Aggregate Root: Order kiểm soát toàn bộ thay đổi trạng thái và danh sách OrderItem
public sealed class Order
{
    private readonly List<OrderItem> _items = [];

    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }          // Tham chiếu bằng ID, KHÔNG giữ đối tượng Customer!
    public OrderStatus Status { get; private set; }
    public Address ShippingAddress { get; private set; } = default!;
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();
    public decimal TotalAmount => _items.Sum(i => i.UnitPrice * i.Quantity);

    private Order() { } // Dành cho EF Core

    public static Order CreateDraft(Guid customerId, Address address)
    {
        if (customerId == Guid.Empty)
            throw new DomainException("CustomerId is required.");

        return new Order
        {
            Id = Guid.NewGuid(),
            CustomerId = customerId,
            ShippingAddress = address,
            Status = OrderStatus.Submitted
        };
    }

    public void AddItem(int productId, string productNameSnapshot, decimal unitPrice, int quantity)
    {
        if (Status != OrderStatus.Submitted)
            throw new DomainException("Cannot add items to a processed order.");
        if (unitPrice <= 0 || quantity <= 0)
            throw new DomainException("Price and quantity must be greater than zero.");

        var existing = _items.FirstOrDefault(x => x.ProductId == productId);
        if (existing is not null)
        {
            existing.AddUnits(quantity);
            return;
        }
        _items.Add(new OrderItem(productId, productNameSnapshot, unitPrice, quantity));
    }

    public void MarkAsConfirmed()
    {
        if (_items.Count == 0)
            throw new DomainException("Cannot confirm an empty order.");
        Status = OrderStatus.Confirmed;
    }

    public void Cancel(string reason)
    {
        if (Status == OrderStatus.Shipped)
            throw new DomainException("Cannot cancel an order that has already shipped.");
        Status = OrderStatus.Cancelled;
    }
}
```

### 2.3. CQRS nhẹ nhàng & hiệu quả trong .NET (`[MS24]` Ch.7)

Microsoft trình bày **CQRS (Command Query Responsibility Segregation)** ở cấp độ một Microservice rất dễ áp dụng:
* **Nhánh Ghi (Commands)**: Đi qua **Domain Model + EF Core `DbContext`** để đảm bảo chặt chẽ mọi quy tắc nghiệp vụ, ràng buộc bất biến và giao dịch nguyên tử (ví dụ `CreateOrderCommand`, `CancelOrderCommand`).
* **Nhánh Đọc (Queries)**: Không cần lôi nguyên cả Aggregate nặng nề với EF Change Tracker! Có thể dùng **EF Core `.AsNoTracking().Select(...)`** (projection thẳng ra `record` DTO) hoặc **Dapper** chạy câu SQL đọc tối ưu siêu nhanh.

```csharp
// Query đọc siêu nhẹ: Tắt EF Core Change Tracking và chiếu thẳng sang DTO record
public async Task<OrderSummaryDto?> GetOrderSummaryAsync(Guid orderId, CancellationToken ct)
{
    return await _dbContext.Orders
        .AsNoTracking()
        .Where(o => o.Id == orderId)
        .Select(o => new OrderSummaryDto(
            o.Id,
            o.Status.ToString(),
            o.Items.Sum(i => i.UnitPrice * i.Quantity),
            o.Items.Count))
        .FirstOrDefaultAsync(ct);
}
```

### 2.4. Góc nhìn trên nền tảng MAVIS

* Khi tách đúng Bounded Context và giữ chặt ranh giới Aggregate, đồ thị **C3 Component** của dịch vụ trên MAVIS hiện lên phân tầng rõ ràng (`Endpoints/Controllers` $\to$ `Services/Handlers` $\to$ `Domain / DbContext`), không bị dây nhợ đan chéo (*Spaghetti Dependencies*) và không vi phạm quy tắc 3E.

### 2.5. Bài tập thực hành Lab 02

* Phân loại các Microservice trong hệ thống bán hàng .NET mẫu: dịch vụ nào nên dùng **CRUD đơn giản**, dịch vụ nào nên dùng **DDD Aggregate**.
* Thiết kế 1 lớp **Aggregate Root** và 1 **Value Object** bằng C# `record`, đảm bảo toàn bộ thuộc tính đóng gói bằng `private set` và có ít nhất 2 quy tắc kiểm tra bất biến (*invariant checks*).

### 2.6. Ngân hàng Quiz Gate — Chương 02

**Câu 2.1**: Theo hướng dẫn kiến trúc .NET Microservices của Microsoft, ta nên áp dụng mô hình **DDD đầy đủ (Aggregate, Value Object, Domain Event)** cho dịch vụ nào?
* A. Bắt buộc cho mọi dịch vụ, kể cả dịch vụ tra cứu danh mục tĩnh đơn giản nhất
* B. Chỉ ưu tiên cho các dịch vụ có quy tắc nghiệp vụ phức tạp (như `Ordering.API`); các dịch vụ CRUD đơn giản nên dùng kiến trúc gọn nhẹ để tránh phức tạp hóa thừa thãi
* C. Chỉ áp dụng cho API Gateway
* D. Không bao giờ dùng DDD trong C#

> **Đáp án đúng: B.** *Giải thích*: Chọn kiến trúc phù hợp độ phức tạp của từng Bounded Context là nguyên tắc cốt lõi của Microsoft trong `eShopOnContainers`.

**Câu 2.2**: Hiện tượng **Anemic Domain Model** (mô hình miền rỗng) là gì?
* A. Một lớp thực thể chỉ chứa toàn thuộc tính `public get; set;` mà không có bất kỳ phương thức kiểm soát quy tắc nghiệp vụ hay tính bất biến nào
* B. Một lớp sử dụng `IReadOnlyCollection<T>`
* C. Một cơ sở dữ liệu có ít hơn 5 bảng
* D. Việc sử dụng `record` làm Value Object

> **Đáp án đúng: A.** *Giải thích*: Khi Entity chỉ là túi chứa dữ liệu có `public set`, bất kỳ nơi nào cũng có thể gán trạng thái sai nghiệp vụ (như `order.Status = Shipped` khi đơn chưa có mặt hàng nào).

**Câu 2.3**: Trong nhánh **Query (Đọc)** của mô hình CQRS với EF Core 8, tại sao nên gọi `.AsNoTracking()` kết hợp `.Select(...)` sang DTO?
* A. Để tắt cơ chế theo dõi thay đổi (*Change Tracker*) không cần thiết khi chỉ đọc dữ liệu, giúp giảm tiêu thụ RAM và tăng tốc độ truy vấn
* B. Vì EF Core không cho phép chạy `FirstOrDefaultAsync` nếu không có `.AsNoTracking()`
* C. Để tự động ghi đè dữ liệu vào cơ sở dữ liệu
* D. Để bỏ qua bước kiểm tra quyền bảo mật JWT

> **Đáp án đúng: A.** *Giải thích*: Change Tracker chỉ cần cho nhánh Command (cập nhật/xóa); tắt nó ở nhánh Query giảm đáng kể chi phí bộ nhớ và CPU.

**Câu 2.4**: Vì sao `Order.Items` trong Aggregate Root được phơi ra kiểu `IReadOnlyCollection<OrderItem>` thay vì `List<OrderItem>` có `public set`?
* A. Để ép mọi thao tác thêm/xóa mặt hàng phải đi qua phương thức `order.AddItem(...)` của Aggregate Root, đảm bảo các quy tắc bất biến luôn được kiểm tra
* B. Vì C# 12 không hỗ trợ `List<T>` trong class
* C. Vì `IReadOnlyCollection` tự động mã hóa dữ liệu JSON
* D. Vì EF Core không ánh xạ được danh sách riêng tư

> **Đáp án đúng: A.** *Giải thích*: Aggregate Root là người gác cổng duy nhất đảm bảo trạng thái hợp lệ cho toàn bộ cụm Aggregate.

---

## CHƯƠNG 03: ASP.NET CORE 8 WEB API CHUẨN C3, DEPENDENCY INJECTION LIFETIME & VALIDATION

* **Mã chương**: `CSHARP-CH03` | **Học phần**: Module 1
* **Nguồn chuẩn**: `[MS24]` Ch.6 (*Create a Simple Data-Driven CRUD Microservice*); `[STD]` ASP.NET Core 8 Docs (Dependency Injection, Minimal APIs vs. Controllers, `IExceptionHandler`).
* **Mục tiêu học tập**:
  1. Phân biệt chính xác 3 vòng đời **Dependency Injection (DI Lifetime)** trong .NET: `Singleton`, `Scoped`, `Transient` và tránh lỗi chí mạng **Captive Dependency**.
  2. Xây dựng API chuẩn C3 bằng **ASP.NET Core 8** (dùng `record` DTO, Validation, `CancellationToken`, `TypedResults` / `ActionResult<T>`).
  3. Xử lý lỗi tập trung theo chuẩn **RFC 7807 `ProblemDetails`** với **`IExceptionHandler`** của .NET 8.

### 3.1. Kiến trúc phân tầng C3 trong ASP.NET Core 8

Bên trong một dự án `.csproj` Web API chuẩn, luồng xử lý đi một chiều rõ ràng để dễ kiểm thử và để Roslyn trích xuất sơ đồ C3 sắc nét:

```
HTTP Request (JSON)
        |
        v
+----------------------------------------+
|  Controller / Minimal API Endpoint     |  <-- Routing, Validation, truyền CancellationToken,
|  (Presentation / Web Layer)            |      trả HTTP Status chuẩn (200, 201, 400, 404).
+----------------------------------------+
        | (DTO record)
        v
+----------------------------------------+
|  Application Service / Handler         |  <-- Điều phối nghiệp vụ, gọi Typed HttpClient,
|  (Business Logic Layer)                |      phát Integration Event, ánh xạ DTO.
+----------------------------------------+
        | (Domain Entity)
        v
+----------------------------------------+
|  EF Core DbContext / Repository        |  <-- Truy vấn & lưu trữ CSDL độc lập của service.
|  (Data Access / Infrastructure Layer)  |      KHÔNG trả trực tiếp Entity ra API!
+----------------------------------------+
```

### 3.2. Dependency Injection Lifetime & Bẫy "Captive Dependency"

Trong .NET, DI Container tích hợp sẵn là trái tim của ứng dụng. Nắm nhầm Lifetime là nguyên nhân gây bug khó tìm nhất trong các bài phỏng vấn và đồ án C#:

| Lifetime | Vòng đời đối tượng | Dùng cho thành phần nào? |
| --- | --- | --- |
| **`Transient`** | Tạo mới **mỗi lần** được yêu cầu inject. | Dịch vụ nhẹ, không trạng thái (*stateless*), mapper, validator. |
| **`Scoped`** | Tạo mới **1 lần cho mỗi HTTP Request** (dùng chung trong suốt request đó, tự `Dispose` khi xong). | **EF Core `DbContext`**, Repository, Application Service thao tác DB. |
| **`Singleton`** | Tạo **đúng 1 instance duy nhất** trong suốt vòng đời tiến trình ứng dụng. | Cache cấu hình, `IConnectionMultiplexer` (Redis), RabbitMQ Connection, `IOptions`. |

> **⚠️ BẪY CHÍ MẠNG — Captive Dependency**:
> **TUYỆT ĐỐI KHÔNG tiêm một dịch vụ `Scoped` (như `DbContext`) vào trong một dịch vụ `Singleton`!**
> Nếu làm vậy, `DbContext` (vốn **không thread-safe**) sẽ bị giữ sống mãi cùng Singleton và bị hàng trăm HTTP request dùng chung đồng thời $\rightarrow$ lập tức văng lỗi `InvalidOperationException` hoặc hỏng dữ liệu! (May mắn là từ .NET Core, chế độ `ValidateScopes` bật sẵn ở môi trường Development sẽ báo lỗi ngay khi khởi động).

### 3.3. Code mẫu chuẩn ASP.NET Core 8 (Controller, `record` DTO, `CancellationToken`, `IExceptionHandler`)

#### (a) DTO bất biến với Data Annotations Validation

```csharp
using System.ComponentModel.DataAnnotations;

public sealed record CreateCatalogItemRequest(
    [Required, StringLength(50)] string Sku,
    [Required, StringLength(150)] string Name,
    [Range(0.01, 100_000_000)] decimal UnitPrice,
    [Range(0, 100_000)] int AvailableStock,
    [Required] string Unit // Ví dụ: "kg", "box"
);

public sealed record CatalogItemResponse(
    int Id,
    string Sku,
    string Name,
    decimal UnitPrice,
    int AvailableStock,
    string Unit
);
```

#### (b) Controller chuẩn C3 với Primary Constructor (C# 12) & `CancellationToken`

```csharp
[ApiController]
[Route("api/v1/catalog/items")]
public sealed class CatalogItemsController(ICatalogService catalogService) : ControllerBase
{
    [HttpGet("{id:int}")]
    [ProducesResponseType(typeof(CatalogItemResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<CatalogItemResponse>> GetById(int id, CancellationToken ct)
    {
        var item = await catalogService.GetByIdAsync(id, ct);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    [ProducesResponseType(typeof(CatalogItemResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<CatalogItemResponse>> Create(
        [FromBody] CreateCatalogItemRequest request,
        CancellationToken ct)
    {
        var created = await catalogService.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
```

#### (c) Xử lý lỗi toàn cục chuẩn .NET 8 với `IExceptionHandler` (`ProblemDetails`)

```csharp
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, Exception exception, CancellationToken ct)
    {
        logger.LogError(exception, "Unhandled exception on {Path}", httpContext.Request.Path);

        var (statusCode, title) = exception switch
        {
            DomainException => (StatusCodes.Status409Conflict, "Business Rule Violation"),
            KeyNotFoundException => (StatusCodes.Status404NotFound, "Resource Not Found"),
            _ => (StatusCodes.Status500InternalServerError, "Internal Server Error")
        };

        httpContext.Response.StatusCode = statusCode;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = statusCode == 500 ? "An unexpected error occurred." : exception.Message,
            Instance = httpContext.Request.Path
        }, ct);

        return true;
    }
}
```

*(Đăng ký trong `Program.cs`: `builder.Services.AddExceptionHandler<GlobalExceptionHandler>(); builder.Services.AddProblemDetails();` và `app.UseExceptionHandler();`)*

### 3.4. Góc nhìn trên nền tảng MAVIS

* **`MAVIS.Worker` (Roslyn)**: Tự động đọc attribute `[ApiController]`, `[Route]`, `[HttpGet/Post/Put/Delete]` (hoặc Minimal API `MapGet/MapPost`), đọc constructor DI (`ICatalogService`, `CatalogDbContext`) để dựng đầy đủ đồ thị **C3 Component** và phát hiện cảnh báo nếu Controller tiêm thẳng `DbContext` vi phạm phân tầng.

### 3.5. Bài tập thực hành Lab 03

* Kiểm tra file `Program.cs` của một dịch vụ .NET 8: liệt kê tất cả các dịch vụ được đăng ký theo từng nhóm `AddSingleton`, `AddScoped`, `AddTransient` và giải thích lý do chọn vòng đời tương ứng.
* Soi tầng C3 trên MAVIS để kiểm tra tính sạch của phân tầng `Controller -> Service -> DbContext`.

### 3.6. Ngân hàng Quiz Gate — Chương 03

**Câu 3.1**: Vòng đời Dependency Injection (Lifetime) mặc định và đúng chuẩn cho **EF Core `DbContext`** trong ASP.NET Core là gì?
* A. `Singleton`
* B. `Scoped` (một instance riêng cho mỗi HTTP Request)
* C. `Static` toàn cục
* D. Không được đăng ký `DbContext` vào DI Container

> **Đáp án đúng: B.** *Giải thích*: `DbContext` giữ trạng thái theo dõi thực thể (Change Tracker) và không an toàn đa luồng (*not thread-safe*), nên bắt buộc phải là `Scoped` theo từng request.

**Câu 3.2**: Lỗi **Captive Dependency** trong ASP.NET Core DI xảy ra trong tình huống nào?
* A. Khi một dịch vụ `Scoped` tiêm một dịch vụ `Singleton`
* B. Khi một dịch vụ **`Singleton`** tiêm trực tiếp một dịch vụ **`Scoped`** (như `DbContext`), khiến dịch vụ `Scoped` bị giữ sống vĩnh viễn và dùng chung sai cách giữa các luồng
* C. Khi dùng `record` làm DTO
* D. Khi truyền `CancellationToken` vào phương thức `async`

> **Đáp án đúng: B.** *Giải thích*: Dịch vụ có vòng đời dài hơn (`Singleton`) không được "bắt giữ" trực tiếp dịch vụ có vòng đời ngắn hơn (`Scoped`).

**Câu 3.3**: Việc truyền **`CancellationToken`** từ Controller xuống Service và tới các truy vấn EF Core / `HttpClient` mang lại lợi ích thực tế gì?
* A. Tự động mã hóa chuỗi JSON trả về
* B. Khi client ngắt kết nối (đóng trình duyệt hoặc hết timeout), server lập tức hủy truy vấn DB/HTTP đang dở dang để giải phóng luồng và tài nguyên
* C. Tăng gấp đôi kích thước bộ nhớ RAM cấp cho container
* D. Bỏ qua bước kiểm tra Validation

> **Đáp án đúng: B.** *Giải thích*: Hủy sớm công việc không còn ai chờ giúp bảo vệ Database và ThreadPool dưới tải cao.

**Câu 3.4**: Trong .NET 8, cơ chế chuẩn hóa mới nào được khuyến nghị để xử lý ngoại lệ tập trung và trả về định dạng JSON **RFC 7807 `ProblemDetails`** mà không làm lộ stack trace?
* A. Viết `try-catch` lặp lại trong từng hàm Controller rồi trả về `ex.ToString()`
* B. Triển khai giao diện **`IExceptionHandler`** kết hợp `AddProblemDetails()` và `UseExceptionHandler()`
* C. Tắt hoàn toàn việc ném ngoại lệ trong C#
* D. Trả về HTTP `200 OK` cho mọi lỗi hệ thống

> **Đáp án đúng: B.** *Giải thích*: `IExceptionHandler` là chuẩn chính thức từ .NET 8 giúp tách gọn logic xử lý lỗi toàn cục và trả về `ProblemDetails` nhất quán.

---

# 🌐 MODULE 2: ĐỊNH TUYẾN BIÊN, BẢO MẬT & GIAO TIẾP ĐỒNG BỘ (SYNC IPC)

## CHƯƠNG 04: SERVICE DISCOVERY TRONG DOCKER / .NET & EXTERNALIZED CONFIGURATION

* **Mã chương**: `CSHARP-CH04` | **Học phần**: Module 2
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Service Discovery & Docker Networking*); `[F16]` Ch.3 (*Routing and Discovery*); `[STD]` ASP.NET Core Configuration & Options Pattern (`IOptions<T>`).
* **Mục tiêu học tập**:
  1. Hiểu cơ chế **Server-Side Service Discovery** qua **Docker Compose Embedded DNS** (chuẩn gọn nhẹ của hệ sinh thái .NET Container, không cần dựng thêm Eureka Server nặng nề).
  2. Cấu hình dịch vụ bên ngoài theo đúng thứ tự ưu tiên của **ASP.NET Core Configuration** (`appsettings.json` $\to$ Environment Variables).
  3. Áp dụng **Options Pattern (`IOptions<T>` + `ValidateDataAnnotations` + `ValidateOnStart`)** để phát hiện thiếu biến môi trường ngay lúc khởi động (Fail-Fast).

### 4.1. Service Discovery trong .NET Container: Sức mạnh của Docker DNS

Khác với hệ sinh thái Spring Cloud truyền thống hay dựng thêm một dịch vụ Eureka Server riêng, kiến trúc .NET Container hiện đại (`[MS24]` Ch.4) ưu tiên **Server-Side Discovery** có sẵn của nền tảng container (**Docker Compose DNS** khi chạy local/MAVIS Sandbox, và **Kubernetes Service DNS** khi chạy Production):

```
                    Mạng nội bộ Docker (mavis-net)
+--------------------+                          +------------------------+
|   Ordering.API     |  http://catalog-api:8080 |  Docker Embedded DNS   |
|  (Typed HttpClient)| -----------------------> |  catalog-api ->        |
+--------------------+                          |   172.20.0.4 (Replica1)|
                                                |   172.20.0.5 (Replica2)|
                                                +------------------------+
                                                      |           |
                                                      v           v
                                                [catalog-api#1] [catalog-api#2]
```

* **Ưu điểm lớn**: Mã nguồn C# hoàn toàn **không phụ thuộc thư viện Discovery ngoài** (không cần SDK đăng ký heartbeat). Chỉ cần gọi tên service trong `docker-compose.yml` (ví dụ `http://catalog-api:8080`), Docker DNS tự động phân giải và cân bằng tải Round-Robin giữa các replica đang chạy!
* *(Lưu ý nâng cao: Từ .NET 8/9, Microsoft bổ sung thêm `Microsoft.Extensions.ServiceDiscovery` dùng chung chuẩn cho cả Docker, Kubernetes và .NET Aspire).*

### 4.2. Externalized Configuration & Options Pattern (`IOptions<T>`)

Theo nguyên tắc 12-Factor App và `[MS24]`, **cùng một Docker Image `.NET` phải chạy được ở Dev, Staging và Production** chỉ bằng cách thay đổi biến môi trường.

Trong ASP.NET Core, biến môi trường dùng **dấu gạch dưới kép (`__`)** để ghi đè cấu hình lồng nhau trong `appsettings.json`:
* Trong `appsettings.json`: `"ServiceUrls": { "CatalogApi": "http://localhost:5001" }`
* Trong `docker-compose.yml`: `ServiceUrls__CatalogApi=http://catalog-api:8080`

#### Cấu hình mạnh kiểu (Strongly-Typed) kèm kiểm tra Fail-Fast lúc khởi động

Không bao giờ viết rải rác `Configuration["Jwt:Secret"]` khắp mã nguồn! Hãy dùng **Options Pattern** kèm `ValidateOnStart()`:

```csharp
public sealed class ServiceUrlOptions
{
    public const string SectionName = "ServiceUrls";

    [Required, Url]
    public string CatalogApi { get; init; } = string.Empty;

    [Required, Url]
    public string BasketApi { get; init; } = string.Empty;
}

// Trong Program.cs: Fail-Fast ngay lúc container khởi động nếu quên truyền biến môi trường!
builder.Services
    .AddOptions<ServiceUrlOptions>()
    .Bind(builder.Configuration.GetSection(ServiceUrlOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();
```

### 4.3. Góc nhìn trên nền tảng MAVIS

* **Khớp địa chỉ tĩnh**: `MAVIS.Worker` kết hợp đọc `appsettings.json` + `docker-compose.yml` để phân giải cấu hình URL (`ServiceUrls__CatalogApi` $\to$ nút `catalog-api`), giúp nối chính xác cạnh `SERVICE_HTTP_CALL` giữa các nút C2 mà không bị đứt đoạn.
* **An toàn Secret (`D2`)**: Tuyệt đối không đặt mật khẩu DB thật hay `Jwt__Secret` production trong `appsettings.json`; dùng User Secrets (`dotnet user-secrets`) ở local và biến môi trường `.env` trong Docker.

### 4.4. Bài tập thực hành Lab 04

* Kiểm tra file `appsettings.json` và `docker-compose.yml` của các dịch vụ .NET: xác nhận cách ghi đè cấu hình bằng dấu gạch dưới kép (`ConnectionStrings__DefaultConnection`, `ServiceUrls__CatalogApi`).
* Thử cấu hình `ValidateOnStart()` cho một lớp Options và quan sát ứng dụng báo lỗi rõ ràng ngay lúc start khi cố tình bỏ trống biến cấu hình bắt buộc.

### 4.5. Ngân hàng Quiz Gate — Chương 04

**Câu 4.1**: Trong môi trường Docker Compose của hệ thống .NET Microservices, tại sao `Ordering.API` có thể gọi `http://catalog-api:8080` mà không cần hard-code địa chỉ IP?
* A. Vì Docker Compose cung cấp sẵn **Embedded DNS (Server-Side Discovery)** tự động phân giải tên dịch vụ trong `docker-compose.yml` sang địa chỉ IP động của các container đang chạy
* B. Vì mọi container Docker đều dùng chung địa chỉ `127.0.0.1`
* C. Vì ASP.NET Core tự động dò quét tất cả các cổng trên Internet
* D. Vì Entity Framework Core tự gán IP cố định

> **Đáp án đúng: A.** *Giải thích*: Docker DNS giải quyết Service Discovery ở tầng hạ tầng, giúp mã nguồn .NET gọn sạch và tự cân bằng tải khi scale replica.

**Câu 4.2**: Để ghi đè khóa cấu hình lồng nhau `"ConnectionStrings": { "CatalogDb": "..." }` trong `appsettings.json` bằng biến môi trường trên Linux Docker container, ta đặt tên biến môi trường như thế nào?
* A. `ConnectionStrings.CatalogDb`
* B. `ConnectionStrings__CatalogDb` (dùng dấu gạch dưới kép `__`)
* C. `ConnectionStrings/CatalogDb`
* D. `ConnectionStrings->CatalogDb`

> **Đáp án đúng: B.** *Giải thích*: Hệ điều hành Linux/bash không hỗ trợ dấu hai chấm (`:`) ổn định trong tên biến môi trường, nên ASP.NET Core chuẩn hóa dùng hai dấu gạch dưới (`__`).

**Câu 4.3**: Lợi ích trực tiếp của việc gắn `.ValidateDataAnnotations().ValidateOnStart()` cho lớp `IOptions<T>` trong `Program.cs` là gì?
* A. Tự động sinh mật khẩu ngẫu nhiên cho cơ sở dữ liệu
* B. **Fail-Fast**: ứng dụng báo lỗi ngay lập tức lúc khởi động nếu thiếu hoặc sai định dạng biến môi trường, thay vì chạy ngầm rồi mới crash khi có khách gọi API
* C. Giảm kích thước file `.dll`
* D. Bỏ qua file `appsettings.json`

> **Đáp án đúng: B.** *Giải thích*: Phát hiện sai cấu hình ngay lúc khởi chạy container giúp tránh triển khai bản lỗi lên môi trường chạy thật.

**Câu 4.4**: Khi chạy ở máy cục bộ (Development), nơi nào an toàn nhất để lưu chuỗi kết nối hoặc `Jwt:Secret` mà **không bao giờ bị đẩy nhầm lên GitHub**?
* A. Ghi thẳng vào `appsettings.json` và commit lên nhánh `main`
* B. Dùng **Secret Manager (`dotnet user-secrets`)** hoặc file `.env` đã được khai báo trong `.gitignore`
* C. Ghi vào file `README.md`
* D. Hard-code thành `const string` trong `Program.cs`

> **Đáp án đúng: B.** *Giải thích*: `dotnet user-secrets` lưu cấu hình bí mật ở thư mục profile ngoài kho Git, tránh hoàn toàn rủi ro rò rỉ secret.

---

## CHƯƠNG 05: API GATEWAY VỚI YARP (REVERSE PROXY) & BẢO MẬT JWT BEARER / RBAC

* **Mã chương**: `CSHARP-CH05` | **Học phần**: Module 2
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*The API Gateway Pattern vs. Direct Client-to-Microservice Communication*) & Ch.11 (*Make Secure .NET Microservices*); `[STD]` Microsoft YARP Documentation & ASP.NET Core Authentication/Authorization.
* **Mục tiêu học tập**:
  1. Thiết kế **API Gateway / BFF** bằng **YARP (Yet Another Reverse Proxy)** — thư viện chính chủ Microsoft trên .NET 8.
  2. Cấu hình **Rate Limiting** tích hợp sẵn của ASP.NET Core 8 ngay tại lớp Gateway để chống quá tải.
  3. Triển khai bảo mật **Stateless JWT Bearer Authentication** và phân quyền **Policy-based / Role-based Authorization (RBAC)**.

### 5.1. API Gateway & BFF trong kiến trúc .NET (`[MS24]` Ch.4)

Tương tự nguyên lý chuẩn của kiến trúc phân tán, client (Web/Mobile) **không gọi thẳng** tới từng `.csproj` nội bộ mà đi qua một **API Gateway** (hoặc các **BFF** tách riêng cho Web và Mobile):
* Che giấu cấu trúc mạng và địa chỉ nội bộ của hàng loạt microservice.
* Thực hiện các tác vụ cắt ngang tại biên: **Routing**, **SSL Termination**, **CORS**, **Rate Limiting** và **Xác thực JWT sơ bộ**.
* Tránh **Single Point of Failure (SPOF)** bằng cách giữ Gateway hoàn toàn **stateless** (không lưu session trên RAM) để nhân bản nhiều bản sao dễ dàng.

```
[Web / Mobile Client]  (HTTPS + Authorization: Bearer <JWT>)
            |
            v
+-------------------------------------------------------------+
|            ApiGateway (.NET 8 + YARP Reverse Proxy)         |
|  - Route /api/v1/catalog/**   --> http://catalog-api:8080   |
|  - Route /api/v1/basket/**    --> http://basket-api:8080    |
|  - Route /api/v1/orders/**    --> http://ordering-api:8080  |
|  - Built-in Rate Limiter + JWT Authentication + CORS        |
+-------------------------------------------------------------+
       |                       |                       |
       v                       v                       v
  [Catalog.API]           [Basket.API]           [Ordering.API]
```

### 5.2. Cấu hình API Gateway cực gọn bằng YARP (.NET 8)

Chỉ cần cài gói NuGet `Yarp.ReverseProxy`, toàn bộ định tuyến được khai báo rõ ràng trong `appsettings.json`:

```json
{
  "ReverseProxy": {
    "Routes": {
      "catalog-route": {
        "ClusterId": "catalog-cluster",
        "Match": { "Path": "/api/v1/catalog/{**catch-all}" }
      },
      "basket-route": {
        "ClusterId": "basket-cluster",
        "AuthorizationPolicy": "AuthenticatedUser",
        "Match": { "Path": "/api/v1/basket/{**catch-all}" }
      },
      "ordering-route": {
        "ClusterId": "ordering-cluster",
        "AuthorizationPolicy": "AuthenticatedUser",
        "Match": { "Path": "/api/v1/orders/{**catch-all}" }
      }
    },
    "Clusters": {
      "catalog-cluster": {
        "Destinations": { "d1": { "Address": "http://catalog-api:8080" } }
      },
      "basket-cluster": {
        "Destinations": { "d1": { "Address": "http://basket-api:8080" } }
      },
      "ordering-cluster": {
        "Destinations": { "d1": { "Address": "http://ordering-api:8080" } }
      }
    }
  }
}
```

```csharp
// ApiGateway/Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("fixed", opt =>
    {
        opt.Window = TimeSpan.FromMinutes(1);
        opt.PermitLimit = 100;
    });
});

var app = builder.Build();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapReverseProxy().RequireRateLimiting("fixed");
app.Run();
```

### 5.3. Bảo mật JWT Bearer & Phân quyền RBAC (`[MS24]` Ch.11)

Trong ASP.NET Core 8, cơ chế bảo mật **Stateless JWT** kết hợp **Defense in Depth** (xác thực ở Gateway và kiểm tra quyền chi tiết ở từng Microservice):

```csharp
// Cấu hình xác thực JWT Bearer chuẩn trong Program.cs
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SigningKey"]!)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("AuthenticatedUser", p => p.RequireAuthenticatedUser())
    .AddPolicy("AdminOnly", p => p.RequireRole("Admin"));
```

Và tại tầng Endpoint/Controller của Microservice đích:
* `[Authorize]` $\rightarrow$ Yêu cầu có JWT hợp lệ (thiếu/sai trả **`401 Unauthorized`**).
* `[Authorize(Policy = "AdminOnly")]` $\rightarrow$ Đã đăng nhập nhưng sai vai trò trả **`403 Forbidden`**.
* **Kiểm tra quyền sở hữu tài nguyên (Resource-based Authorization)**: Khi khách xem đơn hàng `GET /api/v1/orders/{id}`, `Ordering.API` bắt buộc đối chiếu `order.CustomerId == currentUserId` để chống lỗ hổng **IDOR** (xem trộm đơn của người khác).

### 5.4. Góc nhìn trên nền tảng MAVIS

* **Trích xuất định tuyến YARP**: Phân hệ đọc cấu hình của MAVIS đọc phần `ReverseProxy.Routes` và `ReverseProxy.Clusters` để vẽ các cạnh từ `ApiGateway` tới các dịch vụ đích trên sơ đồ **C2 Container**.
* **Kiểm chứng trên MAVIS Studio**: Tắt `ApiGateway` sẽ chặn toàn bộ điểm vào từ client ngoài — bài thực hành kinh điển để phân tích tính sẵn sàng cao (*High Availability*).

### 5.5. Bài tập thực hành Lab 05

* Kiểm tra các Route & Cluster trong `ApiGateway/appsettings.json` trên MAVIS và đối chiếu với sơ đồ C2.
* Giải thích tại sao `catalog-route` (xem danh mục sản phẩm công khai) không bắt buộc `AuthorizationPolicy`, trong khi `ordering-route` bắt buộc `AuthenticatedUser` và kiểm tra thêm quyền sở hữu đơn hàng ở `Ordering.API`.

### 5.6. Ngân hàng Quiz Gate — Chương 05

**Câu 5.1**: Trong hệ sinh thái .NET 8 hiện đại của Microsoft, thư viện chính chủ nào được khuyến nghị sử dụng để xây dựng API Gateway / Reverse Proxy hiệu năng cao?
* A. Entity Framework Core
* B. **YARP (Yet Another Reverse Proxy)**
* C. WinForms
* D. SignalR Hub

> **Đáp án đúng: B.** *Giải thích*: YARP do chính đội .NET phát triển, tích hợp sâu với middleware ASP.NET Core 8 (Auth, Rate Limiting, OpenTelemetry) và đã thay thế Ocelot trong mẫu `eShop` hiện đại.

**Câu 5.2**: Khi bật **Rate Limiter** tại API Gateway và một client gửi vượt quá số yêu cầu cho phép trong cửa sổ thời gian, mã trạng thái HTTP chuẩn mực nào cần trả về?
* A. `200 OK`
* B. `404 Not Found`
* C. `429 Too Many Requests`
* D. `502 Bad Gateway`

> **Đáp án đúng: C.** *Giải thích*: `429 Too Many Requests` thông báo chính xác rằng client đang gọi quá giới hạn tần suất cho phép.

**Câu 5.3**: Hành động kiểm tra `order.CustomerId == currentUserId` bên trong `Ordering.API` giúp ngăn chặn lỗ hổng bảo mật nào?
* A. SQL Injection
* B. **IDOR (Insecure Direct Object Reference / Broken Object Level Authorization)** — người dùng đã đăng nhập cố tình đoán ID để xem hoặc hủy đơn hàng của người khác
* C. Cross-Site Scripting (XSS)
* D. Deadlock cơ sở dữ liệu

> **Đáp án đúng: B.** *Giải thích*: JWT chỉ chứng minh bạn là ai; dịch vụ nghiệp vụ vẫn phải kiểm tra bạn có quyền sở hữu tài nguyên cụ thể đó hay không.

**Câu 5.4**: Tại sao API Gateway không nên chứa logic nghiệp vụ phức tạp (như tính tồn kho hay lưu hóa đơn)?
* A. Vì YARP không cho phép viết thêm code C#
* B. Vì nhồi nghiệp vụ vào Gateway tạo ra khớp nối chặt giữa mọi dịch vụ, biến Gateway thành nút thắt cổ chai và một "Monolith mới"
* C. Vì API Gateway không thể chạy trong Docker
* D. Vì trình duyệt không hỗ trợ HTTPS qua Gateway

> **Đáp án đúng: B.** *Giải thích*: Gateway chỉ nên xử lý *cross-cutting concerns* (routing, auth, rate limit, tracing) để giữ ranh giới Bounded Context sạch sẽ.

---

## CHƯƠNG 06: GIAO TIẾP ĐỒNG BỘ VỚI `IHttpClientFactory` (TYPED CLIENT), ROSLYN `CALL_SITE` & REVERSE BFS

* **Mã chương**: `CSHARP-CH06` | **Học phần**: Module 2
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Communication in a Microservice Architecture*) & Ch.8 (*Use `IHttpClientFactory` to Implement Resilient HTTP Requests*); MAVIS Specification (`D2` Epistemic Honesty & `D4` Cycle-Safe Reverse BFS).
* **Mục tiêu học tập**:
  1. Hiểu vì sao khởi tạo `new HttpClient()` thủ công trong vòng lặp/request gây ra thảm họa **Socket Exhaustion** và **DNS Stale**.
  2. Triển khai giao tiếp đồng bộ chuẩn mực bằng **`IHttpClientFactory` + Typed `HttpClient`** (kèm so sánh khi nào nên cân nhắc **gRPC**).
  3. Hiểu cách **Roslyn** trích xuất bằng chứng `CALL_SITE` từ Typed Client và vận dụng **Cycle-Safe Reverse BFS + DFS 3 màu** để phân tích tác động thay đổi.

### 6.1. Tại sao KHÔNG ĐƯỢC viết `using var client = new HttpClient()`? (`[MS24]` Ch.8)

Đây là sai lầm số 1 của lập trình viên C# khi viết Microservices:
1. **Socket Exhaustion (Cạn kiệt cổng mạng)**: Khi bạn bọc `new HttpClient()` trong `using`, dù đối tượng C# đã `Dispose()`, socket TCP phía hệ điều hành vẫn bị giữ ở trạng thái `TIME_WAIT` trong $60\text{–}240$ giây. Dưới tải cao, máy chủ nhanh chóng hết sạch cổng kết nối và chết hàng loạt với `SocketException`!
2. **Stale DNS (Nếu dùng 1 `static HttpClient` duy nhất)**: Một `static HttpClient` giữ kết nối sống mãi nên không nhận ra địa chỉ IP mới khi container đích trong Docker/Kubernetes khởi động lại hoặc scale!

**Giải pháp chính chủ của Microsoft: `IHttpClientFactory` + Typed Client**:
* Quản lý một hồ (pool) `HttpMessageHandler` tái sử dụng socket thông minh và tự động xoay vòng định kỳ (mặc định 2 phút) để luôn cập nhật DNS mới.
* Tích hợp mượt mà với **Polly v8 Resilience** (Chương 10) và **OpenTelemetry Tracing** (Chương 11).

### 6.2. Triển khai Typed `HttpClient` chuẩn .NET 8 (Tối ưu cho Roslyn `CALL_SITE`)

```csharp
// Ordering.API/Clients/CatalogApiClient.cs
public interface ICatalogApiClient
{
    Task<CatalogItemDto?> GetItemAsync(int productId, CancellationToken ct);
    Task<bool> ReserveStockAsync(int productId, int quantity, CancellationToken ct);
}

public sealed class CatalogApiClient(HttpClient httpClient) : ICatalogApiClient
{
    public async Task<CatalogItemDto?> GetItemAsync(int productId, CancellationToken ct)
    {
        var response = await httpClient.GetAsync($"/api/v1/catalog/items/{productId}", ct);
        if (response.StatusCode == HttpStatusCode.NotFound) return null;
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<CatalogItemDto>(ct);
    }

    public async Task<bool> ReserveStockAsync(int productId, int quantity, CancellationToken ct)
    {
        var payload = new ReserveStockRequest(quantity);
        var response = await httpClient.PostAsJsonAsync(
            $"/api/v1/catalog/items/{productId}/reserve", payload, ct);
        return response.IsSuccessStatusCode;
    }
}
```

Đăng ký trong `Ordering.API/Program.cs`:

```csharp
builder.Services.AddHttpClient<ICatalogApiClient, CatalogApiClient>((sp, client) =>
{
    var urls = sp.GetRequiredService<IOptions<ServiceUrlOptions>>().Value;
    client.BaseAddress = new Uri(urls.CatalogApi);
    client.Timeout = TimeSpan.FromSeconds(5);
});
```

> **Khi nào dùng gRPC thay cho REST/HTTP trong .NET (`[MS24]` Ch.4)?**
> Với giao tiếp nội bộ giữa hai Microservice cần băng thông cực nhỏ, độ trễ siêu thấp và hợp đồng kiểu mạnh (*strongly-typed Protobuf*), ASP.NET Core hỗ trợ **gRPC** trên HTTP/2 cực mạnh. Còn khi cần dễ đọc, dễ debug bằng trình duyệt/Postman và tương thích rộng, **REST/JSON qua Typed `HttpClient`** vẫn là lựa chọn tiêu chuẩn hàng đầu.

### 6.3. Độ khả dụng chuỗi gọi đồng bộ & Phân tích tác động Reverse BFS (`D2` & `D4`)

Mọi lời gọi đồng bộ giữa các service đều làm giảm độ khả dụng tổng thể theo công thức xác suất nối tiếp:

$$
A_{\text{total}} = \prod_{i=1}^{n} A_i
$$

Nếu `ApiGateway` $\to$ `Ordering.API` $\to$ `Catalog.API` cùng gọi đồng bộ và mỗi dịch vụ có độ khả dụng $99\%$ ($0.99$), độ khả dụng chuỗi chỉ còn $0.99^3 \approx 97.03\%$.

#### Cách MAVIS dùng Roslyn + Reverse BFS để bảo vệ kiến trúc:
1. **Bằng chứng `CALL_SITE` (`D2`)**: Roslyn tìm thấy đăng ký `AddHttpClient<ICatalogApiClient, CatalogApiClient>` gắn với `BaseAddress = CatalogApi` và điểm gọi thật `httpClient.PostAsJsonAsync("/api/v1/catalog/items/{productId}/reserve", ...)` tại `CatalogApiClient.cs:19` $\rightarrow$ xác nhận cạnh `SERVICE_HTTP_CALL` có bằng chứng đầy đủ (nếu chỉ có URL nằm trong `appsettings.json` mà không có code gọi, MAVIS gắn `NEEDS_REVIEW` / `UNVERIFIED_METADATA_ONLY`).
2. **Cycle-Safe Reverse BFS (`D4`)**: Khi bạn muốn thay đổi hợp đồng API của `Catalog.API`, thuật toán Reverse BFS (FIFO Queue + tập `visited`, độ phức tạp $O(|V| + |E|)$) duyệt ngược các cạnh gọi để liệt kê chính xác:
   * **`Direct Callers (hop = 1)`**: `Ordering.API`, `ApiGateway`
   * **`Indirect Callers (hop >= 2)`**: Các BFF/Client gọi qua `ApiGateway`
   * **`Isolated Nodes`**: Các nút không phụ thuộc `Catalog.API` (nếu một nút cô lập có 0 upstream callers, bán kính ảnh hưởng $= 1$, không lan truyền dây chuyền).
3. **Phát hiện phụ thuộc vòng bằng DFS 3 màu (`WHITE`, `GRAY`, `BLACK`)**: Tránh báo động giả trên đồ thị DAG hình thoi; chỉ kết luận có **Cyclic Dependency** khi gặp cạnh đi về đỉnh đang có màu `GRAY` (*back-edge*).

```
Đồ thị gọi xuôi (Call Graph):
  ApiGateway ──> Ordering.API ──> Catalog.API
      |               |                ^
      |               +──> Basket.API  |
      +────────────────────────────────+

Reverse BFS từ target = Catalog.API:
  - Hop 0 (Target)         : Catalog.API
  - Hop 1 (Direct Callers) : Ordering.API, ApiGateway
  - Isolated from target   : Basket.API (không gọi Catalog.API)
```

### 6.4. Góc nhìn trên nền tảng MAVIS

* **Step 1 & Step 2**: Khi dùng Typed `HttpClient` sạch sẽ như trên, `MAVIS.Worker` (Roslyn) trích xuất đầy đủ cạnh `SERVICE_HTTP_CALL` kèm đường dẫn tương đối và dòng mã nguồn thật, đồng thời kiểm tra **Contract Drift** (đối chiếu route gọi ở `CatalogApiClient` với `[Route]`/`[HttpPost]` bên `CatalogItemsController`).

### 6.5. Bài tập thực hành Lab 06

* Soi một lớp `Typed HttpClient` trong repo .NET mẫu ở **MAVIS Step 1**: xác minh đường dẫn URL và số dòng `CALL_SITE`.
* Chạy **Reverse BFS** ở **Step 2** cho `Catalog.API` và cho một dịch vụ cô lập (không có caller nào gọi tới), đối chiếu danh sách `Direct Callers` và `Indirect Callers`.

### 6.6. Ngân hàng Quiz Gate — Chương 06

**Câu 6.1**: Hậu quả nghiêm trọng nhất khi tạo `using var client = new HttpClient()` liên tục trong mỗi HTTP Request ở hệ thống .NET chịu tải cao là gì?
* A. Dẫn tới **Socket Exhaustion** (cạn kiệt cổng TCP do socket nằm ở trạng thái `TIME_WAIT`) và gây `SocketException` hàng loạt
* B. Làm mất toàn bộ dữ liệu trong bảng SQL
* C. Khiến trình biên dịch C# báo lỗi cú pháp
* D. Làm giảm độ phân giải ảnh

> **Đáp án đúng: A.** *Giải thích*: `IHttpClientFactory` ra đời để giải quyết đồng thời cả Socket Exhaustion lẫn vấn đề DNS cũ của `static HttpClient`.

**Câu 6.2**: Khi một dự án .NET chỉ khai báo URL của `Catalog.API` trong `appsettings.json` nhưng trong mã nguồn C# hoàn toàn không có lệnh `HttpClient` nào gọi tới, MAVIS sẽ xử lý cạnh này như thế nào theo nguyên tắc trung thực nhận thức (`D2`)?
* A. Tự động khẳng định chắc chắn hai dịch vụ gọi nhau mỗi giây
* B. Đánh dấu cạnh ở trạng thái **`NEEDS_REVIEW` (`UNVERIFIED_METADATA_ONLY`)** vì thiếu bằng chứng điểm gọi mã nguồn (`CALL_SITE`)
* C. Tự động xóa file `appsettings.json`
* D. Báo lỗi `HTTP 500`

> **Đáp án đúng: B.** *Giải thích*: MAVIS phân biệt rõ bằng chứng gọi thật trong mã nguồn (`CALL_SITE`) với thông tin cấu hình thuần túy để không tạo cạnh ảo.

**Câu 6.3**: Khi chạy **Reverse BFS** xuất phát từ nút mục tiêu `Basket.API`, và `Basket.API` chỉ được gọi trực tiếp bởi `Ordering.API`, còn `ApiGateway` gọi vào `Ordering.API`, thì khoảng cách `hop` của `ApiGateway` là bao nhiêu?
* A. `hop = 0`
* B. `hop = 1` (Direct Caller)
* C. `hop = 2` (Indirect Caller)
* D. `Isolated` (không liên quan)

> **Đáp án đúng: C.** *Giải thích*: Duyệt ngược: `Basket.API` (0) $\leftarrow$ `Ordering.API` (1) $\leftarrow$ `ApiGateway` (2).

**Câu 6.4**: Một dịch vụ cô lập (không có dịch vụ nào khác gọi tới nó — 0 upstream callers) bị sự cố thì bán kính ảnh hưởng (*Blast Radius*) trong thuật toán Reverse BFS bằng bao nhiêu?
* A. $0$
* B. $1$ (chỉ ảnh hưởng chính bản thân nút đó, không lan truyền dây chuyền sang dịch vụ khác)
* C. Bằng tổng số dịch vụ trong toàn hệ thống
* D. Vô hạn

> **Đáp án đúng: B.** *Giải thích*: Đúng theo quy tắc kiểm thử ngoại lệ `DS-03b` của MAVIS: nút cô lập có tập caller rỗng nên tác động gói gọn tại chính nó.

---

# 🗄️ MODULE 3: DỮ LIỆU ĐỘC LẬP, EVENT BUS & GIAO DỊCH PHÂN TÁN

## CHƯƠNG 07: DATABASE-PER-SERVICE VỚI EF CORE 8, ANTI-PATTERN SHARED DB & REDIS CACHE

* **Mã chương**: `CSHARP-CH07` | **Học phần**: Module 3
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Data Sovereignty per Microservice*) & Ch.7 (*Data Persistence with EF Core*); `[F16]` Ch.4 (*Scalable Data Storage*).
* **Mục tiêu học tập**:
  1. Thiết kế **Database-per-Service** đúng chuẩn với mỗi Microservice sở hữu một lớp **`DbContext`** và một chuỗi kết nối (database/schema) độc lập.
  2. Nhận diện và loại bỏ lỗi **Shared Database Anti-Pattern** trên sơ đồ C2.
  3. Áp dụng **Polyglot Persistence** trong .NET: PostgreSQL (EF Core) cho dữ liệu giao dịch (`Catalog`, `Ordering`) kết hợp **Redis (`StackExchange.Redis` / `IDistributedCache`)** cho dữ liệu tốc độ cao (`Basket`, Cache-Aside).

### 7.1. Quyền sở hữu dữ liệu (Data Sovereignty) trong `eShopOnContainers` (`[MS24]` Ch.4)

Nguyên tắc tối thượng của Microsoft: **Dữ liệu của một Microservice là tài sản riêng tư (*private*) của chính dịch vụ đó**. Dịch vụ khác muốn đọc hoặc thay đổi dữ liệu đó **bắt buộc phải đi qua API công khai (HTTP/gRPC) hoặc lắng nghe sự kiện bất đồng bộ (Event Bus)** — tuyệt đối không chọc thẳng SQL sang database của nhau!

```
SAI (Shared DB Anti-Pattern ❌):           ĐÚNG (Polyglot & Database-per-Service ✅):
[Catalog.API]   [Ordering.API]             [Catalog.API]     [Basket.API]     [Ordering.API]
      \               /                          |                |                 |
       v             v                           v                v                 v
    +-------------------+                 [(catalog_db)]     [(Redis)]       [(ordering_db)]
    |   shared_shop_db  |                   PostgreSQL      In-Memory          PostgreSQL
    +-------------------+                 CatalogDbContext  IDistributedCache OrderingDbContext
```

### 7.2. Cô lập EF Core 8 `DbContext` & Migration độc lập

Mỗi Microservice dùng EF Core phải có lớp `DbContext` riêng (ví dụ `CatalogDbContext` trong `Catalog.API`, `OrderingDbContext` trong `Ordering.API`) với bảng lịch sử migration riêng (có thể tách schema riêng như `catalog`, `ordering` nếu tạm chạy chung máy chủ PostgreSQL trong môi trường học tập):

```csharp
public sealed class CatalogDbContext(DbContextOptions<CatalogDbContext> options) : DbContext(options)
{
    public DbSet<CatalogItem> CatalogItems => Set<CatalogItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("catalog"); // Tách schema rõ ràng nếu dùng chung PostgreSQL instance
        modelBuilder.Entity<CatalogItem>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.Sku).IsUnique();
            entity.Property(e => e.UnitPrice).HasPrecision(18, 2);
            entity.Property(e => e.RowVersion).IsRowVersion(); // Optimistic Concurrency!
        });
    }
}
```

### 7.3. Redis cho Giỏ hàng (`Basket.API`) & Cache-Aside (`IDistributedCache`)

Trong mẫu `eShopOnContainers`, Microsoft dùng **Redis** cho `Basket.API` vì giỏ hàng là dữ liệu dạng khóa-giá trị (Key = `basket:{customerId}`), đọc/ghi cực nhanh, cần thời gian sống tự hủy (**TTL**) và không đòi hỏi các truy vấn JOIN phức tạp:

```csharp
public sealed class RedisBasketRepository(IDistributedCache cache) : IBasketRepository
{
    private static readonly DistributedCacheEntryOptions DefaultTtl = new()
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromDays(7)
    };

    public async Task<CustomerBasket?> GetBasketAsync(string customerId, CancellationToken ct)
    {
        var json = await cache.GetStringAsync($"basket:{customerId}", ct);
        return json is null ? null : JsonSerializer.Deserialize<CustomerBasket>(json);
    }

    public async Task<CustomerBasket> UpdateBasketAsync(CustomerBasket basket, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(basket);
        await cache.SetStringAsync($"basket:{basket.CustomerId}", json, DefaultTtl, ct);
        return basket;
    }

    public Task DeleteBasketAsync(string customerId, CancellationToken ct)
        => cache.RemoveAsync($"basket:{customerId}", ct);
}
```

### 7.4. Góc nhìn trên nền tảng MAVIS

* **3E Rule — `SHARED_DATABASE`**: Bộ phân tích tĩnh của MAVIS kiểm tra các `ConnectionStrings` trong `appsettings.json` và biến môi trường trong `docker-compose.yml`. Nếu hai dự án `.csproj` (ví dụ `Catalog.API` và `Ordering.API`) cùng trỏ về một `Database` và cùng `Schema`, MAVIS sẽ bật cảnh báo đỏ **SHARED_DATABASE** trên sơ đồ C2.

### 7.5. Bài tập thực hành Lab 07

* Quan sát sơ đồ **C2 Container** trên MAVIS: xác nhận mỗi dịch vụ .NET có đường kết nối riêng tới kho lưu trữ của mình (`Catalog.API -> catalog_db`, `Basket.API -> redis`, `Ordering.API -> ordering_db`).
* Giải thích lý do **Polyglot Persistence** chọn Redis cho `Basket.API` nhưng chọn PostgreSQL cho `Ordering.API`.

### 7.6. Ngân hàng Quiz Gate — Chương 07

**Câu 7.1**: Thuật ngữ **Polyglot Persistence** trong kiến trúc .NET Microservices có nghĩa là gì?
* A. Viết một Microservice bằng nhiều ngôn ngữ lập trình cùng lúc
* B. Mỗi Microservice được tự do lựa chọn loại cơ sở dữ liệu phù hợp nhất với đặc thù dữ liệu của nó (ví dụ PostgreSQL cho đơn hàng, Redis cho giỏ hàng)
* C. Lưu toàn bộ hệ thống vào một file CSV
* D. Dùng chung một cơ sở dữ liệu cho tất cả các dịch vụ

> **Đáp án đúng: B.** *Giải thích*: Nhờ Database-per-Service, mỗi service chọn công nghệ lưu trữ tối ưu nhất mà không ảnh hưởng service khác.

**Câu 7.2**: Trong EF Core 8, việc cấu hình `RowVersion` / Concurrency Token cho cột `AvailableStock` trong `CatalogItem` nhằm giải quyết bài toán gì?
* A. Giảm dung lượng file JSON
* B. **Optimistic Concurrency Control** — ngăn chặn lỗi ghi đè mất dữ liệu (*Lost Update*) khi hai đơn hàng đồng thời trừ tồn kho của cùng một sản phẩm
* C. Tự động sao lưu cơ sở dữ liệu lên đám mây
* D. Tắt hoàn toàn khóa chính của bảng

> **Đáp án đúng: B.** *Giải thích*: Khi hai giao dịch đọc cùng số tồn kho và cùng ghi đè, EF Core sẽ phát hiện phiên bản đã thay đổi và ném `DbUpdateConcurrencyException` để xử lý an toàn.

**Câu 7.3**: Điều gì sẽ xảy ra trên MAVIS nếu cả `Catalog.API` và `Ordering.API` cùng cấu hình chuỗi kết nối tới chung một database `shop_db` và cùng schema `public`?
* A. MAVIS tăng điểm kiến trúc lên tối đa
* B. Quy tắc 3E của MAVIS phát hiện và cảnh báo mùi kiến trúc **`SHARED_DATABASE`** trên sơ đồ C2
* C. Roslyn không thể biên dịch mã C#
* D. Redis tự động thay thế PostgreSQL

> **Đáp án đúng: B.** *Giải thích*: Shared Database phá vỡ sự cô lập và khả năng triển khai độc lập của Microservices.

**Câu 7.4**: Khi lưu giỏ hàng (`Basket`) hoặc cache sản phẩm trong Redis, tại sao việc thiết lập **TTL (`AbsoluteExpirationRelativeToNow` / `SlidingExpiration`)** là thực hành bắt buộc?
* A. Để tránh rò rỉ bộ nhớ RAM vô hạn trên Redis do dữ liệu rác/giỏ hàng bỏ quên tích tụ theo thời gian, đồng thời giới hạn thời gian tồn tại dữ liệu cũ
* B. Vì Redis không lưu được chuỗi JSON nếu không có TTL
* C. Để tự động sao chép dữ liệu sang PostgreSQL
* D. Để tăng tốc độ biên dịch C#

> **Đáp án đúng: A.** *Giải thích*: Redis lưu dữ liệu trên RAM (tài nguyên đắt và hữu hạn), nên mọi khóa tạm/cache đều cần chính sách hết hạn TTL rõ ràng.

---

## CHƯƠNG 08: GIAO TIẾP BẤT ĐỒNG BỘ (EVENT BUS / RABBITMQ), IDEMPOTENCY & INTEGRATION EVENT OUTBOX

* **Mã chương**: `CSHARP-CH08` | **Học phần**: Module 3
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Asynchronous Message-Based Communication*) & Ch.6 (*Implementing an Event Bus with RabbitMQ* & *Resiliently Publishing to the Event Bus*).
* **Mục tiêu học tập**:
  1. Thiết kế **Integration Events** (khác với *Domain Events* nội bộ) và truyền thông bất đồng bộ qua **Event Bus (RabbitMQ / MassTransit)** trong .NET 8.
  2. Xây dựng **Idempotent Event Handler** chống xử lý trùng lặp trong cơ chế *At-Least-Once Delivery*.
  3. Giải quyết lỗi **Dual-Write** bằng **Integration Event Log (Transactional Outbox Pattern)** theo đúng mô hình `eShopOnContainers`.

### 8.1. Domain Event vs. Integration Event trong .NET (`[MS24]` Ch.7)

Rất nhiều sinh viên nhầm lẫn hai khái niệm này:
* **Domain Event**: Xảy ra và được xử lý **bên trong ranh giới 1 Microservice** (in-process, cùng transaction cục bộ) để tách lỏng các thành phần nội bộ (ví dụ: khi `Order` chuyển sang `Confirmed` thì ghi log nội bộ).
* **Integration Event**: Được phát ra **bên ngoài qua Message Broker (RabbitMQ / Kafka)** để thông báo cho **các Microservice khác** cập nhật dữ liệu nhất quán cuối cùng (ví dụ: `OrderCreatedIntegrationEvent` phát từ `Ordering.API` để `Basket.API` tự động xóa giỏ hàng và `Catalog.API` cập nhật thống kê).

```
+---------------+  Publish(OrderCreatedIntegrationEvent)  +--------------------+  Consume  +---------------+
| Ordering.API  | --------------------------------------> | RabbitMQ Event Bus | --------> |  Basket.API   |
+---------------+                                         |  (Topic Exchange)  |           | (Clear Cart)  |
  (Trả 201 ngay                                           +--------------------+           +---------------+
   cho khách!)                                                      |
                                                                    +----------> [Notification / Analytics]
```

### 8.2. Hợp đồng Integration Event & Idempotent Consumer bằng .NET 8 (MassTransit / RabbitMQ)

Mọi Integration Event bắt buộc phải mang **`EventId` (`Guid`)** và **`OccurredAtUtc`** để consumer nhận diện và khử trùng lặp:

```csharp
// BuildingBlocks/EventBus.Contracts/OrderEvents.cs
public sealed record OrderCreatedIntegrationEvent(
    Guid EventId,
    DateTime OccurredAtUtc,
    Guid OrderId,
    string CustomerId,
    decimal TotalAmount
);
```

```csharp
// Basket.API/Consumers/OrderCreatedConsumer.cs (Idempotent Consumer)
public sealed class OrderCreatedConsumer(
    IBasketRepository basketRepository,
    IProcessedEventStore processedEventStore,
    ILogger<OrderCreatedConsumer> logger) : IConsumer<OrderCreatedIntegrationEvent>
{
    public async Task Consume(ConsumeContext<OrderCreatedIntegrationEvent> context)
    {
        var evt = context.Message;

        // 1. Chống xử lý trùng lặp (At-Least-Once Delivery)
        if (await processedEventStore.HasProcessedAsync(evt.EventId, context.CancellationToken))
        {
            logger.LogInformation("Duplicate event {EventId} skipped.", evt.EventId);
            return;
        }

        // 2. Xóa giỏ hàng của khách (Bản thân thao tác Delete cũng mang tính idempotent!)
        await basketRepository.DeleteBasketAsync(evt.CustomerId, context.CancellationToken);
        await processedEventStore.MarkProcessedAsync(evt.EventId, context.CancellationToken);
    }
}
```

### 8.3. Giải quyết Dual-Write bằng Integration Event Log (Outbox Pattern) (`[MS24]` Ch.6)

Trong `eShopOnContainers`, Microsoft chỉ rõ rằng việc gọi `await _dbContext.SaveChangesAsync()` rồi ngay sau đó gọi `await _eventBus.PublishAsync(evt)` là **không nguyên tử (Dual-Write)** — nếu container bị ngắt điện giữa hai dòng lệnh, đơn hàng đã lưu nhưng `Basket.API` không bao giờ nhận được sự kiện xóa giỏ hàng!

**Giải pháp chuẩn của Microsoft — `IntegrationEventLog` (Transactional Outbox)**:
1. Mở một giao dịch EF Core duy nhất trên `OrderingDbContext`.
2. Lưu `Order` vào bảng `orders` **VÀ** lưu bản ghi `IntegrationEventLogEntry` (`State = NotPublished`) vào bảng `integration_event_logs` **trong cùng một `Commit()`**.
3. Một `BackgroundService` (hoặc **MassTransit EF Core Outbox** tích hợp sẵn) quét các bản ghi `NotPublished`, đẩy lên RabbitMQ, rồi cập nhật `State = Published`.

### 8.4. Góc nhìn trên nền tảng MAVIS

* **Phân biệt Sync vs. Async**: MAVIS tách rõ lời gọi đồng bộ (`Typed HttpClient`) với kết nối qua Message Broker (`RabbitMQ`).
* **Thí nghiệm trên MAVIS Studio**: Khi sinh viên **Stop** `Basket.API` hoặc `Notification.API` lúc hệ thống chạy, `Ordering.API` vẫn tiếp tục tạo đơn thành công bình thường; tin nhắn được RabbitMQ giữ an toàn trong Queue và tự động giao bù ngay khi container chạy lại!

### 8.5. Bài tập thực hành Lab 08

* Định nghĩa 2 bản ghi `record` Integration Event (`OrderCreatedIntegrationEvent`, `OrderCancelledIntegrationEvent`) có đủ `EventId`, `OccurredAtUtc`, `CorrelationId`.
* Trình bày cơ chế ngăn chặn lỗi xử lý trùng sự kiện và lỗi Dual-Write khi `Ordering.API` phát sự kiện lên RabbitMQ.

### 8.6. Ngân hàng Quiz Gate — Chương 08

**Câu 8.1**: Điểm khác biệt cốt lõi giữa **Domain Event** và **Integration Event** trong kiến trúc .NET Microservices của Microsoft là gì?
* A. Domain Event dùng nội bộ trong cùng một Microservice (cùng tiến trình/giao dịch); Integration Event được phát qua Message Broker (RabbitMQ/Kafka) để đồng bộ giữa các Microservice khác nhau
* B. Integration Event không được phép có thuộc tính `Guid`
* C. Domain Event bắt buộc phải gửi qua giao thức HTTP POST
* D. Hai khái niệm hoàn toàn giống hệt nhau

> **Đáp án đúng: A.** *Giải thích*: Phân tách rõ ranh giới giúp tránh để rò rỉ chi tiết nội bộ của một Domain Model ra toàn hệ thống phân tán.

**Câu 8.2**: Tại sao trong `eShopOnContainers`, Microsoft bổ sung bảng **`IntegrationEventLog` (Transactional Outbox)** cùng cơ sở dữ liệu với `OrderingDbContext`?
* A. Để tránh lỗi **Dual-Write** — đảm bảo dữ liệu đơn hàng và sự kiện cần phát được ghi nguyên tử trong cùng một giao dịch CSDL cục bộ trước khi đẩy ra RabbitMQ
* B. Để thay thế hoàn toàn RabbitMQ
* C. Để tăng kích thước file log văn bản
* D. Vì EF Core không hỗ trợ lưu bảng `orders` nếu thiếu bảng này

> **Đáp án đúng: A.** *Giải thích*: Outbox đảm bảo không bao giờ mất sự kiện hoặc phát sự kiện "ma" khi hệ thống sập giữa chừng.

**Câu 8.3**: Vì sao mọi Event Consumer lắng nghe RabbitMQ phải kiểm tra `EventId` hoặc đảm bảo tính **Idempotent**?
* A. Vì RabbitMQ có thể gửi lại cùng một thông điệp hơn một lần (*At-Least-Once Delivery*) nếu kết nối bị ngắt trước khi Consumer gửi xác nhận `ACK`
* B. Vì RabbitMQ tự động nhân đôi mọi sự kiện lên gấp 10 lần
* C. Vì C# không hỗ trợ chạy `async/await` trong Consumer
* D. Vì `Guid` trong .NET luôn bị trùng lặp

> **Đáp án đúng: A.** *Giải thích*: Cơ chế Idempotent Consumer đảm bảo xử lý lặp lại vẫn giữ nguyên trạng thái nghiệp vụ đúng đắn.

**Câu 8.4**: Trong kiến trúc bất đồng bộ dùng RabbitMQ, nếu `Notification.API` tạm thời bị **Stop** để nâng cấp phiên bản, hành vi nào sau đây là chuẩn xác?
* A. `Ordering.API` bị treo hoàn toàn cho đến khi `Notification.API` khởi động lại
* B. `Ordering.API` vẫn tiếp nhận đơn hàng bình thường; thông điệp nằm chờ an toàn trong Queue của RabbitMQ và sẽ được `Notification.API` tiêu thụ khi bật lại
* C. Toàn bộ đơn hàng trong `ordering_db` bị rollback
* D. `ApiGateway` tự động tắt theo

> **Đáp án đúng: B.** *Giải thích*: Giao tiếp bất đồng bộ qua Message Broker tạo ra **Temporal Decoupling**, giúp hệ thống chịu lỗi và bảo trì độc lập từng dịch vụ.

---

## CHƯƠNG 09: GIAO DỊCH PHÂN TÁN VỚI SAGA PATTERN & NHẤT QUÁN CUỐI CÙNG

* **Mã chương**: `CSHARP-CH09` | **Học phần**: Module 3
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Eventual Consistency & Managing Distributed Transactions*); `[R19]` Ch.4 (*Saga Pattern*); `[F16]` Ch.3 (*Reliability*).
* **Mục tiêu học tập**:
  1. Hiểu rõ vì sao .NET Microservices từ chối giao thức khóa phân tán cổ điển **MSDTC / 2PC** và chấp nhận **Eventual Consistency**.
  2. Triển khai luồng **Saga** kèm **Compensating Transactions** (giao dịch bù trừ) và **Idempotency Key** khi đặt hàng xuyên qua nhiều dịch vụ (`Ordering.API`, `Catalog.API`, `Basket.API`).
  3. Phân biệt khi nào dùng **Choreography** (lắng nghe sự kiện qua RabbitMQ) và khi nào dùng **Orchestration** (điều phối tập trung bằng State Machine / Orchestrator).

### 9.1. Từ chối MSDTC / 2PC để đón nhận Eventual Consistency (`[MS24]` Ch.4)

Trong các hệ thống .NET Framework cũ (WCF / SQL Server cổ điển), lập trình viên từng dùng `TransactionScope` kèm **MSDTC (Two-Phase Commit)**. Trong kiến trúc Microservices hiện đại chạy trên Linux Docker Container, **2PC bị loại bỏ hoàn toàn** vì:
* Khóa tài nguyên xuyên mạng gây tắc nghẽn nghiêm trọng và giảm mạnh độ khả dụng.
* Các kho lưu trữ hiện đại (Redis, RabbitMQ, NoSQL) không hỗ trợ 2PC.

Thay vào đó, hệ thống đảm bảo tính nhất quán theo mô hình **Eventual Consistency** (sau một khoảng thời gian ngắn tính bằng mili-giây hoặc giây, toàn bộ các service hội tụ về trạng thái đúng) thông qua **Saga Pattern**:

```
LUỒNG THÀNH CÔNG (Happy Path):
[T1: Ordering.API]        [T2: Catalog.API]          [T3: Ordering.API]        [T4: Basket.API (Async)]
Create Order (Pending) -> Reserve Stock (OK)      -> Mark Confirmed         -> Clear Customer Basket
                                                     & Publish Event

LUỒNG THẤT BẠI (Compensation Path — Ví dụ mặt hàng thứ 2 hết hàng!):
[T1: Ordering.API]        [T2a: Reserve Item 1 OK]   [T2b: Reserve Item 2 FAIL ❌]
Create Order (Pending) -> Stock Item 1 (-2 kg)    -> HTTP 409 Insufficient Stock!
                                                           |
[C1: Ordering.API]     <- [C2a: Catalog.API] <-------------+
Mark Order Cancelled      Release Stock Item 1 (+2 kg — Bù trừ!)
```

### 9.2. Minh họa Orchestration Saga & Idempotency Key trong ASP.NET Core 8

```csharp
public sealed class CreateOrderSagaService(
    OrderingDbContext dbContext,
    ICatalogApiClient catalogClient,
    IPublishEndpoint eventBus) : ICreateOrderSagaService
{
    public async Task<OrderResponse> PlaceOrderAsync(
        Guid customerId, CreateOrderRequest request, string idempotencyKey, CancellationToken ct)
    {
        // 0. Chống gửi đúp bằng Idempotency-Key (Semantic/Request Guard)
        var existing = await dbContext.Orders
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.IdempotencyKey == idempotencyKey, ct);
        if (existing is not null)
            return OrderMapper.ToResponse(existing);

        // T1 (Semantic Lock): Lưu đơn ở trạng thái Submitted/Pending trước
        var order = Order.CreateDraft(customerId, request.ShippingAddress, idempotencyKey);
        foreach (var item in request.Items)
            order.AddItem(item.ProductId, item.ProductName, item.UnitPrice, item.Quantity);

        dbContext.Orders.Add(order);
        await dbContext.SaveChangesAsync(ct);

        var reserved = new List<(int ProductId, int Quantity)>();
        try
        {
            // T2: Giữ tồn kho từng mặt hàng tại Catalog.API
            foreach (var item in request.Items)
            {
                var ok = await catalogClient.ReserveStockAsync(item.ProductId, item.Quantity, ct);
                if (!ok) throw new DomainException($"Insufficient stock for product {item.ProductId}");
                reserved.Add((item.ProductId, item.Quantity));
            }

            // T3 (Pivot Transaction): Xác nhận đơn & phát Integration Event cho Basket.API
            order.MarkAsConfirmed();
            await dbContext.SaveChangesAsync(ct);

            await eventBus.Publish(new OrderCreatedIntegrationEvent(
                Guid.NewGuid(), DateTime.UtcNow, order.Id, customerId.ToString(), order.TotalAmount), ct);

            return OrderMapper.ToResponse(order);
        }
        catch (Exception ex)
        {
            // BÙ TRỪ (Compensating Transactions): Trả lại kho các món đã giữ + Đánh dấu hủy đơn!
            foreach (var (productId, qty) in reserved)
                await catalogClient.ReleaseStockAsync(productId, qty, CancellationToken.None);

            order.Cancel($"Saga compensation triggered: {ex.Message}");
            await dbContext.SaveChangesAsync(CancellationToken.None);
            throw;
        }
    }
}
```

> **Mẹo quan trọng trong khối `catch` bù trừ**: Dùng `CancellationToken.None` (hoặc token có timeout riêng) cho bước hoàn kho & hủy đơn để tránh việc client vừa đóng trình duyệt đã làm hủy ngang luôn cả thao tác bù trừ!

### 9.3. So sánh Choreography vs. Orchestration trong .NET

* **Choreography** (`eShopOnContainers` dùng cho luồng ngắn): `Ordering.API` phát `OrderStatusChangedToAwaitingValidation` $\to$ `Catalog.API` kiểm tra tồn kho rồi phát lại `OrderStockConfirmed` hoặc `OrderStockRejected` $\to$ `Ordering.API` lắng nghe và chuyển trạng thái. Phù hợp luồng 2–3 bước, ghép lỏng tuyệt đối.
* **Orchestration** (dùng **MassTransit Saga State Machine** hoặc Orchestrator Service): Phù hợp khi quy trình có $\ge 4$ bước phức tạp (Đặt hàng $\to$ Kiểm kho $\to$ Thanh toán $\to$ Vận chuyển $\to$ Hóa đơn), giúp nhìn rõ toàn bộ vòng đời trạng thái tại một nơi duy nhất.

### 9.4. Góc nhìn trên nền tảng MAVIS

* Khi mô phỏng lỗi trên **MAVIS Studio**, sinh viên có thể gửi đơn hàng nhiều mặt hàng hoặc ngắt `Catalog.API` giữa chừng để kiểm chứng trạng thái cuối cùng trên `ordering_db` chuyển sạch sang `Cancelled` thay vì treo vĩnh viễn ở `Submitted`.

### 9.5. Bài tập thực hành Lab 09

* Vẽ sơ đồ trạng thái (`Submitted` $\to$ `Confirmed` / `Cancelled`) và liệt kê các giao dịch cục bộ (`T1..T3`) cùng giao dịch bù trừ (`C1..C2`) cho kịch bản đặt giỏ hàng gồm 2 mặt hàng, trong đó mặt hàng thứ 2 hết tồn kho.
* Giải thích vì sao nên tách **Idempotency-Key** từ HTTP header cho yêu cầu `POST /api/v1/orders`.

### 9.6. Ngân hàng Quiz Gate — Chương 09

**Câu 9.1**: Tại sao giao thức giao dịch phân tán **2PC (Two-Phase Commit / MSDTC)** không được khuyến nghị dùng giữa các .NET Microservice hiện đại?
* A. Vì gây khóa tài nguyên kéo dài xuyên mạng, giảm độ khả dụng và không được hỗ trợ bởi nhiều hạ tầng hiện đại (Redis, RabbitMQ, NoSQL)
* B. Vì C# không có lệnh `try-catch`
* C. Vì 2PC chỉ chạy được với định dạng XML
* D. Vì Docker không hỗ trợ kết nối TCP

> **Đáp án đúng: A.** *Giải thích*: 2PC đánh đổi quá lớn về hiệu năng, tính sẵn sàng và tạo khớp nối chặt giữa các dịch vụ.

**Câu 9.2**: Trong quy trình đặt hàng dùng Saga, khách đặt 2 sản phẩm: sản phẩm 1 đã trừ kho thành công, sản phẩm 2 báo hết hàng. Hành động **Compensating Transaction** đúng đắn là gì?
* A. Xóa toàn bộ bảng sản phẩm trong `catalog_db`
* B. Gọi thao tác cộng hoàn trả lại số lượng đã trừ của sản phẩm 1 và cập nhật trạng thái đơn hàng thành `Cancelled`
* C. Giữ nguyên số lượng đã trừ của sản phẩm 1 và báo đơn thành công
* D. Chờ 24 giờ rồi khởi động lại máy chủ

> **Đáp án đúng: B.** *Giải thích*: Giao dịch bù trừ đảo ngược tác động nghiệp vụ của các bước trước đó đã commit cục bộ.

**Câu 9.3**: Vai trò của header **`Idempotency-Key`** khi client gửi yêu cầu `POST /api/v1/orders` là gì?
* A. Tăng tốc độ tải trang CSS
* B. Đảm bảo nếu mạng chập chờn khiến client gửi lặp lại cùng một yêu cầu đặt hàng nhiều lần, server chỉ tạo **đúng 1 đơn hàng duy nhất** và trả lại kết quả cũ
* C. Thay thế hoàn toàn JWT xác thực người dùng
* D. Tự động giảm giá đơn hàng 10%

> **Đáp án đúng: B.** *Giải thích*: `POST` vốn không tự nhiên idempotent; gắn `Idempotency-Key` chống triệt để lỗi tạo đơn hàng trùng lặp.

**Câu 9.4**: Tại sao trong khối `catch` thực hiện bù trừ (`ReleaseStockAsync` và `order.Cancel`), ta thường không truyền trực tiếp `CancellationToken` của HTTP Request gốc?
* A. Vì nếu người dùng vừa bấm hủy trình duyệt đúng lúc lỗi xảy ra, `CancellationToken` gốc đã bị hủy sẽ làm gián đoạn luôn cả lệnh hoàn kho bù trừ
* B. Vì C# cấm dùng `CancellationToken` trong khối `catch`
* C. Vì RabbitMQ không nhận `CancellationToken`
* D. Vì `CancellationToken` làm chậm câu lệnh SQL

> **Đáp án đúng: A.** *Giải thích*: Thao tác bù trừ phải chạy trọn vẹn để giữ nhất quán dữ liệu ngay cả khi phía client đã ngắt kết nối.

---

# 🛡️ MODULE 4: KHẢ NĂNG CHỊU LỖI & GIÁM SÁT HỆ THỐNG (RESILIENCE & OBSERVABILITY)

## CHƯƠNG 10: THIẾT KẾ .NET MICROSERVICE CHỊU LỖI VỚI POLLY V8 & `Microsoft.Extensions.Http.Resilience`

* **Mã chương**: `CSHARP-CH10` | **Học phần**: Module 4
* **Nguồn chuẩn**: `[MS24]` Ch.8 (*Implement Resilient Applications — Retries with Exponential Backoff & Circuit Breaker*); `[F16]` Ch.3 (*Dependencies & Fault Tolerance*); `[STD]` Microsoft `.NET 8 Resilience` (`Polly v8`).
* **Mục tiêu học tập**:
  1. Hiểu cơ chế **Cascading Failure** khi dịch vụ hạ lưu treo chậm làm cạn kiệt ThreadPool của ASP.NET Core.
  2. Cấu hình chuẩn **.NET 8 Resilience Pipeline** trên `IHttpClientFactory` gồm đủ 4 lớp bảo vệ: **Total Timeout**, **Retry + Exponential Backoff + Jitter**, **Circuit Breaker** và **Attempt Timeout**.
  3. Thiết kế cơ chế **Graceful Degradation / Fallback** an toàn và trung thực cho người dùng.

### 10.1. Chuẩn mới của .NET 8: `Microsoft.Extensions.Http.Resilience` (Polly v8)

Thay vì tự ghép nối rời rạc từng chính sách Polly v7 dễ sai thứ tự, Microsoft .NET 8 cung cấp gói chính chủ **`Microsoft.Extensions.Http.Resilience`** với **`AddStandardResilienceHandler()`** xếp sẵn thứ tự chuẩn công nghiệp từ ngoài vào trong:

```
Yêu cầu từ Ordering.API
   │
   ▼
[1. Rate Limiter / Bulkhead]        --> Giới hạn số gọi đồng thời sang dịch vụ đích
   │
   ▼
[2. Total Request Timeout]          --> Tổng thời gian tối đa cho cả chuỗi (VD: 10s)
   │
   ▼
[3. Retry + Exp Backoff + Jitter]   --> Thử lại lỗi thoáng qua (5xx, 408, mạng)
   │
   ▼
[4. Circuit Breaker]                --> Ngắt mạch (OPEN) ngay nếu tỷ lệ lỗi vượt ngưỡng!
   │
   ▼
[5. Attempt Timeout]                --> Giới hạn từng lần gọi lẻ (VD: 3s)
   │
   ▼
[HTTP Network Call --> Catalog.API]
```

> **Tại sao thứ tự lồng nhau này lại quan trọng đến vậy?**
> * **Retry bọc ngoài Circuit Breaker**: Nếu cầu dao đang `OPEN`, Retry sẽ không cố đâm đầu gọi qua mạng vô ích.
> * **Attempt Timeout nằm trong cùng**: Mỗi lần thử chỉ được phép chờ tối đa $2\text{–}3$ giây; nếu hạ lưu treo, cắt ngay để Circuit Breaker ghi nhận 1 lần lỗi!

### 10.2. Cấu hình Resilience Pipeline trong `Program.cs` (.NET 8)

```csharp
builder.Services.AddHttpClient<ICatalogApiClient, CatalogApiClient>((sp, client) =>
{
    var urls = sp.GetRequiredService<IOptions<ServiceUrlOptions>>().Value;
    client.BaseAddress = new Uri(urls.CatalogApi);
})
.AddStandardResilienceHandler(options =>
{
    // Giới hạn thời gian cho từng lần gọi lẻ
    options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(3);

    // Retry lỗi tạm thời với Exponential Backoff + Jitter
    options.Retry.MaxRetryAttempts = 2;
    options.Retry.Delay = TimeSpan.FromMilliseconds(300);
    options.Retry.BackoffType = DelayBackoffType.Exponential;
    options.Retry.UseJitter = true;

    // Circuit Breaker: mở cầu dao nếu tỷ lệ lỗi >= 50% trong cửa sổ 30s
    options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(30);
    options.CircuitBreaker.MinimumThroughput = 5;
    options.CircuitBreaker.FailureRatio = 0.5;
    options.CircuitBreaker.BreakDuration = TimeSpan.FromSeconds(15);

    // Tổng trần thời gian cho cả yêu cầu (bao gồm các lần retry)
    options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(8);
});
```

### 10.3. Xử lý `BrokenCircuitException` & Fallback trung thực

Khi cầu dao đang ở trạng thái `OPEN`, lời gọi qua `HttpClient` lập tức ném **`BrokenCircuitException`** trong vòng $< 1\text{ms}$ (**Fail-Fast**):

```csharp
try
{
    return await catalogClient.GetItemAsync(productId, ct);
}
catch (BrokenCircuitException ex)
{
    logger.LogWarning(ex, "Catalog circuit is OPEN. Failing fast for product {ProductId}", productId);
    // Graceful Degradation cho màn hình đọc (lấy cache dự phòng)
    // Hoặc trả 503 Service Unavailable minh bạch cho màn hình đặt hàng!
    throw new ServiceUnavailableException("Catalog service is temporarily unavailable.", ex);
}
```

### 10.4. Góc nhìn trên nền tảng MAVIS

* **Thí nghiệm thực chiến trên MAVIS Studio (Step 4)**: Sinh viên bật hệ thống .NET trong Docker $\to$ chụp Snapshot **Before** $\to$ bấm **Stop** container `Catalog.API` $\to$ gửi loạt request kiểm thử $\to$ quan sát **Circuit Breaker chuyển `OPEN`**, độ trễ phản hồi ở `Ordering.API` giữ mức mili-giây (**Fail-Fast**) và thông báo lỗi suy giảm kiểm soát `503` sạch sẽ (Snapshot **After**).

### 10.5. Bài tập thực hành Lab 10

* Cấu hình `AddStandardResilienceHandler` cho `CatalogApiClient` trong `Ordering.API`.
* Thực hiện bài thí nghiệm **Stop Container** trên **MAVIS Studio**, ghi lại số liệu Latency và Error Rate **Before vs. After**, giải thích rõ giai đoạn nào là `Retry`, giai đoạn nào cầu dao bật `OPEN` (`BrokenCircuitException`).

### 10.6. Ngân hàng Quiz Gate — Chương 10

**Câu 10.1**: Trong `AddStandardResilienceHandler()` của .NET 8, tại sao chính sách **Retry** nên dùng **Exponential Backoff kết hợp Jitter (độ lệch ngẫu nhiên)**?
* A. Để giãn đều thời gian gọi lại giữa hàng nghìn client, tránh hiện tượng **Retry Storm (Thundering Herd)** đánh sập dịch vụ hạ lưu đúng lúc nó đang cố hồi phục
* B. Để làm chậm tốc độ chạy của ứng dụng khi bình thường
* C. Để bỏ qua hoàn toàn cơ chế Circuit Breaker
* D. Vì HTTP không cho phép gửi 2 request liên tiếp

> **Đáp án đúng: A.** *Giải thích*: Nếu 1.000 client cùng retry đúng mốc $1\text{s}, 2\text{s}, 4\text{s}$, chúng tạo ra làn sóng DDoS nội bộ đánh sập dịch vụ đích; thêm *jitter* phân tán đều các mốc thử lại.

**Câu 10.2**: Khi **Circuit Breaker** đang ở trạng thái `OPEN` và `Ordering.API` gọi vào `CatalogApiClient`, điều gì xảy ra ngay lập tức?
* A. Ứng dụng chờ đủ 60 giây rồi mới báo lỗi
* B. Pipeline chặn ngay lập tức (*Fail-Fast*) và ném **`BrokenCircuitException`** mà không gửi gói tin qua mạng tới `Catalog.API`
* C. Tự động tăng số replica của `Catalog.API` lên 10
* D. Tự động xóa bản ghi trong Redis

> **Đáp án đúng: B.** *Giải thích*: Trạng thái `OPEN` bảo vệ ThreadPool của dịch vụ gọi và cho dịch vụ đích khoảng nghỉ để hồi phục.

**Câu 10.3**: Sai lầm nào sau đây cần **TRÁNH TUYỆT ĐỐI** khi cấu hình chính sách **Retry** trên HTTP Client?
* A. Retry các lỗi mạng thoáng qua (`HttpRequestException`) hoặc `503 Service Unavailable` trên request `GET`
* B. Retry mù quáng các lỗi `400 Bad Request` / `401 Unauthorized` hoặc retry yêu cầu `POST` trừ tiền/trừ kho **không có Idempotency-Key**
* C. Giới hạn `MaxRetryAttempts` ở mức nhỏ ($2\text{–}3$ lần)
* D. Đặt `TotalRequestTimeout` bao ngoài chuỗi Retry

> **Đáp án đúng: B.** *Giải thích*: Lỗi `400/401` retry bao nhiêu lần vẫn lỗi; còn retry `POST` không idempotent sẽ gây trừ tồn kho hoặc trừ tiền nhiều lần.

**Câu 10.4**: Trong kiến trúc resilience nhiều lớp của `.NET 8`, sự khác nhau giữa **`AttemptTimeout`** và **`TotalRequestTimeout`** là gì?
* A. `AttemptTimeout` giới hạn thời gian cho **mỗi lần gọi lẻ**; `TotalRequestTimeout` giới hạn **tổng thời gian toàn bộ yêu cầu** bao gồm cả các lần Retry và thời gian chờ Backoff
* B. Hai tham số giống hệt nhau
* C. `AttemptTimeout` chỉ áp dụng cho PostgreSQL
* D. `TotalRequestTimeout` phải luôn nhỏ hơn `AttemptTimeout`

> **Đáp án đúng: A.** *Giải thích*: `TotalRequestTimeout` nằm ngoài cùng bảo đảm tổng trải nghiệm người dùng không bao giờ vượt trần thời gian cho phép.

---

## CHƯƠNG 11: OBSERVABILITY TOÀN DIỆN (HEALTH CHECKS, STRUCTURED LOGGING & OPENTELEMETRY .NET)

* **Mã chương**: `CSHARP-CH11` | **Học phần**: Module 4
* **Nguồn chuẩn**: `[MS24]` Ch.8 (*Health Monitoring*) & Ch.10 (*Logging & Telemetry*); `[F16]` Ch.7 (*Observability & Monitoring*); `[STD]` OpenTelemetry .NET & ASP.NET Core Health Checks Docs.
* **Mục tiêu học tập**:
  1. Thiết lập **ASP.NET Core Health Checks** tách bạch rõ **`/health/live` (Liveness)** và **`/health/ready` (Readiness)** kiểm tra kết nối PostgreSQL / Redis / RabbitMQ.
  2. Tích hợp **OpenTelemetry .NET SDK** (Traces, Metrics, Logs) xuất chuẩn **OTLP** sang Collector của MAVIS chỉ trong vài chục dòng cấu hình.
  3. Đọc hiểu vết phân tán (`TraceId`, `SpanId`, `Activity`, header `traceparent`) xuyên suốt từ `ApiGateway` $\to$ `Ordering.API` $\to$ `Catalog.API` $\to$ `PostgreSQL` / `RabbitMQ`.

### 11.1. Health Checks chuẩn trong ASP.NET Core 8: `/health/live` vs. `/health/ready`

Khác với việc chỉ tạo một endpoint giả luôn trả `"OK"`, ASP.NET Core cung cấp hệ thống **Health Checks** chuẩn hóa có khả năng gắn thẻ (`tags`) để tách riêng hai mục đích sống còn:
* **`/health/live` (Liveness)**: Chỉ kiểm tra tiến trình ASP.NET Core có còn phản hồi không (không kiểm tra DB/RabbitMQ để tránh hiệu ứng "chết chùm" khi DB chập chờn khiến Docker restart đồng loạt mọi container!).
* **`/health/ready` (Readiness)**: Kiểm tra tiến trình **và các phụ thuộc thiết yếu** (`PostgreSQL`, `Redis`, `RabbitMQ`) có sẵn sàng nhận traffic chưa.

```csharp
// Đăng ký Health Checks trong Program.cs
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddNpgSql(builder.Configuration.GetConnectionString("OrderingDb")!, name: "postgres", tags: ["ready"])
    .AddRabbitMQ(builder.Configuration.GetConnectionString("RabbitMq")!, name: "rabbitmq", tags: ["ready"]);

// Ánh xạ 2 endpoint chuẩn
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = r => r.Tags.Contains("live")
});
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = r => r.Tags.Contains("ready")
});
```

### 11.2. OpenTelemetry .NET — Một đường ống thống nhất cho Traces, Metrics & Logs

Điểm cực sướng trong .NET 8 là lớp `System.Diagnostics.Activity` của chính .NET đã tuân thủ sẵn chuẩn **W3C Trace Context (`traceparent`)**! Khi cài gói `OpenTelemetry.Extensions.Hosting`, `OpenTelemetry.Instrumentation.AspNetCore`, `OpenTelemetry.Instrumentation.Http`, `OpenTelemetry.Exporter.OpenTelemetryProtocol`, toàn bộ HTTP đến/đi, EF Core và RabbitMQ đều tự động nối thành một cây Trace hoàn chỉnh:

```csharp
// Cấu hình OpenTelemetry .NET chuẩn xuất qua OTLP (dùng chung cho mọi service!)
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService(
        serviceName: builder.Environment.ApplicationName))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation(opt =>
        {
            // Bỏ qua các request healthcheck để đỡ làm rác biểu đồ trace
            opt.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");
        })
        .AddHttpClientInstrumentation()
        .AddEntityFrameworkCoreInstrumentation()
        .AddOtlpExporter())      // Tự đọc OTEL_EXPORTER_OTLP_ENDPOINT từ biến môi trường!
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());

// Gắn TraceId & SpanId vào Structured Logging
builder.Logging.AddOpenTelemetry(logging =>
{
    logging.IncludeFormattedMessage = true;
    logging.IncludeScopes = true;
    logging.AddOtlpExporter();
});
```

#### Luồng Trace thực tế trên một yêu cầu Đặt hàng .NET:

```
TraceId: 7d2a9f10c3b84e21a904f8b7d123c456  (Tổng: 118 ms)
├── [ApiGateway]   POST /api/v1/orders                     |================= 118 ms =================|
    └── [Ordering.API] OrdersController.PlaceOrder          |============== 106 ms ==============|
        ├── [PostgreSQL] INSERT INTO ordering.orders          |== 14 ms ==|
        ├── [Catalog.API] POST /api/v1/catalog/items/3/reserve            |====== 62 ms ======|
        │   └── [PostgreSQL] UPDATE catalog.catalog_items                   |=== 24 ms ===|
        └── [RabbitMQ] Publish OrderCreatedIntegrationEvent                                 |= 9 ms =|
```

### 11.3. Góc nhìn trên nền tảng MAVIS

* **Step 3 (Live Runtime Observation)**: `MAVIS.Runner` truyền biến môi trường `OTEL_EXPORTER_OTLP_ENDPOINT` vào từng container .NET trong Docker Compose. Nhờ cấu hình chuẩn ở trên, toàn bộ vết gọi (`Spans`), chỉ số **RED Metrics** (*Rate, Errors, Duration*) và thông tin lỗi sẽ chảy thẳng về đồ thị sống 2D/3D của MAVIS!
* **So sánh Static (Roslyn) vs. Runtime (OTel)**: Sinh viên kiểm chứng trực tiếp sự khớp nối giữa cạnh tĩnh `Ordering.API -> Catalog.API` và vết gọi thực tế lúc chạy.

### 11.4. Bài tập thực hành Lab 11

* Gửi kịch bản đặt hàng trong **MAVIS Step 3** và mở bảng **OpenTelemetry Trace**.
* Xác định `TraceId` chung, chỉ ra thành phần chiếm độ trễ lớn nhất và kiểm tra xem các lời gọi `/health/live` có được lọc sạch khỏi trace nghiệp vụ hay chưa.

### 11.5. Ngân hàng Quiz Gate — Chương 11

**Câu 11.1**: Tại sao endpoint **Liveness (`/health/live`)** KHÔNG nên kiểm tra kết nối tới cơ sở dữ liệu hay dịch vụ bên ngoài?
* A. Vì nếu cơ sở dữ liệu chỉ chập chờn $2$ giây mà Liveness trả `Unhealthy`, Docker/Kubernetes sẽ khởi động lại (restart) đồng loạt mọi container dịch vụ gây sập nặng thêm; việc kiểm tra DB nên đặt ở **Readiness (`/health/ready`)**
* B. Vì ASP.NET Core không cho phép kiểm tra PostgreSQL trong Health Checks
* C. Vì Liveness chỉ chạy trên Windows
* D. Vì Liveness không trả về mã HTTP

> **Đáp án đúng: A.** *Giải thích*: Liveness chỉ kiểm tra bản thân tiến trình có bị treo/deadlock không; Readiness mới quyết định container có đủ điều kiện (DB/Redis sẵn sàng) để nhận traffic hay chưa.

**Câu 11.2**: Biến môi trường tiêu chuẩn nào của **OpenTelemetry** giúp dịch vụ .NET tự biết địa chỉ gửi dữ liệu Traces và Metrics về Collector của MAVIS mà không cần hard-code trong C#?
* A. `DOTNET_ENVIRONMENT`
* B. `OTEL_EXPORTER_OTLP_ENDPOINT`
* C. `ASPNETCORE_URLS`
* D. `POSTGRES_PASSWORD`

> **Đáp án đúng: B.** *Giải thích*: `AddOtlpExporter()` tự động đọc biến môi trường chuẩn W3C/CNCF `OTEL_EXPORTER_OTLP_ENDPOINT`.

**Câu 11.3**: Trong .NET 8, OpenTelemetry tự động gắn kết các Span giữa `ApiGateway`, `Ordering.API` và `Catalog.API` vào chung một cây vết phân tán nhờ cơ chế nào?
* A. Truyền tiêu chuẩn W3C **`traceparent`** trong HTTP Header (quản lý nội tại bởi `System.Diagnostics.Activity`)
* B. Lưu chung file log vào thư mục `C:\Temp`
* C. So khớp tên phương thức C# giống nhau
* D. Chia sẻ chung một biến `static` giữa các container

> **Đáp án đúng: A.** *Giải thích*: `HttpClientInstrumentation` tự động chèn header `traceparent` lúc gửi đi và `AspNetCoreInstrumentation` tự động đọc lại ở dịch vụ nhận.

**Câu 11.4**: Tại sao nên cấu hình bộ lọc bỏ qua các đường dẫn `/health` trong `AddAspNetCoreInstrumentation`?
* A. Để tránh các đợt kiểm tra sức khỏe định kỳ mỗi vài giây từ Docker làm ngập rác hệ thống thu thập Trace và làm lệch thống kê độ trễ nghiệp vụ
* B. Vì `/health` luôn gây lỗi `500`
* C. Vì OpenTelemetry không đọc được phương thức `GET`
* D. Để tăng gấp đôi dung lượng RAM sử dụng

> **Đáp án đúng: A.** *Giải thích*: Lọc nhiễu healthcheck giúp biểu đồ trace tập trung 100% vào lưu lượng nghiệp vụ thật.

---

# 🚀 MODULE 5: ĐÓNG GÓI, KIỂM THỬ & VẬN HÀNH PRODUCTION-READY

## CHƯƠNG 12: DOCKER MULTI-STAGE BUILD (.NET 8), KIỂM THỬ & PRODUCTION-READINESS CHECKLIST

* **Mã chương**: `CSHARP-CH12` | **Học phần**: Module 5
* **Nguồn chuẩn**: `[MS24]` Ch.4 (*Docker Containers*) & Ch.9 (*Testing ASP.NET Core Services*); `[F16]` Ch.3 (*Deployment Pipeline*), Ch.4 (*Scalability*) & Appendix A (*Production-Readiness Checklist*).
* **Mục tiêu học tập**:
  1. Viết **Multi-Stage `Dockerfile`** chuẩn **.NET 8** (dùng `sdk:8.0` để build $\to$ `aspnet:8.0` cực nhẹ để chạy, chạy non-root user `app` có sẵn trong .NET 8, mặc định cổng `8080`).
  2. Viết **`docker-compose.yml`** chuẩn xác cho MAVIS Sandbox (có `healthcheck`, `depends_on: condition: service_healthy`, **không khóa cứng `container_name` và cổng host** ở dịch vụ cần Scale $1 \to 8$).
  3. Áp dụng chiến lược kiểm thử .NET Microservices (**xUnit**, **`WebApplicationFactory<Program>`**, **Testcontainers**) và đánh giá hệ thống theo **Production-Readiness Checklist**.

### 12.1. Multi-Stage `Dockerfile` chuẩn .NET 8 (Gọn nhẹ & Non-Root mặc định)

Từ **.NET 8**, image chính chủ `mcr.microsoft.com/dotnet/aspnet:8.0` mang lại hai nâng cấp rất giá trị cho bảo mật và vận hành:
1. Có sẵn người dùng không có quyền root tên **`app`** (`USER $APP_UID`).
2. Cổng mặc định chuyển từ `80` (cần quyền root) sang **`8080`** (`ASPNETCORE_HTTP_PORTS=8080`).

```dockerfile
# Stage 1: Restore & Publish bằng .NET 8 SDK
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

# Tận dụng Docker Layer Cache: copy .csproj và restore trước khi copy toàn bộ source
COPY ["src/Services/Catalog/Catalog.API/Catalog.API.csproj", "src/Services/Catalog/Catalog.API/"]
COPY ["src/BuildingBlocks/EventBus.Contracts/EventBus.Contracts.csproj", "src/BuildingBlocks/EventBus.Contracts/"]
RUN dotnet restore "src/Services/Catalog/Catalog.API/Catalog.API.csproj"

COPY . .
WORKDIR "/src/src/Services/Catalog/Catalog.API"
RUN dotnet publish "Catalog.API.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Stage 2: Runtime siêu gọn chỉ chứa ASP.NET Core 8 Runtime + Non-Root User
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS final
WORKDIR /app
COPY --from=build /app/publish .

USER $APP_UID
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:8080/health/ready || exit 1

ENTRYPOINT ["dotnet", "Catalog.API.dll"]
```

### 12.2. `docker-compose.yml` chuẩn sẵn sàng cho MAVIS Studio (`Scale 1 -> 8`)

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

  catalog-api:
    build:
      context: .
      dockerfile: src/Services/Catalog/Catalog.API/Dockerfile
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ConnectionStrings__CatalogDb: Host=catalog-db;Port=5432;Database=catalog_db;Username=${DB_USER:-postgres};Password=${DB_PASSWORD:-postgres}
      OTEL_EXPORTER_OTLP_ENDPOINT: ${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4317}
    depends_on:
      catalog-db:
        condition: service_healthy
    networks: [mavis-net]
    # KHÔNG đặt container_name hay ports cố định (vd: 5001:8080) để scale thoải mái 1 -> 8!

  api-gateway:
    build:
      context: .
      dockerfile: src/Gateways/ApiGateway/Dockerfile
    ports:
      - "8080:8080"   # Chỉ phơi cổng host tại điểm vào duy nhất!
    depends_on:
      catalog-api:
        condition: service_healthy
    networks: [mavis-net]

networks:
  mavis-net:
    driver: bridge
```

### 12.3. Chiến lược Kiểm thử Microservices trong .NET (`[MS24]` Ch.9)

| Tầng kiểm thử | Công cụ chuẩn .NET 8 | Mục tiêu kiểm chứng |
| --- | --- | --- |
| **Unit Test** (Nhiều nhất, chạy ms) | **xUnit** + **NSubstitute / Moq** + **FluentAssertions** | Test Domain Aggregate (`Order.AddItem`, `Cancel`), Value Object, Saga state logic. |
| **Integration / Component Test** | **`WebApplicationFactory<Program>`** + **Testcontainers for .NET** | Khởi chạy toàn bộ pipeline ASP.NET Core trong bộ nhớ kết nối PostgreSQL/Redis thật trong container tạm, test đầy đủ routing, auth, validation, EF Core query. |
| **End-to-End (E2E) Test** (Ít, chọn lọc) | Docker Compose + kịch bản HTTP | Kiểm chứng luồng đặt hàng xuyên suốt từ `ApiGateway` qua các service. |

### 12.4. Production-Readiness Checklist cho .NET Microservices (`[F16]` Appendix A)

1. **Ổn định & Tin cậy**: Multi-stage build non-root; DI lifetime sạch (không Captive Dependency); có `AddStandardResilienceHandler` (Timeout, Retry + Jitter, Circuit Breaker); có Outbox & Idempotency Key; pipeline triển khai qua Staging $\to$ Canary ($5\%\text{–}10\%$) $\to$ Production.
2. **Hiệu năng & Mở rộng**: Tách Database-per-Service; dùng `.AsNoTracking()` cho truy vấn đọc; truyền đủ `CancellationToken`; bỏ `container_name` và cổng host cứng để scale ngang mượt mà.
3. **Giám sát & Bảo mật**: Có `/health/live` & `/health/ready`; tích hợp OpenTelemetry OTLP; xử lý lỗi qua `IExceptionHandler` (`ProblemDetails`, không lộ stack trace); không hard-code secret.
4. **Tài liệu & Kiến trúc**: Sơ đồ C1–C3 và tài liệu OpenAPI (Swagger) luôn đồng bộ với mã nguồn.

### 12.5. Góc nhìn trên nền tảng MAVIS

* **Step 3 & Step 4 (`WF-04`)**: Sinh viên thực hiện trọn vẹn 4 bước — kiểm tra tĩnh Roslyn (C1–C3 & 3E) $\to$ Reverse BFS & vượt Quiz Gate ($\ge 70\%$) $\to$ quan sát OTel Traces $\to$ thực hành **Stop / Scale ($1 \to 4$)** trên **MAVIS Studio** và nộp gói Snapshot Before/After + giải trình để giảng viên chấm theo thang Rubric $0\text{–}10$ (đạt $> 5.0$ để mở Lab kế tiếp).

### 12.6. Bài tập thực hành Lab 12 (Tổng kết khóa học)

* Kiểm tra toàn bộ `Dockerfile` và `docker-compose.yml` của kho .NET mẫu theo **Production-Readiness Checklist**.
* Thực hiện kịch bản **Scale** `Catalog.API` từ $1 \to 4$ container trên **MAVIS Studio**, chụp Snapshot **Before vs. After** và giải thích cách Docker DNS cân bằng tải lưu lượng mà không cần sửa mã nguồn `Ordering.API` hay `ApiGateway`.

### 12.7. Ngân hàng Quiz Gate — Chương 12

**Câu 12.1**: Trong `Dockerfile` Multi-Stage của .NET 8, tại sao nên `COPY` file `.csproj` và chạy `dotnet restore` **trước** khi `COPY . .` toàn bộ mã nguồn C#?
* A. Để tận dụng **Docker Layer Caching** — khi chỉ sửa code `.cs` mà không đổi gói NuGet, Docker tái sử dụng lại lớp restore cũ giúp tốc độ build nhanh hơn rất nhiều
* B. Vì lệnh `dotnet publish` sẽ bị lỗi cú pháp nếu không làm vậy
* C. Để xóa bỏ toàn bộ file `.cs` trước khi biên dịch
* D. Để ép container chạy bằng quyền `root`

> **Đáp án đúng: A.** *Giải thích*: Tối ưu tầng cache là thực hành cốt lõi giúp CI/CD build Microservices trong vài giây thay vì vài phút.

**Câu 12.2**: Từ phiên bản **.NET 8**, image chính thức `mcr.microsoft.com/dotnet/aspnet:8.0` mang lại cải tiến bảo mật mặc định nào?
* A. Tắt hoàn toàn giao thức HTTP
* B. Hỗ trợ sẵn người dùng không có quyền quản trị (`USER $APP_UID` — non-root) và đổi cổng mặc định từ `80` sang **`8080`**
* C. Gỡ bỏ hoàn toàn Entity Framework Core
* D. Tự động mã hóa file `Dockerfile`

> **Đáp án đúng: B.** *Giải thích*: Chạy container bằng non-root user (`$APP_UID`) giảm mạnh rủi ro leo thang đặc quyền nếu ứng dụng bị tấn công.

**Câu 12.3**: Công cụ nào trong hệ sinh thái .NET 8 cho phép viết **Integration Test** chạy toàn bộ pipeline Middleware, Routing, DI và Controller của một ASP.NET Core Microservice mà không cần triển khai lên máy chủ thật?
* A. `Console.WriteLine`
* B. **`WebApplicationFactory<Program>`** (kết hợp xUnit và Testcontainers)
* C. `Task.Delay`
* D. `Microsoft Paint`

> **Đáp án đúng: B.** *Giải thích*: `WebApplicationFactory<Program>` dựng một `TestServer` in-memory chuẩn xác giúp kiểm thử hành vi HTTP + DB thật siêu nhanh và tin cậy.

**Câu 12.4**: Vì sao khi cấu hình `docker-compose.yml` cho một dịch vụ .NET cần chạy thử nghiệm **Scale $1 \to 4$** trên MAVIS Studio, ta phải **bỏ** dòng `ports: ["5001:8080"]` và `container_name`?
* A. Vì 4 bản sao container chạy song song trên cùng một máy chủ không thể cùng chiếm chung một cổng host (`5001`) hay trùng một `container_name` duy nhất
* B. Vì .NET 8 chỉ chạy được trên cổng `80`
* C. Vì Docker không cho phép chạy quá 1 container .NET
* D. Vì YARP không thể định tuyến tới cổng `8080`

> **Đáp án đúng: A.** *Giải thích*: Chỉ phơi cổng host ở `ApiGateway`; các dịch vụ nội bộ giao tiếp qua mạng nội bộ Docker và để Docker DNS tự cân bằng tải giữa các replica.

---

# 📎 PHỤ LỤC CHUẨN HÓA TÍCH HỢP VÀO HỆ THỐNG MAVIS

## PHỤ LỤC A: BẢNG ÁNH XẠ 12 CHƯƠNG C# ↔ TÀI LIỆU MICROSOFT ↔ 4 BƯỚC WORKSPACE MAVIS

| Chương | Chủ đề cốt lõi | Nguồn chuẩn | Điểm nhấn trên Roslyn & 4 Bước MAVIS |
| --- | --- | --- | --- |
| **01** | Containerized .NET Microservices, C1–C3 & `.sln` | `[MS24]` Ch.1 & 4, `[F16]` Ch.1 | **Step 1**: Roslyn đọc `.csproj` $\to$ C1/C2/C3 & chặn UML tĩnh (`BR-05`) |
| **02** | DDD, Bounded Context & CQRS trong .NET | `[MS24]` Ch.5 & 7 | **Step 1**: Tách rõ dịch vụ CRUD vs. DDD Aggregate sạch ranh giới |
| **03** | ASP.NET Core 8 C3, DI Lifetime & `IExceptionHandler` | `[MS24]` Ch.6, `[STD]` .NET 8 | **Step 1**: C3 (`Controller -> Service -> DbContext`) & kiểm soát DI |
| **04** | Docker DNS Discovery & `IOptions<T>` External Config | `[MS24]` Ch.4, `[F16]` Ch.3 | **Step 1 & 4**: Ánh xạ `appsettings.json` + Docker DNS, Scale động |
| **05** | YARP API Gateway & Bảo mật JWT Bearer / RBAC | `[MS24]` Ch.4 & 11, `[STD]` YARP | **Step 1 & 4**: C1/C2 Entry Point & kiểm chứng SPOF khi Stop Gateway |
| **06** | `IHttpClientFactory` (Typed Client), `CALL_SITE` & Reverse BFS | `[MS24]` Ch.4 & 8, MAVIS `D2/D4` | **Step 1 & 2**: Roslyn trích `CALL_SITE`, **Reverse BFS**, DFS 3 màu |
| **07** | Database-per-Service (EF Core 8), Shared DB & Redis | `[MS24]` Ch.4 & 7, `[F16]` Ch.4 | **Step 1**: 3E Rule phát hiện `SHARED_DATABASE`, Polyglot Persistence |
| **08** | Event Bus (RabbitMQ), Idempotency & Outbox Log | `[MS24]` Ch.4 & 6 | **Step 3 & 4**: Stop Consumer (`Basket.API`), quan sát cô lập lỗi |
| **09** | Saga Pattern, Compensation & Eventual Consistency | `[MS24]` Ch.4, `[R19]` Ch.4 | **Step 2 & 3**: Theo dõi bù trừ tồn kho & trạng thái đơn hàng |
| **10** | Polly v8 & `Microsoft.Extensions.Http.Resilience` | `[MS24]` Ch.8, `[F16]` Ch.3 | **Step 4**: Stop hạ lưu trên MAVIS Studio, đo Fail-Fast & Circuit Breaker |
| **11** | Health Checks (`/live`, `/ready`) & OpenTelemetry .NET | `[MS24]` Ch.8 & 10, `[F16]` Ch.7 | **Step 3**: Live OTel Traces/Spans/Metrics trên đồ thị 2D/3D |
| **12** | Multi-Stage Docker (.NET 8), Testing & Prod-Readiness | `[MS24]` Ch.4 & 9, `[F16]` App.A | **Step 3 & 4**: Runner Preflight, Scale $1 \to 4$, Nộp gói 4 bước (`WF-04`) |

## PHỤ LỤC B: CẤU TRÚC JSON CHUẨN ĐỂ NẠP VÀO APP MAVIS (`java-csharp-v1.json`)

Mỗi chương trong giáo trình C# ánh xạ đối xứng hoàn toàn với nhánh Java trong file `java-csharp-v1.json` (`track: "CSHARP"`, ngưỡng qua cổng `passPercent: 70`):

```json
{
  "id": "csharp-ch06-typed-httpclient-reverse-bfs",
  "track": "CSHARP",
  "module": 2,
  "chapterOrder": 6,
  "phase": "COMMUNICATION",
  "title": "Giao tiếp đồng bộ với IHttpClientFactory (Typed Client), Roslyn CALL_SITE & Reverse BFS",
  "passPercent": 70,
  "objective": [
    "Giải thích được lỗi Socket Exhaustion của new HttpClient() và cách IHttpClientFactory khắc phục.",
    "Triển khai Typed HttpClient sạch để MAVIS.Worker (Roslyn) trích xuất chính xác bằng chứng CALL_SITE.",
    "Vận dụng Cycle-Safe Reverse BFS và DFS 3 màu để xác định Direct/Indirect Callers và Isolated Nodes."
  ],
  "sources": [
    "Microsoft Learn - .NET Microservices: Architecture for Containerized .NET Applications, Chapters 4 & 8",
    "MAVIS Architecture Specification - D2 (Epistemic Honesty) & D4 (Cycle-Safe Reverse BFS)"
  ],
  "lesson": "<Nội dung Markdown phần 6.1 đến 6.4 của Chương 06>",
  "exercise": "<Nội dung Lab 06 gắn với Curated .NET Reference Repo>",
  "questions": [
    {
      "id": "csharp-ch06-q1",
      "prompt": "Hậu quả nghiêm trọng nhất khi tạo using var client = new HttpClient() liên tục trong mỗi HTTP Request ở hệ thống .NET chịu tải cao là gì?",
      "options": [
        "Dẫn tới Socket Exhaustion (cạn kiệt cổng TCP ở trạng thái TIME_WAIT) và gây SocketException hàng loạt",
        "Làm mất toàn bộ dữ liệu trong bảng SQL",
        "Khiến trình biên dịch C# báo lỗi cú pháp",
        "Làm giảm độ phân giải ảnh"
      ],
      "correctIndex": 0,
      "explanation": "IHttpClientFactory quản lý vòng đời HttpMessageHandler giúp tái sử dụng socket và tự động làm mới DNS."
    }
  ]
}
```

## PHỤ LỤC C: CHECKLIST 10 TIÊU CHÍ CHO REPO GITHUB MẪU C# (PROJECT TRÁI CÂY — `fruit-shop-dotnet-microservices`)

Khi xây dựng kho mã nguồn mẫu C#/.NET (**Project Trái Cây** theo đúng yêu cầu nhóm trưởng Vũ) để khớp 100% với bộ giáo trình 12 chương này, Solution cần đạt trọn bộ 10 tiêu chí sau:

* [ ] **1. C# 12 / .NET 8 LTS sạch chuẩn C3**: Cấu trúc 1 file `.sln` gọn gàng với 4 dự án chính (`ApiGateway`, `FruitCatalog.API`, `FruitBasket.API`, `FruitOrdering.API`) + `EventBus.Contracts`, dùng `record` DTO, Primary Constructors và `IExceptionHandler` (`ProblemDetails`).
* [ ] **2. YARP API Gateway + JWT Bearer / RBAC**: Định tuyến rõ ràng từ `ApiGateway` sang 3 dịch vụ phía sau qua Docker DNS, tích hợp Rate Limiter tích hợp sẵn của .NET 8.
* [ ] **3. Database-per-Service & Polyglot Persistence**: `FruitCatalog.API` dùng PostgreSQL (`catalog_db` + EF Core 8), `FruitBasket.API` dùng Redis (`IDistributedCache` + TTL), `FruitOrdering.API` dùng PostgreSQL (`ordering_db` + EF Core 8) — đảm bảo 0 lỗi `SHARED_DATABASE`.
* [ ] **4. Giao tiếp đồng bộ Typed `HttpClient` có `CALL_SITE` chuẩn Roslyn**: `FruitOrdering.API` gọi `FruitCatalog.API` (kiểm tra & giữ/hoàn kho trái cây) và `FruitBasket.API` qua Typed `HttpClient` để Roslyn trích xuất cạnh `SERVICE_HTTP_CALL` sắc nét và chạy **Reverse BFS** đủ cả `Direct Callers` & `Indirect Callers`.
* [ ] **5. Event Bus (RabbitMQ / MassTransit) + Idempotency + Saga Compensation**: Khi tạo đơn thành công thì phát `OrderCreatedIntegrationEvent` để `FruitBasket.API` tự xóa giỏ hàng; khi một loại trái cây hết hàng thì chạy bù trừ hoàn kho sạch sẽ + chống đặt trùng bằng `Idempotency-Key`.
* [ ] **6. Chịu lỗi bằng `Microsoft.Extensions.Http.Resilience` (Polly v8)**: Gắn `AddStandardResilienceHandler()` cho Typed `HttpClient` để demo **Stop Container** trên MAVIS Studio thấy rõ Retry $\to$ Circuit Breaker `OPEN` $\to$ Fail-Fast `503`.
* [ ] **7. Health Checks chuẩn `/health/live` & `/health/ready`**: Mọi service tách bạch Liveness và Readiness dùng cho `docker-compose.yml` `condition: service_healthy`.
* [ ] **8. Sẵn sàng OpenTelemetry .NET & Scale `1 -> 8`**: Cài sẵn `AddOpenTelemetry()` đọc `OTEL_EXPORTER_OTLP_ENDPOINT`; không hard-code `container_name` hay cổng host cố định trên 3 dịch vụ nghiệp vụ.
* [ ] **9. Chạy 100% cục bộ trong Sandbox, không phụ thuộc bên ngoài**: Mọi dịch vụ chạy mượt qua một lệnh `docker compose up -d --build`, có sẵn seed data trái cây sạch tự nạp khi khởi động (Xoài Cát Hòa Lộc, Sầu Riêng Ri6, Bưởi Da Xanh, Thanh Long Ruột Đỏ, Cam Sành...).
* [ ] **10. Sạch Secret 100%**: Toàn bộ chuỗi kết nối và `Jwt:SigningKey` cấu hình qua biến môi trường + `ValidateOnStart()`, đi kèm `.env.example`, không commit bất kỳ mật khẩu thật nào lên GitHub.