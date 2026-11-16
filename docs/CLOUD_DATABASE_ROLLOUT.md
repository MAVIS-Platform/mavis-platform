# Sử dụng Aiven cloud — kiểm chứng 22/10/2026

Đã kết nối PostgreSQL thật qua SSL require, bằng transaction READ ONLY và statement timeout. Không ghi dữ liệu, chạy Flyway hay ALTER cloud.

## Kết quả

- Cloud hoạt động, public có 23 bảng.
- Flyway V1–V8 success.
- runtime_sessions có receipt_digest, allocated_at, enriched_model_version_id.
- model_elements.scope vẫn VARCHAR(100).
- jobs chưa có row_version.

Cloud dùng được cho baseline schema V8. Bản sửa Java trong feat/java-runtime-contract-fixes cần migration V9/V10 trước khi dùng đầy đủ; chỉ có bảng không đồng nghĩa schema tương thích mọi code mới.

## Thứ tự đưa bản sửa lên cloud

1. Kiểm tra main/nhánh mới nhất, bảo đảm số V9/V10 không bị team dùng cho migration khác.
2. Snapshot/backup database và lưu Flyway history hiện tại; xác định ứng dụng nào đang ghi DB chung.
3. Chạy migration V9 scope TEXT và V10 row_version trong cửa sổ cập nhật thống nhất. Không sửa V1–V8 hoặc chạy Flyway clean.
4. Chạy Java bản sửa với ddl-auto=validate; Worker không kết nối business DB. Profile datasource lấy URL/user/password từ secret ngoài Git.
5. Smoke dùng project riêng có prefix kiểm thử; không chạy corpus/failure suite hàng loạt trên dữ liệu chung.
6. Kiểm migration history và app startup; nếu lỗi thì dừng rollout, không tự drop/recreate bảng để ép chạy.

Chưa thực hiện bước ghi/migrate cloud trong lượt kiểm tra này. Các test kill process, timeout, startup failure, concurrency vẫn dùng sandbox để bảo vệ dữ liệu chung. Người dùng đã yêu cầu dùng cloud; bước tiếp theo là chuẩn bị rollout cụ thể và backup, không coi yêu cầu này là quyền xóa/reset dữ liệu chung.

Bằng chứng chỉ đọc: `.doc_review/cloud-readonly-check-2026-10-22.txt`. Không chứa password.

## Đã thực hiện theo phê duyệt — 22/10/2026

- Backup PostgreSQL 18 custom format: 80.878 bytes; pg_restore --list xác minh thành công. File local `.artifacts/cloud-rollout-20261022/before-v9-v10.dump` có thể chứa dữ liệu nhạy cảm, không commit/chia sẻ.
- Flyway 11.20.0 validate 10 migrations, áp dụng V9 và V10 thành công trên Aiven PostgreSQL 18.6. Không clean/drop hoặc sửa checksum V1–V8.
- Post-check chỉ đọc: V1–V10 success, model_elements.scope=text, jobs.row_version=bigint.
- Thêm application-cloud.yml trong Java worktree feat/java-runtime-contract-fixes. Chạy với SPRING_PROFILES_ACTIVE=cloud và MAVIS_DB_URL/MAVIS_DB_USERNAME/MAVIS_DB_PASSWORD từ secret environment. Mặc định Flyway disabled (schema đã migrate), ddl-auto validate, dev bypass false. Muốn migrate tiếp phải bật explicit MAVIS_DB_MIGRATIONS_ENABLED và review migration trước.
- Chưa khởi động Java application lên cloud hoặc tạo project smoke trên dữ liệu chung trong checkpoint này. Không gán schema verification thành application E2E pass; cần cấu hình JWT/Worker/artifact paths đúng môi trường trước khi launch.
- Log rollout nằm `.artifacts/cloud-rollout-20261022/migration.log`; bằng chứng sau migration `.doc_review/cloud-post-migration-2026-10-22.txt`. Không commit backup/log credential.

## Recovery V11 và application smoke

- Backup pre-V11 81.013 bytes được pg_restore --list xác minh; Flyway validate/apply V11 thành công, cloud hiện version 11.
- Java final recovery build khởi động thật với Aiven SSL, datasource read-only, Flyway disabled, ddl-auto validate và strict auth. `/v3/api-docs` 200; `/api/v1/projects` và protected ping không JWT trả 403. Không coi smoke này là full authenticated business E2E cloud.
- Backup chứa dữ liệu nhạy cảm chỉ giữ local ngoài Git. Các container smoke/sandbox được dừng sau kiểm chứng.

## Authenticated smoke

14/14 checks passed against Aiven with strict auth: two test accounts registered/verified/logged in, owner project create/read/delete, outsider read/update denied, student admin denied, malformed/missing JWT denied. OTP was read only for these test accounts; SMTP delivery was not exercised. Test OTP rows removed, accounts inactivated, project soft-deleted. No shared seed records changed.
