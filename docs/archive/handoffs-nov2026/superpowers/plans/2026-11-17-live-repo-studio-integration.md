# Live Repo Setup + MAVIS Studio Live + Lab Integration

**Date:** 2026-11-17
**Status:** Plan for approval
**Goal:** Lecturer can prepare a real curated repository, configure its runtime, run and verify a real Live Studio session, link it to a Lab, freeze the topology, and let students run the same Lab through MAVIS Studio Live.

## 1. Readiness

### Đã đủ điều kiện hạ tầng
- Production Phase 3 đã deploy (`698b404`), frontend/backend/worker up.
- VPS có Docker Linux Engine, Runner `dotnet MAVIS.Worker.Api.dll`, OTel collector, scenario image, state root và image sandbox.
- Local real Docker test PASS:
  - STOP payment 0% → 100%
  - START 100% → 0%
  - SCALE orders 1 → 2
  - Before/After snapshot, HMAC receipt, evidence digest, cleanup CONFIRMED, 0 orphan.
- Migration V36 và deploy probes đã chạy success trên production.

### Chưa đủ điều kiện nghiệm thu sản phẩm
- Chưa chạy với tài khoản lecturer/student thật trên production/staging.
- Chưa có curated repo thật được build + pin digest trên production.
- Lecturer chưa có một wizard “setup repo Live” thống nhất; Runtime Configuration hiện là trang lớn, nhiều kỹ thuật.
- Prepared topology vẫn sửa bằng JSON textarea, chưa phải builder trực quan.
- Runtime session chưa lưu `assignment_id`; Studio/Lab context chỉ truyền qua query, chưa có ràng buộc bền vững.
- Chưa có bước xác minh “session này thuộc đúng Lab/source/model” trước khi freeze.

## 2. Target lecturer flow

1. Trong **Lab Authoring → Studio Live**, bấm **Set up Live repository**.
2. Chọn/tạo reference project `TEACHER_REFERENCE` thuộc lớp.
3. Import GitHub commit SHA hoặc ZIP → chạy phân tích → chọn model/snapshot.
4. Cấu hình runtime:
   - applications, service mappings, roles;
   - health endpoint, container port, image;
   - resources, timeout ≤ 300s, secrets theo flow hiện có;
   - **Build & pin images** (digest `sha256:...`).
5. Chọn baseline workload GET/HEAD, expected status, `initiallyStopped`.
6. Thiết kế **Prepared topology** trực quan:
   - blocks từ confirmed mappings;
   - dây nối route-controller;
   - `canScale`, replica 1–8;
   - validation với Compose/mappings.
7. **Start Live authoring session**:
   - Runner prepare → readiness → baseline → RUNNING;
   - Stop/Start/Scale thật;
   - capture Before/After; Finish; receipt HMAC; cleanup.
8. **Freeze topology V34** vào Lab đã publish.
9. Publish Lab; student mở Lab → Step 3/4 dùng đúng reference source/model/topology đã freeze.

## 3. Architecture

### Reuse
- `RuntimeConfigurationView` / `RuntimeScenariosView` cho apps, mappings, images, build & pin, start.
- `RuntimePlanningService`, `RuntimeSessionServiceImpl`, `RuntimeStudioService`, Runner/RunnerReceiptIngest.
- `PreparedStudioTopology` validation, `StudioObservability`, `useStudioSession`, `LiveStudioWorkbench`.
- `CourseAccessService.freezeTopology` (V34).

### New UI
- `LiveRepoSetupWizard` (embedded in Lab Authoring Studio, optional route `/live-setup`):
  - steps 1–7 above with real state, loading, error, retry;
  - no raw JSON as primary control.
- `PreparedTopologyBuilder`:
  - service palette, canvas, add/remove block, wire connect/disconnect, canScale/initiallyStopped, replica range;
  - validation errors point to Compose/mapping/source;
  - “Advanced JSON” read-only/diagnostics.
- `StudioSessionPanel`:
  - assignment/project/model badge;
  - Start/Open/Refresh/Finish/Cancel;
  - session state, cleanup, receipt;
  - return link to Lab Authoring.
- `/studio` authoring mode:
  - `assignment` and `labProject` query context;
  - show “Authoring session · Lab X” vs “Student session”;
  - freeze button after verified run.

### Session link
Add `runtime_sessions.assignment_id UUID NULL` (migration V37):
- lecturer authoring sessions and student sessions both carry assignmentId when started from a Lab;
- session APIs validate assignment ↔ project/source/model/workspace;
- Studio/Lab deep links use assignmentId, not just project/model;
- legacy sessions remain null and work.

Add backend guard:
- `POST /runtime-plan/start` (or new `POST /course-labs/{assignmentId}/studio-sessions/start`) accepts assignmentId and validates:
  - workspace membership/role;
  - assignment reference source/model;
  - runtime profile source/model match;
  - frozen topology if published student session;
  - quiz gate for student.
- `GET /studio`/`/sessions` include `assignmentId`, `labTitle`, `returnTo` metadata.

## 4. Phases

### Phase A — Readiness + acceptance baseline (before UI)
- Freeze current production SHA; record VPS containers/Runner/worker health.
- Add a production-safe seed reference repo with digest-pinned images (orders/payment/route-controller).
- Create lecturer/student test accounts and class.
- Run current Lab Authoring Studio → Start Live session manually; record blockers.
- Acceptance gate: one real lecturer session reaches RUNNING and one real student session is scoped correctly.

### Phase B — Live Repo Setup wizard
- New `live-repo-setup.tsx` with steps and validation.
- Reuse Runtime Configuration mutations; hide advanced internals behind details.
- Image build/pin status, digest display, retry, errors.
- Baseline workload editor and `initiallyStopped`.
- Link from `lab-studio-section.tsx` “Set up Live repository”.
- Tests: component/static, browser fixture, backend validation tests.

### Phase C — Visual Prepared Topology Builder
- Replace raw JSON as primary UI in `PreparedTopologyEditor` with `PreparedTopologyBuilder`.
- Load service names from runtime applications + confirmed mappings + Compose.
- Validate route controllers, duplicate blocks, unsupported connections, canScale, replicas.
- Save through existing `saveRuntimeConfiguration` expectedRevision.
- Preview compiled topology JSON.
- Tests: unit validation, browser add/wire/scale/freeze, backend `PreparedStudioTopologyTest`.

### Phase D — Studio Live session completion
- Add assignmentId to session start/response (V37).
- `StudioSessionPanel` + `/studio` authoring mode.
- State machine UI: NOT_STARTED → ALLOCATED → RUNNING → actions confirmed → captured → FINISHED → receipt → cleanup.
- Real controls only; `UNAVAILABLE` with reasons for unsupported surfaces.
- Finish/cancel, receipt download, cleanup status.
- Tests: MockMvc lifecycle, real Docker test (existing), frontend browser fixture.

### Phase E — Lab ↔ Studio linkage
- Lab Authoring Studio tab:
  - Set up Live repository → Start Live session → Open Studio → Freeze topology.
  - All links carry `assignment`, `project`, `model`, `returnTo`.
- `RuntimeSessionServiceImpl` validates assignment/source/model/profile.
- `freezeTopology` only accepts sessions whose assignmentId/source/model match the Lab.
- Student Lab Step 3/4:
  - session list filtered by assignment/project/model;
  - frozen topology used;
  - quiz gate + `requireRuntimeTrace`;
  - evidence submission unchanged.
- Tests: HTTP acceptance lecturer + student, wrong project/source/model → 400/403, freeze mismatch → 409.

### Phase F — Production real acceptance
- Deploy V37 additive migration + probes.
- On production/staging:
  1. lecturer creates class/reference repo;
  2. build & pin images;
  3. configure runtime + topology;
  4. start Live session, STOP/START/SCALE, capture, finish, receipt, cleanup;
  5. freeze topology; publish Lab; issue Passkey;
  6. student enrolls, Quiz ≥80%, starts own session, Stop/Start/Scale, submits;
  7. lecturer grades snapshots >5.0 + summary; next Lab unlocks.
- Record SHA, sessionId, snapshot IDs, receipt digest/signature, metrics, cleanup, submission digest, grades.
- Optional: CI Docker job running the real test on every main push.

## 5. Data/API changes

### Migration V37
- `runtime_sessions.assignment_id UUID NULL REFERENCES assignments(id) ON DELETE SET NULL`.
- `runtime_sessions.lab_title_snapshot VARCHAR(255) NULL` (optional display snapshot).
- Index `(assignment_id, created_at DESC)`.

### API
- `POST /api/v1/analyzer/runtime/sessions` accepts `assignmentId` optional; validates scope.
- `POST /api/v1/analyzer/runtime/sessions/{id}/start`? existing flow.
- `GET /api/v1/analyzer/runtime/sessions/{id}` returns `assignmentId`, `labTitle`.
- `GET /api/v1/workspaces/{id}/course-labs/{assignmentId}/studio-sessions` lists sessions for a Lab.
- `POST /api/v1/workspaces/{id}/course-labs/{assignmentId}/freeze-topology` validates latest verified session if sessionId supplied (optional).
- `runtime_sessions` list query can filter by assignmentId.

### Frontend contracts
- `runtimeReadSessions` includes `assignmentId`, `labTitle`.
- Studio state includes assignment metadata.
- New wizard types for runtime blueprint/prepared topology.

## 6. Risks

- **RuntimeConfiguration is large/legacy.** Reuse and wrap; don't rewrite in one pass.
- **Image build/pin on production.** Runner must pull/build approved images; no arbitrary host commands.
- **Assignment/session mismatch.** Validate at every boundary; wrong project/source/model must fail closed.
- **Freeze from wrong session.** Require assignment/source/model match; otherwise 409.
- **Legacy sessions.** Null assignmentId remains valid; old links keep working.
- **No fake telemetry.** Controls remain tied to Runner confirmation and capability matrix.
- **Production test accounts.** Need user-provided staging/test accounts; do not use real student data.

## 7. Acceptance criteria

1. Lecturer sets up a reference repo and pins digest images from Lab Authoring.
2. Lecturer builds prepared topology visually, no raw JSON required.
3. Lecturer starts a real Live session, sees RUNNING, performs STOP/START/SCALE, captures Before/After, finishes, gets HMAC receipt, cleanup CONFIRMED.
4. Freeze topology only from a session matching the Lab source/model/assignment.
5. Student sees the Lab, passes Quiz ≥80%, starts a session using the frozen topology, and submits Live evidence.
6. Lecturer grades per snapshot >5.0 + summary; next Lab unlocks.
7. Wrong project/source/model or wrong session is rejected with a clear 400/403/409.
8. Production/staging two-account run recorded with SHA and evidence.

## 8. Open decisions

- Should lecturer authoring sessions be visible to students? Recommended: no; only summary/receipt used for authoring validation.
- Should the wizard be a separate route `/live-setup` or embedded in Lab Authoring? Recommended embedded, with optional deep link.
- Should image build happen on the VPS Runner host or prebuilt by lecturer? Recommended: prebuild/pin in the approved workflow, Runner pulls by digest; no host builds at Lab runtime.
- Should Phase 4 submission v2 ship before/after this plan? Recommended after Studio/Lab linkage is stable.
