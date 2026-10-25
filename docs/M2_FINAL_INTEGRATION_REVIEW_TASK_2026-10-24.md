# Review M2 vòng bổ sung và task hoàn thiện tích hợp

Ngày 24/10/2026. Reviewer Codex. Trạng thái: **đạt các unit regression đã chạy, chưa nghiệm thu M2 ở mức sản phẩm**. Chưa giao code M3.

## 1. Kết quả đã xác minh độc lập

- FE 109/109 test pass; typecheck exit 0. Log `output/m2/reviewer-round2-fe.log`.
- Java GraphServiceImplTest + GraphBuilderServiceTest: 32/32 pass, 0 skip; BUILD SUCCESS. Log `output/m2/reviewer-round2-java.log`.
- F1: constructor call site đã sửa, không còn lỗi compile cũ trong lệnh trên.
- F2: exception từ evidence query không còn bị catch rồi đổi thành zero.
- F3: code/test hiện giữ unknown ở lần projection kế tiếp, bỏ partial IDs của nhóm unknown và giữ count-only của cạnh đơn lẻ.
- F5: đã xác minh thêm producer `DockerDetectorServiceImpl` lấy datasourceTechnology từ URI scheme của JDBC URL, rồi GraphBuilder đưa vào properties.protocol. Đây là dữ kiện cấu hình có nguồn trong pattern được hỗ trợ. Test FE mới là adapter→renderer integration trên wire JSON tự dựng; không phải một lần Java producer chạy xuyên sang FE.
- Report parser Java ghi 3 tests nhưng 1 skipped, tức 2 thực thi; không ghi “3 pass”. Kết quả C# trong báo cáo chưa được reviewer chạy lại.
- Lượt review này không sửa code sản phẩm, không chạy browser, build, migration hoặc deployment.

## 2. Khoảng trống chính còn lại

### A. UI mới chưa nằm trên đường Graph chính

Đường thực tế:

`ArchitecturePresentation` → `DependencyNetwork` → `projectGraphModel`.

`ArchitecturePresentation` đồng thời truyền **model gốc** vào `SelectionThreeE`.

Thống kê, node badges, legend mới trong `components.tsx:ArchitectureGraph` không được dùng để render Graph chính của Architecture workspace. Component đó còn có consumer ở các màn hình khác; không gọi nó là dead code, nhưng không thể dùng thay đổi ở đó để kết luận Graph chính đã nhận D3/F6.

`DependencyNetwork` vẫn có legend màu riêng; không nhận phần thống kê mới. `SelectionThreeE` lookup cạnh theo selectedId trong model gốc, nên chỉ thêm JSX kiểm tra underlyingEdgeIds chưa giúp nó biết union count của nhóm từ projection.

Đính chính review trước: reviewer đã tập trung components.tsx mà chưa lần đầy đủ đường render hiện hành. Vòng này phải kiểm tra từ route tới consumer đang chạy, không lặp việc sửa đúng một component nhưng thiếu nối vào sản phẩm.

### B. Source pipeline acceptance vẫn thiếu

BeanMessagingParserTest xác minh output parser Java; CSharpAnalyzerTests xác minh parser C#. Hai bộ này không tự chứng minh production model builder/normalizer → API mapping → Graph/C4 giữ cùng semantics. Test FE F5 tự dựng graph/details JSON cũng không nối với output thực tế của Java builder.

Cần bằng chứng kết nối pipeline cho fixture nhỏ của mỗi ngôn ngữ. Có thể chạy từng tầng bằng harness và truyền output thật giữa các tầng; không bắt buộc một process duy nhất, nhưng tuyệt đối không viết lại input tầng sau bằng tay rồi gọi đó là output của tầng trước.

### C. Phần acceptance và hồ sơ

Chưa thấy browser acceptance M2 trên backend chứa code M2, mainflow/final build mới trong hồ sơ hiện tại. D5 vẫn manual pending, UC-01 vẫn open. Không đánh F7 hoặc toàn M2 “khắc phục toàn bộ” khi những phần này chưa chạy.

Coverage hiện dùng một rule ID cho mỗi loại diagram: đó là catalog-level coverage; chưa tương đương mapping từng quy tắc ký pháp. Tối thiểu các rule Graph/C4 cam kết trong M2 phải có expected/test/source cụ thể. UML chưa triển khai giữ NOT_IMPLEMENTED hoặc mức hỗ trợ thực tế.

## 3. Prompt cho Gemini

Tiếp tục **M2 — hoàn thiện tích hợp và acceptance** theo tài liệu này. Giữ toàn bộ code M2 đã đạt; không triển khai M3. Không dừng ở việc chỉnh report. Hoàn tất A–C dưới đây trong một lượt bàn giao.

### A. Nối capability vào Graph chính

1. Lần từ route Architecture → ArchitecturePresentation → DependencyNetwork → SelectionThreeE và xác định state/selection thật.
2. Đưa D3 vào DependencyNetwork hoặc thành component/hàm thống kê dùng chung tối thiểu: source/model snapshot scope, source/visible/grouped/internal/filtered counts, giới hạn nếu thực sự có. Giữ pan/zoom/drag/keyboard và onSelect hiện có; không thay cả Graph bằng ArchitectureGraph cũ.
3. Legend biểu diễn đúng các dấu có trên canvas chính. Có thể dùng text/icon/kiểu nét nhỏ gọn, không bắt buộc đổi mọi hình sang cylinder. Không dùng màu làm dấu phân biệt duy nhất. Kiểm tra CONFIG, STATIC, DEPLOYMENT, RUNTIME và uncertain theo biểu diễn thật.
4. Nối group summary đến consumer đang hiển thị. Chọn một nhóm hai cạnh có evidence {a,b} và {b,c}: UI phải thấy distinct count=3 và truy được hai source edge IDs. Chọn source edge riêng phải thấy số riêng của nó; nhóm unknown vẫn unknown.
5. Giữ selection ID và scope dùng cho evidence/API đúng source model. Nếu truyền projectedEdge/group summary riêng, ghi rõ đây là view metadata; không dùng synthetic ID gọi relationshipEvidence hoặc đưa cạnh gộp vào DB. Không thay model gốc bằng model projected cho các yêu cầu cần canonical data.
6. Test wiring thật của đường Architecture workspace, không chỉ snapshot của helper/JSX trong component khác. Với counts giữa các stage, ghi đơn vị source relationships hay projected connections; không cộng hai đơn vị như cùng một tập.

### B. Source Java/C# nối tới Graph/C4

1. Chọn fixture nhỏ mà extractor hiện hỗ trợ. Với Java: có source/config → parser/detector → GraphBuilder/service mapping. Với C#: source → Roslyn → normalizer/resolver/model contract → đường Java/FE tương ứng.
2. Dùng production functions/services thật ở các tầng được kiểm; mock kho lưu trữ được nhưng phải lưu/capture và truyền đúng output thực. Ghi rõ tầng có mock, tầng có HTTP và tầng chưa chạy.
3. Feed serialized output thực vào adapter→C4 renderer bằng harness/file nếu cần. Assert IDs/endpoints, origin, evidence association và boundary/scope đúng expected độc lập. Trường hợp không có source evidence phải giữ thiếu dữ liệu trung thực.
4. Không mở rộng sang Class/CFG extractor, không viết framework mới và không lấy hai parser test độc lập thay pipeline test. Nếu thiếu một tầng hoặc môi trường, nêu blocker cụ thể cùng kết quả phần đã chạy; giữ acceptance đó OPEN.

### C. Kiểm chứng và bàn giao cuối

1. Chạy regression FE/Java/Worker bị ảnh hưởng, typecheck và mainflow. Build source cuối với dist riêng, giữ byte cấu hình generated ban đầu. Không chạy lại suite không liên quan nếu chỉ sửa docs sau khi code đã đạt.
2. Chạy browser vào đúng Architecture Graph chính trên backend chứa M2. Xác minh legend/stats, unknown/zero/positive count, union nhóm và mở từng cạnh/evidence, filter/collapse, C1/C2/C3 không hồi quy. Lưu screenshot/DOM/API evidence với model/build/source/port rõ, không chứa secret.
3. D5 drag/undo/redo: nếu thực hiện được thì ghi tọa độ trước/sau/undo/redo/save/reload; nếu chưa thì giữ NEEDS MANUAL VERIFICATION. UC-01 vẫn OPEN và không tự đổi chiều.
4. Với backend query, Spring Data List theo contract bình thường trả empty chứ không null; nhánh null bất thường không nên được mô tả là verified zero. Đồng thời ghi “một query batch” thay vì coi thời gian/bộ nhớ tải mọi evidence là O(1). Không mở rộng thành dự án tối ưu hóa mới.
5. Đồng bộ README/gap review/roadmap/report: phần đạt ghi đúng; browser/pipeline/manual chưa chạy ghi đúng. Phân biệt parser unit, pipeline integration, HTTP và browser E2E. Manifest Graph/C4 có rule-level checks; các notation tương lai không ghi production-ready khi chưa có acceptance.
6. Bàn giao một báo cáo ngắn: đường UI thật, lỗi sửa, commands/results, bằng chứng source pipeline/browser và các mục pending. Không dùng câu “đã hoàn thành toàn bộ” khi tiêu chí còn mở; không gọi skipped test là pass.

Không commit/push/merge/deploy/reset/clean/stash, không sửa auth hay migration đã áp dụng, giữ nguyên baseline/main-sync/M1. Không chỉnh code đã đạt chỉ để thay style. Chưa triển khai M3 trước khi reviewer chốt M2.
