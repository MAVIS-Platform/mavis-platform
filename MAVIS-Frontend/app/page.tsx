import type { Metadata } from "next";
import { PublicHomepage } from "@/features/homepage/public-homepage";
import "@/features/homepage/homepage.css";

const title = "MAVIS — Follow a request through microservices";
const description =
  "Explore Java and C# microservices through dependency graphs, source evidence, and guided architecture labs.";

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
