import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { ProjectSelector } from "@/features/projects/components";
import { ProjectOverview, SourceSnapshots, AnalysisHistory } from "@/features/projects/screens";
import { ModelEditor, CompareModels } from "@/features/architecture/model-editor";
import { ArchitectureWorkspace } from "@/routes/architecture";
import {
  RuntimeConfiguration,
  RuntimeScenarios,
  RuntimeSessions,
} from "@/features/runtime/screens";
import {
  Workspaces,
  WorkspaceOverview,
  WorkspaceMembers,
  ReferenceVersions,
} from "@/features/workspaces/screens";
import { WorkspaceSelector } from "@/features/workspaces/components";
import { Assignments } from "@/features/assignments/screens";
import { Submissions } from "@/features/submissions/screens";
import type { ComponentType } from "react";
const screens: Record<
  string,
  {
    title: string;
    scope: "global" | "project" | "workspace";
    component: ComponentType;
    selector?: "project" | "workspace";
  }
> = {
  "project-overview": {
    title: "Project Overview",
    scope: "project",
    component: ProjectOverview,
    selector: "project",
  },
  snapshots: {
    title: "Source Snapshots",
    scope: "project",
    component: SourceSnapshots,
    selector: "project",
  },
  "analysis-history": {
    title: "Analysis History",
    scope: "project",
    component: AnalysisHistory,
    selector: "project",
  },
  model: {
    title: "Architecture Model Editor",
    scope: "project",
    component: ModelEditor,
    selector: "project",
  },
  diagrams: { title: "Architecture Diagrams", scope: "project", component: ArchitectureWorkspace },
  compare: {
    title: "Compare Model Versions",
    scope: "project",
    component: CompareModels,
    selector: "project",
  },
  "runtime-config": {
    title: "Runtime Configuration",
    scope: "project",
    component: RuntimeConfiguration,
    selector: "project",
  },
  scenarios: {
    title: "Runtime Scenarios",
    scope: "project",
    component: RuntimeScenarios,
    selector: "project",
  },
  sessions: {
    title: "Runtime Sessions",
    scope: "project",
    component: RuntimeSessions,
    selector: "project",
  },
  workspaces: { title: "My Workspaces", scope: "global", component: Workspaces },
  "workspace-overview": {
    title: "Workspace Overview",
    scope: "workspace",
    component: WorkspaceOverview,
    selector: "workspace",
  },
  members: {
    title: "Workspace Members",
    scope: "workspace",
    component: WorkspaceMembers,
    selector: "workspace",
  },
  assignments: {
    title: "Assignments",
    scope: "workspace",
    component: Assignments,
    selector: "workspace",
  },
  references: {
    title: "Reference Source Versions",
    scope: "workspace",
    component: ReferenceVersions,
    selector: "workspace",
  },
  submissions: {
    title: "My Submissions / Assignment Submissions",
    scope: "global",
    component: Submissions,
  },
};
export default async function FeaturePage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const config = screens[screen];
  if (!config) notFound();
  const Screen = config.component;
  if (screen === "diagrams")
    return (
      <AppShell scope="project" activeId="diagrams" pageTitle={config.title}>
        <ArchitectureWorkspace title={config.title} mode="diagram" />
      </AppShell>
    );
  return (
    <AppShell scope={config.scope} activeId={screen} pageTitle={config.title}>
      <PageContainer>
        <SectionHeader title={config.title} />
        {config.selector === "project" && <ProjectSelector />}
        {config.selector === "workspace" && <WorkspaceSelector />}
        <Screen />
      </PageContainer>
    </AppShell>
  );
}
