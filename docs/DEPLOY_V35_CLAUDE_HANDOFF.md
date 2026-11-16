# Bàn giao sửa deploy V35 cho Claude

Ngày 16/11/2026. Đọc file này khi chẩn đoán các run production từ #352.

## Lỗi đã xác định

Run #352 (43843887150), commit 10209305a3443a3dec93e9d3ee99881b0003d240, có verify và images hoàn tất. Job deploy vào VPS thành công, kéo backend image và chạy schema preparation đến V34. Log tiếp theo là lỗi schema preparation của V35.

Dòng cuối "SSH command failed after 3 attempts" do hàm retry_ssh bao mọi mã lỗi từ lệnh remote. Nó làm lỗi ứng dụng trên VPS bị gắn nhãn lỗi SSH. Log không chứng minh deploy secrets thiếu hay sai. Không cần đổi DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS, DEPLOY_HOST hoặc DEPLOY_USER để sửa lỗi này.

## Nguyên nhân và bản sửa

Migration V35__Course_Composition_Draft.sql tạo unique constraint uq_course_module_position và uq_course_item_position. Probe trong deploy/apply-course-schema.py lại yêu cầu ix_course_modules_course_position và ix_course_items_module_position. Hai index này không có trong migration.

Lần áp dụng đầu tiên có thể đã commit V35 thành công, sau đó probe trả partial. Các lần retry sẽ dừng trước khi áp dụng lại. Bản sửa đổi probe sang kiểm tra đúng unique constraint, trên đúng bảng và contype u. Giữ nguyên file migration đã phát hành.

Hàm retry_ssh giờ chỉ retry mã 255 từ SSH. Mã thoát khác được báo là lỗi lệnh remote và giữ nguyên mã lỗi. Việc này giúp lần sau đọc được đúng tầng thất bại.

## Bằng chứng local

- Chạy 9 test Python, gồm PostgreSQL 18 cô lập: bootstrap workspaces, assignments, users và uuid-ossp; probe missing; áp dụng đúng SQL V35; probe ready; probe lại vẫn ready.
- Test retry chạy Bash với SSH giả lập: exit 1 chỉ gọi một lần; exit 255 thử ba lần; exit 0 thành công lần đầu.
- Test deploy/rollback chạy trong python:3.12-slim giống CI, gồm deploy thành công, rollback khi health fail và giữ stack cũ khi schema preparation lỗi.
- Không đăng nhập VPS thủ công, không lấy hay thay giá trị deploy secret. Kiểm thử PostgreSQL cục bộ đã dọn container và volume thử.

## Cách chẩn đoán lần sau

1. Kiểm tra git status và SHA. Đọc log-failed của run mới nhất, tìm lỗi đầu tiên trong job thất bại. Xem riêng verify, images và deploy.
2. Nếu log có image pull trên VPS hoặc "Vxx schema already present", SSH đã thực thi được lệnh remote. Theo tiếp lỗi schema, image hoặc health check tương ứng.
3. Đối chiếu tên bảng, cột, constraint và index trong migration với probe. Không đổi SQL đã phát hành chỉ để làm probe xanh.
4. Chỉ sửa secrets khi có bằng chứng authentication/host key/configuration thất bại. Gh CLI cần token hoặc phiên đăng nhập riêng. Git push thành công không có nghĩa gh đã đăng nhập. Agent có thể dùng Git credential hiện có trong bộ nhớ tiến trình để gọi GitHub API nếu scope cho phép. Không in token/private key, không ghi vào repo hay chat.
5. Theo dõi đến khi job deploy và health check hoàn tất. Website HTTP 200 chỉ chứng minh một phiên bản đang chạy, chưa chứng minh commit mới đã được triển khai.
6. Khi báo kết quả, kèm commit, URL Actions và conclusion cuối. Nếu còn lỗi mới, tiếp tục theo lỗi đó thay vì lặp lại kết luận của run cũ.
