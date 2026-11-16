# Hướng dẫn giảng viên soạn Lab — giao diện LMS + Coursera

Cập nhật 16/11/2026. Tài liệu này mô tả giao diện giảng viên sau refactor: lớp học theo phong cách LMS và bài Lab theo phong cách Coursera. Contract backend, bốn bước Lab, Quiz Gate, runtime lifecycle và luật chấm `> 5.0/10` không thay đổi.

## 1. Danh sách lớp và không gian lớp

1. Mở `/workspaces`.
2. Nút **Create class / Tạo lớp** mở form ngắn gồm mã lớp và tên lớp. Danh sách lớp hiển thị mã, tên, trạng thái, số thành viên và vai trò.
3. Mở một lớp để vào `/workspace-overview?workspace=...`.

Header lớp có bốn tab:

| Tab | Đường dẫn | Nội dung |
|---|---|---|
| **Class content / Nội dung lớp** | `/workspace-overview?workspace=...` | Lộ trình chương → hoạt động |
| **Members / Thành viên** | `/members?workspace=...` | Danh sách, thêm/xóa thành viên, thiết lập lớp |
| **Submissions / Bài nộp** | `/submissions?workspace=...` | Chọn Lab, xem bài nộp, mở chấm |
| **Results / Kết quả** | `/submissions?workspace=...&view=results` | Bài nộp và kết quả đã chấm |

Tab nội dung có ba chế độ:

- **Roadmap / Lộ trình**: các module và activity. Activity lý thuyết, Quiz, tự luận và Lab có nhãn riêng. Lab hiển thị trạng thái thật từ course roadmap (`PASSED`, `UNLOCKED`, `LOCKED` hoặc `Draft`).
- **Authoring / Soạn nội dung**: Course Builder.
- **Setup / Thiết lập**: Course setup checklist, runtime readiness, Passkey và freeze topology.

## 2. Soạn cấu trúc khóa học

Trong **Authoring**:

1. Lưu tên/mô tả Course.
2. Thêm module với tên, mô tả và module tiên quyết (chỉ chọn module đứng trước).
3. Trong mỗi module:
   - **THEORY**: nhập **Theory content / Nội dung lý thuyết** dạng văn bản. Sinh viên đọc nội dung này ở Bước 2 của Lab.
   - **ESSAY**: nhập đề và rubric (mỗi dòng `tiêu chí | điểm tối đa`).
   - **QUIZ / STATIC_LAB / IMPACT_LAB / RUNTIME_LAB**: chọn Lab liên kết. `RUNTIME_LAB` chỉ liệt kê Lab có `requireRuntimeTrace`.
4. Dùng **Move up / Move down** để sắp xếp module và activity; **Edit** để sửa; **Delete** để xóa activity (có xác nhận).
5. **Publish course version** tạo snapshot bất biến. Sau khi publish, bấm **Start new draft** để sửa tiếp. Version đã publish không bị thay đổi.

Backend chỉ cho sửa cấu trúc khi Course ở `DRAFT`. Course `PUBLISHED` hoặc `ARCHIVED` trả `409`.

## 3. Tạo Lab, lý thuyết, repo mẫu và Quiz

1. Vào **Class content → Roadmap** hoặc `/assignments?workspace=...`.
2. Bấm **Create a Lab / Tạo Lab**.
3. Điền thông tin Lab, hạn nộp, hướng dẫn; chọn **Reference version** đã phân tích (GitHub commit hoặc ZIP snapshot); chọn yêu cầu minh chứng và góc nhìn kiến trúc.
4. Lưu nháp. Lab chưa publish không hiển thị với sinh viên.
5. Công bố Lab bằng **Publish as lab**, sau đó cấu hình runtime và **Freeze Studio topology** cho Lab cần runtime.
6. Công bố Quiz có phiên bản bằng Curriculum Publisher hoặc quiz tùy chỉnh. Quiz Gate mặc định 70% nếu chưa cấu hình khác.
7. Cấp Passkey trong **Setup** hoặc `/roadmap?workspace=...#course-passkey`.

## 4. Xem trước và công bố

- Trong form sửa Lab có **Preview as student / Xem trước như sinh viên**. Nút mở `/lab?...&step=1&preview=1`.
- Preview là **read-only**:
  - Không tạo lượt Quiz.
  - Không tạo runtime session.
  - Không chụp snapshot, không nộp bài.
- Giảng viên vẫn xem được breadcrumb, mục lục, tiến độ, lý thuyết đã publish, Quiz Gate và điều kiện mở khóa.
- Nút **Exit preview / Thoát xem trước** quay lại chế độ soạn.

## 5. Giao diện Lab của sinh viên

- Breadcrumb: **Lớp → Module → Lab**.
- Sidebar **Lab contents** gồm tiến độ, bốn bước và activity của module.
- Bốn bước giữ nguyên:
  1. Static architecture C1–C3.
  2. Theory, impact và Quiz Gate.
  3. Runtime observation.
  4. MAVIS Studio evidence.
- Bước bị khóa ghi rõ lý do backend (Quiz chưa đạt hoặc thiếu runtime evidence).
- Nút **Previous step / Next step** giữ workspace, assignment và preview context.

## 6. Chấm bài và phản hồi

1. Vào **Submissions** của lớp, chọn Lab cần chấm.
2. Bảng hiển thị sinh viên, Lab, model đã đóng băng, kết quả, phản hồi và thời điểm nộp.
3. **Open review** mở màn hình chấm; quay lại bằng **Back to class submissions**.
4. Guided Lab vẫn yêu cầu điểm từng snapshot và mọi snapshot phải `> 5.0/10`; `summary` bắt buộc khi công bố. Auto-unlock do backend quyết định.

## 7. Ghi chú kỹ thuật

- BFF `app/api/backend/[...path]/route.ts` đã export thêm `PUT`, `PATCH`, `DELETE`; trước đó proxy chỉ có `GET`/`POST` nên các thao tác lưu nháp, sửa/xóa course item và chấm điểm bằng PUT/DELETE bị `405`.
- Sắp xếp module kiểm tra lại quan hệ tiên quyết: không cho đưa module có prerequisite lên trước module tiên quyết của nó.
- Preview của giảng viên bỏ qua điều kiện roadmap `LOCKED` để xem được Lab chưa mở, nhưng vẫn không tạo Quiz attempt/session/submission.
- `IMPACT_LAB` mở ở Bước 2 (Theory, impact và quiz); `RUNTIME_LAB` mở Bước 3; `STATIC_LAB` mở Bước 1.

## 8. Giới hạn contract hiện hành

- **Bộ lọc trạng thái bài nộp** chưa có trong API `assignmentSubmissions`; UI chỉ lọc theo Lab và tìm theo sinh viên. Không hiển thị filter giả.
- **`runnerReady`** hiện là điều kiện cấu hình của profile (`ConfigurationView.ready()`), chưa phải health check Runner thật. UI ghi "Runner / images: ready" theo API và không nâng thành "đã chạy thật".
- **THEORY completion** không được suy ra: giao diện chỉ hiển thị tài liệu, không đánh dấu hoàn thành giả.
- **Nghiệm thu hai tài khoản trên staging** chưa chạy trong phiên này.

## 9. Kiểm chứng đã chạy

```bash
cd MAVIS-Frontend
npm run typecheck
npm test                 # 409/409 PASS
npm run build            # PASS
npm run start -- --hostname 127.0.0.1 --port 3092
npm run test:routes -- http://127.0.0.1:3092   # 43 routes, 0 failure
npm run test:lecturer-lms                      # PASS + screenshots
```

Screenshot:

- `.artifacts/lecturer-lms/class-content.png`
- `.artifacts/lecturer-lms/lab-coc.png`

Backend:

```bash
cd MAVIS-Platform/mavis-be
./mvnw.cmd -pl mavis-platform -am -Dtest=CourseAuthoringServiceTest -Dsurefire.failIfNoSpecifiedTests=false test
# 14/14 PASS; full mavis-platform + mavis-common: 221 tests, 0 failure
```

Real Docker Runner và nghiệm thu staging vẫn là hạng mục môi trường riêng.
