import { auth } from "@/auth";
import { getDefaultScope } from "@/lib/tracecase/config";
import { getRuntime } from "@/lib/tracecase/service";

const contentTypes = { screenshot: "image/jpeg", "live-frame": "image/jpeg", video: "video/webm", console: "application/json", network: "application/json", trace: "application/json", attachment: "application/octet-stream", "evidence-bundle": "application/json" } as const;

export async function GET(_request: Request, context: { params: Promise<{ artifactId: string }> }) {
  if (!(await auth())?.user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { artifactId } = await context.params;
  const { store } = await getRuntime();
  const scope = getDefaultScope();
  const [artifact, content] = await Promise.all([store.getArtifact(scope, artifactId), store.getArtifactContent(scope, artifactId)]);
  if (!artifact || !content) return Response.json({ error: "artifact_not_found" }, { status: 404 });
  return new Response(Buffer.from(content), { headers: { "content-type": artifact.mimeType ?? contentTypes[artifact.kind], "content-length": String(content.byteLength), "cache-control": artifact.kind === "live-frame" ? "private, no-store" : "private, max-age=300", "x-content-type-options": "nosniff" } });
}
