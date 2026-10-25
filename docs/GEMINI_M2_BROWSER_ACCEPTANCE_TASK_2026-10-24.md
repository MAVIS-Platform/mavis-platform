# Nhiệm vụ nghiệm thu màn hình M2 sau khi chốt implementation

Bạn tiếp tục MAVISS với nhiệm vụ **browser acceptance M2**, không mở feature mới hoặc triển khai M3 trong lượt này. Đọc `docs/M2_IMPLEMENTATION_ACCEPTANCE_2026-10-24.md` khi reviewer đã xuất bản và trạng thái M2 mới nhất. Giữ các sửa đổi G1–G3 đã đạt.

## Mục tiêu

Xác nhận các capability đã có chạy đúng trên Architecture workspace thật với backend chứa code M2. Không cần thêm một vòng nghiên cứu, đổi thư viện hoặc viết lại báo cáo lịch sử.

## Chuẩn bị stack

- Kiểm tra source/build/owner của các service đang chạy. Runbook cũ dùng FE3100, Java8082 và draw.io8090; không giả định FE3000/API8080 là stack duy nhất.
- Được khởi động stack local riêng để kiểm thử trong phạm vi nhiệm vụ, dùng port/dist còn trống khi cần. Không dừng/ghi đè stack của người khác, không deploy và không áp migration vào database dùng chung. Backend cũ đang chạy không được dùng làm bằng chứng endpoint M2 nếu không chứa thay đổi M2.
- Giữ auth guard. 401 khi chưa đăng nhập là hành vi đúng, không phải tự thân một blocker kỹ thuật. Nếu cần, mở form đúng browser context và nhờ người dùng đăng nhập một lần; không in credential/token/cookie và không bypass auth.
- Nếu tool/settings thật sự ngăn khởi động hoặc điều khiển browser, ghi lỗi cụ thể và làm hết phần không phụ thuộc. Không tự đặt quy tắc “headless nên không được mở server”.

## Scenario acceptance

1. Chọn project/model/snapshot thực, ghi đủ ID và phân biệt model revision với document revision.
2. Mở Graph chính qua ArchitecturePresentation → DependencyNetwork. Kiểm legend, scope/statistics, search highlight và origin/expand/collapse đúng hành vi.
3. Chọn một nhóm có ít nhất hai source relationships. Đối chiếu aggregate evidence count với distinct evidence IDs thực từ API; không cộng count mù. Kiểm known zero/unknown nếu dataset có, nếu không ghi rõ coverage còn thiếu thay vì sửa source facts.
4. Drill cạnh đầu (cùng representative ID), quay nhóm, drill cạnh thứ hai: title/count/evidence/findings đều đúng canonical subject. Quan sát request, không chỉ helper test.
5. Group mode không gọi Explain hay relationshipEvidence của cạnh đầu rồi trình bày như toàn nhóm. Finding của member thứ hai chỉ được giải thích sau khi chuyển tới đúng member; finding không xác định một member cụ thể không được tự gán ngẫu nhiên.
6. Expanded source → collapsed group cùng representative ID; đổi group membership/filter/model. Giải thích/finding cũ không còn hiển thị dưới scope mới. Nếu không có provider AI, có thể xác minh request/guard và thông báo lỗi thực, không giả PASS cho output provider chưa chạy.
7. C1/C2/C3 không hồi quy: system name, không actor giả, boundary/membership, protocol có nguồn, C3 đúng container.
8. D5 nếu thao tác được: kéo node thật → undo → redo → save CAS → reload → export; đối chiếu geometry/metadata/source IDs. Dùng document test riêng hoặc lịch sử revision được phép, bảo toàn bản người dùng đã lưu. Không sửa XML/DB để giả lập thao tác kéo.

Trường hợp thiếu dữ liệu để thử một ca: có thể dùng fixture test cách ly với provenance rõ, nhưng không gọi nó là dữ kiện trích từ project thật. Browser E2E không được thay bằng SSR, test controller hoặc unit test.

## Bằng chứng và điểm dừng

- **Quản lý tiến trình test:** test xong hoặc gặp lỗi phải lưu kết quả, đóng browser/context và các QA helper/server do chính tác vụ tạo ra khi không còn cần dùng. Dùng try/catch/finally, timeout hữu hạn và exit code đúng; không chỉ catch(console.error) rồi để browser/server giữ Node còn sống, không dùng process.exit(0) để che lỗi. Không kill toàn bộ node/browser hoặc dừng stack người dùng/agent khác.
- Harness HTTP chờ browser phải được thông báo rõ là **QA server đang chờ**, không gọi đó là test còn chạy sau khi đã có kết quả cuối. Sau nghiệm thu, đóng đúng server do phiên mình tạo. Báo cáo cuối phải ghi test đã kết thúc và những tiến trình nào được giữ lại có lý do.
- Trong page.evaluate/DOM API, dùng CSS selector chuẩn; :has-text(...) là selector của Playwright, không truyền thẳng vào document.querySelector/element.querySelector. Dùng Playwright locator ngoài evaluate hoặc tìm theo textContent bằng DOM hợp lệ. Nếu lỗi xảy ra giữa chừng, finally vẫn phải cleanup.
- Lưu evidence không chứa secret vào `output/m2/browser-acceptance/`: source/build/ports, dataset, DOM/screenshot, request/response đã loại secret, document revision/geometry nếu có.
- Chỉ sửa code nếu phát hiện lỗi tái hiện trong scenario; ghi trigger/expected/actual và chạy regression liên quan sau sửa. Nếu không đổi code thì không lặp toàn bộ Worker/Java/build đã đạt.
- Đồng bộ README/gap review/roadmap và báo cáo M2 ngắn gọn: implementation đã duyệt; từng browser case PASS/FAIL/NOT RUN; D5 trạng thái thực; UC-01 vẫn OPEN chờ nhóm chốt.
- Không gọi toàn M2 đạt khi browser/D5 vẫn mở. Nếu phần còn lại cần người dùng, đưa đúng một thao tác cụ thể và dừng ở trạng thái pending đó; không tiếp tục vòng chỉnh văn phong.
- Không commit/push/merge/deploy/reset/clean/stash. Bảo toàn baseline và history. Bàn giao để reviewer chốt acceptance trước khi giao milestone M3.
