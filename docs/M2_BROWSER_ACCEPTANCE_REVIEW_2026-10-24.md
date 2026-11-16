# Review browser acceptance M2

## Cập nhật reviewer sau khi renderer đã hoạt động

**Duyệt browser acceptance Scenarios 1–7 trong phạm vi bằng chứng của lượt mới. D5 vẫn NEEDS MANUAL VERIFICATION; UC-01 OPEN.** Kết luận PENDING của C4 ở phần review trước bên dưới được giữ như lịch sử và đã được thay thế bởi cập nhật này.

Reviewer đã xem ảnh C1/C2/C3 mới và parse độc lập bốn cặp XML/SVG từ browser acceptance. Kết quả: C1 có 1 system node/0 edges; C2 có 1 boundary, 17 members/12 edges; C3 order có 17 internal/4 external/22 edges; C3 kitchen có 8 internal/2 external/10 edges; internal intersection bằng 0, không có dangling edge ở các artifact đã kiểm. SVG đều parse hợp lệ. Đây là review artifacts từ run của implementation agent, không phải một lượt browser UI do reviewer tự chạy lại.

Chi tiết máy đọc: `output/m2/browser-acceptance/reviewer-c4-artifact-verification.json`. Các số xmlUtf8Bytes/svgUtf8Bytes trong đó là kích thước file thực; một số trường ByteLength trong report của script dùng độ dài chuỗi, không lấy chúng thay cho kích thước UTF-8.

Reviewer xác minh QA Node scripts đã kết thúc; Docker backend và renderer8090 vẫn chạy như dependency ứng dụng. Không cần tắt Docker khi còn dùng draw.io. Nếu launcher mở Docker backend thành background task dài hạn, cần báo rõ đó là service được giữ lại, không phải test còn chạy.

Chỉ còn D5 cần thao tác editor thực và đối chiếu save/reload/geometry. Baseline từ artifact saved revision 6 đã lưu tại `output/m2/browser-acceptance/d5-before-manual-rev6-geometry.json`; đây là baseline lịch sử của download rev6, cần đối chiếu revision hiện tại khi kiểm lần lưu tiếp theo. Không đánh toàn M2 hoàn thành hoặc bắt đầu M3 khi chưa có quyết định chốt mục manual còn mở.

---

Ngày 24/10/2026. Reviewer Codex. Kết luận: **chấp nhận phần Graph/3E smoke acceptance đã quan sát; C4 visual acceptance vẫn PENDING; D5 vẫn NEEDS MANUAL VERIFICATION; chưa đóng toàn M2.** Implementation đã duyệt theo hồ sơ riêng.

## Reviewer đã kiểm tra

- Đọc acceptance-report.json và script run-m2-browser-acceptance.cjs hiện tại.
- Xem trực tiếp ảnh nhóm có distinct evidence count=2, ảnh drill member thứ hai RestaurantRepository có count=1 và nút quay nhóm, ảnh C3 đã chọn ftgo-order-service nhưng preview còn Rendering diagram….
- Xác minh không còn Node QA processes khớp verify-drawio-roundtrip/test-diagram-views/run-m2-browser-acceptance tại thời điểm kiểm tra. Các cổng 3000/8081/5082/5432 vẫn listen; 8090 và QA8814 không listen. Reviewer không dừng/restart process.
- DrawioSnapshot thực sự dùng DRAWIO_ORIGIN=http://127.0.0.1:8090 qua iframe export SVG. Renderer vắng phù hợp với trạng thái preview pending, không phải căn cứ để kết luận code C4 bị hỏng.
- Dữ liệu round-trip sáu cycles và hash extractor đã được reviewer kiểm trong lượt trước; không tính lại thành một lần pointer drag mới.

## Phạm vi acceptance

Scenario 1–6 có bằng chứng DOM/screenshots hỗ trợ các thao tác chọn model, Graph, count, drill-down, group gating và đổi scope. Chấp nhận trong phạm vi đó. Chưa chứng minh provider AI được gọi thành công, mọi API scenario hoặc mọi stale-response race trên browser.

Scenario 7 không còn PASS giả chỉ vì mở tab. Tuy nhiên hiện cả C1/C2/C3 đều chưa có SVG. Sau khi renderer hoạt động, chỉ tìm SVG cũng chưa đủ: phải kiểm system name, boundary/membership và C3 đúng service. Chờ 1.5 giây cố định không phải render-completion condition.

Scenario 8 chỉ page.$('iframe') và pointerDragVerified=false. DrawioSnapshot có iframe ẩn với title Diagram rendering service, nên đây không phải bằng chứng editor iframe đã mở. Lý do connector handle là observation lịch sử M1, không phải một thao tác drag vừa được script này thực hiện. Trạng thái manual pending hợp lệ; sửa mô tả nguồn bằng chứng cho đúng.

## Prompt giao Gemini hoàn tất acceptance còn lại

Implementation M2 và phần Graph/3E đã đạt các mức kiểm chứng nêu trên. Chỉ hoàn tất các mục sau, không thêm feature và chưa code M3:

1. Khởi động dependency draw.io8090 theo compose/runbook hiện có. Nếu Docker Desktop chưa chạy, có thể mở dependency local trong phạm vi QA; nếu tool/quyền thực tế chặn, nêu đúng lỗi và nhờ người dùng đúng một thao tác bật Docker. Không thay auth, migration hay dừng stack của người khác.
2. Kiểm readiness renderer trước khi chạy Scenario 7. Chờ SVG/export-complete hoặc lỗi renderer với timeout hữu hạn, thay fixed wait 1.5s. Không gán trạng thái renderer offline chỉ từ việc chưa thấy SVG sớm.
3. Kiểm C1 riêng: system Test1, notice thiếu caller trung thực, không tự thêm actor; C2: Test1 boundary, membership/source IDs đúng model, nhãn protocol có nguồn; C3: chọn ít nhất order-service và kitchen-service, nội dung khác nhau đúng scope và các dependency ngoài boundary. Đối chiếu saved/generated view rõ; export/DOM/XML/screenshot là bằng chứng, không chỉ dropdown/menu.
4. Lưu request log cần thiết cho các đường thực dùng: /api/mavis/* và /api/backend/*, chỉ metadata đã loại secret. Group Explain 0 requests là một kiểm chứng negative, không có nghĩa mọi request evidence đã được kiểm. Không gọi provider ngoài nếu không cần cho ca gating.
5. D5: phải mở Edit in draw.io, xác định iframe editor theo title/URL chính xác, không chọn iframe renderer ẩn. Nếu thực hiện được thì kéo/undo/redo/save/reload và đối chiếu geometry. Nếu chưa, giữ NEEDS MANUAL VERIFICATION, ghi lịch sử connector-handle riêng và đưa hướng dẫn một thao tác cần người dùng. Không giả lập kéo bằng sửa XML/DB.
6. Script có try/finally, finite timeout, đóng đúng browser/QA helper khi xong; không kill tất cả Node/browser. Có FAIL thật thì exit code phải phản ánh lỗi; PENDING phải ghi rõ và không được gọi PASS.
7. Đồng bộ report/README/roadmap theo kết quả thật, giữ UC-01 OPEN. Chỉ sửa sản phẩm khi ca acceptance tái hiện lỗi sản phẩm; nếu chỉ bật renderer/sửa script thì không chạy lại toàn bộ Worker/Java regression đã đạt.

Bàn giao một lần: trạng thái C1/C2/C3 có hình, scope evidence và D5. Không kéo dài việc sửa văn phong báo cáo; không commit/push/merge/deploy/reset/clean/stash. Giữ document/history người dùng; nếu save để kiểm chứng, dùng document test hoặc revision được cho phép.
