import { z } from "zod";
import { getDefaultScope } from "@/lib/tracecase/config";
import { invitationSchema } from "@/lib/tracecase/contracts";
import { json, problem } from "@/lib/tracecase/http";
import { createOpaqueId, sha256 } from "@/lib/tracecase/security";
import { getRuntime } from "@/lib/tracecase/service";
import { requireProjectActor } from "@/lib/tracecase/team";

const requestSchema = z.object({ email: z.string().email(), role: z.enum(["admin", "engineer", "support", "viewer"]) });

export async function POST(request: Request) {
  try {
    const { user } = await requireProjectActor("admin");
    const input = requestSchema.parse(await request.json());
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    const existing = await store.getUserByEmail(scope.organizationId, input.email);
    if (existing?.rolesByProject[scope.projectId]) return json({ error: "already_a_member" }, 409);
    const token = createOpaqueId("invite");
    const now = new Date();
    const invitation = invitationSchema.parse({ id: createOpaqueId("invitation"), ...scope, email: input.email.toLowerCase(), role: input.role, tokenHash: sha256(token), invitedBy: user.id, status: "pending", expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(), createdAt: now.toISOString() });
    await store.putInvitation(invitation);
    await store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: scope.organizationId, projectId: scope.projectId, actorId: user.id, action: "team.invitation.create", target: invitation.email, result: "changed", details: { role: invitation.role, invitationId: invitation.id }, timestamp: now.toISOString() });
    const inviteUrl = new URL(`/invite/${token}`, process.env.NEXT_PUBLIC_APP_URL ?? request.url).toString();
    return json({ invitation: { ...invitation, tokenHash: undefined }, inviteUrl }, 201);
  } catch (error) {
    return problem(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user } = await requireProjectActor("admin");
    const input = z.object({ invitationId: z.string().min(3).max(96) }).parse(await request.json());
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    const invitation = (await store.listInvitations(scope)).find((item) => item.id === input.invitationId);
    if (!invitation || invitation.status !== "pending") return json({ error: "invitation_not_found" }, 404);
    await store.putInvitation({ ...invitation, status: "revoked" });
    await store.appendAuditEvent({ id: createOpaqueId("audit"), organizationId: scope.organizationId, projectId: scope.projectId, actorId: user.id, action: "team.invitation.revoke", target: invitation.email, result: "changed", details: { invitationId: invitation.id }, timestamp: new Date().toISOString() });
    return json({ revoked: true });
  } catch (error) {
    return problem(error);
  }
}
