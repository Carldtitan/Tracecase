import { auth } from "@/auth";
import { acceptInvitation } from "./actions";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await auth();
  return <main className="auth-page"><section className="auth-card"><span className="brand-mark">T</span><h1>Join Tracecase</h1><p>{session?.user?.email ?? "Sign in with the invited GitHub email."}</p><form action={acceptInvitation}><input type="hidden" name="token" value={token} /><button className="button primary" type="submit">{session?.user ? "Accept invitation" : "Sign in"}</button></form></section></main>;
}
