# Frontend Performance Optimization

Date: 2026-11-01

## A. Executive summary

Implemented six localized optimizations covering computation, network requests,
and rendering/DOM work. No dependencies, API schemas, endpoints, permissions,
authentication flows, or navigation behavior were changed. Existing authentication
changes from the preceding task were preserved.

The changes remove duplicate graph work, disable unused model-detail fetching on
Snapshots, reuse runtime SVG output, abort obsolete AI enrichment requests, and
translate changed DOM subtrees instead of repeatedly scanning the entire page.

This is not an architectural redesign. The underlying graph layout algorithm,
query invalidation policy, and backend collection contracts remain intact.

## B. Inspection, priorities, and optimization details

All findings below were confirmed by source inspection before implementation.
They are P1 changes: unnecessary work with a small, identifiable execution path.
No new Critical/P0 issue was established.

| Finding | Objective | Files changed, relative to frontend root | Root cause / existing execution flow | Optimization |
|---|---|---|---|---|
| F04 | Computation | `src/features/architecture/dependency-network.tsx` | Parent supplies projection/connections, but child memo callbacks still compute fallback values before selecting the controlled inputs. Existing `useMemo` does not prevent this work when dependencies change. | Short-circuit fallback computations inside the memo callbacks. Existing controlled/uncontrolled behavior is retained. |
| F13 | Computation | `src/features/architecture/cytoscape-network.ts`, `dependency-network.tsx` | Element preparation calculates positions, then Cytoscape initialization calculates them again for the viewport. Existing camera snapshots already store usable positions. | Defer positions in the interactive metadata path; compute once at initialization, or not at all when the saved camera covers every visible node. Standalone callers keep preset positions. |
| F10 | Network / computation | `src/features/architecture/use-model.ts`, `src/features/projects/screens.tsx` | Snapshots consumes only `models`, while `useModel()` enables the selected full model query. TanStack Query deduplicates requests but cannot eliminate an unnecessarily enabled resource. | Add an opt-out for detail fetching; Snapshots uses it. Query keys, summary sorting, model URL selection and default behavior for other callers remain unchanged. Memoize summary ordering by the returned summary data reference. |
| F06 | Rendering / computation | `src/features/runtime/backend.tsx` | Updating local zoom state regenerates SVG even though trace steps/title are unchanged. | Memoize SVG generation by steps reference and title. Zoom still updates the same UI; new trace data regenerates SVG. |
| F12 | Network / resource lifecycle | `src/features/architecture/architecture-diagrams.tsx`, `uml-diagram-workspace.tsx`, `selection-three-e.tsx`, `src/features/ai-explanations/components.tsx` | Existing cleanup flags suppress late state updates but do not abort native fetch requests. The shared query adapter already supports cancellation; these particular requests bypass it. | Give each enrichment effect its own AbortController; abort on cleanup and keep the existing late-result guard, cache checks, payloads and fallback/error handling. No business mutation is cancelled. |
| F19 | DOM / computation | `src/lib/i18n/locale-context.tsx` | Vietnamese MutationObserver schedules a full-body TreeWalker/attribute scan after page mutations. Existing rAF batching and WeakMaps do not limit the scanned subtree. | Batch changed text/added subtrees, deduplicate nested roots, skip detached nodes and already translated text, and disconnect observation during translation writes. Translate root text and root attributes as well as descendants. Full scans remain for locale changes, including English restoration. |

Regression coverage was added in `tests/frontend-performance.test.cjs` and included
in the existing `npm test` command. No lockfile or dependency changes were needed.

### Consistency and lifecycle rules

- There is no new global model/layout cache. The existing component-owned camera
  snapshots retain their lifetime and mode separation. A missing saved node
  requires layout; saved positions remain authoritative just as before.
- Memoized runtime SVG is invalidated when steps or title change. This relies on
  the existing immutable server-state update pattern.
- Memoized model ordering depends on summary data; response arrays are not sorted
  in place. Existing TanStack Query keys and invalidation behavior are retained.
- AI results remain scoped to their effect lifetime. Aborted and late responses
  cannot update an inactive view. Current responses still update the active view.
  Browser cancellation does not prove that a remote AI provider stopped work.
- Translation retains the existing WeakMaps and skip rules. Locale changes perform
  a full pass; effect cleanup disconnects the observer, clears pending nodes and
  cancels its frame.

## C. Before/after comparison

Execution counts were measured with the same in-memory TypeScript/component
harness against baseline source from HEAD and the optimized source. Cytoscape was
headless and browser observers/DOM were controlled test doubles. These counts are
not browser timing, FPS, Web Vitals, or real backend traffic measurements.

| Metric | Before | After | Measurement status |
|---|---:|---:|---|
| Layout calls during interactive graph metadata preparation | 1 | 0 | Measured with a layout spy |
| Total layout calls during cold graph initialization | 2 | 1 | Measured with component harness and headless Cytoscape |
| Runtime SVG generation: initial render followed by one zoom | 2 | 1 | Measured against baseline and optimized component |
| Text nodes visited after changing one text in a 1,000-text-node fixture | 1,000 | 1 | Measured with identical DOM harness |
| Actual API request count | Not Measured | Not Measured | No authenticated backend traffic session |
| Duplicate HTTP requests | Not Measured | Not Measured | Query enablement and abort behavior tested instead |
| Actual React component render count | Not Measured | Not Measured | No browser React Profiler session |
| Browser DOM mutation count | Not Measured | Not Measured | Visited nodes were counted, not browser mutation records |
| Main-thread duration / INP / LCP | Not Measured | Not Measured | No connected browser |

Additional regression assertions verify that selection does not reinitialize the
graph, a complete saved camera adds no layout call, summary-only model access
disables the detail query, ordinary model access still enables it, obsolete
requests abort, and current/late AI responses behave correctly.

## D. Regression verification

- Six new performance regression tests pass.
- Full frontend unit/contract/semantic suite: **346 passed, 1 failed, 347 total**.
  The failure is the existing Profile Vietnamese-label test. HEAD already contains
  corrupted translations such as `Th?ng tin c? nh?n` and `B?o m?t t?i kho?n`.
  This optimization does not change those dictionary entries or the failing test.
- TypeScript check passes.
- Production build passes, including Next.js type validation. The initial sandbox
  attempt failed with `spawn EPERM`; the permitted retry succeeded using an
  isolated `.next-integration/performance` output directory.
- Production HTTP smoke check: **38 routes checked, 0 server-render failures**.
  This covers route rendering, not browser hydration or authenticated end-to-end
  behavior.
- Repository lint, excluding generated build/artifact directories, still fails
  with existing violations. Baseline-versus-current lint comparisons for affected
  existing files found no added violations after the hook dependency correction.
  The new test file and the directly changed graph/model-hook code pass the
  targeted behavioral lint check with the existing formatting rule disabled.
- Tests cover graph identity/edges and camera behavior, immutable model revisions,
  auth/OTP behavior, navigation, source validation, runtime prerequisites,
  evidence provenance, AI grounding, and Student/Lecturer semantics. They do not
  replace real GitHub, SMTP, Java, or AI-provider integration testing.
- No browser was available through the connected Browser runtime. No claim is made
  about visual fidelity, browser interaction latency, hydration, or Lighthouse.

Build-generated changes to tracked `.next` files, `next-env.d.ts`, and
`tsconfig.json` are excluded from the implementation and restored after checks.

## E. Remaining recommendations

### Within the current architecture

- F01/F02: measure route bundles before introducing lazy loading or separating
  mock adapter loading. This change did not implement either.
- F03: add route loading boundaries only where navigation measurements justify them.
- F05: profile inspector state updates and expensive subject/communication work.
- F11: measure list/detail polling overlap and terminal invalidation frequency
  before altering freshness behavior.
- F14: the existing synchronous force/collision/slot layout can still be expensive.
  Duplicate execution is removed, but the algorithm itself is unchanged. Evaluate
  worker execution after browser profiling.
- F15/F16: consider incremental Cytoscape updates and diff-based highlighting for
  large graphs; preserve all relationship and camera semantics.
- F17/F18: bound client enrichment caches with explicit eviction rules and consider
  cancellation of obsolete ELK layouts. Existing ELK termination/timeouts remain.
- F20/F21/F22: profile inspector resizing, actual optimized logo transfer, and large
  trace/selector DOM before adding throttling, image changes, or windowing.
- Correct existing Profile translation corruption and lint debt separately.

### Requires backend coordination for a complete solution

- F07/F08/F09: overview/workspace/submission fan-out still exists. Concurrency
  limits can reduce bursts in the BFF but do not eliminate request counts. Genuine
  summary/pagination improvements need verified backend support; no new endpoints
  or response shapes were introduced here.
- BFF-S1: source enrichment can synchronously scan/read source files when model
  metadata is incomplete. Profile this conditional path before deciding whether
  to cache immutable snapshot metadata or move preparation into analysis.
- Propagate cancellation to AI provider calls if stopping obsolete upstream work
  is required. Browser abort alone is insufficient evidence.

### Architectural changes outside scope

Replacing state management, the graph renderer, API architecture, or introducing
a distributed cache/subscription system is not justified by these localized
findings and was not attempted.

## F. Final status

| Finding | Status |
|---|---|
| F04, F06, F10, F12, F13, F19 | Fixed and verified by targeted automated regression tests; browser/authenticated integration verification remains unavailable |
| F01, F02, F03, F05, F11, F14, F15, F16, F17, F18, F20, F21, F22 | Not fixed — require further investigation or a separate measured change |
| F07, F08, F09, BFF-S1 | Deferred — broader data-loading/backend work outside this localized implementation |

No new regression was found in the executed checks. The pre-existing unit-test
failure and lint violations prevent claiming a completely green repository.
