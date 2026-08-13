import { json, problem } from "@/lib/tracecase/http";
import { generateIntakeQuestions } from "@/lib/tracecase/service";

export async function POST(request: Request) {
  try {
    const result = await generateIntakeQuestions(await request.json());
    return json({ ...result, maxQuestions: 1 });
  } catch (error) {
    return problem(error);
  }
}
