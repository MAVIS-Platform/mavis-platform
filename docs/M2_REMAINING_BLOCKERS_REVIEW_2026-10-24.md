# Review M2 sau vòng sửa H1–H5

Ngày 24/10/2026. Kết luận: **chưa nghiệm thu toàn M2**. Hai blocker còn lại là tính tái chạy của C# pipeline và scope của 3E AI/findings sau drill-down. Không mở rộng sang feature mới.

## Kết quả reviewer

- HEAD vẫn c299a91; chưa có commit mới trong log kiểm tra.
- FE 113/113 pass; typecheck sạch. Log `output/m2/reviewer-round4-fe.log`.
- Java chạy đúng lệnh pipeline/regression trong báo cáo: 37 tổng, 1 error, 1 skipped, BUILD FAILURE. Log `output/m2/reviewer-round4-java.log`. Không ghi 37 pass hoặc kết quả pipeline đạt.
- Source Java pipeline và code controlled projection/drill-down đã có tiến bộ thực. Reviewer không phủ nhận các phần đó.
- C# source artifact hiện tại không được Java deserialize: UnrecognizedPropertyException với field ProjectId, tại JavaSourceToGraphC4PipelineTest.java:201. Không chạy lại browser hoặc C# trong lượt review; root cause writers được xác minh trực tiếp từ source.

## B1 — High: hai producer ghi một filename với schema khác nhau

`CSharpScanEndToEndTests.cs` ghi legacy result có ProjectId/Manifest vào `output/m2/source-pipeline-csharp-actual.json`.

`HttpClientProfileTests.cs` cũng ghi cùng đường dẫn nhưng là canonical WorkerContract.Result. Hai test classes cùng nằm trong lệnh dotnet test được báo cáo. File cuối phụ thuộc lần ghi/thứ tự execution; hiện file mang Manifest. Java ưu tiên đọc live file đó và fail; baseline canonical trong tests/fixtures không giúp vì chỉ fallback khi file không tồn tại.

FE vẫn 113/113 pass sau khi Java pipeline vừa fail vì còn artifact graph cũ/baseline. Vì thế kết quả xanh không chứng minh một connected pipeline run mới đã đạt.

**Yêu cầu:** tách artifact/schema theo producer; bỏ hardcode workspace người dùng. Phân biệt default fixture regression với connected pipeline integration. Integration phải dùng output của đúng lượt, fail rõ khi upstream fail/thiếu/sai schema và không tự rơi về artifact cũ/baseline. Dùng output directory cho từng run hoặc explicit input paths là đủ; không cần framework mới. Không che lỗi bằng ignoreUnknownProperties hoặc sửa JSON tay.

## B2 — High: AI Explain và findings còn dùng ID trước drill-down

SelectionThreeE đã dùng activeRelationshipId cho relationshipEvidence, nhưng vẫn dùng selectedId tại:

- matching findings (`findingRelated`).
- body AI Explain (`relationshipId`).
- kiểm tra result.relationshipId sau response.

Khi nhóm có selectedId=edge-1 và người dùng drill edge-2, header/count/evidence là edge-2 nhưng AI request vẫn edge-1. Response edge-1 lại được guard chấp nhận vì guard cũng so với selectedId cũ. Panel key chỉ modelId:selectedId nên mutation result hoặc finding selection cũ còn có thể tồn tại khi drill đổi.

**Yêu cầu:** có canonical subject/context thống nhất cho header, evidence, findings, explanation request và response validation. Khi active subject đổi, reset/partition/gate kết quả cũ và findingId để không hiển thị nội dung cạnh trước dưới tên cạnh sau. Không gửi group summary như thể nó là evidence/finding của một source edge: ở group mode, hoặc tổng hợp đúng member evidence với scope rõ, hoặc giới hạn chức năng tới drill-down và ghi rõ. Không cần thêm API group-explain nếu không có sẵn.

## B3 — Verification gap: test đang viết lại logic controller

Test “Architecture presentation selection and projection lifecycle…” định nghĩa riêng getSelectionContext rồi tự gán expanded/origin/selected/drill. Điều này không kiểm payload AI thực sự trong SelectionThreeE nên B2 vẫn lọt.

**Yêu cầu:** test logic production/controller/request builder thật, hoặc mount component và kiểm callbacks/request. Có thể tách một helper nhỏ dùng trong production rồi test, không copy implementation vào test. Expected là literal độc lập. Kiểm cả evidence và AI/findings cho cạnh đầu/cạnh thứ hai, quay nhóm, đổi projection/model và response chậm của subject cũ.

## Prompt giao Gemini

Tiếp tục sửa M2 theo B1–B3 trong file này. Giữ nguyên phần H1–H5 đã đạt, không triển khai M3 và không làm lại toàn bộ milestone.

1. Sửa canonical 3E subject và lifecycle để hết lỗi giải thích sai cạnh. Thêm regression vào code production thật trước khi kết luận.
2. Sửa C# producer/artifact orchestration để thứ tự/parallel tests không ghi đè hai schema; default FE tests dùng fixture baseline có provenance rõ, integration run dùng file mới và không được fallback âm thầm.
3. Chạy connected sequence: C# source → canonical artifact → Java importer/GraphService → FE adapter/C4 trên output cùng lượt. Nêu mock repo/access policy; không gọi đây là live DB/browser E2E.
4. Chạy lại lệnh dotnet được báo cáo đầy đủ, sau đó Java và FE integration. Kiểm fixture regression độc lập với live output. Chỉ lặp cả chuỗi nếu cần xác minh race đã hết, không chạy vô hạn.
5. Typecheck/mainflow và build final-source với dist riêng, giữ generated files. Browser chưa làm được thì giữ PENDING với nguyên nhân thực; unauthenticated 403 là auth guard đang làm việc, không tự chứng minh toàn stack không thể dùng. Không bypass guard hoặc lộ credential.
6. Cập nhật báo cáo ngắn theo kết quả mới; D5 manual và UC-01 OPEN giữ nguyên nếu chưa có bằng chứng. Không gọi M2 hoàn tất toàn bộ hoặc mọi tiêu chí đạt khi browser còn pending. Không cần thêm vòng sửa văn phong sau khi các con số và trạng thái đã đúng.

Bàn giao một lần gồm thay đổi B1/B2, regression B3, command/log của run mới và các mục acceptance còn mở. Không commit/push/merge/deploy/reset/clean/stash; giữ baseline/document history. Reviewer sẽ chốt implementation và acceptance riêng sau vòng này; chưa tự code M3.
