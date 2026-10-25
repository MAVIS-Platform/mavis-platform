# Review M2 sau bàn giao tích hợp cuối

Ngày 24/10/2026. Reviewer Codex. Kết luận: có tiến bộ thực sự ở đường UI và Java pipeline; **chưa nghiệm thu toàn M2** vì selection context còn sai và C# chưa nối tới Graph/C4. Không sửa code sản phẩm trong lượt review này.

## Kết quả đã tự chạy

- Java: `JavaSourceToGraphC4PipelineTest,GraphServiceImplTest,GraphBuilderServiceTest,BeanMessagingParserTest`: 36 tổng, 35 thực thi đạt, 1 skip, 0 fail/error. Log `output/m2/reviewer-final-java.log`.
- Java pipeline sinh lại output từ detector/parser/builder/service thật, mock repositories và access policy; không phải DB/HTTP E2E. Test FE sau đó dùng output mới này: 111/111 pass, typecheck exit 0. Log `output/m2/reviewer-final-fe.log`.
- Repro dùng production projection: `output/m2/reviewer-final-selection-repro.json`.
- Reviewer chưa chạy lại C# hay browser; không dùng kết quả báo cáo thành kết quả tự kiểm.

## Findings còn chặn nghiệm thu

### H1 — High: canvas và panel dùng hai projection state khác nhau

`ArchitecturePresentation:projectedEdge` gọi `projectGraphModel(model, false, "all")` cố định. `DependencyNetwork` giữ expanded/origin trong state riêng và gọi `projectGraphModel(model, expanded, origin)`.

Vì vậy panel có thể mô tả nhóm collapsed trong khi canvas đã expanded. Repro: hai component pairs của cùng hai service, mỗi cạnh count=2 và evidence overlap một ID. Expanded canvas chọn edge-1 có count=2; panel hardcoded collapsed trả nhóm edge-1+edge-2 count=3.

Cần một projection context thống nhất cho canvas và panel, cập nhật theo controls thật. Không tính thêm một projection với default khác chỉ để tìm nhóm.

### H2 — High: không drill-down được cạnh đại diện của nhóm

Nhóm dùng ID của cạnh nguồn đầu tiên. Panel phân biệt group/source bằng `selectedId === projectedEdge.id`; nút Chi tiết của mỗi source edge chỉ gọi `onSelect(subId)`.

Khi chọn Chi tiết của cạnh đầu tiên, subId chính là group ID. State không đổi, panel vẫn ở group mode. Chọn các cạnh khác có thể hoạt động nên test phải kiểm cạnh đầu tiên, không chỉ cạnh thứ hai.

Cần selection context phân biệt `group` và `source relationship`, độc lập với canonical ID. Giữ ID nguồn cho API; synthetic view ID nếu có không được gửi cho relationshipEvidence. Quay lại nhóm, đổi origin, expand/collapse, đổi model hoặc chuyển Diagram phải giữ/reset context theo contract rõ ràng.

Test “Architecture workspace group wiring…” hiện chỉ gọi projectGraphModel và assert các ID/Set từ model tự dựng. Nó không mount component, không click callback, không kiểm request; không phát hiện H1/H2. Cần test điều khiển state/wiring thật hoặc browser acceptance cho đúng case.

### H3 — Medium: C# source chưa tới Graph/C4

`source-pipeline-csharp-actual.json` là Worker Manifest từ scan/normalizer. FE chỉ đọc artifact Java; chưa có consumer C# artifact qua production ingestion/mapping tới Graph DTO/modelView/C4.

Chấp nhận kết quả Worker hiện có trong phạm vi Worker. Không gọi đường source Java/C# tới C4 đều hoàn tất trước khi thực hiện nốt C# với output thật. Giữ mock persistence nếu cần nhưng phải công bố rõ; không viết lại graph JSON của C# bằng tay.

### H4 — Medium: chỉ số/cảnh báo chưa theo hành vi thật

DependencyNetwork mới ghi `projection.model.edges.length - edges.length` là số bị lọc bởi search nhưng edges chính là projection.model.edges, nên hiệu luôn bằng 0. Search hiện phục vụ highlight/dim; phải ghi đúng chức năng này hoặc implement filter có chủ đích và test, không tạo số liệu giả.

Cảnh báo “canvas safety limit >300/>1000 active” kiểm model gốc, nhưng component vẫn render nodes/edges; chưa thấy giới hạn tương ứng được thực thi ở đó. >300 là điều kiện chuyển hành vi layout trong graph-layout, không tự chứng minh canvas bị cắt hoặc có limit 1000 edges. Ghi rõ layout fallback/giới hạn thực có, theo tập đang hiển thị, không thêm cơ chế cắt mới chỉ để khớp dòng warning.

### H5 — Medium: default FE tests phụ thuộc artifact cục bộ ngoài test fixtures

edge-semantics.test.cjs bắt buộc `../../output/m2/source-pipeline-java-actual.json` tồn tại. npm test không tự tạo file và chưa có contract prerequisite/fixture rõ cho môi trường mới.

Giữ kiểm chứng connected pipeline nhưng làm nó tái chạy được: ví dụ baseline output thực được kiểm soát trong tests/fixtures kèm provenance + lệnh integration sinh mới và kiểm semantics, hoặc script orchestration explicit sinh upstream trước downstream. Không silently skip thiếu artifact, không bắt mọi FE unit test phải dùng file của phiên làm việc trước, không đổi golden expected từ output đang kiểm.

## Prompt giao Gemini

Tiếp tục M2 với mục tiêu **sửa selection context và hoàn tất acceptance**, theo H1–H5 trong file này. Các phần đã đạt giữ nguyên; chưa triển khai M3.

1. Đưa state projection/selection về một nguồn thống nhất. Chọn giải pháp nhỏ nhất phù hợp cấu trúc hiện tại; không thay engine hay rewrite Graph. UI phải phân biệt group summary với source edge dù chúng có cùng representative ID.
2. Test trường hợp đủ: collapsed group count=3 → chi tiết cạnh đầu count=2 → quay nhóm count=3 → chi tiết cạnh thứ hai → expanded từng cạnh count=2 → filter origin/model switch context đúng. Chứng minh callback/API dùng canonical relationship ID. Test phải đi qua controller/state/component production thực, không chỉ assert ID literal trong fixture.
3. Hoàn thiện đường C# output thật tới production model/Graph/C4 và evidence. Bổ sung orchestration/fixture strategy tái chạy theo H3/H5; phân biệt Worker HTTP integration, mock persistence, API mapping và browser. Không nâng cấp extractor ngoài mẫu nguồn đã chọn.
4. Sửa wording/counts theo H4; không thêm giới hạn hoặc cắt mất quan hệ để làm warning có vẻ đúng.
5. Chạy các test liên quan, typecheck/mainflow và build final source bằng dist riêng; giữ file generated baseline. Chạy browser trên stack thật có code M2, nếu cần có thể khởi động stack test cục bộ riêng với đúng quyền/phạm vi đã giao; việc ports 8080/3000 offline không đủ để kết luận không thể kiểm chứng. Kiểm tra runbook M1 đã dùng FE3100/Java8082 trước, xác định owner trước khi dùng/restart, không đụng service của người khác và không áp migration lên DB chung.
6. Nếu auth hoặc tool thực sự chặn browser, nêu đúng lỗi và giữ acceptance PENDING; tiếp tục phần độc lập. Không coi “không tự khởi động daemon” là yêu cầu người dùng nếu không có chỉ dẫn áp dụng. D5 manual/UC-01 vẫn mở nếu chưa có bằng chứng/quyết định, không cần kéo dài việc sửa tài liệu cho hai mục này.
7. Đồng bộ report ngắn gọn: H1–H5 expected/actual, test commands, provenance artifacts, source/build/ports, phần chưa chạy. Không gọi pipeline C# hoàn tất khi mới có Manifest hoặc browser đạt khi chưa mở màn hình. Không commit/push/merge/deploy/reset/clean/stash; bảo toàn baseline và lịch sử document.

Điểm dừng: bàn giao M2 sau sửa các lỗi code và chạy phần acceptance làm được; reviewer chốt mức nghiệm thu và phạm vi còn mở rồi mới quyết định M3. Không dừng sau từng chỉnh sửa nhỏ để xin duyệt.
