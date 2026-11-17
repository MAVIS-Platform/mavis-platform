# Class Sidebar Navigation Design

## Intent
Trong giao diện giảng viên, chọn một class ở sidebar trái sẽ mở các mục điều hướng của class ngay bên dưới; chọn mục sẽ hiển thị nội dung tương ứng ở vùng chính. Mục tiêu là gom luồng class vào sidebar MAVIS sẵn có, không thêm sidebar mới và không buộc người dùng tìm tab lồng trong Overview.

## Goals
- Giữ sidebar MAVIS bên trái và danh sách class hiện tại.
- Chọn class mở danh sách các mục class bên dưới class đó; route hiện tại vẫn xác định mục đang chọn.
- Dùng các màn/route hiện có cho Overview, Members, Assignments, Lab Authoring và Submissions/Results.
- Giữ nguyên API, dữ liệu, quyền truy cập và deep link có query workspace.
- Sidebar responsive, có thể điều hướng bằng bàn phím và không tạo tràn ngang.

## Non-goals / Anti-goals
- Không chuyển toàn bộ sidebar MAVIS sang bên phải.
- Không tạo thêm sidebar hoặc thay đổi backend/API.
- Không làm mất nội dung Roadmap, Authoring, Setup; tránh hiển thị hai cấp menu trùng lặp trong Overview.
- Không đổi quyền, route semantics hay dữ liệu class.

## Approaches
1. **Nested class navigation in the existing sidebar (selected):** each class remains the parent entry; selecting it opens its existing class routes as indented links. This matches the requested interaction and reuses the current shell and navigation primitives.
2. **Right-side class panel:** keeps the global sidebar unchanged but adds a second navigation region, which the user explicitly does not want.
3. **Move all class tools into Overview tabs:** avoids sidebar work but leaves the class list and class tools split across pages and does not match the requested expand-under-class interaction.

## Constraints and calls
- Keep the global MAVIS destinations and workspace switcher intact.
- Preserve existing workspace query parameters for every class route.
- Determine active item from pathname plus selected workspace; expanded state should follow the selected class and active route.
- Reuse current navigation primitives and theme tokens; use native links/buttons and visible focus states.
- Reconcile Overview's Roadmap/Authoring/Setup sub-navigation with the class menu so each destination has one clear place.

## Remaining implementation calls
- Add children to the existing class entries and make selected route highlighting/expanded state route-aware.
- Decide whether course setup views use query-addressable Overview tabs or existing route links, based on current data flow, without changing the underlying actions.
- Verify lecturer/student visibility and selected workspace behavior at desktop and narrow widths.
