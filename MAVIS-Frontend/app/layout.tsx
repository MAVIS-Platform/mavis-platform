import { MainflowProvider } from "@/components/mainflow/provider";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "../src/styles.css";

// Runs before paint; keep the storage key and validation aligned with ThemeProvider.
const appearanceBootstrap = `(function(){var a="system";try{var s=localStorage.getItem("mavis.appearance");if(s==="light"||s==="dark"||s==="system")a=s;}catch(e){}var d=a==="dark"||(a==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.appearance=a;document.documentElement.style.colorScheme=d?"dark":"light";})();`;

export const metadata: Metadata = {
  title: "MAVIS — Architecture Learning & Analysis",
  description:
    "AI-Assisted Microservices Architecture Visualization and Change Impact Analysis. Learn through source analysis, architectural models, and scoped runtime evidence.",
  authors: [{ name: "MAVIS" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/inter/InterVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: appearanceBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <MainflowProvider>{children}</MainflowProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
