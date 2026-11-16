# MAVIS · Stage 1 foundation

Date: 2026-10-20 (Asia/Saigon). Checkpoint 1 implementation candidate; owner review pending.

This baseline supports AI-Assisted Microservices Architecture Visualization and Change Impact Analysis, an educational platform. It does not introduce commercial SaaS, billing, vulnerability scanning, GitLab integration, or automatic analysis on every push.

## Scope and source of truth

Checkpoint 1 covers semantic tokens, appearance persistence, the shared shell, role/context navigation configurations, and representative interface specimens at `/design-system`. It does not implement all mapped screens or any backend contract. Navigation controls on the review page only preview selection; they do not change authorization or fetch data.

The owner's three diagrams supplied in the conversation are the primary navigation reference:

- `Các Sơ đồ KLTN v2 (mới)-WEB (Student).drawio.png`
- `Các Sơ đồ KLTN v2 (mới)-WEB (Lecturer).drawio (1).png`
- `Các Sơ đồ KLTN v2 (mới)-WEB (Admin).drawio (1).png`

Diagram labels are reference data. Grouping, screens, actions, and embedded evidence must remain distinct. Changes to this baseline require the checkpoint review process.

## Design tokens

`src/styles.css` is the executable token source. Tailwind v4 utilities are registered in `@theme inline`; both `src/` and App Router `app/` are scanned. All color definitions use OKLCH, preserving the existing convention.

- Primary: blue action emphasis (`primary`, `primary-foreground`, `primary-hover`). Light uses a deep blue with white text; Dark uses a pale blue with dark text.
- Secondary: neutral supporting actions (`secondary`, `secondary-foreground`).
- Surfaces: `background`, `card`, `popover`; each has its foreground partner. Dark surfaces have progressively higher lightness rather than transparent white layers.
- Text: `foreground` for content, `muted-foreground` for metadata and hints. Body content does not use opacity to create a muted color.
- Structure: `border` for separators; `input` is stronger for control boundaries. `ring` identifies keyboard focus.
- Selection: `selected` and `selected-foreground`, plus an outline/weight or written label. Selection is never conveyed by hue alone.
- Status: `success`, `warning`, `destructive`, `info` with `*-subtle` backgrounds. Destructive actions also have `destructive-foreground` and `destructive-hover`.
- Evidence: `source`/`source-subtle` (blue), `runtime`/`runtime-subtle` (teal), `ai`/`ai-subtle` (violet). Always pair these with written provenance and an icon.
- Technical surfaces: `code`, `code-foreground`, `graph-node`, `graph-edge`, `graph-affected`, `graph-affected-foreground`.
- Overlays: `overlay` provides the shared backdrop for the existing Dialog and Sheet primitives.
- Charts and sidebar aliases resolve to semantic tokens for compatibility with existing primitives.

Use the same spacing and structure across appearance modes. A theme-specific component redesign is not required.

### Typography

- UI font: Segoe UI, Inter if locally installed, system sans-serif. No network font dependency.
- Technical font: Cascadia Code, SFMono-Regular, Consolas, Liberation Mono, monospace.
- Page heading: 28px / 35px, weight 600, tight tracking.
- Section heading: 20px / 25px, weight 600.
- Subsection/card heading: 16px / 20px, weight 600.
- Body: 14px / 21px, weight 400. Longer explanatory paragraphs may use 24px line height.
- Labels/buttons: 14px, weight 500; compact navigation/controls: 12px / 20px.
- Captions, metadata, code: 12px / 18–21px, weight 400–500.
- 10–11px uppercase labels are limited to redundant grouping and preview annotations. Required content and statuses remain at least 12px.
- Identifiers, file paths, commits, source lines, model versions, timings, and counts use monospace where useful. Long identifiers wrap or scroll within their own region.

### Spacing and geometry

- Base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48px (`space-*`).
- Radii: 4px small, 6px control, 8px panel, 12px large surface; circles for avatars only.
- Sidebar: 256px expanded, 64px collapsed. Header: 64px.
- Cards: 24px padding; sections: 32px gap; grids: 24px gap.
- Page padding: 16px narrow, 32px desktop. Maximum content width: 1440px; technical canvases may deliberately fill available workspace width in later checkpoints.
- Forms: maximum width 640px; inputs 40px high. Default buttons 36px, small 32px, prominent actions 40px. Mobile forms should use 40–44px targets where density allows.
- Context panel: 360px at wide widths; stack below the main region below 1280px in the foundation. Critical workspaces may use a drawer at this breakpoint after their own review.

## Appearance behavior

The root layout resolves Light, Dark, or System before paint. Default and invalid saved values resolve to System. `mavis.appearance` stores only the appearance preference; it is not an account setting or credential. System follows `prefers-color-scheme` changes. Explicit Light/Dark ignore those changes. Storage events synchronize preference changes across tabs. When browser storage is unavailable, selection continues to work for the current page session. No authentication tokens are read or displayed.

`ThemeProvider` resolves the root class and native `color-scheme`. The header menu provides named radio choices. Specimens use explicit `data-theme` boundaries for paired Light/Dark comparisons. These boundaries are preview presentation, not independent application settings.

## Shared application shell

- Sidebar: MAVIS identity, role context, global navigation, a separate contextual section when relevant, and a Stage 1 review link.
- Header: sidebar control, breadcrumb/current screen, appearance menu, notifications, and account menu.
- Main: skip-link target, page title/action region supplied by the screen, and content.
- Optional contextual detail region: source/trace/element evidence with its own title, provenance, and close action.
- Feedback area: clearly identified design-review guidance; it does not submit feedback. Local specimen interactions use an accessible live region without claiming backend success.
- Notifications: visible disconnected preview state with no invented unread count.
- Profile: My Profile and Logout → Login follow all three flows. Until authentication/profile screens are implemented, these entries explicitly say planned and are disabled.
- Existing screens retain their route/component separation and bodies. The shared shell labels their fixture content as illustrative. The old overview dashboard is a compatibility screen, not a completed My Projects design.
- `AppShell` role/context props configure presentation only. They are not an access-control boundary. Stage 2 must obtain authorized roles and resource scope from the real application integration.

## Screen-flow mapping and hierarchy

All destinations below are mapped for design planning. Apart from compatibility screens noted below, their detailed layouts are **not implemented in checkpoint 1**. No URL or API contract is assigned to planned destinations.

### Shared account flow

- Login / Register (Student), Login (Lecturer/Admin): authentication screens outside the authenticated shell.
- Student Layout, Lecturer Layout, Admin Layout: configurations of the shared `AppShell`, not three independent layouts.
- Student navigation, Lecturer Navigation, Admin Navigation: navigation configurations, not content pages.
- Account / Account Menu: header dropdown. My Profile: planned screen. Logout → Login: session action, not a standalone content page.

### Student

- Global: My Projects; My Workspaces; My Submissions.
- My Projects → Project Overview: project-scoped workspace. Create / Edit Project: form dialog; Archive / Delete Project: confirmation actions. They are not sidebar destinations.
- Project Overview → Source Snapshots → Import Project Source: source import screen/workflow. Import from GitHub and Upload ZIP are methods within it. Analyze Source is an action leading to Analysis Result Details.
- Project Overview → Analysis History → Analysis Result Details: history screen and selected-result detail screen.
- Project Overview → Architecture Graph Explorer: graph workspace. Element Details and Evidence Viewer: contextual inspection areas, with accessible non-graphical inspection planned.
- Project Overview → Architecture Model Editor: editable model workspace, separate from source-inferred and submitted snapshots.
- Project Overview → Architecture Diagrams → Diagram Viewer: collection screen then focused viewer. Generate Diagram is an action, not another navigation item.
- Project Overview → Compare Model Versions: comparison workspace.
- Project Overview → Change Impact Analysis: impact workspace with target, dependency paths, evidence, and uncertainty.
- Runtime: navigation group containing Runtime Configuration, Runtime Scenarios, Runtime Sessions. Scenario Editor and Runtime Session Details are child screens; Run & Capture is an action.
- Project Overview → Submit Work Snapshot → Submission Details & Feedback: snapshot selection/confirmation action then submitted-version detail screen. Submitted data stays immutable in this view.
- Project Overview → AI Explanations → Explanation Details. Ask AI is a contextual action, not a full screen.
- My Workspaces → Workspace Details → Assignment Details → Project Overview: keep assignment/workspace context when opening the linked project. Join Workspace is a dialog/action.
- My Submissions → Submission Details and Feedback: the same submission-detail design as the snapshot submission result, with entry-specific breadcrumbs.

The project contextual sidebar is grouped into Project, Architecture, Runtime, and Explanations. It never replaces My Projects, My Workspaces, and My Submissions as global destinations.

### Lecturer

- Global Workspaces group → My Workspaces → Workspace Overview.
- Create / Update Workspace: dialog/form action within the workspace workflow.
- Workspace Overview → Workspace Members. Add / Remove Members: contextual actions with confirmation where necessary.
- Workspace Overview → Assignments → Assignment Editor / Assignment Details: list, editor, and detail screens.
- Workspace Overview → Reference Source Versions → Import Reference Source / Reference Source Viewer: version list, import screen, source viewer.
- GitHub URL + Branch / Commit and Upload ZIP: import methods. Publish Reference Snapshot: source-viewer action with review/confirmation.
- Workspace Overview → Assignment Submissions → Submission Details & Review: submission list then a separate review context.
- Submission Details & Review → Submitted Analysis Results / Submitted Architecture Explorer / Submitted Runtime Evidence: child views in the review workspace. Always show student, assignment, submitted version, and read-only context.
- Feedback Editor / Review Status: contextual editor/action. Export Submission / Report: export action.
- Feedback / Review History, Source / Trace Evidence Viewer, Saved AI Explanations: embedded review panels, not global navigation screens.

Teaching-workspace navigation and submitted-review navigation are separate configurations. Feedback remains editable without presenting the submitted source/model/results as editable project data.

### Administrator

- User Management → User Account List → User Account Details. Lock / Unlock Account: contextual action.
- Integrations → Integration Management → GitHub Integration Settings / AI Service Integration Settings. Test Connection and Save Candidate: actions in the settings form.
- Monitoring → System Health / Analysis Jobs / Platform Usage / Runtime Summary. Analysis Jobs → Analysis Job Details: child detail screen.
- Audit → Audit Records → Audit Record Details: list/detail pattern.
- Runtime Administration → Runtime Execution Profiles → Runtime Profile Editor / Runtime Profile Details. Validate / Test / Activate: distinct actions with visible results.
- Runtime Administration → Runtime Sessions → Runtime Session Details. Stop Runtime Session: contextual action requiring session context.

No billing, subscription, payment, revenue, commercial plan, or unrelated system dashboard is added.

## Reusable component standards and inventory

Use the existing Radix-based library as the interaction foundation. Checkpoint 1 updates Button, Input, and Badge, and replaces the fixed backdrop color in Dialog/Sheet with the overlay token. Other primitives are demonstrated through composition or specified for later adoption rather than silently refactored.

- Buttons: filled primary for the main action, outline/neutral for supporting actions, ghost for tertiary icon controls, explicit destructive styling for irreversible operations, native disabled states and visible focus. Every icon-only button has an accessible name.
- Inputs: visible persistent label, 40px control, helper/error text outside the field, invalid border plus icon/text, `aria-invalid` and `aria-describedby`. A placeholder never replaces the label.
- Selects: labeled controls, keyboard-operable native selects in the review harness; use the existing Select primitive where custom menus are needed. Keep native `color-scheme` aligned with appearance.
- Search: leading search icon, persistent accessible label, clear/reset path, and a scoped purpose. Do not imply unsupported platform-wide search.
- Cards: flat surface, subtle structural border, 8px radius, 24px padding, heading before supporting content. Avoid card-wrapped decoration and invented metrics.
- Tables: written caption, column/row headers, 40px header, approximately 48px data rows, monospaced identifiers, named status badges, and local horizontal overflow. Row selection must add a textual or programmatic state.
- Tabs: a small group for views of one context; selected background/text and programmatic state; arrow-key navigation through Radix. Do not duplicate global navigation as tabs.
- Badges: status/evidence labels with icons where useful. Noninteractive; do not add hover affordances. Colors have paired subtle surfaces in both themes.
- Alerts: icon, clear title, explanatory text, and optional recovery action. Static warnings do not need assertive live announcements; asynchronous outcomes use an appropriate live region.
- Modals: focused single decision or bounded form, explicit title/description, focus trap, Escape/close and return focus via Radix. Default width 512px within viewport margins; use semantic card/popover surfaces.
- Drawers: navigation on small viewports; context/evidence when side-by-side inspection is impractical. Keep title, provenance, close control, focus management, and long-content scrolling.
- Breadcrumbs: actual hierarchy, current page marked with `aria-current`. Collapse intermediate context on narrow screens, retaining the current destination.
- Tooltips: short supplemental clarification on hover/focus; never the sole place for required instructions, status, or evidence limitations.
- Empty states: name the missing item, explain its effect, offer one relevant next step. No fictional success or zero-valued metrics.
- Loading skeletons: reserve expected content shape, expose a named loading state, avoid invented percentage progress, respect reduced motion.
- Code/evidence: semantic technical surface, monospace content, source/version attribution, local overflow, and clear separation from AI interpretation.
- Notifications/local feedback: no fabricated unread indicators. Specimen outcomes explicitly describe local preview behavior.

### Graph language

Service nodes use `graph-node`, a readable label, and an element-kind label. Selected nodes use a 2px primary outline, selected surface, and a written Selected label. Directed source-inferred edges are solid; runtime-observed edges are dashed. Every legend names provenance, and arrowheads retain direction. Uncertain mappings use a warning icon, warning text, and a planned dotted relationship treatment; potentially affected services use the affected-token pair plus a written affected label. Do not equate affected with confirmed failure.

The specimen includes an accessible graph description and a non-graphical relationship list. Full filtering, graph editing, diagram export, and trace inspection are later checkpoint work. Partial traces must state the recorded session/scenario, captured subset, gaps, and uncertainty; they cannot imply complete runtime behavior.

## Responsive and accessibility guidance

- At 1280px and above: sidebar, main content, optional 360px detail panel. Allow technical workspaces to prioritize the canvas and move filters into a compact rail after their own review.
- At 1024–1279px: expanded/collapsible sidebar and main content; detail region stacks below. Keep primary actions adjacent to the page title.
- At 768–1023px: initialize the sidebar as a compact rail unless the user saved a preference. Maintain readable forms and let only technical regions scroll horizontally.
- Below 768px: replace the sidebar with a focus-managed navigation drawer; stack page actions/forms; shorten breadcrumbs. Preserve access to all navigation. Desktop remains the primary design target.
- Keyboard: skip link, semantic landmarks, visible 2px focus, accessible names, native disabled behavior, Radix menu/modal focus management.
- Contrast: target WCAG AA 4.5:1 for normal text and 3:1 for large text and essential control boundaries/focus. This is a verification target, not a blanket accessibility-certification claim.
- Status and provenance always include labels and/or icons. Never rely on hue alone. Reduced-motion preference minimizes existing primitive transitions and skeleton animation.

## Baseline preservation

After the owner approves the verified foundation, preserve the semantic token names, shell composition, flow hierarchy, evidence provenance conventions, and component contracts through Stage 2. Identify a concrete usability problem and obtain approval before redesigning or refactoring unrelated parts. Follow `stage-1-progress.md` for actual verification, known limits, and the next checkpoint.
