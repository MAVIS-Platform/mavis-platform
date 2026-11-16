# MAVIS · Checkpoint 1: hướng dẫn chạy và kiểm thử thủ công

Trạng thái: chờ người kiểm thử thực hiện và chủ dự án phê duyệt. Các checkbox dưới đây chưa được đánh dấu Pass.

Phạm vi: design system, appearance, application shell, cấu hình navigation theo ba role và các tương tác mẫu tại `/design-system`. Những màn chi tiết của Student/Lecturer/Admin sẽ được triển khai ở checkpoint sau. Dữ liệu hiển thị là minh họa.

## 1. Chạy ngay bản production đã kiểm tra

Mở PowerShell, chạy lệnh sau từ bất kỳ thư mục nào:

```powershell
& "$env:TEMP\mavis-stage1-node\node-v22.16.0-win-x64\node.exe" "$env:TEMP\mavis-stage1-build-native\node_modules\next\dist\bin\next" start "$env:TEMP\mavis-stage1-build-native" -H 127.0.0.1 -p 3091
```

Khi terminal hiện `Ready`, mở **http://127.0.0.1:3091/design-system**. Giữ terminal chạy trong lúc kiểm tra. Dừng bằng `Ctrl+C`.

- Node portable, dependencies và production build đã được chuẩn bị; đã xác nhận chúng vẫn tồn tại khi viết hướng dẫn này.
- Checkpoint 1 chỉ cần frontend; không cần backend, Docker, database, API key hay đăng nhập.
- Nếu báo `EADDRINUSE`, đổi `3091` thành `3092` trong lệnh và URL.
- Bản này nằm trong thư mục tạm, tránh ghi lại `.next` đang được Git theo dõi trong repository. Windows có thể dọn thư mục tạm; nếu báo không tìm thấy file, sử dụng cách chạy từ source ở phần 2.
- Đây là bản build tại thời điểm bàn giao checkpoint 1. Muốn xem các thay đổi source sau đó, dùng dev server hoặc build lại.

## 2. Chạy từ source để phát triển

Nếu `node` và `npm` đã có trong terminal:

```powershell
Set-Location -LiteralPath 'E:\Github-cln\mavis-platform\MAVIS-Frontend'
node --version
npm --version
```

Dependencies hiện đã có. Chỉ chạy `npm ci` khi `node_modules` bị thiếu hoặc khi cần đồng bộ lại theo lockfile. Khởi động dev server bằng:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Mở **http://127.0.0.1:3000/design-system**. Dùng `Ctrl+C` để dừng.

Nếu terminal chưa nhận `node`/`npm`, nhưng Node portable ở phần 1 còn tồn tại, thêm nó vào PATH của riêng phiên PowerShell hiện tại rồi chạy lại các lệnh trên:

```powershell
$mavisRuntimeBin = Join-Path $env:TEMP 'mavis-stage1-node\node-v22.16.0-win-x64'
$env:PATH = "$mavisRuntimeBin;$env:PATH"
```

Nếu chạy dev/build từ repository, Next.js sẽ sinh lại `.next` và có thể tạo Git diff cho các output đang được theo dõi. Giữ các thay đổi output đó riêng khỏi source khi review; cách chạy production ở phần 1 phù hợp hơn cho vòng kiểm tra này.

## 3. Chuẩn bị kiểm thử

- Dùng cùng một địa chỉ gốc khi thử nhiều tab: ví dụ mọi tab đều là `http://127.0.0.1:3091`. `localhost` và `127.0.0.1` có storage riêng.
- Dùng zoom 100%; kiểm tra viewport rộng khoảng 1440px, 1024px, 768px và 390px. Có thể đặt kích thước bằng chế độ responsive của DevTools.
- Kiểm tra các nhóm chính ở cả Light và Dark; dùng System riêng cho phần thay đổi theo thiết bị.
- Mở DevTools Console để ghi nhận lỗi runtime/hydration mới khi thực hiện thao tác.
- Ghi mỗi mã test là `Pass`, `Fail` hoặc `Not tested`; checkbox chỉ đánh dấu khi kết quả đúng như mong đợi.
- Role/context selector là công cụ preview thiết kế. Chọn menu trong `/design-system` đổi selection và hiện thông báo preview; nội dung màn chi tiết chưa được mở ở checkpoint này.

## 4. Checklist

### A. Khởi động và hiển thị

- [ ] **CP1-01 — Load trang:** mở `/design-system`, reload. Mong đợi: trang Design foundation có đủ bốn tab Foundation, Components, Navigation, Evidence language; không trắng trang hay lỗi hydration trong Console.
- [ ] **CP1-02 — Nhãn dữ liệu:** kiểm tra thanh thông tin phía trên nội dung. Mong đợi: luôn có “Design preview · All content is illustrative. No live system data.”; có dấu hiệu rõ đây là bản review, không có trạng thái giả như dữ liệu live.
- [ ] **CP1-03 — Mẫu Light/Dark:** trong Foundation, xem hai specimen. Mong đợi: một mẫu luôn Light, một mẫu luôn Dark, kể cả khi đổi theme toàn ứng dụng; chữ, badge, node và cạnh đều đọc được.
- [ ] **CP1-04 — Typography và spacing:** xem tiêu đề, chú thích, mã nguồn, bảng màu và kích thước. Mong đợi: phân cấp rõ, font kỹ thuật là monospace, không có chữ đè hoặc bị cắt mất nội dung quan trọng.

### B. Appearance và lưu lựa chọn

- [ ] **CP1-05 — Light:** mở Appearance ở header, chọn Light. Mong đợi: toàn bộ shell/nội dung chuyển sang sáng, lựa chọn được đánh dấu trong menu, cấu trúc không đổi.
- [ ] **CP1-06 — Dark:** chọn Dark; mở Components, menu, modal và Review notes. Mong đợi: chữ/field/code/badge/overlay đọc được; không có vùng trắng bất thường hoặc chữ chìm vào nền.
- [ ] **CP1-07 — Persistence:** chọn Dark, reload, đóng rồi mở lại URL trong cùng browser/profile. Mong đợi: vẫn Dark. Lặp lại với Light.
- [ ] **CP1-08 — System:** chọn System, đổi light/dark preference của hệ điều hành hoặc giả lập `prefers-color-scheme` bằng DevTools. Mong đợi: theme đổi theo preference và menu vẫn chọn System.
- [ ] **CP1-09 — Explicit override:** chọn Light, đổi preference thiết bị sang Dark; làm ngược lại với Dark. Mong đợi: lựa chọn explicit được giữ, không bị System ghi đè.
- [ ] **CP1-10 — Hai tab:** mở hai tab cùng URL gốc, đổi theme ở một tab. Mong đợi: tab còn lại cập nhật theme/lựa chọn mà không cần reload.

### C. Navigation theo screen flow

- [ ] **CP1-11 — Student global:** chọn Preview role = Student / Individual Learner, Navigation context = Global navigation. Mong đợi: sidebar có My Projects, My Workspaces, My Submissions, tách nhóm Personal/Education; không có công cụ phân tích project ở global.
- [ ] **CP1-12 — Student project:** chọn Project workspace. Mong đợi: global vẫn hiện; phần contextual riêng có Project Overview, Source Snapshots, Analysis History; năm mục Architecture; ba mục Runtime; AI Explanations. Bấm vài mục: đúng mục active và có thông báo preview.
- [ ] **CP1-13 — Lecturer:** chọn Lecturer. Mong đợi: global có My Workspaces. Chọn Teaching workspace: có Workspace Overview, Workspace Members, Assignments, Reference Source Versions, Assignment Submissions.
- [ ] **CP1-14 — Submission review:** với Lecturer, chọn Submission review. Mong đợi: có nhãn “Submitted · read-only” và bốn mục Submission Details & Review / Submitted Analysis Results / Submitted Architecture Explorer / Submitted Runtime Evidence; không hiện công cụ sửa personal project.
- [ ] **CP1-15 — Admin:** chọn System Administrator. Mong đợi: đúng năm nhóm User Management, Integrations, Monitoring, Audit, Runtime Administration; tổng chín mục; không có nhóm chức năng Student/Lecturer.
- [ ] **CP1-16 — Đổi role/context:** chuyển Student → Lecturer → Admin → Student. Mong đợi: selection/context được reset phù hợp, không giữ nhóm của role cũ; chọn mục planned trong review không tạo URL 404 hay gọi API.

### D. Shell, sidebar và responsive

- [ ] **CP1-17 — Collapse/expand:** ở desktop, bấm Collapse sidebar rồi Expand sidebar. Mong đợi: sidebar chuyển giữa 256px và 64px, icon vẫn rõ, active vẫn nhận biết được, nội dung dùng phần chiều rộng còn lại.
- [ ] **CP1-18 — Sidebar persistence:** collapse, reload; sau đó expand và reload. Mong đợi: nhớ trạng thái đã chọn. Khi collapse, hover/focus một mục enabled để kiểm tra tooltip tên đầy đủ.
- [ ] **CP1-19 — 1440px và 1024px:** thử các tab, role/context và Inspect evidence. Mong đợi: title/action/header không đè nhau; panel khoảng 360px ở bên phải khi viewport đủ rộng, xếp xuống dưới ở kích thước hẹp hơn.
- [ ] **CP1-20 — 768px:** kiểm tra rail/sidebar và form. Mong đợi: vẫn truy cập được navigation; nội dung đọc được; toàn trang không tràn ngang. Preference collapse đã lưu có thể ưu tiên hơn mặc định viewport.
- [ ] **CP1-21 — 390px:** thu viewport, bấm Open navigation. Mong đợi: sidebar được thay bằng drawer, có tên role và đầy đủ menu; drawer vừa viewport, cuộn được; chọn mục preview hoặc bấm close sẽ đóng drawer.
- [ ] **CP1-22 — Vùng kỹ thuật:** ở 390px, mở Components và xem bảng/code/graph specimen. Mong đợi: vùng cần chiều rộng tự cuộn bên trong, không kéo cả trang tràn ngang; page action/form xuống dòng hợp lý.
- [ ] **CP1-23 — Header menus:** mở Notifications, Profile menu, Review notes. Mong đợi: notification ghi rõ chưa nối live service; My Profile/Logout có nhãn planned và disabled; Review notes là panel hướng dẫn, không giả gửi feedback.

### E. Component và tương tác mẫu

- [ ] **CP1-24 — Tabs:** chuyển cả bốn tab bằng click. Mong đợi: đúng nội dung, active rõ, không xuất hiện nội dung nhiều tab chồng nhau.
- [ ] **CP1-25 — Buttons:** trong Components, bấm Primary action, Secondary, View evidence. Mong đợi: hai action đầu hiện feedback local đúng nội dung; View evidence mở panel. Unavailable không thực hiện thao tác.
- [ ] **CP1-26 — Form error/recovery:** Snapshot label ban đầu rỗng. Mong đợi: error có chữ và icon. Nhập `Snapshot test`: error được thay bằng “Label ready · local example”. Xóa hoặc nhập toàn khoảng trắng: error trở lại. Source version vẫn disabled.
- [ ] **CP1-27 — Search/table:** tìm `order`, sau đó `catalog`. Mong đợi: chỉ còn service phù hợp. Nhập `zzzz`: có empty state; bấm Clear filter: hai dòng xuất hiện lại.
- [ ] **CP1-28 — Modal cancel:** bấm Destructive example, rồi Cancel; mở lại, thử nút X và Escape. Mong đợi: modal đóng, focus trở về trigger, không xuất hiện feedback xác nhận đã hoàn thành action.
- [ ] **CP1-29 — Modal confirm:** mở lại, bấm Confirm example. Mong đợi: modal đóng và có thông báo local xác nhận không đổi project data; không hiển thị kết quả backend giả.
- [ ] **CP1-30 — Context panel:** bấm Inspect evidence / View evidence. Mong đợi: có nguồn Source-inferred, model/source version và code specimen; đóng bằng Hide details hoặc X; main content trở về chiều rộng phù hợp.
- [ ] **CP1-31 — Status/help/empty/loading:** xem success/warning/error/info/Not captured, tooltip Evidence availability, empty state và skeleton. Mong đợi: status có nhãn; tooltip mở bằng hover/focus; Import source example chỉ hiện feedback; skeleton không có tiến độ phần trăm giả.
- [ ] **CP1-32 — Evidence language:** mở tab Evidence language và “Inspect relationships as a list”. Mong đợi: Source-inferred / Runtime-observed / AI explanation tách biệt; source là cạnh liền, runtime cạnh đứt và có chiều; service được chọn có nhãn Selected; cảnh báo partial capture và danh sách quan hệ đọc được. Graph là specimen tĩnh, không có tương tác kéo/zoom trong checkpoint này.

### F. Bàn phím, focus và accessibility

- [ ] **CP1-33 — Skip link:** reload rồi dùng Tab từ đầu trang. Mong đợi: Skip to content xuất hiện; Enter đưa focus đến vùng main.
- [ ] **CP1-34 — Keyboard navigation:** dùng Tab / Shift+Tab, Enter / Space, phím mũi tên trong menu/tab. Mong đợi: control có focus rõ ở Light/Dark; thao tác được mà không cần chuột; native disabled controls không chạy action.
- [ ] **CP1-35 — Focus trap/return:** mở modal, Review notes hoặc mobile drawer bằng bàn phím. Mong đợi: Tab không đi vào nội dung nền khi overlay mở; Escape đóng; focus trở về control mở overlay nếu control đó còn hiện.
- [ ] **CP1-36 — Reduced motion:** bật Reduce motion của thiết bị hoặc giả lập `prefers-reduced-motion`. Mong đợi: skeleton và hiệu ứng mở/đóng giảm chuyển động, nội dung vẫn đầy đủ.

### G. Các route demo hiện có

- [ ] **CP1-37 — Compatibility:** mở trực tiếp `/`, `/architecture`, `/impact`, `/explain`, `/import`. Mong đợi: trang render, có shell mới và nhãn illustrative data; không có runtime error mới do shell/theme. Phần body cũ vẫn là demo, chưa phải thiết kế cuối của các màn trong screen flow.
- [ ] **CP1-38 — Planned destinations:** ở các route demo, xem các mục sidebar chưa có màn. Mong đợi: nhãn Planned, disabled; các công cụ Architecture/Impact/AI nằm trong project context khi mở route tương ứng.

## 5. Gửi kết quả và duyệt checkpoint

Gửi kết quả theo mẫu; giữ `Not tested` cho mọi mục chưa thực hiện:

```text
MAVIS Checkpoint 1 review
Browser + version:
Viewport đã thử:
URL / port:

Pass: CP1-...
Fail: CP1-...
Not tested: CP1-...

Mỗi lỗi:
- Test ID:
- Role / context / theme / viewport:
- Bước tái hiện:
- Kết quả thực tế:
- Kết quả mong đợi:
- Console error / ảnh minh họa nếu có:

Quyết định: Duyệt / Cần sửa trước khi duyệt
```

Nếu có lỗi tái hiện được ở theme, navigation, layout, focus hoặc runtime, xử lý và kiểm lại nhóm liên quan trước khi chốt checkpoint. Các giới hạn đã ghi như planned screens, authentication và backend chưa kết nối là phạm vi của các checkpoint sau.

Sau khi các acceptance criteria được xác minh và chủ dự án xác nhận **“Duyệt checkpoint 1”**, bước tiếp theo là đề xuất phạm vi/file/tiêu chí cho checkpoint 2: Student My Projects, Project Overview và Project Workspace layout. Các design tokens và shell đã được duyệt sẽ là baseline.
