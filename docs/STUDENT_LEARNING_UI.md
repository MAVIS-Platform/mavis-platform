# Hướng dẫn luồng sinh viên MAVIS — LMS và Lab

Cập nhật 17/11/2026. Tài liệu này mô tả cách dùng các màn hình sinh viên sau đợt refactor giao diện. UI chỉ trình bày trạng thái và điều kiện do API trả về; không thay thế các gate của backend.

## 1. Khóa học của tôi

Mở `/courses` để xem các lớp đã ghi danh. Mỗi dòng lớp hiển thị mã lớp, trạng thái, giảng viên, vai trò, tiến độ Lab đã đạt và bài đang mở tiếp theo nếu roadmap có dữ liệu. Chọn **Tiếp tục học** để vào lộ trình của lớp hoặc **Bài nộp của tôi** để xem các bài đã gửi trong đúng lớp.

Chọn **Tham gia lớp** để mở form Passkey. Mã phải có đúng định dạng do API yêu cầu; khi đang gửi, form bị khóa và lỗi backend được hiển thị để thử lại. Link `/courses#course-passkey` vẫn mở form và đưa focus về khu vực nhập mã. Sau khi ghi danh thành công, danh sách lớp được tải lại và người học được đưa tới roadmap của lớp vừa tham gia.

Khu **Tài liệu tham khảo: Java và C#** được thu gọn để không che danh sách lớp. Nội dung giáo trình chỉ tải khi người học mở khu này. Sandbox tự do được đặt riêng với tên rõ ràng; không dùng nó thay cho lối vào Studio Live của một Lab.

## 2. Không gian lớp

Mở lớp từ roadmap để xem breadcrumb, mã lớp, trạng thái lớp và nội dung Course đã publish. Sinh viên chỉ thấy các mục **Nội dung lớp** và **Bài nộp**; các mục Thành viên, Kết quả và công cụ soạn bài dành cho giảng viên không xuất hiện trong class shell của sinh viên.

Danh sách nội dung được nhóm theo module. Module có hoạt động đang mở sẽ được mở sẵn; các module khác có thể thu gọn. Mỗi activity hiển thị loại, tên, trạng thái và hành động. Lab bị khóa vẫn không có link mở qua frontend và nêu lý do tiên quyết từ roadmap. Với lớp cũ chưa có Course snapshot, danh sách Lab trong roadmap được dùng làm fallback.

Bài THEORY có thể mở phần đọc ngay trong activity và dùng Markdown đã được sanitize bởi thành phần hiển thị hiện có. Việc mở hoặc đọc nội dung không tự ghi nhận bài đã hoàn thành và không chuyển Lab sang PASSED.

## 3. Không gian Lab

Từ activity mở `/lab?workspace=...&assignment=...&step=...`. Breadcrumb giữ ngữ cảnh **Lớp → Module → Lab**. Mục lục Lab kiểu Coursera nằm cạnh vùng nội dung trên màn hình lớn và có thể mở/thu gọn trên mobile.

### Ánh xạ 4 chặng logic (`BM01/BM04`) ↔ 3 bước giao diện hợp nhất

| Chặng logic cam kết | Vị trí UI hiện hành | Nội dung chính |
|---|---|---|
| **Stage 1 · Static Architecture & 3E** | `/lab?step=1` (`Static Studio`) | Sơ đồ tĩnh `C1–C3`, Dependency Graph, Reverse BFS, AI Tutor 3E, nút **`Download Reference .zip`** (`/api/backend/assignments/{id}/reference-source`) |
| **Stage 2 · Theory & Quiz Gate** | `/roadmap` (Theory/Quiz) & `/lab?step=1` (`THEORY_ONLY`) | Bài đọc Markdown (`MarkdownPreview`) cho cả activity `THEORY` lẫn Lab `THEORY_ONLY`, và Quiz Gate tự chấm mở khóa `runtimeUnlocked=true` |
| **Stage 3 · Live Docker Runtime Studio** | `/lab?step=2` (`MAVIS Runtime Studio`) | Mở Studio Live full-screen thao tác Docker thật (`STOP/START/SCALE/PAUSE/RESUME/THROTTLE_CPU/SET_LOAD`), chụp Snapshot & `Finish Studio` |
| **Stage 4 · Evidence Review & Submission** | `/lab?step=3` (`Evidence Review` & `#lab-submit`) | Kiểm tra receipt SHA-256, nộp giải trình WF-04 và theo dõi điểm chấm từng Snapshot `> 5.0/10` |

Bước Runtime chỉ mở khi Lab yêu cầu runtime và Quiz hiện hành trả `runtimeUnlocked=true`; UI lấy `version` và `passPercent` từ API, không hardcode ngưỡng. Lab `THEORY_ONLY` hiển thị trực tiếp nội dung đọc Markdown ở Bước 1 và bỏ qua bước Runtime.

Guided Lab luôn dùng source snapshot, assignment, model và topology đã được backend ghim. Sinh viên có thể tải tệp nén nguồn tham chiếu qua nút **Download Reference .zip**, nhưng không được nhập source ngoài (`403`). Các trạng thái build, queued, starting, running, failed, thiếu dữ liệu và receipt đều đọc trực tiếp từ runtime API; UI không tạo telemetry hoặc Before/After giả.

## 4. Nộp bài và kết quả

Nút chuyển sang nộp bài chỉ mở khi các bằng chứng bắt buộc của Lab đã đủ. Với Lab v2 (`THEORY_QUIZ` và `THEORY_QUIZ_STUDIO`), `LabSubmissionV2` (`lab-submission-v2.tsx`) cho phép nộp giải trình ngay trong Lab mà không cần chọn model hay diagram, tự gắn phiên Studio đã xác minh (nếu Lab yêu cầu runtime), lưu nháp cục bộ theo khóa `(userId, workspaceId, assignmentId)` qua reload trình duyệt, tự xóa nháp khi nộp thành công và nạp lại nội dung cũ khi bấm **Sửa và nộp lại** (**Revise and resubmit**). Với Lab legacy, `SubmissionComposer` giữ workspace, assignment, project, model và session; các snapshot Studio đã xác minh được đưa vào payload. Nếu gửi lỗi, nội dung đang soạn vẫn ở trong form để thử lại.

Màn hình **Bài nộp của tôi** có thể lọc theo lớp và Lab khi URL có `workspace` hoặc `assignment`, và trang chi tiết bài nộp (`FrozenArtifacts`) hiển thị đầy đủ gói chứng từ SHA-256, Quiz Gate proof cùng giải trình từng phần ngay cả khi bài v2 không có sơ đồ đính kèm (`diagramVersionId = null`). Sinh viên chỉ đọc bài nộp của mình và review đã công bố. Bản review nháp của giảng viên không được hiển thị.

Kết quả cần phân biệt: chưa nộp, đã nộp/chờ chấm, cần sửa và đạt. Với Guided Lab, backend chấm từng snapshot; mọi snapshot phải đạt nghiêm ngặt lớn hơn `5.0/10` và review phải có summary để chuyển PASSED. Điểm trung bình không được dùng để vượt quy tắc này. Trạng thái NEEDS_REVISION dẫn người học quay lại đúng Lab để nộp lại; Lab kế tiếp chỉ mở khi backend xác nhận PASSED.

## 5. Kiểm tra nhanh

Có thể kiểm tra giao diện bằng `npm run typecheck` và `node --test tests/course-learning-ui.test.cjs tests/runtime-planning.test.cjs tests/studio-live-capabilities.test.cjs`. Browser fixture giảng viên hiện có ở `tests/lecturer-lms.browser.cjs`; nghiệm thu hai tài khoản sinh viên/giảng viên trên staging và Docker Live thật vẫn cần môi trường được phép, không được suy ra từ fixture UI.
