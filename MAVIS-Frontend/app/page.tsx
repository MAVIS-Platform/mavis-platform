import type { Metadata } from "next";
import { PublicHomepage } from "@/features/homepage/public-homepage";
import "@/features/homepage/homepage.css";

const title = "MAVIS — Explore microservices architecture";
const description =
  "Analyze Java and C# microservices, follow requests across services, and study the impact of changes in guided Labs.";

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
