# WF-04 · Nộp bài theo Snapshot (`packageDigest`), Chấm từng Snapshot (`> 5.0/10`) & Tự động mở khóa Lab (`C04` -> `C01`)

Hợp đồng kỹ thuật, cơ chế đóng băng bằng chứng nộp bài (`V28`, `V29`, `V30`), quy tắc chấm điểm theo từng Snapshot của giảng viên và luồng tự động mở khóa Lab kế tiếp cho **WF-04** (Liên kết với [`WF01_COURSE_ACCESS.md`](./WF01_COURSE_ACCESS.md), [`WF02_STATIC_QUIZ_C02.md`](./WF02_STATIC_QUIZ_C02.md), [`WF03_RUNTIME_STUDIO_C03.md`](./WF03_RUNTIME_STUDIO_C03.md) và [`MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md`](./MAVIS_DEFENSE_1_1_MASTER_VERIFICATION_REPORT.md)).

## 1. Quy tắc nghiệp vụ (`BR-09`, `BR-10`) & Lược đồ CSDL (`V28`–`V30`)

- **BR-09 · Snapshot Evidence Freeze, SHA-256 Digest & Per-Snapshot Grading:**
  - Sinh viên phải đạt Quiz hiện hành của Lab. Điểm 3E được giữ trong gói bằng chứng để giảng viên tham khảo.
  - Lab tĩnh yêu cầu giải trình cho `STEP_1_STATIC`. Lab yêu cầu Runtime bổ sung receipt Studio khớp với phiên bản mô hình. Với Studio tương tác, backend đóng băng từng Snapshot đã chụp cùng giải trình ghi lúc chụp. Với phiên Studio cũ, sinh viên giải trình thêm cho `STEP_4_RUNTIME`.
  - Hệ thống đóng băng đồng thời ảnh chụp Quiz (`courseQuizEvidence` — `V28`), danh sách giải trình từng Snapshot của sinh viên (`studentSnapshots` JSONB — `V30`), và băm SHA-256 toàn bộ gói bằng chứng vào `evidencePackageDigest` (`sha256:<64-hex>`, index `ix_submission_evidence_package_digest` — `V29`). Việc xuất báo cáo (`GET /api/v1/submissions/{submissionId}/export`) trả `SubmissionExportBundleDTO` kèm `evidencePackageDigest` và `studentSnapshots`.
  - **Quy tắc chấm điểm từng Snapshot (`SubmissionReviewService`):**
    - Giảng viên nhập điểm `snapshotGrades[]` trên thang **`0.00` .. `10.00`** cho từng Snapshot (tối đa 2 chữ số thập phân; ngoài `[0, 10]` trả `HTTP 400`).
    - Khi công bố kết quả Guided Lab, hệ thống yêu cầu đúng một điểm cho mỗi ID Snapshot đã đóng băng và tính điểm tổng từ trung bình các điểm Snapshot trên thang 100. Bản nháp có thể lưu một phần điểm và chưa có điểm tổng.
    - **Ngưỡng đạt theo Snapshot (`SNAPSHOT_PASS_EXCLUSIVE_THRESHOLD = 5.0`):** Mọi Snapshot trong `snapshotGrades` bắt buộc **nghiêm ngặt `score > 5.0`** (tức `score <= 5.0` bị tính là chưa đạt). Khi `status == "GRADED"`, chỉ khi tất cả Snapshot `> 5.0` thì `labOutcome = "PASSED"`; ngược lại dù điểm trung bình tổng cao hơn `50/100`, nếu có ít nhất 1 Snapshot `<= 5.0` thì `labOutcome = "NEEDS_REVISION"`.
    - Khi `status == "GRADED"`, trường `summary` (nhận xét tổng thể của giảng viên) là **bắt buộc không được rỗng** (`APPROVAL_SUMMARY_REQUIRED` / `HTTP 400`); khi `status == "RETURNED"`, lý do trả về cũng bắt buộc (`REJECTION_REASON_REQUIRED` / `HTTP 400`).
    - Nháp đánh giá `status == "DRAFT"` luôn được ẩn khỏi sinh viên khi `GET /review` (sinh viên nhận trạng thái `PENDING`, `labOutcome = "PENDING"`). Lưu song song được bảo vệ bằng pessimistic lock + `expectedRevision` optimistic concurrency (`HTTP 409` khi lệch revision). Giảng viên tự chấm bài của chính mình bị chặn (`HTTP 403`).
- **BR-10 · Atomic Transaction Handshake (`C04 -> C01` Auto-Unlock):**
  - Ngay sau khi `reviews.saveAndFlush(review)` ở trạng thái `GRADED`, trong cùng giao dịch JPA `@Transactional`, `SubmissionReviewService.save` gọi:
    ```java
    courseProgression.recordFinalizedResult(id, review.getRevision(), passed);
    ```
  - Nếu `labOutcome == "PASSED"` (`passed == true`), `CourseProgressionService` cập nhật trạng thái hoàn thành Lab `N`, phát sinh thông báo `course-lab-unlocked:{nextAssignmentId}` (idempotent theo `recipient_id + event_key` trong bảng `user_notifications`), và tự động mở khóa **`Lab N+1`** (`UNLOCKED` trên Course Roadmap). Nếu `passed == false` (`NEEDS_REVISION`), **`Lab N+1` giữ nguyên trạng thái `LOCKED`** (`PREREQUISITE`).
  - Kết quả Guided Lab đã công bố đạt được giữ cố định để nhất quán với tiến độ. Yêu cầu sửa kết quả đã đạt hoặc nộp bản mới sau khi Lab đã đạt trả `409`. Bài chưa đạt vẫn có thể được trả về và sinh viên có thể nộp lại.
- **Flyway Migrations liên quan WF-04:**
  - `V28__Submission_Course_Quiz_Evidence.sql`: cột `submission_snapshots.course_quiz_evidence` (`JSONB`).
  - `V29__Submission_Evidence_Package_Digest.sql`: cột `submission_snapshots.evidence_package_digest` (`VARCHAR(71) NOT NULL`) + index `ix_submission_evidence_package_digest`.
  - `V30__Submission_Snapshot_Grades_And_Explanations.sql`: `submission_snapshots.student_snapshots` (`JSONB`), `submission_reviews.snapshot_grades` (`JSONB`), `submission_reviews.lab_outcome` (`VARCHAR(24)`).
  *(Lưu ý: Bản kế hoạch ban đầu dự kiến số `V29` cho `Submission_Snapshot_Grades_And_Explanations`, nhưng vì đồng đội đã đăng ký `V29__Submission_Evidence_Package_Digest.sql` ở commit `a2119f0`, hệ thống đánh số tuần tự chuẩn Flyway là `V30__Submission_Snapshot_Grades_And_Explanations.sql` và bảo toàn toàn vẹn `V29` lẫn `V30` trong CI/CD).*

## 2. Hợp đồng API `C04` & UX Frontend 4 Chặng

| HTTP | Đường dẫn | Chức năng & Ràng buộc |
|---|---|---|
| GET | `/api/v1/submissions/me`, `/api/v1/submissions` | Danh sách bài nộp của sinh viên hiện tại |
| POST | `/api/v1/submissions` | Tạo `SubmissionSnapshot` mới (nhận `studentSnapshots[]`, tính `evidencePackageDigest` SHA-256, đóng băng `courseQuizEvidence`, chặn nếu Quiz chưa `PASSED`) |
| GET | `/api/v1/assignments/{assignmentId}/submissions` | Danh sách bài nộp của Assignment cho giảng viên |
| GET | `/api/v1/projects/{projectId}/submissions` | Danh sách bài nộp gắn với dự án |
| GET | `/api/v1/submissions/{submissionId}` | Chi tiết bài nộp đã đóng băng (`SubmissionResponseDTO`) |
| GET | `/api/v1/submissions/{submissionId}/export` | Xuất gói `SubmissionExportBundleDTO` gồm `evidencePackageDigest` và `studentSnapshots` |
| GET | `/api/v1/submissions/{submissionId}/review` | Đọc kết quả chấm (`View` gồm `revision`, `status`, `score`, `summary`, `snapshotGrades[]`, `labOutcome`); ẩn `DRAFT` với sinh viên |
| PUT | `/api/v1/submissions/{submissionId}/review` | Lưu/xuất bản chấm điểm (`Save` với `expectedRevision`, `snapshotGrades[]`, kiểm tra `> 5.0/10`, gọi `CourseProgressionService.recordFinalizedResult`) |

**Frontend (`MAVIS-Frontend`):**
- `src/features/courses/lab-submission-v2.tsx` (`#lab-submit`): Form nộp Lab v2 (`THEORY_QUIZ` / `THEORY_QUIZ_STUDIO`, `V38`) không yêu cầu chọn diagram/model, tự gắn `runtimeSessionId` khi Lab cần Studio, lưu nháp cục bộ cô lập theo `labSubmissionDraftKey(userId, workspaceId, assignmentId)` (`localStorage`), tự xóa nháp khi nộp thành công và nạp lại giải trình cũ khi bấm `Revise and resubmit`.
- `src/features/submissions/composer.tsx` (`#submission-composer`): Trình soạn thảo giải trình theo **4 bước/snapshot (`Giai đoạn 1..4`)** cho Lab `LEGACY`, hỗ trợ tự điền tên project Guided Mode, gắn `referenceSnapshotId` khi tạo project và nút 1-click `"Run Static Analysis Now"` khi project chưa có model phân tích.
- Với phiên Studio tương tác, các snapshot C03 đã chụp được đưa vào `studentSnapshots[]` cho cả Guided Lab và bài tự do; frontend không được bỏ các snapshot này chỉ vì `guided = true`. Backend tiếp tục chuẩn hóa danh sách theo Studio evidence đã đóng băng trước khi tính `evidencePackageDigest`.
- `src/features/submissions/frozen-artifacts.tsx`: Hiển thị `evidencePackageDigest` SHA-256, chứng chỉ Quiz đóng băng (`courseQuizEvidence`), và danh sách giải trình `studentSnapshots[]` qua `SubmissionEvidenceHeader` cho cả bài nộp Lab v2 (không có `diagramLayout`) lẫn bài nộp `LEGACY`.
- `src/features/submissions/grading.tsx` & `screens.tsx` (`SubmissionResult`): Chuẩn hóa qua `resolveSubmissionOutcome(review)` để cả màn hình kết quả của sinh viên lẫn bảng chấm của giảng viên tuân thủ thống nhất quy tắc `labOutcome` (`> 5.0/10` mọi Snapshot -> `"PASS"`, bất kỳ Snapshot `<= 5.0/10` -> `"NEEDS REVISION"` ngay cả khi điểm tổng `> 50/100`), kèm cảnh báo song ngữ EN/VI trực tiếp trên `GradeForm`. `GradeForm` hiển thị nguyên văn `writtenExplanation` của từng Snapshot trên thẻ nhập điểm và bảo toàn nháp đang nhập qua các đợt làm mới `revision` (`409` stale recovery).
- Khi đọc response C04 cũ chưa có `labOutcome`, trạng thái phát hành vẫn được ưu tiên: `PENDING` không hiển thị kết quả và `RETURNED` luôn là `NEEDS REVISION`, không suy ngược thành `PASS` từ điểm cũ.

## 3. Đối chiếu Ma trận Nghiệm thu BM04 (`Wf04AcceptanceMatrixTest` — **33 ca** gồm `F04`, `F11`, `F12`, `TC-GR01..06`, `TC-ST04`, `TC-WF04-E2E`, `TC-N06`)

| Mã cam kết BM04 | Phương thức / Bài test chứng minh | Kết quả & Phạm vi xác minh |
|---|---|---|
| `F04-001` .. `F04-008` | `Wf04AcceptanceMatrixTest` (`f04_001`..`f04_008`), `SubmissionServiceImplTest` | **PASS**: Đóng băng `courseQuizEvidence`, `studentSnapshots`, tính `evidencePackageDigest` (`sha256:`), export kèm digest & giải trình, từ chối khi chưa qua Quiz Gate |
| `F11-001` .. `F11-008`, `TC-GR01`..`06` | `Wf04AcceptanceMatrixTest` (`f11_001`..`f11_008`, `tcGr01`..`tcGr06`), `SubmissionReviewServiceTest` | **PASS**: Chấm từng Snapshot `0..10`; nếu bất kỳ Snapshot `<= 5.0` (như cặp `(9.0, 5.0)` -> tổng `70.00`) thì `labOutcome = NEEDS_REVISION` & `Lab N+1` giữ khóa; tất cả `> 5.0` + `summary` -> `labOutcome = PASSED` + gọi `courseProgression.recordFinalizedResult(..., true)`; thiếu `summary` -> `400`; `DRAFT` ẩn với sinh viên; stale revision -> `409`; tự chấm bài -> `403` |
| `F12-001` .. `F12-008`, `TC-WF04-E2E`, `TC-ST04`, `TC-N06` | `Wf04AcceptanceMatrixTest` (`f12_001`..`f12_008`, `tcWf04E2eSubmitGradeAndUnlockFlow`, `tcSt04GradingStateTransitions`, `tcN06AdminNotificationAndOwnershipSecurityMatrix`), `course-learning-ui.test.cjs` | **33/33 PASS** (`0` fail, `0` error, `0.739 s`): Chu trình end-to-end 2 Lab (nộp -> rớt snapshot -> trả revision -> nộp lại pass tất cả snapshot `> 5.0` -> tự mở khóa Lab 2), phân quyền sở hữu, thông báo & hiệu năng |
