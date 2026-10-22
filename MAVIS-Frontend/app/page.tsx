import IndexPage from "@/routes/index";
import { redirect } from "next/navigation";
import { readAppConfiguration } from "@/lib/api/config";

export const metadata = {
  title: "Overview — MAVIS",
  description: "Architecture analysis overview and projects, with explicit mock and backend modes.",
};

export default function HomePage() {
  if (readAppConfiguration(process.env).mode === "backend") redirect("/import");
  return <IndexPage />;
}
