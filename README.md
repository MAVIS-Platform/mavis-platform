# MAVIS

Nền tảng học tập kiến trúc microservices có kiểm chứng bằng chứng: quản lý lớp học/Passkey tuần tự (**WF-01**), phân tích tĩnh Java/C# (`C1–C3 + Dependency Graph`, 3E Call-Site, Reverse BFS & Quiz Gate — **WF-02**), thực nghiệm Docker Runtime Studio Live + OpenTelemetry (**WF-03**), nộp gói minh chứng đóng băng SHA-256 và chấm từng Snapshot `> 5.0/10` tự mở khóa Lab kế tiếp (**WF-04**).

- **Production live**: https://maviss.site
- **Mục lục tài liệu chuẩn hóa (Defense 1.1)**: [docs/README.md](docs/README.md)
- **Báo cáo tổng hợp kiểm chứng**: [docs/MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md](docs/MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md)

## Chạy trên máy mới clone

Xem [hướng dẫn DB và đăng nhập thật](docs/CLEAN_CLONE_SETUP.md) và [sổ tay phát triển & kiểm thử](docs/DEVELOPMENT_RUNBOOK.md). Bấm đúp `run.bat` (hoặc `Start-Mavis.ps1`); lần đầu điền DB credential vào `.env.backend.local` được tạo rồi chạy lại. Không lưu secret/tài khoản demo dùng chung trong Git.

## Thành phần mã nguồn

- [**Java Backend (`MAVIS-Platform/mavis-be`)**](MAVIS-Platform/mavis-be/pom.xml): Java 21, Spring Boot 3.3.0, Maven, PostgreSQL + Flyway (`V1..V38`), 120 acceptance matrix tests (`Wf01..Wf04AcceptanceMatrixTest`) + unit/integration tests.
- [**Worker C# & Runtime Runner (`MAVIS.Worker`)**](MAVIS.Worker/README.md): .NET 10, Roslyn C# Analyzer, Cycle-Safe Reverse BFS, và Docker Compose/OpenTelemetry Studio Live Runner (`STOP/START/SCALE 1..8`, `PAUSE/RESUME`, `THROTTLE_CPU`, `SET_LOAD`, HMAC-SHA256 receipt).
- [**Next.js Frontend (`MAVIS-Frontend`)**](MAVIS-Frontend/README.md): Next.js 15, App Router BFF, giao diện LMS + Coursera Lab song ngữ EN/VI, Interactive 2D/3D Studio Live, SpeedGrader & Gradebook, Admin Control Center.
- [**Deploy & CI/CD (`deploy/`)**](deploy/CI-CD.md): GitHub Actions CI/CD 6-job pipeline (`.github/workflows/deploy-production.yml`), Docker Compose production & migration pre-flight.
