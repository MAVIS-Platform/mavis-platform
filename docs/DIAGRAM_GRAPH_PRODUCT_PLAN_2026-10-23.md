> Phạm vi UI/view pack trong tài liệu này được thay thế bởi [Graph, C4, 4+1 và 3E](GRAPH_C4_4PLUS1_3E_SCOPE_PLAN_2026-10-23.md) theo yêu cầu người dùng ngày 2026-10-23. Không tiếp tục mở rộng dropdown bộ view.

# MAVIS — Kế hoạch nâng diagram và graph thành đầu ra sản phẩm

Ngày: 2026-10-23 (Asia/Saigon).
Trạng thái: đề xuất triển khai có thứ tự và tiêu chí nghiệm thu; chưa triển khai các hạng mục bên dưới.
Phạm vi: core phân tích kiến trúc, canonical model, graph, diagram, persistence và export liên quan trực tiếp. Không gồm auth, billing hoặc chỉnh giao diện ngoài luồng này.
Tài liệu này bổ sung và thay thế tiêu chí hoàn thành về chất lượng sản phẩm trong DRAWIO_QUALITY_RULES_PLAN_2026-10-22.md. Các phần kỹ thuật đang hoạt động tiếp tục được tái sử dụng.

## 1. Cam kết đầu ra

Với stack và cấu hình được MAVIS hỗ trợ, người dùng import source → nhận bộ sơ đồ đúng phạm vi, đọc được, có giải thích và xuất sử dụng ngay. Chỉnh tay là tùy chọn. Không yêu cầu sinh viên tự hiểu kiến trúc để sửa các kết quả sai do bộ phân tích.

“Hoàn chỉnh” là đầy đủ cho phạm vi được công bố và có khả năng truy vết, không phải dồn toàn repository vào một trang. Mỗi phần tử/quan hệ được phân tích phải được thể hiện trong ít nhất một góc nhìn phù hợp hoặc có lý do loại trừ rõ ràng. Không bỏ cạnh để hình đẹp mà làm mất sự thật.

Không thể bảo đảm suy ra toàn bộ hành vi của mọi repo từ static source. Chính sách sản phẩm phải phân biệt: supported/verified, partial, unsupported. Nếu còn thiếu quan hệ quan trọng thì không ghi “Ready to use”. Chất lượng được cải thiện bằng adapter và bằng chứng, không bằng mô tả bịa cho đủ ô.

## 2. Chẩn đoán có bằng chứng

### Baseline FTGO đã quan sát

Model 4a31c2e7-1d60-46b1-8a45-f5cea1df57b1, project e0a9ee09-2747-469c-b09d-474674db7a05. Đây là kết quả phân tích hiện có, KHÔNG phải ground truth.

- Canonical Component JSON có 40 phần tử: 13 SERVICE_CONTAINER, 23 COMPONENT, 2 DATABASE, 2 QUEUE_BROKER.
- 53 quan hệ: 33 DECLARED_COMPOSE, 10 CODE_DEPENDENCY, 10 DATABASE_ACCESS. Không có quan hệ HTTP/messaging ở kết quả này.
- Component đang được ghi nhận trong 8 service; cdc-service không có component.
- Ảnh người dùng là bản vẽ rule mavis-se-1/draft cũ, báo 56 crossing; fit toàn hình 33–58% khiến chữ nhỏ. Rule v2 đã đổi nhãn và chọn container nhưng không giải quyết các vấn đề nền tảng dưới đây.
- README chính thức FTGO mô tả REST, giao tiếp Kafka qua Eventuate Tram và Saga. Vì thế việc kết quả chỉ có Compose/code/database là tín hiệu cần kiểm tra độ phủ; chưa thể gọi model này là kiến trúc FTGO đầy đủ.

### Những chỗ phải sửa, không chỉ điều chỉnh màu và khoảng cách

1. GraphBuilderServiceImpl.java:115 gán JAVA_SPRING cho mọi container Docker không phải DATABASE. Đây là nguyên nhân có thể tạo nhãn Java/Spring sai cho Kafka, Zipkin, ZooKeeper hoặc image bên ngoài.
2. findOwningContainer dùng contains trên đường dẫn rồi fallback sang service đầu tiên hoặc elements[0]. findComponentByName so simple name trên toàn model. Hai cơ chế có nguy cơ gán nhầm component khi nhiều module có cùng tên class.
3. findDatabaseElementForFile fallback sang database đầu tiên nếu không match cấu hình. Không đủ bằng chứng để xem đó là database của service.
4. DiagramProjectionServiceImpl tạo Container/Dependency từ cùng tập container và toàn bộ cạnh đủ endpoint; thiếu chính sách nội dung riêng cho từng góc nhìn kiến trúc.
5. java-wire.ts hiện gán mọi graph edge uncertain=true, evidence=[]; không thể dùng đó như trạng thái tin cậy thực của model. Cần truyền metadata, lazy-load chi tiết evidence khi mở inspector.
6. geometry.ts chỉ kiểm tra chồng ô/nhãn, xuyên ô và diagonal để tính needsReview; không xét độ đọc được, độ dài dây, vùng trắng, ý nghĩa quan hệ hay độ phủ kiến trúc.
7. generate.ts ưu tiên geometry và crossing; tăng khoảng cách có thể tránh va chạm nhưng làm bản vẽ dài đến mức không đọc nổi ở kích thước sử dụng.
8. Draw.io đang là editor của bản nháp trong trình duyệt; thay đổi chưa phải tài liệu đã lưu trên cloud theo revision. Chưa có chuỗi lưu → mở lại → xuất → chia sẻ đầy đủ cho đầu ra giáo dục.

## 3. Quyết định kiến trúc sản phẩm

Giữ Java analyzer, worker và model có version; dùng một hợp đồng model thống nhất cho graph và diagram. Giữ ELK cho layout và draw.io cho chỉnh sửa/xuất. Chưa đổi thư viện hoặc thay toàn bộ renderer khi nguyên nhân chính là dữ liệu và projection.

Pipeline mục tiêu:

Source/config được pin commit → facts có evidence → symbol/service/resource resolution → canonical architecture model → view planner → diagram document → đo nội dung → layout/routing → kiểm tra semantic + readability + geometry → published artifact.

Graph và diagram dùng chung IDs/model revision/evidence, nhưng có hành vi khác nhau:

- Graph: khám phá toàn bộ topology, tìm đường phụ thuộc, expand/collapse, lọc quan hệ và xem bằng chứng.
- Diagram: tài liệu có mục đích đọc cụ thể, phạm vi/boundary/legend rõ, bố cục ổn định và xuất được.
- Draw.io: tùy chỉnh tài liệu đã sinh, không thay thế việc suy ra mô hình kiến trúc. Thay đổi tọa độ/style không đổi sự thật của model; sửa semantic qua luồng edit có kiểm chứng riêng.

Đầu ra mặc định là bộ tài liệu có mục lục và liên kết:

1. System overview/context khi có dữ liệu về actor/external system; không tự tạo actor không có bằng chứng.
2. C4 Container: ứng dụng, data store, broker và các tương tác kiến trúc. Loại chi tiết startup/init khỏi góc nhìn ứng dụng; vẫn thể hiện chúng trong hạ tầng/deployment.
3. C4 Component cho từng service có source/ownership đủ rõ; nhóm component theo trách nhiệm, không đồng nhất component với mọi class Java.
4. Messaging/data view cho broker, channel/topic, publisher/subscriber và storage binding được xác định.
5. Deployment/configuration dependency view riêng cho Compose depends_on, init jobs và nền tảng vận hành.
6. Dynamic/sequence view chỉ khi đủ bằng chứng thứ tự hoặc runtime trace. Không vẽ luồng “Create order” như sự thật chỉ vì README có tên use case.

Mỗi view có selected/aggregated/omitted IDs và lý do. Full graph vẫn truy cập được; tự chia view không che mất facts.

## 4. Các mốc triển khai

### M0 — Thiết lập chuẩn đối chiếu độc lập

Đầu ra:

- Pin commit, cấu hình build/deploy và snapshot của FTGO, Petclinic, một fixture .NET mà worker thực sự hỗ trợ.
- Lập manifest kiến trúc mong đợi từ source/config thực: module/service, component ownership, DB binding, HTTP, messaging. Không lấy output hiện tại làm đáp án đúng.
- Bộ ví dụ lỗi: hai module có RestaurantController cùng tên, service không có source, localhost theo từng profile, DB không resolve được, @Bean/event handlers, cycle, tên dài, quan hệ hai chiều.
- Lưu bộ ảnh baseline và file SVG/drawio cho từng view, cùng kết quả dùng thử của người đọc chưa biết repo.

Điều kiện xong: mỗi kỳ vọng có đường dẫn file/symbol/config và revision; các ca sai hiện tại được test bắt lỗi. Chốt rõ tập stack hỗ trợ v1.

### M1 — Sửa model trước khi làm đẹp

Vị trí chính: GraphBuilderServiceImpl, Docker detector, Java extraction/resolution, DTO/projection; worker chỉ sửa khi ca .NET đòi hỏi cùng hợp đồng.

- Tách element kind, deploy role và technology. Image Kafka không trở thành Spring; database engine từ driver/image/binding, không mặc định tất cả là SQL.
- Map service qua module root/build context/source root; component bằng service ID + qualified symbol. Shared module có chính sách riêng, không chọn service đầu tiên.
- Bỏ fallback database đầu tiên và fuzzy match không đủ phân biệt. Quan hệ không resolve trở thành finding có evidence, không trở thành cạnh đã xác nhận.
- Phân biệt declared configuration, static inference và runtime observation. Không biến depends_on thành HTTP hoặc Kafka publish.
- Bổ sung adapter có phạm vi rõ cho Spring HTTP, injection/call dependency, @Bean, Eventuate/Kafka binding dùng trong FTGO; resolver channel/topic phải giữ hướng và nguồn cấu hình.
- Mô tả trách nhiệm từ annotation/API/module/config; nội dung diễn giải tự động phải có provenance. AI nếu dùng chỉ diễn đạt facts hoặc đề xuất có kiểm tra, không tạo node/cạnh/technology thiếu bằng chứng.
- Version analyzer và model; re-analyze tạo revision mới. Không chỉ sửa XML của model cũ sai để che lỗi.

Điều kiện xong: các ca sai ownership/technology/DB đã có regression; quan hệ trong manifest của phạm vi nghiệm thu được tìm đúng hoặc công khai chưa hỗ trợ. Không có false positive nghiêm trọng trong bộ đối chiếu.

### M2 — View planner và hợp đồng graph/diagram

- Xây policy riêng cho overview, C4 Container, C4 Component, messaging và deployment; một JSON document canonical chứa modelRevision, viewSpec, source IDs, grouping, evidence/confidence và layoutVersion.
- Aggregate quan hệ component thành container theo quy tắc, giữ toàn bộ underlying edge IDs. Gộp cùng intent/protocol/direction, không gộp HTTP với startup dependency.
- Component chỉ nằm trong boundary service đúng. Thành phần bên ngoài chỉ xuất hiện nếu liên quan trực tiếp; giải thích service không có source.
- Tự đề xuất bộ view và chia scope theo readability budget; người mới không phải biết chọn filter nào để cứu bản vẽ.
- Sửa graph API/FE để uncertainty/evidence phản ánh dữ liệu thực. Collapsed group hiển thị số phần tử/quan hệ và mở ra được; mọi đường dẫn có thể truy tới source evidence.

Điều kiện xong: graph và diagram thống nhất endpoint, direction và evidence cho cùng model; người đọc đi từ overview đến component bằng click, không phải import hoặc chọn lại model.

### M3 — Layout theo ý nghĩa và kích thước đầu ra

- Profile theo loại view; nhóm entry/gateway, nghiệp vụ, broker/data và supporting infrastructure khi role có bằng chứng. Không ép service nghiệp vụ không có quan hệ vào chuỗi giả.
- Đo font thực và text bounds; thống nhất thứ bậc tên/type/technology/responsibility, bỏ placeholder lặp trong ô. Coverage thiếu được báo tập trung trong phần quality, không lấp mọi ô bằng “Responsibility not extracted”.
- Bố cục nhóm trước, ô sau; thử hướng LR/TB, packing/cycle/layer/ports rồi chấm theo readability, wire length, bends, crossings và ổn định giữa revisions.
- Routing có hành lang, label ngắn có intent; hỗ trợ hub nhưng không tạo bus khiến người đọc hiểu nhầm tất cả là một sự kiện. Crossing có ý nghĩa phân biệt với junction.
- Nếu một view không thể đọc được ở kích thước xuất đã chọn, tự sinh các view con có liên kết. Giữ một overview đọc được thay vì giảm toàn bộ chữ xuống 33%.
- Layout là presentation model riêng, giữ pin và manual edits theo semantic ID; thay đổi source nhỏ không đảo toàn bộ bản vẽ.

Điều kiện xong: đạt readability budget ở viewer và bản export, không chỉ geometry trên tọa độ lớn.

### M4 — Luồng end to end cho sinh viên

- Import → progress phân tích có phase → diagram pack được đề xuất → mở overview → drill down → inspector giải thích ô/quan hệ → xuất dùng ngay.
- Viewer mặc định sạch, gọn, fullscreen/pan/zoom/minimap; edit draw.io là chế độ chủ động. Không bắt sinh viên sử dụng toàn bộ thanh công cụ editor để xem diagram.
- Giải thích notation/legend đúng với hình; technical diagnostics đặt trong quality panel, không làm nội dung bài nộp.
- Lưu diagram document/viewSpec/layout theo account/project/model revision trên server; bản browser draft là phục hồi offline, không phải bản lưu duy nhất. Optimistic concurrency, lịch sử và khôi phục.
- Export một view hoặc cả bộ: .drawio nhiều trang, SVG và PDF theo preset trang; manifest/title/legend/revision nhất quán. Export không phụ thuộc người dùng đã mở editor hay chưa.
- Regenerate tạo generated revision mới, preview diff và bảo toàn edited revision; không tự ghi đè.

Điều kiện xong: fresh browser mở được bản đã lưu; file tải về mở độc lập, đúng model/revision/view, giữ nội dung và geometry.

### M5 — Nghiệm thu và phát hành theo khả năng thực

- Quality pipeline kiểm tra model, projection, geometry, rendered text, export và user task. Không một điểm trung bình nào bù cho cạnh sai hoặc ownership sai.
- Một lần chạy tạo báo cáo machine-readable kèm ảnh preview, artifact và lý do thất bại.
- Chỉ gắn “Ready to use” cho phạm vi đã qua kiểm tra; phần chưa hỗ trợ hiển thị rõ thay vì tự vẽ thêm cho đủ.
- Chạy lại clean import → analyze → view → save → reopen → export cho các repo benchmark đã pin.

Điều kiện xong: người dùng chưa biết repo đọc và dùng bộ tài liệu mà không sửa nội dung/bố cục bắt buộc; kết quả được đo bằng bài kiểm tra thực, không chỉ nhận xét của người triển khai.

## 5. Tiêu chí nghiệm thu sản phẩm

Các con số bên dưới là ngưỡng MAVIS đề xuất để chốt trên benchmark, không phải chuẩn C4 quốc tế.

### Đúng kiến trúc — điều kiện bắt buộc

- 100% node/cạnh đã công bố là verified có evidence và direction/type/ownership hợp lệ.
- Không sai technology/owner/DB hoặc invent quan hệ trong tập nghiệm thu; mọi critical unresolved ngăn trạng thái Ready.
- Độ phủ tính theo manifest đối chiếu của stack/profile đã hỗ trợ; không dùng số ô nhiều hay “23 component” làm bằng chứng đầy đủ.
- Mỗi fact có nơi thể hiện hoặc lý do loại trừ; drilldown vẫn truy được IDs và provenance.
- Không có C4 Component chứa toàn bộ module không liên quan hoặc chỉ container rỗng mà được gọi là hoàn chỉnh.

### Đọc được — điều kiện bắt buộc

- Test viewer ở 1366x768 và 1920x1080 với sidebar thực; default view phải đọc được, không cần kéo từng ô hoặc sửa đường dây.
- Mục tiêu chữ nội dung >=12 CSS px trong góc nhìn mặc định đã chọn; export A3 landscape >=10 pt cho nhãn, >=12 pt cho tên ô. Phải đo sau fit/export, không lấy fontSize trong XML làm số thực tế.
- Không chồng ô, không cắt chữ/legend/boundary, không dây xuyên ô không liên quan, không nhãn trùng/đè. Đếm cả segment trùng nhau và label–edge collision, không chỉ giao điểm vuông góc.
- Không đòi zero crossing cho mọi graph. Mỗi benchmark có baseline/budget được review; graph dày phải sinh overview + views chi tiết, không đạt bằng cách phóng canvas vô hạn.
- Profile thử nghiệm khoảng 8–16 khối chính trên overview; đây là trigger tách view, không giới hạn dữ liệu. Các nhóm gộp phải giải thích và mở ra được.

### Dùng được — điều kiện bắt buộc

- Pilot tối thiểu 5 sinh viên chưa biết repo: tìm entry point, giải thích một đường gọi/message và xác định một DB owner. Mục tiêu >=4/5 hoàn tất trong 5 phút mà không sửa hình.
- Mục tiêu median 0 chỉnh sửa bắt buộc đối với bộ benchmark để dùng làm tài liệu/nộp bài; chỉnh tên/màu theo sở thích không tính là lỗi chất lượng.
- Export mở lại trong draw.io độc lập và PDF/SVG viewer: không mất nhãn/cạnh, không lệch layout, fonts đọc được.
- Graph selection, node details và diagram pack đều trỏ cùng model revision; save/reload không mất chỉnh sửa; migration không ghi đè draft.
- Performance có benchmark và timeout trên máy chuẩn; không tuyên bố SLA trước khi đo. Tách thời gian phân tích, layout, render và export.

## 6. Lát cắt triển khai đầu tiên để chứng minh hướng đi

Không làm 6 mốc thành một PR lớn. Lát cắt đầu tiên đi qua toàn pipeline trên phạm vi FTGO đã kiểm chứng:

1. Pin source và viết manifest cho order-service, gateway, broker/data dependencies cùng phạm vi component liên quan.
2. Sửa ownership, technology và database binding; bổ sung messaging facts cần thiết cho phạm vi này.
3. Sinh overview/Container + Component order-service + messaging/deployment view tương ứng, có IDs/evidence và coverage rõ.
4. Xuất .drawio/SVG/PDF đọc được; mở lại từ bản lưu.
5. Đối chiếu source, render và nhờ người đọc mới làm bài kiểm tra; chỉ khi đạt mới mở rộng đủ các service và repo khác.

Thứ tự các PR dự kiến:

- PR-A: baseline, manifest và regression bắt lỗi ngữ nghĩa.
- PR-B: resolution/model/evidence + migration/versioning tối thiểu.
- PR-C: view planner/document contract và graph metadata.
- PR-D: layout/readability và canonical export cho lát cắt.
- PR-E: save/reopen, preview/export pack và nghiệm thu người dùng.
- Sau khi lát cắt đạt: mở rộng adapter/view coverage, hardening và release gate.

Bản vẽ đẹp trên một fixture không đủ để tuyên bố hoàn tất; ngược lại không cần viết lại cả hệ thống để bắt đầu. Giữ code hiện có qua adapter tương thích và feature flag, so sánh pipeline cũ/mới trên cùng input.

## 7. Những điều không dùng làm lối tắt

- Không đổi ELK sang thư viện khác với hy vọng tự sửa semantic.
- Không lấy LLM sinh toàn bộ XML rồi coi là kiến trúc đúng.
- Không tự thêm HTTP/message/actor/DB vì tên có vẻ hợp lý.
- Không đánh dấu VALIDATED/Ready chỉ vì parser không lỗi hoặc geometry bằng 0.
- Không buộc sinh viên tự chọn source/declared/runtime để tìm một bản vẽ dùng được.
- Không hứa mọi repo/mọi framework được hỗ trợ ngay; công bố capability và bổ sung theo bộ test.
- Không gọi model hiện tại là ground truth; không chỉ so output hôm nay với snapshot output hôm qua.

## 8. Cơ sở tham khảo

- C4 Component scope: https://c4model.com/diagrams/component
- C4 review checklist (tên, loại, trách nhiệm, technology, legend, intent/direction của quan hệ): https://c4model.com/diagrams/checklist
- Structurizr: model và nhiều view, tham khảo cách tách góc nhìn, không đề xuất thay toàn bộ stack: https://docs.structurizr.com/dsl/language và https://docs.structurizr.com/dsl/cookbook/component-view/
- Structurizr inspections: tham khảo kiểm tra semantic ngoài geometry: https://docs.structurizr.com/workspaces/inspections
- ELK Layered: routing, ports, hierarchy và layout options; engine không cung cấp architectural semantics: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
- FTGO README/source để lập manifest theo revision: https://github.com/microservices-patterns/ftgo-application/blob/master/README.adoc

Nguồn đọc ngày 2026-10-23. Các giải pháp và ngưỡng MAVIS ở trên là đề xuất từ audit code/đầu ra hiện tại; không phải bảo đảm có sẵn của các thư viện tham khảo.