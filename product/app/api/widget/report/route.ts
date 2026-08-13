import { json, problem } from "@/lib/tracecase/http";
import { submitIntake } from "@/lib/tracecase/service";

export async function POST(request: Request) {
  try {
    const result = await submitIntake(await request.json());
    return json({ reportId: result.report.id, caseId: result.caseDocument.id, runId: result.run.id, status: result.run.status, duplicateSuggested: result.duplicate, unknowns: result.report.unknowns }, 201);
  } catch (error) {
    return problem(error);
  }
}
