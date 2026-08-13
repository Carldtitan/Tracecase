import { json, problem } from "@/lib/tracecase/http";
import { submitIntake } from "@/lib/tracecase/service";
import { after } from "next/server";
import { getConfig } from "@/lib/tracecase/config";
import { dispatchRun, liveExecutionConfigured } from "@/lib/tracecase/execution";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const result = await submitIntake(await request.json());
    const config = getConfig();
    if (config.autoDispatchRuns && liveExecutionConfigured()) {
      after(async () => {
        await dispatchRun({ organizationId: result.run.organizationId, projectId: result.run.projectId }, result.run.id).catch(() => undefined);
      });
    }
    return json({ reportId: result.report.id, caseId: result.caseDocument.id, runId: result.run.id, status: result.run.status, duplicateSuggested: result.duplicate, unknowns: result.report.unknowns }, 201);
  } catch (error) {
    return problem(error);
  }
}
