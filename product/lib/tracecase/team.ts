import { auth } from "@/auth";
import { getDefaultScope } from "./config";
import type { Project, User } from "./contracts";
import { authorizeProject } from "./security";
import { getRuntime } from "./service";

export async function requireProjectActor(minimumRole: "owner" | "admin" | "engineer" | "support" | "viewer" = "viewer"): Promise<{ user: User; project: Project }> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new Error("Authentication required");
  const scope = getDefaultScope();
  const { store } = await getRuntime();
  const [user, project] = await Promise.all([store.getUserByEmail(scope.organizationId, email), store.getProject(scope)]);
  if (!user || !project) throw new Error("Project access denied");
  authorizeProject(user, project, minimumRole);
  return { user, project };
}
