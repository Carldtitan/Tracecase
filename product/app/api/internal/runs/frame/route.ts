import { getRuntime } from "@/lib/tracecase/service";
import { sha256, verifyToken } from "@/lib/tracecase/security";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const secret = process.env.WORKER_SIGNING_SECRET;
    const authorization = request.headers.get("authorization");
    if (!secret || !authorization?.startsWith("Bearer ")) return Response.json({ error: "unauthorized" }, { status: 401 });
    const token = verifyToken<{ runId: string; workerId: string; organizationId: string; projectId: string }>(authorization.slice(7), secret);
    if (request.headers.get("x-tracecase-worker") !== token.workerId) return Response.json({ error: "worker_mismatch" }, { status: 403 });
    const content = new Uint8Array(await request.arrayBuffer());
    const jpeg = content[0] === 0xff && content[1] === 0xd8;
    const png = content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4e && content[3] === 0x47;
    if (content.byteLength < 4 || content.byteLength > 3_000_000 || (!jpeg && !png)) return Response.json({ error: "invalid_frame" }, { status: 400 });
    const scope = { organizationId: token.organizationId, projectId: token.projectId };
    const { store } = await getRuntime();
    const run = await store.getRun(scope, token.runId);
    if (!run) return Response.json({ error: "run_not_found" }, { status: 404 });
    const id = `live_${sha256(`${token.runId}:${token.workerId}`).slice(0, 24)}`;
    const now = new Date().toISOString();
    await store.putArtifactContent({
      id,
      ...scope,
      runId: token.runId,
      workerId: token.workerId,
      kind: "live-frame",
      storagePath: `supabase://tracecase-artifacts/${id}`,
      sha256: sha256(content),
      bytes: content.byteLength,
      mimeType: jpeg ? "image/jpeg" : "image/png",
      redacted: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    }, content);
    return Response.json({ accepted: true }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid_frame_token" }, { status: 401 });
  }
}
