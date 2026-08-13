import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { getRun } from "@/lib/tracecase/service";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  try {
    if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
    const { runId } = await context.params;
    const result = await getRun(getDefaultScope(), runId);
    return result ? json(result) : json({ error: "run_not_found" }, 404);
  } catch (error) {
    return problem(error);
  }
}
