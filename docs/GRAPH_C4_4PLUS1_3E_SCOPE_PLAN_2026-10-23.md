# MAVIS — Chốt lại phạm vi Graph, C4, 4+1 và 3E

Ngày: 2026-10-23.
Trạng thái: PLAN ONLY. Chưa triển khai thay đổi giao diện hoặc analyzer trong bước này.
Căn cứ: yêu cầu người dùng đưa sản phẩm về một Graph chính, các diagram C4 và 4+1 phổ biến, click phần tử mở 3E. Plan này thay thế phần tổ chức giao diện/view pack của DIAGRAM_GRAPH_PRODUCT_PLAN_2026-10-23.md; các sửa lỗi dữ liệu và lưu trữ đúng vẫn được tái sử dụng.

## 1. Sản phẩm người dùng nhìn thấy

Chỉ có hai chế độ trên trang Architecture:

- Graph: một mạng phụ thuộc node–link, là chế độ mặc định.
- Diagram: lựa chọn họ sơ đồ C4 hoặc 4+1, sau đó chọn loại sơ đồ.

Cả hai dùng chung project, snapshot/model revision và khung 3E. Không yêu cầu người dùng hiểu renderer, view planner, relationship origin, rule version hoặc document pack để xem kiến trúc.

3E đã được người dùng xác nhận: **Explore evidence; Explain finding; Evaluate theo rule.** Cả ba dùng cùng canonical element/relationship ID và model revision. Explain sử dụng finding đã được lưu; Evaluate chạy rule trên model và lọc findings về phần tử đang chọn.

## 2. Graph duy nhất

Graph tham khảo hình người dùng: node hình tròn, label ngắn, đường nối thể hiện dependency; topology lan ra theo cụm, không xếp thành một cột.

- Mặc định thấy service và tài nguyên liên quan trực tiếp, không đưa mọi class vào cùng một mức.
- Màu theo loại phần tử/nhóm đã xác định, legend ngắn; kích thước phản ánh mức kết nối nếu sử dụng, có giải thích. Không lấy màu/cỡ node làm trạng thái runtime khỏe/yếu khi không có dữ liệu.
- Có search, kéo nền để pan, lăn chuột để zoom quanh con trỏ, fit, fullscreen. Kéo node chỉ đổi bố cục.
- Click node: chọn phần tử, highlight quan hệ trực tiếp, mở 3E. Click cạnh: hiển thị quan hệ và bằng chứng/chi tiết nếu 3E hiện hành hỗ trợ; không ép quan hệ vào API chỉ nhận element.
- Mặc định không tạo một Graph riêng cho mỗi service/channel. Bộ lọc nâng cao chỉ xuất hiện khi mở tùy chọn.
- Có cơ chế xem bên trong service khi cần, nhưng vẫn là cùng một Graph và cùng hệ ID.

## 3. Diagram C4

Bộ C4 v1: System Context, Container, Component. Code/Class không nằm trong lựa chọn chính v1.

- Context: hệ thống và actor/hệ thống ngoài có dữ liệu chứng minh. Không tự tạo actor chỉ để đủ C4.
- Container: ứng dụng/service, datastore/broker và các quan hệ kiến trúc ở mức container.
- Component: một container được chọn, hiển thị component bên trong boundary và dependency trực tiếp. Chỉ lúc chọn Component mới có ô chọn service.
- Component là đơn vị kiến trúc; cần tiếp tục cải thiện grouping theo trách nhiệm, tránh coi mọi class là một component.
- Những gì chưa đủ dữ liệu phải có trạng thái và lý do rõ; không vẽ sơ đồ sai nhãn để đủ lựa chọn.

## 4. Diagram theo 4+1

4+1 là mô hình các góc nhìn, không phải năm renderer. Mỗi góc nhìn có nội dung đúng:

- Logical: các khối/domain/class có ý nghĩa về chức năng, dùng ký pháp phù hợp dữ liệu đã có.
- Development: cấu trúc module/package và dependency mã nguồn/build.
- Process: đơn vị thực thi, giao tiếp, concurrency/synchronization có bằng chứng. Không đổi nhãn dependency graph hoặc sequence diagram thành Process view.
- Physical/Deployment: ánh xạ ứng dụng vào môi trường triển khai/hạ tầng. Nếu chỉ có Compose thì công bố phạm vi container/network được khai báo, không giả lập máy chủ vật lý.
- +1 Scenarios: tình huống cụ thể và tương tác có thứ tự khi có scenario/trace hoặc bằng chứng phù hợp. Không đoán thứ tự từ các cạnh tĩnh.

UI chỉ hiện phần chọn scenario hoặc deployment environment khi loại view cần nó. Trạng thái chưa hỗ trợ/thiếu dữ liệu được trình bày ngay trong view, không tạo nội dung thay thế giả.

Process và Scenarios sử dụng API/runtime model đã thống nhất với bạn phụ trách Java. Không xây runtime orchestrator, scenario persistence hoặc approval workflow thứ hai trong nhiệm vụ diagram.

## 5. Click để xem 3E

Một khung bên phải dùng chung cho Graph và Diagram; ở màn hình nhỏ mở thành drawer.

- Click bất kỳ ô semantic nào trên diagram hoặc node graph phải truyền canonical element ID, model ID và revision đến cùng selection state.
- Click shape của group/boundary: mở thông tin group và danh sách thành viên; không lấy group ID giả để gọi API evidence/explain của một element thật. Chọn thành viên mới mở 3E của phần tử đó.
- Một element xuất hiện trong Graph, C4 và 4+1 phải mở cùng thông tin 3E cho cùng model revision.
- Có loading/error/empty state riêng cho từng chức năng; không chặn toàn bộ hình nếu một chức năng thất bại.
- Tương tác trên diagram phải hoạt động ở chế độ xem; người dùng không cần mở editor draw.io để chọn phần tử.
- Metadata/underlying IDs phải được giữ khi aggregate hoặc export. Không dùng ảnh bitmap đơn thuần nếu làm mất khả năng chọn phần tử.

## 6. Luồng màn hình tối giản

1. Import và phân tích dự án.
2. Mở Architecture thấy Graph ngay.
3. Chọn Diagram nếu cần sơ đồ trình bày.
4. Chọn C4 hoặc 4+1 rồi loại sơ đồ.
5. Chỉ hiện service/scenario/environment khi lựa chọn đó thực sự cần.
6. Click phần tử để dùng 3E.
7. Tải SVG/PDF/draw.io hoặc bấm Chỉnh sửa để mở editor.

Ví dụ toolbar:

Graph | Diagram

Khi Diagram: C4 | 4+1 → loại sơ đồ → tham số cần thiết.

Search/fit/fullscreen/export là thao tác phụ. Chất lượng/coverage và chẩn đoán kỹ thuật nằm trong thông tin nâng cao. Không đặt câu chữ kỹ thuật vào mọi ô.

## 7. Điều chỉnh từ code hiện tại

- Đưa Graph trở lại mặc định. Bỏ dropdown Architecture view dài và hàng nút lặp bên dưới.
- Bỏ grouped overview/document pack khỏi luồng chính. Các projection helper và export nhiều trang có thể tái sử dụng nội bộ; không tiếp tục phát triển chúng thành sản phẩm riêng.
- Giữ engine layout, ID mapping, metadata, persistence revision, chống ghi đè và các sửa lỗi analyzer đã có. Không rollback dữ liệu đúng chỉ để đơn giản UI.
- Đổi nhãn renderer sai: SVG draw.io không ghi MERMAID.
- Tách phần viewer và edit rõ ràng. C4/4+1 không bị lựa chọn renderer làm đổi semantics.
- Cung cấp picking/hit-testing hoặc event mapping trên diagram để mở 3E. Cần kiểm chứng được trên SVG/draw.io viewer thật trước khi coi viewer hoàn thành.

## 8. Thứ tự triển khai sau khi chốt plan

P1 — Chốt hợp đồng selection/3E và cấu trúc hai chế độ; làm Graph default, bỏ dropdown dài và nhãn sai. Không thay API Java chung ngoài phạm vi đã thống nhất.

P2 — Hoàn thiện Graph tham chiếu: topology lan cụm, pan/zoom/drag, highlight, click node mở 3E. Test bằng repo thực và fixture tên dài/graph dày.

P3 — Hoàn thiện C4 Context/Container/Component đúng semantics và click từng ô mở cùng 3E. Giữ container selector chỉ trong Component.

P4 — Nối 4+1 theo capability dữ liệu và API đã có; phối hợp contract với bạn Java cho Process/Scenarios, không code chồng phạm vi chặng 13–16.

P5 — Hoàn thiện đọc được/export/save/reopen và chạy nghiệm thu xuyên suốt Graph ↔ Diagram ↔ 3E. Trạng thái thiếu dữ liệu phải trung thực.

## 9. Điều kiện nghiệm thu

- Người mới mở dự án biết ngay đang ở Graph hoặc loại diagram nào; không phải chọn trong hàng chục trang sinh tự động.
- Graph không dồn một cột; pan/zoom/drag/fit/fullscreen hoạt động, node names đọc được khi tập trung.
- Tên view đúng với nội dung: Context/Container/Component và năm góc nhìn 4+1 không chỉ đổi tên trên cùng một hình.
- Click mỗi semantic node/shape mở 3E đúng canonical ID/model revision; group không gọi nhầm API element. Graph và diagram cùng phần tử cho cùng kết quả.
- Không đè ô/nhãn, xuyên ô; nội dung đọc được ở kích thước viewer/export đã chọn; không giảm font để giấu vấn đề bố cục.
- Bản tải về giữ đúng phạm vi/model/nội dung. Lưu và mở lại không mất chỉnh sửa.
- Không đánh dấu hoàn chỉnh vì số test pass hoặc số diagram lớn. Kiểm tra cả semantics, render và thao tác người dùng.

## 10. Ranh giới phối hợp

Nhiệm vụ của chat này: Graph, diagram C4/4+1, tương tác 3E trong viewer, layout và export liên quan. Bạn Java tiếp tục profile/OTP/giáo dục/admin/runtime chặng 13–16. File contract chung phải merge theo chức năng; không tự triển khai thay roadmap của bạn ấy.

## Cơ sở ký pháp

- C4 diagrams: https://c4model.com/diagrams — Context/Container/Component là lựa chọn phạm vi sản phẩm MAVIS; không bắt buộc mọi dự án có đủ dữ liệu cho mọi mức.
- Kruchten, Architectural Blueprints—The 4+1 View Model of Software Architecture: https://www.cs.ubc.ca/~gregor/teaching/papers/4%2B1view-architecture.pdf — phân biệt Logical/Process/Development/Physical và Scenarios.