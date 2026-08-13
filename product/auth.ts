import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { uiPreviewEnabled } from "@/lib/tracecase/ui-preview";
import { getDefaultScope } from "./lib/tracecase/config";
import { getRuntime } from "./lib/tracecase/service";
import { createOpaqueId } from "./lib/tracecase/security";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true" || Boolean(process.env.VERCEL),
  providers: [GitHub],
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile, user }) {
      const login = (profile as { login?: string } | undefined)?.login?.toLowerCase();
      const allowed = (process.env.TRACECASE_ALLOWED_GITHUB_LOGINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      const email = user.email?.toLowerCase();
      if (!login || !email) return false;
      const scope = getDefaultScope();
      const { store } = await getRuntime();
      const [member, invitation] = await Promise.all([store.getUserByEmail(scope.organizationId, email), store.getPendingInvitationByEmail(scope.organizationId, email)]);
      const permitted = allowed.includes(login) || Boolean(member || invitation);
      if (!permitted) return false;
      if (!member && allowed.includes(login)) {
        await store.putUser({ id: createOpaqueId("user"), organizationId: scope.organizationId, email, displayName: user.name ?? login, rolesByProject: { [scope.projectId]: "owner" }, createdAt: new Date().toISOString() });
      }
      return true;
    },
    authorized({ auth: session, request }) {
      if (!request.nextUrl.pathname.startsWith("/app")) return true;
      if (uiPreviewEnabled()) return true;
      return Boolean(session?.user);
    },
  },
});
