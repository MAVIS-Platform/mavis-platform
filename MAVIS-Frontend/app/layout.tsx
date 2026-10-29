import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { AppProvider } from "@/providers/app-provider";
import { readAppConfiguration } from "@/lib/api/config";
import "../src/styles.css";
// Keep the shared auth stylesheet mounted across route transitions. Loading it
// per page races Webpack CSS HMR callbacks with removal of the old route link.
import "../src/features/auth/login-background.css";

// Runs before paint; keep the storage key and validation aligned with ThemeProvider.
const appearanceBootstrap = `(function(){var a="light";try{var s=localStorage.getItem("mavis.appearance");if(s==="light"||s==="dark")a=s;}catch(e){}var d=a==="dark";document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.appearance=a;document.documentElement.style.colorScheme=d?"dark":"light";})();`;

export const metadata: Metadata = {
  
  title: "MAVIS — Architecture Learning & Analysis",
  description:
    "AI-Assisted Microservices Architecture Visualization and Change Impact Analysis. Learn through source analysis, architectural models, and scoped runtime evidence.",
  authors: [{ name: "MAVIS" }],
  icons: {
  icon: "/logo.png",
},
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configuration = readAppConfiguration(process.env);
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
          <LocaleProvider>
            <AppProvider mode={configuration.mode} mockScenario={configuration.mockScenario}>
              {children}
            </AppProvider>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
