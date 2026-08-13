import { auth } from "@/auth";
import { json } from "@/lib/tracecase/http";

export async function GET() {
  if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
  const appSlug = process.env.GITHUB_APP_SLUG;
  if (!appSlug) return json({ error: "github_app_unconfigured", next: "Set GITHUB_APP_SLUG after you create the GitHub App." }, 503);
  return json({ installUrl: `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new`, externalCallMade: false });
}
