# Plan cải thiện UI/UX Architecture Inspector · 3E

Ngày: 2026-10-29. Trạng thái: đã có bản thử dock dưới cho Graph; phần tổ chức nội dung tab còn theo plan.

Bản thử theo phản hồi người dùng: Graph toàn chiều ngang, Inspector bên dưới có kéo chiều cao, thu gọn/mở rộng/đóng. Mobile mở Inspector gần toàn vùng làm việc. Header gọn, không footer cố định. Graph controls thu thông tin phụ khi dock mở; camera fit lại theo vùng canvas. Layout Diagram hiện giữ sidebar cũ. Kiểm thử bằng browser local với mock: ba tab, kéo chuột, bàn phím, Escape trả focus, connection details và mobile 390px. Không thay đổi production hay semantics evidence.

## 1. Vấn đề đã đối chiếu với ảnh và code

- Panel desktop giới hạn 440–480px, trong khi header/footer và tab chiếm nhiều chiều cao. Nội dung quan trọng nằm quá sâu.
- Header có banner Blast Radius gây nhiễu. Bản bỏ banner đã ở nhánh hiện tại, chưa merge production; không triển khai lại.
- Explain và Evidence cùng render CommunicationPanel, khiến người dùng đọc lại một danh sách.
- Dòng cặp service dùng flex-wrap với nhóm protocol không co; cộng overflow-wrap:anywhere ở toàn panel khiến tên dài bị ép thành cột chữ.
- Nhãn service màu amber/emerald dùng màu chữ nhạt trên nền sáng, không phù hợp cả hai theme.
- Evaluate hiển thị một đoạn văn dài cùng danh sách assumptions/unknowns. Người đọc khó phân biệt nhận định có bằng chứng với điều chưa kiểm chứng.
- Số saved/preview ở header và số snippet được AI sử dụng có phạm vi khác nhau nhưng UI chưa giải thích rõ.
- Nhiều viền, nền badge và details lồng nhau tạo cảm giác khung trong khung. Không suy ra mọi viền xanh trong ảnh là lỗi: cần kiểm tra focus thực tế và giữ focus bàn phím.

Điểm sửa chính: selection-three-e.tsx, communication-panel.tsx, three-e-evidence.tsx và vùng bố cục Inspector trong architecture-presentation.tsx.

## 2. Bố cục chung

- Giữ Inspector cạnh Graph; không chuyển Graph sang trang khác và không mở một panel khác cho mỗi thao tác.
- Header gọn: tên đối tượng, loại, revision và trạng thái nguồn. Đưa dòng trang trí Architecture Inspector · 3E về nhãn phụ nhỏ.
- Bỏ footer cố định lặp thông tin; đưa revision/nguồn diễn giải vào header hoặc phần chi tiết.
- Desktop cho phép kéo rộng panel, đề xuất mặc định 520px và giới hạn theo chiều rộng màn hình để Graph còn sử dụng được. Màn hình hẹp dùng drawer gần toàn màn hình, không ép thành sidebar 380px.
- Header và tabs cố định; mỗi tab có một vùng cuộn chính. Đoạn code cuộn ngang trong chính khối code; mở rộng code dài theo nhu cầu.
- Giữ ba tab Explain / Evidence / Evaluate, dùng chung kích thước, khoảng cách và trạng thái active.
- Lưu vị trí cuộn riêng từng tab theo selection; đổi đối tượng thì reset nội dung và không trộn phản hồi AI cũ vào selection mới.
- Tên đầy đủ được đọc bằng cách mở dòng, tooltip hỗ trợ chuột; không chỉ dựa vào tooltip. Không bẻ tên thành từng ký tự.

## 3. Explain: hiểu nhanh đối tượng đang chọn

Thứ tự nội dung:
1. Tóm tắt vai trò 2–4 dòng và giới hạn nguồn diễn giải.
2. Những gì source cho thấy: tối đa 3–5 ý ngắn, mỗi ý dẫn tới evidence nếu có mapping thật.
3. Quan hệ liên quan: chỉ số đối tác và liên kết chuyển sang Evidence; không lặp toàn bộ CommunicationPanel.
4. Ask a follow-up thu gọn mặc định, không chen giữa thông tin chính và evidence.

Đối với node: giải thích vai trò và dependencies. Đối với relationship: giải thích hai đầu, chiều và loại quan hệ. Đối với connection gộp: nói rõ đây là nhóm quan hệ, không biến nhóm thành một lời gọi runtime.

## 4. Evidence: danh sách để tra cứu, không phải đống badge

- Một nguồn danh sách duy nhất, nhóm theo đối tác; subject đã có ở header nên không lặp lại trên mọi dòng.
- Mỗi dòng có tên đối tác ở hàng chính, tóm tắt loại quan hệ ở hàng phụ và số quan hệ gọn ở bên phải. Protocol kỹ thuật đầy đủ chuyển vào phần mở rộng.
- Bố cục dạng grid có min-width hợp lý; tên không tranh chỗ với ba badge protocol.
- Search theo tên đối tác/file; filter All / Saved source / Metadata preview khi dữ liệu tương ứng tồn tại. Count ghi rõ là số snippet, số quan hệ hay số đối tác.
- Mở một nhóm thấy quan hệ gốc, sau đó chọn một quan hệ để xem caller / receiver / configuration bằng cùng mẫu trình bày. Không mặc định nhóm là giao tiếp hai chiều.
- File path, dòng nguồn, nguồn evidence và nút copy dùng cùng vị trí trong mọi snippet. Dẫn chứng chưa có phía nào thì ghi rõ phía đó chưa có, không mượn code từ phía khác.
- Evidence nội bộ của node là một nhóm ngang hàng dễ tìm, không chôn dưới nhiều accordion. Metadata kỹ thuật chi tiết thu gọn cuối tab.
- Nút từ Explain/Evaluate chuyển sang Evidence phải mở đúng nhóm/snippet liên quan, đưa vào vùng nhìn thấy và giữ đường quay lại.
- Search không có kết quả phải giữ đường clear filter, không hiển thị như không có evidence.

## 5. Evaluate: đọc được kết luận và căn cứ

- Đầu tab là tóm tắt đánh giá ngắn; không dùng cả một đoạn văn dài làm nội dung duy nhất.
- Các nhận định riêng: tiêu đề, nội dung ngắn, căn cứ và giới hạn. Mở rộng để đọc đầy đủ.
- Tách ba nhóm: Supported findings / Assumptions / Not verified. Không gộp điều chưa biết thành lỗi hệ thống.
- Chỉ hiển thị severity, score hoặc pass/fail nếu có rule/evaluation trả về thực tế. Không tự suy ra mức nghiêm trọng từ văn AI.
- Các nhận định có evidence được chọn mở đúng evidence đó. Không có mapping thì nói rõ, không gắn link evidence ngẫu nhiên.
- AI đang trả text dài: giữ fallback đọc đầy đủ. Muốn hiển thị finding có cấu trúc phải mở rộng schema, validate ở adapter và giữ tương thích response cũ; không cắt câu rồi tự bịa cấu trúc hay kết luận.
- Một thông báo giới hạn ngắn ở đúng chỗ, không lặp disclaimer nhiều lần.

## 6. Quy tắc tương tác và dữ liệu

- Trạng thái loading/error/empty/partial có vị trí ổn định và Retry tại chỗ; có lỗi AI vẫn giữ nội dung source đã tải.
- Không gọi lại AI chỉ vì đổi tab, mở accordion hoặc kéo rộng panel. Tải thêm evidence theo nhu cầu và dùng cache đúng model/selection.
- Đổi selection nhanh phải hủy/bỏ kết quả cũ, không nhấp nháy nội dung của service trước.
- Focus hiển thị khi dùng bàn phím, Escape đóng drawer, trả focus về node/connection đã chọn. Không xóa focus chỉ để ảnh đẹp.
- Light/dark dùng token theme, ưu tiên nền trung tính. Màu chỉ báo loại và trạng thái cần thiết, không tô mọi tên service.
- Giữ nguyên ID canonical, provenance, saved/preview và phân biệt source với runtime. Không sửa semantics để làm UI ngắn hơn.
- Change Impact chỉ ở trang riêng theo yêu cầu đã chốt.

## 7. Thứ tự triển khai

1. Bố cục và typography: header/footer, chiều rộng responsive, scroll, sửa tên dài và màu chữ.
2. Tách vai trò tab: Explain ngắn; CommunicationPanel chỉ còn ở Evidence; chuẩn hóa count.
3. Evidence navigation: nhóm đối tác, search/filter, mở đúng snippet và quay lại.
4. Evaluate: cấu trúc nhận định, schema tương thích và fallback text hiện có.
5. Kiểm thử browser và regression; sau đó commit lên nhánh feat để review. Merge/deploy theo yêu cầu người dùng.

Không làm lại Graph, analyzer hoặc nghiệp vụ Change Impact trong đợt này.

## 8. Tiêu chí nghiệm thu

- Tên eventuate-local-cdc-service và tên dài hơn không bị ép thành cột ký tự ở panel 390/480/520px.
- Ở màn hình desktop phổ biến, khi mở panel thấy được tóm tắt đầu Explain mà không cần cuộn header.
- Một vùng cuộn chính mỗi tab; không mất trạng thái tab khi kéo rộng panel. Mobile không tràn ngang toàn trang.
- Explain không lặp danh sách snippet; Evidence không lặp nguyên phần giải thích AI.
- Link evidence từ finding mở đúng canonical relationship/snippet, không làm mất selection.
- Saved/preview/AI-cited count phân biệt rõ và khớp dữ liệu; không cho cảm giác đã xác minh runtime khi chỉ có compose/config.
- Kiểm tra service, relationship, group, unknown node, evidence thiếu một phía, không evidence, metadata-only, AI lỗi/chậm, đổi selection liên tục và code dài.
- Browser kiểm tra light/dark ở 390, 768, 1366 và 1920px; thao tác bàn phím, Escape và focus return.
- Regression 3E/evidence hiện có, TypeScript, lint phần sửa và production build đạt. Chụp ảnh đủ ba tab bằng fixture xác định; ghi rõ test nào dùng fixture và test nào kết nối backend thật.
