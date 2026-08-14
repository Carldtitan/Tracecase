import assert from "node:assert/strict";
import test from "node:test";
import { FireworksRequestError, getFireworksSettings, requestFireworksChat, safeFireworksError } from "../lib/tracecase/fireworks";

test("Fireworks vision model can be configured separately from its text model", () => {
  const settings = getFireworksSettings({
    NODE_ENV: "test",
    FIREWORKS_API_KEY: "fw_test",
    FIREWORKS_MODEL: "accounts/fireworks/models/text-model",
    FIREWORKS_VISION_MODEL: "accounts/fireworks/models/vision-model",
  } as NodeJS.ProcessEnv);
  assert.equal(settings.configured, true);
  assert.equal(settings.visionConfigured, true);
  assert.equal(settings.model, "accounts/fireworks/models/text-model");
  assert.equal(settings.visionModel, "accounts/fireworks/models/vision-model");
});

test("Fireworks rejects Vercel sensitive placeholders as credentials", () => {
  const settings = getFireworksSettings({
    NODE_ENV: "test",
    FIREWORKS_API_KEY: "(Sensitive)",
    FIREWORKS_MODEL: "accounts/fireworks/models/kimi-k2p6",
  } as NodeJS.ProcessEnv);
  assert.equal(settings.configured, false);
  assert.equal(settings.visionConfigured, false);
  assert.equal(getFireworksSettings({ NODE_ENV: "test", FIREWORKS_API_KEY: "not-a-real-key", FIREWORKS_MODEL: "accounts/fireworks/models/kimi-k2p6" } as NodeJS.ProcessEnv).configured, false);
});

test("Fireworks vision retries a transient response and uses the vision model", async () => {
  const requests: Array<Record<string, unknown>> = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (calls === 1) return new Response("busy", { status: 503 });
    return Response.json({ choices: [{ message: { content: "Image accepted" } }] });
  };
  const content = await requestFireworksChat({
    env: {
      NODE_ENV: "test",
      FIREWORKS_API_KEY: "fw_test",
      FIREWORKS_MODEL: "accounts/fireworks/models/text-model",
      FIREWORKS_VISION_MODEL: "accounts/fireworks/models/kimi-k2p6",
    } as NodeJS.ProcessEnv,
    vision: true,
    messages: [{ role: "user", content: [{ type: "text", text: "Inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] }],
    retries: 1,
    retryDelayMs: 0,
    fetchImpl,
  });
  assert.equal(content, "Image accepted");
  assert.equal(calls, 2);
  assert.equal(requests[1].model, "accounts/fireworks/models/kimi-k2p6");
});

test("Fireworks errors expose status but never provider response bodies", async () => {
  await assert.rejects(
    () => requestFireworksChat({
      env: { NODE_ENV: "test", FIREWORKS_API_KEY: "fw_test", FIREWORKS_MODEL: "accounts/fireworks/models/kimi-k2p6" } as NodeJS.ProcessEnv,
      messages: [{ role: "user", content: "hello" }],
      retries: 0,
      fetchImpl: async () => new Response("secret provider details", { status: 401 }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof FireworksRequestError);
      assert.equal(error.status, 401);
      assert.doesNotMatch(error.message, /secret provider details/);
      assert.deepEqual(safeFireworksError(error), { message: "Fireworks returned HTTP 401", status: 401, retryable: false });
      return true;
    },
  );
});
