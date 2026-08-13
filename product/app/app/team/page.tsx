import { getDefaultScope } from "@/lib/tracecase/config";
import { getRuntime } from "@/lib/tracecase/service";
import { requireProjectActor } from "@/lib/tracecase/team";
import { PageHeader } from "../../components/DashboardParts";
import { TeamManager } from "./TeamManager";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  await requireProjectActor("admin");
  const scope = getDefaultScope();
  const { store } = await getRuntime();
  const [members, invitations] = await Promise.all([store.listUsers(scope.organizationId), store.listInvitations(scope)]);
  return <main className="dashboard-page"><PageHeader eyebrow="Workspace" title="Team" /><TeamManager members={members} invitations={invitations} projectId={scope.projectId} /></main>;
}
