import { getConfig } from "@/lib/tracecase/config";
import { json } from "@/lib/tracecase/http";
import { dispatchRun, liveExecutionConfigured } from "@/lib/tracecase/execution";
import { processDueIntakeDrafts } from "@/lib/tracecase/service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "unauthorized" }, 401);
  const outcomes = await processDueIntakeDrafts(100);
  const config = getConfig();
  if (config.autoDispatchRuns && liveExecutionConfigured()) {
    for (const outcome of outcomes) {
      if (!outcome.runId) continue;
      if (!outcome.organizationId || !outcome.projectId) continue;
      await dispatchRun({ organizationId: outcome.organizationId, projectId: outcome.projectId }, outcome.runId).catch(() => undefined);
    }
  }
  return json({ processed: outcomes.length, outcomes });
}
