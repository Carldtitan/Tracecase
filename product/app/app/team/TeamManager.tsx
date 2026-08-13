"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Invitation, User } from "@/lib/tracecase/contracts";

export function TeamManager({ members, invitations, projectId }: { members: User[]; invitations: Invitation[]; projectId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("engineer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  async function invite() {
    setBusy(true);
    const response = await fetch("/api/team/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
    const result = await response.json() as { inviteUrl?: string };
    setBusy(false);
    if (response.ok && result.inviteUrl) { setInviteUrl(result.inviteUrl); setEmail(""); router.refresh(); }
  }
  async function changeRole(memberEmail: string, nextRole: string) {
    await fetch("/api/team/members", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: memberEmail, role: nextRole }) });
    router.refresh();
  }
  async function remove(memberEmail: string) {
    await fetch("/api/team/members", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: memberEmail }) });
    router.refresh();
  }
  async function revoke(invitationId: string) {
    await fetch("/api/team/invitations", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ invitationId }) });
    router.refresh();
  }
  return <div className="team-layout">
    <section className="settings-card team-invite-card"><h2>Invite</h2><div className="team-invite-form"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" aria-label="Email" /><select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Role"><option value="admin">Admin</option><option value="engineer">Engineer</option><option value="support">Support</option><option value="viewer">Viewer</option></select><button className="button primary" onClick={() => void invite()} disabled={busy || !email}>{busy ? "Inviting" : "Invite"}</button></div>{inviteUrl && <div className="invite-link"><input readOnly value={inviteUrl} aria-label="Invitation link" /><button className="button secondary" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>Copy</button></div>}</section>
    <section className="team-table settings-card"><header><h2>Members</h2><span>{members.filter((member) => member.rolesByProject[projectId]).length}</span></header>{members.filter((member) => member.rolesByProject[projectId]).map((member) => <div className="team-row" key={member.id}><span><strong>{member.displayName}</strong><small>{member.email}</small></span>{member.rolesByProject[projectId] === "owner" ? <b>Owner</b> : <><select value={member.rolesByProject[projectId]} onChange={(event) => void changeRole(member.email, event.target.value)} aria-label={`${member.displayName} role`}><option value="admin">Admin</option><option value="engineer">Engineer</option><option value="support">Support</option><option value="viewer">Viewer</option></select><button className="text-button danger" onClick={() => void remove(member.email)}>Remove</button></>}</div>)}</section>
    {invitations.some((invitation) => invitation.status === "pending") && <section className="team-table settings-card"><header><h2>Pending</h2></header>{invitations.filter((invitation) => invitation.status === "pending").map((invitation) => <div className="team-row" key={invitation.id}><span><strong>{invitation.email}</strong><small>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span><b>{invitation.role}</b><button className="text-button danger" onClick={() => void revoke(invitation.id)}>Revoke</button></div>)}</section>}
  </div>;
}
