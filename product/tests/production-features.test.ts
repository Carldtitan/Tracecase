import assert from "node:assert/strict";
import test from "node:test";
import type { Report } from "../lib/tracecase/contracts";
import { planEnvironments } from "../lib/tracecase/planner";
import { MemoryTracecaseStore } from "../lib/tracecase/store";

const scope = { organizationId: "org_prod", projectId: "project_prod" };

test("intake drafts remain durable until their 24-hour deadline", async () => {
  const store = new MemoryTracecaseStore();
  const now = new Date();
  await store.putIntakeDraft({ id: "draft_prod", ...scope, sessionId: "session_prod", projectKeyHash: "a".repeat(64), payload: { observed: "Broken" }, dueAt: new Date(now.getTime() + 60_000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() });
  assert.equal((await store.listDueIntakeDrafts(now.toISOString())).length, 0);
  assert.equal((await store.listDueIntakeDrafts(new Date(now.getTime() + 120_000).toISOString())).length, 1);
  await store.deleteIntakeDraft(scope, "session_prod");
  assert.equal(await store.getIntakeDraftBySession(scope, "session_prod"), null);
});

test("live frames overwrite by worker and stay tenant scoped", async () => {
  const store = new MemoryTracecaseStore();
  const artifact = { id: "live_prod", ...scope, runId: "run_prod", workerId: "worker_prod", kind: "live-frame" as const, storagePath: "mongodb-artifact://live_prod", sha256: "b".repeat(64), bytes: 3, mimeType: "image/jpeg", redacted: true, expiresAt: new Date(Date.now() + 1000).toISOString(), createdAt: new Date().toISOString() };
  await store.putArtifactContent(artifact, new Uint8Array([1, 2, 3]));
  assert.equal((await store.listArtifacts(scope, { runId: "run_prod", kind: "live-frame" })).length, 1);
  assert.equal((await store.listArtifacts({ organizationId: "org_other", projectId: "project_prod" }, { runId: "run_prod" })).length, 0);
});

test("real environment planning uses BrowserStack and never relabels Daytona", () => {
  const report = { environment: {}, unknowns: [] } as unknown as Report;
  const genuine = planEnvironments("C", report, 10, { realEnvironments: true });
  assert.ok(genuine.some((environment) => environment.operatingSystem === "windows" && environment.executionProvider === "browserstack"));
  assert.ok(genuine.some((environment) => environment.operatingSystem === "macos" && environment.executionProvider === "browserstack"));
  assert.ok(genuine.some((environment) => environment.operatingSystem === "android" && environment.deviceProfile === "android" && environment.realDevice));
  assert.ok(genuine.some((environment) => environment.operatingSystem === "ios" && environment.deviceProfile === "iphone" && environment.realDevice));
  const fallback = planEnvironments("C", report, 8);
  assert.ok(fallback.every((environment) => environment.executionProvider !== "browserstack" && environment.realDevice !== true));
});
