import { getDefaultScope } from "@/lib/tracecase/config";
import { processRemoteCompletion, processRemoteProgress } from "@/lib/tracecase/completion";
import { json, problem } from "@/lib/tracecase/http";
import { remoteCallbackSchema } from "@/lib/tracecase/remote-contracts";
import { getRuntime } from "@/lib/tracecase/service";
import { verifyWebhookSignature } from "@/lib/tracecase/security";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const secret = process.env.WORKER_SIGNING_SECRET;
    if (!secret) return json({ error: "worker_callback_unconfigured" }, 503);
    const body = await request.text();
    if (!verifyWebhookSignature(body, request.headers.get("x-tracecase-signature"), secret)) return json({ error: "invalid_signature" }, 401);
    const payload = remoteCallbackSchema.parse(JSON.parse(body));
    const scope = getDefaultScope();
    if (payload.runId.length > 96) return json({ error: "invalid_run" }, 400);
    const { store } = await getRuntime();
    if (payload.kind === "completed") {
      const run = await processRemoteCompletion({ store }, scope, payload);
      return json({ accepted: true, status: run.status, draftPullRequestUrl: run.review?.draftPullRequestUrl });
    }
    await processRemoteProgress(store, scope, payload);
    return json({ accepted: true }, 202);
  } catch (error) {
    return problem(error);
  }
}
