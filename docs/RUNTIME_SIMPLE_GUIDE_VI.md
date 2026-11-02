# Hướng Dẫn Hiểu & Sử Dụng MAVIS Runtime (Dành Cho Mọi Người — Không Cần Biết Code)

Hãy tưởng tượng một phần mềm bán hàng (như **Mộc Hương Shop**) giống như **một nhà hàng lớn** gồm nhiều bộ phận:
- **Quầy Lễ Tân** (*API Gateway*): Nơi tiếp đón mọi khách hàng bước vào.
- **Bộ Phận Thẻ Thành Viên** (*Identity Service*): Làm thẻ khách hàng, kiểm tra đăng nhập, lưu địa chỉ giao hàng.
- **Kho Hàng & Thực Đơn** (*Catalog Service*): Quản lý danh mục sản phẩm, số lượng tồn kho.
- **Quầy Thu Ngân & Đơn Hàng** (*Order Service*): Tính tiền, áp mã giảm giá, chốt đơn.
- **Bộ Phận Gửi Tin Nhắn** (*Notification Service*): Gửi email/thông báo khi khách đặt hàng thành công.

---

## Tại sao cần "Chạy Thử Thực Tế" (Runtime)?

Khi bạn mới tải một dự án lên MAVIS, hệ thống đọc bản thiết kế trên giấy (**Phân tích tĩnh - Static**).
- **Đọc bản thiết kế trên giấy** giống như nhìn sơ đồ mặt bằng nhà hàng: bạn biết có mấy phòng, phòng nào đặt cạnh phòng nào, nhưng **chưa biết khi có khách thật vào mua hàng thì các bộ phận phối hợp với nhau có trơn tru không, ai gọi ai trước, ai gọi ai sau**.
- **MAVIS Runtime** chính là việc **mở cửa nhà hàng trong một phòng mô phỏng an toàn, cử một "khách hàng ảo" vào mua thử một đơn hàng từ đầu đến cuối**, và gắn camera ghi lại toàn bộ hành trình đó.

Toàn bộ quá trình này chỉ gồm **3 bước (Step 1 $\to$ Step 2 $\to$ Step 3)** và **2 màn hình xem kết quả (Graph & Diagrams)**.

---

## Bước 1 (Step 1): Kiểm Tra & Chuẩn Bị Phòng Mô Phỏng (*Runtime Configuration*)

### Hệ thống làm gì ở bước này?
Giống như trước khi mở cửa nhà hàng, quản lý đi kiểm tra một vòng xem:
1. **Có bao nhiêu bộ phận (phòng ban) cần bật điện?** (Ví dụ: Lễ tân, Thành viên, Kho hàng, Đơn hàng, Thông báo, Sổ dữ liệu).
2. **Các thông tin cài đặt (chìa khóa, mật khẩu két sắt, địa chỉ kết nối) đã điền đủ chưa?** Nếu thiếu hoặc chưa hợp chuẩn an toàn, hệ thống tự động điền giúp các giá trị mặc định an toàn để chạy thử.
3. **Danh sách các "quầy giao dịch" (API) đang mở là gì?** Hệ thống tự rà soát xem nhà hàng có những quầy nào (Đăng ký, Đăng nhập, Xem sản phẩm, Tạo mã giảm giá, Đặt hàng, Thanh toán...).

### Ví dụ đơn giản hóa
- Trong dự án gốc của lập trình viên, có những cài đặt chỉ chạy được trên máy cá nhân của họ.
- Ở **Step 1**, MAVIS tự động dọn dẹp và đóng gói toàn bộ nhà hàng vào một **"phòng kính cách ly" (Sandbox)**, cấp sẵn điện nước và gắn sẵn camera theo dõi ở từng cửa phòng.

### Bạn cần làm gì?
- Gần như **không cần sửa gì cả** vì hệ thống đã tự động cấu hình xanh (**Ready**).
- Bạn chỉ cần bấm nút **Next: Step 2 (Scenarios) $\to$** để sang bước lên kịch bản.

---

## Bước 2 (Step 2): Lên Kịch Bản Cho "Khách Hàng Ảo" Đi Mua Sắm (*Runtime Scenarios*)

### Hệ thống làm gì ở bước này?
Thay vì bắt bạn tự nghĩ xem phải bấm nút gì, điền thông tin gì, **Trí tuệ nhân tạo (AI)** của MAVIS đọc toàn bộ danh sách các quầy giao dịch từ Step 1 và tự viết sẵn một **Kịch bản đóng vai từ đầu đến cuối**.

Hệ thống gom các hành động thành **4 cụm công việc dễ hiểu** (hiển thị thành 4 ô màu trên màn hình):

1. **Cụm 1 — Đăng ký & Đăng nhập (*Auth & User Identity*)**:
   - *Ví dụ*: Khách hàng ảo đăng ký tài khoản mới (`admin@example.org`), sau đó đăng nhập để lấy **"Thẻ ra vào" (`AUTH_TOKEN`)**. Có thẻ này thì mới đi vào các quầy bên trong được.
2. **Cụm 2 — Kiểm tra Hàng hóa & Khuyến mãi (*Catalog & Inventory*)**:
   - *Ví dụ*: Khách hàng ảo xem danh mục hàng, lấy mã sản phẩm đang có sẵn trong kho (`PRODUCT_ID`), và tạo một mã giảm giá (`COUPON`).
3. **Cụm 3 — Điền Địa chỉ & Chốt Đơn Hàng (*Order & Coupon Checkout*)**:
   - *Ví dụ*: Khách hàng ảo lưu địa chỉ nhận hàng (Số nhà, Quận/Huyện), sau đó bấm **Đặt mua sản phẩm** (`Checkout`).
4. **Cụm 4 — Kiểm tra Thanh toán (*Order & Payment Verification*)**:
   - *Ví dụ*: Khách hàng ảo yêu cầu hệ thống xuất đường link thanh toán cho đơn hàng vừa đặt.

### Điểm thông minh của Step 2: "Bước sau tự nhớ thông tin của bước trước"
- Giống như ngoài đời: ở Bước 1 bạn nhận được **Thẻ thành viên**, thì sang Bước 2, Bước 3 bạn phải cầm chính chiếc thẻ đó đưa cho nhân viên.
- MAVIS tự động lấy kết quả của bước trước (như `Thẻ đăng nhập`, `Mã sản phẩm`, `Mã đơn hàng`) để điền tiếp vào bước sau.

### Các nút chọn nhanh (Preset) dùng để làm gì?
- **Full End-to-End Flow**: Cho khách hàng ảo đi trọn vẹn cả 4 cụm từ lúc đăng ký đến lúc thanh toán.
- **Auth Only / Catalog Only / Order Only**: Nếu bạn chỉ muốn kiểm tra riêng bộ phận Đăng nhập, hoặc riêng bộ phận Kho hàng, chỉ cần bấm vào nút tương ứng.

### Bạn cần làm gì?
- Xem qua kịch bản AI đã dựng sẵn (có thể bấm **Regenerate** nếu muốn AI viết lại kịch bản mới).
- Bấm nút **Confirm & Run in Step 3 $\to$** để bắt đầu cho khách hàng ảo chạy thật.

---

## Bước 3 (Step 3): Mở Cửa Chạy Thử & Xem Kết Quả Trực Tiếp (*Runtime Sessions*)

### Hệ thống làm gì ở bước này?
Khi bạn bấm chạy, MAVIS thực hiện 4 việc hoàn toàn tự động:
1. **Khởi động toàn bộ các bộ phận của phần mềm** lên như ngoài đời thật.
2. **Đợi tất cả các bộ phận sẵn sàng 100%** (mọi phòng đều bật đèn xanh).
3. **Cho "Khách hàng ảo" thực hiện lần lượt từng bước** trong kịch bản ở Step 2.
4. **Thu thập băng ghi hình (Trace)** từ các camera gắn ở từng bộ phận để vẽ lại sơ đồ kết quả.

### Cách đọc màn hình kết quả ở Step 3 (Từ trên xuống dưới):

1. **Thanh 4 Cụm Tính Năng (*API Feature Flow Clusters*)**:
   - Bạn có thể bấm vào **Full End-to-End** để xem toàn cảnh, hoặc bấm vào từng ô (**1. Auth**, **2. Catalog**, **3. Order**, **4. Payment**) để chỉ soi riêng khu vực đó.
2. **Bản Đồ Các Bộ Phận Đã Gọi Nhau (*Observed Service Call Topology*)**:
   - Cho biết trong lúc khách hàng ảo đi mua hàng, những bộ phận nào đã thực sự nói chuyện với nhau (ví dụ: *Quầy Lễ Tân* gọi *Bộ phận Thành Viên*, *Quầy Đơn Hàng* gọi *Kho Hàng* để trừ tồn kho và bắn tin sang *Bộ phận Thông Báo*).
3. **Biểu Đồ Trình Tự Thời Gian (*Runtime Sequence Diagram*)**:
   - Đọc từ **trái sang phải** là tên các bộ phận, đọc từ **trên xuống dưới** là thứ tự thời gian (ai gọi ai trước, mất bao nhiêu phần nghìn giây, thành công màu xanh `200/201` hay lỗi màu đỏ `500`).
4. **Bảng Chi Tiết Từng Bước (*Scenario HTTP Step Verification*)**:
   - Báo cáo từng bước một: Bước #1 Pass (Đạt), Bước #2 Pass (Đạt)...

---

## Sau Step 3: Xem Bản Thiết Kế Đã Được "Chứng Thực" (*Architecture Graph & Diagrams*)

Sau khi chạy xong Step 3, ở cuối trang sẽ xuất hiện khung màu xanh ngọc **RUNTIME-ENRICHED ARCHITECTURE REVISION READY** với 2 nút bấm:

### 1. Nút `Architecture Graph` (Bản đồ tổng thể toàn hệ thống)
- **Màu xanh dương / tím nhạt**: Là những bộ phận và đường nối đọc được từ bản vẽ thiết kế ban đầu (bao gồm cả Kho dữ liệu, Bảng tin nội bộ).
- **Đường kẻ màu xanh ngọc đậm (Emerald Green)**: Là những đường đi **đã được chứng thực 100% bằng thực tế** khi khách hàng ảo vừa chạy qua ở Step 3. Bạn có thể bấm nút **Filter Runtime Calls Only** ở góc phải để chỉ hiện những đường đã chạy thật.

### 2. Nút `Architecture Diagrams` (Sơ đồ chuẩn để báo cáo / chỉnh sửa trên Draw.io)
- Tự động chuyển toàn bộ hành trình chạy thật vừa rồi thành **Sơ đồ kỹ thuật chuẩn quốc tế** ngay trên bảng vẽ **Draw.io**.
- Tại đây bạn có thể:
  - Phóng to, thu nhỏ, kéo thả chỉnh sửa từng ô nếu muốn trình bày đẹp hơn.
  - Bấm **Download SVG**, **Print / Save PDF**, hoặc **Download .drawio** để chèn ngay vào báo cáo, khóa luận hoặc tài liệu dự án.

---

## Tóm Tắt Trong 3 Câu

1. **Step 1 (Chuẩn bị)**: Kiểm tra phần mềm có bao nhiêu bộ phận và tự động lắp đặt phòng chạy thử an toàn.
2. **Step 2 (Lên kịch bản)**: AI tự viết kịch bản đóng vai người dùng thật (Đăng ký $\to$ Xem hàng $\to$ Đặt đơn $\to$ Thanh toán).
3. **Step 3 (Chạy & Ghi hình)**: Bật phần mềm lên chạy thật theo kịch bản, ghi lại chính xác các bộ phận gọi nhau như thế nào và xuất ra Bản đồ / Sơ đồ báo cáo.
