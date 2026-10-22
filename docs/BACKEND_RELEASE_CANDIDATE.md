# Backend release candidate — 22/10/2026

## Source

Candidate kết hợp: worktree `C:/Users/nhuth/.codex/worktrees/java-runtime-fixes/MAVISS`, branch `feat/java-runtime-contract-fixes`, HEAD `ba58c8a`:

- Java `6ade22a`: runtime/replay/schema/cloud config/recovery fixes.
- Runner `ba58c8a`: cherry-pick commit `936bdd2` từ feat/runtime-allocation.

Đã push và tạo PR #27: https://github.com/MAVIS-Platform/mavis-platform/pull/27. Chưa merge main. Local Worker API edits có trước vẫn ngoài candidate. Candidate .NET đã restore/build/test được từ worktree sạch, không phụ thuộc các edits đó.

## Evidence

- Final Java reactor package BUILD SUCCESS sau audit; policy/handler 12/12 và submission/feedback 26/26.

- .NET candidate: 218 pass, 3 skip / 221. Hai skip Linux filesystem, một Docker opt-in; actual Java/Docker E2E chạy riêng.
- Java recovery/session/receipt/digest targeted: 24/24, package thành công.
- Managed actual Java/PostgreSQL/Docker: success/replay16/16, timeout10/10, startup failure15/15, kill Runner + managed recovery15/15. Actual cleanup resources và persisted ack được kiểm.
- Recovery giữ scope/idempotency, không fabricate execution receipt hoặc promote model. Late receipt sau recovery409.
- Corpus concurrent replay eShop/Petclinic24/24 ở checkpoint trước; không gán là rerun sau mọi recovery changes.
- Cloud: backup verified, Flyway V11 success. Authenticated smoke 14/14: register/verify/login, owner project CRUD, outsider denied, student admin denied, invalid/missing JWT denied. Test accounts inactivated, test project soft-deleted; SMTP delivery not exercised.

## Cấu hình chạy

Cloud profile: SPRING_PROFILES_ACTIVE=cloud; MAVIS_DB_URL/MAVIS_DB_USERNAME/MAVIS_DB_PASSWORD từ secret environment. Migration mặc định tắt, cloud đã V11. Không Flyway clean/reset/checksum rewrite. Credential cloud từng commit cần owner rotate; bỏ khỏi source không xóa credential trong lịch sử.

JWT/mail/AI/Worker configs phải override theo môi trường. Seed password hiện placeholder không phải tài khoản demo login. Artifact staging root/mount và Runner operator state-root phải được cấu hình riêng; DB cloud không thay source storage hay Docker host. FE không cầm service keys.

## Bàn giao FE

- Chỉ gọi Java public API; OpenAPI thực lấy từ `/v3/api-docs`, không dùng PDF cũ suy DTO.
- Project → ZIP/GitHub snapshot → explicit POST `/api/v1/analyzer/snapshots/{snapshot}/analyze` với Idempotency-Key → poll job → modelVersionId publish.
- Graph/evidence/diagram/evaluation/impact/revision/export pin đúng model. Layout chỉ gửi nodes/id/x/y, không overwrite semantic graph.
- Runtime approve không tự là RUNNING. Giữ execution/scenario/evidence/cleanup/trace/mapping riêng; Java/adapter gọi Runner.
- Submission pin đúng artifacts; AI grounded/fallback không phải evidence runtime. Response Java unwrap data, lỗi dựa HTTP/envelope, giữ partial/review/cancelling trung thực.

## Gate còn lại trước phát hành chung

Submission detail/list/export và feedback list đã thêm project/workspace authorization. Malformed request trả 400, unknown resource 404, unsupported content type 415. Cloud yêu cầu MAVIS_JWT_SECRET và MAVIS_RUNNER_SERVICE_KEY, tắt unverified PoC promotion.

Còn PR/merge, CI/release và FE/browser E2E. SMTP delivery và quota/provider AI thật chưa được xác nhận; cloud smoke dùng SMTP giả và OTP của riêng tài khoản test. Không gọi production acceptance 100%.

## PR gate

PR-Agent check thất bại vì Gemini API trả 404 cho gemini/gemini-2.5-flash (run 39743157611), chưa tạo nhận xét code. Không bypass check hoặc gán lỗi provider thành lỗi compile/test của BE.
