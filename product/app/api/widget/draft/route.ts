import { json, problem } from "@/lib/tracecase/http";
import { saveIntakeDraft } from "@/lib/tracecase/service";

export async function PUT(request: Request) {
  try {
    const draft = await saveIntakeDraft(await request.json());
    return json({ saved: true, dueAt: draft.dueAt });
  } catch (error) {
    return problem(error);
  }
}
