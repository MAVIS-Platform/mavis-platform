# MAVIS Studio Live — Sandbox parity trung thực

Tài liệu này mô tả lớp **capability parity** giữa Sandbox builder và Live Docker session. Mục tiêu là để Live có đủ bề mặt điều khiển như Sandbox, nhưng **chỉ bật những gì có hành vi Docker hoặc telemetry thật**. Không có nút giả, không có telemetry giả và không có bằng chứng giả.

## Nguyên tắc

Mỗi bề mặt Sandbox được gắn một trạng thái:

| Trạng thái | Ý nghĩa |
|---|---|
| `REAL` | Thao tác đi qua command queue, được Runner xác nhận trên Docker thật. |
| `PREPARED` | Chỉ thao tác trên service đã khai báo trong topology/Compose/profile của repo. |
| `OBSERVE` | Chỉ hiển thị dữ liệu thật đã quan sát; không thay đổi cấu hình. |
| `UNAVAILABLE` | Giữ nguyên trong UI để đối chiếu, nhưng disable kèm lý do. Không gửi lệnh. |

Quy tắc: một control chỉ được `REAL` nếu backend/Runner có đường thực thi và xác nhận tương ứng. Các mô phỏng của Sandbox không được tự động trở thành năng lực Docker (`PREPARED_LIVE_STUDIO.md` mục "Current boundary"). Khi chưa có Live session, panel vẫn hiển thị đủ bề mặt nhưng toàn bộ ở trạng thái `UNAVAILABLE` để không gợi ý sai rằng đã có Docker đang chạy.

## Ma trận hiện hành

| Bề mặt Sandbox | Live | Ghi chú |
|---|---|---|
| Cluster Scenarios, Apply scenario, Reset Cluster | `UNAVAILABLE` | Live chỉ chạy workload GET/HEAD thật của Lab. |
| Block library | `PREPARED` / `REAL` | Chỉ block đã khai báo trong topology. Session cũ không có topology thì dùng danh sách service đã xác nhận. |
| Custom block | `UNAVAILABLE` | Không thể tạo service ngoài Compose/profile và confirmed mappings. |
| Custom replicas 1–256 | `REAL` trong khoảng 1–8 | `SCALE` thật; input bị giới hạn 8. |
| Preset ×1, ×2, ×4, ×8 | `REAL` | Chỉ service `canScale`. |
| Preset ×16, ×32 | `UNAVAILABLE` | BR-07 giới hạn 1..8. |
| Stop / Start | `REAL` | `docker compose stop/start` qua Runner. |
| Clone replica | `REAL` | Scale cùng service thêm 1, tối đa 8; chỉ `canScale`. |
| Delete block | `UNAVAILABLE` | Remove = STOP; định nghĩa service được giữ để add lại. |
| Hardware & Stress Simulation | `UNAVAILABLE` | CPU/RAM/traffic/lag do execution profile và repo quyết định. |
| Incoming traffic, Network lag | `UNAVAILABLE` | Live không tiêm tải/lag giả. |
| Resilience Policies | `OBSERVE` | Chỉ báo circuit breaker, rate limit, retry/bulkhead, cache nếu log/span thật có. |
| Stats / Service telemetry | `OBSERVE` | Docker stats, log đã redaction, OTel span. |
| Load & capacity | `OBSERVE` | Request count, p95, error rate, replica thật; không mô phỏng demand/capacity. |
| Snapshots | `REAL` | PNG + giải thích + telemetry + digest SHA-256. |
| Local video recording | `UNAVAILABLE` | Live dùng snapshot/receipt ký; video Sandbox vẫn local-only. |

## Điểm code

- `MAVIS-Frontend/src/features/runtime/studio-live-capabilities.ts`: định nghĩa trạng thái và lý do cho từng bề mặt.
- `MAVIS-Frontend/src/features/runtime/live-sandbox-parity.tsx`: panel Live tương ứng, nhận `data`, `selected`, `busy`, `onCommand`.
- `MAVIS-Frontend/src/features/runtime/studio-controls.tsx`: render panel cạnh canvas Live.
- `MAVIS-Frontend/src/lib/api/contracts.ts`: schema `limits` của `studioState`.
- `RuntimeStudioService.java`: `appendPinnedLimits` chỉ trả `memoryMiB`, `cpus`, `timeoutSeconds` và runtime/containerPort/readinessPath của từng service. Không trả environment, secret, sealed input hay host command.

## Kiểm thử

- `MAVIS-Frontend/tests/studio-live-capabilities.test.cjs`: khóa ma trận trạng thái, đảm bảo mô phỏng không thành `REAL`, và mọi bề mặt có lý do.
- `MAVIS-Frontend/tests/studio-ui.browser.cjs`: kiểm tra panel Live thật với fixture API: Apply scenario/×16/Delete/Custom block disabled; preset ×4 enabled; input traffic/lag disabled; limits 512 MiB hiển thị.
- `RuntimeStudioServiceTest.stateExposesOnlyPinnedLimitsWithoutEnvironmentValues`: xác nhận `limits` chỉ chứa dữ liệu công khai, không rò `DB_PASSWORD` hay sealed input.
- Kết quả local sau thay đổi: TypeScript PASS; `npm test` 399/399; `studio-ui.browser.cjs` PASS; `studio-workbench.browser.cjs` PASS; Java 36/36 (4 topology + 9 studio + 23 planning).

## Phần chưa làm

- Chưa có load generator thật, runtime resource reconfiguration, policy hook hay custom service definition trong repo. Muốn các mục `UNAVAILABLE` thành `REAL` cần mở rộng hạ tầng và duyệt lại BR-07/BR-08.
- Chưa nghiệm thu hai tài khoản thật trên staging; các kết quả trên là local/fixture.
- Topology vẫn chưa được đóng băng thành revision Lab-level tại thời điểm publish.
