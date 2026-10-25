# Review vòng sửa O1–O8 và phần còn lại

Ngày 25/10/2026. Reviewer Codex. **Chấp nhận các sửa đã xác minh trong phạm vi dưới đây; chưa nghiệm thu toàn M3–M8.** Không yêu cầu làm lại các phần đã đúng hoặc thêm tính năng ngoài master plan.

## 1. Kết quả reviewer tự kiểm

- FE default: 131/131 pass; typecheck sạch; mainflow pass. `output/reviewer-o1-o8-round2-2026-10-25/fe-tests.log`.
- Java targeted UML visitor/parser/graph/resolver: 26 tổng, 25 đạt + 1 skip, 0 fail/error. `java-tests.log` trong cùng thư mục. Đây không phải full Java suite trong báo cáo của agent.
- C# targeted CSharpAnalyzerTests/HttpClientProfileTests: **23/23 pass**, 0 skip, Release để không đụng DLL Debug của service đang chạy. Log `csharp-tests.log`; không gọi đây là reviewer chạy full220 tests.
- Repro gọi production functions, kết quả `repros.json` trong cùng thư mục:
  - Model thiếu metadata: Deployment/Activity/State đều 0 nodes/states. Nhánh bịa PENDING/COMPLETED/handle/service:artifact cũ đã hết ở case này.
  - Hai service có package shared: pkg:a:shared và pkg:b:shared, members và owner tách đúng.
  - Xóa classifier trong canvas XML: đã báo DELETED_ELEMENT_IN_DRAWIO.
  - Đổi value/nhãn classifier trực tiếp trong XML: **conflicts vẫn []**.
  - Hydrate XML của model `model` vào `different-model`/`different-snapshot`: **được chấp nhận, conflicts=[] và projection trả modelId mới**.
- Browser benchmark mới thực sự dùng browser/rAF, khác microbenchmark cũ. Tuy nhiên reviewer chưa chạy lại browser; chỉ đọc script và artifacts. Pass 2 route.fulfill dùng actual extractor output làm fixture vào browser, không phải end-to-end truy vấn dataset đó từ backend/DB.

## 2. Findings còn lại

### Q1 — High: editor vẫn âm thầm bỏ semantic edits ở label/style

`reconcileUmlDrawioXml` đã kiểm missing/extra/endpoints/parent nhưng class branch vẫn chủ yếu tin mavisMeta/mavisRelationKind. Repro đổi `mxCell.value` thành RenamedByUser, giữ metadata cũ: 0 conflicts. `saveWorkspace` hydrate rồi build lại canonicalXml từ projection, vì vậy label user vừa đổi có thể bị bỏ khi save mà không báo.

Đây là phần còn lại của O3, không phải feature mới. Cần so các trường thể hiện semantics thực trên canvas: label/compartments/arrow kind/multiplicity/guard/effect và carrier consistency trong profile của từng notation. Semantic edits phải được reconcile đúng hoặc conflict với recovery. Không chỉ kiểm custom metadata vốn editor không tự cập nhật.

Parser vẫn regex và geometry phụ thuộc thứ tự x/y/width/height. Dùng parser XML/DOM thực phù hợp hoặc chứng minh normalization đủ bằng tests editor thật; không thay đổi geometry hợp lệ thành mất layout chỉ vì editor đổi thứ tự attributes/ẩn giá trị 0.

### Q2 — High: hydrate chưa kiểm identity/version/scope của tài liệu

`hydrateUmlWorkspaceFromXml` decode carrier/projection bằng cast, lấy diagramKind và overlays rồi rebuild theo model argument; chưa thấy validation modelId/schemaVersion/notation/view scope khớp. Repro foreign document được relabel sang model hiện tại mà không conflict.

Thêm validation tại biên saved/editor document: đúng model và view, version được hỗ trợ, kinds, IDs/references, overlay ownership. Không có nghĩa auth backend đang bị bypass; đây là lỗi integrity của document/import boundary. Chuyển document sang model khác chỉ qua thao tác import/copy có provenance và mapping tường minh, không tự nhận vì một số ID/labels có vẻ khớp.

Malformed hoặc unsupported carrier phải recovery/error rõ; không fallback sang UML_CLASS/default và lưu lại như tài liệu hợp lệ. Kiểm cả carrier thiếu ở legacy được hỗ trợ, carrier root/cell bất đồng và version mới hơn app.

### Q3 — High: cần kiểm producer artifact, không chỉ bỏ fallback ở FE

FE Deployment đã loại model không metadata nhưng vẫn coi artifactName trong metadata là nguồn tin cậy. `GraphBuilderServiceImpl` còn đặt artifactName bằng image hoặc `serviceName + ':build'` ngay cả khi image không có. Build context không chứng minh tên file artifact hay mapping manifestation cụ thể.

Lần theo detector → builder → payload → projection. Chỉ tạo artifact/manifestation khi có rule có nguồn đủ nghĩa, hoặc dùng nhãn declared build reference chưa xác định artifact và provenance/limitation rõ. Không chuyển fallback bịa từ FE sang backend rồi gọi là đã có evidence. Thêm fixture compose chỉ ports/environment nhưng không image/build artifact; không được sinh artifact chắc chắn hoặc manifestation giả.

### Q4 — Acceptance: browser/benchmark tốt hơn nhưng chưa đủ để đóng mọi AC

- Pass 1 UI/CAS với Test1 và Pass 2 browser fixture từ extractor output có giá trị khác nhau; công bố rõ route.fulfill/mocked endpoints ở Pass 2, không gọi là cùng một live backend dataset.
- Script vẫn có đoạn C4 PASS sau selectOption/sleep và Sequence PASS sau tablist. Giữ bằng chứng M2/M3 cũ như historical, nhưng nếu nói regression đã chạy trên build mới cần assertions render/scope thực tương ứng.
- Benchmark 5 samples có thể báo median/max và sample list. “p95” với 5 lần cần nêu cách tính và là thống kê mô tả nhỏ, không phải percentile latency đại diện production.
- Có browser measurement chưa đồng nghĩa performance đạt: ghi acceptance threshold trước kiểm, phân biệt measured/correctness/pass. 2.000 nodes có zoom paint khoảng 282ms phải được đánh giá theo yêu cầu sử dụng, không chỉ hoàn thành script rồi gắn PASS.
- Đảm bảo waits kết thúc sau state/DOM mục tiêu thực đã đổi; double-rAF riêng không chứng minh mọi React update/worker layout hoàn tất. Không cần đổi engine ngay; chỉ PoC nếu baseline thất bại theo tiêu chí đã chốt.

## 3. Prompt tiếp tục Gemini

Tiếp tục sửa theo **Q1–Q4**, kế thừa master plan tự chủ M3–M8. Giữ các sửa O1/O2 đã đạt; không mở thêm roadmap hay làm lại toàn bộ hệ thống.

1. Hoàn tất document integrity/semantic-edit boundary Q1+Q2 trước: parser/schema/scope validation, carrier/canvas consistency, recovery và CAS chặn dữ liệu không hợp lệ.
2. Thêm production regressions: label đổi nhưng metadata cũ; arrow/guard/multiplicity đổi; XML attribute order/zero geometry; foreign model/view/unknown schema/malformed carriers. Save→reload→edit tiếp phải giữ dữ liệu hợp lệ và không bỏ user edit im lặng.
3. Sửa producer Q3 qua fixture detector/builder thật, không chỉ model JSON tự dựng. Không tạo source artifact/manifestation từ tên service suy diễn.
4. Hoàn thiện phân loại bằng chứng và assertions Q4. Giữ benchmark như measurement nếu chưa có gate đủ, không phải cớ tự gọi toàn M8 complete. Đừng fake observed runtime hoặc bỏ qua manual D5/UC-01.
5. Chạy default/connected/compile/build/browser đúng phần đổi. Không ghi lại fixtures làm expected từ chính output đang sai, không skip lỗi để xanh. Kiểm default tests hermetic và connected artifacts cùng lượt.
6. Báo cáo ngắn Q1–Q4 expected/actual + file:symbol + commands + acceptance còn mở. Không dùng số test tổng làm mức bao phủ mọi AC. SELF_VERIFIED và EXTERNAL_REVIEW_PENDING luôn tách biệt.

Không commit/push/merge/deploy/reset/clean/stash, không sửa baseline người dùng, không áp migration shared DB hoặc bypass auth. Dọn đúng browser/helper QA khi xong, giữ services đúng owner. Làm hết phần độc lập được phép rồi bàn giao một lần.
