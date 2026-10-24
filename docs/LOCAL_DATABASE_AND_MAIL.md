# Local database and OTP mail setup

## Current verified setup — 24 October 2026

- Branch: `feat/stage-13-to-16`. Stages 13–16 are committed/pushed individually; no merge into main.
- The ignored root `.env.backend.local` contains the owner's Aiven JDBC credentials and Gmail App Password. The Gmail sender is `mavisproject247@gmail.com`. No account login password is used for SMTP.
- Aiven JDBC authentication and TLS succeeded. Read-only Flyway validation matches the team's applied V1–V14 history. Gmail authentication over required STARTTLS succeeded; this check did **not** send a real email or prove inbox delivery.
- A DBeaver connection named **MAVIS Team Aiven** exists alongside the original SQLite connection. DBeaver is waiting at its authentication dialog; connection success inside DBeaver has not been verified. Enter the current DB password locally in DBeaver. It is available in the ignored backend settings; do not copy it into documentation or chat. Follow any PostgreSQL driver-download prompt if required.
- The frontend's ignored `.env.local` contains only backend mode and the loopback Java URL. SMTP and database credentials belong exclusively to the backend.

## Shared schema compatibility gate

The shared database already has the team's `V14__ThreeE_Grounded_Context.sql` from main `f3c2fae`, checksum **2009627390**. Stage 16 originally used V14 for runtime planning in commit `5ea5553`; this follow-up moves that SQL, unchanged, to **V15__Runtime_Planning.sql** and includes the exact team V14. Do not edit applied history, use Flyway repair to relabel it, or merge unrelated main changes as part of connection setup.

V15 adds only `runtime_configurations`, `runtime_scenarios`, their foreign keys/checks and a project index. It does not update/delete existing user/project rows. The current application needs these tables: it cannot complete Hibernate schema validation on the shared cloud until V15 is applied.

Before shared V15: authorize the target and backup scope, take a PostgreSQL 18 custom-format backup, verify restoration on an isolated database, revalidate shared history and confirm V15 remains unused. Then apply only the reviewed pending V15 with Flyway and run a read-only application smoke check. The proposed private backup destination is `.artifacts/private-backups/aiven-before-runtime-v15-20261024.dump`; it would contain the full database, including private user/project records. Automatic approval rejected that export because connection/testing authorization did not cover this payload. **No backup export or shared schema change was executed.**

The regular launcher deliberately forces migrations **off** and uses `ddl-auto=validate`. Keep that default after a reviewed migration. Never enable automatic migration just to hide a mismatch. Rollback an application change by reverting the application artifact; preserve newly created planning data and applied history. Restore a whole shared backup only under an explicitly coordinated recovery plan, as it would overwrite subsequent team changes.

Disposable databases created with the original runtime V14 must be recreated for the new migration sequence. Existing team databases with ThreeE V14 upgrade normally to V15. The installed Flyway 10.10.0 warns that PostgreSQL 18 is newer than its tested support; record the warning and test against the exact server major rather than silently treating it as certified support.

## Gmail and local SMTP

Backend settings:

```dotenv
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=<team Gmail address>
MAIL_PASSWORD=<owner-generated Gmail App Password, without spaces>
MAIL_FROM=<same Gmail sender>
MAIL_SMTP_AUTH=true
MAIL_STARTTLS_ENABLE=true
```

`MAIL_STARTTLS_ENABLE=true` both enables and requires STARTTLS. All SMTP operations have bounded connection/read/write timeouts. Blank credentials have no hardcoded account fallback. Email delivery remains asynchronous: registration alone is not proof of delivery; inspect the delivery log/captured message and use resend when appropriate. Gmail SMTP configuration does not configure Google OAuth sign-in.

For local OTP testing, use a separate PostgreSQL database and a non-relaying SMTP capture service such as Mailpit. Override the backend test process only:

```dotenv
MAIL_HOST=127.0.0.1
MAIL_PORT=11025
MAIL_USERNAME=
MAIL_PASSWORD=
MAIL_FROM=mavis-local@example.invalid
MAIL_SMTP_AUTH=false
MAIL_STARTTLS_ENABLE=false
```

Do not replace the shared-cloud settings with test credentials or run integration fixtures against the shared database. The local tests use loopback Java `18184`, frontend `3101`, PostgreSQL `15434`, Mailpit SMTP `11025` and Web/API `18025`. These are task-specific test services, separate from the normal launcher ports.

## Verification evidence

Local evidence directory: `E:/Mavis/analysis/cloud-db-smtp-20261024`.

- `cloud-probe.log`, `cloud-migration-validation.log`: successful JDBC/TLS, read-only history validation; no cloud fixture writes.
- `gmail-probe.log`: real Gmail STARTTLS authentication; no real message sent.
- `platform-test-final.log`: **123** passing common/platform unit cases, including blocked-account and wrong-purpose OTP checks plus sender/message/failure tests.
- `java-local-auth.log`: fresh V1–V15 migration and strict-profile backend startup against isolated PostgreSQL.
- `migration-upgrade.log`: isolated V14 → V15 upgrade, unchanged team checksum and preserved sentinel row.
- `migration-pg18.log`: the same upgrade/sentinel checks passed on isolated PostgreSQL **18.6**, matching the shared server's major/minor version.
- `auth-mail-smoke.log`: **25** actual frontend BFF → Java → PostgreSQL checks; **3** emails delivered to local SMTP capture with correct sender, recipient and usable OTPs. Covers duplicate registration, pending login, wrong/expired/reused/wrong-purpose OTP, resend, verification, HttpOnly login, password reset, old-password rejection and locked/inactive guards.

These checks do not constitute exhaustive security/load testing, a real Gmail inbox-delivery test, or acceptance of the shared-cloud application. Use `JAVA_HOME` pointing to the project's JDK 21 before building/running. Never commit `.env.backend.local`, frontend `.env.local`, dumps or test artifacts.
