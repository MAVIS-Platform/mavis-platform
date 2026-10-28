# AI usage và quota cho Admin

## Phạm vi dữ liệu

- Số token MAVIS ghi nhận đến từ phản hồi provider, phân theo provider, model và nguồn `java`/`next`; chỉ tính những request có usage hợp lệ được lưu thành công. Dữ liệu trước khi bật, request lỗi và nguồn chưa quan sát là không biết, không phải 0. Không lưu prompt, response hoặc API key.
- OpenAI Admin API: token usage, chi phí project trong tháng UTC, và RPM/TPM theo model được đọc trực tiếp khi có quyền. Dữ liệu được cache tối đa 30 giây; `providerDataUpdatedAt` là thời điểm đồng bộ. Mất quyền/kết nối: dữ liệu provider là unavailable, không dùng số cũ.
- Chi phí OpenAI là tổng project (có thể bao gồm ứng dụng khác), không phải riêng MAVIS. Số dư hai provider và chi phí Gemini chưa có nguồn tích hợp: unavailable, không ước tính.
- Gemini quota được lấy từ Google Cloud Monitoring khi cấu hình project/tier và OAuth phù hợp. Hiển thị model, tên metric, limit_name và thời gian mẫu; usage là DELTA theo khoảng mẫu, không phải quota còn lại. Sampling khoảng 60 giây và có thể chậm ít nhất 150 giây. Thiếu quyền, mẫu, project, tier hoặc token: unavailable hoặc partial.

## Cấu hình bí mật

Cấu hình tại environment hoặc secret store phía server, không commit vào Git:

- `MAVIS_AI_USAGE_INGEST_KEY`: cùng giá trị ngẫu nhiên tối thiểu 32 ký tự cho backend và Next; bảo vệ endpoint ghi telemetry nội bộ. Nếu thiếu/sai, không thu thập số liệu Next. Thay key khi bị lộ.
- `OPENAI_ADMIN_KEY`: OpenAI organization admin key có quyền đọc usage/cost/limits; khác với key suy luận thông thường.
- `OPENAI_PROJECT_ID`: project OpenAI cần theo dõi; phải trùng scope với traffic muốn kiểm tra.
- `MAVIS_JAVA_URL`: frontend server trỏ tới backend nội bộ.
- `MAVIS_GCP_PROJECT_ID`: Google Cloud project của Gemini Developer API; cấp Monitoring Viewer (`roles/monitoring.viewer`) và bật Cloud Monitoring API.
- `MAVIS_GEMINI_QUOTA_TIER`: tier chính xác của project: `free`, `paid` (tier 1), `paid2`, hoặc `paid3`. Không tự giả định tier.
- `MAVIS_GCP_MONITORING_TOKEN_FILE`: đường dẫn nội bộ tới file secret chứa OAuth access token với scope `https://www.googleapis.com/auth/monitoring.read`. Token ngắn hạn phải được refresh/rotate tự động bởi hệ thống triển khai và mount read-only vào backend; file được đọc lại sau cache 30 giây. API key Gemini không thay cho OAuth/IAM.

Không gắn tiền tố `NEXT_PUBLIC_` cho secret. Không nhập key vào client, log, issue hoặc chat. Cấu hình trên từng môi trường và khởi động lại service sau khi cập nhật.

## Database và deploy

Migration [V20__Ai_Usage_Events.sql](../MAVIS-Platform/mavis-be/mavis-bootstrap/src/main/resources/db/migration/V20__Ai_Usage_Events.sql) tạo bảng và index telemetry. Flyway trong pipeline production hiện **tắt**; deploy image mới không tự tạo bảng. Nếu bảng chưa có, usage local và ingest trả unavailable; request AI vẫn tiếp tục.

Trước khi áp dụng production, chủ DB cần kiểm tra migration/history và các phiên bản Flyway của môi trường, sao lưu, thử trên DB staging, thống nhất cửa sổ triển khai và rollback. Áp dụng V20 thông qua quy trình migration được duyệt, kiểm tra bảng/index và quyền DB sau đó mới bật ghi usage. Không tự thay đổi Flyway history, không bật migrate tự động hoặc chạy SQL trực tiếp trên production chưa review. Quota OpenAI cần cấu hình biến môi trường và quyền provider riêng.

## Xác minh

1. Đăng nhập tài khoản admin; gọi trang usage. Student/lecturer phải bị từ chối.
2. Gửi một request AI qua Java và một qua Next. Đối chiếu input/output với phản hồi provider và xác nhận coverage từng nguồn; thiếu usage hoặc ingest key không hiển thị 0.
3. Có admin key/project hợp lệ thì so sánh project usage, cost và RPM/TPM với OpenAI dashboard trong cùng kỳ UTC; khi thiếu quyền hoặc kết nối phải hiển thị unavailable.
4. Với Google IAM hợp lệ, đối chiếu metric, model, limit_name và thời gian mẫu với Cloud Monitoring. Thiếu quyền/token hết hạn/không có mẫu phải là unavailable hoặc partial. Số dư chưa có nguồn: unavailable; API key, OAuth token và prompt không xuất hiện trong response/log.
