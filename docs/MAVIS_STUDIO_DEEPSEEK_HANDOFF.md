# Bàn giao MAVIS Studio Live cho DeepSeek

Ngày bàn giao: 15/11/2026, giờ Việt Nam. Đây là điểm bắt đầu cho một agent chưa có lịch sử hội thoại. Đọc tài liệu và kiểm tra Git trước khi sửa. Những ghi chú nghiệm thu bên dưới mô tả bằng chứng đã có và giới hạn xác minh.

## Đọc trước khi làm

1. [Ultimate Project Master Context](MAVIS_ULTIMATE_PROJECT_MASTER_CONTEXT.md). Đọc mục kiến trúc, BR-07/08, FR-EDU-03, FR-IMP-03/04, FR-RT-01/07 và phần mở rộng Studio Live cuối file. Giữ ranh giới giữa yêu cầu Review 2 và phần thêm block/nối dây đã được người dùng duyệt sau đó.
2. [WF-01 Course Access](WF01_COURSE_ACCESS.md) và [WF-02 Static Quiz](WF02_STATIC_QUIZ_C02.md). Nắm nguồn tham chiếu, quyền giảng viên/sinh viên, version và Quiz Gate.
3. [WF-03 Runtime Studio](WF03_RUNTIME_STUDIO_C03.md), [Studio Runtime](MAVIS_STUDIO_RUNTIME.md) và [Prepared Live Studio](PREPARED_LIVE_STUDIO.md). Đọc theo thứ tự từ workflow, hợp đồng hiện hành đến triển khai topology chuẩn bị.
4. [WF-04 Submission Grading](WF04_SUBMISSION_GRADING_C04.md). Nắm gói bằng chứng bất biến, chữ ký receipt, quyền review và chấm từng snapshot.
5. [Studio Agent Handoff cũ](MAVIS_STUDIO_AGENT_HANDOFF.md) là lịch sử. Đối chiếu hướng dẫn branch và trạng thái với Git hiện tại trước khi dùng.

## Yêu cầu sản phẩm và quyết định đã duyệt

MAVIS dùng curated repo đã chuẩn bị, có Compose và cấu hình triển khai được kiểm duyệt. Giảng viên soạn bài thực hành từ repo tham chiếu. Sinh viên vào Lab sau Quiz Gate, chạy phiên Docker riêng và thực hành trên cấu hình được giao. Mục tiêu là xem tác động thật, chụp bằng chứng và nộp để giáo viên chấm.

Sandbox đã có builder để thử ý tưởng, canvas 2D/3D, thao tác node/dây, kịch bản mô phỏng và ghi video cục bộ. Live dùng canvas chung và dữ liệu thật. Giữ các hành vi mô phỏng trong Sandbox cho tới khi có cách thực thi và đo được trên hạ tầng thật.

- Block chuẩn bị ánh xạ tới service có trong Compose, runtime applications và confirmed service mappings. Add là START, Remove là STOP. Clone replica tăng một instance của cùng service, tối đa 8 khi canScale bật.
- Dây chuẩn bị ánh xạ tới một route-controller riêng. Ứng dụng phải gọi qua controller đó. Connect/Disconnect là START/STOP controller, nên ảnh hưởng thật tới request. Dây cấu hình nét đứt và trace quan sát là hai lớp dữ liệu riêng.
- Profile có studioTopology version 1. Metadata không chứa secret và không cho nhập lệnh Docker, host hay image qua canvas. Backend và Runner xác nhận phạm vi service.
- Runner khởi động và kiểm tra toàn bộ stack trước, sau đó dừng block/tuyến initiallyStopped trước baseline. START/SCALE chờ health endpoint trước khi đo. Workload GET/HEAD được chạy lại sau action. Workload ghi dữ liệu giữ hành vi hiện có.
- Studio Live đi qua hàng đợi lệnh, acknowledgement, telemetry thật, ảnh snapshot có giải trình, receipt ký và submission workflow hiện hành. Video Sandbox vẫn lưu cục bộ.

## Nơi đọc code

- Frontend Runtime, cấu hình và mở phiên: `MAVIS-Frontend/src/features/runtime/backend.tsx`. Editor ở `prepared-topology-editor.tsx`, builder ở `prepared-live-topology.tsx`, điều khiển phiên và evidence ở `studio-controls.tsx`, canvas chung ở `studio-observability.tsx`. `studio-workbench.tsx` chứa Sandbox và lối vào Live. Contract API nằm ở `MAVIS-Frontend/src/lib/api/contracts.ts`.
- Backend ở `MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/runtime/service/`. Đọc `RuntimePlanningService.java` (lưu profile và khởi chạy), `PreparedStudioTopology.java` (contract v1), `RuntimeStudioService.java` (lệnh, xác nhận và snapshot), `impl/RuntimeSessionServiceImpl.java` (Quiz Gate và xác minh nguồn Lab).
- Runner ở `MAVIS.Worker/src/MAVIS.Runner/`: `ComposeOverrideBuilder.cs`, `DockerComposeSession.cs` và `JavaRuntimeClient.cs`. Repo mẫu và proxy GET/HEAD ở `MAVIS.Worker/samples/runtime-poc/`.
- Học và nộp bài ở `MAVIS-Frontend/src/features/courses/screens.tsx`, `MAVIS-Frontend/src/features/submissions/composer.tsx` và các lớp `SubmissionServiceImpl`, `SubmissionReviewService`.

## Trạng thái bàn giao

Luồng lưu Runtime Step 1 giữ topology cũ khi payload bỏ qua trường này và snapshot vẫn trùng. Trong workspace, thay đổi topology cần quyền giảng viên/admin. Guided Lab đọc topology từ runtime profile của dự án tham chiếu công bố, chỉ khi config gắn với đúng reference snapshot. Dự án sinh viên bỏ qua topology riêng và ghim metadata đã kiểm tra vào phiên mới. Chỉ topology được kế thừa. Secret và cấu hình vận hành vẫn theo luồng hiện có. Luồng one-shot bỏ metadata Studio trước khi gửi Runner.

Topology hiện ghim theo phiên, chưa có revision topology bất biến trên bản ghi công bố Lab. Nếu giáo viên sửa cấu hình tham chiếu, các phiên tạo sau có thể nhận cấu hình mới. Cần quyết định chốt theo revision Lab nếu bài yêu cầu mọi sinh viên dùng cùng một bản. Repo cũ không có studioTopology tiếp tục dùng StudioControls hiện hành. Chưa có chức năng suy ra topology tự động từ repo. Giảng viên nhập cấu hình đã chuẩn bị qua editor.

Thay đổi Live hiện ở workspace local, gồm file mới chưa track. Khi tiếp nhận chạy `git status --short --branch`, `git diff --check`, `git ls-files --others --exclude-standard` và đọc diff liên quan. Không giả định bản production đã có các thay đổi này. Kiểm tra commit thực tế bằng `git log -1 --oneline`.

## Kiểm thử và phần cần nghiệm thu

Bằng chứng local đã có: TypeScript, 18 test Runtime Planning frontend, test trình duyệt Live và Sandbox, 35 test Java Runtime Planning/Studio/topology, và Runner. Bộ test Java bao gồm xác nhận phiên sinh viên nhận topology từ đúng dự án tham chiếu. Test Docker thật chạy với callback API Java mô phỏng trong tiến trình. Nó bật block, nối/cắt/nối lại tuyến, đo lỗi **0% → 100% → 0%**, scale lên 2 replica, thu trace và xác nhận dọn môi trường. Bài test này không đi qua backend triển khai hay tài khoản thật.

Lệnh tham chiếu:

- Từ `MAVIS-Frontend`: `npm run typecheck`, `node --test tests/runtime-planning.test.cjs`, `node tests/studio-ui.browser.cjs`, `node tests/studio-workbench.browser.cjs`.
- Từ `MAVIS-Platform/mavis-be`, dùng JDK 21: `mvnw.cmd -pl mavis-analyzer -am test "-Dtest=PreparedStudioTopologyTest,RuntimeStudioServiceTest,RuntimePlanningServiceTest" "-Dsurefire.failIfNoSpecifiedTests=false"`. Các unit test này không yêu cầu DB thật.
- .NET: `dotnet test MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj --filter FullyQualifiedName~StudioInfrastructureActionTests`. SDK của Worker được ghim trong `MAVIS.Worker/global.json`.
- Docker thật: chuẩn bị image mẫu theo `MAVIS.Worker/samples/runtime-poc/Initialize-Poc.ps1`, đặt `MAVIS_MANAGED_DOCKER_TEST_ROOT` tới thư mục mẫu và chạy test `PreparedStudioActivatesMissingBlockAndConfirmsRealDockerChanges`. Xác nhận test không bị skip và cleanup thành công.

Task tiếp theo quan trọng nhất là nghiệm thu bằng **hai tài khoản thật trên môi trường tích hợp**. Giảng viên hoàn tất repo và topology, công bố Lab. Sinh viên qua Quiz Gate, mở Bước 4, nhận đúng block/tuyến ban đầu, chạy START/STOP/SCALE, đo Before/After và chụp bằng chứng. Sau Finish và cleanup, sinh viên nộp, giáo viên mở đúng snapshot và chấm. Kiểm tra quyền sửa cấu hình, session sai phạm vi, thiếu mapping, lệnh thất bại và reload. Ghi lại SHA, môi trường, kết quả thực đo và lỗi tái hiện được. Chạy qua lối vào Lab hiện hành trước khi sửa trải nghiệm.

Để mở rộng sau nghiệm thu, hỏi nhóm về version topology tại thời điểm công bố Lab, quyền sửa trước/sau công bố và cách phát hành repo mẫu. Chỉ thêm thao tác Live khi repo hỗ trợ hành vi runtime và có kiểm thử. Không xem nút hoặc telemetry giả là tiêu chí đạt.
