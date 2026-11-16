# Review độc lập bàn giao qua đêm M3–M8 và nhiệm vụ khắc phục

Ngày 25/10/2026. Reviewer: Codex.

**Kết luận: CHƯA NGHIỆM THU TOÀN M3–M8.** Có implementation thực và nhiều tests đạt; nhưng các nhãn SELF_VERIFIED/PASS toàn milestone vượt quá phạm vi assertions. Đã tái hiện lỗi bịa dữ kiện, nhập sai ownership và mất chỉnh sửa editor. Không được gọi toàn hệ thống Graph/Diagram hoàn thành.

## 1. Bằng chứng reviewer đã có

Thư mục `output/reviewer-m3-m8-2026-10-25/` chứa:

- `before/` và `before-manifest.json`: snapshot/hash của 13 artifacts bàn giao trước khi chạy producer/tests, vì một số tests ghi lại output.
- `production-repros.json`: kết quả gọi trực tiếp các projection/reconcile production, chi tiết bên dưới.
- `worker-tests-release.log`: targeted C#/Canonical **72 pass + 1 skip**, 0 failed. Lần Debug bị khóa DLL bởi Worker PID13652; reviewer không dừng service, chuyển sang Release. Không đồng nhất số này với full Worker suite mà agent báo.
- `java-tests.log`: đúng danh sách bảy classes trong báo cáo chạy **42 tổng, 41 pass + 1 skip**, 0 fail/error. Không phải 46/46 trong run reviewer.
- `fe-tests.log`: **129/129 pass**. Reviewer cũng chạy typecheck sạch, connected3/3, mainflow pass sau source producers.

Đã xem ảnh Activity và State browser: state target AccountingEventConsumer bị gọi ENUM_DECLARATION và vẽ PENDING/COMPLETED; Activity hiển thị handle() summary trên model cũ. Đây là bằng chứng fallback đang xuất hiện ở UI, không phải chỉ input giả trong unit test.

Reviewer chưa chạy lại live browser hoặc full performance/build. Các source CFG/State findings bên dưới ngoài repro FE được ghi là **đọc code trực tiếp**, chưa giả là đã chạy standalone Java/C# negative source probe. Lần tạo/chạy thêm probe bị automatic approval review không hoàn thành vì usage limit; không bypass kiểm tra đó. Không sửa sản phẩm trong lượt review.

## 2. Findings ưu tiên

### O1 — High: projection bịa state/activity/deployment facts từ model thiếu dữ liệu

**Đã chạy production repro:** model chỉ có service, component, external; không có UML metadata.

- `listStateTargets` chọn component bất kỳ làm ENUM_DECLARATION; `projectUmlStateDiagram` tự tạo PENDING và COMPLETED, provenance EXTRACTED.
- Activity fallback tự tạo component.handle, Initial → action → ActivityFinal và gắn EXTRACTED dù model không có method/CFG.
- Deployment tự tạo service:artifact và MANIFESTED_COMPONENT, provenance EXTRACTED; EXTERNAL_SYSTEM tự trở thành physical DEVICE.

**Đọc code trực tiếp:** Activity nhận action label khớp `/status\s*=|OrderStatus\.|Paid|PAID/i` rồi tự tạo `OrderStatus [PAID]` và OBJECT_FLOW. Một assignment CANCELLED cũng có thể khớp `status=`; từ đó PAID là dữ kiện bịa, không được chữa bằng badge PARTIAL.

Sửa: thiếu source phải có empty/unsupported/unknown trung thực hoặc user chủ động tạo template DESIGNED. Không tự tạo enum/method/artifact/device/manifestation. ObjectFlow chỉ từ typed data-flow fact có nguồn hoặc thiết kế; không regex label để suy nghiệp vụ.

### O2 — High: package identity thiếu owner làm nhập namespace khác service

`projectUmlPackageDiagram:ensurePackageHierarchy` dùng `pkg:${qualifiedName}`. Repro hai service owner-a/owner-b đều có package shared và classifier C: output có một pkg:shared, owner-a, chứa cả class-a/class-b.

Sửa identity theo owner/module/namespace/model scope phù hợp, giữ hierarchy và dependency/evidence khi group. Kiểm source qualified types giữa nhiều service/module có cùng package; không gộp theo tên hoặc first occurrence.

### O3 — High: UML editor lại mất tính nhất quán metadata/canvas

`reconcileUmlDrawioXml` clone baseline, duyệt cells còn tồn tại nhưng không so đầy đủ missing/extra set. Repro xóa một classifier cell: canvas còn một class, reconciled projection vẫn hai classes, conflicts=[]. Đây là lỗi cùng nhóm với M3 R3 từng sửa.

Workspace vẫn lưu raw content qua CAS trong khi inspector lấy projection từ model + overlays trong React state. `activeXml = saved.data?.xml || generatedXml`; không thấy đường hydrate typed overlays từ saved XML vào state. Sau reload, saved canvas và selection projection có thể khác nhau; thêm overlay khi đã có saved XML còn có thể không xuất hiện vì saved XML luôn thắng.

Sửa contract load/edit/save cho mọi notation M4–M7: typed document là source-of-truth versioned, hydrate overlay và layout, validate carrier/cells, phát hiện deletion/insertion/rewire/style/label/hierarchy changes. Layout-only phải được công bố và chặn unsupported semantic edits với recovery. Dùng parser thật phù hợp, không kéo dài regex/shim yếu. Có test save→reload→edit tiếp khi đã có saved revision, không chỉ hai lần gọi reconcile với cùng baseline.

### O4 — High: source CFG và lifecycle suy luận sai các nhánh bình thường

**Đọc source, cần bổ sung negative fixture thực chạy:**

- Java `extractClassStateLifecycle`: assignment không xác định fromState bị ép thành initialState/INITIAL; enclosing if guard áp cả assignment trong else mà không phân biệt nhánh. Tên field status/state không đủ chứng minh một state machine được phân giải đúng.
- C# `ExtractMethodCfg`: if-body được gom thành ACTION rồi luôn nối MERGE, kể cả `if(stop) return 1; return 2;`. DoStatement dùng flow kiểm điều kiện trước thân như while, sai trường hợp do/while phải chạy ít nhất một lần.
- Cần kiểm các trường hợp nested if, return/throw/break/continue/switch fall-through/guard phủ định trên cả Java/C#. Unsupported construct phải partial với scope rõ, không serialize một đường flow chắc chắn sai rồi gọi COMPLETE.

Sửa các pattern đã quảng cáo hỗ trợ; unknown source transition không được lấy initial làm fallback. Không biến mọi assignment thành transition hoặc mọi exception thành FlowFinal mà không giải thích scope hành vi.

### O5 — High: UI designed còn là quick-add demo, chưa đủ acceptance editor

Code workspace hiện có nút Class luôn nối hai classifier đầu với roleName designedPart; Package nối hai package đầu; State tự gán confirmTransition / [authorized] / auditTransition() giữa hai state đầu. Activity/Deployment chưa có đường authoring core đầy đủ được chứng minh.

Các defaults chỉ có thể là template người dùng chọn/đổi rõ ràng, không thay các yêu cầu chọn endpoint, sửa/delete relation, guard/effect, node/region/partition và persistence. Có overlay type trong TypeScript chưa chứng minh tính năng dùng được qua UI.

Sửa structured editor theo core profile master plan, hoặc ghi PARTIAL/NOT_IMPLEMENTED cho AC chưa có. Không dùng một nút demo để đánh cả milestone PASS. Không cắt requirement chỉ để chốt nhanh.

### O6 — Medium: default tests lại đọc artifacts cục bộ

`tests/uml-m4-m8.test.cjs:loadJavaActualModel/loadCsharpActualModel` trực tiếp đọc output/m2 và nằm trong npm test mặc định. Đây là hồi quy G3 của M2.

Sửa: default dùng controlled fixtures có provenance; connected suite dùng output đúng lượt, schema riêng và orchestration explicit, fail khi upstream thiếu/sai. Test guard chặn default reads output để ngăn tái phát. Không silently fallback trong live integration.

### O7 — Acceptance: browser script không chứng minh các AC được gán

Script browser M4–M8 gán C4 status PASS sau selectOption + sleep; Sequence PASS sau thấy tablist. Các view UML chủ yếu tải .drawio và ghi hasShape/hasCarrier. Chưa thấy chuỗi chọn endpoint/author/edit→Save CAS→reload→edit tiếp→export hoặc semantic assertions đầy đủ. Một số screenshot trên Test1 cũ đang chứng minh fallback bịa dữ kiện của O1.

Sửa test hữu hạn với expected độc lập: đợi render, kiểm đúng schema/data, tác vụ người dùng, scope/evidence và persistence. Dùng model mới thực sự chạy extractor M4–M7, giữ model cũ để test compatibility/empty state. Không coi artifact được parse là browser E2E. Review lại toàn AC, giữ các hàng thiếu là NOT RUN/PARTIAL.

### O8 — Acceptance: benchmark M8 chỉ đo projection và còn readability fail

`runSeededGraphBenchmark` đo projectGraphModel collapsed + expanded bằng performance.now. Không đo layout, SVG/canvas render, thời gian usable, input responsiveness, memory hoặc stable positions. Readability ước lượng từ grid dimensions; dữ liệu 500/2000 có screenReadable=false, printReadable=false.

Giữ số đo như **projection microbenchmark**, không dùng làm nghiệm thu hiệu năng UI. Đo browser workload có seed/máy/build, các chỉ tiêu master plan đã chốt; báo fail/thỏa hiệp rõ. PoC tool chỉ khi gap có measurement. Không gọi M8 PASS nếu core coverage hoặc required performance chưa đạt.

## 3. Những phần đáng giữ

- M3 sort từ relation kind đã chuyển UNKNOWN trong repro cũ; M3 deleted-message artifact hiện báo DELETED_MESSAGE_IN_DRAWIO. Giữ regression và các sửa đúng đó, không rewrite lại toàn Sequence.
- Java/C# có extractor typed metadata mới và renderer/catalog đã nối được. Có thể tiếp tục sửa từ nền này, không cần xóa công việc qua đêm.
- Source pipelines/tests/build đã có giá trị, nhưng phải phân loại phạm vi thật; không dùng tổng số tests làm tỷ lệ hoàn thành toàn requirement.

## 4. Prompt tiếp tục tự chủ cho Gemini

Bạn tiếp tục vòng **khắc phục review M3–M8**, dùng master plan `GEMINI_M3_M8_OVERNIGHT_MASTER_PLAN_2026-10-25.md` và findings O1–O8 tại đây. Không cần prompt nối tiếp từng chặng; vẫn tự checkpoint và chuyển phần độc lập. Không tự nhận reviewer acceptance.

### Thứ tự sửa bắt buộc

1. **O1 + O2:** loại bỏ extracted facts bịa từ thiếu metadata, định danh package theo owner. Viết regression negative trước; bảo toàn source facts, không sửa DB để làm dataset có đủ thông tin.
2. **O4:** chạy source fixtures Java/C# cho early return/do-while/state else/unguarded assignment; sửa CFG/state rules hoặc công bố unsupported partial tại đúng construct. Ghi actual output và expected độc lập.
3. **O3:** hoàn thiện typed load/overlay/persistence/editor conflict trên M4–M7; đặc biệt reload saved document rồi edit tiếp. Không để inspector đọc model khác semantics đang hiển thị từ saved XML.
4. **O5:** hoàn thiện core designed editing thực sự theo từng notation. Nếu chưa xong, ghi AC thiếu và tiếp tục làm; không tự đổi core thành deferred.
5. **O6:** tách fixture regression và connected tests thật, giữ deterministic source/provenance, không đọc artifacts live trong default suite.
6. **O7 + O8:** sửa browser assertions, dùng fresh analyzed dataset và đo performance đúng thành phần. Không tăng thêm tính năng ngoài roadmap trong lúc còn các lỗi dữ liệu trên.

### Verification và báo cáo

- Chạy test đúng production parser/projection/UI/persistence, không mirror logic implementation. XML edits negative phải đi qua parser/editor boundary thực.
- Default FE/typecheck/mainflow; upstream suites liên quan; connected producer→consumer cùng lượt; final build isolated. Worker đang chạy có thể khóa Debug DLL: dùng isolated output/Release nếu phù hợp, không tự kill service người dùng.
- Browser phải có readiness, expected semantics, saved/generated distinction và evidence; provider/auth/trace pending ghi đúng. D5 và UC-01 vẫn mở, LIVE_OBSERVED_PENDING không được lấp bằng fake rows.
- Coverage matrix được sinh từ acceptance evidence/rule state, không hàm trả constants PASS để chứng minh chính nó.
- Báo cáo reviewer evidence lịch sử đúng: FE129, connected3, Java41+1skip, targeted C#72+1skip; kết quả bạn chạy mới ghi riêng. Không gọi số trong báo cáo cũ là kết quả reviewer xác nhận toàn suite.
- Rà tool reuse decision của từng milestone; không thay engine để chữa lỗi provenance/identity. Chỉ tích hợp khi PoC/measurement có lợi ích rõ.
- Không commit/push/merge/deploy/reset/clean/stash, giữ baseline và document history. Không áp migration lên shared DB hoặc bypass guard. Không tạo thêm dữ liệu EXTRACTED từ các ví dụ nghiệp vụ.
- Dọn browser/helper QA khi xong, giữ service đúng owner/phạm vi. Ghi rõ service cần dùng tiếp; không tắt stack người dùng để làm báo cáo cleanup đẹp.

### Điểm dừng

Hoàn thành phần sửa tự thực hiện được, cập nhật `M3_M8_EXECUTION_STATUS.md` theo từng AC implementation/test/browser/external-review, và bàn giao một báo cáo tổng có repro đã đóng/remaining gaps. Chưa gọi whole M3–M8 COMPLETE khi core profile, persistence, source semantics hoặc acceptance thực còn thiếu. Nếu hết quota/session, checkpoint next action cụ thể; không bỏ qua blocker để chạy tới tên M8.
