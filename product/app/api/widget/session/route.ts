import { getConfig } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { enforceRateLimit, getRuntime } from "@/lib/tracecase/service";
import { createOpaqueId, sha256, signToken } from "@/lib/tracecase/security";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { projectKey?: string; origin?: string };
    if (!body.projectKey || !body.origin) return json({ error: "project_key_and_origin_required" }, 400);
    const origin = new URL(body.origin).origin;
    enforceRateLimit(request.headers.get("x-forwarded-for") ?? origin, 20);
    const config = getConfig();
    if (!config.widgetSigningSecret) return json({ error: "widget_unconfigured" }, 503);
    const { store } = await getRuntime();
    const project = await store.getProjectByPublicKeyHash(sha256(body.projectKey));
    if (!project || !project.widget.enabled) return json({ error: "unknown_widget" }, 404);
    if (!project.widget.allowedOrigins.includes(origin)) return json({ error: "origin_not_allowed" }, 403);
    const sessionId = createOpaqueId("session");
    return json({ sessionId, token: signToken({ sessionId, projectKeyHash: sha256(body.projectKey) }, config.widgetSigningSecret, 60 * 60), expiresInSeconds: 3600 });
  } catch (error) {
    return problem(error);
  }
}
