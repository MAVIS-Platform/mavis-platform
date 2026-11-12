# WF-01 · Lớp học, Passkey và quyền Lab

Hợp đồng mục tiêu cho các chặng triển khai WF-01. Checkout đối chiếu là `435d9b7`. Các endpoint mới được phát hành theo từng PR.

## Quy tắc nghiệp vụ

- Giảng viên của lớp hoặc quản trị viên gán mô hình và nguồn đã công bố cho assignment. Nguồn GitHub phải có commit SHA đầy đủ. Nguồn ZIP phải có SHA-256 và đường dẫn lưu trữ. Khi công bố Lab, máy chủ cấp số thứ tự tiếp theo và cố định nguồn tham chiếu cho Lab đó.
- Công bố Lab đầu tiên bật chế độ học tuần tự của lớp. Lớp chưa công bố Lab dùng luồng assignment hiện hành. Sinh viên trong lớp tuần tự tạo dự án từ nguồn đã gán, tải ZIP qua assignment và phân tích snapshot của dự án. Dự án cá nhân tiếp tục sử dụng GitHub và ZIP.
- Passkey chỉ hiển thị khi cấp, có hiệu lực từ 1 đến 168 giờ. Đổi mã hủy hiệu lực của mã trước. Thu hồi và hết hạn dừng ghi danh mới. Tài khoản đã ghi danh giữ quyền của mình. Nhật ký lưu hành động quản lý, ID người thao tác và đối tượng.
- Khi ghi danh thành công, Lab đầu mở trong cùng giao dịch. Với các Lab sau, API kiểm tra thành viên lớp và kết quả đạt của toàn bộ Lab trước. Roadmap và tài nguyên Lab áp cùng điều kiện. Lớp lưu trữ dừng ghi danh và dừng truy cập Lab của sinh viên.

## Hợp đồng C01 và C05

Các endpoint bên dưới dùng tiền tố `/api/v1` và nhận JWT ở backend. Next.js lấy JWT từ cookie HttpOnly và giới hạn danh sách đường dẫn BFF.

| HTTP | Đường dẫn | Kết quả hoặc dữ liệu gửi |
|---|---|---|
| GET | `/workspaces/{workspaceId}/course-roadmap` | `guided`, `enrollmentStatus`, `labs[]` với `assignmentId`, `position`, `title`, `state`, `reason` |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/publish` | Lab đã công bố. Gửi lại cùng assignment trả số Lab đã cấp |
| GET | `/workspaces/{workspaceId}/course-passkey` | `active`, `expiresAt` |
| POST | `/workspaces/{workspaceId}/course-passkey` | Gửi `{ "validHours": 24 }`. Nhận `code`, `expiresAt` một lần |
| POST | `/workspaces/{workspaceId}/course-passkey/revoke` | Thu hồi mã đang cấp |
| POST | `/course-enrollments/redeem` | Gửi `{ "code": "…" }` và UUID `Idempotency-Key`. Nhận `workspaceId` để tải roadmap |
| GET | `/assignments/{assignmentId}/reference-source` | ZIP của Lab. Backend đối chiếu SHA-256 của bản đã công bố khi tải |
| POST | `/auth/logout` | Thu hồi JWT hiện tại đến khi token hết hạn. Gửi lại an toàn |

Roadmap trả `ENROLLED`, `IN_PROGRESS` hoặc `COMPLETED` cho sinh viên đã ghi danh. Danh sách Lab dùng `LOCKED`, `UNLOCKED` hoặc `PASSED`. Lab khóa có lý do `PREREQUISITE` hoặc `COURSE_ARCHIVED`. Sinh viên chưa ghi danh nhận HTTP 403 khi yêu cầu roadmap hoặc tài nguyên lớp.

| HTTP | Trường hợp |
|---|---|
| 400 | JSON, tham số hoặc Passkey sai, hết hạn hay đã thu hồi. Notification API cũng dùng 400 cho bộ lọc hoặc nội dung `read-all` sai |
| 401 | API yêu cầu phiên đăng nhập nhận token hết hạn, đã thu hồi hoặc không hợp lệ |
| 403 | Sai vai trò, ngoài lớp hoặc Lab chưa mở |
| 404 | Đối tượng hoặc bản ZIP không tìm thấy |
| 409 | Đã ghi danh với yêu cầu khác, lớp đã lưu trữ, nguồn thay đổi hoặc kết quả chấm cũ |

## Nối kết quả WF-04 và thông báo

WF-04 gọi `CourseProgressionService.recordFinalizedResult(submissionId, reviewRevision, passed)` trong luồng server-side khi đã xác minh các Snapshot bắt buộc và lưu kết quả cuối. Nếu chấm và ghi tiến độ trong cùng transaction JPA, flush bản review trước khi gọi vì tiến độ đọc bằng JDBC. Kết quả không đạt giữ Lab sau khóa. API chấm điểm tổng 0–100 hiện tại có nghiệp vụ riêng.

Progression kiểm tra bài nộp mới nhất, bản review `GRADED` đúng revision, nhận xét có nội dung, sinh viên thuộc lớp và đã qua các Lab trước. Khi đạt, kết quả và thông báo mở Lab kế tiếp được lưu trong cùng giao dịch. Cơ chế gửi lặp dựa trên revision và khóa sự kiện `course-lab-unlocked:{assignmentId}`.

Flyway V22 cung cấp `user_notifications`, khóa duy nhất `(recipient_id, event_key)` và hàm `mavis_notify`. Flyway V26 thêm cấu hình lớp tuần tự, thứ tự Lab, dữ liệu băm Passkey, kết quả Lab và dấu vết thu hồi JWT. Dữ liệu băm JWT được dọn theo thời gian hết hạn khi có yêu cầu đăng xuất.

## Điều kiện phát hành

Cloud profile mặc định tắt Flyway lúc khởi động. Pipeline kiểm tra V26 trước khi thay container. Nếu schema chưa có, bước phát hành sao lưu PostgreSQL, kiểm bản sao rồi áp dụng riêng V26 trong một giao dịch. Schema dở dang hoặc lỗi sao lưu sẽ dừng việc thay container. Backend mới cần bảng `revoked_access_tokens` để xác thực JWT. Khi phải quay về image trước, giữ các cột và bảng bổ sung của V26. [Quy trình migration và rollback](../deploy/CI-CD.md)

## Kiểm chứng

- Chạy `CourseAccessPostgresTest` và `MigrationUpgradeTest` với PostgreSQL thử nghiệm cổng 15438 trên loopback. CI cung cấp cụm PostgreSQL riêng cho hai lớp test này.
- Frontend chạy `npm run typecheck`, `npm test`, build và route smoke. BFF test xác minh thu hồi JWT trước khi bỏ cookie và thử lại được khi backend tạm gián đoạn.
- Nghiệm thu tích hợp trên staging cần kết quả C02/C03/C04 thật, hai lớp độc lập, hai sinh viên và tối thiểu hai Lab theo thứ tự. Kiểm tra Passkey, đường dẫn Lab khóa, nguồn đã gán, chấm đạt hoặc yêu cầu sửa, thông báo và mở đúng Lab cho đúng sinh viên.
