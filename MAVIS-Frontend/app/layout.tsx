import type { Metadata } from "next";
import "../src/styles.css";

export const metadata: Metadata = {
  title: "MAVIS — Microservices Architecture Analysis",
  description:
    "Analyze microservices architectures: import projects, scan dependencies, track findings and service health.",
  authors: [{ name: "MAVIS" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
