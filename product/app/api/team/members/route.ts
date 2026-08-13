import { z } from "zod";
import { getDefaultScope } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { getRuntime } from "@/lib/tracecase/service";
import { requireProjectActor } from "@/lib/tracecase/team";
import { createOpaqueId } from "@/lib/tracecase/security";

const updateSchema = z.object({ email: z.string().email(), role: z.enum(["admin", "engineer", "support", "viewer"]) });

export async function PATCH(request: Request) {
  try {
    const { user: actor } = await requireProjectActor("admin");
    const input = updateSchema.parse(await request.json());
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    const user = await store.getUserByEmail(scope.organizationId, input.email);
    if (!user) return json({ error: "member_not_found" }, 404);
    if (user.rolesByProject[scope.projectId] === "owner" || user.id === actor.id) return json({ error: "owner_or_self_role_protected" }, 409);
    await store.putUser({ ...user, rolesByProject: { ...user.rolesByProject, [scope.projectId]: input.role } });
    await store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: scope.organizationId, projectId: scope.projectId, actorId: actor.id, action: "team.member.role.update", target: user.email, result: "changed", details: { role: input.role }, timestamp: new Date().toISOString() });
    return json({ updated: true });
  } catch (error) {
    return problem(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user: actor } = await requireProjectActor("admin");
    const input = z.object({ email: z.string().email() }).parse(await request.json());
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    const user = await store.getUserByEmail(scope.organizationId, input.email);
    if (!user) return json({ error: "member_not_found" }, 404);
    if (user.rolesByProject[scope.projectId] === "owner" || user.id === actor.id) return json({ error: "owner_or_self_removal_protected" }, 409);
    const rolesByProject = { ...user.rolesByProject };
    delete rolesByProject[scope.projectId];
    await store.putUser({ ...user, rolesByProject });
    await store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: scope.organizationId, projectId: scope.projectId, actorId: actor.id, action: "team.member.remove", target: user.email, result: "changed", details: {}, timestamp: new Date().toISOString() });
    return json({ removed: true });
  } catch (error) {
    return problem(error);
  }
}
