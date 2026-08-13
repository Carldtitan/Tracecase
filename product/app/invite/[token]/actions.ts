"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRuntime } from "@/lib/tracecase/service";
import { createOpaqueId, sha256 } from "@/lib/tracecase/security";

export async function acceptInvitation(form: FormData) {
  const token = String(form.get("token") ?? "");
  const session = await auth();
  if (!session?.user?.email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  const { store } = await getRuntime();
  const invitation = await store.getInvitationByTokenHash(sha256(token));
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= new Date().toISOString()) throw new Error("Invitation is invalid or expired");
  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) throw new Error("Sign in with the invited email address");
  const existing = await store.getUserByEmail(invitation.organizationId, invitation.email);
  await store.putUser({ id: existing?.id ?? createOpaqueId("user"), organizationId: invitation.organizationId, email: invitation.email, displayName: session.user.name ?? invitation.email, rolesByProject: { ...(existing?.rolesByProject ?? {}), [invitation.projectId]: invitation.role }, createdAt: existing?.createdAt ?? new Date().toISOString() });
  await store.putInvitation({ ...invitation, status: "accepted", acceptedAt: new Date().toISOString() });
  redirect("/app");
}
