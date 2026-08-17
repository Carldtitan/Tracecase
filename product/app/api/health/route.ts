import { auth } from "@/auth";
import { getConfig } from "@/lib/tracecase/config";
import { getFireworksSettings } from "@/lib/tracecase/fireworks";
import { json } from "@/lib/tracecase/http";

export async function GET() {
  if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
  const config = getConfig();
  const fireworks = getFireworksSettings();
  return json({ ok: true, mode: config.runtimeMode, persistence: config.persistence, externalCallsAllowed: config.allowExternalCalls, providers: { supabase: Boolean(config.supabaseUrl && config.supabaseSecretKey) && config.persistence === "supabase", fireworks: { configured: fireworks.configured, visionConfigured: fireworks.visionConfigured, model: fireworks.model ?? null, visionModel: fireworks.visionModel ?? null }, daytona: Boolean(process.env.DAYTONA_API_KEY), github: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY_BASE64), sentry: Boolean(process.env.SENTRY_AUTH_TOKEN), jira: Boolean(process.env.JIRA_API_TOKEN) } });
}
