import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/tracecase/http";

export const runtime = "nodejs";
export const maxDuration = 120;

function authorized(request: Request): boolean {
  const expected = process.env.WORKER_SIGNING_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const apiKey = process.env.FIREWORKS_API_KEY?.trim();
  const upstreamBaseUrl = (process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1").replace(/\/+$/, "");
  if (!apiKey?.startsWith("fw_") || upstreamBaseUrl.includes("/api/internal/fireworks")) return json({ error: "fireworks_unconfigured" }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const allowedModels = new Set([process.env.FIREWORKS_MODEL, process.env.FIREWORKS_VISION_MODEL].filter(Boolean));
  if (typeof payload.model !== "string" || !allowedModels.has(payload.model)) return json({ error: "model_not_allowed" }, 400);
  if (!Array.isArray(payload.messages) || payload.messages.length > 40) return json({ error: "invalid_messages" }, 400);
  payload.max_tokens = Math.min(12_000, Math.max(1, Number(payload.max_tokens) || 512));

  try {
    const upstream = await fetch(`${upstreamBaseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(115_000),
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return new Response(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return json({ error: "fireworks_upstream_unavailable" }, 502);
  }
}
