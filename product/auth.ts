import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST === "true" || Boolean(process.env.VERCEL),
  providers: [GitHub],
  pages: { signIn: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      const login = (profile as { login?: string } | undefined)?.login?.toLowerCase();
      const allowed = (process.env.TRACECASE_ALLOWED_GITHUB_LOGINS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      return Boolean(login && allowed.includes(login));
    },
    authorized({ auth: session, request }) {
      if (!request.nextUrl.pathname.startsWith("/app")) return true;
      return Boolean(session?.user);
    },
  },
});
