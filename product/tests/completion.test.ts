import assert from "node:assert/strict";
import { test } from "node:test";
import { processRemoteCompletion } from "../lib/tracecase/completion";
import { planEnvironments } from "../lib/tracecase/planner";
import { remoteCallbackSchema } from "../lib/tracecase/remote-contracts";
import { MemoryTracecaseStore } from "../lib/tracecase/store";
import { fixtureProject, fixtureScope, seedFixtureStore } from "./fixtures";

async function setup() {
  const store = new MemoryTracecaseStore();
  const seeded = await seedFixtureStore(store);
  const project = {
    ...fixtureProject,
    repository: { provider: "github" as const, owner: "acme", name: "web", defaultBranch: "main", installationId: "42" },
    policy: { ...fixtureProject.policy, allowBranchPush: true },
  };
  await store.putProject(project);
  const environment = planEnvironments("C", seeded.report, 1)[0];
  const payload = remoteCallbackSchema.parse({
    kind: "completed",
    runId: seeded.run.id,
    baseCommit: "8d42fe1123456789012345678901234567890123",
    hypotheses: [{ id: "hypothesis_1", statement: "The completion event is missing.", evidenceFor: [], evidenceAgainst: [], confidence: 0.8 }],
    environments: [environment],
    workerResults: [{ workerId: `worker_${seeded.run.id}_1`, environment, status: "failed", assertions: [{ id: "healthy_result", kind: "dom", description: "Healthy result appears", expected: "Published", selector: "[role=status]", operator: "text_contains", observed: "Publishing", passed: false }], console: [], network: [], artifactIds: [], durationMs: 920 }],
    outcome: { reproduced: true, summary: "The expected result did not appear.", testedScope: ["linux/chromium"], uncertainty: ["No reporter cookies were available."] },
    patch: { id: "patch_run_2487", runId: seeded.run.id, baseCommit: "8d42fe1123456789012345678901234567890123", summary: "Complete state without waiting for animation.", files: [{ path: "src/button.ts", diff: "@@ -1 +1 @@\n-old\n+new" }, { path: "src/button.test.ts", diff: "@@ -0,0 +1 @@\n+test" }], regression: { path: "src/button.test.ts", baseFailed: true, patchPassed: true, comparableEnvironment: true }, relevantTestsPassed: true, applicationRecheckPassed: true, preExistingFailures: [], safe: true },
    filesToCommit: [{ path: "src/button.ts", content: "export const state = 'done';" }, { path: "src/button.test.ts", content: "test('done', () => {});" }],
    repositoryChunks: [],
    artifacts: [{ workerId: `worker_${seeded.run.id}_1`, kind: "screenshot", mimeType: "image/jpeg", contentBase64: Buffer.from("fixture image").toString("base64") }],
    timestamp: new Date().toISOString(),
  });
  assert.equal(payload.kind, "completed");
  return { store, seeded, payload };
}

test("verified remote evidence creates an idempotent draft PR handoff", async () => {
  const { store, seeded, payload } = await setup();
  let published = 0;
  const github = {
    async createDraftPullRequestFromFiles(input: { files: Array<{ path: string; content: string }>; branch: string }) {
      published += 1;
      assert.equal(input.files.length, 2);
      return { url: "https://github.com/acme/web/pull/7", branch: input.branch, commitSha: "abc1234" };
    },
  };
  const run = await processRemoteCompletion({ store, github }, fixtureScope, payload);
  assert.equal(run.status, "verified");
  assert.equal(run.review?.preparedOnly, false);
  assert.equal(run.review?.draftPullRequestUrl, "https://github.com/acme/web/pull/7");
  assert.equal(published, 1);
  assert.equal((await store.getEvidenceBundle(fixtureScope, seeded.run.id))?.reproduced, true);
  const artifactId = run.workerResults[0].artifactIds[0];
  assert.ok(artifactId);
  assert.equal(Buffer.from((await store.getArtifactContent(fixtureScope, artifactId)) ?? []).toString(), "fixture image");
});

test("an unproven patch stops at diagnosis and never calls GitHub", async () => {
  const { store, payload } = await setup();
  if (payload.kind !== "completed" || !payload.patch) throw new Error("Fixture payload invalid");
  payload.patch.regression.baseFailed = false;
  let published = false;
  const run = await processRemoteCompletion({ store, github: { async createDraftPullRequestFromFiles() { published = true; throw new Error("must not run"); } } }, fixtureScope, payload);
  assert.equal(run.status, "diagnosis_only");
  assert.equal(published, false);
  assert.equal(run.review, undefined);
});

test("automatic merge runs only after the complete proof gate", async () => {
  const { store, payload } = await setup();
  await store.putProject({ ...fixtureProject, repository: { provider: "github", owner: "acme", name: "web", defaultBranch: "main", installationId: "42" }, policy: { ...fixtureProject.policy, allowBranchPush: true, allowDraftPullRequest: true, allowMerge: true, allowDeploy: false } });
  let merged = 0;
  const github = {
    async createDraftPullRequestFromFiles(input: { branch: string; draft?: boolean }) {
      assert.equal(input.draft, false);
      return { url: "https://github.com/acme/web/pull/8", branch: input.branch, commitSha: "def5678", pullRequestNumber: 8 };
    },
    async mergePullRequest(input: { pullRequestNumber: number; expectedHeadSha: string }) {
      merged += 1;
      assert.equal(input.pullRequestNumber, 8);
      assert.equal(input.expectedHeadSha, "def5678");
      return { merged: true, message: "merged", sha: "merge890" };
    },
  };
  const run = await processRemoteCompletion({ store, github }, fixtureScope, payload);
  assert.equal(run.review?.pullRequestNumber, 8);
  assert.ok(run.review?.mergedAt);
  assert.equal(merged, 1);
});
