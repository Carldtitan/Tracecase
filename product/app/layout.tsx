import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Tracecase",
    template: "%s · Tracecase",
  },
  description: "Reproduce, prove, and repair hard-to-pin-down product bugs.",
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
          data-design-contract="tracecase-v2"
          dangerouslySetInnerHTML={{
            __html: "<!-- THESIS: Tracecase is a warm engineering review bench; each screen exposes one operational decision and refuses generic blue SaaS chrome. OWN-WORLD: espresso sidebar, oat canvas, ivory cards, cocoa ink, terracotta action, Apple-like tactile shadows. STORY: connect systems, receive a case, watch environments, review evidence, approve a draft PR. FIRST VIEWPORT: compact private rail and focused setup workspace. FORM: warm operator console, CodeRabbit-inspired structure, seed 80125b83. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
