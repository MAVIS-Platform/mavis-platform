import type { Metadata } from "next";
import { PublicHomepage } from "@/features/homepage/public-homepage";
import "@/features/homepage/homepage.css";

const title = "MAVIS — Microservices Architecture & 3D Docker Studio";
const description =
  "Analyze Java and C# microservices, run live Docker stacks on an interactive 3D stage, stream OpenTelemetry traces, and verify real change impact in guided Labs.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "https://maviss.site/" },
  openGraph: {
    title,
    description,
    url: "https://maviss.site/",
    siteName: "MAVIS",
    type: "website",
    images: [
      {
        url: "https://maviss.site/homepage/share.jpg",
        width: 1200,
        height: 630,
        alt: "MAVIS architecture and guided Labs",
      },
    ],
  },
};

export default function HomePage() {
  return <PublicHomepage />;
}
