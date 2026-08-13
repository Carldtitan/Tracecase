import { getDefaultScope } from "@/lib/tracecase/config";
import { problem } from "@/lib/tracecase/http";
import { getRuntime } from "@/lib/tracecase/service";
import { requireProjectActor } from "@/lib/tracecase/team";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string; workerId: string }> }) {
  try {
    await requireProjectActor("viewer");
    const { runId, workerId } = await params;
    const scope = getDefaultScope();
    const { store } = await getRuntime();
    const run = await store.getRun(scope, runId);
    const replayUrl = run?.workerResults.find((worker) => worker.workerId === workerId)?.providerSessionUrl;
    if (!replayUrl) return new Response("Replay unavailable", { status: 404 });

    const target = new URL(replayUrl);
    if (target.protocol !== "https:" || !target.hostname.endsWith("browserstack.com")) {
      return new Response("Replay provider is not allowed", { status: 400 });
    }
    const username = process.env.BROWSERSTACK_USERNAME;
    const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;
    if (!username || !accessKey) return new Response("Replay provider is not configured", { status: 503 });

    const range = request.headers.get("range");
    const upstream = await fetch(target, {
      headers: {
        authorization: `Basic ${Buffer.from(`${username}:${accessKey}`).toString("base64")}`,
        ...(range ? { range } : {}),
      },
      cache: "no-store",
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) return new Response("Replay unavailable", { status: upstream.status });

    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-type": upstream.headers.get("content-type") ?? "video/mp4",
      "x-content-type-options": "nosniff",
    });
    for (const name of ["accept-ranges", "content-length", "content-range"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return problem(error);
  }
}
