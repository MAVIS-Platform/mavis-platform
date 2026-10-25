# Kế hoạch riêng cho draw.io: sơ đồ kiến trúc có quy tắc và kiểm chứng

Ngày: 2026-10-22. Nhánh dự kiến triển khai: feat/ui-api-updates.
Trạng thái: nghiên cứu và lập kế hoạch; chưa triển khai các thay đổi trong tài liệu này.
Phạm vi: XML draw.io, nội dung/kiểu ô, bố cục/đi dây, editor và kiểm tra chất lượng. Không mở rộng sang Mermaid/PlantUML, CRUD, auth hoặc triển khai production.

## 1. Kết luận nghiên cứu

Nên làm một pipeline có dữ liệu trung gian và bộ rule xác định được kết quả. Skill giúp agent thiết kế/kiểm tra; không thay thế được logic sản phẩm và không bảo đảm tự động sinh sơ đồ đẹp cho mọi graph.

Nguồn tham khảo đã đọc:

- C4 notation/checklist: https://c4model.com/diagrams/notation và https://c4model.com/diagrams/checklist . Dùng để xác định scope, tên/type/trách nhiệm/technology, nhãn quan hệ và legend. C4 không bắt buộc một palette/font cụ thể; các thông số ở dưới là quy ước MAVIS đề xuất, không gọi là chuẩn quốc tế.
- C4 component: https://c4model.com/diagrams/component . Component view tập trung vào MỘT container, kèm thành phần bên ngoài liên quan trực tiếp.
- ELK/elkjs: https://github.com/kieler/elkjs và https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html . Phù hợp cho topology có hướng, ports, labels và compound graph. Engine không tự cung cấp nội dung, palette hay renderer.
- Draw.io layout API: https://www.drawio.com/docs/reference/json-layout-specification/ . Editor hiện hỗ trợ ELK, routing, các tham số phân cấp và khoảng cách. Cần xác minh tính năng trên image đã pin, không suy từ tài liệu mới nhất.
- Draw.io integration: https://github.com/jgraph/drawio-integration . Tham khảo giao tiếp iframe; không phải bộ rule thiết kế.
- Agents365-ai/drawio-skill: https://github.com/Agents365-ai/drawio-skill . Đã đọc SKILL.md, style-presets và autolayout; tham khảo Diagram IR, style preset và quy trình render/review. Repo khai báo MIT. Autolayout của skill dùng Graphviz, không đề xuất thêm Python/Graphviz runtime vào MAVIS chỉ để dùng skill.
- aleksnikolaev/c4-diagram-skill: https://github.com/aleksnikolaev/c4-diagram-skill . Skill C4 Container/XML, MIT; tham khảo template/legend/nhãn. Không áp nguyên xi tọa độ cố định hay cách đồng nhất dashed=async: MAVIS còn cần phân biệt evidence và declared dependency.
- C4-PlantUML: https://github.com/plantuml-stdlib/C4-PlantUML . Chỉ dùng ví dụ notation/boundary làm đối chiếu; không thay stack renderer.

Không có skill draw.io/C4 chuyên biệt trong các thư mục skill cục bộ đã kiểm tra. Chưa cài hay thực thi script bên ngoài. Nếu tái sử dụng mã/template phải pin revision, kiểm tra license của phần dùng và giữ attribution tương ứng.

## 2. Vấn đề hiện tại có bằng chứng từ code

- generateDrawioXml đang giữ x/y có sẵn, chủ yếu dùng kích thước 160x80; chưa đo chiều dài tên/nhãn.
- Node chỉ có tên; chưa có cấu trúc nội dung tên/type/technology/trách nhiệm.
- Tất cả node XML đang parent="1"; parentId của component chưa trở thành boundary lồng nhau.
- Edge thiếu hệ thống ports, hành lang, label boxes và kiểm tra va chạm sau layout.
- DRAWIO_LAYOUT mới là một preset ELK chung; chưa có profile riêng từng loại view và bước kiểm tra chất lượng.
- Bản nháp được khôi phục có thể giữ layout/style cũ. Đổi Drawing style hiện chuyển sang Mermaid thay vì áp style lên draw.io.
- Bản export Java và bản bố trí lại trong editor có thể khác nhau; cần thống nhất pipeline.

## 3. Nguyên tắc không được phá

1. Không thêm/xóa/đảo hướng dependency để hình đẹp hơn; không suy đoán HTTP, SQL, runtime hoặc trạng thái healthy khi dữ liệu không có.
2. Chỉ dùng quan hệ thực sự thuộc view. Bất kỳ edge/node nào không hiện phải có lý do và số lượng đối chiếu.
3. Kiến trúc suy ra từ source và dependency từ Compose không đồng nghĩa với traffic đã quan sát.
4. Chỉnh bố cục/màu không tạo model revision nghiệp vụ và không đổi evidence.
5. Không hứa mọi graph đều không giao cắt: graph không phẳng có thể buộc phải có crossing. Mục tiêu cứng là không xuyên ô, không chồng ô, không đè nhãn; crossing còn lại được giảm, đếm và giải thích.
6. Không tự ghi đè bản vẽ người dùng. Style-only không đổi tọa độ; relayout phải chủ động, có undo và bản sao phục hồi.

## 4. Bộ quy tắc MAVIS đề xuất v1

### 4.1 Scope và nhóm

- C4 Container: chỉ container, data store, broker, external system và actor có dữ liệu. Không rải repository/controller vào view này.
- C4 Component: chọn một container; component của nó nằm trong boundary thật, hỗ trợ node ngoài có liên quan trực tiếp. Nếu cần tổng quan nhiều container/component, ghi rõ tên view khác, không gắn nhãn sai là C4 Component chuẩn.
- Dependency graph Service: node service; grouping thể hiện vai trò đã biết. Entry/API ở đầu luồng; service nghiệp vụ ở giữa; data/infrastructure bố trí theo quan hệ. Không ép mọi graph vào một sơ đồ tầng giả định.
- Tách view Application / Configuration & Discovery / Observability khi dữ liệu có phân loại đáng tin cậy. Default và số quan hệ ẩn được giải thích ngay ở selector/legend; có view đầy đủ để đối chiếu.
- Node không có cạnh được xếp thành vùng riêng có nhãn “No relationships found in this view”; không gán kết luận runtime unavailable.
- Boundary có header riêng, padding tối thiểu 32 đơn vị, vùng header 36–44; connector không xuyên title boundary.

### 4.2 Hình khối, nội dung, font

- Service/container: rectangle bo góc nhẹ; component: rectangle có type rõ; database: cylinder; broker: shape/nhãn Queue; external: box trung tính; actor chỉ vẽ khi được cung cấp.
- Nội dung ô theo thứ tự: tên đậm → [type · technology] → trách nhiệm ngắn. Chỉ hiển thị trách nhiệm có nguồn; thiếu thì ghi “Chưa xác định từ source”, không bịa mô tả.
- Không hiển thị UUID/enum kỹ thuật làm tiêu đề; ID/evidence giữ trong metadata, inspector và tooltip.
- Font mặc định Arial/sans-serif có hỗ trợ tiếng Việt; title 18–20, tên ô 15–16, type/body 12–13, nhãn cạnh 12–13 tại 100% zoom.
- Ô mục tiêu 240–300 rộng, cao tối thiểu 112; đo nội dung trước layout, wrap theo từ, tăng chiều cao; không cắt tên bằng ellipsis trong bản export.
- Text padding 12–16, line-height 1.25–1.4, header/body có khoảng cách; cùng vai trò dùng cùng hệ kích thước, không dùng kích thước ngầm ám chỉ tầm quan trọng.
- Tên dài/Unicode, nhiều dòng và XML/HTML phải escape; không cho nội dung source chèn style/script.

### 4.3 Màu và ý nghĩa

- Một palette dùng theo vai trò, không mỗi node một màu. Clean mặc định nền trắng, chữ #172B4D, viền #64748B.
- Internal service: nền #EAF2FF, viền #315D91; component: nền trắng, viền tương ứng container. Data: nền #E7F2EC, viền #3F6F58. External/platform: nền #F1F3F5, viền #6B7280.
- Không dùng đỏ/xanh để giả trạng thái lỗi/tốt. Uncertain là badge/viền có nhãn, không chỉ truyền bằng màu.
- Dark/Blueprint dùng bộ token hoàn chỉnh cho nền, chữ, viền, arrow và label background; giữ nguyên ngữ nghĩa màu.
- Kiểm tra contrast mục tiêu >=4.5:1 cho chữ thường. Legend giải thích shape, line style và evidence; đọc được khi in xám.
- Style trong draw.io phải áp vào XML hiện tại và file edited export; không chuyển renderer ngầm.

### 4.4 Bố trí và đi dây

- Layout hướng chính trái→phải, có thể chọn trên→dưới khi phù hợp. Thứ tự ổn định từ semantic group và ID, không theo thứ tự ngẫu nhiên của DB.
- Grid 8/16; khoảng cách node mục tiêu 56–80; giữa các rank 120–180; node/edge clearance >=16; cạnh song song cách nhau >=12. Đây là giá trị khởi đầu cần hiệu chỉnh bằng fixture.
- Đo ô VÀ label trước khi layout; labels phải được đưa vào bài toán bố trí thay vì vẽ sau rồi đè lên ô.
- Ports ra/vào phân bố đều; ưu tiên right→left với luồng ngang. Return/cycle/self-loop đi hành lang riêng; không chụm tất cả dây vào tâm ô.
- Routing orthogonal 90 độ, waypoint được lưu vào mxGeometry/Array; không để draw.io tự tính lại đường thẳng khác với preview.
- Cấm đoạn dây đi qua nội thất node không liên quan. Cấm hai quan hệ khác nhau nằm chồng cùng đoạn mà không phân biệt được. Chỉ cho shared trunk khi biểu diễn nhóm rõ và vẫn truy ra từng quan hệ.
- Label theo intent ngắn; relation enum được dịch có kiểm soát. Ví dụ DECLARED_COMPOSE → “Phụ thuộc cấu hình Compose”, KHÔNG biến thành “Calls HTTP”. Technology chỉ ghi khi có bằng chứng.
- Label có nền theo theme, padding 4–6; đặt trên đoạn đủ dài, cách node/arrowhead/bend; không che tên ô, không đè label khác. Tách hai chiều thành hai đường/lane.
- Không dùng loại nét để đồng thời mã hóa hai ý nghĩa khác nhau. Đề xuất nét liền=source-inferred, nét đứt=declared configuration, runtime và uncertainty bằng badge/metadata; async bằng nhãn/broker, có legend.
- Crossings chỉ chấp nhận khi không loại được trong scope; route vuông góc, crossing có jump nếu engine hỗ trợ đã test. Không coi line jump là thay thế cho giảm crossing.
- Khi layout quá dày: tăng khoảng cách, đổi thứ tự, tách region/view; không thu font xuống để nhét mọi thứ vào một màn hình.

## 5. Thiết kế pipeline

Model/diagram layout JSON → projection theo scope → Diagram IR → đo text/kích thước → template/semantic grouping → ELK layout → routing/labels → kiểm tra geometry → XML cuối → draw.io editor.

IR phải giữ nodeId, edgeId, parentId, role/type, name, technology, nguồn mô tả, origin/evidence và visible/omitted reason; geometry gồm bounds, ports, bendpoints, labelBounds; metadata gồm ruleVersion, modelRevision, theme và scope.

Một kết quả canonical phục vụ cả editor và Download generated. Không chạy một layout khác ngầm sau khi mở editor. Ưu tiên spike ELK phía Java để gắn vào exporter hiện có; nếu API labels/compound hoặc dependency không phù hợp, chọn một layout worker/service nội bộ có version thay vì ghép hai thuật toán khác nhau. Quyết định sau spike, chưa thêm dependency trong bước plan.

Fit/zoom chỉ đổi camera. “Apply style” chỉ đổi style. “Relayout” đổi geometry theo rule nhưng giữ semantic IDs. “Regenerate from model” tạo bản generated mới và giữ bản nháp cũ.

## 6. Các bước triển khai và điều kiện xong

### P0 — Baseline và spike engine

- Lưu fixture Petclinic: 11 service/13 relation và 24 element/21 relation ở view hiện tại; chọn thêm ví dụ tên dài, cycle, hai chiều, disconnected, dense.
- Chụp generated + edited draft, kiểm tra image draw.io đã pin nhận labels/ports/layout API gì.
- Thử compound layout và edge label bằng ELK server; đối chiếu cách tuần tự hóa waypoint draw.io. Chốt engine theo geometry và render thực tế.
- Đầu ra: quyết định engine + fixture + ngưỡng. Không đổi code production chỉ vì spike “trông được”.

### P1 — IR và đúng ngữ nghĩa view

- Tách export Drawio khỏi service export đa định dạng; kiểm tra ID/parent/edge ownership.
- Thêm chọn container cho Component; tất cả endpoint xem/export nhận cùng scope. Giữ endpoint cũ tương thích, version hóa kết quả.
- Mapping nhãn, type, role và metadata có provenance; báo missing/unknown.
- Done: không mất/đảo edge, không mix abstraction, đủ boundary và số lượng đối chiếu.

### P2 — Templates, typography, theme

- Rule/token có schema và version; sinh header/body/shape từ IR.
- Đo text, wrap Unicode và kích thước trước engine.
- Áp Clean/Dark/Blueprint ngay trong draw.io, không chuyển Mermaid.
- Done: tên/type/technology rõ, không cắt/đè text; palette/font/legend nhất quán.

### P3 — Layout, routing và kiểm tra hình học

- Node/label-aware layered layout; ports; compound groups; obstacle-aware routing; spacing lanes.
- Sinh các candidate có thứ tự/seed cố định, đánh giá theo ưu tiên: đúng dữ liệu → không collision → ít crossing → label rõ → ít bend/dài dây → khung cân đối. Không để weighted score che vi phạm cứng.
- Tối đa 3 vòng repair/candidate; hết budget thì báo needs review hoặc gợi ý chia view, không treo UI.
- Done: XML chứa tọa độ node/label/waypoint cuối và mở lại không tự đổi layout.

### P4 — Editor và bản nháp an toàn

- Phân biệt Generated / Edited draft và ruleVersion; cảnh báo draft cũ, không reset ngầm.
- Apply style, Relayout, Fit và Regenerate có đúng trách nhiệm; undo hoặc snapshot trước khi relayout; tùy chọn khóa vị trí đã sửa nếu engine spike chứng minh hỗ trợ.
- Download edited lấy XML hiện tại; Download generated lấy canonical output. Không autosave dữ liệu phân tích thành model mới.
- Hiện kết quả kiểm tra: số collision/crossing/edge ẩn, legend giải thích.
- Done: đóng/mở, đổi diagram/scope/theme không mất bản vẽ hoặc lấy nhầm draft.

### P5 — Acceptance trước/sau

- Unit/contract: semantic invariants, labels escaping, correct parents, API scope, style không đổi geometry.
- Geometry: không overlap node/label; không edge xuyên node; boundary chứa con đúng; node/edge/reference counts khớp IR; connector hợp lệ và orthogonal.
- Fixture graph không phẳng không bị test đòi zero crossing bất khả thi. Với Petclinic service 11/13 đặt mục tiêu zero crossing khi giữ đủ relation; nếu không đạt phải ghi rõ metric và phương án khác, không xóa cạnh.
- Browser: draw.io mở được, drag, relayout, undo, style, save/reload, edited download và reopen; không tràn trang tại 1366/1834 và khung hẹp.
- Visual QA tại 100% zoom và ảnh tổng quan; không ép fit mọi graph thành chữ li ti. So ảnh trước/sau và có người duyệt kết quả demo.
- Hiệu năng mục tiêu để đo: 30 node/60 edge <=2 giây sau warm-up trên máy test; 100/200 <=5 giây; budget có timeout và trạng thái UI. Chưa phải số đo đã đạt.

## 7. Gate giao hàng

Bắt buộc: không mất ID/edge/ngữ nghĩa; zero node overlap, edge-through-node, label-node overlap và label-label overlap trên các fixture được hỗ trợ; XML round-trip giữ topology và geometry trong tolerance; draft cũ khôi phục được.

Crossing, bends, độ dài và aspect ratio là tiêu chí tối ưu có báo cáo, không “100% đẹp” bằng lời. Với view quá lớn cần split/focus có thông báo. Chỉ chốt khi Petclinic + fixture khó pass và ảnh render được duyệt.

## 8. Thứ tự ưu tiên và điểm review

Làm P0 → P1 → P2 → P3 → P4 → P5 trên feat/ui-api-updates. Review mẫu Petclinic sau P2 và P3 trước khi mở rộng. Commit theo: semantic scope/IR; drawing rules + XML layout; editor/draft + acceptance. Không cần đổi Worker cho phần này.

Việc lưu bản vẽ lên BE/DB, collaborative editing, auth deployment, production origin/license là công việc riêng; không đưa vào scope lần sửa chất lượng bản vẽ này.