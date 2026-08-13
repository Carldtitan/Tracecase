import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureReport, fixtureChunks, fixtureProject, fixtureScope, seedFixtureStore } from "./fixtures";
import { retrieveRepositoryContext } from "../lib/tracecase/retrieval";
import { MemoryTracecaseStore } from "../lib/tracecase/store";

test("memory persistence keeps tenant data isolated", async () => {
  const store = new MemoryTracecaseStore();
  await seedFixtureStore(store);
  assert.ok(await store.getRun(fixtureScope, "run_2487"));
  assert.equal(await store.getRun({ organizationId: "org_other", projectId: fixtureScope.projectId }, "run_2487"), null);
  assert.equal(await store.getProject({ organizationId: "org_other", projectId: fixtureProject.id }), null);
});

test("reports are immutable", async () => {
  const store = new MemoryTracecaseStore();
  const report = createFixtureReport("report_immutable");
  await store.putReport(report);
  await assert.rejects(() => store.putReport({ ...report, observed: "changed" }), /immutable/);
});

test("checkpoint and event writes are idempotent", async () => {
  const store = new MemoryTracecaseStore();
  const checkpoint = { id: "checkpoint_test", ...fixtureScope, runId: "run_test", node: "planner", attempt: 1, idempotencyKey: "run_test:planner:v1", state: { answer: 1 }, modelDecisionRecorded: true, createdAt: new Date().toISOString() };
  assert.equal((await store.putCheckpoint(checkpoint)).inserted, true);
  assert.equal((await store.putCheckpoint(checkpoint)).inserted, false);
  const event = { id: "event_test", ...fixtureScope, runId: "run_test", sequence: 1, type: "run.created" as const, agent: "system" as const, summary: "created", data: {}, timestamp: new Date().toISOString() };
  await store.appendRunEvent(event);
  await store.appendRunEvent(event);
  assert.equal((await store.listRunEvents(fixtureScope, "run_test")).length, 1);
});

test("repository retrieval performs exact lookup without an embedding", async () => {
  const store = new MemoryTracecaseStore();
  await store.putRepositoryChunks(fixtureChunks);
  const result = await retrieveRepositoryContext({ store, scope: fixtureScope, identifiers: ["src/components/PublishButton.tsx"], semanticQuery: "stuck publish", commit: "8d42fe1" });
  assert.equal(result.route, "exact");
  assert.equal(result.chunks[0].path, "src/components/PublishButton.tsx");
});
