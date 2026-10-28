# MAVIS — Plan cải thiện Graph tổng quan theo service

Ngày: 2026-10-28.
Trạng thái: ĐỀ XUẤT TRIỂN KHAI; tài liệu này chưa thay đổi hành vi sản phẩm.

## 1. Mục tiêu và phạm vi

Người dùng nhìn ra các service liên quan với nhau mà không phải đọc một mạng mũi tên chồng chéo. Thông tin kỹ thuật mở theo nhu cầu, không bị xóa khỏi model.

Plan này thay thế riêng phần Graph tổng quan trong GRAPH_C4_4PLUS1_3E_SCOPE_PLAN_2026-10-23.md. Chín loại Diagram, analyzer và ý nghĩa 3E giữ phạm vi hiện có. Không chuyển Graph thành cây, không thay đổi dữ liệu gốc để phục vụ hình thức.

Các vấn đề được đối chiếu từ code và ảnh:
- Projection hiện gom theo nguồn, đích, protocol và originLayer, nên một cặp service có nhiều đường.
- Renderer luôn vẽ đầu mũi tên trong Analysis và dùng đường cong để tách các cạnh song song.
- Một số node chưa phân loại hoặc chưa có service cha vẫn có thể xuất hiện ở overview.
- 3E dùng ID thật của element/relationship; không thể đưa một ID nhóm mới vào API như một quan hệ thật.
- Đã có cơ chế giữ camera, vị trí kéo và bộ lọc loại; cần tiếp tục bảo toàn các hành vi này.

## 2. Trải nghiệm đích

Graph có hai mức hiển thị, dùng chung project và model revision:

### Tổng quan — mặc định
- Chỉ hiện các service được model xác định là SERVICE_CONTAINER; giữ cả service độc lập.
- Đề xuất node dạng thẻ bo góc để tên service dài dễ đọc, tên tối đa hai dòng và có tooltip đầy đủ. Không dùng tiền tố [SVC] cho mọi node.
- Mỗi cặp service có tối đa một đường nối không đầu mũi tên, không tạo đường song song theo protocol/origin.
- Đường nối có nghĩa là có quan hệ trực tiếp được ghi nhận giữa hai service. Không ngụ ý chiều gọi, luồng nghiệp vụ, traffic hay trạng thái sức khỏe.
- Màu và kích thước mặc định trung tính, nhất quán; không suy ra healthy/unhealthy từ degree hoặc màu node.
- Hover đường nối: ví dụ "4 quan hệ · có cả hai hướng". Chỉ ghi số chiều khi model có thông tin tương ứng.
- Bấm service: giữ service và các hàng xóm trực tiếp nổi bật; phần còn lại mờ đi; mở chi tiết service.
- Bấm đường nối: mở bảng quan hệ giữa đúng hai service, sau đó chọn một quan hệ thật để xem 3E.
- Bấm nền/Escape để bỏ chọn. Search tập trung/highlight service, không tự tạo liên kết hoặc làm người dùng hiểu nhầm đã lọc dữ liệu.

### Chi tiết — khi cần phân tích
- Hiển thị chiều của từng quan hệ, loại, nguồn và trạng thái bất định.
- Có thể bật database, messaging, external system, component và phần chưa phân loại.
- Có thể mở nội bộ service mà vẫn ở cùng Graph/model revision.
- Thay lựa chọn Analysis/Explore hiện tại bằng Tổng quan/Chi tiết. Hiệu ứng trang trí không là chế độ chính thứ ba; đánh giá tái sử dụng ở phần tùy chọn thay vì nhân đôi giao diện.

## 3. Hợp đồng dữ liệu: một đường hiển thị, nhiều quan hệ thật

Tạo projection riêng cho overview, không nhét cạnh tổng hợp hai chiều vào ArchitecturalModel như một cạnh canonical.

ServiceConnection dự kiến chứa:
- UI key ổn định theo modelId và cặp service ID đã sắp thứ tự.
- Hai service ID canonical.
- Các relationship ID thật, đã flatten underlyingEdgeIds và loại trùng.
- Nhóm A → B và B → A tách riêng; nhóm theo protocol, originLayer và trạng thái resolution.
- Danh sách evidence ID, trạng thái count có biết đủ hay chưa, số quan hệ có độ bất định.

Quy tắc bắt buộc:
1. Xác định service sở hữu qua chuỗi parent hợp lệ; không đoán từ tên class, vị trí hoặc độ gần trên layout.
2. Chỉ gom cạnh có hai đầu map được tới service. Cạnh nội bộ cùng service được đếm riêng, không tạo self-loop overview.
3. Cạnh nối qua component con được phép quy về service cha nếu quyền sở hữu đã xác định.
4. Không suy ra A–D từ A–C và C–D.
5. Không suy ra cạnh service trực tiếp từ A → broker → B hoặc hai service cùng dùng database. Muốn xem tài nguyên trung gian, mở lớp Messaging/Data store trong Chi tiết.
6. Không gộp hai service khác ID chỉ vì cùng tên.
7. Loại trùng bằng ID, không bằng nhãn. Giữ đủ hai hướng và bằng chứng dù overview chỉ có một đường.
8. Count bằng chứng chưa biết là unknown/null, không hiển thị thành 0 hoặc cộng đúp từ nhiều nhóm.
9. Quan hệ chưa chắc chắn không được nâng thành đã xác minh. Runtime observation không tự biến toàn bộ cặp service thành live/healthy.
10. Áp dụng bộ lọc lên quan hệ gốc trước, sau đó mới gom và tính lại count.

## 4. Panel chi tiết và 3E

Panel của một đường overview gồm:
- Tên hai service và tổng số quan hệ đang nằm trong phạm vi lọc.
- Hai nhóm hướng, nếu có; nhãn dễ hiểu như HTTP call, code dependency, declared deployment dependency.
- Dấu hiệu nguồn: source/configuration/runtime; tình trạng unresolved/uncertain tách khỏi nguồn.
- Danh sách quan hệ thật, có tìm/lọc khi nhiều mục.
- Chọn một mục để mở evidence, finding và evaluation theo ID/model revision thật trong 3E hiện có.

Không tự chọn một cạnh bất kỳ làm đại diện cho toàn bộ nhóm. Không gửi UI key của ServiceConnection vào API relationshipEvidence, Explain hoặc Evaluate. Finding vẫn gắn với canonical ID; không tuyên bố một kết luận áp dụng cho tất cả thành viên khi chỉ có bằng chứng của một cạnh.

Selection cần phân biệt service, nhóm kết nối và quan hệ gốc. Khi lọc làm nhóm biến mất, đóng selection tương ứng; khi nhóm còn nhưng mất một thành viên, cập nhật count và bỏ drill-down đã không còn hợp lệ.

## 5. Layout, bộ lọc và trạng thái

- Dùng lại Cytoscape và worker/layout đang có; chưa thêm thư viện mới.
- Sắp xếp theo cụm liên thông, giữ service độc lập ở khu vực riêng hợp lý. Không ép topology thành cây hoặc thứ bậc nghiệp vụ.
- Ưu tiên đường thẳng hoặc gấp khúc sạch; giảm giao cắt và tránh đè nhãn/node. Không hứa loại bỏ mọi giao cắt trên graph dày.
- Search theo tên service, có kết quả rõ ràng; cung cấp Fit, zoom, fullscreen và reset focus.
- Giữ zoom/pan/vị trí đã kéo qua lọc; lưu riêng cho Tổng quan/Chi tiết trong cùng model. Đổi revision phải kiểm tra lại selection và cache.
- Bộ lọc nâng cao: loại quan hệ, nguồn, độ bất định; lớp tài nguyên và nội bộ service thuộc Chi tiết.
- Thống kê phân biệt service, cặp kết nối, quan hệ gốc và phần ẩn. Ví dụ: "12 services · 18 kết nối · 42 quan hệ"; đây là dạng nhãn dự kiến, không phải số đo production.
- Có trạng thái loading, lỗi/retry, chưa phân tích, không có quan hệ trong bộ lọc và metadata chưa đủ để map service.
- "Không có kết nối được ghi nhận" không đồng nghĩa "service không giao tiếp". Luôn giữ các service độc lập trong danh sách.
- Khi thiếu ownership/loại phần tử, thông báo số lượng chưa đưa vào overview và cho mở Chi tiết; không âm thầm xóa dữ liệu.
- Mobile có panel dạng drawer, mục tiêu bấm đủ lớn; có danh sách service/kết nối dùng bàn phím tương đương canvas.

## 6. Các chặng triển khai

### P1 — Projection và bảo toàn dữ liệu
- Viết projection overview và kiểu ServiceConnection; tái sử dụng mapping parent hiện có, kiểm tra thiếu parent/chu kỳ.
- Viết test trước cho hai chiều, nhiều protocol/origin, cạnh tổng hợp cũ, evidence null và metadata thiếu.
- Chưa thay renderer ở chặng này.
- Đạt khi số ID nguồn trước/sau gom khớp, không thêm liên kết suy diễn và service độc lập không mất.

### P2 — Renderer tổng quan
- Thêm Tổng quan/Chi tiết ở ArchitecturePresentation; default là Tổng quan.
- Vẽ một node/service và một đường/cặp; áp dụng tên đầy đủ, kích thước và khoảng cách phù hợp.
- Tách renderer ID của nhóm khỏi canonical source ID; không để networkFocus coi nhóm như cạnh gốc.
- Đạt khi graph mẫu nhiều cạnh song song trở thành một đường/cặp và vẫn có đầy đủ dữ liệu mở rộng.

### P3 — Tương tác kết nối và 3E
- Làm panel nhóm kết nối, xem hai hướng/loại/nguồn và drill-down tới ID thật.
- Đồng bộ chọn node/cạnh, highlight một bước, Escape/background, bỏ chọn khi lọc.
- Đạt khi không có request evidence/explanation dùng ID ảo hoặc sai model revision.

### P4 — Bộ lọc, trạng thái và trải nghiệm đọc
- Hoàn thiện tài nguyên trong Chi tiết, search, count, empty/error/partial states.
- Giữ camera và vị trí ở cả hai mức hiển thị, kể cả ẩn hết rồi bật lại.
- Hoàn thiện bàn phím, mobile drawer, Light/Dark và fullscreen.
- Đo layout/filter/render trên graph nhỏ, graph thực và graph tổng hợp lớn; chốt ngưỡng hiệu năng từ baseline trên máy kiểm thử, không đưa ra số benchmark giả.

### P5 — Kiểm thử tích hợp và phát hành
- Dùng fixture FTGO/fruit và các trường hợp nguồn lỗi; ghi rõ fixture và production khác nhau.
- Browser test trên Graph Cytoscape thật, không cần draw.io cho Graph. Kiểm tra thêm điều hướng Graph ↔ Diagram và 3E để không gây regression.
- Chạy frontend tests, TypeScript và các check CI liên quan; test riêng API chỉ khi thay contract/backend.
- Tạo nhánh triển khai riêng từ main đã cập nhật, không trộn với nhánh UI nhỏ đang chờ merge.
- Commit/push sau kiểm thử; merge main khi được yêu cầu. Kiểm tra workflow deploy và smoke test sau deploy.
- Nếu có regression, revert commit/merge Graph mới theo cơ chế triển khai hiện có. Không sửa/xóa model dữ liệu để rollback giao diện.

## 7. Điểm sửa dự kiến

- src/features/architecture/graph-projection.ts: mapping và projection; cân nhắc tách overview projection thành module nhỏ.
- src/features/architecture/cytoscape-network.ts: element definitions và renderer ID nhóm.
- src/features/architecture/dependency-network.tsx: mode, tương tác, nhãn, đường nối, count và accessibility.
- src/features/architecture/network-layout.ts, graph-layout.ts, network-presentation.ts: kích thước/thẻ, cụm và camera; chỉ sửa khi cần.
- src/features/architecture/architecture-presentation.tsx: selection phân biệt nhóm/quan hệ thật, filter dùng chung.
- src/features/architecture/selection-three-e.tsx và panel nhóm mới nếu cần: điều hướng về evidence/finding thật.
- tests/architecture.test.cjs, tests/edge-semantics.test.cjs: regression projection, focus và evidence; thêm browser coverage phù hợp.

Các đường dẫn trên nằm trong MAVIS-Frontend. Không dự kiến migration database hoặc thay API ở lượt đầu. Nếu metadata thực không đủ để map ownership, ghi nhận hạn chế và xử lý analyzer thành phần việc riêng có bằng chứng.

## 8. Checklist nghiệm thu

- A → B có nhiều loại/nguồn: overview chỉ một đường, panel giữ đủ từng quan hệ và count.
- Có cả A → B và B → A: một đường, hai nhóm hướng đúng.
- A–C–D: không có A–D nếu model không ghi nhận.
- A → Q → B: không có A–B trực tiếp do tự suy diễn; Chi tiết vẫn thấy Q.
- Cùng database không tạo quan hệ gọi giữa hai service.
- Service cùng tên khác ID không gộp; service độc lập vẫn hiện.
- Parent thiếu/chu kỳ và UNKNOWN không làm app crash hay sinh service giả.
- Evidence chưa biết vẫn là unknown; không mất ID khi gộp và không nhân đôi count.
- Bấm service chỉ highlight hàng xóm trực tiếp; nhóm kết nối không gửi ID ảo vào API.
- Filter/search/mode/model revision không để panel hay highlight trỏ tới dữ liệu cũ.
- Zoom/pan/drag/fit/fullscreen và bàn phím hoạt động; resize không reset zoom đang đọc.
- Kiểm tra Light/Dark, desktop và mobile; tên service đọc được, thông tin đầy đủ có thể truy cập.
- So sánh cùng model trong Chi tiết để xác nhận overview chỉ giảm độ rối, không làm mất nội dung phân tích.

## 9. Ngoài phạm vi lượt đầu

Không suy luận business flow, traffic, latency, health, ownership hoặc dependency từ tên service. Không tự tạo edge xuyên broker/database. Không viết lại analyzer, thay schema model hay redesign các sơ đồ UML/C4. Không lưu bố cục cá nhân lên server nếu chưa có yêu cầu riêng.
