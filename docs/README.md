# Tài liệu dự án MAVIS (Defense 1.1)

Cập nhật: **22/11/2026** · Production live: **https://maviss.site** · Baseline: `main` (Flyway `V1..V38`, CI 6/6 GREEN, 120 acceptance tests + 511 FE tests).

Đây là **mục lục duy nhất** của kho tài liệu kỹ thuật trong mã nguồn `mavis-platform`. Toàn bộ nhật ký sprint trước Review 2, tài liệu Draw.io/static UML đã loại khỏi scope và các bản handoff tạm đã được lưu trữ gọn trong [`archive/`](./archive/).

## 1. Báo cáo nghiệm thu & 4 luồng nghiệp vụ chính (`WF-01 .. WF-04`)

- [**MAVIS Defense 1.1 Master Verification Report**](MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md): Báo cáo tổng hợp đối chiếu `RF-01..RF-12`, `SR-01..SR-16`, 120 ca acceptance CI, kiến trúc BFF/AI (`SR-09`), ánh xạ `4 logical stages ↔ 3 UI steps`, và nghiệm thu thực tế trên `https://maviss.site`.
- [**WF-01 · Course Access, Passkey & Sequential Lock (`C01`, `C05`)**](WF01_COURSE_ACCESS.md): Lớp học, Course Builder `v6` (`V35`), Passkey (giới hạn chỗ/hạn dùng/Pause-Resume), `seed-curated`, khóa tuần tự Lab và thu hồi JWT.
- [**WF-02 · Static C1–C3, 3E Call-Site, Reverse BFS & Quiz Gate (`C02`)**](WF02_STATIC_QUIZ_C02.md): Curated repo snapshot SHA-256 + nút tải `.zip` cho sinh viên, `C1–C3 + Dependency Graph`, chặn static UML hành vi (`400`), Quiz Authoring (`V36`), đọc Markdown cho Lab `THEORY_ONLY`.
- [**WF-03 · Live Docker Runtime Studio & Causal OTel (`C03`)**](WF03_RUNTIME_STUDIO_C03.md): Studio Live v2 (`STOP/START/SCALE 1..8`, `PAUSE/RESUME`, `THROTTLE_CPU`, `SET_LOAD`, 1-Click Templates F1), 2-slot chạy song song + FIFO auto-promotion + startup orphan recovery, chữ ký `HMAC-SHA256` trên `RuntimeReceipt`.
- [**WF-04 · Snapshot Submission, Per-Snapshot Grading & Auto-Unlock (`C04`)**](WF04_SUBMISSION_GRADING_C04.md): Đóng băng SHA-256 `evidencePackageDigest`, 3 chế độ Lab (`THEORY_ONLY`, `THEORY_QUIZ`, `THEORY_QUIZ_STUDIO` — `V38`), chấm từng Snapshot `> 5.0/10`, SpeedGrader `Next pending` + Quick Score 1 chạm, scalar-only Gradebook.

## 2. Giao diện, Kiến trúc Studio Live & Giáo trình

- [**Lecturer Lab Authoring UI**](LECTURER_LAB_AUTHORING_UI.md): Luồng soạn khóa học 5 chương LMS + tạo Lab 6 bước (kèm Step 5 Exercise & 1-Click Templates).
- [**Student Learning UI**](STUDENT_LEARNING_UI.md): Luồng học sinh viên Coursera-style, bảng ánh xạ `4 logical stages ↔ 3 UI steps`, tải Reference `.zip` và bài đọc Markdown `THEORY_ONLY`.
- [**Prepared Live Studio**](PREPARED_LIVE_STUDIO.md) & [**MAVIS Studio Runtime**](MAVIS_STUDIO_RUNTIME.md): Kiến trúc topology đóng băng (`V34`), Runner Docker Linux/gVisor và vòng đời telemetry/receipt.
- **Giáo trình chính thức (20/11/2026)**: [Java Microservices](curriculum/Giao_Trinh_Java_Microservices.md) · [C#/.NET Microservices](curriculum/Giao_Trinh_Csharp_Microservices.md).
- **Chuẩn sơ đồ tĩnh C1–C3 trong scope**: [C1 System Context](diagram-standards/01_C4_System_Context_Diagram.md) · [C2 Container](diagram-standards/02_C4_Container_Diagram.md) · [C3 Component](diagram-standards/03_C4_Component_Diagram.md).

## 3. Vận hành, Phát triển & Hợp đồng kỹ thuật

- **Thiết lập & Vận hành**: [CLEAN_CLONE_SETUP.md](CLEAN_CLONE_SETUP.md) · [DEVELOPMENT_RUNBOOK.md](DEVELOPMENT_RUNBOOK.md) · [LOCAL_DATABASE_AND_MAIL.md](LOCAL_DATABASE_AND_MAIL.md) · [AI_USAGE_SETUP.md](AI_USAGE_SETUP.md) · [CI/CD Production](../deploy/CI-CD.md)
- **Tài liệu tính năng hỗ trợ**: [NOTIFICATIONS.md](NOTIFICATIONS.md) · [PROJECT_SOURCE_WORKFLOW.md](PROJECT_SOURCE_WORKFLOW.md)
- **Worker & Runner (.NET 10)**: [Worker README](../MAVIS.Worker/README.md) · [INTEGRATION_RUNBOOK.md](../MAVIS.Worker/INTEGRATION_RUNBOOK.md) · [DOTNET_API_V1.md](../MAVIS.Worker/DOTNET_API_V1.md) · [RUNNER.md](../MAVIS.Worker/RUNNER.md) · [ROSLYN_CSHARP_ANALYZER.md](../MAVIS.Worker/ROSLYN_CSHARP_ANALYZER.md)
- **Lưu trữ lịch sử (không dùng làm nguồn scope hiện hành)**: [`archive/handoffs-nov2026/`](archive/handoffs-nov2026/) · [`archive/pre-review2/`](archive/pre-review2/) (gồm các tài liệu Draw.io và 9 sơ đồ UML cũ trước Review 2).
