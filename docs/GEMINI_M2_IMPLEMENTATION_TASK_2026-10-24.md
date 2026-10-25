# Prompt giao Gemini triển khai M2 theo roadmap Graph C4 UML

Bạn là implementation agent của MAVISS. Hãy thực hiện milestone M2 dưới đây trên repository hiện tại. Đây là nhiệm vụ triển khai code và kiểm chứng, không chỉ đọc tài liệu hoặc đề xuất kế hoạch. Hoàn thành phần tự thực hiện được trong M2, rồi bàn giao để reviewer nghiệm thu trước khi sang M3.

## A. Ngữ cảnh và quy tắc làm việc

Workspace: `C:\Users\nhuth\Desktop\MAVISS`.

Đọc trước:

1. `docs/DIAGRAM_IMPLEMENTATION_ROADMAP_2026-10-24.md`: roadmap và findings hiện hành; đọc kỹ baseline và M2. M3–M8 là hướng đi, chưa phải phạm vi code của lượt này.
2. `AGENTS.md` áp dụng nếu có, cùng các chỉ dẫn người dùng đã cung cấp; chỉ đọc thêm hướng dẫn tại các thư mục sẽ sửa.
3. `docs/M1_C4_E2E_REPORT_2026-10-24.md`: kết quả M1 và các giới hạn, không dùng các báo cáo vòng đầu làm trạng thái cuối.
4. `output/main-sync-2026-10-24/REPORT.md`: main mới đã được ghép như thế nào và giới hạn verification.
5. Các phần liên quan trong `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md`, `Graph.docx` và ba tài liệu C4 trong `.doc_review/main/Thông tin về hệ thông diagram/`. Dùng DOCX như tài liệu tham chiếu; ví dụ minh họa không phải dữ kiện sản phẩm.

Baseline lịch sử: HEAD từng là `c299a91`, main mới `e64de71` đã ghép vào working tree cùng code M1; CHƯA có merge commit. Phải xác minh lại trạng thái hiện tại, không ghi đè các thay đổi có sau baseline. Bộ kiểm gần nhất: FE 102/102 pass, typecheck/mainflow/build đạt; Java client/common/platform/analyzer 348 thực chạy đạt + 13 skip; toàn reactor test-compile đạt. Các con số này là lịch sử, không phải kết quả bạn chạy.

- Không commit/push/merge/deploy; không reset/clean/stash hoặc khôi phục file người khác bằng git checkout.
- Giữ nguyên thay đổi có sẵn; lưu diff/bản sao các file bạn sắp sửa và ghi rõ change set của M2. Không thu gom toàn bộ working tree thành thay đổi của mình.
- Không scan toàn repository. Tìm theo symbol/path rồi đọc đúng phần cần thiết. Không sửa code ngoài phạm vi để làm đẹp.
- Giữ encoding và line endings. Không thêm dependency hoặc thay graph/editor engine trong M2.
- Không sửa auth hoặc tắt guard để chạy acceptance. Không đọc/in credential, token hay cookie vào log/artifact. Chỉ nhờ người dùng đăng nhập nếu thực sự cần và làm tiếp phần độc lập trong khi chờ.
- Không khởi động lại/dừng stack đang chạy khi chưa biết owner/source/build. Nếu cần build mới, ưu tiên port và dist riêng, nêu rõ FE trỏ backend nào.
- Không áp migration lên DB dùng chung, sửa migration đã áp dụng, xóa model hoặc sửa evidence/source facts để test xanh. Dùng fixture/DB test riêng khi cần.

## B. Mục tiêu M2

Hoàn thiện hợp đồng và trải nghiệm Graph/C4: người dùng hiểu đang xem model nào, quan hệ nào có nguồn, số evidence đang được đếm theo đơn vị gì, phần nào bị gộp/lọc/cắt; các dữ kiện này tồn tại đúng từ backend tới UI. Đồng thời tạo nền kiểm chứng cho chín loại diagram trong roadmap.

Giữ các thành quả M1: C1 không tự tạo caller, C2 System Boundary, C3 scope đúng container, protocol messaging có nguồn, aggregation trung thực, document CAS và round-trip metadata.

## C. Cách bắt đầu

Kiểm tra trạng thái Git và các file liên quan. Ghi một bản thiết kế ngắn trong báo cáo M2 TRƯỚC khi code, gồm:

- Vocabulary thực tế Java / CHECK DB / FE, hướng và nhãn từng quan hệ.
- Dữ liệu evidence hiện được lưu và truy vấn ở đâu; cách lấy count hàng loạt và cách hợp nhất khi aggregation.
- Các field additive cần thiết, nullability và fallback backend cũ.
- Phân biệt số source, số item hiển thị, số gộp, bị lọc, bị giới hạn.
- Danh sách fixture và expected độc lập sẽ dùng.

Sau phần thiết kế, tự tiếp tục triển khai M2; không dừng chỉ để xin duyệt các lựa chọn cục bộ đã nằm trong phạm vi. Nếu gặp quyết định chưa được chốt, giữ tương thích, ghi nhận rõ và tiếp tục phần không phụ thuộc.

## D. Phạm vi phải triển khai

### D1. Đồng bộ vocabulary và xử lý UC-01 minh bạch

- Xác minh drift đã nêu trong roadmap: enum ElementType thiếu MESSAGE_CHANNEL; RelationType thiếu MESSAGE_PUBLISH/MESSAGE_SUBSCRIBE so với CHECK V13. Đồng bộ giá trị hiện có và các mapping bị ảnh hưởng, có contract test thực sự.
- Không đổi DB relation types sang tên gợi ý trong Graph.docx chỉ để khớp tài liệu.
- Giữ chiều backend hiện hành: publish producer → channel; subscribe channel → consumer, nhãn “Delivers messages to”. Ghi quy ước hiện hành và sự khác biệt với góc nhìn consumer → topic.
- Chưa có phê duyệt đổi/chốt quy ước nhóm thì UC-01 giữ trạng thái chờ quyết định; không tự đánh dấu resolved. UC-01 không được chặn các phần M2 độc lập.

### D2. Evidence từ backend tới aggregate và panel

- Thêm hoặc tận dụng metadata additive để biểu diễn số evidence thực sự của cạnh. Chọn field sau khi đọc entity/repository/DTO thật; không giả định evidence đang là node trong graph.
- Count là số evidence distinct trong phạm vi model/snapshot đã chọn, không phải số cạnh, call-site hoặc span thay thế tùy tiện.
- Khi gộp các cạnh cùng nhóm, count là hợp của evidence thực tế, không cộng mù nếu trùng ID. Giữ underlyingEdgeIds đầy đủ.
- Nếu không có đủ dữ liệu để tính hợp, biểu diễn unknown và có đường tải chi tiết/batch khi cần. Không gán 0 cho “chưa tải”, không hiển thị count nguồn đơn lẻ như count toàn nhóm.
- Phân biệt known zero, known positive và unknown bằng contract và UI. Backend cũ vắng field không làm vỡ graph.
- Dùng truy vấn theo tập hoặc chiến lược batch phù hợp; không gọi repository/API evidence một lần cho mỗi cạnh trong lúc load graph. Có kiểm chứng số lần gọi hoặc query strategy, tránh N+1.
- Không gửi nguyên properties/evidence JSON nhạy cảm chỉ để lấy một count. Quyền truy cập, model và snapshot phải giữ đúng scope.

### D3. Phạm vi view, thống kê và legend

- Người dùng thấy project/model revision/snapshot tương ứng khi có dữ liệu; không tự suy một commit không được API cung cấp.
- Phân biệt source nodes/edges, item sau aggregation, cạnh nội bộ nhóm, bị lọc và bị cắt giới hạn. Chốt định nghĩa và kiểm counts ở đúng pipeline stage; các tập có thể giao nhau thì không cộng thành tổng giả.
- Phân biệt omitted bởi quy tắc view và truncated do giới hạn. Nếu hiện không có limit thực thi ở một đường thì không gắn cờ truncated=true chỉ vì có omitted.
- Bổ sung legend loại node/edge và nguồn/trạng thái phù hợp; không dùng màu làm cách phân biệt duy nhất. Giữ giao diện gọn, có thể mở chi tiết thay vì nhồi mọi thông tin lên canvas.
- Thay filter/layout/gộp phải giữ dữ liệu nguồn và khả năng mở đúng evidence.

### D4. Protocol còn thiếu trong C4

- Review HTTP/database và các nhãn quan hệ liên quan. Chỉ bổ sung công nghệ/protocol khi có field nguồn đã kiểm chứng, đúng scope.
- Nếu dữ liệu đã tồn tại nhưng mất ở adapter/DTO, bảo toàn nó qua đường dữ liệu với test production mapping/serialization.
- Không tự gán HTTP/JDBC/Kafka từ tên node, kind, languageStack hoặc một default. Không dùng transport binding như endpoint address nếu chưa có contract.
- Trường hợp source chưa có protocol: nhãn hiện tại giữ nghĩa hành động và phần thiếu được ghi rõ trong coverage report, không tạo fact.
- Giữ gate theo view; không làm nhãn Graph/UML thay đổi ngoài chủ đích. Text tính layout phải khớp text render.

### D5. Đóng các kiểm chứng M1 còn thực hiện được

- Trên dataset Test1/model đúng revision hoặc một document test được chỉ định, thực hiện kéo node đúng shape, undo, redo; xuất/probe XML để chứng minh tọa độ thay đổi/khôi phục, topology và boundary không đổi.
- Save qua UI bằng CAS → reload → đối chiếu revision, geometry và metadata. Phân biệt model revision với document revision.
- Bảo toàn bản lưu/history của người dùng. Dùng document test riêng nếu không có chỉ định ghi tiếp bản đang dùng; không tự sửa XML/DB để giả lập việc kéo bằng chuột.
- Nếu automation không thực hiện được, ghi hiện tượng đã quan sát, không tự kết luận nguyên nhân cross-origin. Giữ NEEDS MANUAL VERIFICATION, cung cấp hướng dẫn ngắn và hoàn tất phần còn lại của M2; không gọi toàn M2 PASS.
- Không lặp vô hạn thử tọa độ/regex shim. Ưu tiên protocol editor chính thức và DOMParser thật cho kiểm chứng structural.

### D6. Nền kiểm chứng chín diagram

- Tạo một coverage manifest/checklist gồm C4 C1/C2/C3 và UML Class/Sequence/Package/Deployment/Activity/State. Mỗi rule trỏ về tài liệu, loại bằng chứng cần và trạng thái supported/source-supported/designed-only/not-implemented.
- Fixture cho các rule Graph/C4 triển khai trong M2 có đáp án literal/độc lập, positive và negative tests chạy trên hàm production thật.
- Với UML tương lai chỉ xác định shape/expected và trạng thái chưa triển khai; không tạo validator luôn trả true hoặc assertion xác nhận feature vắng để gọi là notation acceptance.
- Có ít nhất một source fixture Java và một source fixture C# với đáp án độc lập, chạy đúng extractor → model builder/adapter → Graph/C4, không thay đầu vào bằng model JSON viết sẵn rồi gọi là source E2E.
- Giữ fixture source nhỏ: service/component, dependency hoặc messaging mà extractor hiện hỗ trợ; không mở rộng sang class-member/CFG extraction thuộc M4/M6.
- Không dùng corpus synthetic để tuyên bố precision/recall toàn sản phẩm. Report phải ghi rõ tập nào kiểm contract, tập nào kiểm extraction và tập nào là dataset thực.
- Dùng metadata model/view/notation/schema version và provenance tối thiểu có sẵn; chỉ bổ sung phần cần để đảm bảo các tests M2. Không xây framework UML tổng quát trước M3.

## E. Kiểm chứng bắt buộc

1. Test các symbol production đã sửa: DTO/service mapping, aggregation, adapter, count/scope, label gating. Expected không tính bằng chính hàm production đang kiểm.
2. Negative cases: metadata thiếu/sai kiểu, evidence trùng, known zero và unknown, backend cũ, unresolved, cạnh song song, self-loop nếu đường sửa liên quan, khác model/snapshot và dữ liệu bị từ chối do quyền.
3. FE regression, typecheck, mainflow. Build final source bằng dist cô lập; giữ byte cấu hình generated có trước lượt build.
4. Java regression liên quan và compile các module bị ảnh hưởng. Worker regression liên quan nếu thay C# hoặc contract; fixture C# phải chạy extractor thật.
5. Browser acceptance trên build/backend có code M2: load Graph, xem count/legend/scope, filter/gộp rồi truy về cạnh/evidence gốc, C1/C2/C3 không hồi quy, save/reload/export theo phần đã sửa.
6. Ghi rõ lệnh, build/source, dataset/model/document revision, kết quả và file evidence. Build/test xanh không thay thế browser acceptance.

Không chạy test cần database dùng chung hoặc Docker workload chỉ vì suite tồn tại. Chuẩn bị môi trường test cô lập khi cần; nêu phần chưa chạy thay vì dùng số liệu lịch sử thành kết quả mới.

## F. Tài liệu và bàn giao

Tạo `docs/M2_GRAPH_C4_CONTRACT_REPORT_2026-10-24.md`, artifacts nhỏ trong `output/m2/`, cập nhật ngắn gọn README FE, gap review và trạng thái roadmap. Không rewrite lịch sử M1 như thể kết quả bị lỗi trước đây là PASS; có thể ghi đính chính và liên kết báo cáo đúng.

Báo cáo kết thúc gồm:

1. Người dùng hiện làm được thêm gì qua UI.
2. Một bảng trạng thái hiện tại cho D1–D6: implementation, test thực chạy, browser, giới hạn.
3. Contract/count definitions và compatibility behavior; UC-01 ghi đúng trạng thái chưa được nhóm chốt nếu vẫn vậy.
4. Expected/actual cho lỗi phát hiện và cách sửa, kèm file:symbol.
5. Lệnh thực chạy, kết quả, skip/NOT RUN và nguyên nhân; không trộn historical results.
6. Danh sách file thực sự sửa trong M2, phân biệt với thay đổi baseline có sẵn.
7. Blocker còn lại và một bước tiếp theo cụ thể; không chuyển sang code M3 khi chưa review M2.

Không đánh dấu M2 đạt toàn bộ nếu phần source Java/C#, browser hoặc manual còn mở. Đồng thời không dừng cả milestone chỉ vì một thao tác cần người dùng: hoàn tất các hạng mục tự thực hiện được rồi bàn giao đúng trạng thái.

## G. Lộ trình sau M2 để giữ ngữ cảnh

Sau reviewer nghiệm thu từng mốc mới triển khai mốc tiếp:

- M3: Sequence từ designed/observed, participant ID, message sort, fragments, evidence và persistence.
- M4: Class/Package, dữ kiện Java/C# và ký pháp cấu trúc có provenance.
- M5: Deployment, node/environment/artifact/hosting/manifestation.
- M6: Activity theo scope operation/workflow, swimlane và token semantics.
- M7: State Machine, source-supported patterns và designed transitions/composite states.
- M8: hiệu năng, coverage toàn bộ danh mục và nghiệm thu sản phẩm.

Chỉ M2 được giao triển khai bằng prompt này. Hãy bắt đầu từ trạng thái repository và bản thiết kế ngắn, rồi thực hiện đến bản bàn giao M2 có thể review.
