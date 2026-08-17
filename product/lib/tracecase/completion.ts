import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Artifact, InvestigationRun, Project, RunEvent, TenantScope } from "./contracts";
import { GitHubAdapter } from "./integrations";
import { buildDraftPullRequestBody } from "./review";
import type { RemoteCallback } from "./remote-contracts";
import { filterRepositoryContent, redactText, redactUnknown, sha256 } from "./security";
import type { TracecaseStore } from "./store";

function runEvent(run: InvestigationRun, sequence: number, type: RunEvent["type"], agent: RunEvent["agent"], summary: string, data: Record<string, unknown> = {}): RunEvent {
  return { id: `event_${run.id}_${sequence}`, organizationId: run.organizationId, projectId: run.projectId, runId: run.id, sequence, type, agent, summary, data: redactUnknown(data), timestamp: new Date().toISOString() };
}

export async function processRemoteProgress(store: TracecaseStore, scope: TenantScope, callback: Extract<RemoteCallback, { kind: "progress" | "failed" }>): Promise<void> {
  const run = await store.getRun(scope, callback.runId);
  if (!run) throw new Error("Run not found");
  if (callback.kind === "failed") {
    const failed = { ...run, status: "failed" as const, execution: run.execution ? { ...run.execution, lastHeartbeatAt: callback.timestamp, lastError: redactText(callback.error) } : undefined, updatedAt: callback.timestamp };
    await store.putRun(failed);
    await store.appendRunEvent(runEvent(failed, 5900, "run.failed", "system", "The isolated investigation failed.", { phase: callback.phase, error: callback.error }));
    return;
  }
  const status = callback.agent === "planner" ? "planning" : callback.agent === "browser" || callback.agent === "reproduction" ? "running" : callback.agent === "fix" ? "fixing" : run.status;
  await store.putRun({ ...run, status, execution: run.execution ? { ...run.execution, lastHeartbeatAt: callback.timestamp } : undefined, updatedAt: callback.timestamp });
  await store.appendRunEvent(runEvent(run, callback.sequence, callback.eventType, callback.agent, callback.summary, callback.data));
}

const CompletionState = Annotation.Root({
  payload: Annotation<Extract<RemoteCallback, { kind: "completed" }>>(),
  run: Annotation<InvestigationRun>(),
  project: Annotation<Project>(),
  filesSafe: Annotation<boolean>(),
  artifactIdsByWorker: Annotation<Record<string, string[]>>({ reducer: (_left, right) => right, default: () => ({}) }),
  reviewError: Annotation<string | undefined>(),
});

type ReviewPublisher = {
  createDraftPullRequestFromFiles: (input: Parameters<GitHubAdapter["createDraftPullRequestFromFiles"]>[0]) => Promise<{ url: string; branch: string; commitSha: string; pullRequestNumber?: number }>;
  mergePullRequest?: GitHubAdapter["mergePullRequest"];
};
type CompletionDependencies = { store: TracecaseStore; github?: ReviewPublisher };

export async function processRemoteCompletion(dependencies: CompletionDependencies, scope: TenantScope, payload: Extract<RemoteCallback, { kind: "completed" }>): Promise<InvestigationRun> {
  const [run, project] = await Promise.all([dependencies.store.getRun(scope, payload.runId), dependencies.store.getProject(scope)]);
  if (!run || !project) throw new Error("Run or project not found");
  const caseDocument = await dependencies.store.getCase(scope, run.caseId);
  if (!caseDocument) throw new Error("Case not found");

  const persistEvidence = async (state: typeof CompletionState.State) => {
    const artifactIdsByWorker: Record<string, string[]> = {};
    for (const item of state.payload.artifacts) {
      const content = Buffer.from(item.contentBase64, "base64");
      if (content.byteLength === 0 || content.byteLength > 3_000_000) continue;
      const id = `artifact_${sha256(`${state.run.id}:${item.workerId}:${item.kind}`).slice(0, 24)}`;
      const artifact: Artifact = {
        id,
        organizationId: state.run.organizationId,
        projectId: state.run.projectId,
        runId: state.run.id,
        kind: item.kind,
        storagePath: `supabase://tracecase-artifacts/${id}`,
        sha256: sha256(content),
        bytes: content.byteLength,
        mimeType: item.mimeType,
        redacted: true,
        expiresAt: new Date(Date.now() + state.project.retention.artifactsDays * 86_400_000).toISOString(),
        createdAt: payload.timestamp,
      };
      await dependencies.store.putArtifactContent(artifact, content);
      artifactIdsByWorker[item.workerId] = [...(artifactIdsByWorker[item.workerId] ?? []), id];
    }
    if (state.payload.repositoryChunks.length) await dependencies.store.putRepositoryChunks(state.payload.repositoryChunks);
    const workerResults = state.payload.workerResults.map((result) => ({ ...result, artifactIds: artifactIdsByWorker[result.workerId] ?? [] }));
    await dependencies.store.putEvidenceBundle({
      id: `evidence_${state.run.id}`,
      organizationId: state.run.organizationId,
      projectId: state.run.projectId,
      runId: state.run.id,
      reportId: caseDocument.reportIds[0],
      baseCommit: state.payload.baseCommit,
      assertions: workerResults.flatMap((result) => result.assertions),
      workerResults,
      testedScope: state.payload.outcome.testedScope,
      reproduced: state.payload.outcome.reproduced,
      uncertainty: state.payload.outcome.uncertainty,
      redacted: true,
      createdAt: payload.timestamp,
    });
    await dependencies.store.appendRunEvent(runEvent(state.run, 6000, "evidence.saved", "reproduction", "The redacted evidence bundle was saved.", { artifactCount: state.payload.artifacts.length }));
    return { artifactIdsByWorker, payload: { ...state.payload, workerResults } };
  };

  const enforceProofGate = async (state: typeof CompletionState.State) => {
    const contentByPath = new Map(state.payload.filesToCommit.map((file) => [file.path, file.content]));
    const patchPaths = new Set(state.payload.patch?.files.map((file) => file.path) ?? []);
    const filesSafe = Boolean(
      state.payload.patch &&
      state.payload.outcome.reproduced &&
      state.payload.patch.safe &&
      state.payload.patch.baseCommit === state.payload.baseCommit &&
      state.payload.patch.regression.baseFailed &&
      state.payload.patch.regression.patchPassed &&
      state.payload.patch.regression.comparableEnvironment &&
      state.payload.patch.relevantTestsPassed &&
      state.payload.patch.applicationRecheckPassed === true &&
      state.payload.filesToCommit.length > 0 &&
      state.payload.filesToCommit.length <= 20 &&
      state.payload.filesToCommit.every((file) => patchPaths.has(file.path) && contentByPath.has(file.path) && !filterRepositoryContent(file.path, file.content).ignored),
    );
    const status: InvestigationRun["status"] = !state.payload.outcome.reproduced ? "not_reproduced" : filesSafe ? "verified" : "diagnosis_only";
    const updated: InvestigationRun = {
      ...state.run,
      status,
      hypotheses: state.payload.hypotheses,
      environments: state.payload.environments,
      workerResults: state.payload.workerResults,
      outcome: state.payload.outcome,
      patch: state.payload.patch,
      budget: { ...state.run.budget, workersUsed: state.payload.workerResults.length },
      execution: state.run.execution ? { ...state.run.execution, lastHeartbeatAt: payload.timestamp } : undefined,
      updatedAt: payload.timestamp,
    };
    await dependencies.store.putRun(updated);
    return { run: updated, filesSafe };
  };

  const publishReview = async (state: typeof CompletionState.State) => {
    if (!state.filesSafe || state.run.status !== "verified") return {};
    const repository = state.project.repository;
    const branch = `tracecase/${caseDocument.id}-${state.run.id.slice(-8)}`.replace(/[^A-Za-z0-9/_-]/g, "-");
    const idempotencyKey = `${state.run.id}:draft-pr:v2`;
    if (!state.project.policy.allowBranchPush || !state.project.policy.allowDraftPullRequest || !repository?.installationId) {
      return { run: { ...state.run, review: { provider: "github" as const, branch, idempotencyKey, preparedOnly: true } } };
    }
    try {
      const evidenceBundleId = `evidence_${state.run.id}`;
      const body = buildDraftPullRequestBody({ caseDocument, run: state.run, evidenceBundleId });
      const github = dependencies.github ?? new GitHubAdapter();
      const result = await github.createDraftPullRequestFromFiles({
        owner: repository.owner,
        repo: repository.name,
        installationId: repository.installationId,
        baseBranch: repository.defaultBranch,
        baseSha: state.payload.baseCommit,
        branch,
        title: `Fix: ${caseDocument.title}`.slice(0, 240),
        body,
        files: state.payload.filesToCommit,
        draft: !state.project.policy.allowMerge,
      });
      let updated: InvestigationRun = { ...state.run, review: { provider: "github" as const, branch: result.branch, ...(result.pullRequestNumber ? { pullRequestNumber: result.pullRequestNumber } : {}), draftPullRequestUrl: result.url, idempotencyKey, preparedOnly: false }, updatedAt: new Date().toISOString() };
      await dependencies.store.appendRunEvent(runEvent(updated, 6100, "review.created", "review", state.project.policy.allowMerge ? "A tested pull request was opened." : "A tested draft pull request was opened.", { branch: result.branch, url: result.url, commitSha: result.commitSha }));
      await dependencies.store.appendAuditEvent({ id: `audit_pr_${state.run.id}`, organizationId: state.run.organizationId, projectId: state.run.projectId, actorId: "tracecase-agent", action: "github.draft_pr.create", target: result.url, result: "changed", details: { runId: state.run.id, branch: result.branch, commitSha: result.commitSha }, timestamp: updated.updatedAt });
      if (state.project.policy.allowMerge) {
        if (!result.pullRequestNumber || !github.mergePullRequest) throw new Error("The GitHub publisher cannot merge this pull request");
        const merge = await github.mergePullRequest({ owner: repository.owner, repo: repository.name, installationId: repository.installationId, pullRequestNumber: result.pullRequestNumber, expectedHeadSha: result.commitSha });
        if (!merge.merged) throw new Error(`GitHub did not merge the verified pull request: ${merge.message}`);
        const mergedAt = new Date().toISOString();
        updated = { ...updated, review: { ...updated.review!, mergedAt }, updatedAt: mergedAt };
        await dependencies.store.appendRunEvent(runEvent(updated, 6120, "review.merged", "review", "The verified pull request was merged.", { pullRequestNumber: result.pullRequestNumber, mergeSha: merge.sha }));
        await dependencies.store.appendAuditEvent({ id: `audit_merge_${state.run.id}`, organizationId: state.run.organizationId, projectId: state.run.projectId, actorId: "tracecase-agent", action: "github.pull_request.merge", target: result.url, result: "changed", details: { runId: state.run.id, pullRequestNumber: result.pullRequestNumber, mergeSha: merge.sha }, timestamp: mergedAt });
        if (state.project.policy.allowDeploy) {
          try {
            const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
            if (!hook) throw new Error("Automatic deploy is enabled, but VERCEL_DEPLOY_HOOK_URL is missing");
            const deployResponse = await fetch(hook, { method: "POST" });
            if (!deployResponse.ok) throw new Error(`Deployment hook returned ${deployResponse.status}`);
            const deploy = await deployResponse.json().catch(() => ({})) as { job?: { id?: string; state?: string }; url?: string };
            const deploymentTriggeredAt = new Date().toISOString();
            updated = { ...updated, review: { ...updated.review!, deploymentTriggeredAt, ...(deploy.url ? { deploymentUrl: deploy.url } : {}) }, updatedAt: deploymentTriggeredAt };
            await dependencies.store.appendRunEvent(runEvent(updated, 6130, "deployment.triggered", "review", "Deployment was triggered after merge.", { jobId: deploy.job?.id, state: deploy.job?.state, url: deploy.url }));
          } catch (error) {
            const message = redactText(error instanceof Error ? error.message : "Unknown deployment error");
            await dependencies.store.appendRunEvent(runEvent(updated, 6131, "deployment.failed", "review", "The pull request merged, but deployment could not be triggered.", { error: message }));
          }
        }
      }
      return { run: updated };
    } catch (error) {
      const message = redactText(error instanceof Error ? error.message : "Unknown GitHub error");
      const updated = { ...state.run, review: { provider: "github" as const, branch, idempotencyKey, preparedOnly: true }, updatedAt: new Date().toISOString() };
      await dependencies.store.appendRunEvent(runEvent(updated, 6101, "review.failed", "review", "The patch is verified, but the draft pull request could not be opened.", { error: message }));
      return { run: updated, reviewError: message };
    }
  };

  const finalize = async (state: typeof CompletionState.State) => {
    await dependencies.store.putRun(state.run);
    const nextCase = { ...caseDocument, status: state.payload.outcome.reproduced ? "reproduced" as const : caseDocument.status, updatedAt: new Date().toISOString() };
    await dependencies.store.putCase(nextCase);
    await dependencies.store.appendRunEvent(runEvent(state.run, 6200, "run.completed", "supervisor", `Run completed with status ${state.run.status}.`, { status: state.run.status, draftPullRequestUrl: state.run.review?.draftPullRequestUrl, reviewError: state.reviewError }));
    return {};
  };

  const graph = new StateGraph(CompletionState)
    .addNode("persist_evidence", persistEvidence)
    .addNode("enforce_proof_gate", enforceProofGate)
    .addNode("publish_review", publishReview)
    .addNode("finalize", finalize)
    .addEdge(START, "persist_evidence")
    .addEdge("persist_evidence", "enforce_proof_gate")
    .addEdge("enforce_proof_gate", "publish_review")
    .addEdge("publish_review", "finalize")
    .addEdge("finalize", END)
    .compile();

  const result = await graph.invoke({ payload, run, project, filesSafe: false, artifactIdsByWorker: {} });
  return result.run;
}
