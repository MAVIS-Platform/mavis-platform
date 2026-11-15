# Dependabot remediation — 15/11/2026

Remediation for the open Dependabot alerts on the default branch. The verification below was run on the `fix/dependabot-alerts` branch before merge.

## Frontend (npm)

- `next` upgraded from 15.5.25 to **15.5.29** via `npm audit fix` (critical advisories fixed).
- `zod` upgraded from 3.25.76 to **4.6.7**. All `z.record` schemas now use the Zod 4 two-argument form; recursive sequence schemas use `z.ZodType<T>`; optional `z.unknown()` node metadata stays optional.
- `sharp` resolved to **0.35.5** and `source-map-js` to **1.2.2**.
- Added npm overrides: `postcss` **8.5.33** (Next.js bundled 8.4.31) and `minimatch` **11.0.8** (the nested copy under `@typescript-eslint/typescript-estree`).
- `npm audit` now reports **0 vulnerabilities**.

## Backend and Worker (Maven)

- Spring Boot `3.3.0` → **3.5.16** in the backend parent and all four modules.
- Springdoc `2.5.0` → **2.8.17**.
- Pinned patched managed versions:
  - Jackson BOM **2.22.4**
  - Tomcat **10.1.62**
  - PostgreSQL JDBC **42.7.14**
  - Log4j **2.26.1**
  - Commons Lang **3.19.0**
  - Guava **33.8.0-jre**
- Standalone samples updated: `integration/java-client` and `contracts/n01/java-consumer` use Jackson **2.22.4**; `runtime-poc/gateway` and `runtime-poc/payment` use Spring Boot **3.5.16** with the same Jackson, Log4j and Tomcat overrides.
- A local OSV scan of the resolved dependency lists now leaves only Spring WebMVC `6.2.19` advisories `GHSA-j9f9-w8pj-32f8` and `GHSA-pc63-qcmh-9cmg`. Their fixed versions are Spring Framework `7.0.9`, which requires a Spring Boot 4 major upgrade; this is intentionally not part of this patch.

## Verification

- `npm audit`: 0 vulnerabilities.
- `npm run typecheck`: PASS.
- `npm test`: **399/399 PASS**.
- `npm run build`: PASS.
- `studio-ui.browser.cjs`: PASS.
- `studio-workbench.browser.cjs`: PASS.
- Backend `mavis-platform -am`: **172/172 PASS**.
- Backend `mavis-analyzer -am`: **445 PASS**, 14 skipped.
- `Wf01` + `Wf02` + `Wf03` + `Wf04` acceptance matrices: **120/120 PASS**.
- Worker `integration/java-client`: **11 tests, 0 failures, 1 skipped live integration**.
- `contracts/n01/java-consumer`: BUILD SUCCESS.
- Spring Boot `@SpringBootTest` context tests that need PostgreSQL were not run because `MAVIS_DB_URL`, `MAVIS_DB_USERNAME` and `MAVIS_DB_PASSWORD` were not configured; the observed failure was `SCRAM-based authentication, but no password was provided`, not a dependency/classpath error.

Dependabot will re-scan after the push. If any alert remains, record its package, manifest and fixed version before changing the dependency again.
