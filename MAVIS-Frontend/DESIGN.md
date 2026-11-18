# MAVIS Design System (`MAVIS-Frontend/DESIGN.md`)

> **Phiên bản:** `2.0 — Post-Review 2 UI/UX Refactor Baseline`  
> **Phạm vi:** Toàn bộ giao diện web `MAVIS-Frontend` (Landing Page, Login, Student Coursera Portal, 4-Stage Lab Workspace, MAVIS Studio 2D/3D, Lecturer LMS & Grading Workspace, Admin Control Center).  
> **Chuẩn thẩm mỹ tham chiếu:** **Linear · Vercel · Raycast · Stripe Docs** (tinh gọn, sắc nét, ưu tiên dữ liệu kỹ thuật) kết hợp **ForumFlash (`forumflashstudy.com`) & Coursera** (thẻ khóa học trực quan, thanh tiến độ rõ ràng, giảm tải chữ dày đặc).  
> **Stack thực thi:** Next.js 15 · React 19 · Tailwind CSS v4 · shadcn/ui (Radix Primitives) · Lucide Icons · `tw-animate-css` (0 phụ thuộc mới).

---

## 1. Triết lý Thiết kế & Quy tắc Chống "AI Slop"

Mọi thay đổi UI/UX trong MAVIS phải tuân thủ 5 nguyên tắc cốt lõi sau để đạt chất lượng sản phẩm thực tế của doanh nghiệp:

1. **Rõ ràng hơn hào nhoáng (Clarity over Decoration):**
   - **Cấm** dùng các dải gradient chói mắt hoặc màu cầu vồng vô nghĩa làm nền cho banner/card.
   - **Cấm** nhân đôi thanh điều hướng (ví dụ: không hiển thị đồng thời cả Stepper ngang lẫn Mục lục trái lặp lại đúng 4 bước giống hệt nhau).
   - Mỗi màn hình chỉ có **1 hành động chính duy nhất (1 Primary CTA)** để người dùng không bị phân tâm.
2. **Kiến trúc Hai Bề Mặt Hài Hòa (Dual-Surface Harmony):**
   - **Portal & Reading Surface (Light Mode & Dark Mode chuẩn mực):** Dành cho Landing, Courses, Roadmap, Theory, Quiz Gate và Lecturer Grading. Nền sạch, viền hairline `1px`, độ tương phản cao (`WCAG AA ≥ 4.5:1`), bố cục thoáng dễ đọc.
   - **MAVIS Studio & Graph Surface (Technical Precision):** Không gian kỹ thuật tối (`Deep Slate Navy`) chuyên biệt cho đồ thị kiến trúc 2D/3D, OpenTelemetry Spans và bảng điều khiển Stop/Start/Scale Docker thật — giúp trạng thái sống/chết của từng container nổi bật ngay lập tức.
3. **Ngữ nghĩa Bằng chứng Bất biến (Epistemic Visual Coding):**
   Không bao giờ trộn lẫn màu sắc giữa bằng chứng tĩnh, dữ liệu runtime thật và giải thích AI:
   - **Static / AST Source (`--source`):** Cobalt Indigo — chỉ dùng cho `C1–C3`, `Dependency Graph`, `Reverse BFS`, trích dẫn `file:line`.
   - **Live Runtime / OTel (`--runtime`):** Emerald Teal — chỉ dùng cho `Docker Live`, `OpenTelemetry Spans`, `RuntimeReceipt`.
   - **Evidence-Grounded AI (`--ai`):** Violet — chỉ dùng cho nhận xét AI có trích dẫn trong `Allowlist`.
   - **Warning / Needs Revision (`--warning`):** Amber — chỉ dùng cho Quiz `NEEDS_RETRY`, điểm Snapshot `≤ 5.0/10`, Lab `LOCKED`, cảnh báo `BR-08`.
   - **Stopped / Failed / Error (`--destructive`):** Crimson Rose — chỉ dùng cho container `STOPPED`, `PREFLIGHT_FAILED`, Passkey sai/hết hạn (`BR-02`), lỗi bảo mật (`403`).
4. **Độ trung thực Dữ liệu & Số liệu (Tabular Precision):**
   - Mọi con số đo lường (`p95 Latency`, `CPU %`, `RAM MiB`, `Replicas 1..8`, `Score 0.00/10`, `Progress %`) bắt buộc dùng `font-mono tabular-nums` để căn thẳng hàng khi cập nhật theo thời gian thực.
5. **Bám sát RBAC & Song ngữ 100% (`N2`, `N6`):**
   - Không rò rỉ menu/nhãn của vai trò khác (Student tuyệt đối không thấy nhãn *"Không gian giảng dạy"* hay nút *"Sandbox Studio Tự Do"* ngoài luồng `WF-01..WF-04`).
   - Không lẫn tiếng Anh trong giao diện Tiếng Việt (và ngược lại) trên bất kỳ màn hình nào.

---

## 2. Hệ thống Bảng Màu Chuẩn (OKLCH Semantic Tokens)

Kế thừa và chuẩn hóa trực tiếp trong [`src/styles.css`](src/styles.css). Mọi component **bắt buộc** gọi semantic class (`bg-background`, `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`...) thay vì hardcode hex màu rời rạc.

### 2.1. Bảng Token Nền, Chữ & Viền (Light & Dark Mode)

| Semantic Token | Light Mode (Portal) | Dark Mode (Portal & Studio) | Ứng dụng chính |
| :--- | :--- | :--- | :--- |
| `--background` | `oklch(0.985 0.004 260)` | `oklch(0.145 0.018 260)` | Nền trang tổng thể (Off-white lạnh / Linear Slate) |
| `--card` | `oklch(1.000 0.000 0)` | `oklch(0.185 0.020 260)` | Nền thẻ lớp học, thẻ Lab, bảng chấm điểm |
| `--muted` | `oklch(0.960 0.007 256)` | `oklch(0.225 0.020 260)` | Nền phụ cho khu vực lý thuyết, khung trạng thái |
| `--border` | `oklch(0.915 0.012 258)` | `oklch(0.275 0.022 258)` | Viền chia vùng hairline `1px` sắc nét |
| `--foreground` | `oklch(0.210 0.028 260)` | `oklch(0.955 0.008 258)` | Chữ chính (contrast > 11:1) |
| `--muted-foreground` | `oklch(0.490 0.028 258)` | `oklch(0.680 0.022 258)` | Chữ mô tả phụ, nhãn metadata, ngày giờ |
| `--primary` | `oklch(0.480 0.185 264)` | `oklch(0.640 0.175 264)` | Nút CTA chính, bước active, liên kết chính |
| `--primary-hover` | `oklch(0.420 0.175 264)` | `oklch(0.700 0.165 264)` | Trạng thái hover của CTA chính |
| `--selected` | `oklch(0.945 0.026 266)` | `oklch(0.255 0.045 264)` | Nền mục sidebar / tab / node đang chọn |

### 2.2. Bảng Token Trạng thái & Ngữ nghĩa Kiến trúc

| Semantic Token | Light Mode | Dark Mode | Ý nghĩa nghiệp vụ MAVIS |
| :--- | :--- | :--- | :--- |
| `--source` / `--source-subtle` | `oklch(0.476 0.192 265)` / `94.5%` | `oklch(0.670 0.175 265)` / `22%` | Static AST, C1–C3, Reverse BFS, `file:line` |
| `--runtime` / `--runtime-subtle` | `oklch(0.461 0.086 172)` / `95.1%` | `oklch(0.695 0.135 170)` / `21%` | Live Docker, OTel Spans, `RuntimeReceipt` |
| `--success` / `--success-subtle` | `oklch(0.455 0.105 160)` / `95.5%` | `oklch(0.700 0.140 160)` / `21%` | `PASSED`, `UNLOCKED`, `APPROVED`, `> 5.0/10` |
| `--warning` / `--warning-subtle` | `oklch(0.515 0.125 70)` / `96.4%` | `oklch(0.765 0.135 76)` / `22%` | `NEEDS_RETRY`, `NEEDS_REVISION`, `≤ 5.0/10`, `LOCKED` |
| `--destructive` / `--destructive-subtle` | `oklch(0.515 0.180 22)` / `95.0%` | `oklch(0.665 0.185 22)` / `22%` | `STOPPED`, `FAILED`, `PREFLIGHT_FAILED`, `403` |
| `--ai` / `--ai-subtle` | `oklch(0.485 0.150 296)` / `94.6%` | `oklch(0.715 0.150 296)` / `22%` | AI Explanation, AI Coupling/Contract Review |

### 2.3. Quy chuẩn Bề mặt Hero & Technical Studio
- **Portal Hero Banner (thay thế gradient nặng hiện tại):**
  - *Light Mode:* Nền trắng pha slate cực nhẹ (`bg-card`) kết hợp hoa văn lưới chấm kiến trúc mờ (`.mavis-grid-pattern`, opacity `4%`) + đường viền trên sắc nét màu Cobalt (`border-t-2 border-t-primary`) hoặc glow cực dịu ở góc phải.
  - *Dark Mode:* Nền `oklch(0.165 0.022 260)` với ánh sáng radial xanh Cobalt cực mờ (`opacity 12%`) chuẩn Linear/Vercel.
- **MAVIS Studio Technical Surface:**
  - Nền canvas: `oklch(0.130 0.022 260)` (Deep Technical Navy), đường lưới đẳng cự (`isometric grid`) mảnh `1px` độ mờ `8%`.
  - Trạng thái Node:
    - `RUNNING`: Viền `emerald-400/70`, chấm nhịp xanh dịu.
    - `SCALED (×N)`: Xếp lớp thẻ 2D/3D (stacked replica cards) + huy hiệu monospace `×4`.
    - `STOPPED`: Viền đứt `rose-500`, nền `rose-950/40`, nhãn `STOPPED · 0/N`.
    - `CIRCUIT_OPEN / FALLBACK`: Đường nối nét đứt màu Amber kèm nhãn `FALLBACK`.

---

## 3. Hệ thống Typography

- **UI Font (`--font-ui`):** `"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif` *(self-hosted `/fonts/inter/InterVariable.woff2`)*.
- **Technical Monospace (`--font-technical`):** `"JetBrains Mono", "Cascadia Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
  - Bắt buộc dùng cho: tên service (`order-service`, `payment-service`), mã lớp (`SWD392`), `Passkey`, đường dẫn & số dòng (`OrderController.java:48`), `SHA-256` digest, HTTP status (`HTTP 400`, `HTTP 403`), và các chỉ số `p95 Latency`, `CPU/RAM`, điểm `0.00 / 10`.

| Cấp độ | Kích thước & Weight | Line-height / Tracking | Phạm vi sử dụng |
| :--- | :--- | :--- | :--- |
| **Display H1 (Landing)** | `clamp(2.25rem, 4vw, 3.25rem)` · `700` | `1.10` / `-0.03em` | Tiêu đề chính trang `/` |
| **Page Title (H1 Portal)** | `1.5rem` (`24px`) · `600` | `1.25` / `-0.02em` | Tiêu đề `/courses`, `/roadmap`, `/lab`, `/workspaces` |
| **Section Heading (H2)** | `1.125rem` (`18px`) · `600` | `1.35` / `-0.015em` | Tiêu đề từng khu vực / bước trong Lab |
| **Card Title (H3)** | `1rem` (`16px`) · `600` | `1.40` / `-0.01em` | Tên lớp học, tên bài Lab, tên Panel |
| **Reading Body (Theory)** | `0.9375rem` (`15px`) · `400` | `1.70` / `0` · `max-w-[68ch]` | Nội dung bài giảng lý thuyết Bước 2 kiểu Stripe Docs |
| **UI Body / Control** | `0.875rem` (`14px`) · `400–500` | `1.50` / `0` | Nút bấm, menu sidebar, nội dung form, bảng |
| **Micro / Badge / Label** | `0.75rem` (`12px`) · `500–600` | `1.35` / `+0.02em` | Badge trạng thái, caption KPI, nhãn cột |

---

## 4. Spacing, Layout, Bo góc & Elevation

### 4.1. Thang Khoảng cách & Bo góc
- **Hệ lưới `4px`:**
  - Khoảng cách nội bộ control: `gap-2` (`8px`).
  - Khoảng cách giữa các phần tử trong card: `space-y-3` (`12px`) hoặc `space-y-4` (`16px`).
  - Khoảng cách giữa các card trên lưới: `gap-4` (`16px`) đến `gap-5` (`20px`).
  - Khoảng cách giữa các section chính: `space-y-6` (`24px`) trên Portal; `py-16`–`py-20` trên Landing Page.
- **Bo góc thống nhất:**
  - `rounded-lg` (`8px`): Button, Input, Select, Tab trigger.
  - `rounded-xl` (`12px`): Card khóa học, Panel phân tích, Thẻ KPI, Alert box.
  - `rounded-2xl` (`16px`): Hero Surface, Dialog / Modal, Interactive Demo Frame.
  - `rounded-full`: Status Pill, Step number circle, Avatar, Notification count.

### 4.2. Elevation (Độ nổi chuẩn Linear/Vercel)
- **Mặc định:** `border border-border` sắc nét `1px` + `shadow-xs` (`--shadow-low`). Không dùng bóng đậm gây bẩn nền sáng.
- **Interactive Card Hover (chuẩn ForumFlash):**
  - `transition-[transform,border-color,box-shadow] duration-150 ease-out`
  - Hover: `hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm`.
- **Overlay / Modal / Popover:** `shadow-lg` + nền backdrop mờ nhẹ (`backdrop-blur-xs`).

---

## 5. Chuẩn hóa Thành phần Cốt lõi (Component Patterns)

### 5.1. Course Card kiểu ForumFlash (`/courses`)
- Chiều cao đồng đều trên cùng hàng lưới (`flex h-full flex-col justify-between`).
- Cấu trúc 4 tầng gọn mắt, không chữ thừa:
  1. **Top Row:** Badge mã lớp (`font-mono text-xs`) bên trái + Status dot (`Đang hoạt động`) bên phải.
  2. **Identity:** Tên lớp học (tối đa 2 dòng, `line-clamp-2`) + dòng metadata gọn (`Giảng viên · N thành viên`).
  3. **Progress Block:** Thanh tiến độ mảnh (`h-1.5 rounded-full bg-muted` với fill `bg-primary` hoặc `bg-emerald-500`), ghi rõ `X/Y Labs (Z%)` + pill gợi ý *Bài tiếp theo* (nếu có).
  4. **Footer Actions:** 1 nút Primary CTA (`Vào lớp học` / `Tiếp tục học`) + 1 nút Secondary gọn (`Điểm & Bài nộp`).

### 5.2. Horizontal 4-Stage Stepper Bar (`/lab`)
- **Duy nhất 1 thanh ngang** dính ở đầu vùng làm việc (`sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b`).
- Hiển thị chính xác 4 bước tuần tự chuẩn `BM04`:
  - `1. Kiến trúc Tĩnh` · `2. Lý thuyết & Quiz` · `3. Live Runtime` · `4. MAVIS Studio & Nộp bài`.
- 4 trạng thái trực quan:
  - **Completed:** Nền xanh lá nhạt (`bg-success-subtle`), dấu tích `CheckCircle2`, bấm quay lại xem bất cứ lúc nào.
  - **Active:** Nền `bg-primary/10`, viền `border-primary`, chữ đậm `text-primary`.
  - **Available:** Nền `bg-card`, viền `border-border`, hover sáng nhẹ.
  - **Locked:** Độ mờ `opacity-60`, icon `Lock`, cursor `not-allowed`, có tooltip/chú thích rõ điều kiện mở khóa (ví dụ: *"Đạt Quiz Gate ≥ 70% ở Bước 2 để mở khóa Bước 3"*).

### 5.3. Nút điều khiển MAVIS Studio (Chống vỡ chữ ở `1366×768` & Mobile)
- Mọi nút thao tác container (`Dừng`, `Khởi động`, `Nhân bản`, `Xóa`, `Scale`) bắt buộc có `whitespace-nowrap shrink-0` và bố trí theo lưới `grid-cols-2 gap-2` (hoặc `flex-wrap`) — **cấm tuyệt đối** tình trạng chữ `"Khởi động"` bị gãy xuống 2 dòng tràn viền như bản cũ.

### 5.4. Side-by-Side Grading Layout (`/submissions/[submissionId]`)
- Desktop (`lg+`): Lưới `grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)] gap-6 items-start`.
  - **Trái:** Gói minh chứng bất biến (`SHA-256` badge, Chứng chỉ Quiz, từng Snapshot PNG + Giải trình của sinh viên, `RuntimeReceipt` Before/After).
  - **Phải (`lg:sticky lg:top-20`):** Bảng chấm từng Snapshot thang `0.00–10.00` kèm phản hồi tức thì (`> 5.0 ĐẠT` / `≤ 5.0 CẦN SỬA`), khung nhận xét tổng bắt buộc và nút phát hành kết quả (`BR-10`).

---

## 6. Motion & Micro-Interactions (`Tailwind CSS v4 + tw-animate-css`)

Không cài thêm `framer-motion` (giữ bundle gọn, bảo toàn `package-lock.json` cho CI):
- **Duration chuẩn:** `150ms` cho hover/focus/button press; `200ms` cho chuyển tab/accordion/modal; `1.8s linear infinite` cho hiệu ứng gói tin chạy dọc cạnh đồ thị ở Hero Landing Page.
- **Tôn trọng A11y:** Mọi animation tùy chỉnh bắt buộc bọc trong `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`.

---

## 7. Quy chuẩn Kiểm định Chất lượng UI (`Audit & Polish Checklist`)

Trước khi hoàn tất bất kỳ Wave nào, kiểm tra bắt buộc 6 tiêu chí:
1. **Desktop `1366×768` & `1440×900`:** `0` thanh cuộn ngang ngoài ý muốn, `0` nút bị cắt chữ hay gãy dòng xấu.
2. **Mobile `390×844`:** Navbar gọn, thẻ xếp 1 cột, Stepper 4 bước cuộn ngang mượt hoặc thu gọn số bước + tên bước hiện tại.
3. **Light Mode & Dark Mode:** Kiểm tra đầy đủ tương phản chữ, viền card, đồ thị và badge trên cả 2 chế độ.
4. **Song ngữ `VI` & `EN` (`N6`):** Chuyển đổi nút `VI / EN` kiểm tra 100% nhãn đều đổi đồng bộ, không sót chuỗi hardcoded.
5. **RBAC UI Hygiene (`N2`):** Tài khoản Student không thấy bất kỳ nhãn *"Không gian giảng dạy"* hay lối vào *"Free Studio Sandbox"* nào.
6. **Exception UX (`DS-01b` → `DS-04b`):** Mọi trạng thái lỗi (Passkey sai, Lab khóa, Quiz rớt `NEEDS_RETRY`, Docker Preflight fail, chưa Stop/Scale khi chốt Receipt, chấm điểm `≤ 5.0` hoặc thiếu nhận xét tổng) đều hiển thị Alert rõ nguyên nhân và chỉ dẫn bước tiếp theo.
