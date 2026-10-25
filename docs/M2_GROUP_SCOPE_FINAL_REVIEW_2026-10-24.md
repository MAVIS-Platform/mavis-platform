# Review M2 sau xử lý blockers B1–B3

Ngày 24/10/2026. Reviewer Codex. **B1 đã đạt kiểm chứng cùng lượt; B2 còn sai scope ở chế độ group.** Chưa nghiệm thu toàn M2. Chưa sửa code sản phẩm trong lượt review này.

## Đã xác minh độc lập

Reviewer chạy tuần tự producer → consumer, không dùng baseline fallback cho connected run:

1. Worker C# ba nhóm test đã chỉ định: **22/22 pass**. Canonical và legacy Manifest được ghi sang hai file riêng.
2. Java pipeline/GraphService/GraphBuilder/parser: **37 tổng = 36 thực thi đạt + 1 skip**, BUILD SUCCESS. Canonical artifact mới được Java đọc thành công.
3. FE đọc hai graph artifacts mới: **113/113 pass**; typecheck và mainflow đều pass.

Logs: `output/m2/reviewer-blockers-worker.log`, `reviewer-blockers-java.log`, `reviewer-blockers-fe.log`. Reviewer chưa chạy lại production build hay browser trong lượt này. Browser acceptance, D5 và UC-01 vẫn giữ trạng thái mở theo báo cáo.

Production helper đã thay test sao chép controller và canonical ID ở source drill-down đã được sử dụng trong payload. Đây là thay đổi đạt đúng hướng; không cần làm lại pipeline hoặc refactor Graph.

## Hai trường hợp cùng lỗi scope 3E còn lại

### G1 — Group finding vẫn gửi ID cạnh đại diện

`buildThreeESubjectContext` chặn group Explain chỉ khi không có options.finding. Group filterFindings trả findings của mọi member; UI vẫn gọi chooseFinding(f) từ danh sách đó.

Repro production helper:

- group có edge-1, edge-2; selectedId/group representative là edge-1.
- finding-2 có relationshipId=edge-2 được filterFindings chấp nhận.
- `buildExplainRequest({finding:finding2,runId:"run"})` trả RULE_FINDING với **relationshipId=edge-1**, findingId=finding-2.
- Response đúng cho finding-2/edge-2 bị validateExplainResponse từ chối.

Evidence: `output/m2/reviewer-group-scope-repro.json`.

Đây là đường sản phẩm có thể đi tới từ UI, không chỉ input xấu từ test. Chưa thể gọi B2 đã đồng bộ mọi request/response.

### G2 — Đổi source ↔ group cùng representative ID không reset AI state

Expanded chọn edge-1 là source; collapse giữ selectedId=edge-1 nhưng trở thành group edge-1+edge-2. Cả hai trạng thái đều có activeTargetId=edge-1 và panel key `model:edge-1:group` khi không drill.

Effect chỉ theo activeTargetId và partition key hiện tại đều không thay đổi. Kết quả AI hoặc findingId của source trước đó có thể còn hiển thị trong group; request đang chờ cũng thuộc instance cũ còn sống. Helper guard của một request giữ context lúc request bắt đầu, không tự thay thế kiểm tra scope đang được UI hiển thị.

Cần identity của **selection scope**, không chỉ canonical target ID: model + node/source/group + member set/projection context thích hợp. Group membership hoặc source/group mode đổi phải reset/gate kết quả của scope trước, kể cả ID đại diện giữ nguyên.

### G3 — Baseline/live đã tách tên test nhưng chưa tách cách chạy

`npm test` vẫn chạy toàn bộ edge-semantics.test.cjs, trong đó live integration test luôn bắt buộc output/m2 tồn tại. Vì vậy default FE regression trên môi trường mới vẫn cần artifact cục bộ, dù baseline fixtures đã có. Đây là phần còn lại của yêu cầu B3 trước, không phải một feature mới.

Cần default test suite dùng fixtures có kiểm soát, còn connected integration có lệnh/chế độ riêng và bắt buộc upstream output đúng lượt. Không silent fallback trong live run và không gọi test bị bỏ qua là pass. Kiểm chứng default suite không đọc output/m2 bằng môi trường tạm/harness, không xóa artifacts người dùng để test.

## Prompt cho Gemini

Tiếp tục M2, chỉ hoàn tất G1–G3 và acceptance liên quan theo file này. Giữ pipeline B1 đã đạt; chưa code M3.

1. Chọn cách xử lý group tối thiểu, nhất quán. Khuyến nghị: group dùng summary/count và danh sách member; **mọi yêu cầu AI cho source/finding chỉ thực hiện sau khi chọn một source member đúng scope**. Chặn cả group buildExplainRequest({finding}) chứ không chỉ request rỗng; UI phải hướng dẫn drill-down, không để nút còn gọi payload sai.
2. Group evidence cũng phải có scope trung thực: không gọi API của edge-1 rồi trình bày như evidence toàn nhóm. Có thể yêu cầu chọn member để tải evidence thay vì thêm API aggregate mới. Findings tổng hợp theo member vẫn có thể hiển thị, nhưng action giải thích phải sang đúng canonical subject. Không tự chọn ngẫu nhiên một member cho finding liên quan nhiều phần tử.
3. Định nghĩa selection scope identity trong production helper/controller và sử dụng nó thực sự cho reset/partition/gating. Phân biệt source edge-1 và group đại diện edge-1; thay membership cũng phải vô hiệu hóa kết quả scope cũ. Giữ canonical IDs riêng để gọi API.
4. Regression gọi production code, expected literal: group finding thuộc member thứ hai không tạo payload member đầu; source edge-1 → collapse group → expanded source cùng ID; response cũ trả về sau scope change không được hiển thị; quay nhóm/drill-down hai member vẫn hoạt động. Có test lifecycle/controller/render wiring phù hợp, không chỉ gọi validator mới với response cũ một cách độc lập rồi tuyên bố đã test race UI.
5. Tách default fixture regression và connected integration theo G3. Chạy FE regression/typecheck/mainflow và final build dist riêng sau sửa; nếu không đổi upstream thì không cần lặp nguyên chuỗi Worker/Java đã vừa đạt. Chỉ kiểm lại upstream khi thay contract/pipeline liên quan.
6. Nếu làm được browser acceptance, chạy đúng màn hình Architecture Graph và 3E, gồm source/group/finding/Explain. Không bypass auth. Nếu còn chặn thì ghi PENDING với bằng chứng lỗi thực; D5 và UC-01 giữ trạng thái đang có, không sửa report thành mọi thứ đã xong.
7. Bàn giao ngắn: G1–G3 expected/actual, production files/symbols, command/results và browser/manual còn mở. Không thêm scope, không commit/push/merge/deploy/reset/clean/stash, giữ baseline/history.

Sau vòng này reviewer sẽ chốt implementation riêng với browser acceptance. Không cần mở thêm feature Graph/UML để xử lý các khoảng trống này.
