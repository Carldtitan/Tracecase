import { json, problem } from "@/lib/tracecase/http";
import { intakeQuestions } from "@/lib/tracecase/service";

export async function POST(request: Request) {
  try {
    return json({ questions: intakeQuestions(await request.json()), deterministic: true, maxQuestions: 3 });
  } catch (error) {
    return problem(error);
  }
}
