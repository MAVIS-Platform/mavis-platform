# Tài liệu dự án MAVIS

Cập nhật: 21/10/2026; baseline main c0121fe.

- [mavis-context.md](mavis-context.md): đọc đầu tiên; mục tiêu giáo dục, kiến trúc, data flow, owner, contract và bản đồ source.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md): code/test/acceptance riêng biệt; tiến độ cả 72 task V/T/N/F và PBI P01–P24.
- [NEXT_TASKS.md](NEXT_TASKS.md): việc còn lại theo thứ tự, phạm vi từng bên, đầu vào/đầu ra và Definition of Done.
- [DEVELOPMENT_RUNBOOK.md](DEVELOPMENT_RUNBOOK.md): môi trường, cấu hình, migrations, chạy/test và cập nhật tài liệu.
- [Worker README](../MAVIS.Worker/README.md): lịch sử triển khai Worker chi tiết. Các mục cũ có ghi ngày là lịch sử; dùng mục mới và tài liệu tổng thể để xác định hiện trạng.
- [Java–Worker integration](../MAVIS.Worker/INTEGRATION_RUNBOOK.md), [Worker API](../MAVIS.Worker/DOTNET_API_V1.md), [N01](../MAVIS.Worker/N01.md), [Runner](../MAVIS.Worker/RUNNER.md), [static profiles](../MAVIS.Worker/STATIC_PROFILES.md).

`mavis-context.md` cũ là proposal trước Review 1 theo hướng Developer SaaS/subscription. Nội dung đó đã được thay thế bằng bối cảnh giáo dục hiện hành; lịch sử cũ vẫn tra được trong Git. Không dùng billing/payment/subscription của proposal cũ làm backlog mặc định.

Tài liệu nghiệp vụ gốc nằm ở `.doc_review/main/` trên máy nhóm, không được track trong Git hiện tại. Các trang Markdown này tóm tắt bối cảnh cần thiết để agent từ checkout sạch vẫn làm việc được; không giả định agent có các file DOCX/PNG riêng.
