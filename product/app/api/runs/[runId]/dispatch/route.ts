import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { dispatchRun } from "@/lib/tracecase/execution";
import { json, problem } from "@/lib/tracecase/http";

export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
    const { runId } = await context.params;
    return json(await dispatchRun(getDefaultScope(), runId), 202);
  } catch (error) {
    return problem(error);
  }
}
