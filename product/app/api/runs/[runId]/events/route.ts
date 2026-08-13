import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { json } from "@/lib/tracecase/http";
import { getRuntime } from "@/lib/tracecase/service";

export async function GET(request: Request, context: { params: Promise<{ runId: string }> }) {
  if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
  const { runId } = await context.params;
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  const { store } = await getRuntime();
  const events = await store.listRunEvents(getDefaultScope(), runId, Number.isFinite(after) ? after : 0);
  const body = events.map((event) => `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("") + ": stream rebuilt from durable state\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
}
