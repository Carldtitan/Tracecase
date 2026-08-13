import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { json, problem } from "@/lib/tracecase/http";
import { listRuns } from "@/lib/tracecase/service";

export async function GET() {
  try {
    if (!(await auth())?.user) return json({ error: "unauthorized" }, 401);
    return json({ runs: await listRuns(getDefaultScope()) });
  } catch (error) {
    return problem(error);
  }
}
