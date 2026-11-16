# Báo Cáo Bàn Giao Khắc Phục Độc Lập M3–M8 (`O1`–`O8`, Round-2 `Q1`–`Q4` & `.docx` Visual Alignment Handoff)

- **Ngày cập nhật:** `2026-10-25T14:35:00+07:00`
- **Run ID:** `20261025-025500-m3-m8`
- **Tài liệu điều phối gốc:** [`docs/GEMINI_M3_M8_OVERNIGHT_MASTER_PLAN_2026-10-25.md`](GEMINI_M3_M8_OVERNIGHT_MASTER_PLAN_2026-10-25.md)
- **Tài liệu review độc lập (Vòng 1):** [`docs/M3_M8_OVERNIGHT_INDEPENDENT_REVIEW_2026-10-25.md`](M3_M8_OVERNIGHT_INDEPENDENT_REVIEW_2026-10-25.md)
- **Tài liệu review độc lập (Vòng 2):** [`docs/M3_M8_O1_O8_ROUND2_REVIEW_2026-10-25.md`](M3_M8_O1_O8_ROUND2_REVIEW_2026-10-25.md)
- **Trạng thái thực thi:** [`docs/M3_M8_EXECUTION_STATUS.md`](M3_M8_EXECUTION_STATUS.md)
- **Checkpoint:** [`output/overnight/20261025-025500-m3-m8/checkpoint.json`](../output/overnight/20261025-025500-m3-m8/checkpoint.json)
- **Trạng thái quản trị tổng thể (`Overall Governance Status`):**
  - **Code, AST Semantics, Persistence Round-Trip (`Q1`–`Q3`), `.docx` Visual Alignment & Browser E2E:** `SELF_VERIFIED` (`PASS`)
  - **Browser Graph Workload Benchmark (`M8-AC03`, `Q4.3`):** `PARTIAL` (`100` và `500` nodes đạt toàn bộ ngưỡng; ở `2.000` nodes, mở rộng/thu gọn và lọc origin đạt ngưỡng nhưng tương tác zoom SVG mất median `377.3 ms > 100 ms` ngân sách khung hình tương tác)
  - **Live Runtime OTel Trace (`M3-AC09`, một phần `M8-AC05`):** `BLOCKED_NO_LIVE_TRACE` (`0` bản ghi trong bảng `runtime_sessions` của PostgreSQL; chưa có phiên Docker/Runner live trace)
  - **Nghiệm thu độc lập của Reviewer:** `PENDING_INDEPENDENT_REVIEW`
  - **Kết luận trung thực:** **Chưa tuyên bố toàn bộ M3–M8 hoàn thành vô điều kiện** khi chưa có live runtime trace thực tế, còn vượt ngân sách khung hình zoom ở mức `2.000` nodes, và đang chờ nghiệm thu độc lập từ Reviewer.

---

## 1. Chi Tiết Khắc Phục Vòng 2 (`Q1`–`Q4`) & Chuẩn Hoá Ngữ Nghĩa / Hình Ảnh Theo Bộ Tài Liệu `.docx`

### 1.1. `Q1` (High — Toàn Vẹn Chỉnh Sửa Ngữ Nghĩa Trên Canvas `mxCell.value` / `mxCell.style` & Parse `<mxGeometry>` Không Phụ Thuộc Thứ Tự)
- **Sửa đổi production (`file:symbol`):**
  - [`uml-diagrams.ts`](../MAVIS-Frontend/src/features/architecture/uml-diagrams.ts):
    - Bổ sung bộ hàm chuẩn hoá và so sánh ngữ nghĩa nhãn/kiểu dáng cho cả 5 loại sơ đồ UML (`formatClassifierCellValue`, `getClassifierCellStyle`, `formatClassRelationCellValue`, `getClassRelationCellStyle`, `formatPackageCellValue`, `getPackageCellStyle`, `formatPackageEdgeCellValue`, `getPackageEdgeCellStyle`, `formatDeploymentNodeCellValue`, `getDeploymentNodeCellStyle`, `getDeploymentEdgeCellStyle`, `formatActivityPartitionCellValue`, `getActivityPartitionCellStyle`, `getActivityNodeCellStyle`, `formatActivityEdgeCellValue`, `getActivityEdgeCellStyle`, `formatStateNodeCellValue`, `getStateNodeCellStyle`, `getStateTransitionCellStyle`).
    - Trong `reconcileUmlDrawioXml`: Sử dụng `hasSemanticValueMismatch` và `hasSemanticStyleMismatch` để phát hiện mọi thay đổi trực tiếp trên `mxCell.value` hoặc `mxCell.style` trong Draw.io (đổi tên class/member/package/port/action/guard/state, đổi mũi tên `endArrow`/`startArrow`/`dashed`/`shape`), phát xung đột `EXTRACTED_FACT_IMMUTABLE` (với phần tử `EXTRACTED`) hoặc `SEMANTIC_CANVAS_EDIT_UNSUPPORTED` (với phần tử `DESIGNED`), và chặn lưu CAS.
    - Trong `parseDrawioCells`: Thay thế regex phụ thuộc thứ tự thuộc tính `<mxGeometry>` bằng bộ phân tích thuộc tính độc lập thứ tự (`geomAttrs["width"]`, `geomAttrs["height"]`), mặc định `x = 0`, `y = 0` khi Draw.io lược bỏ `x="0"` / `y="0"` ở gốc toạ độ.
- **Kiểm chứng:** Bài test `Q1` trong [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs): `PASS`.

### 1.2. `Q2` (High — Xác Thực Định Danh Tài Liệu, `schemaVersion`, `diagramKind`, Scope, Carrier & Schema Overlay Khi Hydrate / Reconcile)
- **Sửa đổi production (`file:symbol`):**
  - [`uml-diagrams.ts`](../MAVIS-Frontend/src/features/architecture/uml-diagrams.ts) & [`uml-diagram-workspace.tsx`](../MAVIS-Frontend/src/features/architecture/uml-diagram-workspace.tsx):
    - Bổ sung `ExpectedUmlContext` và hàm `validateDocumentEnvelopeAndScope` kiểm tra nghiêm ngặt `modelId`, `diagramKind`, `schemaVersion === 1`, và scope (`packageFilter`, `environment`, `operationId`, `targetId`) trên cả `<mxGraphModel>`, `mavisUmlDocument`, và `mavisUmlProjection`.
    - Kiểm tra tính toàn vẹn của JSON `mavisUmlDocument` / `mavisUmlProjection` (`MALFORMED_CARRIER_METADATA`) và kiểm tra biên kiểu dữ liệu/hợp lệ cho toàn bộ mảng phần tử `DESIGNED` overlay (`INVALID_DESIGNED_OVERLAY_SCHEMA`).
    - Khi có bất kỳ lỗi xác thực nào trong `hydrateUmlWorkspaceFromXml` hoặc `reconcileUmlDrawioXml`, hệ thống từ chối áp dụng overlay bị hỏng và khóa nút Save CAS.
- **Kiểm chứng:** Bài test `Q2` trong [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs): `PASS`.

### 1.3. `Q3` (High — Không Tự Bịa `«artifact»` `:build` Hoặc `«manifest»` Khi Chỉ Có `build:` Context Hoặc Chỉ Có `ports:` / `environment:`)
- **Sửa đổi production (`file:symbol`):**
  - **Backend Java [`GraphBuilderServiceImpl.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/main/java/com/mavis/analyzer/graph/service/impl/GraphBuilderServiceImpl.java):** Xóa nhánh fallback gán `serviceName + ":build"` khi service trong `docker-compose.yml` không khai báo `image:`; đồng thời loại bỏ dependency `org.apache.commons.lang3.StringUtils` không khai báo trong [`mavis-analyzer/pom.xml`](../MAVIS-Platform/mavis-be/mavis-analyzer/pom.xml).
  - **Frontend [`uml-diagrams.ts`](../MAVIS-Frontend/src/features/architecture/uml-diagrams.ts):** Trong `projectUmlDeploymentDiagram`, chỉ tạo node `«artifact»` và cạnh `«manifest»` khi có bằng chứng `image` thực tế hoặc `buildArtifact` / `artifactName` tường minh (và loại bỏ hậu tố `:build` nhân tạo nếu xuất hiện trong dữ liệu cũ).
- **Kiểm chứng:**
  - Backend: [`GraphBuilderServiceTest.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/graph/service/GraphBuilderServiceTest.java) & [`JavaSourceToGraphC4PipelineTest.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/graph/service/JavaSourceToGraphC4PipelineTest.java) (`26/26 PASS` trong `mavis-analyzer`).
  - Frontend: Bài test `Q3` trong [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs) (`PASS`) và kiểm chứng trực tiếp trên [`output/m8/m5-uml-deployment.drawio`](../output/m8/m5-uml-deployment.drawio) (`hasNoFabricatedBuildArtifact: true`).

### 1.4. `Q4` (Medium — Phân Loại Trung Thực Pass 1 vs Pass 2, Kiểm Chứng DOM Thực Cho C4/Sequence/UML & Đánh Giá Ngưỡng Benchmark)
- **Sửa đổi trong [`scripts/run-m4-m8-browser-acceptance.cjs`](../scripts/run-m4-m8-browser-acceptance.cjs) & [`diagram-selection.ts`](../MAVIS-Frontend/src/features/architecture/diagram-selection.ts):**
  - Cập nhật `xmlSemanticCells` trong [`diagram-selection.ts`](../MAVIS-Frontend/src/features/architecture/diagram-selection.ts) hỗ trợ cả `mavisRole` và `mavisUmlRole`, giúp toàn bộ 9 sơ đồ (C4 + Sequence + 5 sơ đồ UML M4–M7) gắn các vùng tương tác `button[data-semantic-id]` trực tiếp lên khung vẽ SVG.
  - Phân tách rõ ràng `acceptanceMode: "LIVE_BACKEND_POSTGRES_TEST1"` (Pass 1) và `acceptanceMode: "BROWSER_EXTRACTOR_FIXTURE_VIA_ROUTE_FULFILL"` (Pass 2) trong [`output/m8/browser-catalog-acceptance.json`](../output/m8/browser-catalog-acceptance.json).
  - Trong Pass 3 (`BROWSER_GRAPH_WORKLOAD_BENCHMARK`), đo thời gian cập nhật DOM thực tế (chờ số lượng `path[data-edge-id]` thay đổi khi chuyển bộ lọc Origin và chờ thuộc tính `transform` của `<g>` thay đổi khi Zoom) kèm double `requestAnimationFrame`, thống kê mẫu nhỏ (`n = 5`: `samples`, `median`, `min`, `max`, `mean`), và đối chiếu với ngưỡng mục tiêu khai báo trước (`BENCHMARK_TARGETS`).

### 1.5. Hoàn Thiện 5 Hạng Mục Hình Ảnh (UX Above-the-Fold) & Ngữ Nghĩa Chuẩn Bộ Tài Liệu `.docx`
1. **Đưa khung vẽ sơ đồ lên ngay đầu trang (`Above the Fold`) trong [`uml-diagram-workspace.tsx`](../MAVIS-Frontend/src/features/architecture/uml-diagram-workspace.tsx):**
   - Đặt khung vẽ `SelectablePreview` / `DrawioEditor` ngay dưới thanh tóm tắt metadata gọn ở đầu trang và gom toàn bộ biểu mẫu Structured Authoring (`DESIGNED` Overlay) + danh sách phần tử vào ngăn đóng/mở `<details open data-testid="uml-authoring-drawer">` bên dưới.
   - Toàn bộ ảnh chụp [`output/m8/browser-uml-class.png`](../output/m8/browser-uml-class.png), [`browser-uml-package.png`](../output/m8/browser-uml-package.png), [`browser-uml-deployment.png`](../output/m8/browser-uml-deployment.png), [`browser-uml-activity.png`](../output/m8/browser-uml-activity.png), [`browser-uml-state.png`](../output/m8/browser-uml-state.png), [`browser-uml-sequence.png`](../output/m8/browser-uml-sequence.png) hiển thị trực diện, rõ nét sơ đồ ngay lập tức.
2. **Package Diagram theo `Packagage diagram.docx`:**
   - Đổi ánh xạ mặc định của `PACKAGE_IMPORT` / `CODE_DEPENDENCY` từ mã nguồn sang `"DEPENDENCY"` (`«use»`) thay vì tự gán `«import»`; chỉ phát `«import»`, `«access»`, `«merge»` khi có bằng chứng thiết kế rõ ràng.
   - Hỗ trợ vẽ lồng hộp đệ quy (`parent="${pkg.parentPackageId}"`) với kích thước tính toán từ dưới lên (bottom-up) trong XML Draw.io khi package có quan hệ cha-con.
3. **Class Diagram theo `Class Diagram.docx`:**
   - Hỗ trợ đầy đủ Role & Multiplicity ở cả 2 đầu quan hệ (`sourceRoleName`, `sourceMultiplicity`, `roleName`, `multiplicity`) và thuộc tính dẫn xuất `/derived` (`isDerived: true` hoặc tiền tố `/`).
4. **Sequence Diagram theo `Sequence Diagram.docx`:**
   - Hỗ trợ `Found Message` (`endpointKind: "FOUND"`) và `Lost Message` (`endpointKind: "LOST"`) vẽ kèm chấm tròn đặc màu đen (`found-origin-...` / `lost-target-...`) và bảo toàn qua chu trình lưu/đọc Draw.io XML.
5. **State Diagram theo `State diagram.docx`:**
   - Hỗ trợ `parentStateId` (vẽ substate lồng trong `COMPOSITE_STATE`) và các trạng thái giả lịch sử `SHALLOW_HISTORY` (`H`) và `DEEP_HISTORY` (`H*`), đồng thời căn lề đỉnh (`verticalAlign=top`) cho tên trạng thái để không bị nhãn cạnh đè lên.

---

## 2. Kết Quả Benchmark Tải Đồ Thị Trên Trình Duyệt (`Pass 3` — `n = 5` Lượt Chạy / Quy Mô)

Nguồn dữ liệu: [`output/m8/graph-browser-workload-benchmark-2026-10-25.json`](../output/m8/graph-browser-workload-benchmark-2026-10-25.json)

| Quy mô (`scaleNodes`) | Số node / cạnh SVG khi mở rộng | Mở rộng toàn bộ + Mount SVG + Paint (`median` / `max` vs Ngưỡng) | Đổi bộ lọc Origin + Đợi DOM + Paint (`median` / `max` vs Ngưỡng) | Tương tác Zoom + Đợi `<g transform>` + Paint (`median` / `max` vs Ngưỡng) | Thu gọn + Paint (`median` / `max`) | Đánh giá theo ngưỡng (`overallScaleStatus`) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`100` nodes** | `100` / `160` | **`158.8 ms` / `182.2 ms`** ($\le 250\text{ ms}$) | **`171.8 ms` / `190.1 ms`** ($\le 250\text{ ms}$) | **`15.3 ms` / `55.4 ms`** ($\le 100\text{ ms}$) | `28.7 ms` / `45.0 ms` | **`PASS`** |
| **`500` nodes** | `500` / `800` | **`133.4 ms` / `152.1 ms`** ($\le 600\text{ ms}$) | **`184.7 ms` / `189.3 ms`** ($\le 350\text{ ms}$) | **`58.7 ms` / `61.9 ms`** ($\le 100\text{ ms}$) | `105.3 ms` / `118.2 ms` | **`PASS`** |
| **`2.000` nodes** | `2.000` / `3.200` | **`548.2 ms` / `561.5 ms`** ($\le 1500\text{ ms}$) | **`324.6 ms` / `327.8 ms`** ($\le 600\text{ ms}$) | **`377.3 ms` / `418.6 ms`** ($> 100\text{ ms}$) | `303.9 ms` / `313.5 ms` | **`EXCEEDS_100MS_INTERACTIVE_FRAME_BUDGET` (`PARTIAL`)** |

---

## 3. Bảng Trạng Thái Trung Thực Cho Từng Acceptance Criteria (`M3`–`M8`)

| Milestone | Mã AC | Nội dung nghiệm thu | Trạng thái trung thực | Bằng chứng kiểm chứng / Ghi chú |
| :---: | :---: | :--- | :---: | :--- |
| **M3** | `M3-AC01`..`AC08`, `AC10`..`AC12` | UML Sequence: `UNKNOWN` sort cho cạnh tĩnh, Kahn causal topological sort, fragments/InteractionUse, lifecycle `CREATE`/`DELETE`, Found/Lost messages (`•`), strict Draw.io conflict detection & CAS block, collision-free ID allocation, 3E scope isolation | `SELF_VERIFIED` | [`sequence-semantics.test.cjs`](../MAVIS-Frontend/tests/sequence-semantics.test.cjs), [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs), [`output/m8/browser-uml-sequence.png`](../output/m8/browser-uml-sequence.png) |
| **M3** | `M3-AC09` | UML Sequence: Luồng `Observed runtime` từ OTel spans tới trình duyệt | `BLOCKED_NO_LIVE_TRACE` (`PARTIAL`) | Correlation backend & projection frontend `PASS` trên [`output/m3/observed-sequence-java-actual.json`](../output/m3/observed-sequence-java-actual.json), nhưng bảng `runtime_sessions` trong PostgreSQL hiện có `0` bản ghi live trace. |
| **M4** | `M4-AC01`..`AC08` | UML Class & Package: Visibility (`package-private` vs `internal`), `/derived` attribute, 2-ended Role & Multiplicity, whole-part restraint, service-scoped package ID (`pkg:${serviceId}:${qName}`), default `DEPENDENCY` (`«use»`) cho `PACKAGE_IMPORT`, nested package containers (`parentPackageId`), `«merge»` cycle validator, structured `DESIGNED` authoring & 2-cycle Draw.io round-trip (`Q1`/`Q2`) | `SELF_VERIFIED` | [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs), [`output/m8/m4-uml-class.drawio`](../output/m8/m4-uml-class.drawio), [`output/m8/m4-uml-package.drawio`](../output/m8/m4-uml-package.drawio), [`output/m8/browser-uml-class.png`](../output/m8/browser-uml-class.png), [`output/m8/browser-uml-package.png`](../output/m8/browser-uml-package.png) |
| **M5** | `M5-AC01`..`AC06` | UML Deployment: Honest empty state (`NO_DEPLOYMENT_METADATA_EXTRACTED`), authentic artifact discipline (`Q3`: không bịa `:build` artifact hoặc `«manifest»` khi chỉ có `build:` context / `ports:`), 3D cube nodes, nested `«artifact»`, tách biệt `CommunicationPath` với Compose `depends_on`, cô lập môi trường, structured authoring & Draw.io round-trip (`Q1`/`Q2`) | `SELF_VERIFIED` | [`GraphBuilderServiceTest.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/graph/service/GraphBuilderServiceTest.java), [`uml-m4-m8.test.cjs`](../MAVIS-Frontend/tests/uml-m4-m8.test.cjs), [`output/m8/m5-uml-deployment.drawio`](../output/m8/m5-uml-deployment.drawio), [`output/m8/browser-uml-deployment.png`](../output/m8/browser-uml-deployment.png) |
| **M6** | `M6-AC01`..`AC06` | UML Activity: Recursive AST CFG (Java & C#) xử lý early `return`, `do-while`, `PARTIAL` cho `break`/`continue`/`try`/`switch`/`lambda`, `OBJECT_NODE` từ AST, Swimlane Partition, `JOIN_BRANCH_DEADLOCK` validator, honest empty state (`NO_ACTIVITY_CFG_EXTRACTED`), structured authoring & Draw.io round-trip (`Q1`/`Q2`) | `SELF_VERIFIED` | [`UmlClassifierVisitorTest.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/javaanalyzer/visitor/UmlClassifierVisitorTest.java), [`CSharpAnalyzerTests.cs`](../MAVIS.Worker/tests/MAVIS.Worker.Tests/CSharp/CSharpAnalyzerTests.cs), [`output/m8/m6-uml-activity.drawio`](../output/m8/m6-uml-activity.drawio), [`output/m8/browser-uml-activity.png`](../output/m8/browser-uml-activity.png) |
| **M7** | `M7-AC01`..`AC06` | UML State Machine: AST State Lifecycle (Java & C#) phân biệt nhánh `then`/`else` & early-exit guard, loại bỏ primitive/string fields, `PARTIAL` cho unguarded assignments, `ENUM_ONLY_NO_TRANSITIONS`, composite `parentStateId` substates, `SHALLOW_HISTORY` (`H`) & `DEEP_HISTORY` (`H*`), structured authoring & Draw.io round-trip (`Q1`/`Q2`) | `SELF_VERIFIED` | [`UmlClassifierVisitorTest.java`](../MAVIS-Platform/mavis-be/mavis-analyzer/src/test/java/com/mavis/analyzer/javaanalyzer/visitor/UmlClassifierVisitorTest.java), [`CSharpAnalyzerTests.cs`](../MAVIS.Worker/tests/MAVIS.Worker.Tests/CSharp/CSharpAnalyzerTests.cs), [`output/m8/m7-uml-state.drawio`](../output/m8/m7-uml-state.drawio), [`output/m8/browser-uml-state.png`](../output/m8/browser-uml-state.png) |
| **M8** | `M8-AC01`, `AC02`, `AC04`, `AC06` | Danh mục 9 sơ đồ hợp nhất, không rò rỉ `CLASS_INTERFACE` sang C4 Component, ma trận bao phủ động (`buildM8CoverageMatrix`), tách biệt `npm test` (`135/135 PASS`) và `npm run test:connected` (`3/3 PASS`) | `SELF_VERIFIED` | [`output/m8/coverage-matrix.json`](../output/m8/coverage-matrix.json), [`output/m8/browser-catalog-acceptance.json`](../output/m8/browser-catalog-acceptance.json) |
| **M8** | `M8-AC03` | Benchmark tải đồ thị trình duyệt thật (`100`, `500`, `2.000` nodes $\times 5$ runs) | `PARTIAL` (`100` & `500` nodes `PASS`; `2.000` nodes zoom frame paint `377.3 ms > 100 ms` target) | [`output/m8/graph-browser-workload-benchmark-2026-10-25.json`](../output/m8/graph-browser-workload-benchmark-2026-10-25.json) |
| **M8** | `M8-AC05` | Hồi quy E2E xuyên suốt toàn hệ thống (`Graph` + 9 sơ đồ, phân tách rõ Pass 1 `LIVE_BACKEND_POSTGRES_TEST1` và Pass 2 `BROWSER_EXTRACTOR_FIXTURE_VIA_ROUTE_FULFILL`) | `PARTIAL` (`SELF_VERIFIED` cho Static/Designed/Connected Browser E2E; `BLOCKED_NO_LIVE_TRACE` cho live runtime trace) | [`output/m8/browser-catalog-acceptance.json`](../output/m8/browser-catalog-acceptance.json) |

---

## 4. Trạng Thái Dịch Vụ & Vệ Sinh Môi Trường (Process & Git Hygiene)

- **Dịch vụ của người dùng được giữ nguyên (đang chạy):**
  - **Java Backend (`:8081`):** PID `4436` (`LISTENING`).
  - **.NET Worker (`:5082`):** PID `13652` (`LISTENING`).
- **Dịch vụ QA tạm thời đã dọn sạch sau E2E:**
  - **Next.js Dev Server (`:3000`):** Đã dừng (`0` listener trên cổng `3000`).
  - **Draw.io Renderer (`:8090`):** Đã dừng (`0` listener trên cổng `8090`).
- **An toàn Git:** Không thực hiện bất kỳ lệnh `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git clean`, `git stash` hay `git checkout` nào.
