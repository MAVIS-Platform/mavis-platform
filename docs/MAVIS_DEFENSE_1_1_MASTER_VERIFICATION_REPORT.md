# Báo Cáo Tổng Hợp Kiểm Chứng & Nghiệm Thu Hội Đồng Kín 1.1 (`MAVIS Defense 1.1 Master Verification Report`)

Báo cáo tổng hợp bằng chứng hoàn thiện, truy vết mã nguồn, lược đồ CSDL (`V26`–`V31`), CI/CD và kết quả chạy kiểm thử thực tế trên toàn bộ 4 luồng nghiệp vụ **WF-01 .. WF-04** của nền tảng **MAVIS**.

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
| **Đợt hoàn thiện Argon 100% (Single-Branch #2)** | `feat/argon-complete-100pct-all-workflows-studio2d-curriculum` | `45f0c07` -> `53a7355` -> *(Stage 5 hiện tại)* | BFF `allowedBackendPath` mở `course-labs/seed-curated`, `CourseLabSeederService` hỗ trợ 2 preset `STANDARD_DEMO` (3 Lab: `java-04`, `java-07`, `csharp-13`) & `FULL_CURRICULUM` (13 Lab: `java-01..12` + `csharp-13`) kèm archive Java + `.NET Core` (`Orders/Program.cs`, `Catalog/Program.cs`, `inventory-service`), `SubmissionComposer` tự chọn dự án lớp & phiên Studio + nút 1-click `Run 5-Rule Static Evaluation`, **Interactive 2D Studio Topology Canvas** (`Stop/Start/Scale 1..8` trực tiếp trên node + stacked replica cards & stopped rose state + song ngữ EN/VI), giữ nguyên 100% commit đồng đội `a947667` / `a09673f` / `2351622` (`V31`), và mở rộng bộ acceptance test lên **120 ca `@Test`** (`F10-009` + `F10-010`) |

> **Ghi chú đồng bộ Flyway (`V29`–`V31`):** Nhánh `main` đã tiếp nhận `V29__Submission_Evidence_Package_Digest.sql` (`a2119f0`), `V30__Submission_Snapshot_Grades_And_Explanations.sql` (`dfd0cb4`) và **`V31__WF01_Customer_Ready_Identity_And_Course.sql`** (`a09673f`/`2351622`: `users.avatar_url`, `users.preferred_locale`, `workspaces.max_students`, `refresh_sessions`, `auth_rate_limits`). Hệ thống bảo toàn nguyên vẹn toàn bộ chuỗi migration `V1..V31`.

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

Chạy trực tiếp trên nhánh `feat/mavis-final-100pct-all-workflows-polish` (môi trường Windows 11, JDK 21, .NET 10, Node.js 25, Python 3):

1. **Java Backend (`MAVIS-Platform/mavis-be` · profile `.github/workflows/deploy-production.yml` với `-pl mavis-bootstrap -am` bao gồm `CourseLabSeederServiceTest`):**
   - `mavis-common`: **18/18 PASS** (`0` fail, `0` error, `0` skip)
   - `mavis-platform`: **125/125 PASS** (`0` fail, `0` error, `0` skip — bao gồm `CourseLabSeederServiceTest` 2/2, `CourseQuizServiceTest`, `SubmissionServiceImplTest`, `SubmissionReviewServiceTest`, `AssignmentServiceImplTest`)
   - `mavis-analyzer`: **219/219 PASS** (`0` fail, `0` error, `0` skip — bao gồm `RuntimePlanningServiceTest`, `RuntimeSessionServiceImplTest`, `RunnerReceiptIngestServiceImplTest`, `OtelTraceCorrelationServiceImplTest`)
   - `mavis-bootstrap`: **146 executed PASS**, **6 skip có điều kiện PostgreSQL** (`MigrationUpgradeTest`, `SessionLogoutPostgresTest`, `CourseAccessPostgresTest`, `CourseHttpAcceptanceTest`, `ResourceDeletionPostgresTest`, `NotificationReadPostgresTest` tự động skip khi chưa đặt `MAVIS_MIGRATION_TEST_JDBC_URL`; tổng `152`, `0` fail, `0` error — bao gồm **119/119 PASS** của `Wf01` 29/29, `Wf02` 29/29, `Wf03` 28/28, `Wf04` 33/33)
   - **Tổng kết BE CI Profile:** **508/508 test thực thi PASS** (`514` tổng, `6` conditional Postgres skip, `0` fail, `0` error).
2. **.NET Worker & Runner (`MAVIS.Worker/tests/MAVIS.Worker.Tests` · `--configuration Release`):**
   - **240 PASS**, `3` skip có điều kiện nền tảng Linux/Docker daemon (`SourceFileAndRootSymlinksCannotEscapeScope`, `LinkedStateRootIsRejectedWithoutChangingTarget`, `RealDockerSuccessAndCancellationUseManagedIdentityAndDurableAcknowledgement`), tổng `243`, **`0` fail** (`7 s`).
3. **Python Deploy & Schema Migration Tests (`deploy/tests`):**
   - **7/7 OK** (`0.031s`, đã bao gồm `test_course_schema.py` cho `V26`–`V30`).
4. **Next.js Frontend (`MAVIS-Frontend`):**
   - `npm run typecheck`: **PASS** (`tsc --noEmit --incremental false`)
   - `npm test`: **387/387 PASS**, `0` fail, `0` skipped (`14852.18 ms`)
   - `npm run test:connected`: **3/3 PASS**, `0` fail, `0` skipped
   - `MAVIS_TEST_BROWSER_CHANNEL=chrome npm run test:three-e-ui`: **PASS** (`PASS: full 3E browser suite plus diagram dock regression; synthetic API only.`)
   - `npm run build`: **PASS** (`Next.js 15.5.25`, compiled successfully in `6.9s`, `0` errors).
