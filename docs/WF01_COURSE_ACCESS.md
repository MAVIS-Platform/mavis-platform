# WF-01 · Lớp học, Passkey và quyền Lab

Hợp đồng mục tiêu cho các chặng triển khai WF-01. Checkout đối chiếu là `435d9b7`. Các endpoint mới được phát hành theo từng PR.

## Quy tắc nghiệp vụ

- Giảng viên của lớp hoặc quản trị viên gán mô hình và nguồn đã công bố cho assignment. Nguồn GitHub phải có commit SHA đầy đủ. Nguồn ZIP phải có SHA-256 và đường dẫn lưu trữ. Khi công bố Lab, máy chủ cấp số thứ tự tiếp theo và cố định nguồn tham chiếu cho Lab đó.
- Công bố Lab đầu tiên bật chế độ học tuần tự của lớp. Lớp chưa công bố Lab dùng luồng assignment hiện hành. Sinh viên trong lớp tuần tự tạo dự án từ nguồn đã gán, tải ZIP qua assignment và phân tích snapshot của dự án. Dự án cá nhân tiếp tục sử dụng GitHub và ZIP.
- Passkey chỉ hiển thị khi cấp, có hiệu lực từ 1 đến 168 giờ. Đổi mã hủy hiệu lực của mã trước. Thu hồi và hết hạn dừng ghi danh mới. Tài khoản đã ghi danh giữ quyền của mình. Nhật ký lưu hành động quản lý, ID người thao tác và đối tượng.
- Khi ghi danh thành công, Lab đầu mở trong cùng giao dịch. Với các Lab sau, API kiểm tra thành viên lớp và kết quả đạt của toàn bộ Lab trước. Roadmap và tài nguyên Lab áp cùng điều kiện. Lớp lưu trữ dừng ghi danh và dừng truy cập Lab của sinh viên.

## Hợp đồng C01 và C05

Các endpoint bên dưới dùng tiền tố `/api/v1` và nhận JWT ở backend. Next.js lấy JWT từ cookie HttpOnly và giới hạn danh sách đường dẫn BFF.

| HTTP | Đường dẫn | Kết quả hoặc dữ liệu gửi |
|---|---|---|
| GET | `/workspaces/{workspaceId}/course-roadmap` | `guided`, `enrollmentStatus`, `labs[]` với `assignmentId`, `position`, `title`, `state`, `reason` |
| POST | `/workspaces/{workspaceId}/course-labs/seed-curated` | `CourseLabSeederService`: nhận `{ "preset": "STANDARD_DEMO" \| "FULL_CURRICULUM" }` (mặc định `STANDARD_DEMO`), khởi tạo idempotent nguồn mẫu `TEACHER_REFERENCE` đa service Spring Boot + C# ASP.NET Core (`inventory-service`, `Orders/Program.cs`, `Catalog/Program.cs`), ZIP + SHA-256, `ModelVersion`, 4 sơ đồ tĩnh (`C4/CONTEXT`, `DEPENDENCY_GRAPH/SERVICE`, `C4/CONTAINER`, `C4/COMPONENT`), `EvaluationRun`, chế độ `STANDARD_DEMO` (3 Lab: `java-04`, `java-07`, `csharp-13`) hoặc `FULL_CURRICULUM` (13 Lab: `java-01..12` + `csharp-13`), được mở khóa trực tiếp qua Next.js BFF `allowedBackendPath` (`COURSE_LABS_SEEDED_CURATED`) |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/publish` | Lab đã công bố. Gửi lại cùng assignment trả số Lab đã cấp; nếu reference runtime profile đã có `studioTopology`, publish cũng đóng băng topology |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/freeze-topology` | Đóng băng `studioTopology` hiện tại của reference project vào Lab đã publish. Yêu cầu runtime config khớp source/model; lưu vào `assignments.studio_topology_snapshot` |
| GET | `/analyzer/projects/{projectId}/runtime-setup-readiness` | Readiness thật của reference runtime: preflight, runner/image, applications, mappings, detected services, runner issues và topology |
| GET | `/workspaces/{workspaceId}/course-passkey` | `active`, `expiresAt` |
| POST | `/workspaces/{workspaceId}/course-passkey` | Gửi `{ "validHours": 24 }`. Nhận `code`, `expiresAt` một lần |
| POST | `/workspaces/{workspaceId}/course-passkey/revoke` | Thu hồi mã đang cấp |
| POST | `/course-enrollments/redeem` | Gửi `{ "code": "…" }` và UUID `Idempotency-Key`. Nhận `workspaceId` để tải roadmap |
| GET | `/assignments/{assignmentId}/reference-source` | ZIP của Lab. Backend đối chiếu SHA-256 của bản đã công bố khi tải |
| POST | `/auth/logout` | Thu hồi JWT hiện tại đến khi token hết hạn. Gửi lại an toàn |
| GET | `/workspaces/{workspaceId}/course-setup` | Checklist read-only cho giảng viên: workspace, reference source, runtime profile, Studio Live topology, Labs, quiz và Passkey. Trả `nextAction`, `previewAssignmentId`, trạng thái từng Lab và project tham chiếu |

Roadmap trả `ENROLLED`, `IN_PROGRESS` hoặc `COMPLETED` cho sinh viên đã ghi danh. Danh sách Lab dùng `LOCKED`, `UNLOCKED` hoặc `PASSED`. Lab khóa có lý do `PREREQUISITE` hoặc `COURSE_ARCHIVED`. Sinh viên chưa ghi danh nhận HTTP 403 khi yêu cầu roadmap hoặc tài nguyên lớp.

| HTTP | Trường hợp |
|---|---|
| 400 | JSON, tham số hoặc Passkey sai, hết hạn hay đã thu hồi. Notification API cũng dùng 400 cho bộ lọc hoặc nội dung `read-all` sai |
| 401 | API yêu cầu phiên đăng nhập nhận token hết hạn, đã thu hồi hoặc không hợp lệ |
| 403 | Sai vai trò, ngoài lớp hoặc Lab chưa mở |
| 404 | Đối tượng hoặc bản ZIP không tìm thấy |
| 409 | Đã ghi danh với yêu cầu khác, lớp đã lưu trữ, nguồn thay đổi hoặc kết quả chấm cũ |

## Checklist thiết lập khóa học cho giảng viên

`GET /api/v1/workspaces/{workspaceId}/course-setup` tổng hợp trạng thái thật của một khóa học trước khi sinh viên mở Lab. Endpoint chỉ đọc và yêu cầu quyền giảng viên/quản trị viên.

Checklist gồm các bước:

1. Workspace đang `ACTIVE` và đã bật course mode.
2. Reference project/model/snapshot đã được gắn và phân tích.
3. Runtime profile có applications và trỏ đúng source/model đã công bố.
4. `studioTopology` v1 có ít nhất một block; số connection được báo riêng.
5. Các Lab đã publish theo thứ tự.
6. Quiz có version cho từng Lab đã publish.
7. Passkey còn hiệu lực.
8. Có ít nhất một Lab đủ điều kiện để xem trước luồng sinh viên.

Frontend hiển thị checklist này tại `/roadmap` cho giảng viên (`CourseSetupPanel`). Mỗi bước còn thiếu có link trực tiếp tới `/assignments`, `/runtime-config?project=...`, hoặc khu vực Passkey. Trang Assignments cũng có link “Course setup checklist” và link “Configure runtime & Studio Live” theo reference project. Endpoint không tự suy ra topology; giảng viên vẫn xác nhận cấu hình đã chuẩn bị.

Bước `studio` chỉ được coi là hoàn tất khi runtime readiness trả `runnerReady=true` và tất cả Lab cần runtime đã có topology đóng băng. Panel gọi `runtime-setup-readiness` để hiển thị preflight, runner/image, applications, mappings và warnings; nếu chưa ready, bước Studio bị hạ xuống `ACTION` dù profile có `studioTopology`.

### Đóng băng topology theo Lab (V34)

`V34__Assignment_Studio_Topology_Snapshot.sql` thêm:

- `assignments.studio_topology_snapshot JSONB`
- `assignments.studio_topology_revision INTEGER`

Khi publish hoặc gọi `freeze-topology`, backend copy `studioTopology` từ runtime profile của reference project nếu profile khớp đúng `source_snapshot_id`/`model_version_id`. Phiên Guided Lab mới dùng snapshot này trước; chỉ fallback về profile hiện tại khi Lab chưa có snapshot (dữ liệu cũ). Vì vậy sửa reference profile sau khi freeze không làm thay đổi topology của Lab đã đóng băng.

## Nối kết quả WF-04 và thông báo

WF-04 gọi `CourseProgressionService.recordFinalizedResult(submissionId, reviewRevision, passed)` trong luồng server-side khi đã xác minh các Snapshot bắt buộc (`> 5.0/10`) và lưu kết quả cuối (chi tiết tại [`WF04_SUBMISSION_GRADING_C04.md`](./WF04_SUBMISSION_GRADING_C04.md)). Khi kết nối producer WF-04, lưu và flush bản review rồi gọi dịch vụ trong cùng transaction JPA để bản ghi điểm, tiến độ và thông báo cùng commit hoặc rollback. Tiến độ đọc review bằng JDBC. Kết quả không đạt giữ Lab sau khóa. API chấm điểm tổng 0–100 hiện tại có nghiệp vụ riêng.

> Tài liệu liên quan: [`WF02_STATIC_QUIZ_C02.md`](./WF02_STATIC_QUIZ_C02.md) · [`WF03_RUNTIME_STUDIO_C03.md`](./WF03_RUNTIME_STUDIO_C03.md) · [`WF04_SUBMISSION_GRADING_C04.md`](./WF04_SUBMISSION_GRADING_C04.md) · [`MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md`](./MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md) (bao gồm `Wf01AcceptanceMatrixTest` tự động hóa **30 ca** nhóm `F01`/`F09`/`F10` kèm `CourseLabSeederServiceTest` 3/3 cho cả `STANDARD_DEMO` 3 Lab & `FULL_CURRICULUM` 13 Lab). Giao diện Giảng viên tại Courses & Assignments tích hợp 2 nút 1-click `<SeedCuratedCourseLabs />` và Next.js BFF `allowedBackendPath` hỗ trợ `/course-labs/seed-curated`. Bổ sung `V31__WF01_Customer_Ready_Identity_And_Course.sql` (`users.avatar_url`, `users.preferred_locale`, `workspaces.max_students`, `refresh_sessions`, `auth_rate_limits`).

Progression kiểm tra bài nộp mới nhất, bản review `GRADED` đúng revision, nhận xét có nội dung, sinh viên thuộc lớp và đã qua các Lab trước. Khi đạt, kết quả và thông báo mở Lab kế tiếp được lưu trong cùng giao dịch. Cơ chế gửi lặp dựa trên revision và khóa sự kiện `course-lab-unlocked:{assignmentId}`.

Flyway V22 cung cấp `user_notifications`, khóa duy nhất `(recipient_id, event_key)` và hàm `mavis_notify`. Flyway V26 thêm cấu hình lớp tuần tự, thứ tự Lab, dữ liệu băm Passkey, kết quả Lab và dấu vết thu hồi JWT. Dữ liệu băm JWT được dọn theo thời gian hết hạn khi có yêu cầu đăng xuất.

## Điều kiện phát hành

Cloud profile mặc định tắt Flyway lúc khởi động. Pipeline kiểm tra V26 trước khi thay container. Nếu schema chưa có, bước phát hành sao lưu PostgreSQL, kiểm bản sao rồi áp dụng riêng V26 trong một giao dịch. Schema dở dang hoặc lỗi sao lưu sẽ dừng việc thay container. Backend mới cần bảng `revoked_access_tokens` để xác thực JWT. Khi phải quay về image trước, giữ các cột và bảng bổ sung của V26. [Quy trình migration và rollback](../deploy/CI-CD.md)

## Kiểm chứng

- Chạy `CourseAccessPostgresTest` và `MigrationUpgradeTest` với PostgreSQL thử nghiệm cổng 15438 trên loopback. CI cung cấp cụm PostgreSQL riêng cho hai lớp test này.
- Frontend chạy `npm run typecheck`, `npm test`, build và route smoke. BFF test xác minh thu hồi JWT trước khi bỏ cookie và thử lại được khi backend tạm gián đoạn.
- Nghiệm thu tích hợp trên staging cần kết quả C02/C03/C04 thật, hai lớp độc lập, hai sinh viên và tối thiểu hai Lab theo thứ tự. Kiểm tra Passkey, đường dẫn Lab khóa, nguồn đã gán, chấm đạt hoặc yêu cầu sửa, thông báo và mở đúng Lab cho đúng sinh viên.

## Đối chiếu BM04 và kết quả cần xác nhận

| Cam kết | Minh chứng có thể chạy lại | Phạm vi |
|---|---|---|
| DS-01a, TC-WF01-E2E | CourseHttpAcceptanceTest, route smoke và kịch bản Chrome với backend và PostgreSQL cô lập | Đăng nhập, công bố Lab, cấp mã, ghi danh, roadmap và nguồn Lab 1 |
| DS-01b, TC-N02 | CourseHttpAcceptanceTest và CourseAccessPostgresTest | Tài khoản chưa ghi danh, khác lớp, sai vai trò, trực tiếp vào Lab khóa, Passkey sai/hết hạn, thu hồi JWT |
| TC-ST01 | CourseAccessPostgresTest | Dữ liệu thử C04 kiểm tra revision, giữ khóa khi chưa đạt, mở Lab sau đúng người, gửi thông báo một lần và hoàn thành Lab cuối |
| TC-N01 | scripts/measure-wf01-roadmap.mjs | Đo p95 của API roadmap trên staging. Mốc đồ thị 50 node/150 edge và thời gian chấm Quiz cần dữ liệu và môi trường của WF-02 |
| TC-GR01–06, TC-N03–06 | Test và minh chứng từ các owner tương ứng | Cần producer C04, fixture chính thức và môi trường staging cho luồng liên nhóm |

Chạy phép đo roadmap với Node 22 trở lên. Đặt MAVIS_WF01_TEST_API thành URL gốc backend staging kết thúc ở /api/v1/, MAVIS_WF01_TEST_WORKSPACE thành ID lớp đã công bố và MAVIS_WF01_TEST_TOKEN thành token tài khoản thử đã ghi danh. Giá trị mặc định chạy 300 giây với 4 worker, mỗi worker gửi tối đa một request mỗi giây. Kết quả ghi số request, lỗi và p95 theo mili giây. Tiêu chí API là p95 tối đa 3000 ms với 0 lỗi. Dùng môi trường staging 4 vCPU và 8 GB để lấy số liệu nghiệm thu.

Diễn tập cục bộ trên backend của nhánh tiến độ tại commit 5821466 dùng JDK 21, PostgreSQL 18 cô lập và 4 worker trong 300 giây. Kết quả ghi nhận 1.196 request thành công, 0 lỗi, p95 36 ms. Số liệu này áp dụng cho dữ liệu thử và môi trường localhost. Biên bản TC-N01 trên staging vẫn cần môi trường và tải theo BM04.
