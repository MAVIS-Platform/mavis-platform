# MAVIS

Nền tảng học tập kiến trúc microservices: nhập source, phân tích Java/C#, xây mô hình kiến trúc có evidence, sinh diagram, kiểm tra rule, chỉnh revision, phân tích tác động và thực nghiệm HTTP/runtime tracing. Sinh viên nộp đúng phiên bản artifact; giảng viên xem và phản hồi trên phiên bản đó.

## Chạy trên máy mới clone

Xem [hướng dẫn DB cloud và đăng nhập thật](docs/CLEAN_CLONE_SETUP.md). Bấm đúp `run.bat`; lần đầu điền DB credential vào `.env.backend.local` được tạo rồi bấm lại. BAT chạy Java + Worker + FE và mở trang đăng nhập. Không có secret/tài khoản demo dùng chung trong Git.

## Bắt đầu cho developer hoặc coding agent

1. Đọc [bối cảnh và kiến trúc hiện hành](docs/mavis-context.md).
2. Xem [tiến độ Java, Worker và frontend](docs/IMPLEMENTATION_STATUS.md), gồm V01–V18, T01–T18, N01–N18, F01–F18.
3. Chọn việc từ [backlog tích hợp tiếp theo](docs/NEXT_TASKS.md); giữ đúng owner và tiêu chí hoàn thành.
4. Dùng [hướng dẫn phát triển và kiểm thử](docs/DEVELOPMENT_RUNBOOK.md).

Baseline được đối chiếu: `main` **c0121fe**, ngày **21/10/2026**. Đây là ảnh chụp tiến độ có nguồn kiểm chứng, không phải tuyên bố toàn hệ thống đã hoàn tất.

## Source đang hoạt động

- [Java backend](MAVIS-Platform/mavis-be/pom.xml): Java 21, Spring Boot 3.3.0, Maven, PostgreSQL/Flyway.
- [Worker C# và Runtime Runner](MAVIS.Worker/README.md): .NET 10, Roslyn, HTTP nội bộ, Docker Compose/OpenTelemetry.
- [Contract và runbook Java–Worker](MAVIS.Worker/INTEGRATION_RUNBOOK.md).
- Frontend mới chưa sẵn sàng trong baseline này; không coi nhánh UI cũ là giao diện đã nghiệm thu.

Java quản lý business database, người dùng, project/workspace, model versions và publication. Worker phân tích source C# và tính impact. Runner là executable thực thi runtime riêng; Java runtime APIs hiện chưa tương đương điều phối Runner liên máy hoàn chỉnh.

## Trạng thái kiểm chứng

- Java client/common/analyzer: 140/140 test pass trong bộ regression hợp nhất chặng 3–5; kiểm tra cuối diagram/model/API 23/23 pass. Một test dùng dataset ZIP ngoài repo được loại có ghi rõ.
- Worker Windows: 189 pass, 1 Linux-only skip; Linux compatibility trước thay đổi receipt: 187/187 pass trên SDK patch khác.
- Docker Desktop Linux PoC: 6 case runtime và abandoned recovery pass; có trace hai chiều Java/.NET, cleanup được xác nhận.
- Java chặng 6 có code và test sources trên main; chưa chạy lại toàn bộ platform/bootstrap trong lượt đối chiếu docs này.

Xem phạm vi, thời điểm và hạn chế trong [sổ tiến độ](docs/IMPLEMENTATION_STATUS.md). Không dùng các con số này như bằng chứng production/JWT/browser acceptance.
