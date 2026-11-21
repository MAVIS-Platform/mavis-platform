# WF-02 · Phân tích Tĩnh Curated Repo (C1–C3, 3E), Reverse BFS và Quiz Gate

Hợp đồng kỹ thuật, điểm bàn giao liên workflow (`C01 -> C02 -> C03 / C04`) và biên bản đối chiếu nghiệm thu BM04 cho phạm vi WF-02 (Owner: Lê Minh Triết · SE181979). Checkout `main` đối chiếu sau hợp nhất Chặng 1–5 là `49822ad`.

## Quy tắc nghiệp vụ (`BR-04`, `BR-05`, `BR-06`) & Quyết định thiết kế (`D2`, `D4`)

- **BR-04 · Curated Source & Project Isolation:** Trong lớp học tuần tự (`course_mode = true`), dự án thực hành của sinh viên phải được tạo từ `referenceSnapshotId` thuộc cùng workspace (`ProjectServiceImpl`); yêu cầu clone snapshot từ lớp khác hoặc nộp ZIP/GitHub URL tự do ngoài phạm vi cho phép bị chặn (`HTTP 403`). Bản ZIP tham chiếu được đối chiếu toàn vẹn qua SHA-256 (`HTTP 409` khi lệch digest); URL GitHub phải khớp `https://github.com/<owner>/<repo>` với commit SHA 40 hoặc 64 ký tự hex (`GitHubRepositoryUrls`).
- **BR-05 · Static Architecture C1–C3 & 3E Grounding:** Mọi lượt phân tích hợp lệ tạo `SourceSnapshot` và `ModelVersion` có `revision` tăng dần độc lập; nếu lượt phân tích mới `FAILED`, phiên bản hợp lệ trước đó vẫn giữ `is_latest_valid = true`. Trong Guided Lab, API đồ thị và tài liệu kiến trúc giới hạn sinh viên ở chế độ tĩnh gồm `C4_CONTEXT`, `C4_CONTAINER`, `C4_COMPONENT` và `DEPENDENCY_GRAPH` (`CourseworkDiagramTypes.GUIDED_STATIC`), đồng thời chặn yêu cầu sinh/xem/xuất `UML_SEQUENCE`, `UML_ACTIVITY`, `UML_STATE` bằng `HTTP 400`.
- **BR-06 · Quiz Gate & Prerequisite Unlock:** Hệ thống cung cấp bộ giáo trình 30 bài học kèm 120 câu hỏi trắc nghiệm chuẩn hóa Java/C# (`java-csharp-v1.json`: 18 bài Java, 12 bài C#, 4 câu/bài). Nộp bài đạt từ `passPercent` trở lên (mặc định `70%`) ghi nhận `PASSED` cho `(assignment_id, quiz_version)` và mở khóa Bước 3 (Live Docker Runtime) qua `CourseLabPolicy.requireRuntimeReadiness(project)`. Điểm dưới ngưỡng ghi `NEEDS_RETRY` và giữ khóa Runtime (`HTTP 403`). Khi giảng viên công bố phiên bản Quiz mới, bài kiểm tra hiện hành yêu cầu đạt trên version mới trong khi bằng chứng đã đóng băng ở các submission trước không bị mất.
- **D2 · Epistemic Honesty, 3E & Zero-Leak AI:** Cạnh `SERVICE_HTTP_CALL` chỉ được xem là có bằng chứng đầy đủ khi trích xuất được invocation `CALL_SITE` với `locator` và `excerpt` hợp lệ; các cạnh chỉ có config/interface metadata bị gắn `status = NEEDS_REVIEW`, `evidenceSufficiency = UNVERIFIED_METADATA_ONLY`, tách bạch khỏi `severity` (`GroundedFindingExplanation`, `ArchitectureEvaluationServiceImpl`). `AiExplanationServiceImpl` và `SecretRedactor` che sạch secret dạng `sk-*`, `Bearer ...`, `AIza*` thành `[REDACTED]` và lọc bỏ mọi citation nằm ngoài `modelVersionId` đang xem.
- **D4 · Cycle-Safe Reverse BFS & Deterministic Layout:** Cả .NET Worker (`VersionedImpactAnalyzer`) và Frontend (`computeArchitectureImpact` tại `src/lib/architecture/reverse-bfs.ts`) duyệt đồ thị phụ thuộc theo chiều ngược từ `targetNode` sử dụng hàng đợi FIFO kèm tập `visited`, phân tách rõ `Direct Callers` (`hop = 1`), `Indirect Callers` (`hop >= 2`), và `Unaffected / Isolated Elements`, đồng thời phát hiện chu trình bằng DFS 3 màu mà không sinh dương tính giả trên đồ thị DAG hình thoi.

## Hợp đồng `C02` và `C05`

Tất cả endpoint sử dụng tiền tố `/api/v1` và yêu cầu xác thực JWT (Frontend Next.js chuyển tiếp JWT qua cookie `HttpOnly` tại BFF `/api/backend/[...path]`).

| HTTP | Đường dẫn | Hợp đồng Request / Response chính |
|---|---|---|
| POST | `/projects` | Tạo dự án cá nhân hoặc gắn `referenceSnapshotId` trong workspace hướng dẫn; từ chối tham chiếu chéo workspace (`403`) |
| PATCH | `/projects/{projectId}/snapshots/{snapshotId}/publish` | Công bố hoặc ghim `SourceSnapshot` làm nguồn tham chiếu chuẩn |
| POST | `/analyzer/upload` | Tải ZIP mã nguồn và tính SHA-256 `artifactHash`; bị chặn ở Guided Lab nếu không thuộc nguồn công bố |
| POST | `/analyzer/import/github` | Nhập repository GitHub công khai với URL và commit SHA đầy đủ đã ghim |
| POST | `/analyzer/snapshots/{snapshot}/analyze` | Nhận header `Idempotency-Key`; kích hoạt hoặc trả lại `AnalysisJob` idempotent (`HTTP 202`) |
| GET | `/analyzer/jobs/{jobId}` | Trả `status` và `analysisState`: `PENDING`, `RUNNING`, `FAILED`, `COMPLETED`, `COMPLETED_WITH_REVIEW`, `PARTIAL`, `COMPLETED_LEGACY` |
| POST | `/analyzer/jobs/{job}/cancel` | Hủy job đang chờ/chạy và cập nhật trạng thái kết thúc an toàn |
| GET | `/analyzer/models/{modelVersionId}/diagrams` | Danh sách sơ đồ C4/UML gắn `modelVersionId`; sinh viên Guided Lab chỉ nhận phạm vi `C4_CONTEXT`, `C4_CONTAINER`, `C4_COMPONENT`, `DEPENDENCY_GRAPH` |
| GET / POST | `/analyzer/models/{modelId}/documents/{viewId}` | Tải/lưu tài liệu kiến trúc (`context`, `container`, `component`, `graph`); trả `400` cho `uml-sequence`, `uml-activity`, `uml-state` khi bị khóa tĩnh |
| GET | `/analyzer/models/{model}/impact` | Phân tích Reverse BFS theo phiên bản qua Worker (`targetServiceId`, `graphRevisionId`, `maxDepth`, `maxPaths`; trả `503` nếu Worker gián đoạn) |
| GET | `/analyzer/impact` | Phân tích tác động Reverse BFS trên đồ thị `sessionId` và `nodeId` kèm khoảng cách hop |
| POST | `/analyzer/models/{modelVersionId}/evaluate` | Chạy đánh giá `RULE-01..05`; tách `status` (`NEEDS_REVIEW` / `CONFIRMED`) khỏi `severity` (`INFO` / `WARNING` / `CRITICAL`) |
| POST | `/analyzer/ai/explain` | Giải thích `ELEMENT`, `RELATIONSHIP`, `RULE_FINDING` qua LLM hoặc Deterministic Grounded Synthesis; che secret `[REDACTED]` và khóa citation allowlist |
| GET | `/course-curriculum` | Danh sách 30 bài học chuẩn hóa Java (18) và C# (12) kèm mục tiêu, bài tập và nguồn đọc HTTPS chính thức |
| GET | `/workspaces/{workspaceId}/course-labs/{assignmentId}/quiz` | Trả đề Quiz hiện hành, `version`, `passPercent`, `latestStatus` (`NOT_ATTEMPTED` / `NEEDS_RETRY` / `PASSED`) và `runtimeUnlocked` (`Cache-Control: no-store`) |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/quiz` | Giảng viên công bố câu hỏi Quiz tùy chỉnh; giữ version nếu nội dung trùng khớp, tăng version nếu thay đổi |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/quiz/curriculum` | Giảng viên công bố Quiz từ `chapterId` trong bộ giáo trình 30 bài (`java-csharp-v1.json`) |
| POST | `/workspaces/{workspaceId}/course-labs/{assignmentId}/quiz/attempts` | Sinh viên nộp bài (`attemptId`, `version`, `answers[]`); trả `PASSED` hoặc `NEEDS_RETRY`; phát hiện version cũ (`409`) và giữ idempotency theo `attemptId` |

Bảng mã lỗi HTTP chuẩn của `C02` và `C05` (`ErrorCode`):

| HTTP | Trường hợp áp dụng trong WF-02 |
|---|---|
| `400` | Dữ liệu không hợp lệ, URL/SHA GitHub sai định dạng, hoặc yêu cầu UML hành vi (`UML_SEQUENCE`, `UML_ACTIVITY`, `UML_STATE`) trong Guided Lab bị khóa tĩnh |
| `401` | Thiếu JWT hoặc phiên đăng nhập không hợp lệ / đã thu hồi |
| `403` | Vi phạm `C01` (sai workspace/vai trò), tải nguồn tự do trong Guided Lab, truy cập `Step 3 Live Docker Runtime` hoặc nộp bài `WF-04` khi Quiz chưa `PASSED` |
| `404` | Không tìm thấy `Project`, `SourceSnapshot`, `ModelVersion`, `DiagramVersion`, `EvaluationRun`, hoặc đề Quiz của Lab |
| `409` | Lệch digest SHA-256 file ZIP, nộp Quiz theo `version` đề đã lỗi thời, cập nhật `ModelVersion` trên base stale, hoặc ghi nhận job trùng xung đột |
| `422` | Yêu cầu chưa thỏa mãn điều kiện nghiệp vụ của quy trình phân tích/đánh giá |
| `503` | Worker phân tích C#/Impact không phản hồi hoặc trả hợp đồng không hợp lệ |

## Điểm bàn giao Liên Workflow (`C01 -> C02 -> C03 / C04`)

- **Từ `WF-01` (`C01`) vào `WF-02` (`C02`):** `CourseLabPolicy.requireOpen(lab, user)` xác nhận lớp đang `ACTIVE`, sinh viên đã ghi danh, và Lab trước đó đã `PASSED` trước khi cho phép tải giáo trình hoặc làm Quiz. `CourseLabPolicy.isGuidedStaticStudent(model, access)` khóa view kiến trúc của sinh viên tại 4 góc nhìn tĩnh (`C4_CONTEXT`, `C4_CONTAINER`, `C4_COMPONENT`, `DEPENDENCY_GRAPH`).
- **Từ `WF-02` (`C02`) sang `WF-03` (`C03`):** `RuntimeSessionServiceImpl` gọi `CourseLabPolicy.requireRuntimeReadiness(project)` trước khi cấp phép khởi tạo phiên Docker Runtime cho dự án thuộc Guided Lab (chi tiết hợp đồng `C03` tại [`WF03_RUNTIME_STUDIO_C03.md`](./WF03_RUNTIME_STUDIO_C03.md)). Nếu không có bản ghi `PASSED` trong `course_quiz_attempts` khớp `quiz_version` hiện hành tại `course_quizzes` (`V27`), backend từ chối với `HTTP 403`.
- **Từ `WF-02` (`C02`) sang `WF-04` (`C04`):** `SubmissionServiceImpl` kiểm tra `CourseLabPolicy.requireRuntimeReadiness(project)` khi tạo submission và đóng băng ảnh chụp chứng chỉ Quiz vào cột `course_quiz_evidence` của `SubmissionSnapshot` (`V28`, cùng digest `V29` và giải trình/chấm từng snapshot `V30` tại [`WF04_SUBMISSION_GRADING_C04.md`](./WF04_SUBMISSION_GRADING_C04.md)). Nhờ đóng băng này, việc giảng viên công bố lại Quiz ở version cao hơn chỉ khóa lượt thao tác kế tiếp mà vẫn giữ nguyên bằng chứng hợp lệ của bài đã nộp.

> Tổng hợp đối chiếu `RF-01..12`, `SR-01..16` và ma trận `Wf01..Wf04AcceptanceMatrixTest` trên toàn nền tảng được ghi nhận tại [`MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md`](./MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md) và `.github/workflows/deploy-production.yml`.

## Khắc phục Audit Findings & Chuỗi phát hành trên `main`

- **Audit Findings đã xử lý triệt để (`RF-02`, `RF-06`, `RF-10`, `SR-02`, `SR-05`, `SR-06`, `SR-07`, `SR-10`, `SR-11`):**
  - Đóng vòng khép kín UX phân tích tĩnh & dữ liệu mẫu: Step 1 hiển thị trước mô hình tham chiếu `C1–C3` + Service Dependency Graph từ `lab.referenceSource` ngay cả trước khi khởi tạo dự án cá nhân, bổ sung nút 1-click `"Initialize & Analyze My Lab Workspace"` (`createProject` gắn `referenceSnapshotId` -> `snapshots` -> `startAnalysis` kèm `Idempotency-Key`) và hỗ trợ seed dữ liệu mẫu chuẩn qua `POST /workspaces/{workspaceId}/course-labs/seed-curated`.
  - Chặn `UPLOAD` / `GITHUB` tự do cho sinh viên Guided Lab và ghim snapshot tham chiếu (`RF-02`, Chặng 1 `5b5033c` -> `3b65a57`).
  - Bảo toàn `is_latest_valid` trên phiên bản hợp lệ trước khi job sau `FAILED` và chuẩn hóa `analysisState` phân tách `PARTIAL` / `COMPLETED_WITH_REVIEW` (`SR-06`, Chặng 1 `5b5033c` -> `3b65a57`).
  - Khóa `C1–C3` + `DEPENDENCY_GRAPH` tại `DiagramProjectionServiceImpl`, `ArchitectureDocumentService`, `DiagramExportServiceImpl` (`HTTP 400` cho `UML_SEQUENCE/ACTIVITY/STATE`); giữ bằng chứng 3E `CALL_SITE` vs `UNVERIFIED_METADATA_ONLY`, `[REDACTED]` Zero-Leak AI, và idempotency phân tích (`SR-05`, `SR-07`, `SR-10`, `SR-11`, Chặng 2 `89796c1` -> `c90b282`).
  - Mở rộng `CSharp` `SERVICE_HTTP_CALL` vào Connected C4 Pipeline, xác thực bộ test trình duyệt 3E Chrome (`test:three-e-ui`), và cung cấp Step 1 guided source UX (`RF-06`, Chặng 3 `8fccb1a` -> `213010d`).
  - Tách module Reverse BFS chống lặp vòng không dương tính giả (`src/lib/architecture/reverse-bfs.ts`), hiển thị cảnh báo khóa Runtime theo `PASSED` / `NEEDS_RETRY`, thêm Reference Architecture Back-Links vào Step 2, và kiểm thử đủ 30 bài / 120 câu giáo trình (`RF-10`, Chặng 4 `e482826` -> `4934e9d`).
  - Tự động hóa ma trận 27 ca + NFR trong CI (`Wf02AcceptanceMatrixTest`, `VersionedImpactTests`, `frontend-performance.test.cjs`, `.github/workflows/deploy-production.yml`; `SR-02`, Chặng 5 `69f6fd1` -> `49822ad`).

## Đối chiếu BM04 & Kết quả Kiểm chứng Thực tế

| Mã cam kết | Lớp / Kịch bản kiểm chứng | Lệnh tái lập | Kết quả thực tế |
|---|---|---|---|
| `F02-001` .. `F02-008` | `Wf02AcceptanceMatrixTest`, `SourceIngestionServiceImplTest`, `ProjectServiceImplTest`, `AnalysisRequestServiceTest` | `mvnw -pl mavis-bootstrap -am -Dtest=Wf02AcceptanceMatrixTest test` | PASS (khớp SHA/SHA-256, chặn `403`/`409`, giữ `is_latest_valid`, 10 scan đồng thời chỉ tạo 1 job) |
| `F03-001` .. `F03-008` | `Wf02AcceptanceMatrixTest`, `DiagramProjectionServiceImplTest`, `HttpClientProfileTests`, `connected-pipeline.test.cjs` | `npm run test:connected` & `dotnet test` & Maven | PASS (`C1–C3`, chặn UML hành vi `400`, C# `SERVICE_HTTP_CALL`, empty model an toàn, trích xuất `locator`/`excerpt`) |
| `F06-001` .. `F06-008` | `Wf02AcceptanceMatrixTest`, `ArchitectureEvaluationServiceImplTest`, `AiExplanationServiceImplTest`, `CourseQuizServiceTest`, `VersionedImpactTests`, `course-learning-ui.test.cjs` | Maven + `dotnet test` + `npm test` | PASS (`RULE-01..05`, `PASSED`/`NEEDS_RETRY` Gate `403`, Reverse BFS `A->B->C->A` loại trừ `D`, `[REDACTED]`, Quiz `409` stale / idempotent) |
| `TC-WF02-E2E` (`DS-02a/b`) | `Wf02AcceptanceMatrixTest`, `CourseHttpAcceptanceTest`, `three-e-ui.browser.cjs` | `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:three-e-ui` | PASS (`DS-02a` luồng chính tới mở khóa Runtime; `DS-02b` chặn UML `400` & giữ khóa Runtime khi trượt Quiz) |
| `TC-ST02`, `TC-N03`, `TC-N04` | `Wf02AcceptanceMatrixTest`, `AiExplanationServiceImplTest`, `ModelVersionServiceImplTest` | `mvnw -pl mavis-bootstrap -am -Dtest=Wf02AcceptanceMatrixTest test` | PASS (`AnalysisJob` & `QuizAttempt` state machine; 0 secret leak; 10 mutate đồng thời giữ digest & trả `409` stale) |
| `TC-N01` (`WF-02`) | `Wf02AcceptanceMatrixTest.tcN01QuizScoringAndCurriculumBenchmarkWithin2Seconds` & `frontend-performance.test.cjs` | `npm test` & Maven | PASS (nạp 30 bài / 120 câu + 30 lượt chấm Quiz `<= 2000 ms`; Reverse BFS + chiếu đồ thị 50 nodes / 150 edges `<= 2000 ms`) |

Số liệu kiểm thử cập nhật sau hợp nhất hoàn thiện UX & ma trận kiểm thử (`feat/mavis-final-100pct-all-workflows-polish`, JDK 21, .NET 10, Node 25; 6 test PostgreSQL CI tự động skip khi chưa đặt `MAVIS_MIGRATION_TEST_JDBC_URL` và 3 test Linux-only/Docker-only trong `.NET` tự động skip theo điều kiện nền tảng):

- **Backend CI Regression Profile (`-pl mavis-bootstrap -am` theo `.github/workflows/deploy-production.yml`):**
  - `mavis-common`: **18/18 PASS** (0 fail, 0 error, 0 skip).
  - `mavis-platform`: **125/125 PASS** (0 fail, 0 error, 0 skip; bao gồm `CourseQuizServiceTest` và `CourseLabSeederServiceTest` 2/2).
  - `mavis-analyzer`: **219/219 PASS** (0 fail, 0 error, 0 skip).
  - `mavis-bootstrap`: **146/146 chạy thực thi PASS** + 6 Postgres CI test skip có điều kiện (tổng 152, 0 fail, 0 error; bao gồm `Wf02AcceptanceMatrixTest` **29/29 PASS**).
- **.NET Worker (`MAVIS.Worker.Tests` Release):** **240 PASS**, 3 skip theo nền tảng, tổng 243, 0 fail.
- **Frontend (`MAVIS-Frontend`):**
  - `npm run typecheck`: **PASS** (`tsc --noEmit --incremental false`).
  - `npm test`: **387/387 PASS**, 0 fail, 0 skip.
  - `npm run test:connected`: **3/3 PASS**, 0 fail, 0 skip.
  - `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:three-e-ui`: **PASS** (`PASS: full 3E browser suite plus diagram dock regression; synthetic API only.`).
  - `npm run build`: **PASS** (Next.js 15.5.25 compiled successfully in `6.9s`).

## Cập nhật đồng bộ Defense 1.1 (`https://maviss.site` · 22/11/2026)

- **Nút tải nguồn tham chiếu cho Sinh viên (`F-02` / `DS-01a`):** Màn hình Lab Bước 1 (`src/features/courses/screens.tsx`) hiển thị trực tiếp nút **`Download Reference .zip`** trỏ vào `/api/backend/assignments/{id}/reference-source` (đã đối chiếu quyền thành viên, mở khóa tuần tự và SHA-256 trên backend).
- **Quiz Authoring (`V36`) & Ngân hàng câu hỏi:** Hỗ trợ soạn câu hỏi `SINGLE_CHOICE` / `MULTI_CHOICE` / `TRUE_FALSE`, nhập/xuất JSON-CSV, Question Bank tái sử dụng và phiên bản hóa ngưỡng đạt (mặc định 80% cho phiên bản mới).
- **Nội dung đọc Markdown cho Lab `THEORY_ONLY`:** Bước 1 Lab `THEORY_ONLY` (không đính kèm repo) hiển thị trực tiếp `Lesson & Reading Material` bằng `MarkdownPreview` thay vì chỉ hiện khung thông báo trống.
