# BẢN ĐẶC TẢ KỸ THUẬT & PROMPT DÀNH CHO ANTIGRAVITY (GEMINI FLASH)
## RÀ SOÁT TOÀN DIỆN 3 LUỒNG NGƯỜI DÙNG (STUDENT, LECTURER, ADMIN) & CHUẨN HÓA ĐỒNG BỘ TIẾNG VIỆT TOÀN HỆ THỐNG MAVIS

> **HƯỚNG DẪN BẮT BUỘC DÀNH CHO AI CODING AGENT (ANTIGRAVITY - GEMINI FLASH):**
> 1. **Nguyên tắc an toàn mã nguồn:** Hệ thống MAVIS hiện đã hoạt động ổn định ở các tính năng cốt lõi (Sơ đồ tuần tự Runtime trực quan `RuntimeSequenceDiagramCanvas`, Đồ thị kiến trúc 3E `Cytoscape`, Cây bằng chứng kết nối `ConnectionDetailsPanel`, Trình vẽ `Draw.io`, `ModelEditor`, `ContextReviewService`, và `RuntimeRunnerDispatcher`). **TUYỆT ĐỐI KHÔNG** xóa hoặc viết lại các hàm xử lý cốt lõi đang chạy tốt. Chỉ sửa đúng các vị trí và các file được chỉ định trong từng Task dưới đây.
> 2. **Thực hiện tuần tự từng Task:** Đọc kỹ đường dẫn file, tìm đúng đoạn code `TRƯỚC KHI SỬA` và thay thế chính xác bằng đoạn code `SAU KHI SỬA`.
> 3. **Quy chuẩn Tiếng Việt nhất quán:**
>    - **Không dùng kiểu dịch kèm tiếng Anh trong ngoặc đơn** (ví dụ: bỏ ngay kiểu viết `"Phụ thuộc vòng (Cyclic dependencies) giữa các Service"`, chỉ viết gọn và chuẩn xác là `"Phụ thuộc vòng giữa các Service"`).
>    - **Giữ nguyên các thuật ngữ chuyên ngành CNTT quốc tế** (`Service`, `Container`, `Component`, `Class`, `Interface`, `Enum`, `Package`, `Endpoint`, `API`, `HTTP`, `REST`, `gRPC`, `Feign`, `Docker Compose`, `Database`, `Message Broker`, `Queue`, `Runtime`, `Trace`, `Span`, `Sandbox`, `Commit`, `SHA`, `GitHub`, `ZIP`, `C4`, `UML`, `Draw.io`, `3E`, `AST`, `CFG`, `Token`, `JVM`).
>    - **Thống nhất 1-1 các thuật ngữ nghiệp vụ tiếng Việt** trên toàn bộ giao diện (chi tiết tại Bảng Chuẩn Hóa Dịch Thuật ở Phần 2).

---

## PHẦN 1: BÁO CÁO RÀ SOÁT & SỬA LỖI 3 LUỒNG NGƯỜI DÙNG (STUDENT, LECTURER, ADMIN)

### Tổng quan kết quả kiểm tra toàn bộ Codebase (Frontend & Backend)

| Phân luồng | Các chức năng đã hoạt động tốt (Cần giữ nguyên) | Các điểm lỗi cần khắc phục ngay (Chi tiết tại Task 1.1 → 1.3) |
| :--- | :--- | :--- |
| **1. Luồng Sinh viên (`student`)** | • Nhập mã nguồn qua GitHub / ZIP (`ImportFlow`, `ProjectController`).<br>• Phân tích tĩnh, tạo Snapshot & Phiên bản mô hình (`ArchitectureRevision`).<br>• Đồ thị 3E (`Cytoscape`), Cây bằng chứng `A ↔ B` (`ConnectionDetailsPanel`).<br>• Sơ đồ C4, UML Class/Component/Sequence & Trình chỉnh sửa Draw.io.<br>• Rà soát ngữ cảnh (`ContextReview` + `ContextReviewService.java`).<br>• Chỉnh sửa mô hình (`ModelEditor`), So sánh phiên bản (`CompareModels`), Phân tích tác động (`ImpactWorkspace`).<br>• Chạy Runtime 3 bước (`RuntimeConfiguration` → `RuntimeScenarios` → `BackendRuntime` kèm Sơ đồ tuần tự SVG & cạnh xanh ngọc `RUNTIME_ENRICHED`). | • **Lỗi S1 (`src/features/submissions/composer.tsx`):** Bộ lọc đính kèm phiên chạy Runtime vào bài nộp (`SubmissionComposer`) đang so khớp cứng `s.status === "completed"` (chữ thường) và `s.snapshotId === state.model?.snapshotId`. Khi phiên chạy hoàn tất tạo ra phiên bản mô hình `RUNTIME_ENRICHED` mới hoặc trả về `executionStatus === "COMPLETED"`, danh sách phiên chạy bị rỗng hoặc chỉ hiện UUID thô.<br>• **Lỗi S2 (`src/features/runtime/backend.tsx`):** Bảng chi tiết phiên chạy ở Bước 3 hiển thị trực tiếp tên biến camelCase thô (`executionStatus`, `scenarioStatus`, `evidenceStatus`, `cleanupStatus`, `traceQuality`, `mappingStatus`) khiến giao diện thiếu tự nhiên và bộ dịch tiếng Việt không dịch được.<br>• **Lỗi S3 (`src/features/architecture/architecture-presentation.tsx` & `dependency-network.tsx`):** Các câu hướng dẫn có thẻ `<strong>` lồng giữa câu tiếng Anh làm bộ dịch DOM không nhận diện được cả câu, dẫn đến câu nửa Anh nửa Việt. |
| **2. Luồng Giảng viên (`lecturer`)** | • Quản lý Lớp học (`Workspaces`, `CreateWorkspace`).<br>• Thêm sinh viên đơn lẻ & hàng loạt (`WorkspaceMembers`).<br>• Quản lý Kho mã nguồn mẫu (`ReferenceVersions`, `AssignmentSourcePicker`).<br>• Tạo và giao Bài tập (`Assignments`, `CreateAssignment`).<br>• Chấm điểm, đóng băng hồ sơ bài nộp & xuất file JSON (`SubmissionReview`, `GradingPanel`, `FrozenArtifacts`, `SubmissionExport`). | • **Lỗi L1 (`src/features/workspaces/manage.tsx`):** Trong `WorkspaceControls`, ô nhập `"Class description"` (`Textarea`) bị đặt nằm **ngoài** thẻ `<form>`, còn nút bấm chỉ ghi `"Rename"` cạnh ô tên lớp. Giảng viên sửa mô tả lớp không thấy nút lưu rõ ràng.<br>• **Lỗi L2 (`src/features/submissions/screens.tsx`):** Bảng danh sách bài nộp (`SubmissionList`) hiển thị nguyên chuỗi UUID 36 ký tự ở cột đầu tiên và chuỗi thời gian ISO thô chưa định dạng.<br>• **Lỗi L3 (`src/features/submissions/components.tsx`):** Trong `FeedbackPanel` (khung nhận xét của giảng viên), danh sách chọn Mối quan hệ hiển thị `Relationship · HTTP · <UUID>` thay vì tên 2 Service kết nối (`api-gateway → order-service`), khiến giảng viên không biết đang nhận xét kết nối nào. |
| **3. Luồng Quản trị viên (`admin`)** | • Giám sát sức khỏe hệ thống & Hàng đợi (`SystemHealth`).<br>• Quản lý Tiến trình phân tích (`AdminAnalysisJobs`).<br>• Thống kê lưu lượng & AI Token (`PlatformUsage`).<br>• Quản lý Tài khoản & Phân quyền (`Accounts`).<br>• Quản lý Tích hợp (`Integrations`), Nhật ký kiểm toán (`AuditRecords`), và Giám sát Runtime (`AdminRuntimeSummary`, `RuntimeProfiles`). | • **Lỗi A1 (`src/lib/api/java-operations.ts`):** Dữ liệu dự phòng (`fallback`) của `profiles` và `configureProfile` thiếu 2 trường bắt buộc `revision: 1` và `enabled: true` theo schema `contracts.ts`, gây lỗi hiển thị tại trang `/admin/profiles` khi dùng dữ liệu mặc định.<br>• **Lỗi A2 (`src/features/administration/screens.tsx`):** Các bộ lọc `<Select>` ở trang Quản lý Tài khoản (`Accounts`) và Tiến trình (`AdminAnalysisJobs`) hiển thị nhãn chữ thường thô (`"admin"`, `"lecturer"`, `"student"`, `"active"`, `"queued"`, `"processing"`) thay vì nhãn chuẩn hóa. |

---

### TASK 1.1: Sửa các lỗi Luồng Sinh viên (`composer.tsx`, `backend.tsx`, `architecture-presentation.tsx`, `dependency-network.tsx`)

#### Bước 1.1.1: Sửa bộ lọc và nhãn hiển thị Phiên chạy Runtime khi Nộp bài tập
- **File cần sửa:** `src/features/submissions/composer.tsx`
- **Tìm đoạn code (khoảng dòng 95–108):**
```tsx
  const compatible = useMemo(
    () =>
      (sessions.data ?? []).filter(
        (s) => s.status === "completed" && s.snapshotId === state.model?.snapshotId,
      ),
    [sessions.data, state.model?.snapshotId],
  );
```
- **Thay thế bằng:**
```tsx
  const compatible = useMemo(() => {
    const allCompleted = (sessions.data ?? []).filter(
      (s) =>
        s.status === "completed" ||
        String(s.status).toUpperCase() === "COMPLETED" ||
        String(s.executionStatus).toUpperCase() === "COMPLETED",
    );
    if (!state.model) return allCompleted;
    const exactMatch = allCompleted.filter(
      (s) =>
        s.snapshotId === state.model?.snapshotId ||
        s.modelId === state.model?.id ||
        s.enrichedModelId === state.model?.id,
    );
    return exactMatch.length > 0 ? exactMatch : allCompleted;
  }, [sessions.data, state.model]);
```

- **Tiếp tục trong file `src/features/submissions/composer.tsx`, tìm đoạn code (khoảng dòng 310–325):**
```tsx
              options={[
                { value: "", label: "No runtime trace attached" },
                ...compatible.map((s) => ({
                  value: s.id,
                  label: s.id,
                })),
              ]}
```
- **Thay thế bằng:**
```tsx
              options={[
                { value: "", label: "No runtime trace attached" },
                ...compatible.map((s) => ({
                  value: s.id,
                  label: `${s.scenarioName || "Runtime Session"} · #${s.id.slice(0, 8)} (${s.traceCount ?? 0} spans)`,
                })),
              ]}
```

#### Bước 1.1.2: Chuẩn hóa nhãn thuộc tính trạng thái Phiên chạy trong Bước 3 Runtime
- **File cần sửa:** `src/features/runtime/backend.tsx`
- **Tìm đoạn code (khoảng dòng 623–638):**
```tsx
                {(
                  [
                    "executionStatus",
                    "scenarioStatus",
                    "evidenceStatus",
                    "cleanupStatus",
                    "traceQuality",
                    "mappingStatus",
                  ] as const
                ).map((k) => (
                  <div key={k} className="rounded-xl border border-line bg-surface-muted/35 p-3">
                    <p className="text-xs text-muted">{k}</p>
                    <p className="mt-1 font-medium text-foreground">{session.data?.[k] ?? "n/a"}</p>
                  </div>
                ))}
```
- **Thay thế bằng:**
```tsx
                {(
                  [
                    { key: "executionStatus", label: "Execution status" },
                    { key: "scenarioStatus", label: "Scenario status" },
                    { key: "evidenceStatus", label: "Evidence status" },
                    { key: "cleanupStatus", label: "Cleanup status" },
                    { key: "traceQuality", label: "Trace quality" },
                    { key: "mappingStatus", label: "Mapping status" },
                  ] as const
                ).map(({ key, label }) => (
                  <div key={key} className="rounded-xl border border-line bg-surface-muted/35 p-3">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 font-medium text-foreground">{session.data?.[key] ?? "n/a"}</p>
                  </div>
                ))}
```

#### Bước 1.1.3: Làm sạch câu hướng dẫn đa thẻ HTML trên trang Đồ thị Kiến trúc để chuyển ngữ hoàn chỉnh
- **File cần sửa:** `src/features/architecture/architecture-presentation.tsx`
- **Tìm đoạn code (khoảng dòng 198–208):**
```tsx
          <p className="text-xs text-foreground">
            Click any <strong>Service node</strong> on the graph to open the{" "}
            <strong>Component Inspection Drawer</strong> (source files, dependencies, evaluation warnings), or click any{" "}
            <strong>Edge arrow (A ↔ B)</strong> to inspect exact code &amp; config connection evidence.
          </p>
```
- **Thay thế bằng:**
```tsx
          <p className="text-xs text-foreground">
            Click any Service node on the graph to open the Component Inspection Drawer (source files, dependencies, evaluation warnings), or click any Edge arrow (A ↔ B) to inspect exact code and config connection evidence.
          </p>
```

- **File cần sửa:** `src/features/architecture/dependency-network.tsx`
- **Tìm đoạn code (khoảng dòng 770–784):**
```tsx
          <div className="flex items-center gap-2 text-xs text-emerald-950">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>
              <strong>Runtime-Enriched Model Active:</strong>{" "}
              <strong>{runtimeEdgeCount}</strong> relationship(s) verified via OpenTelemetry traces are highlighted in{" "}
              <strong className="text-emerald-800 underline">solid emerald green</strong> on the graph. Click any green edge to inspect its runtime trace evidence.
            </span>
          </div>
```
- **Thay thế bằng:**
```tsx
          <div className="flex items-center gap-2 text-xs text-emerald-950">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-semibold">Runtime-Enriched Model Active:</span>
            <span className="font-bold">{runtimeEdgeCount}</span>
            <span>
              relationships verified via OpenTelemetry traces are highlighted in solid emerald green on the graph. Click any green edge to inspect its runtime trace evidence.
            </span>
          </div>
```

---

### TASK 1.2: Sửa các lỗi Luồng Giảng viên (`manage.tsx`, `submissions/screens.tsx`, `submissions/components.tsx`)

#### Bước 1.2.1: Gộp ô nhập Mô tả lớp học vào chung Form lưu cài đặt trong `WorkspaceControls`
- **File cần sửa:** `src/features/workspaces/manage.tsx`
- **Tìm đoạn code (khoảng dòng 93–122):**
```tsx
        <FormField label="Workspace name">
          {(props) => (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate({ workspaceId: workspace.id, name, description });
              }}
            >
              <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />
              <Button disabled={update.isPending}>Rename</Button>
            </form>
          )}
        </FormField>
        <FormField label="Class description">
          {(props) => (
            <Textarea
              {...props}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </FormField>
```
- **Thay thế bằng:**
```tsx
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ workspaceId: workspace.id, name, description });
          }}
        >
          <FormField label="Workspace name">
            {(props) => (
              <Input {...props} value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </FormField>
          <FormField label="Class description">
            {(props) => (
              <Textarea
                {...props}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Save class settings"}
            </Button>
          </div>
        </form>
```

#### Bước 1.2.2: Hiển thị Mã bài nộp rút gọn dễ đọc và định dạng ngày giờ trong `SubmissionList`
- **File cần sửa:** `src/features/submissions/screens.tsx`
- **Tìm đoạn code (khoảng dòng 115–134):**
```tsx
        rows={(submissions.data ?? []).map((s) => [
          <Link
            key={s.id}
            href={
              teaching
                ? `/teaching/submissions?submission=${s.id}`
                : `/submissions?submission=${s.id}`
            }
            className="font-semibold text-accent"
          >
            {s.id}
          </Link>,
          s.studentName,
          s.assignmentTitle,
          <StatusPill key={`${s.id}-status`} value={s.status} />,
          s.submittedAt ?? "Not submitted",
          s.score ?? "Pending",
        ])}
```
- **Thay thế bằng:**
```tsx
        rows={(submissions.data ?? []).map((s) => [
          <Link
            key={s.id}
            href={
              teaching
                ? `/teaching/submissions?submission=${s.id}`
                : `/submissions?submission=${s.id}`
            }
            title={s.id}
            className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-accent hover:underline"
          >
            <span>#{s.id.slice(0, 8)}</span>
            <span className="font-sans text-[11px] font-medium">→</span>
          </Link>,
          s.studentName,
          s.assignmentTitle,
          <StatusPill key={`${s.id}-status`} value={s.status} />,
          s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "Not submitted",
          s.score ?? "Pending",
        ])}
```

#### Bước 1.2.3: Hiển thị tên 2 Service kết nối thay vì UUID thô khi Giảng viên chọn Mối quan hệ để nhận xét
- **File cần sửa:** `src/features/submissions/components.tsx`
- **Tìm đoạn code (khoảng dòng 86–98):**
```tsx
  const targetOptions = [
    { value: `submission:${submission.id}`, label: "Whole submission" },
    ...submission.model.elements.map((e) => ({
      value: `element:${e.id}`,
      label: `Element · ${e.name}`,
    })),
    ...submission.model.relationships.map((e) => ({
      value: `relationship:${e.id}`,
      label: `Relationship · ${e.protocol} · ${e.id}`,
    })),
```
- **Thay thế bằng:**
```tsx
  const elementNameById = new Map(
    submission.model.elements.map((e) => [e.id, e.name] as const),
  );
  const targetOptions = [
    { value: `submission:${submission.id}`, label: "Whole submission" },
    ...submission.model.elements.map((e) => ({
      value: `element:${e.id}`,
      label: `Element · ${e.name}`,
    })),
    ...submission.model.relationships.map((e) => {
      const fromName = elementNameById.get(e.from) ?? e.from.slice(0, 8);
      const toName = elementNameById.get(e.to) ?? e.to.slice(0, 8);
      return {
        value: `relationship:${e.id}`,
        label: `Relationship · ${fromName} → ${toName} (${e.protocol})`,
      };
    }),
```

---

### TASK 1.3: Sửa các lỗi Luồng Quản trị viên (`java-operations.ts` & `administration/screens.tsx`)

#### Bước 1.3.1: Bổ sung đầy đủ trường `revision` và `enabled` cho dữ liệu mặc định của `RuntimeProfiles`
- **File cần sửa:** `src/lib/api/java-operations.ts`
- **Tìm đoạn code (khoảng dòng 988–1014):**
```ts
    return fallback([
      {
        id: "default-profile",
        name: "Balanced sandbox",
        cpuLimit: "2 vCPU",
        memoryLimit: "4 GB",
        timeoutSeconds: 180,
        networkPolicy: "isolated-bridge",
        maxConcurrentSessions: 6,
      },
    ]);
  },
  async configureProfile(input: {
    id?: string;
    name: string;
    cpuLimit: string;
    memoryLimit: string;
    timeoutSeconds: number;
    networkPolicy: string;
    maxConcurrentSessions: number;
    revision?: number;
  }) {
    return fallback({
      id: input.id ?? "profile-created",
      ...input,
    });
  },
```
- **Thay thế bằng:**
```ts
    return fallback([
      {
        id: "default-profile",
        name: "Balanced sandbox",
        cpuLimit: "2 vCPU",
        memoryLimit: "4 GB",
        timeoutSeconds: 180,
        networkPolicy: "isolated-bridge",
        maxConcurrentSessions: 6,
        revision: 1,
        enabled: true,
      },
    ]);
  },
  async configureProfile(input: {
    id?: string;
    name: string;
    cpuLimit: string;
    memoryLimit: string;
    timeoutSeconds: number;
    networkPolicy: string;
    maxConcurrentSessions: number;
    revision?: number;
  }) {
    return fallback({
      id: input.id ?? "profile-created",
      revision: input.revision ?? 1,
      enabled: true,
      ...input,
    });
  },
```

#### Bước 1.3.2: Chuẩn hóa nhãn bộ lọc ở trang Quản lý Tài khoản và Quản lý Tiến trình Phân tích
- **File cần sửa:** `src/features/administration/screens.tsx`
- **Tìm đoạn code trong `AdminAnalysisJobs` (khoảng dòng 98–106):**
```tsx
                options={[
                  { value: "all", label: "All statuses" },
                  ...[
                    "queued",
                    "processing",
                    "completed",
                    "failed",
                    "partial",
                    "cancelling",
                    "cancelled",
                    "timed_out",
                  ].map((s) => ({ value: s, label: s.replace("_", " ") })),
                ]}
```
- **Thay thế bằng:**
```tsx
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "queued", label: "Queued" },
                  { value: "processing", label: "Processing" },
                  { value: "completed", label: "Completed" },
                  { value: "failed", label: "Failed" },
                  { value: "partial", label: "Partial" },
                  { value: "cancelling", label: "Cancelling" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "timed_out", label: "Timed out" },
                ]}
```

- **Tiếp tục trong file `src/features/administration/screens.tsx`, tìm đoạn code trong `Accounts` (khoảng dòng 805–821):**
```tsx
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "all", label: "All roles" },
              { value: "admin", label: "admin" },
              { value: "lecturer", label: "lecturer" },
              { value: "student", label: "student" },
            ]}
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "active" },
              { value: "locked", label: "locked" },
              { value: "pending_verification", label: "pending verification" },
            ]}
          />
```
- **Thay thế bằng:**
```tsx
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "all", label: "All roles" },
              { value: "admin", label: "System Administrator" },
              { value: "lecturer", label: "Lecturer" },
              { value: "student", label: "Student" },
            ]}
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "locked", label: "Locked" },
              { value: "pending_verification", label: "Pending verification" },
            ]}
          />
```

---

## PHẦN 2: CHUẨN HÓA ĐỒNG BỘ TIẾNG VIỆT TOÀN HỆ THỐNG & BẢNG DỊCH THUẬT CHUẨN

### 2.1. Quy tắc Chuẩn hóa Dịch thuật Tiếng Việt trên toàn bộ MAVIS

#### Quy tắc 1: Các thuật ngữ chuyên ngành CNTT giữ nguyên tiếng Anh (Tuyệt đối không dịch sang tiếng Việt kỳ cục)
Các từ khóa kỹ thuật sau đây được giữ nguyên viết hoa chuẩn xác trong câu tiếng Việt:
- **Kiến trúc & Mã nguồn:** `Service`, `Microservice`, `Container`, `Component`, `Class`, `Interface`, `Enum`, `Package`, `Module`, `Endpoint`, `Controller`, `Repository`, `Entity`, `Method`, `Field`, `Classifier`, `AST`, `CFG`, `3E`, `C4`, `UML`, `Draw.io`, `PlantUML`, `Mermaid`.
- **Giao thức & Hạ tầng:** `HTTP`, `REST`, `gRPC`, `Feign`, `FeignClient`, `RestTemplate`, `WebClient`, `RabbitMQ`, `Kafka`, `Message Broker`, `Queue`, `Topic`, `Database`, `PostgreSQL`, `MySQL`, `Redis`, `Docker`, `Docker Compose`, `Dockerfile`, `JVM`, `Maven`, `Gradle`.
- **Thực thi & Truy vết:** `Runtime`, `Sandbox`, `Trace`, `Span`, `OpenTelemetry`, `Lifeline`, `Healthcheck`, `Webhook`, `Token`, `GitHub`, `ZIP`, `Commit`, `SHA`, `Branch`, `JSON`, `SVG`, `PNG`, `XML`.

#### Quy tắc 2: Loại bỏ hoàn toàn kiểu viết "Tiếng Việt (English)" rườm rà
Dưới đây là bảng đối chiếu các cụm từ đang bị mở ngoặc tiếng Anh không cần thiết trong code hiện tại và bản chuẩn hóa sạch sẽ:

| Chuỗi hiện tại (Không đồng nhất / Mở ngoặc tiếng Anh thừa) | Chuỗi chuẩn hóa mới (Gọn, tự nhiên, đúng chuẩn CNTT) |
| :--- | :--- |
| `Phụ thuộc vòng (Cyclic dependencies) giữa các Service` | `Phụ thuộc vòng giữa các Service` |
| `Ranh giới quyền sở hữu dữ liệu (Data ownership) giữa các Service` | `Ranh giới quyền sở hữu dữ liệu giữa các Service` |
| `Quan sát lúc chạy (Runtime)` | `Quan sát từ Runtime` |
| `Quan sát thực thi (Runtime Trace)` | `Quan sát thực thi Runtime` |
| `Kho dữ liệu Logic (Logical Datastore)` | `Kho dữ liệu logic` |
| `Kênh thông điệp (Message Channel)` | `Kênh thông điệp` |
| `Hệ thống bên ngoài (External System)` | `Hệ thống bên ngoài` |
| `Lớp / Định danh (Classifier) cần khám phá` | `Classifier cần khám phá` |
| `Phụ thuộc mã nguồn (Code Dependency)` | `Phụ thuộc mã nguồn` |
| `DB / Hàng đợi (Queues)` | `Database / Hàng đợi` |
| `Tầng lưu trữ dữ liệu (Data Persistence)` | `Tầng lưu trữ dữ liệu` |
| `Tầng nghiệp vụ (Domain Service)` | `Tầng nghiệp vụ` |
| `Bản đồ Kiến trúc (Architecture Atlas)` | `Bản đồ Kiến trúc` |
| `Sơ đồ Kiến trúc (C4/UML)` | `Sơ đồ Kiến trúc C4 & UML` |
| `Chi tiết hợp đồng giao tiếp (Feign / HTTP Contract)` | `Chi tiết hợp đồng giao tiếp HTTP / Feign` |
| `Các đường sinh tồn (Lifelines) được bao phủ:` | `Các Lifeline tham gia:` |
| `Phụ thuộc triển khai (Docker Compose)` | `Phụ thuộc triển khai Docker Compose` |
| `Đánh giá (Evaluate)` / `Bằng chứng (Evidence)` / `Giải thích (Explain)` | `Đánh giá` / `Bằng chứng` / `Giải thích` |
| `Mã cấu hình thực thi (Profile ID)` | `Mã hồ sơ thực thi` |
| `Danh sách Phiên chạy (Sessions)` | `Danh sách phiên chạy` |
| `Xuất gói bài nộp đóng băng (Bundle)` | `Xuất gói hồ sơ bài nộp` |
| `Token đầu vào (Prompt)` / `Token đầu ra (Completion)` | `Token đầu vào` / `Token đầu ra` |
| `Tải sơ đồ tuần tự thực tế (Trace)` | `Tải sơ đồ tuần tự Runtime` |
| `Bản đồ Bán kính Ảnh hưởng Khi Sự cố (Outage Blast Radius)` | `Bản đồ bán kính ảnh hưởng sự cố` |
| `Bản chụp (Snapshots)` | `Bản chụp mã nguồn` |
| `Mã nguồn & Cấu hình (Static)` | `Mã nguồn & cấu hình tĩnh` |
| `Bước 3: Chạy & Truy vết (Trace)` | `Bước 3: Chạy & Xem kết quả Trace` |
| `Chỉ các kết nối HTTP đã xác nhận (Strict Worker)` | `Chỉ kết nối HTTP đã xác nhận` |
| `Truy vết tới mã nguồn (Source Evidence)` | `Truy vết về mã nguồn` |

---

### 2.2. Bảng Từ Điển Chuẩn Hóa Toàn Diện (English ↔ Tiếng Việt) Theo Từng Phân Hệ

#### A. Thuật ngữ Cốt lõi Toàn Hệ thống (Core Domain Glossary)
| Tiếng Anh (English) | Tiếng Việt Chuẩn Hóa | Ghi chú áp dụng |
| :--- | :--- | :--- |
| `Project` / `Projects` | `Dự án` / `Danh sách dự án` | Thống nhất dùng `Dự án` ở mọi màn hình |
| `Workspace` / `Teaching Workspace` | `Lớp học` / `Không gian lớp học` | Không dịch cứng là "Không gian làm việc" gây khó hiểu cho sinh viên & giảng viên |
| `Source Snapshot` / `Snapshot` | `Bản chụp mã nguồn` / `Bản chụp` | Chỉ trạng thái mã nguồn tại một thời điểm nhập vào |
| `Model Version` / `Architecture Revision` / `Revision` | `Phiên bản mô hình` / `Phiên bản kiến trúc` / `Phiên bản` | Tuyệt đối không dịch lúc là "Bản sửa đổi", lúc là "Revision" |
| `Element` / `Elements` | `Phần tử` / `Các phần tử` | Đại diện cho các khối trong mô hình kiến trúc |
| `Relationship` / `Relationships` | `Mối quan hệ` / `Các mối quan hệ` | Đại diện cho các cạnh kết nối giữa các phần tử |
| `Connection Evidence` / `Evidence` | `Bằng chứng kết nối` / `Bằng chứng` | Chữ E thứ nhất trong mô hình 3E |
| `Evaluation` / `Architecture Evaluation` | `Đánh giá quy tắc` / `Đánh giá kiến trúc` | Chữ E thứ hai trong mô hình 3E |
| `Explanation` / `AI Explanation` | `Giải thích` / `Giải thích kiến trúc AI` | Chữ E thứ ba trong mô hình 3E |
| `Change Impact Analysis` / `Blast Radius` | `Phân tích tác động thay đổi` / `Bán kính ảnh hưởng` | Dùng thống nhất ở `/impact` và ngăn kéo 3E |
| `Context Review` | `Rà soát ngữ cảnh` | Xác nhận hoặc bỏ qua thành phần mơ hồ |
| `Runtime Sandbox` / `Runtime Verification` | `Môi trường chạy thử Runtime` / `Kiểm chứng Runtime` | Luồng thực thi Docker & thu thập OpenTelemetry Trace |
| `Scenario` / `Runtime Scenario` | `Kịch bản` / `Kịch bản chạy thử` | Các kịch bản gọi request HTTP mẫu |
| `Session` / `Runtime Session` | `Phiên chạy` / `Phiên chạy Runtime` | Một lần khởi chạy các Container và thu thập Trace |
| `Assignment` / `Submission` | `Bài tập` / `Bài nộp` | Luồng học tập & chấm bài |

#### B. Thanh điều hướng, Khung ứng dụng & Xác thực (`navigation.ts`, `app-shell.tsx`, `login/page.tsx`)
| Tiếng Anh (English) | Tiếng Việt Chuẩn Hóa |
| :--- | :--- |
| `Overview` / `Dashboard` | `Tổng quan` / `Bảng điều khiển` |
| `Architecture Views` / `Architecture Graph` | `Góc nhìn Kiến trúc` / `Đồ thị Kiến trúc` |
| `C4 & UML Diagrams` | `Sơ đồ C4 & UML` |
| `Model Governance` / `Context Review` | `Quản trị Mô hình` / `Rà soát ngữ cảnh` |
| `Model Editor` / `Compare Versions` | `Chỉnh sửa mô hình` / `So sánh phiên bản` |
| `Analysis & Runtime` | `Phân tích & Chạy thử Runtime` |
| `Change Impact` / `AI Explanations` | `Phân tích tác động` / `Giải thích AI` |
| `Step 1: Runtime Config` | `Bước 1: Cấu hình Runtime` |
| `Step 2: Scenarios` | `Bước 2: Kịch bản chạy thử` |
| `Step 3: Run & Trace` | `Bước 3: Chạy & Xem kết quả Trace` |
| `Coursework` / `Assignments` / `Submissions` | `Học tập` / `Bài tập` / `Bài nộp` |
| `Teaching` / `Workspaces` / `Reference Sources` | `Giảng dạy` / `Lớp học` / `Mã nguồn mẫu` |
| `Submissions & Grading` | `Bài nộp & Chấm điểm` |
| `Platform Monitoring` / `System Health` | `Giám sát hệ thống` / `Sức khỏe hệ thống` |
| `Analysis Jobs` / `Platform Usage` | `Tiến trình phân tích` / `Mức sử dụng hệ thống` |
| `Governance & Config` / `Accounts & Roles` | `Quản trị & Cấu hình` / `Tài khoản & Phân quyền` |
| `Integrations` / `Runtime Profiles` / `Audit Trail` | `Tích hợp hệ thống` / `Hồ sơ cấu hình Runtime` / `Nhật ký kiểm toán` |
| `Student` / `Lecturer` / `System Administrator` | `Sinh viên` / `Giảng viên` / `Quản trị viên hệ thống` |

#### C. Đồ thị Kiến trúc, Cây Bằng chứng 3E, Sơ đồ C4/UML & Rà soát Ngữ cảnh
| Tiếng Anh (English) | Tiếng Việt Chuẩn Hóa |
| :--- | :--- |
| `Architecture Atlas` | `Bản đồ Kiến trúc` |
| `Service Communication Overview` | `Tổng quan giao tiếp giữa các Service` |
| `Connection Evidence` / `Component Inspection` | `Bằng chứng kết nối` / `Chi tiết thành phần` |
| `Upstream Callers` / `Downstream Targets` | `Các thành phần gọi đến` / `Các thành phần được gọi` |
| `Strict Confirmed HTTP Calls` | `Chỉ kết nối HTTP đã xác nhận` |
| `All Static + Config Edges` | `Tất cả kết nối tĩnh & cấu hình` |
| `Auto-confirm high confidence` | `Tự động xác nhận độ tin cậy cao` |
| `Accept into model` / `Ignore as noise` | `Chấp nhận vào mô hình` / `Bỏ qua thành phần nhiễu` |
| `C4 System Context` / `C4 Container View` / `C4 Component View` | `Sơ đồ Ngữ cảnh Hệ thống C4` / `Sơ đồ Container C4` / `Sơ đồ Component C4` |
| `UML Class Diagram` / `UML Component Diagram` / `UML Sequence Diagram` | `Sơ đồ Lớp UML` / `Sơ đồ Thành phần UML` / `Sơ đồ Tuần tự UML` |
| `Static Design` / `Runtime Trace` | `Thiết kế tĩnh` / `Quan sát thực thi Runtime` |

#### D. Luồng Runtime 3 Bước, Nộp Bài Tập, Chấm Điểm & Quản Trị Hệ Thống
| Tiếng Anh (English) | Tiếng Việt Chuẩn Hóa |
| :--- | :--- |
| `Execution status` / `Scenario status` | `Trạng thái thực thi` / `Trạng thái kịch bản` |
| `Evidence status` / `Cleanup status` | `Trạng thái bằng chứng` / `Trạng thái dọn dẹp` |
| `Trace quality` / `Mapping status` | `Chất lượng Trace` / `Trạng thái ánh xạ mô hình` |
| `Visual UML Sequence Diagram` | `Sơ đồ Tuần tự UML Trực quan` |
| `Open Enriched Architecture Graph` | `Mở Đồ thị Kiến trúc đã làm giàu Runtime` |
| `View in Full Diagram Workspace` | `Mở trong Không gian Sơ đồ Đầy đủ` |
| `Save class settings` / `Archive workspace` | `Lưu cài đặt lớp học` / `Lưu trữ lớp học` |
| `Whole submission` / `Publish grade` / `Return for revision` | `Toàn bộ bài nộp` / `Công bố điểm` / `Trả bài để chỉnh sửa` |
| `Freeze artifacts` / `Frozen submission bundle` | `Đóng băng hồ sơ bài nộp` / `Gói hồ sơ bài nộp đã đóng băng` |

---

### TASK 2.1: Cập nhật toàn bộ file `src/lib/i18n/three-e-vi.ts` (Chuẩn hóa tiếng Việt mô hình 3E, bỏ hoàn toàn mở ngoặc tiếng Anh thừa)

- **File cần sửa:** `src/lib/i18n/three-e-vi.ts`
- **Thay thế toàn bộ nội dung file `src/lib/i18n/three-e-vi.ts` bằng đoạn code dưới đây:**

```ts
export function translateRuleTitleVi(code: string, fallbackTitle: string): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE": "Phụ thuộc vòng giữa các Service",
    "EVAL-SHARED-DB": "Ranh giới quyền sở hữu dữ liệu giữa các Service",
    "EVAL-HUB": "Mật độ kết nối phụ thuộc của các Service",
    "EVAL-GOD-SERVICE": "Service ôm đồm quá nhiều trách nhiệm",
    "EVAL-ORPHAN": "Thành phần cô lập chưa có kết nối",
    "EVAL-DIRECT-DB": "Truy cập trực tiếp Database bỏ qua tầng nghiệp vụ",
    "EVAL-SYNC-CHAIN": "Chuỗi gọi HTTP đồng bộ quá sâu",
    "EVAL-MISSING-RESILIENCE": "Thiếu cơ chế chịu lỗi khi gọi liên Service",
  };
  return map[code] ?? fallbackTitle;
}

export function translateRuleSummaryVi(
  code: string,
  status: string,
  summary: string,
): string {
  if (code === "EVAL-CYCLE") {
    if (status === "PASS") {
      return "Không phát hiện vòng lặp phụ thuộc trực tiếp 2 chiều giữa các Service.";
    }
    const m = summary.match(/Detected\s+(\d+)\s+direct two-node dependency cycle\(s\)\.?/i);
    if (m) {
      return `Phát hiện ${m[1]} vòng lặp phụ thuộc trực tiếp 2 chiều giữa các Service.`;
    }
  }

  if (code === "EVAL-SHARED-DB") {
    if (status === "PASS") {
      return "Mỗi kho dữ liệu chỉ được truy cập bởi một Service sở hữu duy nhất.";
    }
    const m = summary.match(/(\d+)\s+datastore\(s\)\s+are accessed by multiple services\.?/i);
    if (m) {
      return `Có ${m[1]} kho dữ liệu đang bị truy cập chung bởi nhiều Service khác nhau.`;
    }
  }

  if (code === "EVAL-HUB") {
    if (status === "PASS") {
      return "Bậc kết nối vào/ra của các thành phần đều nằm trong ngưỡng an toàn (<= 6).";
    }
    const m = summary.match(/(\d+)\s+element\(s\)\s+have high fan-in\/fan-out degree \(> 6\)\.?/i);
    if (m) {
      return `Có ${m[1]} thành phần có mật độ kết nối vào/ra quá cao (> 6 kết nối).`;
    }
  }

  return summary;
}

export function translateRuleRationaleVi(code: string, rationale: string): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE":
      "Phụ thuộc vòng giữa các Service làm tăng độ kết dính, gây khó khăn khi triển khai độc lập và dễ dẫn đến lỗi dây chuyền khi một Service gặp sự cố.",
    "EVAL-SHARED-DB":
      "Việc dùng chung Database giữa nhiều Microservice phá vỡ tính đóng gói dữ liệu và tạo sự phụ thuộc ngầm ở tầng Schema khi nâng cấp hệ thống.",
    "EVAL-HUB":
      "Một thành phần có quá nhiều kết nối vào/ra thường là dấu hiệu của việc tập trung quá nhiều trách nhiệm hoặc trở thành điểm nghẽn cổ chai của toàn hệ thống.",
  };
  return map[code] ?? rationale;
}

export function translateRuleRecommendationVi(
  code: string,
  recommendation: string,
): string {
  const map: Record<string, string> = {
    "EVAL-CYCLE":
      "Tách hợp đồng giao tiếp chung ra thư viện độc lập hoặc chuyển sang giao tiếp bất đồng bộ qua sự kiện (Event-driven) để phá vỡ vòng lặp phụ thuộc.",
    "EVAL-SHARED-DB":
      "Phân tách rõ quyền sở hữu bảng/schema cho từng Service và chỉ trao đổi dữ liệu qua API hoặc sự kiện bất đồng bộ.",
    "EVAL-HUB":
      "Xem xét tách nhỏ thành phần có mật độ kết nối cao thành các phần tử chuyên biệt theo từng miền nghiệp vụ.",
  };
  return map[code] ?? recommendation;
}

export function translateFindingExplanationVi(explanation: string): string {
  let out = explanation;

  out = out.replace(
    /^([^\s]+)\s+and\s+([^\s]+)\s+depend on each other directly\.?$/i,
    "Hai thành phần $1 và $2 đang phụ thuộc trực tiếp lẫn nhau (gọi 2 chiều).",
  );

  out = out.replace(
    /^Datastore\s+([^\s]+)\s+is shared across\s+(\d+)\s+services:\s+(.+)\.?$/i,
    "Kho dữ liệu $1 đang bị dùng chung bởi $2 Service: $3.",
  );

  out = out.replace(
    /^([^\s]+)\s+has\s+(\d+)\s+connected relationships\s+\(fan-in\s+(\d+),\s+fan-out\s+(\d+)\)\.?$/i,
    "Thành phần $1 có tổng cộng $2 mối quan hệ kết nối (gọi đến: $3, gọi đi: $4).",
  );

  return out;
}

export function translateRuleExplanationVi(explanation: string): string {
  let out = explanation;

  out = out.replace(
    /^([^\s]+)\s+is a\s+([^\s]+)\s+in\s+([^\s]+)\s+layer with\s+(\d+)\s+incoming and\s+(\d+)\s+outgoing relationships\.?$/i,
    "$1 là một phần tử thuộc loại $2 nằm ở tầng $3, có $4 kết nối gọi đến và $5 kết nối gọi đi.",
  );

  out = out.replace(
    /^([^\s]+)\s+connects to\s+([^\s]+)\s+via\s+([^\s]+)\s+\(confidence\s+(\d+)%\)\.?$/i,
    "$1 kết nối tới $2 thông qua giao thức $3 (độ tin cậy $4%).",
  );

  return out;
}

export function translateSourceTypeVi(sourceType: string): string {
  const map: Record<string, string> = {
    STATIC_AST: "Phân tích cây cú pháp AST",
    AST: "Phân tích cây cú pháp AST",
    CONFIG_FILE: "Tệp cấu hình",
    CONFIG: "Tệp cấu hình",
    DOCKER_COMPOSE: "Tệp Docker Compose",
    OPENAPI: "Đặc tả OpenAPI",
    RUNTIME_TRACE: "Truy vết thực thi Runtime",
    RUNTIME: "Quan sát từ Runtime",
    USER_MANUAL: "Người dùng xác nhận thủ công",
    AI_INFERRED: "Suy luận ngữ cảnh AI",
    SPRING_ANNOTATION: "Annotation Spring Framework",
    FEIGN_CLIENT: "Khai báo FeignClient",
    REST_TEMPLATE: "Lời gọi RestTemplate / WebClient",
    JPA_ENTITY: "Ánh xạ thực thể JPA / Database",
    MESSAGE_LISTENER: "Khai báo hàng đợi Message Broker",
  };
  return map[sourceType.toUpperCase()] ?? sourceType;
}

export function translateDetectorVi(detector: string): string {
  const map: Record<string, string> = {
    "spring-web-detector": "Bộ nhận diện Spring Web Endpoint",
    "feign-client-detector": "Bộ nhận diện giao tiếp FeignClient",
    "rest-template-detector": "Bộ nhận diện lời gọi HTTP Client",
    "docker-compose-detector": "Bộ phân tích cấu hình Docker Compose",
    "spring-config-detector": "Bộ phân tích cấu hình Spring",
    "jpa-datasource-detector": "Bộ nhận diện kết nối Database / JPA",
    "messaging-detector": "Bộ nhận diện kết nối Message Broker",
    "otel-trace-mapper": "Bộ ánh xạ OpenTelemetry Runtime Trace",
    "manual-model-editor": "Chỉnh sửa mô hình thủ công",
  };
  return map[detector] ?? detector;
}

export function translateEvidenceExcerptVi(excerpt: string): string {
  if (!excerpt) return excerpt;
  let out = excerpt;

  out = out.replace(
    /^Resolved HTTP call from\s+(.+)\s+to\s+(.+)$/i,
    "Xác nhận lời gọi HTTP từ $1 tới $2",
  );
  out = out.replace(
    /^Docker compose dependency:\s*(.+)$/i,
    "Phụ thuộc khai báo trong Docker Compose: $1",
  );
  out = out.replace(
    /^Observed runtime span:\s*(.+)$/i,
    "Span thu thập thực tế từ Runtime: $1",
  );
  out = out.replace(
    /^Environment variable reference:\s*(.+)$/i,
    "Tham chiếu biến môi trường cấu hình: $1",
  );

  return out;
}
```

---

### TASK 2.2: Cập nhật toàn diện `src/lib/i18n/locale-context.tsx` (Loại bỏ mở ngoặc tiếng Anh thừa, đồng nhất thuật ngữ và bổ sung đầy đủ bản dịch cho toàn bộ 3 luồng)

- **File cần sửa:** `src/lib/i18n/locale-context.tsx`
- **Thực hiện 3 cập nhật chính trong `src/lib/i18n/locale-context.tsx`:**

#### Bước 2.2.1: Sửa các câu có mở ngoặc tiếng Anh thừa đang nằm trong `EXACT_VI_DICTIONARY` của `src/lib/i18n/locale-context.tsx`
Tìm và thay thế chính xác các dòng sau trong `EXACT_VI_DICTIONARY`:

```ts
  // Bỏ mở ngoặc tiếng Anh thừa, chuẩn hóa câu chữ tự nhiên:
  "Cyclic dependencies between services": "Phụ thuộc vòng giữa các Service",
  "Data ownership boundaries between services": "Ranh giới quyền sở hữu dữ liệu giữa các Service",
  "Runtime observation": "Quan sát từ Runtime",
  "Logical Datastore": "Kho dữ liệu logic",
  "Message Channel": "Kênh thông điệp",
  "External System": "Hệ thống bên ngoài",
  "Classifier to explore": "Classifier cần khám phá",
  "Code Dependency": "Phụ thuộc mã nguồn",
  "DB / Queues": "Database / Hàng đợi",
  "Data Persistence": "Tầng lưu trữ dữ liệu",
  "Domain Service": "Tầng nghiệp vụ",
  "Architecture Atlas": "Bản đồ Kiến trúc",
  "Architecture Diagrams": "Sơ đồ Kiến trúc C4 & UML",
  "Feign / HTTP Contract Details": "Chi tiết hợp đồng giao tiếp HTTP / Feign",
  "Lifelines covered:": "Các Lifeline tham gia:",
  "Docker Compose Dependency": "Phụ thuộc triển khai Docker Compose",
  "Evaluate": "Đánh giá",
  "Evidence": "Bằng chứng",
  "Explain": "Giải thích",
  "Profile ID": "Mã hồ sơ thực thi",
  "Sessions": "Danh sách phiên chạy",
  "Export frozen bundle": "Xuất gói hồ sơ bài nộp",
  "Prompt tokens": "Token đầu vào",
  "Completion tokens": "Token đầu ra",
  "Load runtime sequence trace": "Tải sơ đồ tuần tự Runtime",
  "Outage Blast Radius Map": "Bản đồ bán kính ảnh hưởng sự cố",
  "Runtime Trace": "Quan sát thực thi Runtime",
  "Snapshots": "Bản chụp mã nguồn",
  "Static": "Mã nguồn & cấu hình tĩnh",
  "Step 3: Run & Trace": "Bước 3: Chạy & Xem kết quả Trace",
  "Strict Confirmed HTTP Calls": "Chỉ kết nối HTTP đã xác nhận",
  "Trace to source evidence": "Truy vết về mã nguồn",
  "Diagnostic summary": "Tóm tắt kết quả phân tích",
  "Diagnostics": "Kết quả kiểm tra",
```

#### Bước 2.2.2: Bổ sung toàn bộ từ điển còn thiếu cho 3 luồng Sinh viên, Giảng viên, Quản trị viên vào cuối `EXACT_VI_DICTIONARY` trong `src/lib/i18n/locale-context.tsx`
Thêm khối từ điển chuẩn hóa dưới đây vào ngay trước dấu đóng `};` của `EXACT_VI_DICTIONARY` trong `src/lib/i18n/locale-context.tsx`:

```ts
  // === CHUẨN HÓA BỔ SUNG TOÀN DIỆN CHO 3 LUỒNG: STUDENT, LECTURER, ADMIN ===
  // 1. Điều hướng & Khung ứng dụng
  "Architecture Views": "Góc nhìn Kiến trúc",
  "Architecture Graph": "Đồ thị Kiến trúc",
  "C4 & UML Diagrams": "Sơ đồ C4 & UML",
  "Model Governance": "Quản trị Mô hình",
  "Context Review": "Rà soát ngữ cảnh",
  "Model Editor": "Chỉnh sửa mô hình",
  "Compare Versions": "So sánh phiên bản",
  "Analysis & Runtime": "Phân tích & Chạy thử Runtime",
  "Change Impact": "Phân tích tác động",
  "AI Explanations": "Giải thích AI",
  "Step 1: Runtime Config": "Bước 1: Cấu hình Runtime",
  "Step 2: Scenarios": "Bước 2: Kịch bản chạy thử",
  "Step 3: Run & Trace": "Bước 3: Chạy & Xem kết quả Trace",
  "Coursework": "Học tập",
  "Assignments": "Bài tập",
  "Submissions": "Bài nộp",
  "Teaching": "Giảng dạy",
  "Workspaces": "Lớp học",
  "Reference Sources": "Mã nguồn mẫu",
  "Submissions & Grading": "Bài nộp & Chấm điểm",
  "Platform Monitoring": "Giám sát hệ thống",
  "System Health": "Sức khỏe hệ thống",
  "Analysis Jobs": "Tiến trình phân tích",
  "Platform Usage": "Mức sử dụng hệ thống",
  "Governance & Config": "Quản trị & Cấu hình",
  "Accounts & Roles": "Tài khoản & Phân quyền",
  "Integrations": "Tích hợp hệ thống",
  "Runtime Profiles": "Hồ sơ cấu hình Runtime",
  "Audit Trail": "Nhật ký kiểm toán",
  "Student": "Sinh viên",
  "Lecturer": "Giảng viên",
  "System Administrator": "Quản trị viên hệ thống",
  "Active Project": "Dự án đang chọn",
  "Model Revision": "Phiên bản mô hình",
  "Select a project": "Chọn một dự án",
  "No revisions yet": "Chưa có phiên bản mô hình",
  "Notifications": "Thông báo",
  "Profile & Security": "Hồ sơ & Bảo mật",
  "Sign out": "Đăng xuất",

  // 2. Luồng Sinh viên: Dự án, Đồ thị 3E, Sơ đồ C4/UML & Rà soát ngữ cảnh
  "Click any Service node on the graph to open the Component Inspection Drawer (source files, dependencies, evaluation warnings), or click any Edge arrow (A ↔ B) to inspect exact code and config connection evidence.":
    "Nhấp vào bất kỳ nút Service nào trên đồ thị để mở Ngăn thông tin chi tiết thành phần (tệp mã nguồn, phụ thuộc, cảnh báo quy tắc), hoặc nhấp vào mũi tên kết nối (A ↔ B) để xem bằng chứng mã nguồn và cấu hình.",
  "Runtime-Enriched Model Active:": "Đang mở Mô hình đã làm giàu từ Runtime:",
  "relationships verified via OpenTelemetry traces are highlighted in solid emerald green on the graph. Click any green edge to inspect its runtime trace evidence.":
    "mối quan hệ đã được xác thực qua OpenTelemetry Trace đang được tô nổi bật bằng màu xanh ngọc đậm trên đồ thị. Nhấp vào cạnh màu xanh để xem bằng chứng Runtime Trace.",
  "All Static + Config Edges": "Tất cả kết nối tĩnh & cấu hình",
  "Show all": "Hiển thị tất cả",
  "Hide datastores": "Ẩn kho dữ liệu",
  "Show datastores": "Hiện kho dữ liệu",
  "Fit graph": "Căn vừa khung nhìn",
  "Reset layout": "Đặt lại bố cục",
  "Export PNG": "Xuất ảnh PNG",
  "Export SVG": "Xuất ảnh SVG",
  "Export JSON": "Xuất tệp JSON",
  "Open in Draw.io Editor": "Mở trong trình chỉnh sửa Draw.io",
  "Back to Diagram View": "Quay lại xem sơ đồ",
  "C4 System Context": "Sơ đồ Ngữ cảnh Hệ thống C4",
  "C4 Container View": "Sơ đồ Container C4",
  "C4 Component View": "Sơ đồ Component C4",
  "UML Class Diagram": "Sơ đồ Lớp UML",
  "UML Component Diagram": "Sơ đồ Thành phần UML",
  "UML Sequence Diagram": "Sơ đồ Tuần tự UML",
  "Static Design": "Thiết kế tĩnh",
  "Observed Runtime": "Quan sát từ Runtime",
  "Auto-confirm high confidence": "Tự động xác nhận mục có độ tin cậy cao",
  "Accept into model": "Chấp nhận vào mô hình",
  "Ignore as noise": "Bỏ qua thành phần nhiễu",
  "Ambiguous architectural items": "Các thành phần kiến trúc cần xác nhận",
  "No ambiguous items remaining": "Không còn thành phần nào cần xác nhận",

  // 3. Luồng Sinh viên: Runtime 3 Bước & Nộp bài tập
  "Execution status": "Trạng thái thực thi",
  "Scenario status": "Trạng thái kịch bản",
  "Evidence status": "Trạng thái bằng chứng",
  "Cleanup status": "Trạng thái dọn dẹp",
  "Trace quality": "Chất lượng Trace",
  "Mapping status": "Trạng thái ánh xạ mô hình",
  "No runtime trace attached": "Không đính kèm phiên chạy Runtime",
  "Visual UML Sequence Diagram": "Sơ đồ Tuần tự UML Trực quan",
  "Interactive Runtime Sequence Diagram": "Sơ đồ Tuần tự Runtime Tương tác",
  "Open Enriched Architecture Graph": "Mở Đồ thị Kiến trúc đã làm giàu Runtime",
  "View in Full Diagram Workspace": "Mở trong Không gian Sơ đồ Đầy đủ",
  "Run Scenario in Sandbox": "Chạy kịch bản trong Sandbox",
  "Start Runtime Session": "Khởi chạy phiên Runtime",
  "Refresh Session Status": "Làm mới trạng thái phiên chạy",
  "Cleanup Containers": "Dọn dẹp các Container",
  "Submit coursework": "Nộp bài tập",
  "Save draft": "Lưu bản nháp",
  "Submission readiness": "Mức độ sẵn sàng nộp bài",
  "Select artifacts to include": "Chọn các tài liệu đính kèm vào bài nộp",

  // 4. Luồng Giảng viên: Quản lý Lớp học, Bài tập, Chấm bài & Nhận xét
  "Workspace name": "Tên lớp học",
  "Class description": "Mô tả lớp học",
  "Save class settings": "Lưu cài đặt lớp học",
  "Saving...": "Đang lưu...",
  "Rename": "Đổi tên",
  "Archive workspace": "Lưu trữ lớp học",
  "Create workspace": "Tạo lớp học mới",
  "Add member": "Thêm thành viên",
  "Bulk import members": "Nhập danh sách sinh viên hàng loạt",
  "Reference source": "Mã nguồn mẫu",
  "Attach reference source": "Đính kèm mã nguồn mẫu",
  "Create assignment": "Tạo bài tập mới",
  "Due date": "Hạn nộp bài",
  "Require runtime trace": "Yêu cầu đính kèm kết quả chạy Runtime",
  "Whole submission": "Toàn bộ bài nộp",
  "Publish grade": "Công bố điểm",
  "Return for revision": "Trả bài để chỉnh sửa",
  "Freeze artifacts": "Đóng băng hồ sơ bài nộp",
  "Not submitted": "Chưa nộp",
  "Pending": "Chờ chấm",
  "Graded": "Đã chấm điểm",
  "Returned": "Đã trả bài",

  // 5. Luồng Quản trị viên: Giám sát hệ thống, Tài khoản, Tiến trình & Cấu hình Runtime
  "All roles": "Tất cả vai trò",
  "All statuses": "Tất cả trạng thái",
  "Queued": "Đang xếp hàng",
  "Processing": "Đang xử lý",
  "Completed": "Hoàn tất",
  "Failed": "Thất bại",
  "Partial": "Hoàn tất một phần",
  "Cancelling": "Đang hủy",
  "Cancelled": "Đã hủy",
  "Timed out": "Quá thời gian chờ",
  "Active": "Đang hoạt động",
  "Locked": "Đã khóa",
  "Pending verification": "Chờ xác minh",
  "Lock account": "Khóa tài khoản",
  "Unlock account": "Mở khóa tài khoản",
  "Balanced sandbox": "Cấu hình Sandbox cân bằng",
  "Max concurrent sessions": "Số phiên chạy đồng thời tối đa",
  "Timeout (seconds)": "Thời gian chờ tối đa (giây)",
  "Network policy": "Chính sách mạng Container",
```

#### Bước 2.2.3: Bổ sung các mẫu biểu thức chính quy động vào mảng `PATTERN_REPLACEMENTS` trong `src/lib/i18n/locale-context.tsx`
Thêm các mẫu sau vào mảng `PATTERN_REPLACEMENTS` trong `src/lib/i18n/locale-context.tsx` để dịch tự động các nhãn có số liệu hoặc tên phần tử động:

```ts
  [
    /^Relationship · (.+) → (.+) \((.+)\)$/i,
    "Mối quan hệ · $1 → $2 ($3)",
  ],
  [
    /^Relationship · (.+) · (.+)$/i,
    "Mối quan hệ · $1 · $2",
  ],
  [
    /^Element · (.+)$/i,
    "Phần tử · $1",
  ],
  [
    /^(.+) · #([a-f0-9]{8}) \((\d+) spans\)$/i,
    "$1 · #$2 ($3 span)",
  ],
  [
    /^Revision (\d+) · (.+)$/i,
    "Phiên bản $1 · $2",
  ],
  [
    /^Showing (\d+) of (\d+) items$/i,
    "Đang hiển thị $1 trên tổng số $2 mục",
  ],
```

---

## PHẦN 3: DANH SÁCH KIỂM TRA XÁC MINH SAU KHI SỬA (VERIFICATION CHECKLIST)

Sau khi Antigravity hoàn tất các Task trên, hãy chạy kiểm tra nhanh:
1. **Kiểm tra biên dịch TypeScript:** Chạy `npx tsc --noEmit` (hoặc `npm run build`) tại thư mục Frontend để đảm bảo không có bất kỳ lỗi cú pháp hay kiểu dữ liệu nào.
2. **Kiểm tra Luồng Sinh viên:**
   - Mở trang `/architecture`: Dòng hướng dẫn đầu trang và thanh thông báo xanh `Runtime-Enriched Model Active` chuyển sang tiếng Việt hoàn chỉnh, không còn từ tiếng Anh lẻ.
   - Mở trang `/sessions` (Bước 3 Runtime): 6 ô trạng thái hiển thị rõ ràng (`Trạng thái thực thi`, `Trạng thái kịch bản`, `Trạng thái bằng chứng`, `Trạng thái dọn dẹp`, `Chất lượng Trace`, `Trạng thái ánh xạ mô hình`).
   - Mở trang `/submissions` (`SubmissionComposer`): Ô chọn phiên chạy Runtime hiển thị đầy đủ các phiên chạy đã hoàn tất với định dạng `<Tên kịch bản> · #<8 ký tự ID> (<số> span)`.
3. **Kiểm tra Luồng Giảng viên:**
   - Mở trang `/workspaces` → chọn một lớp học: Ô `Tên lớp học` và `Mô tả lớp học` nằm chung trong một form có nút `Lưu cài đặt lớp học` (`Save class settings`).
   - Mở trang `/teaching/submissions`: Cột mã bài nộp hiển thị gọn `#xxxxxxxx →`, thời gian nộp bài được định dạng ngày giờ dễ đọc, và trong khung Nhận xét (`FeedbackPanel`), danh sách chọn mối quan hệ hiển thị rõ `Mối quan hệ · service-a → service-b (HTTP)`.
4. **Kiểm tra Luồng Quản trị viên:**
   - Mở trang `/admin/profiles`, `/admin/accounts`, `/admin/jobs`: Các bộ lọc hiển thị nhãn chuẩn hóa và chuyển đổi mượt mà giữa Tiếng Anh (`EN`) và Tiếng Việt (`VI`).
