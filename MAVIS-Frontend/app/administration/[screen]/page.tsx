import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import {
  Accounts,
  Integrations,
  RuntimeProfiles,
  PlatformSummary,
  PlatformUsage,
  AdminAnalysisJobs,
  AuditRecords,
} from "@/features/administration/screens";
import { RuntimeSessions } from "@/features/runtime/screens";
import type { ComponentType } from "react";
const screens: Record<string, { title: string; component: ComponentType }> = {
  users: { title: "User Account List", component: Accounts },
  integrations: { title: "Integration Management", component: Integrations },
  health: { title: "System Health", component: PlatformSummary },
  jobs: { title: "Analysis Jobs", component: AdminAnalysisJobs },
  usage: { title: "Platform Usage", component: PlatformUsage },
  "runtime-summary": { title: "Runtime Summary", component: PlatformSummary },
  audit: { title: "Audit Records", component: AuditRecords },
  profiles: { title: "Runtime Execution Profiles", component: RuntimeProfiles },
  "admin-sessions": { title: "Runtime Sessions", component: AdminSessions },
};
function AdminSessions() {
  return <RuntimeSessions administrative />;
}
export default async function AdminPage({ params }: { params: Promise<{ screen: string }> }) {
  const { screen } = await params;
  const config = screens[screen];
  if (!config) notFound();
  const Screen = config.component;
  return (
    <AppShell scope="global" activeId={screen} pageTitle={config.title}>
      <PageContainer>
        <SectionHeader title={config.title} />
        <Screen />
      </PageContainer>
    </AppShell>
  );
}
