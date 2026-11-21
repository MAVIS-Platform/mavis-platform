# S2e — Protocol có nguồn trên nhãn messaging C4 Container

Ngày: 24/10/2026. Trạng thái: **đã được reviewer nghiệm thu trong phạm vi code + visual messaging C4 Container (24/10)** — giỡ nguyên giới hạn coverage: không gồm các loại quan hệ khác, không đổi quy Ư1c messaging. Sau nghiệm thu, M1 bổ sung test coverage tường minh cho protocol null/number/object/array (xem M1_C4_E2E_REPORT). Tiền đề: S2d đã nghiệm thu (implementation kiểm chứng; reviewer đã xem 3 PNG export và đối chiếu XML; browser E2E S2b + editor round-trip vẫn OPEN). Phạm vi: nhãn MESSAGE_PUBLISH/MESSAGE_SUBSCRIBE trong view C4/CONTAINER — bổ sung protocol khi MESSAGE_CHANNEL liên quan có `properties.protocol` hợp lệ. **Không** mở rộng sang loại quan hệ khác, không đổi chiều messaging (UC-01 vẫn mở), không đổi `edge.protocol` (vẫn mang relation kind), không backend/schema/renderer engine.

---

## 1. Quy tắc dữ liệu (đã triển khai)

`containerMessagingLabel(edge, nodesById)` trong `src/lib/drawio/rules.ts`:

- Chỉ áp dụng cho `MESSAGE_PUBLISH` / `MESSAGE_SUBSCRIBE`.
- Xác định MESSAGE_CHANNEL endpoint theo chiều hiện hành: publish → `to` (channel); subscribe → `from` (channel). **Không đổi chiều.**
- Protocol **chỉ** lấy từ `channel.properties.protocol`: string không blank → nhãn thành `"Declares publishing to [kafka]"` / `"Delivers messages to [kafka]"`; thiếu/null/blank/sai kiểu → **không bổ sung gì**.
- Không suy từ tên channel, `languageStack`, `transportAuthority`, relation kind hay default Kafka/RabbitMQ.
- Không đổi dữ liệu nguồn; `transportAuthority` vẫn là binding (đã test: có transportAuthority nhưng thiếu protocol → không dùng thay).

## 2. Triển khai tối thiểu — một helper dùng chung 2 chỗ

`generate.ts` thêm `labelText(edge)` — dùng chung cho **(a)** tính kích thước label ELK và **(b)** xuất label cell XML — nên text đo và text xuất không thể lệch nhau. Gate: chỉ gọi `containerMessagingLabel` khi `doc` là `C4/CONTAINER` (biến `systemBoundary` hiện hữu); các view/cạnh khác đi thẳng `relationLabel` — hành vi không đổi. `relationLabel` gốc và golden labels **giữ nguyên**; protocol chỉ là phần bổ sung sau nhãn hành động; escape XML thực hiện ở lớp xuất hiện hữu.

## 3. Kiểm chứng — production code thật (+2 test, suite 80/80)

Fixture: producer, consumer, 5 channel với các trạng thái protocol khác nhau; đi qua `selectDiagram` + `generateDrawio` thật:

| Ca | Expected | Actual |
|---|---|---|
| `properties.protocol="kafka"` | publish label `Declares publishing to&#xa;[kafka]`, subscribe label `Delivers messages to&#xa;[kafka]` (escape `&#xa;` đúng) | PASS |
| protocol `"Kafka & co <v3>"` | XML chứa `[Kafka &amp; co &lt;v3&gt;]`, không có bản unescaped | PASS |
| protocol thiếu / blank `"   "` | nhãn giữ nguyên hành động, không append | PASS |
| Channel tên `kafka-topic`, technology `Kafka`, `transportAuthority="kafka"` nhưng **không có** `properties.protocol` | **không** tự thêm `[Kafka]` | PASS |
| Sai kiểu (số/object) | không append (đã phủ bởi test missing/blank + helper typeof) | PASS |
| ID, endpoints, `originLayer`, `mavisRelationType` | giữ nguyên trong XML | PASS |
| Gate view: `DEPENDENCY_GRAPH/SERVICE` và `C4/COMPONENT` với cùng cạnh | nhãn **không** có `[kafka]`, giữ nhãn hành động | PASS |
| Kích thước label | đo và xuất dùng chung `labelText` → không thể lệch; layout chọn candidate theo geometry hiện hữu | PASS (assert text nhất quán giữa sizing và output) |

## 4. Kiểm tra trực quan (tái dùng harness embed đã hoạt động)

- `caseD-messaging-protocol.drawio` (8.427 bytes / 16 mxCells): channel `order-events` có `protocol="kafka"` → nhãn hiển thị **"Declares publishing to [kafka]"** và **"Delivers messages to [kafka]"**; `missing-channel` không protocol → nhãn thường. Screenshot + `output/s2d-visual/caseD-export.png` (284 KB base64).
- `caseE-messaging-no-protocol.drawio` (8.403 bytes / 16 mxCells): channel không có protocol → **tất cả nhãn plain**, không protocol bịa. `output/s2d-visual/caseE-export.png` (281 KB base64).
- Cả hai case nạp bằng draw.io embed protocol từ output `generateDrawio` production (không vẽ thay thế); file `.drawio` + PNG export lưu tại `output/s2d-visual/`.
- Không chạy lại analyzer/runtime; không thêm dependency.

## 5. Lệnh thực chạy và kết quả

```
npm test          → tests 80 · pass 80 · fail 0  (+2 test S2e)
npm run typecheck → sạch
node .artifacts/render-caseDE.cjs → caseD/caseE .drawio (8.427 / 8.403 bytes — kích thước file thực)
```

## 6. File đã thay đổi

| File | Thay đổi |
|---|---|
| `src/lib/drawio/rules.ts` | +`containerMessagingLabel` (quy tắc nguồn protocol) |
| `src/lib/drawio/generate.ts` | +`labelText` dùng chung (sizing + export), gate theo C4/CONTAINER |
| `tests/architecture.test.cjs` | +2 test S2e |
| `MAVIS-Frontend/.artifacts/s2d-visual/{index.html, caseD…, caseE…}` | Harness QA: thêm case D/E |
| `output/s2d-visual/caseD-messaging-protocol.drawio`, `caseE-messaging-no-protocol.drawio`, `caseD-export.png`, `caseE-export.png` | Bằng chứng visual |
| `README.md`, `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md`, `docs/S2D_C4_CONTAINER_BOUNDARY_REPORT_2026-10-24.md` | Đính chính theo mục 8 |
| `docs/S2E_MESSAGING_PROTOCOL_LABELS_REPORT_2026-10-24.md` | Báo cáo này |

## 7. Đính chính S2d (theo review)

- S2d: **implementation đã nghiệm thu; reviewer đã xem 3 PNG export và đối chiếu XML**; browser E2E S2b + editor round-trip vẫn OPEN.
- Case C: **8 node unresolved đầu vào — 4 được chọn vào view (có cạnh không-phải-deployment); 4 còn lại omitted**; coverage giới hạn ở phần tử được chọn (đã ghi vào bảng case C).
- Số byte file đổi thành **kích thước file thực** (10.037 / 24.926 / 12.140 bytes — trước đây dùng `s.length` đếm ký tự, không phải byte).
- Bảng chữ "Dừng tại đây" trùng lặp đã dọn ở lượt trước; kiểm tra lại không còn.

## 8. Trạng thái còn mở

- **UC-01** (chiều subscribe) vẫn mở — S2e không đổi quy ước messaging.
- **S2b browser acceptance** và **editor round-trip (P4)** vẫn mở.
- Protocol trên nhãn **chỉ áp dụng messaging trong C4 Container** — các loại quan hệ khác (HTTP call, database access…) vẫn chưa có `[protocol]` (thuộc phần còn lại của S2).
- **Không đánh dấu toàn bộ S2/C4/diagram hoàn thành**.

## 9. Dừng tại đây

S2e hoàn thành theo phạm vi. Chờ review; không tự tiếp tục sang lát cắt khác.
