# MAVIS — kế hoạch hoàn thiện E2E qua đêm
Ngày: 2026-11-17. Đối tượng thực thi: DeepSeek Flash tiếp quản checkout hiện tại.
Đây là backlog triển khai và nghiệm thu; không phải tuyên bố 60 task đã hoàn thành.

## Mục tiêu và thứ tự ưu tiên
Hoàn thiện một đường đi thật: giảng viên tạo lớp/course → tạo Lab → lý thuyết + repo tham chiếu + C1/C2/C3 + Quiz → chuẩn bị Studio Live và công bố → sinh viên học/qua Quiz/thực hành → nộp giải thích và bằng chứng → giảng viên chấm hoặc trả sửa → nộp lại → công bố điểm và mở Lab tiếp.
Lab theory-only phải đi hết được mà không bị yêu cầu runtime. Giữ hoạt động của Lab legacy.
Ưu tiên đường đi có dữ liệu thật, Submission v2 và grading/progression trước chỉnh hình thức. Không cam kết tất cả backlog xong trong một đêm; thực hiện lần lượt đến khi hết thời gian phiên và lưu checkpoint để tiếp tục.

## Quyền thực thi và nguyên tắc tự chủ
- Người dùng yêu cầu chủ động thực hiện các task trong tài liệu này; không dừng hỏi xác nhận cho các sửa code, test và thiết lập phát triển thông thường nằm trong scope.
- Giữ WIP của mọi agent. Đọc diff trước khi đụng file đang sửa. Không reset/clean, không force push, không stage toàn bộ checkout mù quáng.
- Commit theo task hoặc nhóm thay đổi gắn chặt, chỉ gồm phần đã kiểm chứng và thuộc scope. Không gom WIP chưa rõ nguồn vào commit. Không tự sửa/ghi đè các commit đã xuất bản.
- Merge/push/deploy chỉ theo quyền đã được cấp trong phiên thực thi và quy định repo; không suy ra quyền thay đổi production từ ảnh chụp cuộc hội thoại. Nếu chưa có quyền/credential cần thiết, đánh dấu BLOCKED phần đó và tiếp tục task độc lập.
- Không tạo chi phí, thay đổi tài khoản cloud, xóa dữ liệu thật, đổi credential, mở Docker ra Internet hoặc thay đổi bảo mật hệ thống. Không ghi secret trong source, progress, ảnh hay log.
- Không đọc tìm secret trên toàn máy. Dùng cơ chế auth được cấp sẵn. Thiếu auth không có nghĩa cần tạo lại key liên tục.
- Chỉ cleanup tài nguyên thử do chính lượt chạy tạo và xác định quyền sở hữu bằng session/project label. Không prune volume, xóa DB lớp thật hoặc dọn cache toàn máy.
- Khi một nguyên nhân lặp lại sau hai phương án có giả thuyết khác nhau, ghi BLOCKED kèm bằng chứng và bước gỡ; chuyển task không phụ thuộc. Không đánh dấu PASS vì test bị skip.
- Không biến các tính năng giả lập Sandbox thành số đo Live. Không hạ target Java/.NET, nới assertion, đổi expected hoặc sửa fixture chỉ để làm xanh khi chưa xác minh contract.
- Không thêm tính năng ngoài scope như chứng chỉ, thanh toán, chat, dashboard phân tích mới. Không đại refactor kiến trúc.

## Đọc context một lần, sau đó đọc có mục tiêu
Đầu phiên đọc instruction thực tế và git status/log, rồi đọc các tài liệu dưới đây theo phần liên quan. Tận dụng context đã đọc; mỗi task chỉ mở code và contract cần cho task.
1. docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md
2. docs/MAVIS_PROJECT_INFRA_CONTEXT_2026-11-16.md
3. docs/MAVIS_ULTIMATE_PROJECT_MASTER_CONTEXT.md — gồm phần mở rộng đã duyệt, không chỉ scope đầu file.
4. docs/superpowers/plans/2026-11-17-lab-v2-big-update.md
5. docs/superpowers/plans/2026-11-17-live-repo-studio-integration.md
6. docs/LECTURER_LAB_AUTHORING_UI.md và docs/STUDENT_LEARNING_UI.md nếu hiện có.
7. WF01_COURSE_ACCESS, WF02_STATIC_QUIZ_C02, WF03_RUNTIME_STUDIO_C03, WF04_SUBMISSION_GRADING_C04 trong docs.
8. docs/PREPARED_LIVE_STUDIO.md, docs/STUDIO_LIVE_PARITY.md, docs/MAVIS_STUDIO_RUNTIME.md.
9. docs/MAVIS_DEV_ENVIRONMENT_2026-11-16.md và scripts/bootstrap-dev-linux.sh nếu phù hợp OS của phiên.
Nếu prose cũ mâu thuẫn, đối chiếu quyết định đã duyệt mới nhất, migration và code/test hiện tại. Ghi rõ mâu thuẫn; không tự coi báo cáo cũ là test mới chạy.
Superpowers chỉ dùng nếu thực sự có trong môi trường: using-superpowers, systematic-debugging khi gặp lỗi, verification-before-completion trước kết luận. Không vòng lặp truy cập đường dẫn Windows từ container không được mount.

## Baseline đã kiểm tra khi lập kế hoạch
- HEAD quan sát: 6c4bf1d, main. Phải kiểm tra lại trước khi thực thi vì có agent khác đang làm.
- Có WIP ở course-outline, course-workspace-shell, lab-toc, courses/screens, submissions/screens, workspaces/screens; fixture observed-sequence-java-actual; ba backend test CourseAccessServiceTest, CourseSetupServiceTest, RuntimeSetupControllerTest. Có script E2E và docs/bootstrap chưa tracked. Đây không phải danh sách cố định để stage.
- Báo cáo và artifact local hiện có ghi session 335ed1eb-b2a8-4597-9399-a2304884ec53 đã STOP/START/SCALE, Finish, HMAC và cleanup thật; revision freeze 6. Ảnh 50-studio-{stop,start,scale,finish}.png ở MAVIS-Frontend/.artifacts/e2e-local/.
- Bằng chứng trên chỉ chứng minh phần local được báo cáo, không chứng minh production, toàn bộ submit/grade/unlock, hoặc code WIP mới nhất.
- Lab v2 đã có authoring/Quiz/Live wiring, nhưng submission composer còn lựa chọn model/diagram legacy. Không mặc định toàn tuyến v2 đã hoạt động.
- Assignment hiện được quan sát có requireRuntimeTrace; đề xuất lab_mode/feature flag trong plan cũ chưa đủ chứng minh đã có discriminator được triển khai.
- V36__Quiz_Authoring.sql và V37__Runtime_Session_Assignment.sql đã tồn tại. Plan cũ đề xuất số V36/V37 khác đã lỗi thời. Kiểm tra số mới nhất rồi thêm migration mới; tuyệt đối không dùng lại số hay sửa migration đã chạy.
- CourseAccessService republish hiện copy topology lại; freeze(sessionId) có nhánh sessionId null. Cần regression và áp dụng quy tắc v2 có phạm vi, tránh phá legacy.
- CourseSetup readiness lấy reference đầu tiên có thể báo DONE khi Lab khác còn thiếu; runnerReady hiện phản ánh cấu hình đủ điều kiện, không phải probe Docker sống.
- Script E2E hiện có fixed waits và một số log request body; cần assertion/poll và redaction trước tái sử dụng lâu dài.

## Quyết định triển khai trong scope đã duyệt
1. Lab v2: C1/C2/C3 là nội dung học/tham chiếu read-only. Sinh viên không phải tạo/chọn/nộp diagram như composer legacy. Nộp lời giải cho các phần giảng viên yêu cầu, Quiz evidence và Studio evidence nếu có runtime.
2. Chọn discriminator rõ ràng nếu thiếu, additive và backward compatible. THEORY_ONLY không cần Studio; THEORY_STUDIO cần bằng chứng thật; LEGACY giữ contract cũ. Tên cụ thể theo code sau T05/T06, không tạo hai cơ chế mâu thuẫn.
3. Quiz dùng passPercent của version từ server. Default mới 80%; không ép bản cũ 70% thành 80%. Quiz attempt cũ không tự đại diện cho version mới.
4. Publish lại không được âm thầm thay frozen topology/evidence đang dùng. Refresh topology phải là hành động freeze/version rõ ràng. Chỉ siết proof runtime cho flow v2 cần runtime, không phá legacy bằng một validation toàn cục.
5. Sau publish, chỉnh sửa học liệu/Quiz/topology qua revision/draft phù hợp; lịch sử bài nộp và điểm giữ nguyên nội dung đã đóng băng.
6. Bản chấm nháp không lộ cho sinh viên; chỉ publish điểm khi đủ phần bắt buộc và summary. Giữ quy tắc hiện hành mọi phần chấm bắt buộc >5.0, không đổi thành >=5.0; bài PASSED final không cho sửa trái contract. RETURNED cho sửa/nộp lại đúng policy.
7. UI tổng theo LMS trường học, nội dung bài học theo bố cục học tập kiểu Coursera: outline rõ, nội dung đọc chính, tiến trình và thao tác vừa đủ. Không hero marketing, gradient trang trí, KPI rỗng, card lồng card; tận dụng component/theme/i18n sẵn có.
8. Studio Live thực thi trên repo giảng viên chuẩn bị và profile/pinned image. Thêm block/nối dây chỉ trong capabilities thật được hỗ trợ; hiển thị rõ phần không hỗ trợ. Giữ Sandbox để trải nghiệm ý tưởng.
9. Giữ isolation lớp/project/assignment/session và quyền actor; người học không dùng session teacher hoặc người học khác để nộp bằng chứng.

## Cách chạy và cập nhật tiến độ
Mở file cùng tên đuôi -progress.md. Mỗi task: đọc dependency → kiểm tra phần đã có → tái hiện gap → sửa tối thiểu → chạy verification → cập nhật ledger → chuyển task kế tiếp.
Nếu phần đã hoàn thành, chỉ xác minh và ghi PASS với bằng chứng; không viết lại.
Trạng thái: TODO, WORKING, PASS, FAIL, BLOCKED, SKIP-NOT-NEEDED. SKIP-NOT-NEEDED cần lý do và bằng chứng không áp dụng; dependency BLOCKED không được giả thành PASS.
Ghi lệnh, exit code, số test pass/fail/skip, actor/dữ liệu thử, artifact và commit SHA. Khi chuyển context, ghi checkpoint next task, process đang chạy, tài nguyên cần cleanup và blockers.
Một task PASS cần hành vi đúng sau reload/API hoặc persistence khi liên quan, không chỉ typecheck hay ảnh màn hình.
Giữ các task theo số; task bị chặn cho phép chuyển task độc lập có dependency đã đáp ứng. Critical path: T01–T10 → authoring/learner/Live cần thiết → T34–T46 → T52 → CI/deploy hợp lệ.
Không lặp full suite mỗi lần sửa nhỏ. Chạy test hẹp lúc phát triển, full regression một lần ở checkpoint T51 và chạy lại phần chịu ảnh hưởng nếu sau đó sửa.

## Lệnh kiểm chứng: xác minh manifest trước khi chạy
Các lệnh dưới đây là hướng dẫn, không là bằng chứng đã chạy.
- Frontend tại MAVIS-Frontend: đọc package.json/lockfile; dùng npm ci nếu cần, npm run typecheck, npm test, npm run build và browser scripts hiện có.
- Backend tại MAVIS-Platform/mavis-be: java -version; javac -version; ./mvnw -v hoặc mvnw.cmd -v tùy shell. Tất cả phải JDK21. Chọn module/test thật bằng -pl/-am, -Dtest=... và -Dsurefire.failIfNoSpecifiedTests=false khi reactor cần. Kiểm tra test count thực, không coi no-tests là PASS.
- Worker: đọc global.json và solution/project; SDK đúng version repo, chạy dotnet test trên project test phù hợp. Tránh fallback path NuGet Windows trong Linux; cấu hình đúng môi trường, không sửa target.
- Browser: dùng Chromium/Playwright có thật; chọn channel theo OS, assert network/DOM/state thay vì sleep cố định.
- Docker: docker info và docker compose version phải truy cập Engine thật. CLI đơn thuần không đủ. Dùng image đã build đúng SHA/digest; không pull/build bừa khi ổ C gần hết.
- Integration: DB thử riêng đúng version repo/CI. Không chạy migration/test trên DB production để chứng minh local.
- Auth/CI: dùng credential sẵn có không in giá trị. Gắn kết quả workflow/deploy với exact commit SHA; HTTP200 trang login không chứng minh Runner chạy.

## Backlog tuần tự — 60 task

### Cập nhật từ báo cáo mới nhất của agent
- Theo báo cáo người dùng cung cấp: main 6c4bf1d đã push; workflow 43952009727 completed success (verify/images/deploy). Đây là bằng chứng được báo cáo, chưa được người lập kế hoạch kiểm tra lại trên GitHub.
- Production /login trả 200 và session authenticated:false. Điều này không chứng minh lỗi phân quyền; phiên kiểm thử chưa đăng nhập. Không suy ra Runner production hoạt động từ HTTP200.
- Chưa có tài khoản test LECTURER/STUDENT production trong phiên agent. Chỉ T56 nghiệm thu production bị chặn bởi điều kiện này; T01–T52 và các phần docs vẫn tiếp tục trên local với dữ liệu cô lập. Không đứng chờ người dùng gửi mật khẩu qua đêm.
- Không cần deploy lại riêng commit 6c4bf1d chỉ để lặp bước đã có báo cáo. T54/T55 phải xác minh lại theo SHA của các thay đổi mới khi có, không tự đánh PASS cho code chưa được pipeline kiểm tra.
- Nếu sau này được cấp test accounts, nhận qua cơ chế credential/biến môi trường được hỗ trợ, không yêu cầu dán mật khẩu vào chat. Không tự tạo user bằng SQL production hoặc bỏ qua OTP/role checks để vượt blocker.
- Bắt đầu/tiếp tục từ task đầu tiên chưa có bằng chứng trong ledger, không quay về sửa môi trường hay chạy lại toàn bộ nghiệm thu local đã đạt nếu không có thay đổi liên quan.

### T01 [P0] Chốt baseline và giữ WIP
- Phụ thuộc: —.
- Thực hiện: Đọc git status/diff/log và các instruction. Lưu manifest đường dẫn file đang sửa/untracked, branch, HEAD, upstream. Không sửa đè WIP giao diện sinh viên hoặc các test tái hiện của agent khác.
- Hoàn tất khi: Có baseline SHA và danh sách WIP trong progress log. Các thay đổi sau đó phân biệt được với công việc có sẵn.
- Kiểm chứng: git status --short --branch; git log -5 --oneline; git diff --check. Nếu file thuộc task đã có WIP, đọc diff rồi hoàn thiện trên phần đó, không xóa.

### T02 [P0] Khôi phục toolchain của đúng phiên
- Phụ thuộc: T01.
- Thực hiện: Đọc môi trường đã xác minh và bootstrap script. Kiểm tra Java 21, Maven, Node, .NET global.json, Chromium và Docker. Backend process phải thấy dotnet/Runner/Docker trong PATH và DOTNET_ROOT của chính process.
- Hoàn tất khi: Maven dùng JDK21, frontend typecheck chạy được. Ghi rõ công cụ nào thiếu và cách bootstrap. Không lặp tải SDK đã có.
- Kiểm chứng: java -version; javac -version; Maven -v; node -v; dotnet --info; docker info. Dùng unit test DB riêng hoặc endpoint loopback không hoạt động.

### T03 [P0] Chuẩn hóa harness và bảo vệ log nghiệm thu
- Phụ thuộc: T02.
- Thực hiện: Đọc scripts/e2e-local-studio.cjs và e2e-studio-action.cjs đang untracked. Bỏ log raw request body/credential, kiểm tra env đầu vào, browser channel theo môi trường và dùng assert/poll trạng thái thay sleep cố định ở các bước quyết định.
- Hoàn tất khi: Harness không in mật khẩu/token/secret; báo exit code đúng; có thư mục artifact riêng theo run ID. Thiếu credential báo tên biến còn thiếu.
- Kiểm chứng: node --check các script; kiểm tra đường lỗi thiếu env; rà postData/console/request logging trước khi ghi artifact.

### T04 [P0] Chuẩn bị bộ dữ liệu hai Lab và ba vai trò
- Phụ thuộc: T03.
- Thực hiện: Tạo dữ liệu local/test riêng cho lecturer L1, student S1, student S2 ở workspace khác hoặc cùng lớp cho test cô lập. Dùng một Lab theory-only, một Lab theory+Studio và một Lab kế tiếp bị khóa. Tận dụng fixture/seed repo đã có.
- Hoàn tất khi: Không dùng tài khoản thực của người dùng trong script. Có ID lớp/bài/reference/source/model dùng xuyên suốt một run và manifest đã redaction.
- Kiểm chứng: Lấy đúng endpoint seed hiện có hoặc fixture integration. Kiểm tra lecturer/student có scope khác nhau qua API.

### T05 [P0] Chốt ma trận khoảng trống bằng code
- Phụ thuộc: T01,T04.
- Thực hiện: Đọc docs mới, code Assignment/Submission/Review và schema hiện tại. Phân loại hiện có/thiếu/đã báo cáo/chưa chạy. Xem V36 Quiz Authoring, V37 Runtime Session Assignment và các migration đến thời điểm làm.
- Hoàn tất khi: Không đánh số migration theo đề xuất cũ. Mỗi gap có file/API và task xử lý. Test/report cũ được ghi là lịch sử.
- Kiểm chứng: Đọc kế hoạch lab-v2, entity, DTO và contracts. Ưu tiên đường tạo Lab v2 tới nộp/chấm thay vì thêm chức năng ngoài scope.

### T06 [P1] Định nghĩa và nhận diện Lab v2 tương thích
- Phụ thuộc: T05.
- Thực hiện: Chuẩn hóa discriminator/schema cần để biết bài legacy, theory-only và theory+Studio. Dùng tên đang được code hỗ trợ; nếu chưa có, thêm field tối thiểu với default legacy. Tách yêu cầu runtime khỏi yêu cầu chọn diagram của bài cũ.
- Hoàn tất khi: Bài cũ có hành vi cũ. Bài mới có kiểu rõ ràng từ backend tới UI. Không suy kiểu chỉ bằng tiêu đề hoặc state local.
- Kiểm chứng: Test DTO/entity/API với dữ liệu cũ thiếu field, hai kiểu bài mới, dữ liệu enum sai.

### T07 [P1] Migration additive và upgrade an toàn
- Phụ thuộc: T06.
- Thực hiện: Nếu cần schema cho Lab/submission v2, dùng số tiếp theo thực tế đang trống. Giữ quan hệ và NOT NULL của dữ liệu legacy bằng thiết kế tương thích, dùng cột/JSON/table mới tối thiểu. Cập nhật deploy package, probe, migration test cùng nhau.
- Hoàn tất khi: Upgrade từ schema trước thành công và dữ liệu submission cũ đọc được. Probe missing/ready/partial khớp tên thật. Không sửa migration đã phát hành.
- Kiểm chứng: MigrationUpgradeTest hoặc PostgreSQL test riêng; test migration SQL thực với probe. Không chạy clean/drop trên DB người dùng.

### T08 [P1] Contract v2 cho giải trình và các mục bằng chứng
- Phụ thuộc: T06,T07.
- Thực hiện: Thiết kế request/response v2 theo các section yêu cầu của bài, liên kết assignment/version và theory answers. Source/model vẫn được lưu khi cần provenance; sinh viên không phải chọn/chụp diagram để nộp Lab v2.
- Hoàn tất khi: Backend trả required sections thật và lỗi thiếu field rõ. Legacy composer/API vẫn hoạt động. Không chỉ nới validation legacy bằng null.
- Kiểm chứng: Test validation, mode mismatch, assignment sai, section lạ, dữ liệu thiếu và compatibility response cũ.

### T09 [P1] Quy tắc version publish/refreeze
- Phụ thuộc: T05.
- Thực hiện: Với Lab đã publish, lặp publish là idempotent và giữ topology frozen; refresh topology chỉ qua thao tác freeze/version rõ ràng theo UI hiện có. Bảo toàn các phiên/submission cũ. Chuyển test tái hiện cũ sang assertion hành vi mong muốn khi sửa.
- Hoàn tất khi: Publish lại không âm thầm đổi snapshot/revision. Freeze hợp lệ tạo revision mới; session đã ghim giữ bản cũ.
- Kiểm chứng: CourseAccessServiceTest: publish→freeze→sửa reference→publish lại; explicit freeze; sai source/model/session; test không phá order/notification.

### T10 [P1] Readiness và checklist cho nhiều reference
- Phụ thuộc: T05,T09.
- Thực hiện: Phân biệt configurationReady và session/Runner observed health. Giữ field cũ tương thích nếu cần, đổi nhãn UI cho đúng ý nghĩa. Course checklist tổng hợp theo từng Lab/reference và không báo DONE khi Lab khác thiếu Studio.
- Hoàn tất khi: Hai Lab dùng hai reference khác nhau có nextAction đúng. Profile đủ cấu hình không tự hiển thị Docker đang sống.
- Kiểm chứng: CourseSetupServiceTest và RuntimeSetupControllerTest cho hai reference, thiếu images/env/mapping và chưa có session.

### T11 [P2] Lưu và sửa lớp học
- Phụ thuộc: T04.
- Thực hiện: Kiểm chứng tạo lớp, tên/mã/mô tả, refresh và archive theo API. Tái sử dụng UI LMS đã refactor, chỉ sửa lỗi chức năng/validation còn chặn.
- Hoàn tất khi: Lớp đã tạo đọc lại được. Lỗi trùng mã, field trống và quyền giảng viên hiển thị đúng.
- Kiểm chứng: Workspace tests và browser một lớp mới. Không làm lại thiết kế tổng đang được agent khác chỉnh.

### T12 [P2] Course draft và module/activity
- Phụ thuộc: T11.
- Thực hiện: Kiểm chứng start draft, sửa title, thêm/sửa/move/delete module/item và prerequisite đứng trước. Khi course đã publish, sửa qua draft mới.
- Hoàn tất khi: Draft persist sau reload; invalid move/prerequisite bị từ chối. Không có response giả hoặc local-only success.
- Kiểm chứng: CourseAuthoringServiceTest và browser course builder với lỗi revision/state.

### T13 [P2] Tạo/sửa Lab nháp đủ hai kiểu bài
- Phụ thuộc: T06,T12.
- Thực hiện: Lab authoring lưu nháp khi chưa có source, giữ title/instructions/type/deadline hợp lệ. Liên kết module item với assignment thay tạo Lab trùng. Có điều hướng sửa lại bài.
- Hoàn tất khi: Theory-only và Studio Lab tạo được, reload giữ dữ liệu. API lỗi không xóa nội dung đang gõ.
- Kiểm chứng: Browser LabInfoForm/Authoring và Assignment validation; test save draft chưa có source.

### T14 [P2] Lý thuyết Markdown và liên kết bài học
- Phụ thuộc: T12,T13.
- Thực hiện: Lưu lesson/theory bằng cấu trúc course hiện có, preview an toàn, gắn đúng Lab/module. Hiển thị source/model tham chiếu ở vai trò tài liệu. Không coi xem nội dung là hoàn thành backend.
- Hoàn tất khi: Đổi module/Lab không lẫn lesson. Nội dung published đọc lại đúng và draft được cách ly.
- Kiểm chứng: Course published snapshot tests; browser text dài/code block/empty theory; kiểm tra render HTML an toàn.

### T15 [P2] Nhập curated repo và phân tích nguồn
- Phụ thuộc: T13.
- Thực hiện: Kiểm chứng GitHub commit hoặc ZIP chuẩn bị, namespace source/model, progress job và model version được chọn. Giữ sửa ZIP separator Windows đã có. Dùng seed repo hoặc fixture phù hợp.
- Hoàn tất khi: Lab gắn source/model đúng sau reload. Upload lỗi và analysis fail báo rõ, phiên bản hợp lệ trước vẫn đọc được.
- Kiểm chứng: Source/ZipUtils tests; nhập ZIP thật trên local web và xem model C1/C2/C3; không dump secret file.

### T16 [P2] Quiz editor và version được công bố
- Phụ thuộc: T14,T15.
- Thực hiện: Kiểm chứng tạo draft, các loại câu hỏi được hỗ trợ, đáp án/points/explanation, import/export và version. Dùng passPercent backend, mặc định mới 80% theo Lab v2 đã duyệt.
- Hoàn tất khi: GET draft/versions không lấy pessimistic write lock trong read-only transaction. Publish tạo version, preview không tạo student attempt.
- Kiểm chứng: CourseQuiz tests và browser một Quiz có câu single/multiple/true-false; lỗi import có dòng/vị trí hữu ích.

### T17 [P2] Studio authoring luôn giữ context Lab
- Phụ thuộc: T13,T15.
- Thực hiện: Đi qua Lab→runtime-config→scenarios→sessions→Studio→returnTo. Giữ assignment/project/model/source đúng. Lưu profile không làm rơi topology. Session độc lập không tự lấy project.assignment.
- Hoàn tất khi: Session tạo từ bài có assignment_id. Studio tự do chỉ gắn Lab khi request có context rõ ràng.
- Kiểm chứng: RuntimePlanning/Session tests, browser query propagation, assertion DB/API về assignmentId; không khôi phục fallback đã bỏ.

### T18 [P2] Công bố Course/Lab và preview đúng quyền
- Phụ thuộc: T09,T10,T16,T17.
- Thực hiện: Kiểm chứng Course version bất biến, Lab publish/reference, checklist, preview chỉ đọc và freeze sử dụng session thật theo policy. Chặn trường hợp cần Studio mà bằng chứng readiness chưa đủ.
- Hoàn tất khi: Lecturer xem được phiên bản sẽ giao. Preview không ghi quiz attempt/session/submission. Lỗi 409 freeze chưaverified được giải thích.
- Kiểm chứng: Browser publish/preview; CourseAccess tests và API kiểm tra side effects bằng dữ liệu trước/sau.

### T19 [P3] Ghi danh Passkey và quyền lớp
- Phụ thuộc: T11,T18.
- Thực hiện: Kiểm chứng Passkey còn hạn/hết hạn/thu hồi và ghi danh trùng. Giữ quy định enrollment cũ không bị mất vì key đổi. Không leak Passkey vào log.
- Hoàn tất khi: S1 vào đúng lớp; S2 ngoài lớp không đọc được tài nguyên. Lab đầu mở đúng sau ghi danh.
- Kiểm chứng: CourseAccess tests và browser join class; test khóa lớp/archive nếu đã có contract.

### T20 [P3] Nội dung lớp từ bản publish
- Phụ thuộc: T12,T18,T19.
- Thực hiện: Hoàn thiện luồng LMS sinh viên đang có WIP. Published course/modules/activity là dữ liệu chính; fallback legacy theo code. Thư viện tham khảo không đè danh sách lớp.
- Hoàn tất khi: Sinh viên không thấy draft/authoring controls. Course version và hoạt động liên kết đúng Lab sau refresh.
- Kiểm chứng: Course learning tests và browser My Courses→Class content→Lab; giữ #course-passkey.

### T21 [P3] Lab v2 read-only nguồn và C1/C2/C3
- Phụ thuộc: T06,T15,T20.
- Thực hiện: Đối với Lab v2, reference repo/diagrams phục vụ học; không bắt sinh viên tạo diagram bundle để được nộp. Giữ cơ chế project runtime riêng khi cần Live và nhánh legacy còn dùng phân tích cũ.
- Hoàn tất khi: Lab mới vào bài được với source tham chiếu; bài legacy giữ thao tác hiện hữu. Không bỏ scope check reference.
- Kiểm chứng: LabWorkspace tests/browser cho hai kiểu bài và lab cũ; model lookup phải cùng assignment/source.

### T22 [P3] Quiz attempt và gate thật
- Phụ thuộc: T16,T21.
- Thực hiện: Sinh viên làm current Quiz version, tính điểm đúng theo loại câu hỏi và passPercent. Failed/retry/pass được hiển thị. Không dùng local boolean mở runtime.
- Hoàn tất khi: Chưa đạt bị khóa runtime cả khi gõ URL/API. Đạt mới mở. Version đổi xử lý theo contract hiện hành.
- Kiểm chứng: Quiz scoring/version tests; browser fail rồi pass; request direct runtime trướcpass phải bị từchối.

### T23 [P3] Khôi phục ngữ cảnh học và trạng thái dài hạn
- Phụ thuộc: T20,T22.
- Thực hiện: Reload, back/forward, mở deep link và đổi lớp phải giữ đúng Lab/module/project/session. Tiến độ bước và grade phân biệt rõ, không auto PASS khi đã mở mọi tab.
- Hoàn tất khi: Không có dữ liệu Lab trước hiện dưới title Lab sau. State pending/error có thể retry.
- Kiểm chứng: Browser hai lớp/hai Lab, reload giữa quiz/runtime, deep link step bịkhóa.

### T24 [P3] Giao diện học và nộp cho theory-only
- Phụ thuộc: T08,T14,T22.
- Thực hiện: Theory-only chỉ cần nội dung/Quiz/giải trình theo required sections. Không xuất nút Docker rỗng hoặc yêu cầu runtime receipt.
- Hoàn tất khi: S1 đi hết bài lýthuyết tới form v2 mà không chọn model/diagram/runtime.
- Kiểm chứng: Browser theory-only, contract error thiếu Quiz/answer, regression legacy.

### T25 [P4] Môi trường backend thực thi Runner
- Phụ thuộc: T02,T17.
- Thực hiện: Đảm bảo đúng backend process thấy DOTNET_ROOT, dotnet, Runner DLL, collector config, Docker endpoint và state root. Kiểm startup diagnostic chỉ hiển thị tên/đường dẫn công khai.
- Hoàn tất khi: Phiên mới chuyển QUEUED/ALLOCATED/RUNNING thật; lỗi missing Runner được chẩn đoán trước vòng lặp thử lại vô ích.
- Kiểm chứng: Local web một session; không dùng shell thấy dotnet để suy backend process đã thấy.

### T26 [P4] Image build và Compose Preflight
- Phụ thuộc: T15,T25.
- Thực hiện: Xác nhận build source/image gắn snapshot và digest, runtime/profile hỗ trợ; kiểm security preflight và protected inputs. Tận dụng image có sẵn để tiết kiệm ổ C.
- Hoàn tất khi: Thiếu image/env có lỗi rõ. Không cần privileged/host socket trong workload. Identity được ghim trước chạy.
- Kiểm chứng: Preflight/build tests; một image thực từ seed/fixture; bounded test container cleanup.

### T27 [P4] Trạng thái đầu prepared topology
- Phụ thuộc: T18,T26.
- Thực hiện: Kiểm teacher baseline: stack healthy trước, initiallyStopped áp dụng trước workload, metadata session/mappings đúng. Empty optional blocks vẫn thêm lại được.
- Hoàn tất khi: UI trạng thái x0 khớp Docker và các block canScale giữ bounds.
- Kiểm chứng: Runner tests + local web telemetry, ghi IDs/mappings và trạng thái công khai.

### T28 [P4] STOP/START/SCALE có acknowledgement
- Phụ thuộc: T27.
- Thực hiện: Kiểm idempotency actionId, pending disable, bounds1–8, service scope, health chờsau START/SCALE. Lỗi lệnh không được optimistic hiển thị đãthànhcông.
- Hoàn tất khi: Bằngchứng Docker cho x0→x1→x2; action retry không tạo lệnh trùng. Lưu Before/After thật.
- Kiểm chứng: Studio service tests + web thao tác thật. Giữ screenshot 50-studio từ báo cáo cũ làm reference, không dùng thay run mới.

### T29 [P4] Nối/cắt tuyến thật qua controller
- Phụ thuộc: T28.
- Thực hiện: Source phải gọi route-controller. Kiểm link allowlist, connect/disconnect, canScale trên controller, quan sát trace hops khi cần. Dây configured tách lớp observed.
- Hoàn tất khi: Nối→requestthànhcông; cắt→requestlỗi; nốilại→phụchồi. Không thêm observed edge giả từ static relation.
- Kiểm chứng: Prepared Docker test và browser gesture/connection list; đối chiếu requestCount/errorRate.

### T30 [P4] Workload và số đo có provenance
- Phụ thuộc: T28,T29.
- Thực hiện: Độ trễ HTTP/DB/source phải lấy telemetry thật. Hiển thị không có số liệu khi chưa đo; giải thích giới hạn GET/HEAD replay hiện có. Không tăng replica rồi tự gán latency thấp.
- Hoàn tất khi: Mỗi comparison giữ sample/traceIDs. POST không bị replay gây side effect ngoài contract.
- Kiểm chứng: Runner workload tests; một scenario GET và một scenario POST kiểm expected execution count.

### T31 [P4] Snapshot Live trước và sau
- Phụ thuộc: T28,T30.
- Thực hiện: Capture ảnh PNG + explanation + displayed observedAt và scoped telemetry. Chặn capture khi pending hoặc sample stale. Snapshot download/canvas đủ dùng đọc.
- Hoàn tất khi: Có ít nhất baseline và after trong session; digest thay đổi khi bằngchứng khác. Refresh không mất snapshot server.
- Kiểm chứng: RuntimeStudio tests/browser + filePNGđọcđược; stale telemetry phải409 chứ khôngfake success.

### T32 [P4] Finish, signed receipt và cleanup
- Phụ thuộc: T31.
- Thực hiện: Finish chỉ sau confirmed action; đợi pending settle; preserve traces, ký receipt, cleanup container/network và cậpnhật COMPLETED/evidence/cleanup độc lập.
- Hoàn tất khi: Receipt thuộc đúng source/model/session/action. Không còn allocation thuộc test. Có thể đọc snapshot sau Finish.
- Kiểm chứng: Real managed Docker + HMAC validation/receipt idempotency; không đếm container ngoài project test.

### T33 [P4] Phiên Live sinh viên từ topology Lab frozen
- Phụ thuộc: T19,T22,T32.
- Thực hiện: Dùng student working project/source clone đúng assignment. Session sinhviên riêng kếthừa topology assignment frozen, khôngdùng profilemới nhất của giáo viên để ghi đè. Chặn student freeze/điều khiển session lecturer.
- Hoàn tất khi: S1 mở đúng cấu hình được giao sau Quiz; không reuse teacher session làm evidence bài nộp của S1.
- Kiểm chứng: RuntimePlanning/ownership tests và một session studentthật; giữ assignment_id/source/model trong manifest.

### T34 [P5] Backend nộp bài theory-only v2
- Phụ thuộc: T08,T24.
- Thực hiện: Nhận đápán/giảitrình các section được giao và Quiz PASSED thực. Lưu evidence version/identity, không bắt model/diagram do sinhviên chọn. Có thể giữ refsource metadata server-side.
- Hoàn tất khi: Submit thiếu section/Quiz fail trả lỗi rõ. Submit đầy đủ tạo bài bấtbiến đọc lại được.
- Kiểm chứng: Service và HTTP acceptance với lecturer+S1; lỗi crossassignment/unknownsection phải bị chặn.

### T35 [P5] Backend nộp bài Studio v2
- Phụ thuộc: T33,T34.
- Thực hiện: Yêu cầu student session verified khớp bài/source/model và cleanup receipt, clone snapshots từ server. Từ chối teacher session, sessionLabkhác và evidencecục bộ giả.
- Hoàn tất khi: Bài v2 chứa Quiz+theory+Studio thật mà UI không chọn diagram. Không mất các capture vì guided=true.
- Kiểm chứng: SubmissionService/RuntimeStudio integration, thử cả payload hợp lệ và sửa sessionId.

### T36 [P5] Digest và dữ liệu bất biến của bài nộp
- Phụ thuộc: T34,T35.
- Thực hiện: Canonical digest bao gồm nội dung section, Quiz/version, source identities và Studio snapshots/receipt. Tránh hash UUID ngẫu nhiên thay evidence. Sửa lesson/refprofile sau nộp không đổi export cũ.
- Hoàn tất khi: Export cũ giữ ảnh, lýthuyết/Quiz và cấu hình tại thời điểm nộp; giátrị digest ổn định khi đọc lại.
- Kiểm chứng: Test submit→sửa draft giáo viên/telemetry mới→đọcexport; không mutate frozen JSON.

### T37 [P5] Form nộp v2 trong Lab
- Phụ thuộc: T34,T35.
- Thực hiện: Thêm form theo required sections trong cùng ngữ cảnh bài. Theory-only và Studio Lab có nội dung đúng. Legacy SubmissionComposer được giữ cho modelegacy.
- Hoàn tất khi: Không có selector diagram/model trên bài v2. Answers không mất khi submit lỗi hoặc quay lại phần trước.
- Kiểm chứng: Browser hai mode mới và một legacy; accessible labels, validation section, chống double-click.

### T38 [P5] Draft giải trình và phục hồi
- Phụ thuộc: T37.
- Thực hiện: Nếu đã có API draft thì dùng; nếu chưa, chỉ thêm cách lưu nháp tối thiểu phù hợp contract. Local draft phải có namespace user/workspace/assignment/version và xóa đúng khi submit/logout.
- Hoàn tất khi: Reload giữ draft trong phạm vi được thiết kế; đổi tài khoản không thấy draftngười khác. Tránh tự hứa autosave nếu chưa lưu xong.
- Kiểm chứng: Test failure/reload/user switch; ghi rõ UI Lưu nháp hay chỉ giữ trong phiên.

### T39 [P5] Bài nộp trùng và retry mạng
- Phụ thuộc: T34,T37.
- Thực hiện: Giữ semantics repeat submit/idempotency theo contract. Nếu request response mất, UI kiểm trạngthái trước tạo submission khác. Không cho nộp mới sau Guided Lab PASSED nếu backend đang khóa.
- Hoàn tất khi: Hai click không tạo hai bài ngoài ýmuốn. Nộplại bài trảvề tạo revision/bản đúng hợpđồng.
- Kiểm chứng: Concurrent service test hoặc HTTP retry, UI pending/recovery.

### T40 [P5] Lịch sử bài nộp và bản export
- Phụ thuộc: T36,T37.
- Thực hiện: Sinhviên xem bài theo lớp/Lab và trạngthái thật. Lecturer tải đúng frozen artifact; thiếu ảnh có thôngbáo. Download tênfile và scope ổnđịnh.
- Hoàn tất khi: Không leak submission người khác; oldsubmission vẫn render; legacyoptionalfields khôngcrash.
- Kiểm chứng: Browser S1/S2 và export integration, response size/error handling.

### T41 [P6] UI chấm theo section v2 và snapshot legacy
- Phụ thuộc: T40.
- Thực hiện: GradeForm đọc required items từ frozen submission. Hiểnthị theoryanswers/Quizevidence/Studiosnapshots có chủđề rõ. Bài legacy vẫn theo snapshotgradescũ.
- Hoàn tất khi: Giáoviên đọc được câu trảlời và chứngminh từngsection trước khi chấm, không phải rawJSON.
- Kiểm chứng: Browser review v2/legacy, snapshot PNG/receipt metadata mở được.

### T42 [P6] Lưu chấm nháp và công bố điểm
- Phụ thuộc: T41.
- Thực hiện: Draft cho partialscore; publish phải đủ từng mục, mỗi mục hợp lệ0..10, summary bắt buộc. Không ép đưa điểm mặcđịnh thay mục bỏtrống.
- Hoàn tất khi: Student không thấy draft. Save reload giữ partialgrades. ExpectedRevision ngăn overwrite stale.
- Kiểm chứng: SubmissionReviewServiceTest + HTTP haiuser; UI 409 reload giữdraft và giải thích.

### T43 [P6] Trả bài và vòng sửa/nộp lại
- Phụ thuộc: T39,T42.
- Thực hiện: Teacher RETURNED kèm lýdo. Student thấy feedback và mở đúng Lab để sửa, tạoevidence/student session mới khi cần. Bài cũ không bị sửa tại chỗ.
- Hoàn tất khi: Vòng returned→revision→resubmit→grade chạy được; danh sách giữ rõ bản nào đang được chấm.
- Kiểm chứng: E2E theory-only trước, Studio nếu runtimekhảdụng. Kiểmfreezeartifactcũ khôngđổi.

### T44 [P6] Luật đạt và mở khóa bài tiếp theo
- Phụ thuộc: T42,T43.
- Thực hiện: Mọi section/snapshot bắtbuộc phải >5.0 cùngsummary theo approvedv2, không dựa chỉ điểmtrungbình. Quiz tựchấm và grade giảngviên phân biệt.
- Hoàn tất khi: Mộtsection5.0 dù tổngcao vẫn NEEDS_REVISION. Tấtcảmục>5 mởLabkếtiếp mộtlần.
- Kiểm chứng: Grade thresholds tests 5/5.01; HTTP progression/event idempotency.

### T45 [P6] Sửa bài đã công bố và version cũ
- Phụ thuộc: T09,T36,T44.
- Thực hiện: Sửa Course qua draft/version. Sửa Quiz tạo versionmới; session/submission đãfrozen giữbằngchứng cũ. Giữ khóa kếtquả GuidedLab PASSED hiệncó. Không backfill tựđộng.
- Hoàn tất khi: Teacher edit không làm bài nộp cũ mất dữliệu hoặc grade; UI phân biệt đang sửa nháp và bản học sinh thấy.
- Kiểm chứng: E2E publishv1→submit→editv2→reviewv1; regression version gate.

### T46 [P6] Nhiều lớp, nhiều Lab và phân quyền
- Phụ thuộc: T19,T40,T45.
- Thực hiện: Đối chiếu BFF/backend các API mới với owner/workspace/assignment/session. Student ngoài lớp không đọc source/receipt/grade. Lecturer không tựchấm bài chínhmình nếu contractcấm.
- Hoàn tất khi: Negativecases403/404 phùhợp; không chỉ ẩn buttonUI. JSON artifacts redacted.
- Kiểm chứng: HTTP acceptance crossworkspace, arbitraryID, publisher/student roles và snapshot scope.

### T47 [P7] Hoàn thiện UI sinh viên đang WIP
- Phụ thuộc: T20,T23,T37.
- Thực hiện: Dùng prompt refactor đãchốt: MyCourses/Class LMS, LabCoursera, thưviện thamkhảo phụ, Passkey dialog/deeplink, bài nộp và kết quả rõ. Tôntrọng WIP đãmanifest ởT01.
- Hoàn tất khi: Không có hero dư hoặc giáo trình đẩy lớp xuốngcuối; vẫn đủ chức năng. Không rewrite kiếntrúcUI đanghoạtđộng.
- Kiểm chứng: Browser light/dark EN/VI và viewport desktop/mobile. Hoànthiện chỗlỗi thay refactor lặp.

### T48 [P7] Accessibility, văn bản và trạng thái form
- Phụ thuộc: T13,T37,T47.
- Thực hiện: Kiểm label/focus/keyboard, input type, pending/error/empty, câu báo lỗi dễhànhđộng. Tên dài, Markdown dài, class trống và giờ địa phương phải đọcđược.
- Hoàn tất khi: Đi quaform bằngbànphím, dialog trảfocus, khôngoverflow ở390px. Khônglộ note kỹthuật thừa trong luồnghọc.
- Kiểm chứng: Browser assertions/a11y checks hiện có; ảnh review từngtrang chính.

### T49 [P7] Snapshot/video Sandbox hồi quy
- Phụ thuộc: T47.
- Thực hiện: Xử lý test snapshotcount expected0got1 nếu còn táihiện. Kiểm IndexedDB theo browsercontext/user, delete persist, quayvideo đủ thời gian, downloadplayback. Không gộp video cục bộ thành bằngchứngLive server.
- Hoàn tất khi: Một test chắc chắn côlậpstate, snapshotdelete+reload đúng. Quay30giây khi idle giữ được duration xấp xỉ30giây.
- Kiểm chứng: studio-workbench.browser.cjs và một bài video thời gian thực; không xóa assertion chỉ để xanh.

### T50 [P7] Hồi quy API route/BFF và boundary
- Phụ thuộc: T34,T42,T46.
- Thực hiện: Rà PUT/PATCH/DELETE/GET và allowlist cho contractmới; status/validation/response shape xuyênBFF. Giữ sửa lỗi read-onlylocking và ZIP Windows.
- Hoàn tất khi: Không còn405/500 cho luồng hợp lệ. Authheader/requestsecret khônglog. Legacy API vẫn qua tests.
- Kiểm chứng: Focused frontendcontract, backendintegration và route-smoke hiệncó.

### T51 [P7] Chạy full regression có chọn đúng test mới
- Phụ thuộc: T07,T46,T49,T50.
- Thực hiện: Sau focusedtests xanh, chạy typecheck/frontendsuite/build/routes và nhóm Java/Worker CI. Bổsung các testv2mới vàonguồn CI. XácđịnhcaseDocker opt-in khôngđược tínhnhầmlàPASS.
- Hoàn tất khi: Có manifest command exitcode SHA sốpass/fail/skipped. Không dùng Surefire reportcũ làmrunmới.
- Kiểm chứng: Theo workflowhiệnhành và mứcSDK. Nếu chỉsubsetchạyđược, ghi scope rõ; sửa failure liênquan rồi chạylại nhómđó.

### T52 [P7] E2E local xuyên suốt hai Lab
- Phụ thuộc: T18,T24,T33,T44,T51.
- Thực hiện: Dùng browser real backend+Postgres riêng+RunnerDocker để teacher author/publish; S1 join/Quiz/theory; theory-onlysubmit/gradepass; Studiolabstart/change/capture/finish/submit/return/resubmit/grade/unlock.
- Hoàn tất khi: Có ảnh đủ vai trò, source/model/session/receipt/submission/review IDs và cleanup. Không dùng teacher session thaystudent.
- Kiểm chứng: Harness assert mọi bước, không chỉ HTTP200. NếuDockerblocked chạy theory-only cùngnegativecases và ghi blockStudio.

### T53 [P8] Rà diff và chuẩn bị commit nhỏ
- Phụ thuộc: T51,T52.
- Thực hiện: Review từng file so với baseline. Không stage fixture JSON/log/script của agentkhác nếu chưa thuộc task. Tách schema/backend/contracts/UI/tests/docs thành các commit cónghĩa khi đủ ổn định.
- Hoàn tất khi: Diffcheck qua. Commit chỉ chứa deliverable; generatedlogs/key/backup khôngtrack. Có kếhoạchrollback additive.
- Kiểm chứng: git diff --check; git diff --cached; so sánhstatvới ledger. Không forcepush hoặc massformat.

### T54 [P8] Theo dõi GitHub CI và xử lý lỗi đến cuối
- Phụ thuộc: T53.
- Thực hiện: Khi có quyền push đã được người dùng duyệt cho nhánh làmviệc, đẩy commit và theo dõi run chính xác theo SHA. Nếu key/credential thiếu, lưucommitlocal và tiếp tục taskđộc lập. Không tự tìm secret trong lịch sử.
- Hoàn tất khi: RunđúngSHA cóconclusion. Nếu fail, lấy lỗiđầutiên đúngjob và sửa; không kếtluận từwebsite200 hoặc logruntrước.
- Kiểm chứng: GitHubActions API/gh theo repo credential. Bằngchứngverify/images/deploy riêng, không chép token vào docs.

### T55 [P8] Deploy và smoke môi trường được phép
- Phụ thuộc: T54.
- Thực hiện: Nếu quyền deploy hiệnhành của task và credential đã có cho môi trường đích, dùng pipeline chuẩn cóbackup/probe/health/rollback. Nếu thiếu quyền cụ thể, ghiBLOCKED và tiếp tục docs/local; không hỏi lặp suốtđêm.
- Hoàn tất khi: SHA deployed khớp release pipeline và healthfrontend/backend/worker. Không sửasecret/VPS thủcông để nétest.
- Kiểm chứng: Không chạy Flywayclean/schemaDDL tay trênprod. Probe migration mới phải được PostgreSQLtest trước.

### T56 [P8] E2E staging/production trong không gian test
- Phụ thuộc: T52,T55.
- Thực hiện: Nếu môi trường đượcphép và có testaccounts đúngvai, tạo lớp/bài riêng cóprefix task; testteacher→student→Live→submit→grade. Không sửa lớp/thànhviênthực. Nếu không có credentials, báo đúng tên biến/capability thiếu.
- Hoàn tất khi: Báocáo rõ local/staging/prod và các bước đãverify. Cleanup chỉ dữliệu/phiêntest do run tạo, bảotoàn evidence cần review.
- Kiểm chứng: Ảnh/logredacted theo taskrunID; requestID/receiptSHA khớp; không đọcpassword từ screenshot/chat.

### T57 [P9] Đối chiếu và cập nhật docs nguồn sự thật
- Phụ thuộc: T52.
- Thực hiện: Cập nhật projecthandoff, LabauthoringUI và studentguide theo hànhvi đã triểnkhai. Đánh dấu phần kếhoạch cũ bị thaythế và sốmigration thật. Tách scope gốc và extension.
- Hoàn tất khi: Agent mới đọc được đúng cách tạo/sửa/học/nộp/chấm mà không cần chat. Không còn mục trạngthái lỗi cũ được ghi nhưhiệnhành.
- Kiểm chứng: Kiểm linkfile tồn tại, tênAPI/routekhớpcode; mỗi claimPASSdẫnrun/SHA.

### T58 [P9] Tổng kết từng task và blocker cụ thể
- Phụ thuộc: T01,T57.
- Thực hiện: Cậpnhật ledger đầyđủ PASS/FAIL/BLOCKED/SKIP-NOT-NEEDED, côngviệc đã làm, files, testcommand/exit và residualrisk. Blocker cócách khôi phục cho sángmai.
- Hoàn tất khi: Không để task đangWORKING khi dừng. Không tickdone vì đã đọccode. Tách hànhvi đãđo và chỉsuyra.
- Kiểm chứng: Đọc toànprogresslog ngắn trước kếtluận; sửa contradictions trong docs.

### T59 [P9] Báo cáo sáng mai và đường tái hiện
- Phụ thuộc: T58.
- Thực hiện: Viết báo cáo mộttrang gồm nhánh/SHA, luồngđãpass, liênkếtartifact, CI/deploy, migration và 3ưu tiên cònlại. Có lệnh mởlocal UI và cáchlogin test quaenv đượcphép.
- Hoàn tất khi: Ngườidùng quaylại làmtheo được mà không đọc toàn log. Không lộaccountsecret.
- Kiểm chứng: Dẫn filecode/ảnh/run thực. Không tuyênbố100% nếu partblocked.

### T60 [P9] Dọn tài nguyên task và chốt bàn giao
- Phụ thuộc: T59.
- Thực hiện: Dừng process/container helper do chính task tạo khi không còn cần, dọn tempbuild thử có ownership rõ. Giữ image/volume dùngchung và dịchvụ người dùng. Ghi port/process cònchạy nếu cần review.
- Hoàn tất khi: Không còn mavisrun allocation task bỏquên. Source/WIP người dùng nguyênvẹn. Ledger vàhandoff đãlưu.
- Kiểm chứng: docker ps filter projectlabel; processPID manifest; git status cuối; không systemprune hoặc volumeremove đại trà.

## Nghiệm thu cuối và báo cáo sáng
Chỉ gọi full E2E PASS khi cùng dataset có bằng chứng teacher tạo/publish → student Quiz → Live thật nếu cần → snapshot/Finish → submit frozen → teacher RETURNED → sửa/nộp lại → publish grading → student thấy điểm → unlock Lab tiếp, cùng case theory-only và một legacy smoke.
Nếu chưa đạt, báo PARTIAL và chính xác đoạn cuối đã đạt, blocker, task tiếp theo. Không quy mọi lỗi cho môi trường: tách lỗi sản phẩm, test, cấu hình và thiếu quyền.
Tạo docs/MAVIS_E2E_MORNING_REPORT_2026-11-17.md với: SHA/branch; task hoàn thành; file/behavior thay đổi; lệnh và kết quả mới; artifact; local/staging/production riêng; migration/deploy; tài nguyên cleanup; WIP giữ nguyên; blockers; ba bước tiếp theo.
Không nhét secret hoặc raw evidence chứa thông tin tài khoản vào báo cáo. Dừng khi đạt scope hoặc hết thời gian phiên; không tự bịa thêm task sau backlog.

