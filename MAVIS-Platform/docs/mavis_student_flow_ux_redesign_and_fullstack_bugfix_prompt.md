# MAVIS — Báo Cáo Kiểm Tra Toàn Diện Luồng Sinh Viên (Student Flow FE & BE) & Master Prompt Nâng Cấp UX An Toàn Cho AI Antigravity

Tài liệu này tập trung **100% vào luồng trải nghiệm của Sinh viên (Student Flow)** xuyên suốt từ lúc đăng nhập, tham gia lớp học (Workspace), nhận đề bài tập (Assignment), tạo dự án (Project), nạp mã nguồn (GitHub / ZIP Snapshot), phân tích kiến trúc (Graph, C4/UML Diagrams, 3E Inspector, Impact Analysis, Rule Evaluation, Runtime Verification) cho đến lúc nộp bài (Freeze & Submit) và xem điểm/nhận xét của Giảng viên.

Đặc biệt, toàn bộ giải pháp thiết kế lại UX và sửa lỗi trong tài liệu này tuân thủ **Nguyên tắc Bảo toàn Hợp đồng Giao tiếp (Zero-Regression Contract Safety)**: **TUYỆT ĐỐI KHÔNG** làm thay đổi cấu trúc API hiện có giữa FE và BE, không phá vỡ các hook dữ liệu (`useApi`, `useApiQuery`, `useApiMutation`, `useModel`, `useSelection`), và giữ nguyên 100% các bài kiểm thử tự động đang chạy xanh.

---

## PHẦN 1: BÁO CÁO PHÂN TÍCH CHI TIẾT — TẠI SAO LUỒNG SINH VIÊN HIỆN TẠI KHÓ DÙNG & CÁC LỖI FE/BE ĐÃ PHÁT HIỆN

Qua kiểm tra chi tiết từng tệp mã nguồn mới nhất trong `MAVIS-Frontend` và `MAVIS-Platform`, dưới đây là **7 vấn đề cốt lõi về UX và kỹ thuật (FE + BE)** đang làm sinh viên bị rối, bị kẹt thao tác hoặc không biết bấm vào đâu:

### 1. Lỗi Đứt Gãy Điều Hướng (Navigation Dead-End): Sinh viên vào Lớp học (`My Workspaces`) nhưng không có menu để mở trang Bài tập (`/assignments`)!
- **Vị trí lỗi**:
  - `src/lib/navigation.ts` (dòng 212–230)
  - `src/features/workspaces/screens.tsx` (`WorkspaceOverview`, dòng 97–121)
- **Hiện trạng trong code**:
  1. Trong `src/lib/navigation.ts` (dòng 212–220):
     ```ts
     export function contextualNavigation(
       role: AppRole,
       scope: WorkspaceScope,
     ): readonly NavigationGroup[] {
       if (role === "student" && scope === "project") return projectNavigation;
       if (role === "lecturer" && scope === "workspace") return lecturerWorkspaceNavigation;
       if (role === "lecturer" && scope === "review") return submissionReviewNavigation;
       return [];
     }
     ```
     Khi sinh viên (`role === "student"`) bấm vào một lớp học trong thanh menu bên trái (`/workspaces?workspace=<id>`), `scope` chuyển sang `"workspace"`. Nhưng hàm `contextualNavigation("student", "workspace")` lại trả về mảng rỗng `[]`! Kết quả là **thanh menu bên trái của Sinh viên hoàn toàn không có mục `Assignments` (`/assignments`), `Workspace Overview`, hay `Workspace Members`**!
  2. Nghiêm trọng hơn, tại màn hình `WorkspaceOverview` (`src/features/workspaces/screens.tsx` dòng 97–121):
     - Bảng `Class assignments` chỉ hiển thị tên bài tập dưới dạng chữ thuần (`render: (a) => a.title`), **không có đường link và không có nút bấm** để mở trang làm bài/nộp bài (`/assignments?workspace=<id>`)!
     - Ở cột bên phải (dòng 118), giao diện luôn vẽ khung `<DetailPanel title="Class settings"><WorkspaceControls ... /></DetailPanel>`. Vì `WorkspaceControls` trả về `null` đối với sinh viên, **sinh viên nhìn thấy một khung "Class settings" trống rỗng vô nghĩa chiếm mất 40% màn hình bên phải**!
  3. Khi sinh viên mở xem lại bài đã nộp tại `/submissions/[id]` (`scope === "review"`), `contextualNavigation("student", "review")` cũng trả về `[]` (vì dòng 218 chỉ kiểm tra `role === "lecturer"`), khiến sinh viên mất luôn menu nhảy nhanh đến các phần `#review`, `#submitted-analysis`, `#submitted-graph`, `#submitted-runtime`.
  4. Hàm `existingRouteContext(pathname)` (dòng 222–230) chỉ kiểm tra `projectNavigation` và `/import`, nên khi sinh viên truy cập `/assignments` hoặc `/workspace-overview`, tiêu đề trang và trạng thái menu bên trái bị nhảy sai về `"My Projects"`.

### 2. Lỗi Đứt Quãng Khi Tạo Dự Án Làm Bài Tập (Coursework Project) & Bỏ Quên Mã Nguồn Mẫu (`referenceSnapshotId`)
- **Vị trí lỗi**:
  - `src/features/submissions/composer.tsx` (dòng 91–132)
  - `src/lib/api/java-operations.ts` (`case "createProject"`, dòng 1182–1199)
  - `src/routes/import.tsx` (dòng 15–35)
- **Hiện trạng trong code**:
  1. Trong `SubmissionComposer` (`composer.tsx` dòng 91–113), khi sinh viên nhập tên vào ô `"New coursework project name"` và bấm `"Create coursework project"`, hệ thống tạo xong dự án nhưng **không tự động chọn (`setProjectId`) dự án vừa tạo** vào `ProjectSelector` bên dưới! Sinh viên phải tự bấm lại vào ô chọn dự án để tìm.
  2. Khi Giảng viên đã đính kèm sẵn **Mã nguồn mẫu (`assignment.referenceSource.snapshotId`)** vào đề bài tập, Backend Java (`ProjectServiceImpl.java` dòng 83–130) đã viết sẵn logic: nếu `createProject` truyền lên `referenceSnapshotId`, Backend sẽ tự động sao chép (clone) ngay `SourceSnapshot` mẫu của Giảng viên vào dự án của Sinh viên! Thế nhưng:
     - `SubmissionComposer` (`composer.tsx` dòng 95) lại không truyền `referenceSnapshotId`!
     - `java-operations.ts` (`case "createProject"`, dòng 1190) cũng bỏ sót không gửi `referenceSnapshotId` xuống Backend!
     Hệ quả là sinh viên phải tải file ZIP về máy rồi lại tự upload ngược lên!
  3. Khi sinh viên bấm vào link `"Import source and run analysis"` (`/import?project=...&workspace=...&assignment=...`), trang `/import` (`src/routes/import.tsx` dòng 25) redirect sang `/snapshots?project=...&import=1` và **làm rơi mất `workspace` và `assignment` trên URL**. Sau khi phân tích xong, sinh viên được đẩy sang trang đồ thị `/architecture` mà **không có bất kỳ thanh điều hướng hay nút bấm nào để quay lại đề bài tập nộp bài**!
  4. Nếu sinh viên tạo dự án ở trang chủ `My Projects` (`/`), dự án đó có `workspaceId = null` (`PERSONAL`). Khi vào trang Bài tập (`SubmissionComposer`), `ProjectSelector` lọc chỉ lấy dự án có `p.workspaceId === workspaceId`, nên **dự án sinh viên vừa phân tích ở trang chủ hoàn toàn biến mất khỏi danh sách nộp bài** mà không có lời giải thích nào!

### 3. Lỗi Nút `"Review submission"` Bị Khóa Cứng Vì Các Sơ Đồ Tự Động Bị Giấu Trong Thẻ `<details>` Đóng Kín
- **Vị trí lỗi**:
  - `src/features/submissions/artifact-selector.tsx` (dòng 23–122)
  - `src/features/submissions/composer.tsx` (dòng 65–74, 192–207)
- **Hiện trạng trong code**:
  - Để nút `"Review submission"` bật sáng, `SubmissionComposer` yêu cầu `choice.documents.length + choice.diagramVersionIds.length > 0` và phải đủ các loại sơ đồ trong `requiredDiagramTypes`.
  - Trong `ArtifactSelector` (`artifact-selector.tsx`), danh sách `"Diagram versions to submit"` ở trên chỉ liệt kê các bản vẽ mà sinh viên đã bấm nút Save thủ công trong Draw.io (`documentRevisions`). Nếu sinh viên chưa bấm Save thủ công trong Draw.io, danh sách này báo `"No saved diagram documents for this model yet."`.
  - Trong khi đó, các sơ đồ kiến trúc đã được hệ thống trích xuất tự động (`Generated model projections`) lại bị **giấu bên trong thẻ `<details>` đóng kín** ở cuối khung và **không có ô checkbox nào được chọn sẵn**! Sinh viên nhìn vào thấy nút `"Review submission"` bị xám (disabled) và không hiểu tại sao mình đã phân tích code ra sơ đồ rồi mà vẫn không nộp bài được!

### 4. Sinh Viên Không Biết Chấm Điểm Quy Tắc Kiến Trúc (`evaluateModel` — 5 Rules) Ở Đâu Trước Khi Nộp Bài
- **Vị trí lỗi**:
  - `src/features/submissions/composer.tsx` (dòng 47–55, 150–160)
  - `src/features/projects/screens.tsx` (`ProjectOverview`)
  - `SubmissionServiceImpl.java` (dòng 117–125)
- **Hiện trạng trong code**:
  - Trong `SubmissionComposer`, có ô chọn `"Evaluation run to submit"`, nhưng mặc định là `"Do not include evaluation"` và không có nút bấm để chạy đánh giá ngay tại đó.
  - Ở phía Backend (`SubmissionServiceImpl.java` dòng 118–125), nếu sinh viên quên chọn `evaluationRunId` trong dropdown (để mặc định `"none"`), Backend lưu `evaluationRun = null` dù sinh viên đã chạy đánh giá cho `ModelVersion` đó rồi, làm mất điểm `complianceScore` trong báo cáo bài nộp!

### 5. Lỗi Nuốt Thông Báo Lỗi Nghiệp Vụ Giữa Backend và Frontend (`java-client.ts` & `api-error.ts`)
- **Vị trí lỗi**:
  - `src/lib/api/java-client.ts` (dòng 30–61)
  - `src/lib/errors/api-error.ts` (dòng 33–65)
- **Hiện trạng trong code**:
  - `SubmissionServiceImpl.java` (dòng 64–156) kiểm tra rất kỹ 11 điều kiện khi sinh viên nộp bài (quá hạn, sai workspace, bản nháp `PARTIAL`, thiếu loại sơ đồ bắt buộc `Missing required diagram type: ...`, thiếu `Runtime Trace` hoặc phiên chạy chưa `PASSED`, lệch `SourceSnapshot`...).
  - Tuy nhiên, hàm `backendErrorCode(...)` trong `src/lib/errors/api-error.ts` (dòng 50–63) mới chỉ bắt đúng 4 câu thông báo, còn **7 câu thông báo lỗi quan trọng còn lại bị bỏ qua** và bị `java-client.ts` biến thành lỗi chung chung: `"The request is invalid. Review your selections and try again."`! Sinh viên gặp lỗi này hoàn toàn không biết bài nộp của mình thiếu điều kiện gì để sửa.

### 6. Giao Diện Trang Chủ (`/`), Tổng Quan Dự Án (`/project-overview`) và Khám Phá Kiến Trúc (`/architecture`) Chưa Có Thanh Tiến Trình Hướng Dẫn Từng Bước (Guided Stepper)
- Khi sinh viên mới đăng nhập vào `/` hoặc mở một dự án tại `/project-overview`, có quá nhiều thuật ngữ (`Snapshots`, `Revisions`, `3E`, `Impact`, `Runtime Configuration`, `Scenarios`, `Sessions`) nằm rải rác ở menu bên trái.
- Đặc biệt trên màn hình laptop chuẩn (`< 1280px`), `app-shell.tsx` (dòng 285) tự động thu gọn sidebar thành các icon nhỏ, khiến sinh viên khi đang ở trang `/architecture` hoặc `/diagrams` không thấy thanh chuyển đổi nhanh giữa **Sơ đồ mạng (Graph Explorer)** ↔ **Sơ đồ C4/UML (Diagrams)** ↔ **Phân tích tác động (Impact)** ↔ **Chỉnh sửa mô hình (Model Editor)** ↔ **Kiểm thử Runtime**.

### 7. Các Lỗi Bắt Exception & Edge Cases Ở Java Backend (`GlobalExceptionHandler.java`, `ProjectServiceImpl.java`, `SubmissionServiceImpl.java`)
1. **`GlobalExceptionHandler.java`**:
   - Chưa có `@ExceptionHandler` riêng cho `DataIntegrityViolationException` và `ObjectOptimisticLockingFailureException` / `OptimisticLockException`, dẫn đến khi có xung đột dữ liệu hoặc khóa ngoại, hệ thống trả về **HTTP 500 Internal Server Error** thay vì **HTTP 409 Conflict**.
   - Chưa bắt `IllegalArgumentException` và `ConstraintViolationException` về **HTTP 400 Bad Request**.
2. **`ProjectServiceImpl.java` (`createProject`)**:
   - Khi truyền `assignmentId`, chưa tự động suy ra `workspace = assignment.getWorkspace()` nếu `workspaceId` bị thiếu, và chưa kiểm tra `assignment.getWorkspace().getId().equals(workspace.getId())` để ngăn tạo dự án lệch lớp học.
   - Khi clone `refSnapshot`, nếu `request.getRepositoryUrl()` rỗng thì chưa kế thừa `repositoryUrl` từ dự án mẫu của Giảng viên.
3. **`SubmissionServiceImpl.java` (`submitAssignment`)**:
   - Khi `request.getEvaluationRunId() == null`, chưa tự động lấy lượt `EvaluationRun` mới nhất của `modelVersion` đó (nếu sinh viên đã chạy đánh giá), làm `complianceScore` bị `null` một cách đáng tiếc.

---

## PHẦN 2: NGUYÊN TẮC AN TOÀN TUYỆT ĐỐI KHI SỬA CODE (CONTRACT & LOGIC SAFETY GUARDRAILS)

Để đảm bảo AI Antigravity **không bao giờ làm hỏng giao tiếp FE-BE hoặc làm lỗi giao diện đang chạy**, Prompt dưới đây áp đặt 5 chốt chặn kỹ thuật bắt buộc:
1. **Không đổi chữ ký API & Schema Zod**: Giữ nguyên 100% tên các `Operation` trong `src/lib/api/contracts.ts`, cấu trúc trả về trong `src/lib/api/java-operations.ts` và `src/lib/api/java-wire.ts`, cũng như các đường dẫn `@RequestMapping` ở Java Backend.
2. **Bảo toàn 100% mã lỗi hiện có trong `api-error.ts`**: Giữ nguyên tất cả các key và chuỗi thông báo cũ trong `publicErrors` (`DELETE_BUSY`, `DELETE_PROTECTED`, `DELETE_REFERENCED`, `LOGIN_*`, `SUBMISSION_*`, `GITHUB_*`), chỉ bổ sung thêm các mã lỗi chi tiết mới.
4. **Cải tiến UX theo hướng cộng thêm (Additive & Guided UX)**: Giữ nguyên toàn bộ các form, bảng dữ liệu và component hiện có (`DataTable`, `DetailPanel`, `SummaryCard`, `ProjectSelector`, `ModelVersionSelector`, `DependencyNetwork`, `ArchitectureDiagrams`, `SelectionThreeE`), chỉ bổ sung **Thanh hướng dẫn từng bước (Student Guided Stepper)**, **Thanh chuyển nhanh góc nhìn (Quick Mode Switcher)**, **Tự động chọn mặc định thông minh (Smart Auto-Selection)** và **Nút liên kết mạch lạc giữa các bước**.

---

## PHẦN 3: MASTER PROMPT CHI TIẾT GIAO CHO AI ANTIGRAVITY THỰC THI (SAO CHÉP NGUYÊN VĂN)

Hãy sao chép toàn bộ khối lệnh dưới đây và gửi cho **Antigravity**:

```markdown
# ROLE & OBJECTIVE FOR ANTIGRAVITY AI
You are a Principal Full-Stack Engineer working on the **MAVIS** platform (`MAVIS-Frontend` Next.js 15 App Router + `MAVIS-Platform` Java 21 Spring Boot Backend).
Your goal is to **fix all Student-flow bugs, harden Frontend/Backend exception handling, and redesign the Student UX so that it is intuitive, guided, and effortless to use from start to finish** — while **STRICTLY PRESERVING** all existing API contracts, React Query hooks (`useApi`, `useApiQuery`, `useApiMutation`, `useModel`, `useSelection`), and automated tests.

## STRICT SAFETY & VOCABULARY GUARDRAILS (MANDATORY)
1. **DO NOT BREAK API CONTRACTS OR HOOKS**:
   - Never rename or remove any operation in `src/lib/api/contracts.ts` or `src/lib/api/java-operations.ts`.
   - Never change the JSON response envelope (`ApiResponse<T>`) or existing field names in Java DTOs.
   - Never break existing unit or integration tests in `MAVIS-Frontend` or `MAVIS-Platform`.
2. **CLEAR SOFTWARE ENGINEERING PHRASING**:
   - Use clear Software Engineering phrasing everywhere in code, comments, and UI labels (e.g., `"Analysis summary"`, `"System check"`, `"Execution details"`).
3. **PRESERVE EXISTING `data-testid` AND ACCESSIBILITY ATTRIBUTES**:
   - Keep all existing `aria-label`, `role`, and `data-testid` attributes intact so all E2E/integration tests pass.

---

## TASK 1: Fix Student Sidebar Navigation & Route Context (`src/lib/navigation.ts` & `src/components/app-shell.tsx`)

### 1.1. Add `studentWorkspaceNavigation` and Fix `contextualNavigation` in `src/lib/navigation.ts`
Currently, in `src/lib/navigation.ts` (lines 212–220):
- `contextualNavigation("student", "workspace")` returns `[]`, leaving Students with no sidebar links to `/assignments` or `/members` when they select a class under `My Workspaces`.
- `contextualNavigation("student", "review")` also returns `[]`, hiding the review section links when a Student inspects their submitted work at `/submissions/[submissionId]`.
- `existingRouteContext(pathname)` (lines 222–230) only checks `projectNavigation` and `/import`, returning `{ scope: "global", title: "My Projects", activeId: "projects" }` even when the user is on `/assignments`, `/workspace-overview`, `/members`, `/references`, or `/submissions/[id]`.

**Action in `src/lib/navigation.ts`**:
1. Define `studentWorkspaceNavigation` right below `lecturerWorkspaceNavigation`:
   ```ts
   export const studentWorkspaceNavigation: readonly NavigationGroup[] = [
     {
       label: "Class Workspace",
       items: [
         {
           id: "workspace-overview",
           label: "Class Overview",
           icon: LayoutGrid,
           href: "/workspace-overview",
         },
         {
           id: "assignments",
           label: "Assignments & Submit",
           icon: BookOpen,
           href: "/assignments",
         },
         {
           id: "members",
           label: "Class Members",
           icon: Users,
           href: "/members",
         },
         {
           id: "submissions",
           label: "My Submissions",
           icon: ClipboardCheck,
           href: "/submissions",
         },
       ],
     },
   ];
   ```
2. Update `contextualNavigation(role: AppRole, scope: WorkspaceScope)`:
   ```ts
   export function contextualNavigation(
     role: AppRole,
     scope: WorkspaceScope,
   ): readonly NavigationGroup[] {
     if (role === "student" && scope === "project") return projectNavigation;
     if (role === "student" && scope === "workspace") return studentWorkspaceNavigation;
     if (role === "lecturer" && scope === "workspace") return lecturerWorkspaceNavigation;
     if ((role === "lecturer" || role === "student") && scope === "review") {
       return submissionReviewNavigation;
     }
     return [];
   }
   ```
3. Update `existingRouteContext(pathname: string)` so workspace and review routes resolve accurately:
   ```ts
   export function existingRouteContext(pathname: string) {
     const projectPage = projectNavigation
       .flatMap((group) => group.items)
       .find((item) => item.href === pathname);
     if (projectPage) {
       return { scope: "project" as const, title: projectPage.label, activeId: projectPage.id };
     }
     if (pathname === "/import") {
       return { scope: "project" as const, title: "Import Project Source", activeId: "snapshots" };
     }
     const workspacePage = lecturerWorkspaceNavigation
       .flatMap((group) => group.items)
       .find((item) => item.href === pathname && item.href !== "/submissions");
     if (workspacePage) {
       return { scope: "workspace" as const, title: workspacePage.label, activeId: workspacePage.id };
     }
     if (pathname === "/references") {
       return { scope: "workspace" as const, title: "Reference Source Versions", activeId: "references" };
     }
     if (pathname.startsWith("/submissions/")) {
       return { scope: "review" as const, title: "Submission Details & Review", activeId: "review" };
     }
     if (pathname === "/workspaces") {
       return { scope: "global" as const, title: "My Workspaces", activeId: "workspaces" };
     }
     if (pathname === "/submissions") {
       return { scope: "global" as const, title: "My Submissions", activeId: "submissions" };
     }
     return { scope: "global" as const, title: "My Projects", activeId: "projects" };
   }
   ```

---

## TASK 2: Redesign Student Class Workspace & Assignment Experience (`src/features/workspaces/screens.tsx` & `src/features/assignments/screens.tsx`)

### 2.1. Fix `WorkspaceOverview` in `src/features/workspaces/screens.tsx`
Currently in `WorkspaceOverview` (`src/features/workspaces/screens.tsx` lines 38–125):
- The `Class assignments` table shows assignment titles as plain text with no link to `/assignments?workspace=${workspace.id}`.
- The right column always renders `<DetailPanel title="Class settings"><WorkspaceControls ... /></DetailPanel>`, which renders an empty box for Students because `WorkspaceControls` returns `null` when `workspace.myRole !== "LECTURER"`.

**Action in `src/features/workspaces/screens.tsx`**:
1. Determine `const canManage = workspace?.myRole === "LECTURER" || session.data?.user?.role === "admin";` (using `const session = useSession();`).
2. In the top header card of `WorkspaceOverview`, add a primary action button on the right side:
   ```tsx
   <div className="flex flex-wrap items-center gap-2">
     <Button asChild size="sm">
       <Link href={`/assignments?workspace=${encodeURIComponent(workspace.id)}`}>
         {canManage ? "Manage Assignments" : `Open Assignments & Submit (${assignmentList.length})`}
       </Link>
     </Button>
     <Button asChild size="sm" variant="outline">
       <Link href={`/members?workspace=${encodeURIComponent(workspace.id)}`}>
         Members ({members.length})
       </Link>
     </Button>
   </div>
   ```
3. In the `Class assignments` `DataTable` (lines 98–116):
   - Render the `Assignment` title column as a clickable `<Link className="font-semibold text-primary hover:underline" href={`/assignments?workspace=${encodeURIComponent(workspace.id)}#assignment-${a.id}`}>{a.title}</Link>`.
   - Add an `Action` column at the end of the table with a button:
     ```tsx
     {
       key: "action",
       label: "Action",
       render: (a) => (
         <Button asChild size="sm" variant="outline">
           <Link href={`/assignments?workspace=${encodeURIComponent(workspace.id)}#assignment-${a.id}`}>
             {canManage ? "Review" : "Open & Submit →"}
           </Link>
         </Button>
       ),
     }
     ```
4. For the second column (`lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]`):
   - If `canManage` is true, render `<DetailPanel title="Class settings"><WorkspaceControls key={workspace.id} workspace={workspace} mode="overview" /></DetailPanel>` as before.
   - If `!canManage` (Student view), instead of an empty `"Class settings"` panel, render a clear **`<DetailPanel title="How to complete & submit coursework">`** card with a 4-step student checklist:
     1. **Step 1 — Open Assignment**: Click **Open & Submit →** on an assignment to read instructions, required diagram types, and any attached reference source.
     2. **Step 2 — Create & Analyze Coursework Project**: Create a project for the assignment, import your GitHub repository or ZIP (or clone the Lecturer's reference source), and run static analysis.
     3. **Step 3 — Review Architecture & Save Diagrams**: Inspect the Architecture Graph, C4/UML Diagrams, 3E Inspector, and Change Impact. Save your required diagram views.
     4. **Step 4 — Freeze & Submit**: Return to the assignment, select your Model Version and diagrams, and submit before the deadline.

### 2.2. Enhance `Assignments` in `src/features/assignments/screens.tsx`
In `src/features/assignments/screens.tsx`:
- Add `id={`assignment-${assignment.id}`}` and `className="scroll-mt-20"` to each assignment wrapper or `<DetailPanel>` so links with `#assignment-${assignment.id}` scroll smoothly to the exact assignment.
- Display clear requirement badges at the top of each assignment card:
  - Deadline badge (`Due ${assignment.dueAt}`, highlighted in amber/red if overdue).
  - Required Diagrams badge list (`assignment.requiredDiagramTypes?.map(diagramTypeLabel)`).
  - Runtime Trace badge (`Runtime Trace Required` vs `Runtime Trace Optional`).

---

## TASK 3: Streamline Student Coursework Submission & Auto-Select Artifacts (`src/features/submissions/composer.tsx`, `src/features/submissions/artifact-selector.tsx`, & `src/lib/api/java-operations.ts`)

### 3.1. Support `referenceSnapshotId` in `java-operations.ts` (`case "createProject"`)
In `src/lib/api/java-operations.ts` (around line 1182):
```ts
    case "createProject": {
      const workspaceId = input["workspaceId"] ? id(input, "workspaceId") : undefined;
      const assignmentId = input["assignmentId"] ? id(input, "assignmentId") : undefined;
      const referenceSnapshotId = input["referenceSnapshotId"]
        ? id(input, "referenceSnapshotId")
        : undefined;
      if (assignmentId) {
        const current = assignment(await get(`assignments/${assignmentId}`));
        if (current.workspaceId !== workspaceId) throw new ApiError("not-found", 404);
      }
      return projectView(
        await post("projects", {
          name: input["name"],
          repositoryUrl: input["repositoryUrl"],
          defaultBranch: input["defaultBranch"],
          projectType: workspaceId ? "STUDENT_WORKING" : "PERSONAL",
          workspaceId,
          assignmentId,
          ...(referenceSnapshotId ? { referenceSnapshotId } : {}),
        }),
      );
    }
```
Also ensure `Request<"createProject">` in `src/lib/api/contracts.ts` allows optional `referenceSnapshotId?: string | undefined;`.

### 3.2. Upgrade `ArtifactSelector` (`src/features/submissions/artifact-selector.tsx`) so Students Are Never Blocked by Hidden `<details>`
Currently in `src/features/submissions/artifact-selector.tsx`:
- Initial state is `{ documents: [], diagramVersionIds: [] }` (nothing checked!).
- `Generated model projections` is hidden inside a closed `<details>` tag, so if a student hasn't manually edited and saved a Draw.io XML document, they see `"No saved diagram documents for this model yet."` and the `"Review submission"` button remains disabled!

**Action in `src/features/submissions/artifact-selector.tsx`**:
1. Add a `useRef` to track whether default auto-selection has been initialized for the current `modelId`.
2. When `documents.data` and `generated.data` finish loading, if the user has not manually changed selection yet and both arrays in `selected` are empty:
   - Automatically select the latest revision (`versions[0]!.revision`) of each saved document in `documents.data`, AND
   - Automatically select all coursework-compatible generated diagrams in `generated.data`, calling `onChange(autoSelected)`!
3. Change `<details>` to `<details open={views.length === 0}>` (so whenever there are no manually saved Draw.io documents, the `"Generated model projections"` section is **expanded by default**!).
4. Add a quick **"Select all available diagrams"** / **"Clear selection"** toggle button in the header of `ArtifactSelector`.

### 3.3. Upgrade `SubmissionComposer` (`src/features/submissions/composer.tsx`) into a Clear Step-by-Step Guided Panel
In `src/features/submissions/composer.tsx`:
1. Import `useSelection` from `@/hooks/use-api`.
2. **Auto-select newly created coursework project**:
   When `create.mutate` succeeds:
   ```ts
   create.mutate(
     {
       name: projectName.trim(),
       workspaceId,
       assignmentId,
       ...(useReferenceSnapshot && requirements?.referenceSource?.snapshotId
         ? { referenceSnapshotId: requirements.referenceSource.snapshotId }
         : {}),
     },
     {
       onSuccess: (createdProject) => {
         setProjectName("");
         selection.setProjectId(createdProject.id);
       },
     },
   );
   ```
   - If `requirements?.referenceSource?.snapshotId` is present, show a checkbox (checked by default):
     `"Initialize project with Lecturer's assigned reference source (${requirements.referenceSource.projectName})"`
   - When `create.data` is shown, if the project was initialized with the reference snapshot, show a direct button to **Analyze Snapshot (`/snapshots?project=${create.data.id}`)** in addition to the `"Import source and run analysis"` link!
3. **Explain why personal projects aren't in the class project selector**:
   - Compute `const classProjects = (projects.data ?? []).filter((p) => p.workspaceId === workspaceId && (!p.assignmentId || p.assignmentId === assignmentId));`
   - Compute `const personalProjectsCount = (projects.data ?? []).filter((p) => !p.workspaceId).length;`
   - If `classProjects.length === 0`, display a clear callout box telling the student:
     *"You don't have a project in this class workspace yet. Enter a name above and click **Create coursework project** to start (Note: {personalProjectsCount} personal project(s) created outside this class cannot be submitted to class assignments)."*
4. **When a class project is selected (`state.projectId && compatibleProject`), handle the 0-models state clearly**:
   - Currently, `<RequestState query={state.query} empty={!state.models.length}>` just shows `"Nothing to display yet."` when the newly created coursework project has no analyzed model yet!
   - Pass a clear `emptyMessage` and action button when `!state.models.length`:
     Provide a prominent card with buttons:
     - **Import Source & Analyze (`/snapshots?project=${state.projectId}&import=1`)**
     - **Go to Source Snapshots (`/snapshots?project=${state.projectId}`)**
5. **Inline Architecture Rule Evaluation (`evaluateModel`) & Auto-Selection**:
   - Add `const runEvaluation = useApiMutation("evaluateModel");`.
   - When `evaluations.data` loads and `evaluationId === ""` (not yet chosen), automatically select `evaluations.data[0].id` so the student's compliance score is included by default!
   - Next to the `"Evaluation run to submit"` select field, add a button:
     ```tsx
     <Button
       type="button"
       size="sm"
       variant="outline"
       disabled={runEvaluation.isPending || !state.model?.id}
       onClick={() => {
         if (!state.model?.id) return;
         runEvaluation.mutate(
           { modelId: state.model.id },
           { onSuccess: (res) => setEvaluationId(res.id) },
         );
       }}
     >
       {runEvaluation.isPending
         ? "Evaluating 5 Architecture Rules…"
         : evaluations.data?.length
           ? "Re-run Rule Evaluation"
           : "Run Architecture Rule Evaluation (5 Rules)"}
     </Button>
     ```
6. **Actionable Readiness Checklist above the `"Review submission"` button**:
   - Instead of leaving the student guessing why `"Review submission"` is disabled, display a compact **Submission Readiness Checklist** showing green `✓` or amber `!` for each requirement:
     - `[✓ / !]` **Class Project & Analyzed Model Version**: Selected `Revision X` (or link to `/snapshots?project=${state.projectId}`).
     - `[✓ / !]` **Required Diagrams (`requirements?.requiredDiagramTypes`)**: All selected, or list missing diagram types with a direct link to `/diagrams?project=${state.projectId}&model=${state.model.id}`.
     - `[✓ / !]` **Runtime Trace Evidence**: If `requirements?.requireRuntimeTrace` is true, show whether a completed runtime session on this snapshot is selected, with a direct link to `/sessions?project=${state.projectId}` if missing!

---

## TASK 4: Add Guided Student Journey Banner & Quick Mode Switcher on Project Screens (`src/routes/index.tsx`, `src/features/projects/screens.tsx`, `src/routes/architecture.tsx`, `src/features/architecture/architecture-presentation.tsx`)

### 4.1. Student Quick-Start Guide on Home Page (`src/routes/index.tsx`)
In `src/routes/index.tsx` (`Projects` component):
- Add a clean, scannable **Student Workflow Banner** below the 4 `SummaryCard`s showing the two main paths in MAVIS:
  1. **Personal Architecture Exploration**: Click **Import project source** (top right) -> Enter GitHub URL or upload ZIP -> Explore Architecture Graph, C4/UML Diagrams, 3E Inspector & Change Impact.
  2. **Class Coursework & Assignments**: Open **My Workspaces** in the left sidebar -> Select your class -> Open **Assignments & Submit** -> Create a coursework project and submit your analyzed model.
- In the `Recent projects` table (`routes/index.tsx` line 108):
  - If a project belongs to a class/assignment (`p.workspaceName` or `p.assignmentTitle` or `p.workspaceId`), render a small badge next to the project name (e.g. `<Badge variant="secondary">Coursework</Badge>`) so students can immediately distinguish their **Class Coursework Projects** from **Personal Projects**!

### 4.2. Coursework Context Banner & 5-Step Journey Stepper in `ProjectOverview` (`src/features/projects/screens.tsx`)
In `src/features/projects/screens.tsx` (`ProjectOverview` component):
1. If `query.data.workspaceId` is present on the project, display a prominent **Coursework Assignment Banner** at the very top of `ProjectOverview`:
   - Shows the class name (`query.data.workspaceName || "Class Workspace"`) and assignment title (`query.data.assignmentTitle || "Coursework Assignment"`).
   - Provides a primary button: **`Return to Assignment & Submit Work →`** linking to `/assignments?workspace=${encodeURIComponent(query.data.workspaceId)}${query.data.assignmentId ? `#assignment-${query.data.assignmentId}` : ""}`!
2. Add a **5-Step Architecture Workflow Bar** inside `ProjectOverview` with clickable cards so students always know what to do next:
   - **1. Source Snapshots** (`${snapshotList.length} imported`) -> `/snapshots?project=${projectId}`
   - **2. Static Analysis** (`${models.length} revision(s)`) -> `/snapshots?project=${projectId}`
   - **3. Graph & 3E Inspector** -> `/architecture?project=${projectId}${model ? `&model=${model.id}` : ""}`
   - **4. C4 & UML Diagrams** -> `/diagrams?project=${projectId}${model ? `&model=${model.id}` : ""}`
   - **5. Impact & Runtime** -> `/impact?project=${projectId}${model ? `&model=${model.id}` : ""}`

### 4.3. Quick Mode Switcher Toolbar & Onboarding Hint in `ArchitectureWorkspace` (`src/routes/architecture.tsx` & `src/features/architecture/architecture-presentation.tsx`)
1. In `src/routes/architecture.tsx` (`ArchitectureWorkspace`):
   - Inside the top bar (lines 42–57, right next to `ProjectSelector` and `ModelVersionSelector`), add a right-aligned group of quick-switch navigation buttons whenever `state.projectId && state.model` is present:
     - **Graph Explorer** (`/architecture?project=${state.projectId}&model=${state.model.id}`, active when `resolvedMode === "graph"`)
     - **C4 & UML Diagrams** (`/diagrams?project=${state.projectId}&model=${state.model.id}`, active when `resolvedMode === "diagram"`)
     - **Change Impact** (`/impact?project=${state.projectId}&model=${state.model.id}`)
     - **Model Editor** (`/model?project=${state.projectId}&model=${state.model.id}`)
     - **Runtime** (`/sessions?project=${state.projectId}`)
     - And if `project.data?.workspaceId` is present, a highlighted button: **Submit to Assignment →** (`/assignments?workspace=${encodeURIComponent(project.data.workspaceId)}${project.data.assignmentId ? `#assignment-${project.data.assignmentId}` : ""}`)!
2. In `src/features/architecture/architecture-presentation.tsx`:
   - When `mode === "graph"` and `!selectedId && !connection`, display a compact, non-intrusive helper strip above the graph:
     *"💡 Interactive Guide: Click any **Service node** on the graph to open the **3E Inspector (Explain · Explore · Evaluate)** and **Connection Evidence Tree (A ↔ B)**. Click any **connection line** to inspect directional relationships."*

---

## TASK 5: Fix Swallowed Backend Error Messages in `src/lib/errors/api-error.ts`

In `src/lib/errors/api-error.ts`:
Currently, `backendErrorCode(path, status, message)` only maps 4 submission errors, causing 7 other specific errors from `SubmissionServiceImpl.java` to fall back to a generic `"The request is invalid. Review your selections and try again."`.

**Action in `src/lib/errors/api-error.ts`**:
1. Keep all existing keys in `publicErrors` 100% unchanged!
2. Add the following new keys to `publicErrors`:
   ```ts
   SUBMISSION_MODEL_MISMATCH: "The selected model version does not belong to this project.",
   SUBMISSION_SNAPSHOT_MISSING: "The selected model version is missing an immutable source snapshot.",
   SUBMISSION_DIAGRAM_MISMATCH: "The selected diagram bundle does not belong to this model version.",
   SUBMISSION_REQUIRED_DIAGRAM: "One or more required diagram types are missing from your selection. Save or select the required diagrams first.",
   SUBMISSION_EVALUATION_MISMATCH: "The selected evaluation run does not belong to this model version.",
   SUBMISSION_RUNTIME_MISMATCH: "The selected runtime session does not match this project and source snapshot.",
   SUBMISSION_RUNTIME_REQUIRED: "This assignment requires a completed (PASSED) Runtime Trace session on the same source snapshot.",
   ```
3. In `backendErrorCode(path, status, message)` under `if (path === "submissions")`:
   ```ts
   if (path === "submissions") {
     if (status === 400 && message === "Đã quá hạn nộp bài cho đề bài này")
       return "SUBMISSION_DEADLINE";
     if (status === 400 && message === "Dự án không thuộc về không gian làm việc của đề bài")
       return "SUBMISSION_SCOPE";
     if (status === 403 && message === "Chỉ chủ sở hữu của dự án mới có quyền nộp bài")
       return "SUBMISSION_OWNER";
     if (
       status === 400 &&
       message ===
         "Không thể nộp phiên bản mô hình chưa hoàn thiện (PARTIAL) trừ khi đã được xác nhận"
     )
       return "SUBMISSION_PARTIAL";
     if (status === 400 && message === "Phiên bản mô hình không thuộc về dự án đã chọn")
       return "SUBMISSION_MODEL_MISMATCH";
     if (status === 400 && message === "ModelVersion không gắn với SourceSnapshot bất biến hợp lệ")
       return "SUBMISSION_SNAPSHOT_MISSING";
     if (status === 400 && message === "Bản vẽ sơ đồ không thuộc về phiên bản mô hình đã chọn")
       return "SUBMISSION_DIAGRAM_MISMATCH";
     if (status === 400 && message.startsWith("Missing required diagram type:"))
       return "SUBMISSION_REQUIRED_DIAGRAM";
     if (
       status === 400 &&
       message === "Kết quả chấm quy tắc kiến trúc không thuộc về phiên bản mô hình đã chọn"
     )
       return "SUBMISSION_EVALUATION_MISMATCH";
     if (
       status === 400 &&
       (message === "Phiên thực nghiệm không thuộc về dự án đã chọn" ||
         message === "Phiên thực nghiệm không chạy trên cùng SourceSnapshot với ModelVersion" ||
         message === "Phiên thực nghiệm không khớp với phiên thực nghiệm gắn trên ModelVersion")
     )
       return "SUBMISSION_RUNTIME_MISMATCH";
     if (
       status === 400 &&
       (message === "Đề bài này bắt buộc đính kèm phiên chạy thực nghiệm Runtime Trace" ||
         message ===
           "Đề bài yêu cầu Runtime Trace hợp lệ đã hoàn tất (PASSED) trên đúng SourceSnapshot của mô hình")
     )
       return "SUBMISSION_RUNTIME_REQUIRED";
   }
   ```

---

## TASK 6: Harden Java Backend Student Logic & Global Exception Handling (`MAVIS-Platform`)

### 6.1. `GlobalExceptionHandler.java` (`MAVIS-Platform/mavis-be/mavis-common/src/main/java/com/mavis/common/exception/GlobalExceptionHandler.java`)
Add explicit exception handlers so database constraint conflicts and optimistic locking failures return **HTTP 409 Conflict** and invalid arguments return **HTTP 400 Bad Request** instead of falling through to HTTP 500:
```java
    @ExceptionHandler({
            org.springframework.dao.DataIntegrityViolationException.class,
            org.springframework.dao.OptimisticLockingFailureException.class,
            jakarta.persistence.OptimisticLockException.class
    })
    @ResponseStatus(HttpStatus.CONFLICT)
    public ApiResponse<Void> handleDataConflictException(Exception ex) {
        log.warn("Data Conflict / Optimistic Lock Exception: {}", ex.getMessage());
        return ApiResponse.error(ErrorCode.CONFLICT, "Dữ liệu đang được cập nhật hoặc có ràng buộc liên quan. Vui lòng tải lại và thử lại.");
    }

    @ExceptionHandler({
            IllegalArgumentException.class,
            jakarta.validation.ConstraintViolationException.class
    })
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleBadArgumentException(Exception ex) {
        log.warn("Bad Argument / Constraint Violation: {}", ex.getMessage());
        return ApiResponse.error(ErrorCode.BAD_REQUEST, ex.getMessage());
    }
```

### 6.2. `ProjectServiceImpl.java` (`MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/project/service/impl/ProjectServiceImpl.java`)
In `createProject(ProjectCreateRequest request)` (lines 54–112):
1. When `assignment != null`:
   - If `workspace == null && assignment.getWorkspace() != null`, automatically set `workspace = assignment.getWorkspace();` and verify `accessPolicyService.requireWorkspaceMember(workspace.getId());`.
   - If `workspace != null && assignment.getWorkspace() != null && !workspace.getId().equals(assignment.getWorkspace().getId())`, throw `new BusinessException(ErrorCode.BAD_REQUEST, "Đề bài tập không thuộc về lớp học (Workspace) đã chọn");`.
2. When `refSnapshot != null`:
   - If `(request.getRepositoryUrl() == null || request.getRepositoryUrl().isBlank()) && refSnapshot.getProject() != null && refSnapshot.getProject().getRepositoryUrl() != null`, inherit `refSnapshot.getProject().getRepositoryUrl()` as the normalized repository URL on the student's `Project` so the student's project card displays the repository metadata cleanly.

### 6.3. `SubmissionServiceImpl.java` (`MAVIS-Platform/mavis-be/mavis-platform/src/main/java/com/mavis/platform/submission/service/impl/SubmissionServiceImpl.java`)
In `submitAssignment(SubmissionCreateRequest request)` (lines 117–126):
- Currently, if `request.getEvaluationRunId() == null`, `evaluationRun` remains `null`.
- Update step 7 so that if `request.getEvaluationRunId() == null`, we check if an `EvaluationRun` already exists for `modelVersion.getId()`:
  ```java
  EvaluationRun evaluationRun = null;
  if (request.getEvaluationRunId() != null) {
      evaluationRun = evaluationRunRepository.findById(request.getEvaluationRunId())
              .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "Không tìm thấy kết quả đánh giá quy tắc với ID: " + request.getEvaluationRunId()));
      if (!evaluationRun.getModelVersion().getId().equals(modelVersion.getId())) {
          throw new BusinessException(ErrorCode.BAD_REQUEST, "Kết quả chấm quy tắc kiến trúc không thuộc về phiên bản mô hình đã chọn");
      }
  } else {
      List<EvaluationRun> existingRuns = evaluationRunRepository.findByModelVersionIdOrderByCreatedAtDesc(modelVersion.getId());
      if (existingRuns != null && !existingRuns.isEmpty()) {
          evaluationRun = existingRuns.get(0);
      }
  }
  ```
  (Verify the exact repository method name in `EvaluationRunRepository.java` — e.g. `findByModelVersionIdOrderByCreatedAtDesc` — before calling it so it compiles cleanly and all existing tests pass.)

---

## TASK 7: Verification & Regression Testing Checklist
1. Run `npm run typecheck` and `npm test` in `MAVIS-Frontend` to confirm zero TypeScript or contract test regressions.
2. Run `mvn test` in `MAVIS-Platform/mavis-be` (verifying `ProjectServiceImplTest`, `ProjectResourceDeletionServiceTest`, `SubmissionServiceImplTest`, `ArchitectureEvaluationServiceImplTest`, and controller tests all pass 100%).
3. Manually trace the complete Student flow:
   - Log in as Student -> Click **My Workspaces** -> Click a joined class -> Verify left sidebar shows **Class Overview**, **Assignments & Submit**, **Class Members**, **My Submissions**, and the assignment table has **Open & Submit →** buttons (no empty "Class settings" box!).
   - Click **Open & Submit →** -> Create a coursework project (with 1-click Reference Source clone if attached) -> Verify the new project is auto-selected -> Analyze source -> Verify the **Coursework Banner** and **Quick Mode Switcher** allow 1-click navigation between **Graph Explorer**, **C4 & UML Diagrams**, **Change Impact**, **Runtime**, and **Return to Assignment & Submit Work →**.
   - Return to the Assignment -> Verify `ArtifactSelector` auto-selects available diagrams, `evaluateModel` can be run inline with 1 click, and the **Submission Readiness Checklist** guides the student clearly to a successful submission.
```
