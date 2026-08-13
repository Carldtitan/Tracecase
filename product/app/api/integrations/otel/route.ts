import { getDefaultScope } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { getRuntime } from "@/lib/tracecase/service";
import { createOpaqueId, redactUnknown } from "@/lib/tracecase/security";
import { timingSafeEqual } from "node:crypto";

function matchesSecret(received: string | null, expected: string) {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  try {
    const secret = process.env.OTEL_INGEST_SECRET;
    if (!secret) return json({ error: "otel_ingest_unconfigured" }, 503);
    if (!matchesSecret(request.headers.get("x-tracecase-ingest-secret"), secret)) return json({ error: "unauthorized" }, 401);
    const body = redactUnknown(await request.json());
    const runId = request.headers.get("x-tracecase-run-id");
    if (!runId) return json({ error: "run_id_required" }, 400);
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    if (!(await store.getRun(scope, runId))) return json({ error: "run_not_found" }, 404);
    const current = await store.listRunEvents(scope, runId);
    await store.appendRunEvent({ id: createOpaqueId("event"), ...scope, runId, sequence: (current.at(-1)?.sequence ?? 0) + 1, type: "evidence.saved", agent: "system", summary: "Redacted telemetry accepted.", data: { payload: body }, timestamp: new Date().toISOString() });
    return json({ accepted: true, runId }, 202);
  } catch (error) {
    return problem(error);
  }
}
