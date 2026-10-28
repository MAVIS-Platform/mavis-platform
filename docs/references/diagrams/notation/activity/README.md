# Activity Diagram seed pack

Ngày kiểm tra: 24/10/2026. Phiên bản 1.1. Tài liệu chính: Activity_Diagram_MAVISS_v1_1.docx.

## Quy ước mặc định MAVISS
Workflow Activity Diagram dùng swimlane theo service chịu trách nhiệm. Một service có một lane mang tên service. Nếu chưa rõ ownership, đánh dấu chưa xác định, không suy đoán service. Bảng ký hiệu và trích đoạn Object Flow không phải workflow hoàn chỉnh nên không cần lane.

## Nội dung
- `redrawn/`: 6 hình vẽ mới, mỗi hình có SVG sửa được và PNG. Các workflow là ví dụ giả định.
- `omg-symbol-excerpts/`: 4 ảnh ký hiệu cắt từ hình gốc OMG, không phải ví dụ nghiệp vụ tự dựng.
- `manifest.json`: provenance, trang PDF, số hình và phạm vi sử dụng của từng nguồn.

## Cách dùng
1. Dùng glyph OMG để đối chiếu hình học; đọc đặc tả để kiểm tra ngữ nghĩa.
2. Dùng hình vẽ mới làm seed bố cục hoặc mẫu minh họa; không coi đó là kết quả đọc source thực tế.
3. Chỉ lấy VP-ORDER làm tham chiếu mẫu Decision/Merge kết hợp Fork/Join.
4. VP-LANES chỉ tham khảo bố trí lane; không dùng làm chuẩn Object Flow/Pin.
5. Checklist trong DOCX là điều kiện xem xét seed, không phải bộ kiểm chứng toàn bộ chuẩn UML.

Nguồn OMG: https://www.omg.org/spec/UML/2.5.1/PDF
Chủ thể nguồn hình gốc và hình vẽ mới được phân biệt trong manifest; không gán giấy phép của hình vẽ mới cho hình trích nguồn.
