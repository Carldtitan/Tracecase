import type { Metadata } from "next";
import "@fontsource-variable/public-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tracecase",
    template: "%s · Tracecase",
  },
  description: "Check the code, then test reported flows across browser engines, screen sizes, mobile emulation, accessibility settings, and network conditions.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <template
          data-design-contract="tracecase-landing-workbench"
          dangerouslySetInnerHTML={{
            __html: "<!-- THESIS: The landing page proves Tracecase through a living investigation, refusing both the empty hero and the explanatory feature wall. OWN-WORLD: warm mineral light, cocoa ink, terracotta action, formal Public Sans type, and distinct ivory modules with Apple-like depth. STORY: see a report enter, pass code checks, reproduce in a controlled environment, and leave with evidence; then continue with GitHub. FIRST VIEWPORT: compact promise and action on the left; a four-module evidence workbench dominates the right. FORM: brief-pinned warm modular product theatre, seed e79e874d. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
