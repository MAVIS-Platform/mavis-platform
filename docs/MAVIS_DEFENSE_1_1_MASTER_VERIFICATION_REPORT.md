# Báo Cáo Tổng Hợp Kiểm Chứng & Nghiệm Thu Hội Đồng Kín 1.1 (`MAVIS Defense 1.1 Master Verification Report`)

Báo cáo tổng hợp bằng chứng hoàn thiện, truy vết mã nguồn, lược đồ CSDL (`V26`–`V38`), CI/CD và kết quả chạy kiểm thử thực tế trên toàn bộ 4 luồng nghiệp vụ **WF-01 .. WF-04** của nền tảng **MAVIS**.

Tài liệu kỹ thuật từng workflow:
- [`WF01_COURSE_ACCESS.md`](./WF01_COURSE_ACCESS.md) · Lớp học, Passkey & Khóa tuần tự (`C01`, `C05`)
- [`WF02_STATIC_QUIZ_C02.md`](./WF02_STATIC_QUIZ_C02.md) · Phân tích tĩnh `C1–C3`, 3E Call-Site, Reverse BFS & Quiz Gate (`C02`)
- [`WF03_RUNTIME_STUDIO_C03.md`](./WF03_RUNTIME_STUDIO_C03.md) · Live Docker Runtime Studio Stop/Start/Scale & Causal OTel (`C03`)
- [`WF04_SUBMISSION_GRADING_C04.md`](./WF04_SUBMISSION_GRADING_C04.md) · Nộp Snapshot SHA-256, Chấm từng Snapshot `> 5.0/10` & Auto-Unlock (`C04`)

---

## 1. Tiến trình hợp nhất 7 Chặng vào nhánh `main` (`Stages 1–7`)

| Chặng | Nhánh Git | Commit chính | Nội dung cốt lõi đã hoàn tất |
|---|---|---|---|
| **Chặng 1** | `feat/all-stage1-wf01-wf02-contract-audit-and-hardening` | `753297a` -> `95dd952` | Đồng bộ hợp đồng `AssignmentCreateRequest`/`AssignmentUpdateRequest` (`ruleSetVersion`, `aiPolicy`) giữa BFF Next.js và Java DTO (`SR-08`); chuẩn hóa validation `NotificationController` (`HTTP 400`, `SR-14`) |
| **Chặng 2** | `feat/all-stage2-wf03-runtime-studio-stop-start-scale-and-otel` | `1529f7e` -> `26d9f72` | Hoàn thiện `MAVIS Studio` Stop/Start/Scale (`1..8` replicas) ở `.NET Runner` (`DockerComposeSession.cs`), `RuntimeSessionResponseDTO` (`observedImpact` Before/After, song ngữ EN/VI) và giao diện `runtime/backend.tsx` |
| **Chặng 3** | `feat/all-stage3-wf04-snapshot-submission-and-per-snapshot-grading` | `f1d650b` -> `dfd0cb4` | Bổ sung `V30__Submission_Snapshot_Grades_And_Explanations.sql`, `SubmissionServiceImpl` (`studentSnapshots`, `evidencePackageDigest`), `SubmissionReviewService` (quy tắc `> 5.0/10`, nhận xét bắt buộc, gọi `CourseProgressionService.recordFinalizedResult`) |
| **Chặng 4** | `feat/all-stage4-fe-4stage-workspace-grading-and-bilingual-ux` | `a644a5a` -> `621f8d6` | Hoàn thiện UI 4 chặng soạn giải trình (`composer.tsx`), hiển thị digest & Quiz đóng băng (`frozen-artifacts.tsx`), bảng chấm từng Snapshot (`grading.tsx`) và từ điển song ngữ `EN/VI` Runtime/Studio (`SR-15`) |
| **Chặng 5** | `test/all-stage5-wf01-wf03-wf04-acceptance-matrices-108-cases` | `34d79f5` -> `55e2040` | Bổ sung `Wf01AcceptanceMatrixTest.java`, `Wf03AcceptanceMatrixTest.java`, `Wf04AcceptanceMatrixTest.java` cùng `Wf02AcceptanceMatrixTest.java` phủ trọn bộ **108 ca cam kết BM04** |
| **Chặng 6** | `ci/all-stage6-ci-pipeline-and-nfr-benchmarks` | `c83785a` -> `288ff04` | Đăng ký `Wf01..Wf04AcceptanceMatrixTest`, `RuntimePlanningServiceTest`, `SubmissionReviewServiceTest` và chuỗi migration `V29` + `V30` vào `.github/workflows/deploy-production.yml`, `deploy/apply-course-schema.py`, `deploy/deploy-vps.sh`, `deploy/tests/test_course_schema.py` và `deploy/CI-CD.md` (`SR-13`) |
| **Chặng 7** | `docs/all-stage7-handover-docs-wf01-to-wf04-and-final-audit` | `ad234cc` | Xuất bản `WF03_RUNTIME_STUDIO_C03.md`, `WF04_SUBMISSION_GRADING_C04.md`, cập nhật `WF01`/`WF02` và báo cáo nghiệm thu tổng thể |
| **Đợt hoàn thiện Single-Branch #1** | `feat/mavis-final-100pct-all-workflows-polish` | `dca1892` -> `7086a14` | Sửa nhất quán `resolveSubmissionOutcome` trên `SubmissionResult` & `GradeForm` (`5.0/10` -> `NEEDS REVISION`), đóng vòng UX 1-click Guided Lab & Phân tích tĩnh (`#submission-composer`, xem trước `C1–C3 + Dependency Graph`), bổ sung `CourseLabSeederService`, mở rộng `Wf01`..`Wf04` lên **119 ca `@Test`** |
| **Đợt hoàn thiện Argon 100% (Single-Branch #2)** | `feat/argon-complete-100pct-all-workflows-studio2d-curriculum` | `45f0c07` -> `5301f7c` | BFF `allowedBackendPath` mở `course-labs/seed-curated`, `CourseLabSeederService` hỗ trợ 2 preset `STANDARD_DEMO` (3 Lab: `java-04`, `java-07`, `csharp-13`) & `FULL_CURRICULUM` (13 Lab: `java-01..12` + `csharp-13`) kèm archive Java + `.NET Core` (`Orders/Program.cs`, `Catalog/Program.cs`, `inventory-service`), `SubmissionComposer` tự chọn dự án lớp & phiên Studio + nút 1-click `Run 5-Rule Static Evaluation`, **Interactive 2D Studio Topology Canvas** (`Stop/Start/Scale 1..8` trực tiếp trên node + stacked replica cards & stopped rose state + song ngữ EN/VI), giữ nguyên 100% commit đồng đội `a947667` / `a09673f` / `2351622` (`V31`), và mở rộng bộ acceptance test lên **120 ca `@Test`** (`F10-009` + `F10-010`) |
| **Đợt hoàn thiện Studio Interactive & Full-Stack Docker Acceptance** | `feat/wf03-studio-session` | `7cb1f16` -> `58b59a6` | Bổ sung `V32__Runtime_Studio_Control.sql` (`studio_control` JSONB), `V33__Submission_Studio_Evidence.sql` (`studio_evidence`), `RuntimeStudioController` / `RuntimeStudioService`, 2D/3D Studio Observability + Worker Impact + PNG Before/After Snapshot comparison, chữ ký `HMAC-SHA256` trên `RunnerReceipt`, xoay vòng khóa (`mavis.runner.previous-service-key`), `/sync-outbox` recovery, và kiểm thử Full-Stack End-to-End với `.NET Runner` + Docker Linux Engine thật + PostgreSQL 18 (`V33`) |
| **Đợt hoàn thiện Lab v2, Authoring, LMS UI & Chốt Backlog 17/11** | `main` (`6c4bf1d` -> hiện tại) | `5ba76f07` -> `7bddd59b` -> *(commit chốt)* | Bổ sung `V34`–`V38` (freeze topology, course draft/publish, quiz authoring 80%, `runtime_sessions.assignment_id`, `lab_mode` + `theory_evidence`), giao diện lớp LMS & Lab Coursera (`0859d50d`, `7bddd59b`), runner per-resource lock (`50d0bb60`), hoàn tất **`T09`** (`CourseAccessService.publish` không ghi đè frozen topology), **`T10`** (`CourseSetupService` kiểm tra đủ nhiều reference/Lab), **`T38`/`T41`/`T42`** (draft cục bộ cô lập theo user/lớp/Lab ở `lab-submission-v2.tsx`, `FrozenArtifacts` cho bài v2 không diagram, `GradeForm` hiển thị `writtenExplanation` & bảo toàn nháp qua refresh `409`), **`T36`/`T45`/`T46`** & **`T51`** (đăng ký `CourseSetupServiceTest`, `QuizBankServiceTest`, `PreparedStudioTopologyTest`, `RuntimeSetupControllerTest`, `ZipUtilsTest` vào CI) |

> **Ghi chú đồng bộ Flyway (`V29`–`V38`):** Hệ thống đã tiếp nhận `V29` (`Evidence_Package_Digest`), `V30` (`Snapshot_Grades`), `V31` (`WF01_Customer_Ready_Identity_And_Course`), `V32` (`Runtime_Studio_Control`), `V33` (`Submission_Studio_Evidence`), **`V34__Assignment_Studio_Topology_Snapshot.sql`**, **`V35__Course_Composition_Draft.sql`**, **`V36__Quiz_Authoring.sql`**, **`V37__Runtime_Session_Assignment.sql`**, và **`V38__Submission_V2_Lab_Mode.sql`**. Toàn bộ chuỗi migration `V1..V38` được bảo toàn nguyên vẹn.

---

## 2. Truy vết Hạng mục `RF-01..RF-12` & Audit Findings (`SR`)

| Nhóm / Mã | Workflow | Thành phần cài đặt chính | Bài test chứng minh trực tiếp | Trạng thái |
|---|---|---|---|---|
| `RF-01`, `RF-05`, `RF-09` | `WF-01` | `CourseAccessService`, `CourseProgressionService`, `CourseLabPolicy`, `AssignmentServiceImpl`, `NotificationController`, `SessionLogoutController`, `JwtUtil`, `V26` | `Wf01AcceptanceMatrixTest`, `CourseAccessServiceTest`, `AssignmentServiceImplTest`, `NotificationControllerTest`, `CourseAccessPostgresTest` | **DONE** |
| `RF-02`, `RF-06`, `RF-10` | `WF-02` | `ProjectServiceImpl`, `SourceIngestionServiceImpl`, `DiagramProjectionServiceImpl`, `ArchitectureEvaluationServiceImpl`, `AiExplanationServiceImpl`, `CourseCurriculum`, `CourseQuizService`, `VersionedImpactAnalyzer`, `reverse-bfs.ts`, `V27` | `Wf02AcceptanceMatrixTest`, `CourseQuizServiceTest`, `VersionedImpactTests`, `connected-pipeline.test.cjs`, `three-e-ui.browser.cjs` | **DONE** |
| `RF-03`, `RF-07`, `RF-11` | `WF-03` | `RuntimePlanningService`, `RuntimeSessionServiceImpl`, `RunnerReceiptIngestServiceImpl`, `OtelTraceCorrelationServiceImpl`, `ComposePreflightValidator`, `DockerComposeSession.cs`, `runtime/backend.tsx` & `screens.tsx` | `Wf03AcceptanceMatrixTest`, `RuntimePlanningServiceTest`, `RuntimeSessionServiceImplTest`, `RunnerReceiptIngestServiceImplTest`, `OtelTraceCorrelationServiceImplTest`, `StudioInfrastructureActionTests.cs`, `runtime-planning.test.cjs` | **DONE** |
| `RF-04`, `RF-08`, `RF-12` | `WF-04` | `SubmissionServiceImpl`, `SubmissionReviewService`, `CourseProgressionService`, `V28`–`V30`, `submissions/composer.tsx`, `frozen-artifacts.tsx`, `grading.tsx`, `locale-context.tsx` | `Wf04AcceptanceMatrixTest`, `SubmissionServiceImplTest`, `SubmissionReviewServiceTest`, `course-learning-ui.test.cjs` | **DONE** |

**Các hạng mục Self-Review (`SR`) trọng tâm đã kiểm chứng và đóng triệt để:**
- `SR-02` / `SR-13`: Tự động hóa ma trận `Wf01..Wf04AcceptanceMatrixTest` cùng `RuntimePlanningServiceTest`, `SubmissionReviewServiceTest`, và quy trình schema pre-flight `V26..V30` trong `.github/workflows/deploy-production.yml` (`deploy-vps.sh`, `apply-course-schema.py`).
- `SR-03`: Thu hồi JWT tức thì khi `/api/v1/auth/logout` (`revoked_access_tokens` + `JwtUtil`) với idempotency replay-safe.
- `SR-05`, `SR-06`, `SR-07`, `SR-10`, `SR-11`: Khóa chế độ tĩnh `C1–C3 + Dependency Graph` (`HTTP 400` với UML hành vi), giữ `is_latest_valid` khi job sau `FAILED`, ép bằng chứng `CALL_SITE` cho `RULE-04`, che secret `[REDACTED]` + lọc citation allowlist và idempotency scan.
- `SR-08`: Đồng bộ `ruleSetVersion` và `aiPolicy` trên `AssignmentCreateRequest`/`AssignmentUpdateRequest`/`AssignmentResponseDTO`, BFF `/api/mavis/[operation]`, `contracts.ts` và `java-contract.test.cjs`.
- `SR-09`, `SR-15`: Hoàn thiện flow 4 bước soạn giải trình Snapshot (`composer.tsx`), bảng chấm từng Snapshot (`grading.tsx`) và nhãn song ngữ `EN/VI` thống nhất trên Runtime, Studio, Course & Grading.
- `SR-14`: Kiểm soát validation chặt chẽ trên `NotificationController` (`HTTP 400` cho input sai).

---

## 3. Đối chiếu Ma trận Kiểm thử Cam kết (**120 ca `@Test` chi tiết** phủ trọn 108 ca BM04 + `DS-01..04` + `TC-GR01..06` + `TC-N01..06` + `F10-009..010`)

| Workflow | Lớp kiểm thử tự động | Phạm vi mã ca bao phủ | Kết quả thực thi quan sát trực tiếp |
|---|---|---|---|
| **WF-01** (`C01`/`C05`) | `com.mavis.bootstrap.acceptance.Wf01AcceptanceMatrixTest` + `CourseLabSeederServiceTest` | `F01-001..008`, `F09-001..008`, `F10-001..010`, `TC-WF01-E2E` (`DS-01a/b`), `TC-ST01`, `TC-N01` (`<= 3000ms`), `TC-N02` | **30/30 PASS** (`0` fail, `0` error, `3.543 s`) + `CourseLabSeederServiceTest` **3/3 PASS** |
| **WF-02** (`C02`) | `com.mavis.bootstrap.Wf02AcceptanceMatrixTest` | `F02-001..008`, `F03-001..008`, `F06-001..008`, `TC-WF02-E2E` (`DS-02a/b`), `TC-ST02`, `TC-N01`, `TC-N03`, `TC-N04` | **29/29 PASS** (`0` fail, `0` error, `1.163 s`) |
| **WF-03** (`C03`) | `com.mavis.bootstrap.acceptance.Wf03AcceptanceMatrixTest` + `StudioInfrastructureActionTests.cs` + `runtime-planning.test.cjs` | `F05-001..008`, `F07-001..008`, `F08-001..008`, `TC-WF03-E2E` (`DS-03a/b`), `DS-03`, `TC-ST03`, `TC-N05` (`<= 300s`), Interactive 2D Studio Control Bar | **28/28 PASS** (`0` fail, `0` error, `21.75 s`) + `runtime-planning.test.cjs` **17/17 PASS** |
| **WF-04** (`C04`/`C05`) | `com.mavis.bootstrap.acceptance.Wf04AcceptanceMatrixTest` + `SubmissionReviewServiceTest` + `course-learning-ui.test.cjs` | `F04-001..008`, `F11-001..008`, `F12-001..008`, `TC-GR01..06`, `TC-WF04-E2E` (`DS-04a/b`), `TC-ST04`, `TC-N06` | **33/33 PASS** (`0` fail, `0` error, `0.756 s`) + `course-learning-ui.test.cjs` **16/16 PASS** |

---

## 4. Kết Quả Vòng Kiểm Chứng Full-Stack Cuối Cùng

Chạy trực tiếp trên nhánh `main` sau đợt hoàn thiện `17/11/2026` (môi trường Windows 11, JDK 21, .NET 10, Node.js, Python 3):

1. **Java Backend (`MAVIS-Platform/mavis-be` · profile `.github/workflows/deploy-production.yml` với `-pl mavis-bootstrap -am` chạy tất cả unit & acceptance matrix tests khi không bật Docker/PostgreSQL cục bộ):**
   - `mavis-common`: **23/23 PASS** (`0` fail, `0` error, `0` skip — gồm `AccessPolicyServiceImplTest` 16/16, `GitHubRepositoryUrlsTest` 2/2, `ZipUtilsTest` 5/5)
   - `mavis-platform`: **163/163 PASS** (`0` fail, `0` error, `0` skip — gồm `SubmissionServiceImplTest` 32/32, `SubmissionReviewServiceTest` 8/8, `CourseAuthoringServiceTest` 14/14, `CourseAccessServiceTest` 7/7, `CourseSetupServiceTest` 4/4, `CourseQuizServiceTest` 9/9, `QuizBankServiceTest` 2/2, `CourseLabSeederServiceTest` 3/3, `AssignmentServiceImplTest` 15/15)
   - `mavis-analyzer`: **240/240 PASS** (`0` fail, `0` error, `0` skip — gồm `RuntimePlanningServiceTest` 25/25, `RuntimeSessionServiceImplTest` 22/22, `RunnerReceiptIngestServiceImplTest` 17/17, `OtelTraceCorrelationServiceImplTest` 11/11, `RuntimeStudioServiceTest` 9/9, `PreparedStudioTopologyTest` 4/4, `RuntimeSetupControllerTest` 1/1)
   - `mavis-bootstrap`: **147 executed PASS**, **6 skip có điều kiện PostgreSQL** (`MigrationUpgradeTest`, `SessionLogoutPostgresTest`, `CourseAccessPostgresTest`, `CourseHttpAcceptanceTest`, `ResourceDeletionPostgresTest`, `NotificationReadPostgresTest` tự động skip khi chưa đặt `MAVIS_MIGRATION_TEST_JDBC_URL`; tổng `153`, `0` fail, `0` error — gồm **120/120 PASS** của `Wf01` 30/30, `Wf02` 29/29, `Wf03` 28/28, `Wf04` 33/33; `RuntimeStudioApiIntegrationTest` `3` test `@SpringBootTest` cần PostgreSQL nên chạy trong job `verify` của GitHub Actions với service container `postgres:16`/`postgres:18`).
   - **Tổng kết BE (non-Postgres local CI subset):** **573/573 test thực thi PASS** (`579` tổng, `6` conditional Postgres skip, `0` fail, `0` error; `01:27 min`).
2. **.NET Worker & Runner (`MAVIS.Worker/tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj` · `--configuration Release`):**
   - **246 PASS**, `5` skip có điều kiện nền tảng Linux/Docker daemon (`PreparedStudioActivatesMissingBlockAndConfirmsRealDockerChanges`, `LinkedStateRootIsRejectedWithoutChangingTarget`, `SourceFileAndRootSymlinksCannotEscapeScope`, `RealDockerSuccessAndCancellationUseManagedIdentityAndDurableAcknowledgement`, `InteractiveStudioProcessesStopStartScaleBeforeFinishingAndCleaning`), tổng `251`, **`0` fail** (`7 s`).
3. **Python Deploy & Schema Migration Tests (`deploy/tests`):**
   - **8 PASS + 1 skip PostgreSQL-only** (`test_v35_real_migration_matches_its_readiness_probe`), tổng **`9` OK** (`0.281s`, chạy bằng `python -B -m unittest discover -s deploy/tests -p "test_*.py" -v`).
4. **Next.js Frontend (`MAVIS-Frontend` · sau `npm ci` đồng bộ Zod `4.6.7` và Next.js `15.5.29`):**
   - `node --check ../scripts/measure-wf01-roadmap.mjs`: **PASS**
   - `npm run typecheck`: **PASS** (`tsc --noEmit --incremental false`, `0` lỗi)
   - `npm test`: **427/427 PASS**, `0` fail, `0` skipped (`15906.1878 ms`)
   - `npm run test:connected`: **3/3 PASS**, `0` fail, `0` skipped (`3703.3193 ms`)
   - `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:three-e-ui`: **PASS** (`PASS: full 3E browser suite plus diagram dock regression; synthetic API only.`)
   - `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:course-setup`: **PASS**
   - `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:lecturer-lms`: **PASS**
   - `npm run build`: **PASS** (`Next.js 15.5.29`, compiled successfully in `34.8s`, `0` errors).
5. **Nghiệm thu Full-Stack Thực tế trên Docker Linux Engine + `.NET Runner` + PostgreSQL 16/18 (`V33`–`V38`):**
   - `ManagedDockerRuntimeTests` (`MAVIS.Worker.Tests`): **2/2 PASS** trên Docker Engine thật (`InteractiveStudioProcessesStopStartScaleBeforeFinishingAndCleaning` và `RealDockerSuccessAndCancellationUseManagedIdentityAndDurableAcknowledgement`, ghi nhận trước đó trên môi trường Docker Linux).
   - `RuntimeStudioApiIntegrationTest` (`mavis-bootstrap`): **3/3 PASS** trên PostgreSQL `18.7` (`V1..V33`) kết hợp tiến trình `dotnet MAVIS.Runner.dll managed` và Docker Linux Engine thật (`sessionId`: `2d073f83-6123-4784-b509-facb31918575`, `resourceProject`: `mavisrun-369e0d552d5e446e89089c19c35b1779`, `receiptDigest`: `sha256:6ba4f802cb7b893534b68e6da81e74bf1814dcbd19d9523f6e647efb99e53a8c`, `submissionId`: `5de8f105-89c4-4061-b809-60d7dc613bdf`, `cleanupStatus`: `CONFIRMED` với `0` container/network mồ côi).
   - Phiên nghiệm thu web local đồng thời 2 sinh viên trên `V38` (`f9a5d13c`): Lab 1 `THEORY_QUIZ` (`RETURNED` -> resubmit -> `GRADED 90/100` -> unlock Lab 2), Lab 2 `THEORY_QUIZ_STUDIO` với frozen topology A (`orders` revision 3, `86.67 PASSED` cho cả S1 & S2, `0` orphan `mavisrun-*`). Bản lưu trữ chi tiết tại [`archive/handoffs-nov2026/MAVIS_HANDOFF_WORK_REPORT_2026-11-17.md`](./archive/handoffs-nov2026/MAVIS_HANDOFF_WORK_REPORT_2026-11-17.md).

---

## 5. Cập nhật Nghiệm thu Production Live (`https://maviss.site` · 21–22/11/2026)

1. **Vận hành Production 2-Slot Concurrent Studio Live & Startup Recovery (`dde683ae`, CI `#44929606486` 6/6 GREEN):**
   - `RuntimeQueueCoordinator` + `RuntimeSessionServiceImpl.recoverDispatchesAfterRestart()` tự động thu hồi phiên `ALLOCATED`/`RUNNING`/`CANCELLING` và Docker stack `mavisrun-*` còn sót sau khi container backend khởi động lại; `cancelling-stuck-seconds = 60`; bảo toàn `cancelRequestedAt` khi gọi Stop lặp.
   - Kiểm chứng end-to-end toàn bộ vòng đời khóa học thực tế **`MSA2026-K21`** trên `https://maviss.site` (5 chương Curriculum v6, 5 Lab đủ 3 chế độ `THEORY_ONLY` / `THEORY_QUIZ` / `THEORY_QUIZ_STUDIO` trên 2 GitHub repo thật, 3 sinh viên): 2 Docker stack thật chạy song song, sinh viên thứ 3 vào **FIFO Queue #1** và tự động thăng hạng (auto-promotion) sau khi slot giải phóng, bài tập **1-Click Exercise Templates** giữ điểm **F1 = 100%** sau `PAUSE/RESUME` & `Finish Studio`, `3/3` bài nộp WF-04, và chuỗi tự mở khóa **Lab 1 -> Lab 2 -> Lab 3**.
2. **Hoàn thiện UX Giảng viên & Chốt các điểm đối chiếu Hội đồng (`fc389db1`, `58960b01` + đợt chốt Defense 1.1):**
   - **Hiệu năng Gradebook & `/members` (`58960b01`)**: thay truy vấn `@EntityGraph` 9 bảng kéo JSONB ảnh snapshot bằng 2 scalar-only projection (`GradebookSubmissionProjection`, `GradebookReviewProjection`), kéo thời gian tải `/gradebook` từ >15s xuống `< 2s` và hiển thị chính xác tiến độ/điểm trung bình của từng sinh viên trên `/members`.
   - **Bố cục N6 (`1366×768` & `1440×900`) & Song ngữ EN/VI (`SR-15`)**: khóa breadcrumb 1 dòng không đè chữ `MAVIS`, banner lớp 1 hàng ngang không rớt tab `Settings`, bảng Passkey/Telemetry không tràn khung, trang `/assignments` không sập cột ở cửa sổ hẹp, bổ sung phản hồi `Copied!`, tooltip nút `Finish Studio`, auto-scroll Curriculum Inspector, SpeedGrader `Next pending (N) →`, thanh `Quick score (apply to all N snapshots)` tuân thủ `BR-10 > 5.0`, và bổ sung bản dịch VI cho `Grading · SpeedGrader`, `Submission Review`, `Submissions Queue`, `Search submissions`, `Finish Studio`, `Service Telemetry`.
   - **F-02 (`DS-01a`) & `THEORY_ONLY`**: gắn nút **`Download Reference .zip`** (`GET /api/backend/assignments/{id}/reference-source`) trực tiếp trên bước 1 không gian Lab của sinh viên; render đầy đủ nội dung đọc Markdown (`MarkdownPreview`) cho bài Lab `THEORY_ONLY` không đính kèm repo.
   - **F-01 (Google OAuth UI)** & **F-12 (Admin Control Center)**: cô lập nút Google GSI chính thức theo `colorScheme: "light"` + `[clip-path:circle(50%)]` chờ sự kiện `load`; bổ sung endpoint `POST /api/v1/admin/integrations/{id}/test` + nút **`Test connection`** và banner hiển thị trực tiếp hạn mức slot/hàng chờ Runner ngay trong trang Admin Governance.
3. **Ánh xạ Ranh giới Kiến trúc (`SDD §1.1` / `SR-09`) & Luồng Học (`4 Logical Stages ↔ 3 UI Steps`):**
   - **Kiến trúc BFF & AI Boundary (`SR-09`)**: Trình duyệt không gọi trực tiếp Java Backend hay nhà cung cấp LLM; mọi request đi qua Next.js App Router BFF (`/api/mavis/*`, `/api/backend/*`, `/api/ai-diagram-semantics`) với cookie `HttpOnly` JWT, `allowedBackendPath` allowlist, và kiểm tra `AI_USAGE` / redaction trước khi gọi Gemini/OpenAI.
   - **Ánh xạ 4 chặng logic (`BM01/BM04`) ↔ 3 bước giao diện hợp nhất (`/lab?step=1..3`)**:
     | Chặng logic BM01/BM04 | Bước UI `/lab` & `/roadmap` | Vai trò nghiệp vụ |
     |---|---|---|
     | Stage 1 · Static Exploration (`C1–C3`, Dependency Graph, 3E AI) | `/lab?step=1` (`Static Studio`) | Khám phá kiến trúc tĩnh, tải Reference `.zip`, chạy Reverse BFS, hỏi AI Tutor có bằng chứng |
     | Stage 2 · Theory & Automated Quiz Gate (`BR-06`) | `/roadmap` (Module Theory & Quiz Runner) + `/lab?step=1` (Lab `THEORY_ONLY` Markdown) | Đọc lý thuyết Markdown và vượt ngưỡng Quiz Gate để mở khóa `runtimeUnlocked = true` |
     | Stage 3 · Live Docker Runtime & MAVIS Studio (`WF-03`) | `/lab?step=2` (`MAVIS Runtime Studio` -> Studio Live full-screen) | Khởi chạy container thật, `STOP/START/SCALE/PAUSE/RESUME/THROTTLE_CPU/SET_LOAD`, chụp Snapshot & ký `RuntimeReceipt` |
     | Stage 4 · Evidence Freeze, Submission & Grading (`WF-04`) | `/lab?step=3` (`Evidence Review` & `#lab-submit`) -> `/submissions/[id]` | Đối chiếu minh chứng đóng băng SHA-256, nộp giải trình và chấm từng Snapshot `> 5.0/10` |
