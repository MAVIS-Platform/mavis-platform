# S2c — Làm rõ và sửa resolutionStatus cấp cạnh gộp (projection)

Ngày: 24/10/2026. Trạng thái: **đã nghiệm thu (reviewer chạy lại FE 74/74 pass và typecheck sạch); UC-02 đóng trong phạm vi projection frontend; UC-01 và browser acceptance S2b vẫn mở**. Phạm vi: **chỉ `projectGraphModel` aggregation trong frontend** — không backend/schema/migration/Worker/Runner, không thư viện mới, không layout/editor/C4 styling, không đổi group key/filter/collapse/renderer, không đổi hướng messaging hay originLayer, không thêm enum MIXED vào API/DB.

---

## 1. Contract đã chốt và triển khai

Tại phần aggregation của `src/features/architecture/graph-projection.ts` (điểm duy nhất bị sửa):

1. **Chuẩn hóa**: `normalizeResolutionStatus` — thiếu (undefined) hoặc rỗng/chỉ khoảng trắng → `"UNKNOWN"`; giá trị khác giữ nguyên (không tự uppercase, không đổi từ vựng).
2. **Nhóm cùng trạng thái** (sau chuẩn hóa): giữ nguyên trạng thái đó — `RESOLVED+RESOLVED → RESOLVED`, `UNRESOLVED+UNRESOLVED → UNRESOLVED`.
3. **Nhiều trạng thái khác nhau trong nhóm**: nhóm báo `"UNKNOWN"` — nghĩa là *"chưa thể biểu diễn bằng một trạng thái thống nhất"*, **không** nghĩa là *"mọi cạnh gốc đều UNKNOWN"*.
4. **`uncertain` giữ OR** hiện hữu; **`underlyingEdgeIds` giữ đầy đủ**.
5. **Không chọn trạng thái theo cạnh đầu, ID, tên hay thứ tự đầu vào** — trạng thái nhóm được so sánh theo tập trạng thái đã chuẩn hóa của mọi cạnh trong nhóm.
6. **Không sửa trạng thái cạnh nguồn hay dữ liệu lưu trữ** — chỉ projected output; không có enum MIXED; `resolutionStatus` vẫn là string.

**Không tuyên bố** toàn bộ projected object bất biến theo thứ tự — bảo đảm chỉ `resolutionStatus`, `uncertain` và tập ID gốc của nhóm gộp.

## 2. Regression tests — thay characterization UC-02 bằng assertion contract

Xóa characterization test cũ (không còn assertion nào buộc production tái hiện lỗi cũ); thay bằng test `aggregate resolutionStatus follows the S2c contract regardless of input order` với **expected là literal trong test** (không đọc từ output production, không sửa fixture để che failure). Các ca:

| Ca | Expected | Actual |
|---|---|---|
| RESOLVED + RESOLVED | RESOLVED | PASS |
| UNRESOLVED + UNRESOLVED | UNRESOLVED | PASS |
| RESOLVED + UNRESOLVED (cả 2 thứ tự) | UNKNOWN + đủ `underlyingEdgeIds` + uncertain=true | PASS |
| RESOLVED + thiếu trạng thái (cả 2 thứ tự) | UNKNOWN | PASS |
| Tất cả thiếu trạng thái | UNKNOWN (uncertain=false giữ) | PASS |
| 3 cạnh (RESOLVED/UNRESOLVED/thiếu) × 3 thứ tự | UNKNOWN, cùng tập ID gốc, uncertain=true | PASS |
| Nhóm khác originLayer vẫn tách biệt | không đổi (test aggregation hiện hữu, mở rộng assert status theo answerKey) | PASS |
| uncertain OR + ID gốc | giữ nguyên | PASS |

Fixture (`edge-semantics-contract.json`): `answerKey.aggregatedGroups` bổ sung expected `resolutionStatus` (nhóm mixed → `"UNKNOWN"`, nhóm đơn → `"RESOLVED"`); UC-02 chuyển từ `unresolvedContradictions` sang `resolvedContracts` với scope ghi rõ. **Consumer `resolutionStatus` đã rà**: `components.tsx:246` hiển thị "Resolution: {status ?? unknown}" — trung thực, không có nơi nào diễn đạt UNKNOWN thành "mọi cạnh gốc chưa phân giải", không cần sửa wording.

## 3. Lệnh thực chạy và kết quả

```
npm test          → tests 74 · pass 74 · fail 0
npm run typecheck → sạch
```

(Java không đụng trong S2c — không chạy lại; backend regression 219 từ S2a vẫn giữ giá trị vì không có thay đổi Java nào sau đó.)

## 4. File đã thay đổi

| File | Thay đổi |
|---|---|
| `MAVIS-Frontend/src/features/architecture/graph-projection.ts` | `normalizeResolutionStatus` + logic aggregate theo contract (điểm duy nhất) |
| `MAVIS-Frontend/tests/edge-semantics.test.cjs` | Thay UC-02 characterization bằng contract test; test aggregation assert thêm status |
| `MAVIS-Frontend/tests/fixtures/edge-semantics-contract.json` | answerKey + expected aggregate status; UC-02 → `resolvedContracts` |
| `MAVIS-Frontend/README.md` | Sửa wording backend cũ (bàn giao S2b): fallback detail.properties vẫn hiển thị; ẩn khối chỉ khi không còn giá trị hợp lệ |
| `docs/S2B_NODE_METADATA_DISPLAY_REPORT_2026-10-24.md` | Trạng thái reviewed (browser OPEN) + sửa wording backend cũ |
| `docs/S1A_EDGE_SEMANTICS_REPORT_2026-10-24.md` | UC-02 chuyển thành đã giải quyết ở projection (R4b + known issues) |
| `docs/DIAGRAM_STANDARD_GAP_REVIEW_2026-10-24.md` | S2: S2b reviewed (browser mở), S2c triển khai; UC-02 resolved, UC-01 mở |
| `docs/S2C_AGGREGATE_RESOLUTION_REPORT_2026-10-24.md` | Báo cáo này |

Chưa commit — chờ review. Giữ nguyên các thay đổi ngoài task.

## 5. Giới hạn và trạng thái còn mở

- **UC-01 (chiều MESSAGE_SUBSCRIBE) vẫn mở** — contract S2c không đóng UC-01.
- Contract chỉ áp dụng **projection frontend**; dữ liệu lưu trữ và API không đổi.
- Browser acceptance của S2b vẫn mở (không thuộc S2c).
- Phần còn lại của S2 (nhãn `[protocol]` trên cạnh, System Boundary frame, truncation notice, evidence count) vẫn mở — **không đánh dấu S2 hay hệ thống diagram hoàn thành**.

## 6. Dừng tại đây

S2c hoàn thành theo phạm vi. Chờ review; không tự tiếp tục sang lát cắt khác.
