# Chạy MAVIS từ máy mới clone — DB cloud và đăng nhập thật

## Đúng phiên bản

FE và Java phải từ cùng commit. Bản tích hợp dùng `/api/v1/auth/me`; Java cũ không có route này thì login/session của FE mới không hoạt động. Tại checkpoint này main vẫn là 02c663b, các bản sửa nằm trong PR #30/nhánh feat/fe-api-contract-integration. Trước khi PR được merge, lấy nhánh này:

```powershell
git clone --branch feat/fe-api-contract-integration https://github.com/MAVIS-Platform/mavis-platform.git
cd mavis-platform
```

Nếu đang có checkout, giữ các chỉnh sửa local trước khi chuyển nhánh. Không dùng reset --hard để xử lý lỗi login.

## Chuẩn bị

Windows PowerShell, JDK 21+, .NET SDK 10, Node.js 20.9+ và npm. Docker chỉ cần cho runtime workload; đăng nhập/phân tích source không yêu cầu chạy ứng dụng được import.

```powershell
.\Start-Mavis.ps1 -Initialize
```

Mở `.env.backend.local` vừa tạo và điền MAVIS_DB_URL, MAVIS_DB_USERNAME, MAVIS_DB_PASSWORD thật của DB test. URL JDBC cần đúng host/port/database, ví dụ dạng `jdbc:postgresql://HOST:PORT/defaultdb?sslmode=require`. File local và khóa dịch vụ không đi theo Git là chủ ý; application.yml không bị xóa. Nhờ chủ DB cung cấp credential qua kênh riêng, không commit credential vào repo.

Initialize sinh JWT/Runner/Worker/grant keys ổn định cho máy đó. Không ghi đè key mỗi lần restart, vì JWT cũ sẽ mất hiệu lực. Nếu đổi key Worker thì dừng và khởi động lại cả Java lẫn Worker để hai bên dùng cùng cấu hình.

## Chạy bằng run.bat (khuyến nghị trên Windows)

Bấm đúp `run.bat` ở thư mục gốc. Không cần tự chạy file .ps1 hay đổi execution policy của Windows. File BAT gọi Windows PowerShell có sẵn với cấu hình chỉ áp dụng cho tiến trình đó.

Lần đầu, nếu chưa có `.env.backend.local`, BAT tạo file và service keys. Điền DB URL/user/password vào file đó rồi bấm lại. Sau đó BAT build Java/Worker khi cổng còn trống, chạy FE từ source hiện tại, đợi cả ba dịch vụ sẵn sàng và mở trang login. Nếu lỗi, cửa sổ giữ lại thông báo thay vì tắt ngay. `run.bat --check` chỉ kiểm tra các dịch vụ đang chạy.

Các tiến trình đã chiếm cổng được giữ nguyên, không bị tự kill. Để cập nhật source khi đã có phiên cũ đang chạy, dừng đúng phiên cũ trước rồi bấm run.bat; BAT không tự git pull hay ghi đè source local.

## Khởi động bằng PowerShell (tùy chọn)

```powershell
.\Start-Mavis.ps1 -Service All
# Sau khi các dịch vụ startup xong:
.\Start-Mavis.ps1 -Service Check
```

Lệnh khởi động Java với profile cloud, Flyway disabled, DB validate, Worker keys/root dùng chung và FE backend mode. Thiếu credential sẽ bị chặn sớm với tên biến cần điền. Worker/Java/FE chạy nền, log ở `.artifacts/local-run/`. Cổng đã có dịch vụ sẽ không bị tự tắt; phải bảo đảm đó là phiên bản đúng trước khi test.

- FE: http://127.0.0.1:3000/login
- Java: http://127.0.0.1:8081/swagger-ui/index.html
- Worker: http://127.0.0.1:5082/swagger

Muốn chạy riêng từng dịch vụ: `-Service Java`, `-Service Worker`, `-Service Frontend`. Khi source Java đổi, dừng đúng tiến trình Java rồi dùng `-Service Java -Build` để tránh chạy JAR cũ. Port có thể đổi bằng MAVIS_JAVA_PORT/MAVIS_WORKER_PORT/MAVIS_FE_PORT trong file local; launcher cập nhật URL FE→Java và Java→Worker tương ứng.

## Tài khoản đăng nhập

Dùng tài khoản ACTIVE đã verify trong chính DB đang cấu hình. Các password seed placeholder trong migration không phải mật khẩu demo dùng được. File tài khoản test cũ trên máy tác giả cũng không có trong Git clone.

Nếu đăng ký mới: MAIL_USERNAME/MAIL_PASSWORD phải cấu hình SMTP thật để nhận OTP. Lỗi SMTP `535 Username and Password not accepted` là lỗi mail, không phải mất kết nối PostgreSQL. Không bật dev bypass hoặc tự sửa user seed để che lỗi đăng nhập. Có thể nhờ chủ DB cấp một tài khoản test đã verify, qua kênh riêng.

## Phân biệt lỗi

- Thiếu `.env.backend.local`/MAVIS_DB_*: thiếu cấu hình máy mới, chưa phải DB bị xóa.
- Java báo localhost:5432 hoặc user postgres: đang chạy profile local/nhánh cũ; dùng launcher cloud.
- `/auth/me` không có: Java/FE lệch phiên bản hoặc chạy JAR cũ.
- FE hiển thị sample roles/data: đang bật mock; dùng backend mode rồi restart Next.js.
- Sai port: launcher mặc định Java 8081; đặt MAVIS_JAVA_URL phù hợp nếu tự chạy FE.
- Invalid credentials/unverified/inactive: kiểm tài khoản ở đúng DB, không coi là lỗi mạng DB.
- DB authentication/SSL/connection refused trong Hikari log: kiểm credential/host/network của DB cloud. Không drop/recreate DB để thử sửa login.

DB cloud chỉ chứa dữ liệu nghiệp vụ; source/artifact nằm ở ổ máy chạy Java/Worker. Với máy clone mới, upload/import source mới để phân tích, không kỳ vọng đường dẫn source cũ của máy khác có sẵn.
