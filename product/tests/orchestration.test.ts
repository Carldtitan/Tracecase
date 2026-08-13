import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureProject, fixtureScope, FixtureReasoningModel, FixtureWorkerExecutor, seedFixtureStore } from "./fixtures";
import { runInvestigation } from "../lib/tracecase/orchestration";
import { MemoryTracecaseStore } from "../lib/tracecase/store";

test("LangGraph completes the Class-C proof path under two minutes", async () => {
  const store = new MemoryTracecaseStore();
  const input = await seedFixtureStore(store);
  const started = performance.now();
  const result = await runInvestigation({ store, model: new FixtureReasoningModel(), workers: new FixtureWorkerExecutor(), workerSigningSecret: "fixture-secret" }, { ...input, project: fixtureProject });
  const elapsed = performance.now() - started;

  assert.equal(result.run.contextClass, "C");
  assert.equal(result.run.environments.length, 8);
  assert.equal(result.run.outcome?.reproduced, true);
  assert.equal(result.run.patch?.regression.baseFailed, true);
  assert.equal(result.run.patch?.regression.patchPassed, true);
  assert.equal(result.run.patch?.regression.comparableEnvironment, true);
  assert.equal(result.run.status, "verified");
  assert.equal(result.run.review?.preparedOnly, true);
  assert.equal(result.run.review?.draftPullRequestUrl, undefined);
  assert.ok(elapsed < 120_000);
});

test("durable replay does not repeat model work or duplicate events", async () => {
  const store = new MemoryTracecaseStore();
  const input = await seedFixtureStore(store);
  let plans = 0;
  let patches = 0;
  const base = new FixtureReasoningModel();
  const countingModel = {
    name: "counting-fixture",
    plan: async (...args: Parameters<FixtureReasoningModel["plan"]>) => { plans += 1; return base.plan(...args); },
    proposePatch: async (...args: Parameters<FixtureReasoningModel["proposePatch"]>) => { patches += 1; return base.proposePatch(...args); },
  };
  const dependencies = { store, model: countingModel, workers: new FixtureWorkerExecutor(), workerSigningSecret: "fixture-secret" };
  await runInvestigation(dependencies, { ...input, project: fixtureProject });
  const firstEvents = await store.listRunEvents(fixtureScope, input.run.id);
  await runInvestigation(dependencies, { ...input, project: fixtureProject });
  const secondEvents = await store.listRunEvents(fixtureScope, input.run.id);
  assert.equal(plans, 1);
  assert.equal(patches, 1);
  assert.equal(secondEvents.length, firstEvents.length);
});

test("core investigation makes no network request", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network request attempted"); };
  try {
    const store = new MemoryTracecaseStore();
    const input = await seedFixtureStore(store);
    const result = await runInvestigation({ store, model: new FixtureReasoningModel(), workers: new FixtureWorkerExecutor(), workerSigningSecret: "fixture-secret" }, { ...input, project: fixtureProject });
    assert.equal(result.run.status, "verified");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
