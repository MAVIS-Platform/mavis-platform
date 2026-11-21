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

## 3. Tạo Lab trong Lab Authoring workspace

`/assignments` giờ chỉ là danh sách Lab của lớp. Các thao tác công bố, freeze, Quiz, Studio và xem trước không còn nằm lẫn trong danh sách.

1. Vào `/assignments?workspace=...`.
2. Bấm **Create a Lab / Tạo Lab** để mở `/lab-authoring?workspace=...`.
3. Làm theo sáu bước trong sidebar:

| Bước | Nội dung |
|---|---|
| **1. Lab information** | Tên, hạn nộp, hướng dẫn/mục tiêu/tiêu chí. Chọn **Theory Only**, **Theory + Quiz** hoặc **Theory + Quiz + Studio** (`V38`). Không còn chọn diagram/model. Lưu được **draft không cần nguồn tham chiếu**. |
| **2. Theory** | Lesson Markdown + preview, repo mẫu (commit/snapshot/revision + ZIP), C1–C3 read-only và dependency graph; chọn module, thêm/sửa bài học. Nếu Course đã publish, bấm **Start new Course draft** trước khi sửa. |
| **3. Reference source** | Import GitHub commit SHA hoặc ZIP, chạy phân tích, chọn model version rồi **Save source to Lab**. |
| **4. Quiz** | Quiz Builder đầy đủ: soạn tay, import/export JSON/CSV, question bank, preview, version. Mặc định đạt **80%**. |
| **5. Studio Live** | Xem runtime readiness, **Configure Exercise & Templates** / **1-Click Exercise Templates** (đặt nổi bật ngay trên Bước 5), **Start Live session** hoặc **Open MAVIS Studio**; công bố Lab rồi **Freeze Studio topology**. |
| **6. Check & publish** | Checklist Lab thật (source, theory, Quiz, Studio, publish), nút publish/freeze, preview và Course Setup Panel đầy đủ. |

4. Lab chưa publish không hiển thị với sinh viên.
5. Sinh viên **không nộp diagram/model**: C1–C3 chỉ là nội dung lý thuyết; submission mới (lý thuyết + Quiz + Studio) thuộc Phase 4 của big update.
6. Quiz Gate mặc định **80%** cho phiên bản mới; Quiz cũ giữ ngưỡng đã publish. Freeze topology dùng V34 và chỉ áp dụng cho Lab đã publish.
7. Cấp Passkey trong **Setup** hoặc `/roadmap?workspace=...#course-passkey`.

### Quiz Builder (Phase 2)

Trong bước **4. Quiz** có các tab:

- **Questions**: thêm/sửa/xóa/duplicate/sắp xếp câu hỏi; chọn một hoặc nhiều đáp án đúng; nhập explanation và points.
- **Preview**: xem đề và đáp án đúng như giảng viên.
- **Import / Export**: nhập JSON hoặc CSV, tải file, xuất JSON/CSV; có báo lỗi theo từng câu. Có thể nạp một chapter curriculum vào draft để sửa tiếp.
- **Question bank**: lưu câu hỏi tái sử dụng và thêm lại vào Quiz.
- **Versions**: xem các phiên bản đã publish, ngưỡng đạt và thời điểm.

Hỗ trợ `SINGLE_CHOICE`, `MULTI_CHOICE`, `TRUE_FALSE`. Học sinh thấy radio/checkbox tương ứng và explanation sau khi nộp.

### Studio Live (Phase 3)

- Khi chưa có reference source: card nhắc gắn/phân tích nguồn và nút chuyển sang **Reference source**.
- Khi có source:
  - **Configure runtime & Studio Live** mở `/runtime-config?project=...`.
  - **Prepared Live blocks and connections** là builder trực quan: thêm block, nhãn, `canScale`, `initiallyStopped`; thêm kết nối from/to/route-controller/protocol; xem JSON nâng cao; lưu vào `studioTopology`.
  - `studioTopology` được giữ nguyên khi giảng viên lưu lại runtime configuration hoặc chạy scenario; trước đây thao tác này làm mất topology đã chuẩn bị.
  - **Configure runtime & Studio Live** mang thêm `assignment=...`; context này đi tiếp qua `/scenarios` và `/sessions`, nên session tạo ra được gắn đúng Lab.
  - **Start Live session** mở `/sessions?project=...&assignment=...&model=...&studio=1&returnTo=...` khi runtime profile đã configured; nếu chưa, nút bị disable kèm lý do.
  - **Open MAVIS Studio** mở `/studio?project=...&assignment=...&model=...&returnTo=...`; Studio tự chọn project và session RUNNING mới nhất.
  - Session được tạo từ Lab lưu `assignment_id` (V37), nên danh sách session có thể lọc đúng Lab.
  - Sau khi Lab publish, nút **Freeze Studio topology** gửi `sessionId` của session đã xác minh; backend chỉ chấp nhận session đúng assignment/source/model và có bằng chứng Stop/Start/Scale.
- `/studio` Live có project selector; nếu chưa chọn project thì hiển thị cảnh báo và không tạo phiên.
- Exit Studio quay lại đúng `returnTo` thay vì trang admin.
- `runnerReady` vẫn là điều kiện cấu hình profile; UI không tuyên bố đã chạy Docker thật.

**Course tools** (seed curated Labs, Course setup checklist) nằm trong một panel riêng trên `/assignments`, không trộn với nút **Create a Lab**.

## 4. Xem trước và công bố

- Preview có ở header Lab Authoring và bước **Check & publish**; mở `/lab?...&step=1&preview=1`.
- Preview là **read-only**:
  - Không tạo lượt Quiz.
  - Không tạo runtime session.
  - Không chụp snapshot, không nộp bài.
- Preview bỏ qua điều kiện roadmap `LOCKED` để giảng viên xem được Lab chưa mở, nhưng vẫn hiển thị lý do khóa thật.
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
3. **Open review** mở màn hình chấm; quay lại bằng **Back to class submissions**. `GradeForm` hiển thị nguyên văn `writtenExplanation` của từng Snapshot/section ngay trên ô nhập điểm `0..10`, đồng thời giữ lại nháp điểm đang nhập nếu phiên làm mới gặp xung đột `409` và tự đồng bộ `expectedRevision`.
4. Guided Lab vẫn yêu cầu điểm từng snapshot và mọi snapshot phải `> 5.0/10`; `summary` bắt buộc khi công bố. Auto-unlock do backend quyết định.

## 7. Ghi chú kỹ thuật

- BFF `app/api/backend/[...path]/route.ts` đã export thêm `PUT`, `PATCH`, `DELETE`; trước đó proxy chỉ có `GET`/`POST` nên các thao tác lưu nháp, sửa/xóa course item và chấm điểm bằng PUT/DELETE bị `405`.
- Sắp xếp module kiểm tra lại quan hệ tiên quyết: không cho đưa module có prerequisite lên trước module tiên quyết của nó.
- Preview của giảng viên bỏ qua điều kiện roadmap `LOCKED` để xem được Lab chưa mở, nhưng vẫn không tạo Quiz attempt/session/submission.
- `IMPACT_LAB` mở ở Bước 2 (Theory, impact và quiz); `RUNTIME_LAB` mở Bước 3; `STATIC_LAB` mở Bước 1.
- `CourseAccessService.publish` là idempotent trên Lab đã publish: giữ nguyên `studioTopologySnapshot` / `studioTopologyRevision` đã đóng băng và chỉ làm mới khi giảng viên gọi rõ **Freeze topology**.
- `CourseSetupService` tổng hợp độ sẵn sàng trên toàn bộ danh sách Lab & reference project thay vì chỉ kiểm tra reference đầu tiên.

## 8. Giới hạn contract hiện hành

- **Bộ lọc trạng thái bài nộp** chưa có trong API `assignmentSubmissions`; UI chỉ lọc theo Lab và tìm theo sinh viên. Không hiển thị filter giả.
- **`runnerReady`** hiện là điều kiện cấu hình của profile (`ConfigurationView.ready()`), chưa phải health check Runner thật. UI ghi "Runner / images: ready" theo API và không nâng thành "đã chạy thật".
- **THEORY completion** không được suy ra: giao diện chỉ hiển thị tài liệu, không đánh dấu hoàn thành giả.
- **Submission v2 (`V38__Submission_V2_Lab_Mode.sql`: `THEORY_QUIZ`, `THEORY_QUIZ_STUDIO`)** đã hoàn thiện xuyên suốt DB/BE/FE (`lab-submission-v2.tsx`, `frozen-artifacts.tsx`, `grading.tsx`); Lab `LEGACY` vẫn giữ flow model/diagram cũ.
- **Real Docker Runner/Studio đã PASS ngày 17/11/2026**: STOP/START payment và SCALE orders 1→2, Before/After snapshot, HMAC receipt, cleanup `CONFIRMED`, 0 orphan. **Web production với hai tài khoản thật vẫn cần chạy.**
- **`runnerReady`** không phải health check trực tiếp; Start Live session chỉ bật khi profile configured, không đảm bảo Docker đã chạy.
- **V37** thêm `runtime_sessions.assignment_id`; session cũ không có assignment vẫn hợp lệ. Freeze topology có `sessionId` sẽ fail closed nếu session không khớp Lab/source/model hoặc chưa verified.
- **Web self-test 17/11/2026 đã chạy** với backend local + PostgreSQL 16 + Chrome + `MAVIS.Runner` managed + Docker: lecturer tạo lớp/Lab/Theory/Quiz/Studio topology, publish Lab, freeze topology; student làm Quiz và đạt `PASSED`. Session web gắn `assignment_id` đã STOP/START/SCALE payment thật (1→2 container), Finish trả `COMPLETED / PASSED / CONFIRMED`, receipt HMAC `sha256:6fb1d01b…`, 0 container còn lại. Đây là nghiệm thu web local, chưa phải hai tài khoản trên production.
- ZIP do Windows tạo với dấu `\` giờ được nhận là thư mục; trước đây bị giải nén thành file 0 byte và làm analysis thất bại.

### Bằng chứng real Docker (17/11/2026)

- `RuntimeStudioApiIntegrationTest#realManagedDotnetRunnerAndDockerFullStackStudioFlow`: **1/1 PASS**.
- Docker Desktop Linux 29.1.5; .NET SDK 10.0.403; PostgreSQL 16 cô lập.
- STOP payment: error rate 0% → 100%; START: 100% → 0%; SCALE orders: 1 → 2 replicas.
- Receipt digest `sha256:7520f81270b3e1261845b6665ea978a36d6244db24d72f587d6e347662a1d50f`.
- Evidence package digest `sha256:bc2ca437f9a306636ecf40c91c5e8d6863ab9dc5fa1129ddfe6f92a02d57cf81`.
- Cleanup `CONFIRMED`; no `mavisrun-*` containers left.

## 9. Kiểm chứng đã chạy

```bash
cd MAVIS-Frontend
npm run typecheck
npm test                 # 417/417 PASS
npm run build            # PASS
npm run start -- --hostname 127.0.0.1 --port 3092
npm run test:routes -- http://127.0.0.1:3092   # 44 routes, 0 failure
npm run test:lecturer-lms                      # PASS + screenshots
```

Screenshot:

- `.artifacts/lecturer-lms/class-content.png`
- `.artifacts/lecturer-lms/lab-coc.png`
- `.artifacts/lecturer-lms/assignments.png`
- `.artifacts/lecturer-lms/lab-authoring.png`
- `.artifacts/lecturer-lms/lab-theory.png`
- `.artifacts/lecturer-lms/lab-quiz.png`
- `.artifacts/lecturer-lms/lab-studio.png`

Backend:

```bash
cd MAVIS-Platform/mavis-be
./mvnw.cmd -pl mavis-platform -am -Dtest=CourseAuthoringServiceTest,CourseQuizServiceTest,QuizBankServiceTest -Dsurefire.failIfNoSpecifiedTests=false test
# CourseAuthoring 14/14, CourseQuiz 8/8, QuizBank 2/2, CourseAccess 6/6; full platform+common+analyzer: 674 tests, 0 failure, 14 environment skips
```

Real Docker Runner và nghiệm thu staging vẫn là hạng mục môi trường riêng.
