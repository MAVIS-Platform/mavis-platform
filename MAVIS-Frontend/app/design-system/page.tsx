"use client";

import { useId, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Code2,
  ExternalLink,
  FileCode2,
  FolderGit2,
  Info,
  Network,
  PanelRight,
  Plus,
  Search,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  contextualNavigation,
  evidenceKinds,
  globalNavigation,
  roleLabels,
  type AppRole,
  type WorkspaceScope,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const roles: AppRole[] = ["student", "lecturer", "admin"];
const startingItem: Record<AppRole, string> = {
  student: "projects",
  lecturer: "workspaces",
  admin: "users",
};
const colors = [
  { name: "Primary", token: "--primary", className: "bg-primary" },
  { name: "Surface", token: "--card", className: "border bg-card" },
  { name: "Selected", token: "--selected", className: "bg-selected" },
  { name: "Success", token: "--success", className: "bg-success" },
  { name: "Warning", token: "--warning", className: "bg-warning" },
  { name: "Error", token: "--destructive", className: "bg-destructive" },
] as const;

export default function DesignSystemPage() {
  const [role, setRole] = useState<AppRole>("student");
  const [scope, setScope] = useState<WorkspaceScope>("global");
  const [activeId, setActiveId] = useState("projects");
  const [tab, setTab] = useState("foundation");
  const [detailOpen, setDetailOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const contextGroups = contextualNavigation(role, scope);

  function changeRole(next: AppRole) {
    setNotice("");
    setRole(next);
    setScope("global");
    setActiveId(startingItem[next]);
  }

  function changeScope(next: WorkspaceScope) {
    setNotice("");
    setScope(next);
    setActiveId(contextualNavigation(role, next)[0]?.items[0]?.id ?? startingItem[role]);
  }

  function previewNavigate(id: string) {
    if (globalNavigation[role].some((group) => group.items.some((item) => item.id === id))) {
      setScope("global");
    }
    setActiveId(id);
    setNotice(
      `Navigation preview: ${[...globalNavigation[role], ...contextGroups].flatMap((group) => group.items).find((item) => item.id === id)?.label ?? id}. Screen content is planned for a later checkpoint.`,
    );
  }

  return (
    <AppShell
      role={role}
      scope={scope}
      activeId={activeId}
      pageTitle="Design foundation"
      contextName={
        scope === "review"
          ? "Sample submission · version 2"
          : scope === "project"
            ? "Sample learning project"
            : "Sample teaching workspace"
      }
      onPreviewNavigate={previewNavigate}
      contentVariant="standard"
      onDetailClose={() => setDetailOpen(false)}
      detailPanel={detailOpen ? <EvidencePanel onClose={() => setDetailOpen(false)} /> : undefined}
    >
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span>MAVIS / Stage 1</span>
            <span aria-hidden="true">·</span>
            <span>Checkpoint 01</span>
          </div>
          <h1 className="mavis-page-title">Design foundation</h1>
          <p className="mt-2 max-w-xl text-base leading-6 text-muted-foreground">
            One visual language for learning, exploring architecture, and reviewing evidence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Awaiting review</Badge>
          <Button
            variant="outline"
            onClick={() => setDetailOpen(!detailOpen)}
            aria-expanded={detailOpen}
          >
            <PanelRight />
            {detailOpen ? "Hide details" : "Inspect evidence"}
          </Button>
        </div>
      </div>

      <div className="mb-7 flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4">
        <div>
          <label htmlFor="preview-role" className="mb-1.5 block text-xs font-medium">
            Preview role
          </label>
          <select
            id="preview-role"
            value={role}
            onChange={(event) => changeRole(event.target.value as AppRole)}
            className="h-9 max-w-full rounded-md border border-input bg-card px-3 text-xs"
          >
            {roles.map((value) => (
              <option key={value} value={value}>
                {roleLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="preview-context" className="mb-1.5 block text-xs font-medium">
            Navigation context
          </label>
          <select
            id="preview-context"
            value={scope}
            onChange={(event) => changeScope(event.target.value as WorkspaceScope)}
            className="h-9 rounded-md border border-input bg-card px-3 text-xs"
          >
            <option value="global">Global navigation</option>
            {role === "student" && <option value="project">Project workspace</option>}
            {role === "lecturer" && (
              <>
                <option value="workspace">Teaching workspace</option>
                <option value="review">Submission review</option>
              </>
            )}
          </select>
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">
          Review controls only. Role preview does not grant access.
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="mb-5 flex items-start gap-2 rounded-md border bg-card p-3 text-xs">
            <Info className="mt-0.5 size-4 shrink-0 text-info" />
            <span className="flex-1 leading-5">{notice}</span>
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss preview feedback"
              className="rounded p-0.5"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="mb-7 overflow-x-auto border-b pb-4">
          <TabsList aria-label="Foundation sections" className="h-auto gap-1 bg-transparent p-0">
            <TabsTrigger
              value="foundation"
              className="px-3 py-2 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground data-[state=active]:shadow-none"
            >
              Foundation
            </TabsTrigger>
            <TabsTrigger
              value="components"
              className="px-3 py-2 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground data-[state=active]:shadow-none"
            >
              Components
            </TabsTrigger>
            <TabsTrigger
              value="navigation"
              className="px-3 py-2 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground data-[state=active]:shadow-none"
            >
              Navigation
            </TabsTrigger>
            <TabsTrigger
              value="evidence"
              className="px-3 py-2 data-[state=active]:bg-selected data-[state=active]:text-selected-foreground data-[state=active]:shadow-none"
            >
              Evidence language
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="foundation" className="space-y-8">
          <section aria-labelledby="theme-specimens">
            <SectionIntro
              number="01"
              title="A consistent view, in either light"
              description="The same structure and semantic tokens. Appearance changes the palette, never the information hierarchy."
              id="theme-specimens"
            />
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ThemeSpecimen mode="light" />
              <ThemeSpecimen mode="dark" />
            </div>
          </section>
          <section aria-labelledby="semantic-palette">
            <SectionIntro
              number="02"
              title="Purposeful color"
              description="Neutral surfaces establish hierarchy. Color identifies an action, a selection, or a named status."
              id="semantic-palette"
            />
            <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
              {colors.map((color) => (
                <div key={color.name}>
                  <div className={cn("mb-3 h-12 rounded-md", color.className)} />
                  <p className="text-xs font-medium">{color.name}</p>
                  <code className="text-[11px] text-muted-foreground">{color.token}</code>
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-8 xl:grid-cols-[1.2fr_1fr]">
            <section aria-labelledby="typography">
              <SectionIntro
                number="03"
                title="Readable by design"
            description="Self-hosted Inter supports readable technical documentation. Technical identifiers retain a dedicated monospace stack."
                id="typography"
              />
              <div className="mt-5 space-y-5 border-l-2 border-primary pl-5">
                <div>
                  <p className="mavis-page-title">Explore the architecture</p>
                  <p className="mavis-caption mt-1">Page title · 32 / 40 desktop · 28 / 36 mobile · semibold</p>
                </div>
                <div>
                  <p className="mavis-section-title">Architectural elements</p>
                  <p className="mavis-caption mt-1">Section heading · 24 / 32 · semibold</p>
                </div>
                <div>
                  <p className="text-base leading-6">
                    Trace a relationship from its source to its supporting evidence.
                  </p>
                  <p className="mavis-caption mt-1">Body · 16 / 24 · regular; data and navigation · 14 / 20</p>
                  <p className="mt-3 text-base leading-6">Clear architecture. Traceable evidence.</p>
                </div>
                <div>
                  <code className="mavis-code inline-block px-2 py-1">
                    order-service / src/OrderController.ts:42
                  </code>
                  <p className="mavis-caption mt-1">Technical identifiers · 13 / 20 · monospace</p>
                </div>
              </div>
            </section>
            <section aria-labelledby="geometry">
              <SectionIntro
                number="04"
                title="A measured rhythm"
                description="A 4px base scale and restrained geometry across every role."
                id="geometry"
              />
              <dl className="mt-5 divide-y border-y">
                {[
                  ["Spacing", "4 · 8 · 12 · 16 · 24 · 32 · 48px"],
                  ["Corner radii", "8px technical · 12px control · 16px card · 24px dialog"],
                  ["Sidebar", "256px / 72px collapsed"],
                  ["Header / detail panel", "64px / 360px"],
                  ["Cards / page padding", "24px / 16–32px"],
                  ["Content / reading / form", "1200px / 720px / 640px"],
                  ["Technical workspace", "Fluid · 3 panes only when main ≥1200px"],
                ].map(([name, value]) => (
                  <div key={name} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                    <dt className="text-muted-foreground">{name}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="components">
          <ComponentSpecimens onFeedback={setNotice} onDetails={() => setDetailOpen(true)} />
        </TabsContent>
        <TabsContent value="navigation" className="space-y-7">
          <SectionIntro
            number="05"
            title="A place for every task"
            description="The supplied screen flows define the hierarchy. Global destinations stay separate from project, workspace, and submission context."
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="mavis-panel p-6">
              <h2 className="mavis-section-title">{roleLabels[role]} · global</h2>
              <NavigationInventory groups={globalNavigation[role]} />
            </section>
            <section className="mavis-panel p-6">
              <h2 className="mavis-section-title">
                {scope === "global" ? "Context lives within a workspace" : "Contextual navigation"}
              </h2>
              {contextGroups.length > 0 ? (
                <NavigationInventory groups={contextGroups} />
              ) : (
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Choose a Project workspace for Student, or a Teaching workspace / Submission
                  review for Lecturer, using the preview controls above. Admin destinations are
                  grouped by responsibility.
                </p>
              )}
            </section>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {[
              [
                "Screens",
                "Persistent destinations such as Source Snapshots, Assignment Details, and Analysis Jobs.",
              ],
              [
                "Actions & dialogs",
                "Create / edit / archive / delete, join, import method, test, publish, run, export, and submit stay within their parent workflow.",
              ],
              [
                "Contextual panels",
                "Element details, source / trace evidence, feedback history, and saved AI explanations stay beside the selected result.",
              ],
            ].map(([title, description]) => (
              <section key={title} className="border-t pt-4">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{description}</p>
              </section>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="evidence" className="space-y-7">
          <SectionIntro
            number="06"
            title="Evidence has a visible origin"
            description="Source-inferred relationships, scoped runtime observations, and AI explanations stay distinct in every workspace."
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {evidenceKinds.map((kind) => (
              <section key={kind.id} className="mavis-panel p-5">
                <Badge variant={kind.id}>
                  <kind.icon />
                  {kind.label}
                </Badge>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {kind.id === "source"
                    ? "A relationship inferred from a specific source snapshot. Show the file, symbol, and model version."
                    : kind.id === "runtime"
                      ? "An interaction observed during a named session and scenario. State capture gaps and execution limits."
                      : "A generated explanation grounded in cited evidence. Separate generated interpretation from recorded facts."}
                </p>
              </section>
            ))}
          </div>
          <div className="mavis-panel p-6">
            <GraphSpecimen instance="full" />
            <div className="mt-5 rounded-md border border-warning/30 bg-warning-subtle p-4 text-warning">
              <p className="flex items-center gap-2 text-sm font-medium">
                <TriangleAlert className="size-4" />
                Partial capture does not describe complete behavior
              </p>
              <p className="mt-1 text-xs leading-6">
                Example: only the selected scenario and captured spans are represented. Missing
                spans, unexecuted paths, and uncertain mappings remain explicit.
              </p>
            </div>
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-medium">
                Inspect relationships as a list
              </summary>
              <ul className="mt-3 space-y-2 pl-4 text-muted-foreground">
                <li>gateway → order-service · source-inferred · solid directed edge</li>
                <li>order-service → catalog-service · runtime-observed · dashed directed edge</li>
                <li>order-service · selected · outline and “Selected” label</li>
              </ul>
            </details>
          </div>
        </TabsContent>
      </Tabs>
      <footer className="mt-10 flex flex-wrap justify-between gap-2 border-t pt-4 text-[11px] text-muted-foreground">
        <span>
          MAVIS · AI-Assisted Microservices Architecture Visualization and Change Impact Analysis
        </span>
        <span>Foundation review · No backend connected</span>
      </footer>
    </AppShell>
  );
}

function SectionIntro({
  number,
  title,
  description,
  id,
}: {
  number: string;
  title: string;
  description: string;
  id?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 font-mono text-xs text-muted-foreground">{number}</span>
      <div>
        <h2 id={id} className="mavis-section-title">
          {title}
        </h2>
        <p className="mt-1.5 max-w-2xl text-xs leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ThemeSpecimen({ mode }: { mode: "light" | "dark" }) {
  return (
    <article
      data-theme={mode}
      aria-label={`${mode} theme specimen`}
      className="overflow-hidden rounded-lg border bg-background text-foreground"
    >
      <div className="flex items-center justify-between border-b bg-card px-5 py-3">
        <span className="text-xs font-semibold capitalize">{mode} appearance</span>
        <span className="text-[10px] text-muted-foreground">Representative specimen</span>
      </div>
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md border bg-card">
              <FolderGit2 className="size-4 text-primary" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Learning project</h3>
              <p className="text-[10px] text-muted-foreground">Source v3 · Model v2 · sample</p>
            </div>
          </div>
          <Badge variant="success">
            <CheckCircle2 />
            Analyzed
          </Badge>
        </div>
        <div className="mt-4 overflow-hidden rounded-md border bg-card">
          <GraphSpecimen instance={mode} compact />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="source">
              <Code2 />
              Source
            </Badge>
            <Badge variant="runtime">
              <Activity />
              Runtime
            </Badge>
          </div>
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Explore model <ArrowRight className="ml-1 inline size-3" />
          </span>
        </div>
      </div>
    </article>
  );
}

function GraphSpecimen({ instance, compact = false }: { instance: string; compact?: boolean }) {
  const uniqueId = useId().replace(/:/g, "");
  const marker = `arrow-${instance}-${uniqueId}`;
  return (
    <figure>
      <div
        className={cn("flex items-center justify-between gap-2", compact ? "px-3 pt-3" : "mb-3")}
      >
        <figcaption className="text-[10px] font-medium text-muted-foreground">
          Graph language · illustrative relationships
        </figcaption>
        <Network className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 590 180"
          role="img"
          aria-label={compact ? "gateway connects to selected order-service through a source-inferred edge." : "gateway connects to selected order-service through a source-inferred edge. order-service connects to catalog-service through a dashed runtime-observed edge."}
          className={cn("block w-full", compact ? "h-40 min-w-[380px]" : "h-52 min-w-[590px]")}
        >
          <defs>
            <marker id={marker} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.5" />
            </marker>
          </defs>
          <path
            d="M154 90 H216"
            stroke="var(--source)"
            strokeWidth="1.8"
            markerEnd={`url(#${marker})`}
          />
          <path
            d="M374 90 H436"
            stroke="var(--runtime)"
            strokeWidth="1.8"
            strokeDasharray="6 4"
            markerEnd={`url(#${marker})`}
          />
          {[
            { x: 10, name: "gateway", selected: false },
            { x: 224, name: "order-service", selected: true },
            { x: 444, name: "catalog-service", selected: false },
          ].map((node) => (
            <g key={node.name}>
              <rect
                x={node.x}
                y="57"
                width="136"
                height="66"
                rx="6"
                fill={node.selected ? "var(--selected)" : "var(--graph-node)"}
                stroke={node.selected ? "var(--primary)" : "var(--input)"}
                strokeWidth={node.selected ? "2" : "1"}
              />
              <text
                x={node.x + 12}
                y="83"
                fill="var(--foreground)"
                fontSize="11"
                fontWeight="600"
                fontFamily="var(--font-technical)"
              >
                {node.name}
              </text>
              <text
                x={node.x + 12}
                y="105"
                fill={node.selected ? "var(--selected-foreground)" : "var(--muted-foreground)"}
                fontSize="10"
                fontFamily="var(--font-ui)"
              >
                {node.selected ? "Selected service" : "Service"}
              </text>
            </g>
          ))}
        </svg>
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="w-6 border-t-2 border-source" />
            Source-inferred
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-6 border-t-2 border-dashed border-runtime" />
            Runtime-observed
          </span>
          <span className="inline-flex items-center gap-2">
            <TriangleAlert className="size-3.5 text-warning" />
            Warnings always include text
          </span>
        </div>
      )}
    </figure>
  );
}

function ComponentSpecimens({
  onFeedback,
  onDetails,
}: {
  onFeedback: (message: string) => void;
  onDetails: () => void;
}) {
  const [query, setQuery] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const rows = [
    { service: "order-service", file: "src/orders/OrderController.ts", status: "Source-inferred" },
    {
      service: "catalog-service",
      file: "src/catalog/CatalogClient.ts",
      status: "Runtime-observed",
    },
  ].filter((row) => row.service.includes(query.toLowerCase()));
  return (
    <div className="space-y-8">
      <SectionIntro
        number="05"
        title="Reusable, predictable controls"
        description="Representative examples use the existing component library. Actions below demonstrate local interface feedback only."
      />
      <section className="mavis-panel p-6">
        <h2 className="mavis-section-title">Actions & status</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            onClick={() => onFeedback("Primary action example activated. No analysis was started.")}
          >
            <Plus />
            Primary action
          </Button>
          <Button variant="outline" onClick={onDetails}>
            <ExternalLink />
            View evidence
          </Button>
          <Button
            variant="secondary"
            onClick={() => onFeedback("Secondary action example activated.")}
          >
            Secondary
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Destructive example</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] rounded-lg border bg-card sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Confirm a destructive action</DialogTitle>
                <DialogDescription>
                  Use explicit consequences and an action-specific label. This specimen does not
                  modify project data.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="destructive"
                    onClick={() =>
                      onFeedback("Confirmation example completed. No project data was changed.")
                    }
                  >
                    Confirm example
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button disabled>Unavailable</Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Badge variant="success">
            <CheckCircle2 />
            Completed
          </Badge>
          <Badge variant="warning">
            <TriangleAlert />
            Needs attention
          </Badge>
          <Badge variant="destructive">
            <CircleAlert />
            Failed
          </Badge>
          <Badge variant="info">
            <Info />
            In progress
          </Badge>
          <Badge variant="outline">Not captured</Badge>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="mavis-panel p-6">
          <h2 className="mavis-section-title">Form states</h2>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="snapshot-label" className="mavis-label">
                Snapshot label <span className="text-xs text-muted-foreground">(required)</span>
              </label>
              <Input
                id="snapshot-label"
                placeholder="e.g. Initial source snapshot"
                value={snapshotName}
                onChange={(event) => setSnapshotName(event.target.value)}
                aria-invalid={!snapshotName.trim()}
                aria-describedby="snapshot-hint"
              />
              <p
                id="snapshot-hint"
                className={cn(
                  "mt-2 flex items-center gap-1.5 text-xs",
                  snapshotName.trim() ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {snapshotName.trim() ? (
                  <>
                    <Check className="size-3.5" />
                    Label ready · local example
                  </>
                ) : (
                  <>
                    <CircleAlert className="size-3.5" />
                    Enter a label to identify this snapshot.
                  </>
                )}
              </p>
            </div>
            <div>
              <label htmlFor="source-example" className="mavis-label">
                Source version
              </label>
              <Input id="source-example" value="source-v3 · read-only example" disabled />
            </div>
          </div>
        </section>
        <section className="mavis-panel p-6">
          <h2 className="mavis-section-title">Warnings & help</h2>
          <div className="mt-5 rounded-md border border-warning/30 bg-warning-subtle p-4 text-warning">
            <p className="flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4 shrink-0" />
              Relationship mapping is uncertain
            </p>
            <p className="mt-2 text-xs leading-6">
              Inspect the cited source before accepting this relationship. Uncertainty is shown with
              an icon and a written explanation.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
            Evidence availability
            <Tooltip>
              <TooltipTrigger asChild>
                <button aria-label="About evidence availability" className="rounded p-1">
                  <Info className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Evidence is scoped to its source snapshot or recorded runtime session.
              </TooltipContent>
            </Tooltip>
          </div>
        </section>
      </div>
      <section className="mavis-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
          <div>
            <h2 className="mavis-section-title">Technical data table</h2>
            <p className="mavis-caption mt-1">
              Illustrative rows · search filters this example only
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <label htmlFor="service-search" className="sr-only">
              Filter example services
            </label>
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              id="service-search"
              className="pl-9"
              placeholder="Filter services…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[580px] text-left text-xs">
            <caption className="sr-only">
              Example service evidence table, not live analysis results
            </caption>
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Service
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Supporting source
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Evidence kind
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.service} className="border-t hover:bg-accent/50">
                  <th scope="row" className="px-5 py-4 font-mono font-medium">
                    {row.service}
                  </th>
                  <td className="px-5 py-4 font-mono text-muted-foreground">{row.file}</td>
                  <td className="px-5 py-4">
                    <Badge variant={row.status === "Source-inferred" ? "source" : "runtime"}>
                      {row.status === "Source-inferred" ? <Code2 /> : <Activity />}
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                    No example services match “{query}”.{" "}
                    <button className="rounded text-primary underline" onClick={() => setQuery("")}>
                      Clear filter
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="mavis-panel flex flex-col items-center p-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-muted">
            <FileCode2 className="size-5 text-muted-foreground" />
          </span>
          <h2 className="mt-4 text-sm font-semibold">No source snapshot yet</h2>
          <p className="mt-2 max-w-xs text-xs leading-6 text-muted-foreground">
            An empty state explains what is missing and gives one useful next step.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() =>
              onFeedback(
                "Import entry point example. GitHub / ZIP import remains in the source snapshot workflow.",
              )
            }
          >
            <Plus />
            Import source example
          </Button>
        </section>
        <section className="mavis-panel p-6">
          <h2 className="mavis-section-title">Loading state</h2>
          <p className="mavis-caption mt-1">
            Reserved space prevents layout shifts. No invented progress.
          </p>
          <div
            role="status"
            aria-label="Loading specimen"
            className="mt-6 space-y-4 motion-safe:animate-pulse"
          >
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-3 w-4/5 rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-12 rounded bg-muted" />
            <span className="sr-only">Loading example content</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function NavigationInventory({ groups }: { groups: ReturnType<typeof contextualNavigation> }) {
  return (
    <div className="mt-5 space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h3>
          <ul className="mt-2 space-y-3">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 text-xs">
                <item.icon className="size-4 shrink-0 text-muted-foreground" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EvidencePanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Contextual evidence
        </p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel">
          <X />
        </Button>
      </div>
      <div>
        <Badge variant="source">
          <Code2 />
          Source-inferred
        </Badge>
        <h2 className="mt-4 font-mono text-base font-semibold">order-service</h2>
        <p className="mt-1 text-xs text-muted-foreground">Illustrative evidence · source v3</p>
      </div>
      <dl className="space-y-3 border-y py-4 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Element kind</dt>
          <dd>Service</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Model version</dt>
          <dd className="font-mono">model-v2</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Source location</dt>
          <dd className="font-mono">OrderController.ts:42</dd>
        </div>
      </dl>
      <div>
        <h3 className="text-xs font-semibold">Source excerpt specimen</h3>
        <pre className="mavis-code mt-3 overflow-x-auto p-3">
          <code>
            {'42  router.get("/orders", listOrders);\n43  // Source excerpt example only'}
          </code>
        </pre>
      </div>
      <div className="rounded-md bg-runtime-subtle p-3 text-xs leading-6 text-runtime">
        <p className="flex items-center gap-2 font-medium">
          <Activity className="size-4" />
          Runtime evidence is separate
        </p>
        <p className="mt-1">
          A source relationship does not confirm execution. Cite a captured session before marking
          it runtime-observed.
        </p>
      </div>
      <div>
        <Badge variant="ai">
          <Sparkles />
          AI explanation
        </Badge>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Generated interpretation must cite its source or trace evidence and state uncertainty.
        </p>
      </div>
    </div>
  );
}
