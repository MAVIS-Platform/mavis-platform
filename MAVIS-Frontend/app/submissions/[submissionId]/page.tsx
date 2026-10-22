import { AppShell } from "@/components/app-shell";
import { SubmissionReview } from "@/features/submissions/screens";
export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  return (
    <AppShell
      scope="review"
      activeId="review"
      pageTitle="Submission Details & Review"
      contextName={submissionId}
    >
      <SubmissionReview submissionId={submissionId} />
    </AppShell>
  );
}
