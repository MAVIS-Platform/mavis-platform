import { AppShell } from "@/components/app-shell";
import { PageContainer, SectionHeader } from "@/components/layout/page";
import { NotificationCenter } from "@/features/notifications/inbox";
export default function Notifications() {
  return (
    <AppShell scope="global" pageTitle="Notifications" contentVariant="workspace">
      <div className="mx-auto w-full max-w-4xl">
        <PageContainer>
          <SectionHeader
            title="Notifications"
            description="Stay up to date with your assignments, projects and account."
          />
          <NotificationCenter />
        </PageContainer>
      </div>
    </AppShell>
  );
}
