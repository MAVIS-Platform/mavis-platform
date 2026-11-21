# S2b — Bảo toàn và hiển thị metadata node từ Graph API trên frontend

Ngày: 24/10/2026. Trạng thái: **đã được review — duyệt về implementation (reviewer chạy lại FE 74/74 pass và typecheck sạch); browser acceptance còn mở**. UC-01/UC-02: UC-02 đã được giải quyết ở projection bởi S2c (xem S2C report); UC-01 vẫn mở. Phạm vi: adapter `modelView` + panel node/3E hiện hữu. **Không** sửa nhãn cạnh C4, layout, renderer, 3E explanation logic, chiều messaging, aggregate status, migration/schema, Worker/Runner, dependency.

---

## 1. Adapter (`src/lib/api/java-wire.ts:modelView`)

**Đường dữ liệu đã kiểm chứng**: Graph API → `java-operations.ts:model()` (fetch `analyzer/models/{id}` + `/graph` + `/elements`) → `modelView(metadata, graph, details)` → `ArchitecturalModel` → `projectGraphModel` → `SelectionThreeE`.

- Graph node schema nhận thêm `protocol`/`transportAuthority`/`resolutionIssue` dạng `z.unknown()` — **lenient có chủ đích**: giá trị sai kiểu từ backend cũ/lỗi không làm hỏng toàn bộ graph mà được chuẩn hóa thành null (mirror đúng quy tắc server-side của S2a "trả null, không làm hỏng response").
- Helper `resolveNodeMetadata(graphValue, detailValue)` — precedence ghi rõ:
  1. **Graph field hiện diện, string không rỗng** → dùng giá trị đã chuẩn hóa từ graph (ưu tiên cao nhất).
  2. **Graph explicit null** → `null` ("chưa biết"), **không fallback** sang detail — ngăn giá trị cũ trong detail.properties lộ lên khi backend chủ động nói không có dữ kiện.
  3. **Graph field vắng mặt** (undefined — backend cũ chưa có 3 field) → fallback `detail.properties[key]` **chỉ khi** là string không rỗng (hỗ trợ backend cũ).
  4. Blank string (cả hai nguồn) / sai kiểu → `null`, không bao giờ thành giá trị hiển thị.
- Merge vào **properties node hiện hữu**: `properties: {...detailProps, protocol, transportAuthority, resolutionIssue}` — 3 key luôn được set tường minh (string|null) để giá trị detail cũ không lộ khi graph null; **không tạo bản sao metadata riêng**; các properties khác, `parentId`, ID, evidence giữ nguyên (spread + không đụng các field khác).
- **Giữ nguyên**: `edge.protocol` vẫn mang relation kind (không đổi vocabulary); `technology` vẫn chỉ từ `detail.languageStack` — **không gán protocol vào technology**.

## 2. Hiển thị (`src/features/architecture/selection-three-e.tsx`)

- Helper `nodeMetadataRows(node)`: đọc 3 key từ `node.properties`, chỉ nhận string không rỗng; nhãn: **Protocol** / **Transport binding** / **Vấn đề phân giải của node** (diễn đạt rõ đây là vấn đề phân giải của node, không phải trạng thái cạnh).
- Khối `<dl>` trong vùng summary của panel — **chỉ render khi có ít nhất một giá trị**; node không metadata hoặc đang chọn cạnh → không có khối.
- **Text rendering an toàn**: React escape mặc định (render qua `{value}`, không dùng HTML injection); `break-words` + `min-w-0` cho chuỗi dài không tràn panel.
- Không coi `transportAuthority` là địa chỉ endpoint (nhãn chỉ nói "binding"); không tự bổ sung Kafka/JDBC/HTTP khi thiếu dữ kiện; không đụng 3E explanation logic.

## 3. Kiểm chứng — test gọi adapter/projection production thật

**`tests/java-contract.test.cjs`** (+2 test, gọi `wire.modelView` thật):

| Ca | Expected | Actual |
|---|---|---|
| Graph có metadata, detail có giá trị khác | graph thắng (kafka ≠ detail-kafka) | PASS |
| Graph explicit null + detail có giá trị cũ | null thắng, detail không lộ | PASS |
| Backend cũ (graph vắng field) | fallback detail.properties | PASS |
| Blank string / number / object / array | null, không thành giá trị hiển thị | PASS |
| Properties khác (`other`), ID, elementType, parentId, evidence | bảo toàn nguyên vẹn | PASS |

**`tests/edge-semantics.test.cjs`** (+1 test): metadata còn đúng sau `projectGraphModel` (showComponents=true) — channel giữ protocol/transportAuthority, node thường có null.

**Java (bàn giao S2a)**: thêm ca `metadataJsonNullObjectArrayAndWhitespaceBecomeNullValidTextPreserved` — JSON null, object, array, whitespace-only → null; **chuỗi hợp lệ `"kafka "` giữ nguyên không trim**.

**Panel (node đủ dữ kiện / unresolved / không metadata)**: hiển thị được kiểm chứng ở mức adapter + build; **browser check chưa thực hiện được** vì trang architecture yêu cầu session đăng nhập thật (không có credential trong phiên; mock mode không trả metadata mới). Đây **không phải browser acceptance** — cần người có tài khoản mở màn hình Architecture Graph Explorer, chọn một MESSAGE_CHANNEL của model có messaging để xác nhận khối hiển thị.

## 4. Lệnh thực chạy và kết quả

```
./mvnw.cmd -pl mavis-analyzer -am -Dtest=GraphServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false \
  -Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true test
  → GraphServiceImplTest: Tests run: 12, Failures: 0 (thêm 1 ca mới) — BUILD SUCCESS

npm test          → tests 74 · pass 74 · fail 0  (71 cũ + 2 java-contract + 1 edge-semantics)
npm run typecheck → sạch (sửa 1 lỗi TS: spread làm mất index signature — đã ép kiểu Record<string, unknown>)
npx next build    → SUCCESS (MAVIS_NEXT_DIST_DIR=.artifacts/next-build-s2b, không đụng .next tracked)
```

Không có bước nào bị chặn hay bỏ qua. File generated (`next-env.d.ts`, `tsconfig.json`) do build đụng đã được khôi phục.

## 5. File đã thay đổi

| File | Thay đổi |
|---|---|
| `MAVIS-Frontend/src/lib/api/java-wire.ts` | Adapter: 3 field `z.unknown()` + `resolveNodeMetadata` precedence + merge vào properties |
| `MAVIS-Frontend/src/features/architecture/selection-three-e.tsx` | Panel: `nodeMetadataRows` + khối `<dl>` có điều kiện |
| `MAVIS-Frontend/tests/java-contract.test.cjs` | +2 test precedence/safety |
| `MAVIS-Frontend/tests/edge-semantics.test.cjs` | +1 test projection preservation; UC-02 test đổi tên characterization (bàn giao S1a) |
| `MAVIS-Platform/.../GraphServiceImplTest.java` | +1 ca null/object/array/whitespace/chuỗi giữ nguyên (bàn giao S2a) |
| `MAVIS-Frontend/README.md` | Sửa link `../docs/`; bổ sung đoạn S2b (API + adapter + panel; giới hạn Java cũ) |
| `docs/S2A_GRAPH_METADATA_REPORT_2026-10-24.md` | Trạng thái: đã review duyệt implementation; serialization ghi rõ mapper mặc định, chưa xác nhận HTTP runtime |
| `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` | S2: trạng thái S2a (duyệt) + S2b (triển khai) |
| `docs/S2B_NODE_METADATA_DISPLAY_REPORT_2026-10-24.md` | Báo cáo này |

Chưa commit — chờ review. Giữ nguyên các thay đổi ngoài task.

## 6. Đã đạt / giới hạn

**Đã đạt**: metadata đi trọn đường Graph API → adapter → domain → projection → panel với precedence tường minh; các trạng thái unknown/null/legacy đều trung thực; không mất properties/ID/evidence; không đụng vocabulary, edge.protocol, technology, nhãn C4, layout, renderer, 3E logic.

**Giới hạn — không tuyên bố quá bằng chứng**:
- Browser acceptance chưa thực hiện (cần session đăng nhập) — **vẫn mở**; test adapter/projection **không** được tính là browser acceptance.
- FE hiển thị trên backend có S2a; **backend cũ vắng field mới vẫn có thể hiển thị metadata hợp lệ từ detail.properties (fallback precedence) — khối chỉ ẩn khi không còn giá trị hợp lệ nào**.
- UC-01 (chiều subscribe) **vẫn mở**; UC-02 (aggregate resolutionStatus) đã được giải quyết ở projection bởi **S2c** — không thuộc S2b.
- **Không đánh dấu toàn bộ S2 hoặc hệ thống diagram hoàn thành** — phần còn lại của S2 (nhãn `[protocol]` trên cạnh, System Boundary frame, truncation notice, evidence count) vẫn mở.

## 7. Dừng tại đây

S2b hoàn thành theo phạm vi. Chờ review; không tự tiếp tục sang lát cắt khác.
