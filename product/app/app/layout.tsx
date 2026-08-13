import { auth } from "@/auth";
import { uiPreviewEnabled } from "@/lib/tracecase/ui-preview";
import { redirect } from "next/navigation";
import { AppShell } from "../components/AppShell";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const preview = uiPreviewEnabled();
  if (!session?.user && !preview) redirect("/");
  const user = session?.user ?? { name: "UI preview", email: "Local development" };
  return (
    <AppShell projectName={process.env.TRACECASE_PROJECT_NAME ?? "Project"} user={{ name: user.name ?? "Account", email: user.email ?? undefined, image: user.image ?? undefined }}>
      {children}
    </AppShell>
  );
}
