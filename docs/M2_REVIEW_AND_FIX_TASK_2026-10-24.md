# Review M2 và nhiệm vụ bổ sung cho Gemini

Reviewer: Codex. Ngày 24/10/2026. Kết luận: **M2 CHƯA NGHIỆM THU; chưa chuyển M3.** Lượt review chỉ đọc code, chạy kiểm chứng và ghi hồ sơ; không sửa code sản phẩm thay implementation agent.

## 1. Kết quả reviewer tự chạy

- FE: 105/105 test pass, 0 fail/skip. Typecheck exit 0.
- Java GraphServiceImplTest: lệnh có Lombok override/ByteBuddy theo môi trường JDK 25 đã dùng trước đây, nhưng **FAIL tại testCompile**, chưa có test Java nào trong lượt này được phép gọi là pass.
- Repro production projection: nhóm gồm một cạnh có evidence và một cạnh unknown → lần đầu evidenceCount=null nhưng có evidenceIds một phần; project lại kết quả đó → evidenceCount=1. Một cạnh đơn lẻ count=5, chưa tải IDs → count bị đổi thành null.
- Logs: `output/m2/reviewer-fe-tests.log`, `reviewer-java-graph-tests.log`, `reviewer-evidence-repro.json`.
- Không chạy browser/build/Worker trong lượt review này. Không dùng kết quả cũ thay cho nghiệm thu M2.

## 2. Findings và khoảng trống

### F1 — High: thêm dependency làm hỏng biên dịch test Java

GraphServiceImpl nhận thêm EvidenceRepository. `mavis-analyzer/src/test/java/com/mavis/analyzer/workerclient/service/impl/UploadWorkerApiIntegrationTest.java:61` vẫn gọi constructor 5 tham số, trong khi hiện cần 6.

Reviewer chạy từ `MAVIS-Platform/mavis-be`:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-25'
./mvnw.cmd -pl mavis-analyzer -am test -Dtest=GraphServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false -Dlombok.version=1.18.42 -Dnet.bytebuddy.experimental=true -B
```

Maven đã qua phần Lombok và chỉ ra lỗi constructor cụ thể. Báo cáo “Java chưa xác minh vì Lombok” chưa phản ánh lỗi hiện tại.

### F2 — High: lỗi truy vấn evidence bị biến thành known zero

`GraphServiceImpl.getGraphDataBySessionId` catch Exception khi load map nhưng tiếp tục dùng map rỗng. Mỗi edge sau đó được gán evidenceCount=0 và evidenceIds=[]. Repository thiếu/null hoặc trả null cũng dẫn đến trạng thái đó.

Known zero chỉ hợp lệ khi truy vấn hoàn tất thành công và cạnh không có bản ghi. Nếu truy vấn thất bại, phải fail request có kiểm soát hoặc trả unknown bằng contract rõ ràng; không báo đã xác minh không có evidence. Ngoài ra, không nên có nhánh dependency injected null để che test setup thiếu.

### F3 — High: partial evidence IDs bị coi là danh sách đầy đủ

`graph-projection.ts:extractEdgeEvidence` ưu tiên array evidenceIds trước evidenceCount=null; output giữ tập ID một phần dù count unknown. Vì vậy input `{evidenceCount:null,evidenceIds:[id]}` trở thành known count=1. Output mixed của chính projection tái tạo trường hợp này.

Điều này làm mất ranh giới partial/complete, kể cả khi đường UI hiện chỉ project một lần. Cần contract phân biệt hai trạng thái hoặc không phát hành partial IDs dưới field được hiểu là complete. Tránh coi evidence object đã tải từng phần là toàn bộ evidence khi chưa có completeness contract. Count-only của một cạnh đã biết cũng không nên bị làm mất chỉ vì chưa tải IDs; distinct count của nhiều cạnh thiếu IDs có thể giữ unknown.

### F4 — Medium: evidence metadata chưa tới phần hiển thị

Trong hai consumer UI được giao (`components.tsx`, `selection-three-e.tsx`), reviewer không tìm thấy consumer cho evidenceCount/evidenceIds mới. Field đã tới domain/projection nhưng chưa có UI phân biệt known zero / positive / unknown hay hiển thị union của nhóm. Report nói fallback hiển thị “—” chưa có code tương ứng ở các panel đã kiểm tra.

### F5 — Medium: database protocol mới chỉ được chứng minh bằng input synthetic

Test mới gọi containerDatabaseLabel với object có properties.protocol tự dựng. Đường tạo logical DATABASE tại `GraphBuilderServiceImpl` đang có datasourceTechnology ở languageStack, chưa đặt protocol tương ứng trong properties tại nhánh đã kiểm tra. S2b explicit graph null còn có precedence với detail.

Cần chỉ ra producer thực tế và test mapping đến output XML/UI. PostgreSQL/MongoDB là tên công nghệ DB, không mặc nhiên đồng nghĩa protocol trên wire; nếu dùng làm technology label phải định nghĩa field/ngữ nghĩa trung thực. Không copy languageStack thành protocol để làm nhãn xanh. Còn HTTP thiếu nguồn thì ghi giới hạn, không tự gán default.

### F6 — Medium: scope/legend có mô tả chưa khớp canvas

- Node canvas vẫn render rect cho mọi loại trong code được đọc; legend mới mô tả cylinder/process và mã SVC/DB nhưng các dấu đó chưa được đồng bộ lên node canvas. Có thể dùng text badge thay vì đổi shape, nhưng legend phải mô tả biểu diễn thật.
- “Filtered … outside origin/layer” dùng projection.filteredRelationships chỉ đếm origin trước lọc layer/search; cần định nghĩa lại hoặc tính đủ từng stage.
- Large mode bỏ canvas chứ chưa chứng minh cắt source graph. Dropdown Inspect relationship vẫn slice 0..1000; phải có thông báo/phân trang hoặc cách truy cập phần còn lại, không gọi canvas omitted là đã giải quyết mọi truncation.

### F7 — Acceptance gap: D5/D6 và E2E chưa hoàn thành

- D5 vẫn NEEDS MANUAL VERIFICATION. Runbook là tài liệu hỗ trợ, không phải bằng chứng hoàn thành thao tác.
- D6 dẫn tên BeanMessagingParserTest/CSharpAnalyzerTests; chưa có bằng chứng chạy pipeline source → extractor → model → Graph/C4 cho hai ngôn ngữ như prompt yêu cầu.
- Coverage manifest mới là bản kê theo diagram; còn USES_API chưa phân biệt view-only với persisted vocabulary; có mô tả actor/LDAP/SSO không có căn cứ từ M1; Activity/State ghi SCAFFOLDED cần chỉ ra scaffold thật hoặc đổi NOT_IMPLEMENTED. Cần rule IDs, nguồn, tests/validator và mức hỗ trợ cụ thể.
- Chưa có mainflow/build cuối, Java/Worker verification và browser evidence cho M2 trong hồ sơ được đưa. Không được đánh tất cả D1–D6 HOÀN TẤT.
- Dòng runtime label trong báo cáo không khớp fallback hiện tại: fixture còn `RUNTIME OBSERVED`, không phải `Observed runtime communication`.

## 3. Prompt giao Gemini thực hiện vòng bổ sung

Bạn là implementation agent. Hãy tiếp tục **M2 vòng bổ sung theo review**, đọc toàn bộ findings F1–F7 trong file này và nhiệm vụ gốc `docs/GEMINI_M2_IMPLEMENTATION_TASK_2026-10-24.md`. Đây là yêu cầu sửa code, chạy kiểm chứng và hoàn tất hồ sơ; chưa được sang M3.

### Thứ tự làm

1. **Sửa F1 trước:** cập nhật mọi constructor call site liên quan, giữ mock/real EvidenceRepository đúng mục đích test. Không thêm constructor overload bỏ qua dependency chỉ để compiler xanh. Chạy lại Java với môi trường/flags đã ghi; không dừng tại nhận định Lombok cũ.
2. **Sửa F2/F3 thành một contract evidence nhất quán:** known zero, known positive, unknown và partial IDs; mapping backend → serialization → wire adapter → domain → aggregation đều khớp. Giữ backward compatibility; API field null mới phải được FE chấp nhận có chủ đích. Batch query thành công mới được kết luận zero. Không nuốt lỗi rồi bịa empty result.
3. **Bổ sung regression production thật:** query thành công không evidence, nhiều evidence, query thất bại/null bất thường, dedup; access denied không được query/load dữ liệu trái scope. Verify đúng 1 lần batch call trên model nhiều cạnh và không gọi per-edge evidence lookup. Một query round trip cố định không đồng nghĩa độ phức tạp dữ liệu O(1); ghi số hàng/payload đúng nghĩa.
4. **Test projection:** complete union, unknown kèm partial IDs, input có partial evidence objects, đảo thứ tự, project lại output, known count-only cho một cạnh, group nhiều count-only không biết giao nhau. Không tự lấy production output làm expected.
5. **Hoàn thiện F4–F6:** hiển thị count/unknown trên panel/group; protocol/technology có nguồn từ producer thật và test API→adapter→generate XML; legend khớp node/edge thực sự; counts theo từng stage và giới hạn danh sách truy cập được/thông báo rõ. Không thay graph engine hoặc mở rộng dữ liệu không cần thiết.
6. **D6:** thực thi fixture Java và C# qua đúng đường source → model → Graph/C4 với expected độc lập, có command/artifacts tái chạy. Có thể nối các harness hiện hữu; không dựng model JSON bằng tay thay output parser. Chọn mẫu nhỏ extractor hiện hỗ trợ, không triển khai Class/CFG extraction thuộc milestone sau. Sửa coverage manifest thành rule-level, trạng thái đúng code; bỏ giả định LDAP/SSO không có bằng chứng.
7. **Acceptance:** mainflow, FE tests/typecheck/final build dist riêng; Java GraphService + regression liên quan; Worker tests liên quan cho fixture C#; browser Graph/group/evidence/scope/C4 trên backend có M2 thật. Giữ build/source/port/dataset rõ, không lấy backend đang chạy bản cũ làm kiểm chứng API mới.
8. **D5:** cố gắng kiểm chứng thao tác thật có giới hạn; nếu vẫn không làm được, giữ manual pending, hướng dẫn người dùng ngắn và tiếp tục hoàn tất phần khác. Không gọi M2 hoàn tất toàn bộ khi tiêu chí này còn mở.

### Hồ sơ và ràng buộc

- Giữ mọi thay đổi baseline/main-sync/M1 có trước; không commit/push/merge/deploy/reset/clean/stash; không sửa auth hoặc migration đã áp dụng. Không ghi credential vào artifacts.
- Không sửa dữ liệu shared để tạo count/protocol hoặc giả lập drag. Dùng fixture/môi trường test riêng; model thật chỉ qua UI/API được cho phép.
- Cập nhật report/README/gap review theo trạng thái hiện tại, không dùng wording HOÀN TẤT cho mục NOT RUN/NEEDS MANUAL VERIFICATION. UC-01 vẫn OPEN chờ nhóm; đây không phải lỗi cần tự đảo chiều cạnh.
- Mỗi artifact kết quả cần command/test/harness tạo ra, build/source và phạm vi; JSON expected/actual soạn thủ công không thay thế execution log.
- Báo cáo cuối chỉ cần: F1–F7 expected/actual, file:symbol đã sửa, command/results, browser evidence, D5/D6 còn mở gì, change set riêng của vòng này. Làm hết phần tự thực hiện được rồi bàn giao, không dừng sau mỗi sửa nhỏ để xin duyệt.

**Điểm dừng:** M2 được bổ sung đủ bằng chứng hoặc có blocker cụ thể không thể tự giải quyết; khi đó vẫn ghi đúng pending/partial. Reviewer nghiệm thu xong mới giao M3.
