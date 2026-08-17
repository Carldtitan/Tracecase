import { timingSafeEqual } from "node:crypto";
import { getFireworksSettings, requestFireworksChat, safeFireworksError } from "@/lib/tracecase/fireworks";
import { json } from "@/lib/tracecase/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEST_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAnklEQVRoge2SQQkAQRDDqqSaz3FWxD3CQCEC0tD04zTRDboB6BW7C3GX6AbdAPSK3YW4S3SDbgB6xe5C3CW6QTcAvWJ3Ie4S3aAbgF6xuxB3iW7QDUCv2F2Iu0Q36AagV+wuxF2iG3QD0Ct2F+Iu0Q26AegVuwtxl+gG3QD0it2FuEt0g24AesXuQtwlukE3AL1idyHuEt2gG4Be8Q8PCG7RhydixY4AAAAASUVORK5CYII=";

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET() {
  const settings = getFireworksSettings();
  return json({
    provider: "fireworks",
    configured: settings.configured,
    visionConfigured: settings.visionConfigured,
    model: settings.model ?? null,
    visionModel: settings.visionModel ?? null,
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return json({ error: "unauthorized" }, 401);
  const settings = getFireworksSettings();
  if (!settings.visionConfigured) return json({ ok: false, provider: "fireworks", error: { message: "Fireworks vision is not configured", retryable: false } }, 503);
  const started = Date.now();
  try {
    const content = await requestFireworksChat({
      vision: true,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Inspect this test image. Reply in one short sentence." },
          { type: "image_url", image_url: { url: TEST_IMAGE } },
        ],
      }],
      maxTokens: 512,
      reasoningEffort: "none",
      timeoutMs: 10_000,
      retries: 1,
    });
    return json({ ok: true, provider: "fireworks", model: settings.visionModel, vision: true, responseReceived: Boolean(content), latencyMs: Date.now() - started });
  } catch (error) {
    return json({ ok: false, provider: "fireworks", model: settings.visionModel, vision: true, latencyMs: Date.now() - started, error: safeFireworksError(error) }, 502);
  }
}
