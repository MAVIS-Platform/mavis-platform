import {
  Activity,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Code2,
  FileClock,
  FileCode2,
  FileSearch,
  Files,
  FolderGit2,
  GitCompareArrows,
  GitFork,
  LayoutGrid,
  ListChecks,
  Network,
  Play,
  Plug,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { AppRole } from "@/types/domain";
export type { AppRole } from "@/types/domain";
export type WorkspaceScope = "global" | "project" | "workspace" | "review";

export type NavigationItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  // Only existing screen implementations have an href. Planned screens never
  // point at nonexistent routes. These are UI routes, not backend contracts.
  href?: string;
};

export type NavigationGroup = {
  label: string;
  items: readonly NavigationItem[];
};

export const roleLabels: Record<AppRole, string> = {
  student: "Student / Individual Learner",
  lecturer: "Lecturer",
  admin: "System Administrator",
};

export const globalNavigation: Record<AppRole, readonly NavigationGroup[]> = {
  student: [
    {
      label: "Personal",
      items: [{ id: "projects", label: "My Projects", icon: FolderGit2, href: "/" }],
    },
    {
      label: "Education",
      items: [
        { id: "workspaces", label: "My Workspaces", icon: Users, href: "/workspaces" },
        { id: "submissions", label: "My Submissions", icon: ClipboardCheck, href: "/submissions" },
      ],
    },
  ],
  lecturer: [
    {
      label: "Workspaces",
      items: [{ id: "workspaces", label: "My Workspaces", icon: Users, href: "/workspaces" }],
    },
  ],
  admin: [
    {
      label: "User Management",
      items: [
        { id: "users", label: "User Account List", icon: Users, href: "/administration/users" },
      ],
    },
    {
      label: "Integrations",
      items: [
        {
          id: "integrations",
          label: "Integration Management",
          icon: Plug,
          href: "/administration/integrations",
        },
      ],
    },
    {
      label: "Monitoring",
      items: [
        { id: "health", label: "System Health", icon: Activity, href: "/administration/health" },
        { id: "jobs", label: "Analysis Jobs", icon: ListChecks, href: "/administration/jobs" },
        { id: "usage", label: "Platform Usage", icon: LayoutGrid, href: "/administration/usage" },
        {
          id: "runtime-summary",
          label: "Runtime Summary",
          icon: Server,
          href: "/administration/runtime-summary",
        },
      ],
    },
    {
      label: "Audit",
      items: [
        { id: "audit", label: "Audit Records", icon: ScrollText, href: "/administration/audit" },
      ],
    },
    {
      label: "Runtime Administration",
      items: [
        {
          id: "profiles",
          label: "Runtime Execution Profiles",
          icon: ShieldCheck,
          href: "/administration/profiles",
        },
        {
          id: "admin-sessions",
          label: "Runtime Sessions",
          icon: Play,
          href: "/administration/admin-sessions",
        },
      ],
    },
  ],
};

export const projectNavigation: readonly NavigationGroup[] = [
  {
    label: "Project",
    items: [
      {
        id: "project-overview",
        label: "Project Overview",
        icon: LayoutGrid,
        href: "/project-overview",
      },
      { id: "snapshots", label: "Source Snapshots", icon: Files, href: "/snapshots" },
      {
        id: "analysis-history",
        label: "Analysis History",
        icon: FileClock,
        href: "/analysis-history",
      },
    ],
  },
  {
    label: "Architecture",
    items: [
      { id: "graph", label: "Architecture Graph Explorer", icon: Network, href: "/architecture" },
      { id: "model", label: "Architecture Model Editor", icon: Boxes, href: "/model" },
      { id: "diagrams", label: "Architecture Diagrams", icon: Workflow, href: "/diagrams" },
      { id: "compare", label: "Compare Model Versions", icon: GitCompareArrows, href: "/compare" },
      { id: "impact", label: "Change Impact Analysis", icon: GitFork, href: "/impact" },
    ],
  },
  {
    label: "Runtime",
    items: [
      {
        id: "runtime-config",
        label: "Runtime Configuration",
        icon: Settings2,
        href: "/runtime-config",
      },
      { id: "scenarios", label: "Runtime Scenarios", icon: ListChecks, href: "/scenarios" },
      { id: "sessions", label: "Runtime Sessions", icon: Play, href: "/sessions" },
    ],
  },
  {
    label: "Explanations",
    items: [{ id: "explanations", label: "AI Explanations", icon: Sparkles, href: "/explain" }],
  },
];

export const lecturerWorkspaceNavigation: readonly NavigationGroup[] = [
  {
    label: "Workspace",
    items: [
      {
        id: "workspace-overview",
        label: "Workspace Overview",
        icon: LayoutGrid,
        href: "/workspace-overview",
      },
      { id: "members", label: "Workspace Members", icon: Users, href: "/members" },
      { id: "assignments", label: "Assignments", icon: BookOpen, href: "/assignments" },
      {
        id: "references",
        label: "Reference Source Versions",
        icon: FileCode2,
        href: "/references",
      },
      {
        id: "assignment-submissions",
        label: "Assignment Submissions",
        icon: ClipboardCheck,
        href: "/submissions",
      },
    ],
  },
];

export const submissionReviewNavigation: readonly NavigationGroup[] = [
  {
    label: "Submitted snapshot · read-only",
    items: [
      { id: "review", label: "Submission Details & Review", icon: ClipboardCheck },
      { id: "submitted-analysis", label: "Submitted Analysis Results", icon: FileSearch },
      { id: "submitted-graph", label: "Submitted Architecture Explorer", icon: Network },
      { id: "submitted-runtime", label: "Submitted Runtime Evidence", icon: Activity },
    ],
  },
];

export function contextualNavigation(
  role: AppRole,
  scope: WorkspaceScope,
): readonly NavigationGroup[] {
  if (role === "student" && scope === "project") return projectNavigation;
  if (role === "lecturer" && scope === "workspace") return lecturerWorkspaceNavigation;
  if (role === "lecturer" && scope === "review") return submissionReviewNavigation;
  return [];
}

export function existingRouteContext(pathname: string) {
  const page = projectNavigation
    .flatMap((group) => group.items)
    .find((item) => item.href === pathname);
  if (page) return { scope: "project" as const, title: page.label, activeId: page.id };
  if (pathname === "/import")
    return { scope: "project" as const, title: "Import Project Source", activeId: "snapshots" };
  return { scope: "global" as const, title: "My Projects", activeId: "projects" };
}

// Shared visual vocabulary; no inferred claim becomes runtime evidence or AI.
export const evidenceKinds = [
  { id: "source", label: "Source-inferred", icon: Code2 },
  { id: "runtime", label: "Runtime-observed", icon: Activity },
  { id: "ai", label: "AI explanation", icon: Sparkles },
] as const;
