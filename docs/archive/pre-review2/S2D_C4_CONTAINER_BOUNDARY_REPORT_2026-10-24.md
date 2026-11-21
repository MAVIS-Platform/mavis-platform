# S2d — System scope và boundary trên C4 Container

Ngày: 24/10/2026. Trạng thái: **đang bổ sung theo review — chưa nghiệm thu cuối**. Reviewer đã chạy FE 76/76 pass và typecheck sạch ở lượt trước; hai điểm review (includedNodeIds source-only; geometry warning/boundary dài) đã được sửa và test, kết quả trong mục 5. Tiền đề: S2c đã nghiệm thu; UC-01 + browser acceptance S2b vẫn mở. Phạm vi: view-planner + generate + thread `systemName` qua UI/contract. Căn cứ ký pháp: `output/c4-complete/MAVISS_C4_C1_C2_C3_Huong_dan_day_du.docx` (bản đã hiệu chỉnh: boundary thể hiện scope/ownership, nét đứt là quy ước trình bày chứ không phải hình học bắt buộc; microservice không bắt buộc DB riêng; boundary object hợp lệ có ID riêng + membership). **Không** sửa C1/C3, chiều messaging, nhãn protocol, vocabulary, layout engine, schema/API backend, dependency.

---

## 1. Scope contract (xác minh trước khi sửa renderer)

**Luồng thật đã đọc**: màn hình Architecture → `ArchitectureDiagrams` → `selectDiagram` (diagram-catalog) → `modelDocument(model)` → `planArchitectureViews` → `DiagramDocument` → `generateDrawio` (ELK grouping sẵn có của C3 được mở cho CONTAINER).

**Phân loại membership — chỉ dùng metadata hiện có** (`elementType` + `properties.resourceRole`), không suy từ vị trí layout, tên service hay kết nối:

| Phân loại | Tiêu chí (metadata có sẵn) | Vị trí |
|---|---|---|
| Trong boundary | `SERVICE_CONTAINER`, `MESSAGE_CHANNEL`, `DATABASE` có `properties.resourceRole === "LOGICAL_DATASTORE"` | bên trong khung System Boundary |
| External | `EXTERNAL_SYSTEM`, `PERSON` | ngoài khung |
| Ownership chưa xác định | còn lại (`QUEUE_BROKER`, `DATABASE` không khai báo role, kind lạ…) | **ngoài khung + scopeWarning** — không tự đưa vào |
| Person | model hiện không có elementType Person → không tự sinh actor (đúng policy evidence) | n/a |

- **Tên boundary**: `systemName` truyền từ UI (tên project thật) qua contract additive; **fallback trung thực `"Analyzed system"`** khi UI không truyền — không mặc định "MAVIS". Scope subtitle: "Software system · analyzed source scope".
- **Không đủ scope**: nếu không còn container nào phân loại được → **không vẽ boundary**, chỉ warning "System scope could not be determined…"; nếu có phần tử unresolved → warning liệt kê tên + số lượng (hiện ở legend của XML và `limitations` của view pack).
- Boundary là **view-local object** với ID namespaced `system:boundary` (sanctioned bởi tài liệu tham chiếu mục 11: "boundary tổng hợp có ID riêng và lưu membership") — không tái dùng ID service, không trở thành business node; các phần tử chỉ mang `parentId` view-local trong document của view này, **không đổi model/API/DB**.
- **Phạm vi hiệu lục**: phân loại membership này là **policy projection của MAVISS** dựa trên contract model đã xác minh — **không phải quy tắc C4 phổ quát** rằng mọi SERVICE_CONTAINER/MESSAGE_CHANNEL luôn thuộc cùng một software system.

## 2. Triển khai

| File | Thay đổi |
|---|---|
| `src/lib/architecture/view-planner.ts` | `planArchitectureViews(raw, options?)`; classification `insideSystemScope`/`outsideAsExternal`; boundary node + `parentId` view-local cho members; `scopeWarning` (document field + pack limitations) |
| `src/lib/drawio/generate.ts` | Mở cơ chế boundary group (ELK swimlane) cho `C4/CONTAINER`; label boundary `${name} · ${scope}`; legend ghép `scopeWarning` |
| `src/features/architecture/diagram-catalog.ts` | `selectDiagram(model, kind, containerId, options?)` |
| `architecture-diagrams.tsx` / `architecture-presentation.tsx` / `routes/architecture.tsx` | Thread `systemName` (workspace query `project` theo `projectId` và truyền xuống) |
| `src/lib/api/contracts.ts` | `architectureViews` + `renderArchitectureView`: input thêm `systemName` optional (additive, GET `?input=` đã serialize sẵn) |
| `src/lib/api/java-operations.ts` | Passthrough `systemName` → planner (cả 2 op dùng chung một call site) |

Boundary **tham gia layout thật** qua cơ chế group ELK hiện hữu (children trong group, external/unresolved là root children) — không phải hình chữ nhật vẽ bao sau layout, nên external không thể nằm nhầm bên trong. Cạnh external↔internal đi qua boundary dùng đúng port/routing sẵn có của C3.

## 3. Kiểm chứng

**Test mới trong `tests/architecture.test.cjs` (+2, dùng selectDiagram + generateDrawio production thật):**

| Ca | Kết quả |
|---|---|
| Membership: 2 service + DATABASE (LOGICAL_DATASTORE) trong boundary; EXTERNAL_SYSTEM và QUEUE_BROKER (unresolved) ngoài | PASS |
| Tên boundary = `systemName` truyền vào (`OrderHub <test>`) | PASS |
| scopeWarning "Ownership unresolved for 1 element" khi có unresolved | PASS |
| XML: nhãn boundary escape đúng (`OrderHub &lt;test&gt; · Software system · analyzed source scope`), không có bản unescaped | PASS |
| XML: cell external/broker `parent="1"`, cell nội bộ `parent=<boundary group>`; cạnh external↔internal nối đúng source/target qua boundary | PASS |
| Không mất ID/cạnh: mọi node non-boundary là model element; 4 cạnh giữ nguyên | PASS |
| Model chỉ toàn external → không vẽ boundary + warning "no system boundary is drawn" | PASS |
| Regression: FTGO fixture thật — boundary fallback "Analyzed system"; 13 service trong boundary; DATABASE/QUEUE_BROKER không khai báo role **ở ngoài + warning** (không bịa membership); C3/4+1/các view khác 42 test architecture không hồi quy | PASS |
| **Review S2d**: `includedNodeIds` là tập con của model source IDs; boundary KHÔNG nằm trong đó; `syntheticNodeIds=["system:boundary"]` riêng; includedNodeIds.length = 5 (boundary không phình counts) | PASS |
| **Review S2d**: `systemBoundary` metadata truy vết được — memberIds [db,svc-a,svc-b], unresolvedIds [broker], name | PASS |
| **Review S2d**: tên system dài (tiếng Việt + `& < > "`) + 8 node unresolved tên dài — `systemBoundary.unresolvedIds` giữ đủ ID được chọn; legend chỉ tóm tắt "(+1 more; full list in view metadata)" | PASS |
| **Review S2d**: XML legend height = số dòng wrap × 17 + 24 (không còn cố định 100); boundary `startSize` > 44 theo tên dài; node con y ≥ startSize (header không che node) | PASS |

**Render output thật** (lưu để mở bằng mắt trong draw.io):
- `output/s2d-c4-container-synthetic.drawio` (10.032 bytes, 19 mxCells)
- `output/s2d-c4-container-ftgo-baseline.drawio` (24.908 bytes, 35 mxCells; scopeWarning: "Ownership unresolved for 1 element(s)…: localhost")
- Cả hai file **XML well-formed** (parse bằng ElementTree). Giới hạn: chưa mở trong draw.io editor/browser để duyệt hình — **XML test không được gọi là browser/editor acceptance**; phần xem bằng mắt để reviewer thực hiện trên 2 file này.

## 4. Lệnh thực chạy và kết quả

```
npm test          → tests 78 · pass 78 · fail 0   (sau vòng bổ sung review: +2 test)
npm run typecheck → sạch
MAVIS_NEXT_DIST_DIR=.artifacts/next-build-s2d npx next build → SUCCESS
node .artifacts/render-s2d.cjs → 2 file .drawio đã render + validate XML
```

File generated do build đụng (`next-env.d.ts`, `tsconfig.json`) đã khôi phục.

## 5. Trạng thái tiến độ (theo yêu cầu)

- **UC-02: ĐÃ ĐÓNG ở projection frontend (S2c, đã nghiệm thu)** — reviewer chạy lại FE 74/74 + typecheck. **UC-01 vẫn mở**.
- **S2b browser acceptance: VẪN MỞ**.
- **Java 219 (0 fail, 12 skip)**: **kết quả historical của S2a** — S2b có BỔ SUNG ca test Java nhưng không có thay đổi production backend nào sau S2a; đã ghi chú trong S2a report.
- S2c: đã nghiệm thu (đã cập nhật report).
- S2d: **đang bổ sung theo review — chưa nghiệm thu cuối**.
- **Không đánh dấu toàn bộ C4/S2/diagram hoàn thành** — phần còn lại của S2 (nhãn `[protocol]` trên cạnh C4, truncation notice, evidence count; C1 chuẩn hóa riêng) vẫn mở.

## 6. Bổ sung theo review — expected/actual

**Review điểm 1 — includedNodeIds trộn synthetic ID:**
- Expected: `projection.includedNodeIds` chỉ chứa ID phần tử nguồn; boundary giự trong layout nhưng liệt kê ở metadata view-local riêng.
- Actual (trước): `includedNodeIds` chứa `"system:boundary"` vì `document()` tính visible từ toàn bộ selectedNodes.
- Actual (sau khi sửa): `includedNodeIds` ⊆ source IDs (assert trong test), `syntheticNodeIds=["system:boundary"]` riêng, `systemBoundary` metadata đầy đủ (memberIds/unresolvedIds), omittedNodes/excludedNodes/membership giự chính xác, counts không tăng giả.

**Review điểm 2 — legend cao cố định 100 và boundary header dài:**
- Expected: legend/boundary header chứa được nội dung wrap không che node, không giảm font, không bỏ warning.
- Actual (trước): legend `height=100` cố định — reviewer tái hiện 17 dòng bị tràn; boundary header `startSize=44` cố định — tên dài có thể tràn ngang.
- Actual (sau khi sửa): legend height = số dòng wrap × 17 + 24 (test assert khớp); warning trong legend **tóm tắt** (3 tên + "+N more; full list in view metadata"), danh sách đầy đứ nằm ở `systemBoundary.unresolvedIds` + pack limitations; boundary header wrap 60 ký tự/dòng, `startSize = 24 + số dòng × 20`, ELK padding top tăng theo — test assert `startSize > 44` cho tên dài và **y của node con ≥ startSize** (header không che node).

## 7. Visual acceptance — ĐÃ THỰC HIỆN với 3 trường hợp (embed protocol chính thức)

**Cách nạp (theo hướng dẫn review, bỏ `#R` đang lỗi):** harness QA tại `MAVIS-Frontend/.artifacts/s2d-visual/index.html` (localhost-only, không dependency mới, không đụng auth) — iframe `http://127.0.0.1:8090/?embed=1&proto=json` (draw.io tự host đang chạy), chờ event `init`, gửi `action:"load"` với XML gốc từ `generateDrawio` production, sau đó gửi `action:"export", format:"png"` để nhận bằng chứng. HTTP server: `python -m http.server 8791 --bind 127.0.0.1 --directory .artifacts/s2d-visual`. Lỗi `atob` trước đó thuộc định dạng hash `#R` — đã bỏ, không tiếp tục đoán encoding.

**Kết quả từng case (XML nạp là output `generateDrawio` production, không có hình thay thế):**

| Case | Nguồn | Kích thước / cell (lần sinh mới nhất) | Quan sát bằng mắt | Export PNG |
|---|---|---|---|---|
| A — synthetic | `output/s2d-c4-container-synthetic.drawio` | 10.037 bytes (kích thước file thực) / 19 mxCells | Boundary "OrderHub <test> · Software system · analyzed source scope" đúng tên; orders-api + orders-db trong khung; "Payments & Billing <draft>" trong khung; kafka (unresolved) NGOÀI khung; legend có warning "kafka" | `output/s2d-visual/caseA-export.png` (372 KB base64) |
| B — FTGO baseline | `output/s2d-c4-container-ftgo-baseline.drawio` | 24.926 bytes (kích thước file thực) / 35 mxCells | Boundary "FTGO (baseline fixture) · Software system" wrap 2 dòng; **8 service trong khung** (XML: tất cả SERVICE_CONTAINER có `parent=boundary group`, tọa độ nằm trong 2144×483); `localhost` DB NGOÀI (baseline không khai báo resourceRole) + warning "localhost" trong legend | `output/s2d-visual/caseB-export.png` (593 KB base64) |
| C — tên dài + 8 unresolved (8 node đầu vào, 4 được chọn vào view do có cạnh — coverage giới hạn ở phần tử được chọn, 4 node còn lại là omitted) | `output/s2d-visual/caseC-long-names.drawio` (render lại từ fixture regression S2d) | 12.140 bytes (kích thước file thực) / 22 mxCells | Header tên dài tiếng Việt + `& < > "` wrap 2 dòng **không bị cắt, không đè node**; 2 service trong khung; 4 unresolved (Khách hàng A, Nhà cung cấp B, Kênh C, D) NGOÀI khung với HTTP call xuyên boundary nối đúng node; legend tóm tắt "+1 more; full list in view metadata" | `output/s2d-visual/caseC-export.png` (487 KB base64) |

- Cánh cross-boundary (case C: orders-api → 4 unresolved) nối đúng node, không nối nhầm vào khung; nhãn "HTTP call" đọc được ở zoom sử dụng.
- **Phân biệt lỗi**: lỗi nạp file (`#R` atob; fetch 404 khi harness copy sai thư mục — đã sửa) khác với lỗi layout/render — không phát hiện lỗi layout/render nào trong 3 case; không cần sửa renderer.
- **Visual acceptance: ĐÃ MỞ và ĐÃ QUAN SÁT được output thực** cho 3 case trên (screenshot từng case + PNG export lưu tại `output/s2d-visual/`). Phạm vi: viewer draw.io embed + export PNG của chính editor — chưa gồm browser E2E của màn hình ứng dụng (cần session đăng nhập, thuộc S2b browser acceptance vẫn mở).

Harness lệnh chạy lại: `cd MAVIS-Frontend/.artifacts/s2d-visual && python -m http.server 8791 --bind 127.0.0.1` rồi mở `http://127.0.0.1:8791/index.html?case=A|B|C`.

## 8. Giới hạn

- Visual đã kiểm trừ trên draw.io embed viewer + export PNG; chưa bao gồm editor round-trip (drag/save/load) thuộc quality plan P4.
- Mainflow path (nếu có màn hình khác dùng selectDiagram) chưa truyền `systemName` → boundary hiển thị fallback "Analyzed system" — trung thực, không sai thẩm quyền.
- `DATABASE` không khai báo `resourceRole` (baseline cũ) nằm ngoài boundary kèm warning — trung thực theo contract; khi model mới gắn role LOGICAL_DATASTORE, boundary tự chứa chúng.

## 9. Trạng thái và dừng tại đây

- **S2d: implementation đã được duyệt (reviewer chạy lại FE 78/78 + typecheck sạch); visual acceptance đã thực hiện và PASS cho 3 case trên** — chờ review xác nhận bằng chứng để nghiệm thu cuối.
- **UC-02 đã đóng ở projection frontend (S2c); UC-01 vẫn mở. S2b browser acceptance vẫn mở riêng.**
- **Không đánh dấu toàn bộ S2/C4/diagram hoàn thành** — phần còn lại của S2 (nhãn `[protocol]` trên cạnh C4, truncation notice, evidence count; C1 chuẩn hóa riêng) vẫn mở.