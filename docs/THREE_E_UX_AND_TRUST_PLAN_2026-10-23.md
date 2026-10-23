# Plan 3E v2 — hiểu kiến trúc, kiểm chứng nhận xét, biết bước tiếp theo

Ngày cập nhật: 23/10/2026.
Trạng thái: đã phản biện và chỉnh kế hoạch; chưa triển khai code.
Phạm vi: panel 3E, evidence, giải thích và rule evaluation phục vụ Graph/Diagram hiện có.

## 1. Kết luận phản biện

Plan v1 đúng về hướng trải nghiệm, nhưng cần sửa trước khi dùng làm yêu cầu triển khai:

1. “Sửa độ tin cậy” phải có điều kiện quyết định cụ thể. Cùng MySQL host không tương đương cùng dữ liệu; cùng logical database cũng chỉ là nhận xét theo rule đang áp dụng, chưa tự chứng minh một thiết kế luôn sai.
2. Cần giữ nguồn và mức đầy đủ của evidence qua API. Adapter hiện gộp mọi nguồn ngoài runtime thành source; UI không thể tự tách lại bằng cách đoán từ đường dẫn.
3. Explain phải gắn đúng finding/evaluation. Việc đưa thông điệp rule vào userQuestion chưa tạo được ràng buộc dữ liệu đáng tin cậy.
4. Thiếu chiến lược cho kết quả và cache cũ. Không được âm thầm đổi verdict của evaluation đã lưu hoặc bật cache mới với khóa cũ.
5. P0 của v1 có thể kéo theo quá nhiều sửa Java trước khi có UI thử được. Tách công việc FE và BE bằng contract/fixture đã thống nhất, nhưng chỉ phát hành kết luận đánh giá mới khi phần BE đã qua kiểm thử.
6. Đổi mặc định sang Giải thích có thể gây gọi AI tự động hoặc tạo thêm tải. Phải quy định tóm tắt cơ bản từ dữ liệu sẵn có; giải thích nâng cao chỉ theo thao tác người dùng.
7. “Làm được 4/5 việc” chưa đủ: người dùng có thể làm đủ thao tác nhưng vẫn hiểu nhầm suy luận thành sự thật. Bổ sung tiêu chí hiểu đúng và các tình huống chống kết luận sai.

Các điều chỉnh bên dưới thay thế kế hoạch thực thi v1.

## 2. Bằng chứng từ code hiện tại

- SelectionThreeE có ba tab nhưng Explain phụ thuộc finding/evaluation; Explain và Evaluate cùng đưa thông điệp rule lên mặt chính.
- EvidenceViewer hiển thị locator tuyệt đối và excerpt thô; chưa nói evidence hỗ trợ nhận định nào.
- java-wire.evidenceView chỉ giữ source/runtime và complete=null, làm mất sourceType gốc.
- RULE-02 dùng điều kiện target là DATABASE **hoặc** relationType là DATABASE_ACCESS. Quan hệ startup/cấu hình trỏ vào DB có thể bị đếm là truy cập.
- Thông điệp RULE-02 nói “truy cập đồng thời”, trong khi phép kiểm tra đó không chứng minh thời điểm thực thi.
- AiExplainRequestDTO chưa có findingId/evaluationRunId; nhánh lấy evidence chưa lọc riêng RULE_FINDING. Cache hiện dựa trên model/scope/subject, chưa đủ phân biệt hai finding cùng đối tượng.
- EvaluationRun đã có ruleSetVersion: tận dụng trường này trước khi đề xuất thêm version/migration.
- Finding hiện chỉ có một elementId và một relationshipId; muốn làm nổi đầy đủ các service liên quan phải có danh sách ID có cấu trúc, không parse thông điệp tiếng Việt.
- Những điều trên xác nhận rủi ro trong cơ chế. Chưa đủ để kết luận tất cả cảnh báo đã lưu trong ảnh đều sai; phải đánh giá lại theo snapshot và căn cứ của từng trường hợp.

## 3. Định nghĩa thành công và giới hạn phạm vi

Sau khi click node hoặc đường, người học phải hiểu:
- Đây là gì và vai trò đã biết trong dự án.
- Vì sao MAVIS đưa đối tượng/quan hệ/nhận xét này vào mô hình.
- Điều nào có căn cứ, điều nào chưa xác định.
- Có cần làm gì tiếp và mở được đúng source/graph liên quan.

Giữ định nghĩa người dùng đã chốt: Explore evidence; Explain finding; Evaluate theo rule.
Nhãn trên UI: **Bằng chứng — Giải thích — Đánh giá**. Tên tiếng Anh đặt ở trợ giúp.

Đợt này không bao gồm chatbot tự do, hệ thống chấm điểm kiến trúc mới, tổng điểm “độ tin cậy”, viết lại analyzer, sửa toàn bộ rule catalogue, runtime execution, hoặc dựng một source IDE đầy đủ. Có thể ghi nhận các vấn đề ngoài phạm vi để xử lý riêng.

## 4. Trải nghiệm mục tiêu

### Một lần click, một ngữ cảnh
Header có tên đối tượng, loại dễ hiểu, service chứa nó nếu biết và nguồn dữ liệu.
Tóm tắt cơ bản tối đa 2–3 dòng hiện ngay bằng template từ dữ liệu thực tế.
Mặc định mở Giải thích, nhưng không tự gọi LLM, chạy evaluation hay phân tích lại source.
Click lại node hoặc đóng panel bỏ lựa chọn; giữ camera. Các thao tác “Xem trên graph” có cách quay về ngữ cảnh trước.

### Giải thích: ý nghĩa
- Node: vai trò đã xác định, các kết nối quan trọng, phần còn thiếu.
- Đường: ai → ai, loại tương tác và căn cứ cho cách hiểu đó.
- Finding: kết luận có điều kiện, vì sao đáng quan tâm, khi nào có thể chấp nhận, bước kiểm tra tiếp theo.
- Có giải thích cơ bản cả khi chưa có evaluation hoặc finding.
- Với nhiều finding, dùng danh sách tên dễ hiểu; chọn một finding mới mở giải thích chi tiết. Không đưa UUID hay RULE-02 làm tên chính.
- Không ép mọi đối tượng vào sáu đoạn văn. Mặt chính chỉ có tóm tắt, căn cứ và hành động; phần mở rộng dành cho chi tiết.

### Bằng chứng: căn cứ
- Mỗi evidence nói ngắn gọn nó hỗ trợ nhận định nào.
- Hiện đường dẫn tương đối và dòng nếu API có dữ liệu hợp lệ; không đoán line number hay loại nguồn.
- Mở excerpt hiện có với ngữ cảnh và số dòng. File đầy đủ chỉ bổ sung nếu thử nghiệm cho thấy cần thiết.
- Quan hệ DB thường cần chuỗi: component thuộc service nào → datasource nào → logical database/schema nào. Một khai báo interface riêng lẻ chưa chứng minh toàn bộ chuỗi.
- Nguồn gồm mã nguồn, cấu hình, runtime, người dùng xác nhận hoặc chưa phân loại. Dữ liệu legacy thiếu nguồn phải giữ trạng thái chưa phân loại.
- “Đã quan sát khi chạy” chỉ áp dụng cho bằng chứng thực tế thuộc đúng phiên/model.
- Snippet rỗng, thiếu hoặc bị cắt có nhãn rõ; không biến thiếu evidence thành “không có quan hệ”.

### Đánh giá: việc cần chú ý
- Trả lời kết quả thuộc rule nào, kiểm tra phạm vi nào, lúc nào, trên model/rule set nào.
- Nút “Kiểm tra kiến trúc” chạy ở cấp model và nói rõ phạm vi này; panel lọc phần liên quan.
- Trạng thái chạy, kết quả rule, độ đầy đủ bằng chứng và mức ưu tiên là bốn khái niệm riêng.
- Không có finding cho một node không đồng nghĩa node đã vượt mọi rule. Chỉ hiển thị PASS ở phạm vi có kết quả áp dụng rõ.
- Một finding có “Giải thích nhận xét”, “Xem căn cứ”, “Xem các phần liên quan”.
- Kết quả đánh giá cũ vẫn xem được, được ghi rõ là dùng phiên bản rule trước và có nút kiểm tra lại.

## 5. Quyết định ngữ nghĩa cho RULE-02

### Đầu vào phải thỏa
- Quan hệ truy cập dữ liệu thuộc các loại được rule hỗ trợ rõ ràng; không tính mọi cạnh trỏ tới DATABASE.
- Phân giải được service sở hữu component truy cập.
- Phân giải được logical datastore bằng metadata phù hợp engine và nguồn cấu hình. Chỉ tên node/host không đủ.
- Đường dẫn đồng nghĩa hoặc alias phải được chuẩn hóa theo dữ liệu đã có; thiếu thông tin thì trả thiếu dữ liệu.
- Fact do người dùng khai báo được ghi nguồn, không diễn đạt như quan sát runtime.

### Các tình huống và kết quả
1. Nhiều service chỉ depends_on máy chủ MySQL: không kết luận truy cập dữ liệu; không áp dụng phép đếm đó.
2. Nhiều service cùng instance, logical database/schema độc lập đã được xác nhận: không gắn finding dùng chung logical datastore chỉ vì chung host. Không suy rộng thành toàn bộ kiến trúc an toàn.
3. Nhiều service có quan hệ truy cập cùng logical datastore: ghi nhận việc dùng chung theo rule; nêu rủi ro coupling và điều kiện áp dụng. Chưa biết phạm vi dữ liệu/bảng thì không khẳng định chúng cùng sửa một bảng.
4. Không phân giải được datastore/owner hoặc evidence mâu thuẫn: cần xác minh hoặc không đủ dữ liệu, không tự đổi thành PASS/VIOLATION chắc chắn.
5. Có ngoại lệ thiết kế được khai báo: hiển thị ngoại lệ và lý do; không tự tạo cơ chế phê duyệt ngoại lệ mới trong đợt này.

Thay từ “truy cập đồng thời” bằng mô tả đúng dữ liệu. Không đề xuất tách database tự động trước khi hiểu phạm vi dữ liệu và chủ ý thiết kế.

Ví dụ khi chưa xác định:
“Các dịch vụ có khai báo liên quan tới MySQL. Chưa đủ căn cứ xác định chúng dùng chung database/schema. Hãy đối chiếu datasource của các dịch vụ liên quan.”

## 6. Contract tối thiểu và tương thích

### Evidence
Giữ id, sourceType gốc, locator/excerpt; bổ sung provenance và độ đầy đủ khi có căn cứ.
Metadata file/dòng/path tương đối là trường có kiểu; giá trị không biết để null.
Không phân loại nguồn bằng cách suy ra từ chuỗi đường dẫn.

### Finding và evaluation
Giữ các trường hiện có; bổ sung theo hướng tương thích:
- relatedElementIds, relatedRelationshipIds;
- supportingEvidenceIds;
- applicability, evidenceSufficiency, unknowns hoặc cấu trúc tương đương đã chốt.
Dùng ruleSetVersion sẵn có của evaluation. Chỉ thêm version riêng khi thực sự cần.
Phải có định nghĩa mỗi trạng thái và ví dụ đầu vào/đầu ra trước khi code; tránh tạo một enum gộp tất cả ý nghĩa.

### Explain
Request RULE_FINDING có findingId và evaluationRunId; server kiểm tra chúng thuộc model và subject được cấp quyền. Không coi userQuestion là định danh finding.
Response giữ explanationText cho client cũ; phần có cấu trúc đề xuất gồm summary, whyItMatters, evidenceRefs, unknowns, nextSteps và provenance của yêu cầu.
Giải thích node/đường dùng scope hiện có; không yêu cầu một finding giả.
Mỗi citation phải thuộc tập căn cứ được phép cho ngữ cảnh đó. Không mặc định lấy một nhóm evidence bất kỳ của toàn model.
Danh sách liên quan và lời giải thích không được suy ngược từ message tiếng Việt.

### Triển khai tương thích
- Chốt contract và fixtures FE/BE cùng lúc; xác định owner từng file chung.
- Phân biệt response legacy và response đủ metadata bằng contract version hoặc capability đã thống nhất.
- Client cũ tiếp tục dùng các trường hiện có. Client mới không suy đoán trường thiếu.
- Phát hành capability mới phía BE trước hoặc cùng FE. UI mới có fallback dễ hiểu khi thiếu capability.
- Không chốt migration chỉ để phục vụ tên trường trong plan; kiểm tra tận dụng schema hiện có trước.
- Frontend không tự sửa verdict backend rồi trình bày như kết quả rule mới.

## 7. Dữ liệu cũ, cache và vòng đời request

- Evaluation đã lưu giữ nguyên thông điệp/verdict/version lịch sử.
- Chạy lại sau khi rule đổi tạo evaluation mới; không tự tạo model revision mới chỉ vì đổi cách giải thích.
- Model cũ thiếu logical identity có thể cần phân tích lại source. Đây là thao tác chủ động có giải thích cho người dùng; đổi UI không làm metadata tự xuất hiện.
- Kết quả cũ thiếu rule/evidence metadata vẫn đọc được, nhưng không được trình bày như đã qua cơ chế xác minh mới.
- Cache giải thích phải phân biệt model, scope, subject, evaluation/finding, ruleSetVersion, evidence-context, ngôn ngữ và phiên bản mẫu. Hoàn thiện khóa/invalidation trước khi bỏ forceRefresh hiện tại.
- Không cache câu trả lời chưa qua validation hoặc dùng cache của người không có quyền.
- Chuyển node/finding/model nhanh phải hủy hoặc loại response cũ. Header và nội dung luôn cùng ngữ cảnh.
- Không chạy evaluation/AI lặp khi chuyển tab. Dùng lại kết quả đúng ngữ cảnh; làm mới là hành động rõ ràng.
- Provider lỗi: summary, evidence và evaluation vẫn dùng được. Không báo “AI đang giải thích” khi trả template tất định.
- Citation đúng ID chỉ là một điều kiện; vẫn cần kiểm tra câu văn có thực sự được đoạn evidence hỗ trợ.

## 8. UI có giới hạn rõ

- Desktop bắt đầu khoảng 420px, co theo không gian còn lại; phần đọc dài có thể mở rộng. Chưa cần làm cơ chế resize tùy ý ở chặng đầu.
- Mobile dùng drawer phù hợp viewport, header/nút đóng dễ tìm, một vùng cuộn nội dung chính.
- Chữ 14–16px, label tiếng Việt nhất quán; giữ nguyên tên service/class. Chi tiết kỹ thuật đặt trong phần mở rộng.
- Trạng thái luôn có chữ; màu chỉ bổ trợ. Chưa xác minh không được dùng dấu hiệu như “đã đạt”.
- Evidence dài có phân trang/mở thêm; connection/finding nhiều được sắp xếp và có giới hạn hiển thị.
- Tab và hành động có aria/focus/keyboard đúng; lựa chọn graph/diagram và panel đồng bộ.
- Nếu bổ sung đọc source đầy đủ: giới hạn trong snapshot được cấp quyền, chống path traversal, giới hạn dung lượng và che thông tin xác thực. Không công khai đường dẫn máy chủ.
- Không thêm tab tổng quan thứ tư hay thêm dropdown chọn một hệ thống thuật ngữ mới.

## 9. Các chặng giao việc

### Chặng A — Chốt semantics và contract
Đầu ra: glossary ngắn; fixture các trường hợp RULE-02; contract request/response; quy tắc legacy/cache; danh sách file và người phụ trách.
Frontend có thể dựng panel bằng fixture rõ nhãn trong môi trường phát triển. Backend xử lý rule/grounding ở phạm vi đã thống nhất.
Điều kiện qua: cả hai bên hiểu giống nhau về observed, declared, unknown, violation, severity và phạm vi PASS.
Chưa đưa kết luận rule mới ra production ở chặng này.

### Chặng B — Giao diện cơ bản và truy xuất căn cứ
Đầu ra: summary không gọi AI; ba tab dễ hiểu; evidence bảo toàn nguồn; tìm/open đúng căn cứ; node/edge selection; loading/error/legacy states.
Điều kiện qua: người dùng hiểu đối tượng khi chưa có finding; UI không gán nguồn/độ chắc chắn mà API chưa cung cấp.

### Chặng C — Rule và giải thích có ràng buộc
Đầu ra: RULE-02 đúng phạm vi; finding liên quan đủ ID/evidence; request finding/evaluation có validation; giải thích có cấu trúc và fallback; cache/invalidation.
Điều kiện qua: fixture ngữ nghĩa qua, hai finding cùng node không bị lẫn, citation không vượt ngữ cảnh, kết quả cũ không bị viết lại.
Đây là cổng bắt buộc trước khi phát hành chức năng đánh giá/giải thích mới.

### Chặng D — Ghép thật và kiểm thử người dùng
Đầu ra: luồng FTGO và fixture độc lập; báo cáo kiểm thử; sửa các điểm gây hiểu sai; xác nhận phối hợp Java.
Triển khai có cách quay về UI trước nếu gặp lỗi. Không xóa lịch sử/evidence để rollback giao diện.
Chốt khi đạt các tiêu chí ở mục 10; không mở rộng thành thay toàn bộ analyzer.

Chỉ ước lượng lịch sau chặng A và thống nhất phần Java. Không hứa thời gian chỉ dựa trên số tab UI.

## 10. Nghiệm thu

### Bắt buộc về tính đúng
- Cùng host khác logical database không bị kết luận shared data.
- Depends_on không trở thành DATABASE_ACCESS.
- Dữ liệu tĩnh không bị gọi là truy cập đồng thời/đã thực thi.
- Thiếu, mâu thuẫn hoặc lỗi tải evidence không trở thành PASS.
- Finding A và B trên cùng node có request/cache/citation đúng từng finding.
- Đổi model/snapshot không trộn dữ liệu; old-rule evaluation còn nhận diện được.
- Node không có finding vẫn giải thích cơ bản được.
- Provider lỗi không chặn các phần còn lại.
- Truy cập source và evidence kiểm tra đúng quyền/ngữ cảnh.
- Bằng chứng rỗng hoặc chỉ khai báo interface không được gọi là chứng minh đầy đủ cho một chuỗi truy cập DB.

### Bắt buộc về thao tác
Click node/edge → đọc summary → mở một evidence → xem finding → hiểu giải thích → làm nổi các phần liên quan → trở lại graph.
Đóng/bỏ focus vẫn hoạt động. Chuyển nhanh lựa chọn không hiện nội dung cũ.
Kiểm tra desktop 1440/1280px, mobile 390px, sáng/tối, tên/path dài và nhiều kết quả.

### Bắt buộc về khả năng hiểu
Thử với 3–5 người chưa dùng 3E; đây là thử nghiệm phát hiện vấn đề, không phải bằng chứng thống kê rằng mọi sinh viên đều dùng được.
Đặt năm nhiệm vụ: hiểu vai trò; tìm căn cứ; phân biệt source/runtime; đánh giá mức chắc chắn; chọn bước tiếp theo.
Mục tiêu: mỗi người làm được ít nhất 4/5 nhiệm vụ không cần hướng dẫn.
Hai lỗi nghiêm trọng bắt buộc sửa dù đạt tỷ lệ trên:
- coi suy luận/cấu hình là quan sát runtime;
- coi “chưa đủ dữ liệu” hoặc “chưa kiểm tra” là đạt rule hay vi phạm chắc chắn.
Ghi thời gian, số lần cần hỗ trợ và cách người học diễn giải bằng lời. Điều chỉnh mục tiêu thời gian sau baseline; không coi số click ít là đủ chứng minh dễ hiểu.

## 11. Phân công và giới hạn thay đổi

FE: SelectionThreeE, EvidenceViewer, kích thước panel, mapping sourceType/contract và kiểm thử tương tác.
BE cần phối hợp: RULE-02 trong ArchitectureEvaluationServiceImpl; AiExplainRequestDTO/response và AiExplanationServiceImpl; finding/evidence DTO và retrieval có liên quan.
File chung: contracts.ts, domain.ts, java-wire.ts, entity/schema nếu cần — thống nhất owner trước khi chỉnh.
Không sửa các chặng profile/OTP/admin/education/runtime orchestration/configuration/scenario execution của bạn Java.
Không tự gửi tin nhắn/giao việc cho bạn của người dùng.

Definition of done: nội dung đúng phạm vi dữ liệu, có căn cứ truy được, phân biệt rõ điều chưa biết, người học biết bước tiếp theo; không nghiệm thu chỉ vì ba tab hoạt động hoặc AI trả ra văn bản.
