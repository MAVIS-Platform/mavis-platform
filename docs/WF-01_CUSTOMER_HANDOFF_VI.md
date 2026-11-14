# WF-01 — Bàn giao luồng tài khoản và khóa học tuần tự

## 1. Kết quả khách hàng nhận được

WF-01 cung cấp luồng từ tạo tài khoản đến tham gia lớp học và học tuần tự:

1. Người dùng đăng ký bằng email hoặc đăng nhập Google.
2. Email được xác minh bằng OTP; người dùng có thể gửi lại OTP và đặt lại mật khẩu.
3. Phiên đăng nhập dùng access token 15 phút và refresh token xoay vòng 7 ngày trong cookie `HttpOnly`.
4. Giảng viên phát hành passkey có thời hạn và giới hạn sĩ số cho workspace.
5. Sinh viên nhập passkey để tham gia; thao tác lặp lại không tạo membership trùng.
6. Sinh viên xem roadmap, học lab theo thứ tự, làm quiz và chỉ mở lab tiếp theo khi đạt điều kiện.
7. Giảng viên có thể thu hồi passkey, xuất bản lab và theo dõi số sinh viên đã tham gia.

Curriculum hiện tại có 30 chương/lab. Đây là bản mở rộng tương thích với yêu cầu tối thiểu trong tài liệu, không rút dữ liệu đang có xuống 12 Java + 1 C#.

## 2. Vai trò và quyền

- `STUDENT`: quản lý hồ sơ của mình, redeem passkey, xem roadmap, học và làm quiz.
- `LECTURER`: quản lý passkey/sĩ số, publish lab, quản lý curriculum quiz trong workspace mình phụ trách.
- `SYSTEM_ADMIN`: quản trị tài khoản và vận hành hệ thống; không thay thế quyền sở hữu workspace của lecturer.
- Mọi endpoint riêng tư đều yêu cầu JWT và kiểm tra quyền/workspace ở backend; UI không phải là lớp bảo mật duy nhất.

## 3. Main flow để demo

### A. Lecturer chuẩn bị lớp

1. Đăng nhập lecturer.
2. Mở workspace và trang Course Passkey.
3. Chọn thời hạn, nhập `Max students`, phát hành passkey.
4. Kiểm tra trạng thái passkey, ngày hết hạn và `enrolled / capacity`.
5. Kiểm tra roadmap; publish lab đầu tiên và cấu hình quiz nếu cần.

### B. Student tham gia và học

1. Đăng ký tài khoản student.
2. Nhập OTP nhận qua email, đăng nhập.
3. Nhập course passkey; hệ thống chuyển student vào workspace.
4. Mở roadmap: lab đầu tiên khả dụng, lab sau bị khóa.
5. Mở lab, xem nguồn tham chiếu đã được lecturer publish, làm quiz.
6. Khi đáp ứng điều kiện đạt, tải lại roadmap và xác nhận lab kế tiếp được mở.
7. Mở Profile, cập nhật tên, avatar URL và ngôn ngữ ưu tiên.
8. Đăng xuất; access token và refresh token đều bị thu hồi/xóa.

### C. Các nhánh lỗi bắt buộc demo

- Sai mật khẩu/OTP/passkey nhiều lần: bị giới hạn sau 5 lần trong cửa sổ 15 phút.
- Passkey sai, hết hạn hoặc đã bị thu hồi: trả lỗi ổn định `INVALID_OR_EXPIRED_PASSKEY`.
- Đã tham gia lớp: `ALREADY_ENROLLED`, không tạo bản ghi trùng.
- Lớp đủ sĩ số: `COURSE_CAPACITY_REACHED`.
- Mở lab chưa đủ điều kiện: `PREREQUISITE_LAB_LOCKED`.
- Access token hết hạn: BFF tự dùng refresh token, xoay token và thử lại request một lần.

## 4. Function/feature và API

| Function | Feature | API chính |
|---|---|---|
| F-01 Identity | Register, OTP, login, Google, reset password | `POST /api/v1/auth/register`, `/verify-email`, `/login`, `/google`, `/forgot-password`, `/reset-password`, `/resend-otp` |
| F-01 Session | Refresh, logout/revoke | `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` |
| F-01 Profile | Hồ sơ, avatar, locale | `GET`, `PATCH` hoặc `PUT /api/v1/auth/me` |
| F-09 Course access | Issue/status/revoke/redeem passkey, capacity | `GET/POST /api/v1/workspaces/{id}/course-passkey`, `POST .../revoke`, `POST /api/v1/course-enrollments/redeem` |
| F-09 Roadmap | Roadmap và khóa lab tuần tự | `GET /api/v1/workspaces/{id}/course-roadmap` |
| F-09 Lecturer lab | Publish nguồn lab | `POST /api/v1/workspaces/{id}/course-labs/{assignmentId}/publish` |
| F-10 Quiz | Đọc/cấu hình curriculum, làm quiz | `GET/POST .../quiz`, `POST .../quiz/curriculum`, `POST .../quiz/attempts` |

## 5. Dữ liệu và migration

Migration `V30__WF01_Customer_Ready_Identity_And_Course.sql` bổ sung:

- `users.avatar_url`, `users.preferred_locale` (`en`/`vi`).
- `workspaces.max_students` với ràng buộc số dương.
- `refresh_sessions`: chỉ lưu SHA-256 digest của refresh token, có expiry/revoke/rotation.
- `auth_rate_limits`: lưu subject đã hash, số lần thử và thời điểm khóa.

Phải backup database trước deploy và để Flyway chạy V30 đúng một lần. Không hạ phiên bản ứng dụng khi database đã dùng V30 nếu chưa có kế hoạch rollback tương thích.

## 6. Cấu hình production bắt buộc

- PostgreSQL URL/user/password và quyền chạy Flyway.
- JWT secret đủ mạnh, khác giữa các môi trường; access TTL production là 900 giây.
- Google Client ID đúng origin production nếu bật Google Login.
- SMTP sender/credential hoạt động để gửi OTP.
- Frontend trỏ đúng Java API; HTTPS bắt buộc để cookie `Secure` hoạt động.
- CORS/origin chỉ cho domain khách hàng; không log token, OTP hoặc mật khẩu.
- Đồng bộ thời gian máy chủ (NTP), vì OTP/token/passkey đều phụ thuộc thời gian.

## 7. Checklist nghiệm thu trước khi giao khách hàng

- [ ] V30 chạy thành công trên bản sao database production.
- [ ] Register → OTP → login email chạy bằng hộp thư thật.
- [ ] Google Login chạy đúng Client ID/domain.
- [ ] Access token tự refresh sau khi access cookie hết hạn.
- [ ] Logout làm refresh token cũ không dùng lại được.
- [ ] Rate limit login, OTP và passkey trả HTTP 429/error code ổn định.
- [ ] Lecturer issue/revoke passkey; capacity chặn đúng khi có request đồng thời.
- [ ] Redeem lặp không tạo membership trùng.
- [ ] Roadmap khóa/mở đúng theo quiz/lab prerequisite.
- [ ] Student không đọc workspace/lab của lớp khác.
- [ ] Lecturer không quản trị workspace không thuộc quyền.
- [ ] Audit có sự kiện auth success/failure và course enrollment.
- [ ] Kiểm tra desktop/mobile, tiếng Anh/Việt, trạng thái loading/error/empty.
- [ ] Có tài khoản demo riêng; không dùng tài khoản thật hoặc ghi mật khẩu vào Git.
- [ ] Có dashboard/alert cho HTTP 5xx, 429, email failure và database saturation.

## 8. Bộ dữ liệu demo an toàn

Tạo mới trên môi trường demo, không hard-code trong source:

- Lecturer: `wf01.lecturer+<date>@<demo-domain>`.
- Student A/B: `wf01.student.a+<date>@<demo-domain>`, `wf01.student.b+<date>@<demo-domain>`.
- Workspace: `WF01 Customer Demo <date>`, capacity 2.
- Passkey: phát hành ngay trước buổi demo; ghi vào run sheet nội bộ, không đưa vào repository.
- Mật khẩu: tạo bằng password manager, tối thiểu theo policy; chuyển qua kênh bí mật và xóa sau demo.

## 9. Bằng chứng kỹ thuật tại thời điểm bàn giao

- Backend Maven: 188 test pass (`mavis-common` 29, `mavis-platform` 159).
- Frontend: 382/382 test pass; TypeScript typecheck pass; lint các file thay đổi không có error (còn một warning Fast Refresh không chặn build).
- PostgreSQL 16/Flyway: `CourseAccessPostgresTest` và `MigrationUpgradeTest` pass; V30 chạy được từ schema rỗng, nâng cấp từ V20 và chạy lại idempotent ở V30.

## 10. Tiêu chí “sẵn sàng bán/giao khách hàng”

WF-01 chỉ được đánh dấu production-ready khi checklist mục 7 hoàn tất trên staging có cấu hình gần production, không còn lỗi blocker/high, backup-restore đã được diễn tập và đội vận hành có người chịu trách nhiệm xử lý cảnh báo. Việc code/test local hoàn tất là điều kiện cần, chưa tự động là phê duyệt phát hành production.
