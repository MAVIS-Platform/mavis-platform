# Graph một màn hình

Ngày: 2026-10-29.

## Phạm vi đã chốt

Bỏ Overview/Details và trả lại Graph đầy đủ. Analysis và ✦ Explore là hai kiểu hiển thị của cùng một tập dữ liệu. Giữ node tròn, màu theo loại, tài nguyên database/messaging, node chưa phân loại, layout và hiệu ứng ngôi sao Architecture Atlas.

Chỉ đơn giản hóa connection: một đường không đầu mũi tên cho mỗi cặp node đang hiển thị. Quan hệ hai chiều và nhiều protocol được gom về cùng đường; self connection vẫn có vòng nối. Không suy diễn kết nối tắt qua broker hay database.

Chọn đường mở Connection details với các quan hệ gốc, chiều, nguồn và evidence. Chọn Inspect dùng ID quan hệ gốc cho 3E. ID nhóm chỉ phục vụ giao diện, không gửi vào API evidence. Bộ lọc loại node, origin và mở rộng service tiếp tục dùng projection hiện có.

## Xác minh

- Toàn bộ frontend: 279 tests đạt, 0 lỗi; TypeScript, ESLint các file thay đổi và production build đạt.
- Browser thực với production bundle, Next API adapter và Cytoscape: fixture FTGO có 17 node sau projection, 41 connection gom từ 50 quan hệ; database và messaging vẫn hiển thị.
- Analysis và Explore giữ cùng node/connection; Explore giữ hiệu ứng halo và không hiện đầu mũi tên khi hover/chọn.
- Chọn connection không gọi evidence bằng ID nhóm; Inspect gọi bằng ID quan hệ gốc. Bộ lọc Data store hoạt động.
- Viewport 390px: không tràn ngang, panel nằm trong màn hình và Escape đóng được.

Kiểm thử browser dùng fixture đọc qua API mock, không chạy AI trực tiếp và không thay đổi database production. Ảnh kiểm tra nằm trong MAVIS-Frontend/output/playwright/restored-graph-analysis.png và restored-graph-explore.png.
