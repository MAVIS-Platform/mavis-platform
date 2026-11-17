import {
  Activity,
  BookOpen,
  Boxes,
  ClipboardCheck,
  Code2,
  FileClock,
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
  GraduationCap,
  KeyRound,
  Map,
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
  children?: readonly NavigationItem[];
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
      label: "Learning",
      items: [
        { id: "courses", label: "My Courses", icon: GraduationCap, href: "/courses" },
        {
          id: "join-course",
          label: "Join Course",
          icon: KeyRound,
          href: "/courses#course-passkey",
        },
        { id: "studio", label: "Free Studio Sandbox", icon: Boxes, href: "/studio" },
      ],
    },
    {
      label: "Progress",
      items: [
        { id: "submissions", label: "My Submissions", icon: ClipboardCheck, href: "/submissions" },
      ],
    },
  ],
  lecturer: [
    {
      label: "Workspaces",
      items: [
        { id: "workspaces", label: "My Workspaces", icon: Users, href: "/workspaces" },
        { id: "studio", label: "MAVIS Studio", icon: Boxes, href: "/studio" },
      ],
    },
  ],
  admin: [
    {
      label: "Monitoring",
      items: [
        { id: "health", label: "System Health", icon: Activity, href: "/administration/health" },
        { id: "jobs", label: "Analysis Jobs", icon: ListChecks, href: "/administration/jobs" },
        { id: "usage", label: "Platform Usage", icon: LayoutGrid, href: "/administration/usage" },
      ],
    },
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
      label: "Audit",
      items: [
        { id: "audit", label: "Audit Records", icon: ScrollText, href: "/administration/audit" },
      ],
    },
    {
      label: "Runtime Administration",
      items: [
        {
          id: "studio",
          label: "MAVIS Studio",
          icon: Boxes,
          href: "/administration/studio",
        },
        {
          id: "runtime-summary",
          label: "Runtime Summary",
          icon: Server,
          href: "/administration/runtime-summary",
        },
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
    ],
  },
  {
    label: "Architecture",
    items: [
      { id: "graph", label: "Architecture Graph Explorer", icon: Network, href: "/architecture" },
      { id: "diagrams", label: "Architecture Diagrams", icon: Workflow, href: "/diagrams" },
      { id: "model", label: "Architecture Model Editor", icon: Boxes, href: "/model" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { id: "snapshots", label: "Source Snapshots", icon: Files, href: "/snapshots" },
      {
        id: "analysis-history",
        label: "Analysis History",
        icon: FileClock,
        href: "/analysis-history",
      },
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
    label: "Insights",
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
      { id: "assignments", label: "Lab Library", icon: BookOpen, href: "/assignments" },
      { id: "lab-authoring", label: "Lab Creation", icon: BookOpen, href: "/lab-authoring" },
      {
        id: "assignment-submissions",
        label: "Assignment Submissions",
        icon: ClipboardCheck,
        href: "/submissions",
      },
      {
        id: "workspace-results",
        label: "Results",
        icon: ClipboardCheck,
        href: "/submissions?view=results",
      },
      {
        id: "course-authoring",
        label: "Course Authoring",
        icon: GraduationCap,
        href: "/workspace-overview?view=course-authoring",
      },
      {
        id: "course-setup",
        label: "Course Setup",
        icon: Settings2,
        href: "/workspace-overview?view=course-setup",
      },
    ],
  },
];

export const studentWorkspaceNavigation: readonly NavigationGroup[] = [
  {
    label: "Course",
    items: [
      {
        id: "roadmap",
        label: "Course Roadmap",
        icon: Map,
        href: "/roadmap",
      },
      {
        id: "lab",
        label: "Lab Workspace",
        icon: BookOpen,
        href: "/lab",
      },
      {
        id: "submissions",
        label: "My Submissions",
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
  if (role === "student" && scope === "workspace") return studentWorkspaceNavigation;
  if (role === "lecturer" && scope === "workspace") return lecturerWorkspaceNavigation;
  if ((role === "lecturer" || role === "student") && scope === "review") {
    return submissionReviewNavigation;
  }
  return [];
}

export function existingRouteContext(pathname: string) {
  const projectPage = projectNavigation
    .flatMap((group) => group.items)
    .find((item) => item.href === pathname);
  if (projectPage) {
    return { scope: "project" as const, title: projectPage.label, activeId: projectPage.id };
  }
  if (pathname === "/import") {
    return { scope: "project" as const, title: "Import Project Source", activeId: "snapshots" };
  }
  const workspacePage = lecturerWorkspaceNavigation
    .flatMap((group) => group.items)
    .find((item) => item.href === pathname && item.href !== "/submissions");
  if (workspacePage) {
    return { scope: "workspace" as const, title: workspacePage.label, activeId: workspacePage.id };
  }
  if (pathname === "/references") {
    return {
      scope: "workspace" as const,
      title: "Reference Source Versions",
      activeId: "references",
    };
  }
  if (pathname.startsWith("/submissions/")) {
    return { scope: "review" as const, title: "Submission Details & Review", activeId: "review" };
  }
  if (pathname === "/workspaces") {
    return { scope: "global" as const, title: "My Workspaces", activeId: "workspaces" };
  }
  if (pathname === "/courses") {
    return { scope: "global" as const, title: "My Courses", activeId: "courses" };
  }
  if (pathname === "/roadmap") {
    return { scope: "workspace" as const, title: "Course Roadmap", activeId: "roadmap" };
  }
  if (pathname === "/lab") {
    return { scope: "workspace" as const, title: "Lab Workspace", activeId: "lab" };
  }
  if (pathname === "/submissions") {
    return { scope: "global" as const, title: "My Submissions", activeId: "submissions" };
  }
  if (pathname === "/studio" || pathname === "/administration/studio") {
    return { scope: "global" as const, title: "MAVIS Studio", activeId: "studio" };
  }
  return { scope: "global" as const, title: "My Courses", activeId: "courses" };
}

// Shared visual vocabulary; no inferred claim becomes runtime evidence or AI.
export const evidenceKinds = [
  { id: "source", label: "Source-inferred", icon: Code2 },
  { id: "runtime", label: "Runtime-observed", icon: Activity },
  { id: "ai", label: "AI explanation", icon: Sparkles },
] as const;
