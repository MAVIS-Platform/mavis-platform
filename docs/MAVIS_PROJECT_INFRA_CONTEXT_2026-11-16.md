# Context dự án và hạ tầng MAVIS cho Claude

Cập nhật ngày 16/11/2026, Asia/Saigon. Tài liệu này dùng cùng Ultimate Docs và project handoff để agent mới làm việc với cả sản phẩm, source code và môi trường vận hành.

## Bắt đầu một phiên mới

Workspace chính là C:/Users/nhuth/Desktop/MAVIS-Root/mavis-platform. Chạy git status --short --branch và git log -5 --oneline trước khi sửa. Đọc docs/MAVIS_PROJECT_HANDOFF_2026-11-16.md để biết luồng sản phẩm và code map. Đọc tài liệu này để biết Git, máy local, CI, VPS và dữ liệu.

Ultimate Docs giữ scope gốc sau Review 2. Phần bổ sung được người dùng duyệt trong hội thoại được ghi riêng ở cuối Ultimate và trong PREPARED_LIVE_STUDIO.md. Mtime chỉ giúp tìm tài liệu vừa cập nhật; không phải căn cứ ghi đè yêu cầu nghiệp vụ. Khi tài liệu mô tả trạng thái khác code, dẫn rõ SHA, file và bằng chứng quan sát.

Các DOCX Review 2 và audio được người dùng cung cấp ở những phiên đầu. Lần kiểm tra ngày 15/11 không còn thấy thư mục docs/Docs after review 2 tại checkout. Không khẳng định đã đọc lại nguyên văn các tài liệu đó nếu chưa tìm được chúng. Dùng các bản Markdown hiện có với mức xác minh phù hợp.

## Phạm vi sản phẩm sau Review 2

MAVIS phục vụ học kiến trúc microservices trên curated repo đã chuẩn bị. Giảng viên quản lý lớp, nguồn tham chiếu, Lab, Quiz và topology. Sinh viên qua Passkey, phân tích tĩnh, Quiz Gate rồi thực hành runtime. Bài nộp đóng băng bằng chứng và được chấm theo từng snapshot để mở khóa Lab tiếp theo.

- WF-01 quản lý lớp, nguồn, Lab, Passkey và progression.
- WF-02 phân tích AST Java/C#, cấu hình Compose, C1–C3, dependency graph, 3E và Quiz có phiên bản.
- WF-03 chạy Docker thật, thu OTel, thực thi Start/Stop/Scale, so sánh Before/After và tạo receipt.
- WF-04 đóng băng submission và chấm snapshot. Mọi snapshot cần lớn hơn 5.0/10 cùng giải trình để đạt Guided Lab theo luật hiện có.

Sandbox và Live chia sẻ nhiều thành phần giao diện nhưng có nguồn dữ liệu khác nhau. Sandbox tính mô phỏng và lưu ảnh/video trong trình duyệt. Live cần container, telemetry, acknowledgement và evidence thật. Đừng suy rằng một nút Sandbox đã có runtime tương ứng.

Prepared Live là phần mở rộng được duyệt sau scope gốc. Block ánh xạ service đã ghim. Add/Remove là START/STOP. Clone replica là SCALE có giới hạn 1–8, chỉ cho canScale. Dây ánh xạ route-controller thực trong đường gọi của ứng dụng. Nối/cắt là START/STOP controller. Xem contract v1, initiallyStopped, health checks và sample tại PREPARED_LIVE_STUDIO.md.

## Kiến trúc code và đường đi dữ liệu

- MAVIS-Frontend là Next.js/React/TypeScript. Trình duyệt gọi lớp API/BFF của frontend, frontend gọi Java backend qua MAVIS_JAVA_URL. API thực ở /api/v1.
- MAVIS-Platform/mavis-be là Maven reactor, Java 21, Spring Boot. Các module quan trọng là mavis-common, mavis-platform, mavis-analyzer và mavis-bootstrap.
- MAVIS.Worker là .NET solution. Worker phục vụ phân tích C# và artifact theo grant. MAVIS.Runner thực thi Docker runtime và giao tiếp với Java qua service authentication.
- Mô hình tĩnh và source snapshot là dữ liệu ghim phiên bản. Runtime enrichment và trace có scope riêng.
- PostgreSQL lưu tài khoản, lớp, source/model, phiên runtime, action history, snapshot evidence và submission. Source/artifact cũng dùng volume lưu trữ.

Đọc code theo workflow đang sửa. Điểm vào Studio, submission và grading đã có trong project handoff. Phần soạn khóa học mới dùng CourseAuthoringController tại /api/v1/workspaces/{workspaceId}/course và các API draft/publish. V35 bổ sung course_definitions, course_versions, course_modules và course_items.

V34 đóng băng topology ở assignment. Tài liệu Studio handoff cũ có thể còn nói topology chỉ ghim theo phiên; hành vi Guided Lab mới dùng assignment frozen topology trước, có fallback cho dữ liệu cũ. Đọc code Course setup/freeze và PREPARED_LIVE_STUDIO trước khi thay đổi.

## Repository và Git

Repo chính là https://github.com/MAVIS-Platform/mavis-platform, nhánh production là main. Repo được mở public theo yêu cầu người dùng để dùng runner GitHub Actions tiêu chuẩn miễn phí. Main push kích hoạt pipeline và có thể deploy production.

Repo seed riêng là https://github.com/MAVIS-Platform/mavis-studio-live-seed. Checkout local nằm ở C:/Users/nhuth/Desktop/MAVIS-Root/mavis-studio-live-seed. Mốc đã kiểm tra là be7df9b. Seed có orders, payment và orders-payment-route. Đọc README và topology.example.json trong repo đó khi dựng bài thử.

Ngày 16/11 đã sửa cấu hình Git local của repo chính:
- Origin hiện dùng HTTPS.
- Bỏ core.sshCommand trỏ tới key tạm ở /sessions/inspiring-zen-davinci/.ssh/id_ed25519_github_mavis, vì file đó không tồn tại trên máy Windows hiện tại.
- Git fetch/push qua HTTPS đã hoạt động bằng credential helper. Thay đổi này nằm trong .git/config của máy, không nằm trong commit.

Git authentication, GitHub CLI/API authentication và SSH deploy VPS là ba cơ chế khác nhau. Nếu gh báo chưa đăng nhập, không suy ra Git push hoặc deploy SSH bị hỏng. Có thể dùng credential helper hiện có để cấp GH_TOKEN trong bộ nhớ của tiến trình cho đúng repo khi được phép. Không in credential fill ra màn hình, ghi token vào file hoặc commit token.

Các thư mục mavis-review2-origin và mavis-studio-session là checkout/worktree lịch sử. Không phát triển đồng thời vào chúng nếu chưa kiểm tra nhánh và trạng thái. Stage đúng các file của task. Không reset hoặc dọn thay đổi của agent khác.

Lịch sử repo từng được làm sạch khóa API bị commit trong test. Khóa phải được chủ tài khoản thu hồi ở nhà cung cấp. Xóa source/Git không tự thu hồi khóa và commit cũ có thể còn ở GitHub caches/PR refs. Không lấy khóa từ lịch sử Git làm fixture hay đưa trở lại branch mới.

## Production và VPS

Website public là https://maviss.site. Nhóm dùng VPS 165.99.14.61, user deploy root theo thông tin trong phiên Claude và ảnh người dùng. Giá trị DEPLOY_HOST/USER thực nằm trong GitHub secrets; không đọc được nội dung bằng secret list.

Đợt sửa deploy này xác minh remote execution qua Actions, không đăng nhập VPS thủ công. Không khẳng định cấu hình firewall, SSH daemon, key mới của Claude hay phiên bản Docker trên VPS đã được kiểm tra lại trực tiếp.

Mô hình production theo deploy/compose.production.yml:
- Compose project name mavis.
- frontend phục vụ port 3000, mặc định bind 127.0.0.1 trên host.
- frontend gọi backend:8080.
- backend gọi worker:8080, dùng PostgreSQL ngoài stack qua TLS.
- backend có Docker socket và mount /tmp/mavis-runner-state để điều khiển phiên runtime trên host.
- backend và worker chia sẻ volume data cho source/artifact.
- Nginx/HTTPS và draw.io là cài đặt bên ngoài ba service Compose chính. Đọc cấu hình VPS thực trước khi thay chúng.

Thông tin provider DB Aiven/PostgreSQL 18 có trong CLOUD_DATABASE_ROLLOUT.md là lịch sử rollout. Kết nối DB hiện hành phải lấy từ cấu hình đang vận hành qua quy trình bảo mật. Lần này chỉ xác nhận deploy script truy cập và kiểm tra schema thành công.

Các đường dẫn trên VPS:
- /opt/mavis/.env.production giữ cấu hình runtime và secret.
- /opt/mavis/deploy/compose.production.yml là Compose đang dùng.
- /opt/mavis/.release.env giữ IMAGE_PREFIX và IMAGE_TAG đã phát hành.
- /opt/mavis/incoming-<SHA> là gói chuẩn bị của một commit.
- /opt/mavis/releases là bản Compose/metadata trước deploy để rollback.
- /opt/mavis/db-backups giữ backup PostgreSQL trước migration.
- /tmp/mavis-runner-state là state runtime dùng chung với backend.

Không ghi nội dung .env.production, key, backup DB hoặc dữ liệu tài khoản vào docs/log/chat. Các file backup có thể chứa dữ liệu nhạy cảm. Source code có Docker socket không có nghĩa container bài tập được quyền mount socket; Compose Preflight của workload vẫn kiểm tra các quyền bị cấm.

## Cấu hình cần biết

Chỉ liệt kê tên, không điền giá trị thật:
- PostgreSQL dùng MAVIS_DB_URL, MAVIS_DB_USERNAME, MAVIS_DB_PASSWORD.
- Auth dùng MAVIS_JWT_SECRET và MAVIS_GOOGLE_CLIENT_ID cùng các biến được profile/backend yêu cầu.
- Java–Worker dùng MAVIS_WORKER_SERVICE_KEY, MAVIS_WORKER_GRANT_KEY.
- Runner callback dùng MAVIS_RUNNER_SERVICE_KEY.
- Protected runtime input dùng MAVIS_RUNTIME_ENVIRONMENT_KEY. Không đổi tùy tiện vì dữ liệu cũ đã mã hóa có thể cần khóa hiện hành.
- Runner cần image collector/scenario-runner ghim digest, instrumentation bundle, state root và profile đã duyệt.
- SMTP/AI và các giá trị vận hành khác theo .env.production và Compose, không theo suy đoán từ .env example.

Thiếu môi trường, credential, source mapping hay image sẽ được phản ánh bởi readiness/preflight. Không tạo telemetry giả để chuyển trạng thái sang ready.

## CI và deploy hiện hành

Workflow .github/workflows/deploy-production.yml chạy cho main push, PR main và workflow_dispatch. Luồng chính là verify → images → deploy. PR chỉ kiểm tra theo điều kiện của workflow. Production chỉ deploy commit còn là head của main, dùng concurrency serialize.

Verify chạy test Java, .NET Worker, TypeScript, frontend, build/route smoke và các bài deploy/schema. Images backend/frontend/worker được đẩy lên GHCR với tag đầy đủ commit SHA. GitHub token ngắn hạn dùng để publish/pull registry.

Secrets deploy có DEPLOY_HOST, DEPLOY_USER, DEPLOY_SSH_KEY và DEPLOY_KNOWN_HOSTS. Key phải khớp authorized key trên VPS. Secret list chỉ trả tên và thời gian cập nhật, không trả giá trị.

Deploy kéo image, chuẩn bị schema/backup trước khi thay container, rồi kiểm tra frontend /api/auth-config, backend /v3/api-docs, worker /api/health/ready và public HTTPS. Nếu health fail, script phục hồi Compose và image trước. Rollback image không xóa schema additive đã áp dụng.

Không bật Flyway tự động cho DB production đã quản lý schema thủ công mà chưa đối chiếu lịch sử. V26–V35 hiện được script apply-course-schema.py kiểm tra theo probe. Mã exit 255 được retry như lỗi SSH. Mã khác được giữ là lỗi lệnh remote.

## Bằng chứng chốt deploy ngày 16/11

Commit code đã deploy là 612836d34ef7607e9c2c3807a8191974ffe8c213.
Run #353 là https://github.com/MAVIS-Platform/mavis-platform/actions/runs/43848625455.
Run đã completed/success, verify/images/deploy đều qua.
Log ghi V35 schema already present và Deployment healthy đúng SHA trên.
Website và /api/auth-config đều HTTP 200 khi xác minh sau deploy.

Nguyên nhân run #352 fail là probe V35 yêu cầu sai tên index. Migration tạo uq_course_module_position và uq_course_item_position. Probe cũ yêu cầu ix_course_modules_course_position và ix_course_items_module_position. Schema đã có nhưng probe báo partial. Không có bằng chứng cần thay SSH secrets để sửa sự cố này. Đọc DEPLOY_V35_CLAUDE_HANDOFF.md để có chi tiết và kiểm thử.

Bằng chứng health này không thay cho nghiệm thu tính năng bằng tài khoản thật. Cần ghi riêng SHA test, dữ liệu bài tập, thao tác và kết quả đo cho từng luồng sản phẩm.

## Môi trường local và kiểm thử

- Máy Windows, PowerShell, múi giờ Asia/Saigon.
- Frontend dùng Node/npm. Chạy npm run typecheck, npm test và các browser test liên quan.
- Java dùng JDK 21 và Maven wrapper trong MAVIS-Platform/mavis-be.
- Worker SDK được ghim tại MAVIS.Worker/global.json. Máy local từng có SDK thấp hơn bản được ghim. Dùng đúng SDK hoặc ghi rõ cách chạy và phần chưa xác minh.
- Docker local phải chạy Linux Engine. Kiểm tra docker info, không nhầm localhost với DB production.
- Unit test không cần DB dùng endpoint loopback không hoạt động để tránh vô tình kết nối thật. Integration dùng container/database riêng và dọn tài nguyên do test tạo.
- Deployment rollback test chạy trong container Linux python:3.12-slim giống CI. Chạy trực tiếp từ Git Bash Windows có thể lỗi /opt hoặc MSYS, không chứng minh script production hỏng.
- Python test chuẩn: python -B -m unittest discover -s deploy/tests -p test_course_schema.py. Test V35 thật chỉ bật khi MAVIS_TEST_PG_CONTAINER trỏ tới PostgreSQL thử cô lập. Không đặt biến đó tới DB production.

## Việc tiếp tục và tiêu chí xong

1. Nghiệm thu UI bằng tài khoản giảng viên/sinh viên thực trong môi trường được phép. Lưu ảnh/trace/snapshot và kết quả chấm, không chỉ ghi test PASS.
2. Kiểm tra Course Setup, topology freeze V34 và soạn khóa học V35 theo luồng mới. Đối chiếu API controller và test hiện tại.
3. Kiểm tra pipeline còn thiếu các test mới trong danh sách regression. Test compile được không có nghĩa đã được chọn chạy.
4. Với lỗi deploy, tìm lỗi đầu tiên trong log. Nếu đã kéo image và probe schema, SSH đã thực thi lệnh remote. Xử lý lỗi ở tầng quan sát được.
5. Kết luận task dựa trên bằng chứng. Không công bố 100% sản phẩm chỉ vì health check và CI xanh.

## Kiểm tra code bổ sung trong task bàn giao

Tại đầu task, main và origin/main đều ở 612836d, workspace sạch. Run #353 đã kiểm tra bộ regression đang chọn, build và deploy thành công. Các test UI hai tài khoản là mục cần nghiệm thu riêng.

CourseAuthoringServiceTest được chạy bổ sung bằng Maven unit test với DB loopback không hoạt động và qua 8/8, không skip. Đã thêm tên test này vào Backend regression tests của workflow để tránh bỏ sót trong các lần CI tới. Các test soạn khóa học thuộc phần V35 cần được duy trì khi sửa draft/publish.

Tài liệu handoff cũ đã được cập nhật mốc production, kết luận V35 và thứ tự đọc context. Các con số test lịch sử còn lại được giữ kèm chú thích, không được coi là kết quả mới chạy trong task này.