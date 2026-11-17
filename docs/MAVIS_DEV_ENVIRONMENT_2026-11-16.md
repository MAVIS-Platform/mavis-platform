# MAVIS development environment verification — 2026-11-16

## Scope and safety

This record covers the isolated Linux development environment used for the current verification session. It does not modify production, cloud accounts, credentials, or deployment secrets. Values from environment files and credentials were not printed or stored.

## Verified toolchain

Node.js `v22.23.4` and npm `10.9.9` are present and match the frontend's supported execution path. The frontend declares Playwright `1.64.1`; the package was already installed. Playwright Chromium `156.0.8078.4` was downloaded into the session cache. A headless launch smoke test passed after supplying the one missing user-space library `libXdamage.so.1` through `LD_LIBRARY_PATH`.

Python `3.10.12` and pip `25.3` are present. The deploy test suite has no repository requirements file; `psycopg[binary]` was installed in the session's user environment for PostgreSQL checks.

OpenJDK 21.0.13 was installed in user-space from Ubuntu packages because the base environment had OpenJDK 11 and no `javac`. Maven runs with Java 21 and the Maven build continues to target Java 21. The focused backend suite passed **35/35** after this setup: CourseAccess 5/5, CourseSetup 4/4, RuntimePlanning 24/24, RuntimeSetupController 2/2.

The repository pins .NET SDK `10.0.403` in `MAVIS.Worker/global.json`. That SDK was installed in user-space. After restoring NuGet packages with `RestoreFallbackFolders=''`, `StudioInfrastructureActionTests` passed **7/7**.

PostgreSQL client/server binaries were not installed system-wide. For an isolated smoke test, PostgreSQL 14 packages were downloaded and extracted into `/tmp`, a disposable cluster was initialized under `/tmp/mavis-pg14`, and it accepted connections on `127.0.0.1:15438`. The repository deploy unit suite passed **8 tests**, with the one real-migration test skipped because `MAVIS_TEST_PG_CONTAINER` was not set. The PostgreSQL process is not a persistent service and is not a production database.

## Blocked or skipped capabilities

The container has no Docker CLI, no Docker socket at `/var/run/docker.sock` or `/run/docker.sock`, and no Docker environment endpoint. Therefore real Docker Runner/managed-Docker tests are **SKIPPED**, not failed. This environment cannot verify container lifecycle, OTel collection through Docker, image readiness, or zero-orphan cleanup. Installing a Docker CLI alone would not solve the missing daemon/socket capability.

`npx playwright install-deps chromium` was attempted but **FAIL** because the container cannot use root/sudo (`no new privileges`). Browser dependencies were not globally installed. The Chromium smoke test nevertheless passed with the missing `libXdamage.so.1` library supplied in user-space; other browser tests should still be treated as environment-sensitive.

The full staging two-account acceptance remains **UNVERIFIED**. No production or cloud account was accessed.

## Re-run commands

From the repository root in a fresh Linux session:

```bash
bash scripts/bootstrap-dev-linux.sh
```

Then run the independent checks:

```bash
cd MAVIS-Frontend
npm run typecheck
node --test tests/runtime-planning.test.cjs tests/studio-live-capabilities.test.cjs tests/course-learning-ui.test.cjs
npx playwright install chromium
```

```bash
cd ../MAVIS.Worker
DOTNET_ROOT="$HOME/.local/opt/mavis/dotnet" PATH="$DOTNET_ROOT:$PATH" \
  dotnet restore tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj \
  -p:RestoreFallbackFolders=''
DOTNET_ROOT="$HOME/.local/opt/mavis/dotnet" PATH="$DOTNET_ROOT:$PATH" \
  dotnet test tests/MAVIS.Worker.Tests/MAVIS.Worker.Tests.csproj \
  --filter FullyQualifiedName~StudioInfrastructureActionTests \
  --no-restore -p:RestoreFallbackFolders=''
```

```bash
cd ../MAVIS-Platform/mavis-be
JAVA_HOME="$HOME/.local/opt/mavis/jdk-21" PATH="$JAVA_HOME/bin:$PATH" \
  ./mvnw -pl mavis-platform,mavis-analyzer -am test \
  '-Dtest=CourseAccessServiceTest,CourseSetupServiceTest,RuntimePlanningServiceTest,RuntimeSetupControllerTest' \
  '-Dsurefire.failIfNoSpecifiedTests=false'
```

The bootstrap script is intentionally limited to user-space tool setup. It does not provision Docker, start PostgreSQL, read secrets, or contact production.
