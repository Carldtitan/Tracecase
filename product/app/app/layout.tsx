import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "../components/AppShell";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <AppShell projectName={process.env.TRACECASE_PROJECT_NAME ?? "Project"} user={{ name: session.user.name ?? "Account", email: session.user.email ?? undefined, image: session.user.image ?? undefined }}>
      {children}
    </AppShell>
  );
}
