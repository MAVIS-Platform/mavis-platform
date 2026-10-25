# Nghiệm thu implementation M2

Ngày 24/10/2026. Reviewer: Codex.

**Kết luận: DUYỆT IMPLEMENTATION M2 trong phạm vi code và các kiểm chứng dưới đây. Chưa nghiệm thu toàn milestone ở mức browser/manual.** Không mở thêm vòng sửa code G1–G3 nếu chưa có lỗi mới tái hiện.

## Kết quả reviewer tự kiểm trên source hiện tại

- Default FE suite: **112/112 pass**, 0 skip/fail. Reviewer chạy preload fs guard chặn readFileSync/existsSync tới output/m2 trong test processes; suite vẫn đạt. Log `output/m2/reviewer-g123-default-fs-guard.log`.
- Connected FE integration: **1/1 pass**, lệnh riêng `npm run test:connected`; dùng live outputs đã có từ connected upstream run, không dùng baseline fallback.
- TypeScript: exit 0.
- Mainflow contract: pass.
- Next production build: exit 0; dist riêng `.artifacts/next-m2-review-closure`. Log `output/m2/reviewer-g123-build.log`. next-env.d.ts/tsconfig.json được giữ nguyên byte có trước lượt build.

Upstream không đổi trong vòng G1–G3, nên không lặp lại Worker/Java. Lần reviewer xác minh connected upstream trước đó: C# 22/22; Java 37 tổng = 36 thực chạy đạt + 1 skip; logs `reviewer-blockers-worker.log`, `reviewer-blockers-java.log`. Đây là kết quả lịch sử đúng nguồn/phạm vi đó, không phải một upstream run mới của lượt G1–G3.

## Phạm vi được duyệt

1. Vocabulary/mapping Graph/C4 và metadata evidence đã triển khai; batch evidence query không còn nuốt exception thành verified zero.
2. Count union, unknown/count-only và source/group projection có regression trong bộ FE. Count không được coi là bằng chứng chất lượng extraction tổng quát.
3. Canvas chính và 3E dùng projection context được nối qua ArchitecturePresentation; identity group/source được tách khỏi canonical ID gọi API.
4. G1: group không được gọi AI source/finding hay tải evidence của cạnh đại diện rồi trình bày như toàn nhóm. Helper chặn group Explain kể cả options.finding; evidenceQueryParam group là null; UI có đường drill đúng member.
5. G2: computeSelectionScopeKey có model/scope kind/target/member signature, được dùng làm React key của panel; đổi source/group cùng representative ID hoặc đổi membership làm panel tách lifetime. Điều này cách ly state/kết quả của instance trước, không có nghĩa mọi network request vật lý đã bị hủy.
6. G3: default fixture suite và connected integration có hai lệnh riêng. Không còn yêu cầu default FE tests phải đọc artifact từ một phiên local trước.
7. Pipeline fixture Java và C# đã nối qua production processing/mapping tới C4 renderer trong môi trường test, có mock repositories/access policy được công bố. Không gọi đây là browser/real database E2E.

Trong phạm vi review G1–G3 và verification trên, reviewer không phát hiện thêm blocker implementation cần trả về agent. Không khẳng định các unit tests thay thế acceptance UI hoặc chứng minh hết race/interaction trên browser thật.

## Những mục vẫn mở

- **Browser acceptance M2 Scenarios 1–7: ĐÃ DUYỆT sau lượt renderer8090 online.** Reviewer xem screenshots và kiểm XML/SVG độc lập; chi tiết cập nhật tại `M2_BROWSER_ACCEPTANCE_REVIEW_2026-10-24.md`. Đây là review evidence của agent, không phải browser run mới do reviewer thực hiện.
- **D5 kéo node / undo / redo: NEEDS MANUAL VERIFICATION.** Không lấy test Relayout hoặc XML round-trip làm thay thế pointer drag thật.
- **UC-01: OPEN.** Giữ chiều subscribe channel → consumer và nhãn hiện hành, chờ quyết định nhóm.
- Các UML tiếp theo M3–M8 chưa được tính là đã triển khai chỉ vì M2 implementation được duyệt.

## Bước tiếp theo

Giao `GEMINI_M2_BROWSER_ACCEPTANCE_TASK_2026-10-24.md`: kiểm chứng trên stack/UI thật, không thêm feature. Nếu cần user đăng nhập hoặc thao tác editor, đưa đúng thao tác cần thiết và giữ trạng thái pending đến khi có bằng chứng.

Chỉ sửa lại implementation nếu acceptance phát hiện lỗi tái hiện. Chốt browser/manual riêng, sau đó reviewer quyết định chuyển M3 theo roadmap. Không commit/push/merge/deploy trong đợt review này.
