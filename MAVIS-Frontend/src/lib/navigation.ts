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
  Library,
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
          id: "roadmap",
          label: "Lab Roadmap & Course",
          icon: BookOpen,
          href: "/roadmap",
        },
        {
          id: "submissions",
          label: "My Grades & Submissions",
          icon: ClipboardCheck,
          href: "/submissions",
        },
      ],
    },
  ],
  lecturer: [
    {
      label: "Teaching",
      items: [
        { id: "workspaces", label: "My Classes", icon: Users, href: "/workspaces" },
        {
          id: "workspace-overview",
          label: "Curriculum & Labs",
          icon: BookOpen,
          href: "/workspace-overview",
        },
        {
          id: "submissions",
          label: "Grading & Gradebook",
          icon: ClipboardCheck,
          href: "/submissions",
        },
      ],
    },
  ],
  admin: [
    {
      label: "System Administration",
      items: [
        { id: "health", label: "System Overview", icon: Activity, href: "/administration/health" },
        { id: "users", label: "Users & Roles", icon: Users, href: "/administration/users" },
        {
          id: "profiles",
          label: "Governance & Audit",
          icon: ShieldCheck,
          href: "/administration/profiles",
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
        label: "Overview & Setup",
        icon: LayoutGrid,
        href: "/workspace-overview",
      },
      {
        id: "course-authoring",
        label: "Curriculum & Materials",
        icon: GraduationCap,
        href: "/workspace-overview?view=course-authoring",
      },
      {
        id: "theory-library",
        label: "Theory Library",
        icon: Library,
        href: "/theory-library",
      },
      {
        id: "assignments",
        label: "Lab Library",
        icon: BookOpen,
        href: "/assignments",
      },
      {
        id: "lab-authoring",
        label: "Lab Creation",
        icon: BookOpen,
        href: "/lab-authoring",
      },
      {
        id: "assignment-submissions",
        label: "Grading & Gradebook",
        icon: ClipboardCheck,
        href: "/submissions",
      },
      { id: "members", label: "Students & Access", icon: Users, href: "/members" },
    ],
  },
];

export const lecturerReviewNavigation: readonly NavigationGroup[] = [
  {
    label: "Grading · SpeedGrader",
    items: [
      { id: "review", label: "Submission Review", icon: ClipboardCheck },
      {
        id: "submissions",
        label: "Submissions Queue",
        icon: ListChecks,
        href: "/submissions",
      },
      {
        id: "workspace-overview",
        label: "Class Overview",
        icon: LayoutGrid,
        href: "/workspace-overview",
      },
    ],
  },
];

export const studentWorkspaceNavigation: readonly NavigationGroup[] = [
  {
    label: "Learning Space",
    items: [
      {
        id: "courses",
        label: "My Classes",
        icon: GraduationCap,
        href: "/courses",
      },
      {
        id: "roadmap",
        label: "Lab Roadmap & Course",
        icon: Map,
        href: "/roadmap",
      },
      {
        id: "submissions",
        label: "Submissions & Grades",
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

export const studentReviewNavigation: readonly NavigationGroup[] = [
  {
    label: "Student Submission · read-only",
    items: [
      { id: "review", label: "Submission Details & Review", icon: ClipboardCheck },
      { id: "roadmap", label: "Lab Roadmap & Course", icon: Map, href: "/roadmap" },
      { id: "submissions", label: "Submissions & Grades", icon: BookOpen, href: "/submissions" },
    ],
  },
];

export function contextualNavigation(
  role: AppRole,
  scope: WorkspaceScope,
  live = false,
): readonly NavigationGroup[] {
  if (live && scope === "project") return projectNavigation;
  if (role === "student" && scope === "review") return studentReviewNavigation;
  if (role === "student" && (scope === "workspace" || scope === "project")) {
    return studentWorkspaceNavigation;
  }
  if (role === "lecturer" && (scope === "workspace" || scope === "project")) {
    return lecturerWorkspaceNavigation;
  }
  if (role === "lecturer" && scope === "review") {
    return lecturerReviewNavigation;
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
  if (pathname === "/studio") {
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
