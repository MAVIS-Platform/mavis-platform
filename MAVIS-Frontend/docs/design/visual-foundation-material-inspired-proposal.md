# MAVIS · Đề xuất Visual Foundation và Global Layout

Ngày: 2026-10-20 (Asia/Saigon). Trạng thái: **đề xuất điều chỉnh checkpoint 1; chờ duyệt trước khi triển khai**.

## 1. Định hướng

MAVIS dùng nền xanh xám rất nhẹ, nội dung được gom theo nhiệm vụ và một điểm nhấn xanh dương nhất quán. Tăng độ thoáng ở trang danh sách/đọc hiểu; duy trì mật độ vừa phải cho bảng, graph và trace. Bề mặt chủ yếu phẳng, bo góc mềm, typography rõ; Student, Lecturer và Admin dùng cùng shell và semantic tokens.

Lấy cảm hứng từ tinh thần mà chủ dự án mô tả ở Material Design 3 Search: khoảng trống, nội dung tập trung, bề mặt dịu và điều hướng tối giản. Giữ tên MAVIS, Lucide và ba screen flow. Đây là thiết kế riêng cho nền tảng giáo dục/kiến trúc microservices.

Trang tham khảo do chủ dự án chọn: [Material Design 3 Search](https://m3.material.io/search.html). Công cụ web không đọc được trang Search và không có browser kết nối trong phiên này; chưa có quan sát trực quan hoặc đo đạc giao diện trang đó. Vì vậy, các kích thước/màu dưới đây là **đề xuất MAVIS**, không phải thông số trích xuất từ trang tham khảo.

Tài liệu chính thức được đối chiếu: semantic color pairings theo vai trò trong [Material color roles](https://m3.material.io/styles/color/the-color-system), typography theo vai trò trong [Applying type](https://m3.material.io/styles/typography/applying-type). Hai nguyên tắc này giúp giữ nền tảng nhất quán khi đổi theme và độ rộng màn hình.

## 2. Những gì giữ lại và điều chỉnh

Giữ lại: semantic token names hiện có; Light/Dark/System và preference persistence; sidebar toàn cục tách contextual navigation; header 64px; sidebar mở rộng 256px; các nhóm navigation đúng flow; provenance Source / Runtime / AI; các primitive Radix và icon Lucide.

Điều chỉnh đề xuất:

- Màu nền/surface dịu hơn trong cùng họ xanh dương hiện có.
- Page title từ 28px lên 32px; navigation từ 12px lên 14px. Nội dung đọc dài 16px; bảng và thông tin kỹ thuật giữ 14px.
- Control radius từ khoảng 6px lên 12px; card từ 8px lên 16px; dialog 24px. Code/service node giữ hình học gọn ở 8px.
- Rail thu gọn từ 64px lên 72px để có thêm khoảng thở cho icon/focus.
- Trang thông thường max-width 1200px thay cho một giới hạn 1440px chung; technical workspace dùng toàn bộ chiều rộng khả dụng.
- Card dùng nền/border; shadow chỉ xuất hiện ở bề mặt nổi có chức năng như menu/dialog.

Các thay đổi này chưa được áp dụng vào source. Baseline checkpoint 1 trước đó vẫn là implementation candidate đang chờ manual review; tài liệu này không ghi đè kết quả hoặc tự phê duyệt baseline mới.

## 3. Bảng màu Light / Dark

HEX là giá trị sRGB cụ thể để review, có thể gán trực tiếp cho CSS variables. Khi triển khai vào repo, chuẩn hóa sang OKLCH để giữ convention của `src/styles.css`, giữ mapping Tailwind semantic thay vì rải màu literal trong component.

| Token                      | Light     | Dark      | Ví dụ sử dụng                                  |
| -------------------------- | --------- | --------- | ---------------------------------------------- |
| `--background`             | `#F6F8FC` | `#10151F` | Nền trang; vùng trống quanh nội dung           |
| `--card`                   | `#FFFFFF` | `#18212F` | Card, form, bảng và vùng nội dung chính        |
| `--muted`                  | `#EEF2F7` | `#222D3D` | Vùng phụ, nền tìm kiếm và skeleton             |
| `--popover`                | `#FFFFFF` | `#202B3B` | Menu, dialog và drawer                         |
| `--foreground`             | `#1B2433` | `#E8EEF8` | Tiêu đề và nội dung chính                      |
| `--muted-foreground`       | `#536174` | `#AAB8CC` | Metadata, helper và mô tả phụ                  |
| `--border`                 | `#DCE3ED` | `#344154` | Divider và viền phân vùng không thiết yếu      |
| `--input`                  | `#7A899F` | `#6C7F98` | Ranh giới input và control cần nhận biết       |
| `--primary`                | `#244FC6` | `#AFC6FF` | Action chính, liên kết và điểm nhấn MAVIS      |
| `--primary-foreground`     | `#FFFFFF` | `#102458` | Chữ/icon trên primary                          |
| `--primary-hover`          | `#1D40A5` | `#C3D4FF` | Hover action chính                             |
| `--secondary`              | `#E8EDF6` | `#2B3850` | Action phụ có nền tonal                        |
| `--secondary-foreground`   | `#344563` | `#D6E2FA` | Chữ/icon trên secondary                        |
| `--accent`                 | `#EDF1F7` | `#263247` | Hover menu, hàng bảng và ghost button          |
| `--pressed`                | `#E1E8F3` | `#30405B` | Trạng thái đang nhấn của control trung tính    |
| `--selected`               | `#E5EDFF` | `#263A60` | Nền navigation, hàng hoặc phần tử được chọn    |
| `--selected-foreground`    | `#173EAA` | `#D9E5FF` | Chữ/icon của phần tử được chọn                 |
| `--ring`                   | `#244FC6` | `#AFC6FF` | Outline focus bàn phím                         |
| `--disabled-background`    | `#E9EDF3` | `#253044` | Nền control disabled                           |
| `--disabled-foreground`    | `#778396` | `#8695AB` | Chữ control disabled; kèm lý do không khả dụng |
| `--success`                | `#176445` | `#8AD8AF` | Completed / thành công                         |
| `--success-subtle`         | `#E7F4ED` | `#18382B` | Nền success                                    |
| `--warning`                | `#805000` | `#FFD08A` | Needs attention / mapping chưa chắc chắn       |
| `--warning-subtle`         | `#FFF2D6` | `#3B2C17` | Nền warning / potentially affected             |
| `--destructive`            | `#B32635` | `#FFB3BA` | Lỗi và action phá hủy                          |
| `--destructive-subtle`     | `#FCE9EB` | `#42232C` | Nền error                                      |
| `--destructive-foreground` | `#FFFFFF` | `#32121A` | Chữ trên destructive button                    |
| `--destructive-hover`      | `#982030` | `#FFC9CE` | Hover destructive button                       |
| `--info`                   | `#175C85` | `#9CCFF2` | Thông tin và tiến trình có mô tả               |
| `--info-subtle`            | `#E7F2FA` | `#1C3446` | Nền info                                       |
| `--source`                 | `#244FC6` | `#AFC6FF` | Source-inferred; nhãn Source và cạnh liền      |
| `--source-subtle`          | `#E5EDFF` | `#263A60` | Nền evidence nguồn                             |
| `--runtime`                | `#11665E` | `#8DDED0` | Runtime-observed; nhãn Runtime và cạnh đứt     |
| `--runtime-subtle`         | `#E3F3EF` | `#173A35` | Nền evidence runtime                           |
| `--ai`                     | `#65439B` | `#D1B8FA` | AI explanation; luôn có provenance/citation    |
| `--ai-subtle`              | `#F0EAF8` | `#342647` | Nền phần giải thích AI                         |
| `--code`                   | `#EEF2F7` | `#131C29` | Code/evidence; cuộn ngang cục bộ               |
| `--code-foreground`        | `#344563` | `#D6E2FA` | Nội dung code                                  |
| `--graph-edge`             | `#536174` | `#AAB8CC` | Cạnh trung tính có hướng                       |

Các alias bổ sung:

- `--card-foreground`, `--popover-foreground`, `--accent-foreground` → `--foreground`.
- `--graph-node` → `--card`; `--graph-selected` → `--selected`.
- `--graph-affected` → `--warning-subtle`; `--graph-affected-foreground` → `--warning`.
- `--sidebar` → `--card`; `--sidebar-accent` → `--selected`; `--sidebar-accent-foreground` → `--selected-foreground`.
- `--overlay`: Light `rgb(16 21 31 / 48%)`; Dark `rgb(0 0 0 / 64%)`.

Success, warning, error và info luôn đi cùng nhãn/icon. Ví dụ Completed + check, Needs attention + triangle, Failed + error icon. Với analysis job, Running/Queued/Failed phải có chữ; màu không thay thế trạng thái.

Source dùng nhãn Source-inferred và cạnh liền có mũi tên. Runtime dùng Runtime-observed và cạnh đứt có mũi tên. AI có nhãn AI explanation và citation. Selected có outline + nhãn/aria state; potentially affected không đồng nghĩa confirmed failure. Mapping chưa chắc chắn có dấu cảnh báo + mô tả và đường chấm nếu biểu diễn trên graph.

### Ví dụ CSS variables

Đây là ví dụ mapping cho proposal, chưa được import vào ứng dụng. Những token còn lại lấy giá trị từ bảng trên.

```css
:root {
  --background: #f6f8fc;
  --card: #ffffff;
  --foreground: #1b2433;
  --muted-foreground: #536174;
  --primary: #244fc6;
  --primary-foreground: #ffffff;
  --selected: #e5edff;
  --selected-foreground: #173eaa;
  --ring: var(--primary);
  --card-foreground: var(--foreground);
  --sidebar: var(--card);
}

.dark {
  --background: #10151f;
  --card: #18212f;
  --foreground: #e8eef8;
  --muted-foreground: #aab8cc;
  --primary: #afc6ff;
  --primary-foreground: #102458;
  --selected: #263a60;
  --selected-foreground: #d9e5ff;
}

.primary-action {
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius-control);
}

.primary-action:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}
```

System là preference, không phải bảng màu thứ ba: mặc định theo `prefers-color-scheme`, tiếp tục theo dõi thay đổi khi chọn System. Light/Dark explicit ưu tiên hơn thiết bị; lưu preference và tránh flash sai theme ở lần vẽ đầu. Việc đổi theme giữ nguyên layout và provenance.

## 4. Typography

Đề xuất font UI **Inter**, self-host bản có glyph tiếng Việt, weight 400/500/600. Fallback `"Segoe UI", system-ui, sans-serif`. Font kỹ thuật dùng **Cascadia Code**, fallback `Consolas, ui-monospace, monospace`; chưa thêm font/package mới trong proposal. Nếu chưa có font Inter được đóng gói, dùng font hệ thống hiện có để kiểm tra layout.

| Token                                     | Size / line-height                               | Weight          | Ví dụ                                |
| ----------------------------------------- | ------------------------------------------------ | --------------- | ------------------------------------ |
| `--font-ui`                               | Inter, Segoe UI, system-ui, sans-serif           | 400 / 500 / 600 | Toàn bộ UI                           |
| `--font-technical`                        | Cascadia Code, Consolas, ui-monospace, monospace | 400 / 500       | Tên service, file, commit, trace ID  |
| `--text-page` / `--line-page`             | 32px / 40px                                      | 600             | My Projects, Project Overview        |
| `--text-section` / `--line-section`       | 24px / 32px                                      | 600             | Analysis results, Runtime evidence   |
| `--text-card-title` / `--line-card-title` | 18px / 26px                                      | 600             | Tên project hoặc nhóm evidence       |
| `--text-body` / `--line-body`             | 16px / 24px                                      | 400             | Hướng dẫn, feedback, giải thích      |
| `--text-data` / `--line-data`             | 14px / 20px                                      | 400 / 500       | Table, metadata chính, trace rows    |
| `--text-label` / `--line-label`           | 14px / 20px                                      | 500 / 600       | Input label, button, sidebar item    |
| `--text-help` / `--line-help`             | 12px / 18px                                      | 400             | Helper, caption, annotation phụ      |
| `--text-code` / `--line-code`             | 13px / 20px                                      | 400             | Source excerpt, technical identifier |

- Một H1 mỗi trang; H2 theo phần việc, H3 cho nhóm con. Không dùng heading chỉ để làm chữ lớn.
- Mobile: page title 28px / 36px; body giữ 16px. Tiêu đề dài wrap, không cắt dấu tiếng Việt.
- Nội dung đọc dài rộng khoảng 60–75 ký tự mỗi dòng; dùng max-width 720px và khoảng đoạn 16px.
- Số liệu/thời gian dùng `font-variant-numeric: tabular-nums`; data table vẫn 14px.
- Không dùng chữ in hoa 10px cho thông tin cần đọc; chữ nhóm sidebar tối thiểu 12px / 18px.
- Liên kết trong đoạn văn có underline. Text quan trọng dùng foreground; muted chỉ cho nội dung hỗ trợ.

## 5. Spacing và geometry

Thang gốc 4px. Dùng token theo quan hệ: gần trong cùng component, xa khi chuyển nhóm nhiệm vụ.

| Token        | Giá trị | Ví dụ                                       |
| ------------ | ------- | ------------------------------------------- |
| `--space-0`  | 0       | Nội dung liền mép canvas                    |
| `--space-1`  | 4px     | Nhãn badge hoặc khoảng chi tiết nhỏ         |
| `--space-2`  | 8px     | Icon–label; label–input                     |
| `--space-3`  | 12px    | Các action liên quan                        |
| `--space-4`  | 16px    | Field–helper group; padding mobile          |
| `--space-5`  | 20px    | Nội dung component trung bình               |
| `--space-6`  | 24px    | Card padding; grid gap; nhóm field          |
| `--space-8`  | 32px    | Page gutter desktop; heading–content group  |
| `--space-10` | 40px    | Tách hai cụm lớn khi cần                    |
| `--space-12` | 48px    | Khoảng cách giữa các section lớn            |
| `--space-16` | 64px    | Biên vùng giới thiệu/đọc dài khi có nhu cầu |

Token theo mục đích: `--card-padding: 24px`, `--grid-gap: 24px`, `--workspace-gap: 16px`, `--section-gap: 32px`; dùng 48px khi các section là nhiệm vụ độc lập. Một bộ lọc nằm cùng bảng thường cách bảng 16px, không tách thành nhiều card trang trí.

## 6. Shape

| Token                | Giá trị | Áp dụng                                    |
| -------------------- | ------- | ------------------------------------------ |
| `--radius-sm`        | 4px     | Kbd và thành phần rất nhỏ                  |
| `--radius-technical` | 8px     | Code, node service, phần evidence kỹ thuật |
| `--radius-control`   | 12px    | Button, input, select và table wrapper     |
| `--radius-card`      | 16px    | Card, search field, popover                |
| `--radius-content`   | 24px    | Vùng nội dung lớn khi có bề mặt riêng      |
| `--radius-dialog`    | 24px    | Dialog; trên mobile vẫn giữ khoảng mép     |
| `--radius-pill`      | 9999px  | Chip/badge và avatar tròn                  |

Button chính/phụ/destructive dùng cùng geometry. Không bo góc từng hàng trong table. Nested surfaces dùng radius nhỏ hơn vùng chứa; graph viewport không bo lớn làm che nhãn/điều khiển cạnh canvas.

## 7. Elevation và lớp giao diện

Card/list mặc định phẳng, viền 1px dùng `--border`. Input/essential control dùng `--input`, mạnh hơn divider. Các surface tự phân tầng bằng màu; dark mode vẫn có border/surface rõ thay vì phụ thuộc hoàn toàn vào shadow.

| Token              | Light                                   | Dark                                 | Ví dụ                                 |
| ------------------ | --------------------------------------- | ------------------------------------ | ------------------------------------- |
| `--shadow-none`    | `none`                                  | `none`                               | Card, table, sidebar, header mặc định |
| `--shadow-low`     | `0 1px 2px rgb(16 24 40 / 6%)`          | `0 1px 2px rgb(0 0 0 / 18%)`         | Chỉ khi cần tách một bề mặt nhỏ       |
| `--shadow-popover` | `0 8px 24px -8px rgb(16 24 40 / 18%)`   | `0 12px 32px -8px rgb(0 0 0 / 36%)`  | Dropdown, select menu                 |
| `--shadow-dialog`  | `0 24px 64px -16px rgb(16 24 40 / 24%)` | `0 24px 64px -16px rgb(0 0 0 / 48%)` | Dialog/drawer kèm overlay             |

Layer tokens: `--z-sidebar: 20`, `--z-header: 30`, `--z-overlay: 50`, `--z-dialog: 60`, `--z-feedback: 70`, `--z-tooltip: 80`, `--z-skip-link: 100`. Popover nằm trong modal phải được render trong đúng focus/layer context. Không thêm shadow khi hover cho mọi card.

## 8. Icon, ảnh và empty state

- Giữ **Lucide outline**, stroke 1.75, rounded caps, cùng phong cách trong toàn bộ sản phẩm. Navigation/icon action 20px; icon phụ trong bảng 16px; empty-state icon 32–40px.
- Icon-only action có accessible name và hit area tối thiểu 44×44px trong layout chuẩn/mobile. Label bắt buộc vẫn hiển thị ở button có ý nghĩa nghiệp vụ.
- Dùng hình ảnh khi giúp hiểu kiến trúc hoặc nội dung học tập; ảnh minh họa có alt phù hợp, ảnh trang trí dùng alt rỗng. Không thêm hero illustration vào technical workspace.
- Empty state có: biểu tượng nhẹ, tiêu đề cụ thể, một câu giải thích và action liên quan. Ví dụ: “Chưa có source snapshot” → “Import source”. Loading, empty và error là ba trạng thái khác nhau.
- Ưu tiên SVG/code-native cho icon và architecture diagram; ảnh chụp/ảnh raster chỉ dùng khi có nội dung thật cần trình bày.

## 9. Trạng thái tương tác

| Trạng thái / token | Giá trị hoặc quy tắc                                                                                   | Ví dụ                         |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Default            | Foreground/background đúng cặp semantic                                                                | Form field trên card          |
| Hover              | Neutral: `--accent`; primary: `--primary-hover`; destructive: `--destructive-hover`                    | Nút và menu item enabled      |
| Focus-visible      | 2px `--ring`, offset 3px; không che focus bằng header/overlay                                          | Tab qua button/input/nav      |
| Active/pressed     | `--pressed` cho neutral; primary giữ cặp hover hợp lệ; không đổi kích thước                            | Pointer/key đang nhấn         |
| Selected           | `--selected` + `--selected-foreground`, weight 600 và aria state; graph thêm outline 2px + label       | Current nav, selected service |
| Disabled           | `--disabled-background` + `--disabled-foreground`; native disabled; lý do hiển thị gần control khi cần | Run chưa đủ điều kiện         |
| Loading            | `aria-busy`, nhãn đang xử lý, giữ chiều rộng control; chỉ hiển thị tiến độ khi có dữ liệu thật         | Đang phân tích…               |
| Motion             | `--motion-fast: 120ms`; `--motion-normal: 180ms`; `--ease-standard: cubic-bezier(.2,0,0,1)`            | Chuyển màu, mở panel          |
| Reduced motion     | Chuyển động về 0ms; nội dung và trạng thái giữ nguyên                                                  | Drawer/skeleton               |

Action chính: một action nổi bật trong một vùng nhiệm vụ. Action phụ dùng outline/tonal, destructive ghi rõ hậu quả ở bước xác nhận, tertiary dùng ghost/text. Hover không thay thế focus, selected không chỉ biểu diễn bằng màu, disabled không giả vờ là action thành công.

Thông số component chuẩn: button 40px desktop / 44px mobile; input/select 44px; scoped search 48px; table header 44px, data row tối thiểu 48px và tăng chiều cao khi wrap; tooltip chỉ chứa thông tin bổ sung.

## 10. Accessibility và bằng chứng kiểm tra

Mục tiêu WCAG 2.2 AA: text thông thường ít nhất 4.5:1, large text ít nhất 3:1; essential boundaries và trạng thái cần nhận biết ít nhất 3:1. Màu divider yếu chỉ dành cho phân vùng không thiết yếu. Căn cứ: [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) và [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

- Có skip link và các landmark header/nav/main/aside; heading hierarchy đúng; icon-only control có tên.
- Keyboard đi được mọi control; không focus trap ngoài modal; modal/drawer trap focus, Escape đóng và trả focus về trigger còn hiện hữu.
- Sticky header không che nội dung đang focus; mục tiêu sản phẩm là giữ control focus nhìn rõ hoàn toàn. Tham khảo [W3C Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).
- Form có label, helper/error liên kết bằng aria-describedby; aria-invalid cho field lỗi; error có chữ và icon.
- Hit area chuẩn/mobile 44×44px là mục tiêu MAVIS; control compact cần đủ khoảng cách. Không coi 44px là nguyên văn mức AA tối thiểu.
- Zoom 200% và chiều rộng 320px vẫn đọc/navigate được; bảng/code/graph có local scroll hoặc chế độ list phù hợp. Không khóa body vào một desktop width.
- Graph/trace có list/table inspection; runtime ghi rõ session/scenario và capture gaps. Không coi thiếu span là bằng chứng không có hành vi.

**Đã kiểm tra palette proposal bằng phép tính sRGB contrast:** 39 token màu mỗi theme; 56 cặp (46 text/background + 10 boundary/focus/edge) đạt mục tiêu. Tương phản text thấp nhất 5.54:1; boundary thấp nhất 3.34:1. Lệnh đã chạy: Node portable thực thi script tạm `%TEMP%/mavis-visual-proposal-contrast.cjs`; exit 0, không có cặp fail.

Kết quả này chỉ kiểm tra các cặp màu opaque được liệt kê trong script. Font thực tế, compositing overlay/shadow, hover chồng surface, zoom, responsive và keyboard chưa được kiểm tra trên giao diện đã triển khai proposal. Đây không phải chứng nhận accessibility hoàn chỉnh.

## 11. Global Layout

### Chọn sidebar kết hợp utility header

Sidebar giữ vị trí ổn định cho ba role và các nhóm project/workspace. Header chứa breadcrumb/context, appearance, notification và account. Cấu trúc này phù hợp với chuỗi màn kỹ thuật nhiều cấp: người dùng vẫn thấy nơi mình đang làm việc mà phần nội dung có thể thay đổi giữa list, editor, graph và review.

Global navigation không trộn với contextual navigation. Role selector chỉ có trong design preview. Search xuất hiện trong phạm vi trang/list cần tìm kiếm, ví dụ service filter hoặc project list; proposal không thêm một nghiệp vụ global search ngoài screen flow.

### Layout tokens

| Token                 | Giá trị                          | Sử dụng                                        |
| --------------------- | -------------------------------- | ---------------------------------------------- |
| `--header-height`     | 64px                             | Utility header dùng chung                      |
| `--sidebar-width`     | 256px                            | Sidebar expanded                               |
| `--sidebar-collapsed` | 72px                             | Rail icon và tooltip                           |
| `--drawer-width`      | `min(320px, calc(100vw - 32px))` | Mobile navigation                              |
| `--content-max`       | 1200px                           | List, overview, assignment/admin thông thường  |
| `--reading-max`       | 720px                            | AI explanation, feedback, nội dung đọc dài     |
| `--form-max`          | 640px                            | Form thông thường; editor lớn có variant riêng |
| `--detail-width`      | 360px                            | Evidence/details khi đủ chỗ                    |
| `--filter-width`      | 224px                            | Filter rail của workspace lớn                  |
| `--workspace-gap`     | 16px                             | Khoảng giữa filter/canvas/details              |
| `--page-gutter`       | 32 / 24 / 16px                   | Desktop / tablet / mobile                      |
| `--control-height`    | 44px                             | Input/select; button có density riêng          |

Content bình thường căn giữa trong phần main sau khi trừ sidebar. Form/reading content căn theo cùng lề trang, có max-width riêng để tiêu đề và field không bị lệch trục tùy tiện. Bảng lớn có thể dùng full main width theo variant; không tự ép mọi trang vào reading width.

Technical workspace co giãn toàn bộ main width, không bị giới hạn 1200px. Layout phân pane dựa vào **chiều rộng main còn lại sau sidebar, gutters và gap**, không chỉ nhìn viewport:

- Main từ 1200px: filter 224px + gap 16px + canvas tối thiểu 560px + gap 16px + details 360px. Thường khả thi từ viewport khoảng 1600px khi sidebar mở.
- Main từ 900 đến dưới 1200px: filter chuyển thành toolbar/popover; canvas + details có thể đặt cạnh nhau, details tối đa 360px.
- Main dưới 900px: canvas chiếm vùng chính; filter và details mở theo yêu cầu trong drawer/panel. Mobile ưu tiên list inspection và cho mở canvas riêng khi cần.

### Desktop, tablet và mobile

| Viewport               | Navigation                                              | Header / gutter          | Nội dung                                                                 |
| ---------------------- | ------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Desktop ≥1280px        | Expanded 256px; có nút thu về rail 72px và lưu lựa chọn | Header 64px, gutter 32px | Normal max 1200px; technical full width; pane theo main width thực tế    |
| Tablet lớn 1024–1279px | Rail 72px mặc định; cho mở rộng khi người dùng muốn     | Header 64px, gutter 24px | Table/form giữ đọc được; filter/details thu theo vùng main               |
| Tablet 768–1023px      | Rail 72px; tooltip/focus name đầy đủ                    | Header 64px, gutter 24px | Ưu tiên một vùng chính; detail drawer, action wrap                       |
| Mobile <768px          | Ẩn sidebar cố định; menu button 44px mở modal drawer    | Header 64px, gutter 16px | Một cột; H1 28px; action xuống dưới title; technical region local scroll |

User preference về collapsed/expanded được giữ trên desktop/tablet. Khi mobile, drawer luôn thay fixed sidebar để bảo toàn content width; quay lại màn lớn khôi phục preference. Không thêm bottom navigation vì hierarchy MAVIS gồm nhiều nhóm và contextual destinations.

### Page anatomy

1. **Header:** breadcrumb/context phía trái; Appearance, Notifications và Account phía phải. Context/version của project có thể ở một strip ngay dưới header; không đưa credentials vào header.
2. **Page heading:** một H1 trong main; breadcrumb chỉ kể hierarchy, không lặp thêm H1 lớn ở header. Nếu một page là context con, breadcrumb gồm parent/context/current.
3. **Description/context:** một đến hai dòng giải thích; source/model/submission version và provenance nằm gần tên tài nguyên.
4. **Actions:** một primary action sát heading phía phải trên desktop, secondary đặt cạnh; mobile chuyển xuống dưới. Destructive action trong menu hoặc confirmation có context.
5. **Local toolbar:** search/filter/sort khi màn đó có nhu cầu; cách heading group 24px và main content 16px.
6. **Main content:** table/list/card hoặc workspace; hierarchy lấy từ nhiệm vụ, không thêm metric widget trang trí.
7. **Contextual evidence:** adjacent panel hoặc drawer; giữ provenance/version, close action và focus return.

### Các trang dùng shell và variant riêng

- **Shared shell:** My Projects, My Workspaces, My Submissions, Project Overview, workspace/assignment pages, admin list/detail/settings/monitoring/runtime screens.
- **Project Workspace variant:** giữ global shell, thêm project context và contextual navigation; Graph Explorer, Model Editor, Diagrams/Viewer, Compare, Impact, Runtime Sessions/Details dùng main fluid và pane theo chỗ có sẵn.
- **Submission Review variant:** shell chung, context student/assignment/submission version cố định; submitted results read-only; feedback editor riêng; nguồn/evidence đặt cạnh nội dung cần review.
- **Reading/form variant:** AI Explanation Details, feedback/history và editor/settings form dùng width phù hợp; không tạo shell mới.
- **Authentication layout riêng:** Login/Register có container tập trung khoảng 440px, logo/name MAVIS, appearance và nội dung xác thực; không đặt authenticated sidebar vào đây.
- **Dialog/drawer/action:** create/edit bounded form, archive/delete, join, publish, test, run, submit, export và evidence/history panels tiếp tục được phân loại theo ba flow đã cung cấp; không chuyển chúng thành navigation page mới chỉ vì có action.

## 12. Giả định và các quyết định cần xác nhận

Giả định giữ nguyên: đây vẫn là MAVIS, Next.js/TypeScript/Tailwind, desktop-first cho Student/Lecturer/Admin; ba screen flow là nguồn navigation; không bổ sung backend contract hoặc nghiệp vụ ngoài flow; label UI hiện tại là tiếng Anh, đồng thời typography phải hỗ trợ tiếng Việt.

Cần xác nhận trước khi sửa application source:

1. Duyệt palette xanh dương dịu và các cặp semantic Light/Dark trong bảng.
2. Duyệt typography Inter self-host, body đọc dài 16px, data/nav 14px; hoặc giữ system font trước khi bổ sung font asset.
3. Duyệt geometry 12/16/24px, rail 72px và các breakpoint trong proposal; sidebar expanded 256px/header 64px được giữ.
4. Duyệt normal content max 1200px và technical workspace fluid; đây là thay đổi có chủ đích so với một max-width chung hiện tại.
5. Xác nhận ngôn ngữ UI cuối cùng: English, Vietnamese hoặc song ngữ để kiểm tra label dài trước Stage 2.

Sau khi duyệt, triển khai thành một **bản điều chỉnh checkpoint 1** có file scope và acceptance criteria riêng; cập nhật design-system review page và kiểm tra lại checklist/manual accessibility. Chỉ chuyển checkpoint 2 khi foundation được xác minh và chủ dự án phê duyệt.

## 13. Thay đổi và kiểm tra trong lần đề xuất này

- Tạo duy nhất tài liệu này trong `docs/design/`.
- Không sửa `src/styles.css`, component, route, manifest, backend hoặc screen flow.
- Đã đối chiếu token/layout đang có và chạy kiểm tra contrast palette proposal như phần 10.
- Kiểm tra formatting bằng Prettier và kiểm tra whitespace riêng cho tài liệu này. Lần kiểm tra Git diff toàn repo phát hiện trailing whitespace trong hai file webpack sinh tự động ở `.next` từ lần chạy dev trước; các output đó được giữ nguyên, không đưa vào phạm vi chỉnh sửa proposal.
- Không chạy lại production build vì application source không đổi. Browser/layout/keyboard của proposal chưa được kiểm tra thực tế.
