import { notFound } from "next/navigation";
import { AuthFlow } from "@/features/auth/auth-flow";
export default async function Page({ params }: { params: Promise<{ flow: string }> }) {
  const { flow } = await params;
  if (!["register", "verify", "forgot-password", "reset-password"].includes(flow)) notFound();
  return <AuthFlow flow={flow as "register" | "verify" | "forgot-password" | "reset-password"} />;
}
