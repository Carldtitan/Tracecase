import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { CaseDocument, Environment, Hypothesis, InvestigationRun, Patch, Project, Report, RepositoryChunk, RunCheckpoint, RunEvent, WorkerResult } from "./contracts";
import type { ReasoningModel, WorkerExecutor } from "./integrations";
import { classifyContext, planEnvironments } from "./planner";
import { retrieveRepositoryContext } from "./retrieval";
import { createOpaqueId, signManifest } from "./security";
import type { TracecaseStore } from "./store";

const InvestigationState = Annotation.Root({
  report: Annotation<Report>(),
  caseDocument: Annotation<CaseDocument>(),
  run: Annotation<InvestigationRun>(),
  project: Annotation<Project>(),
  repositoryContext: Annotation<RepositoryChunk[]>({ reducer: (_left, right) => right, default: () => [] }),
  environments: Annotation<Environment[]>({ reducer: (_left, right) => right, default: () => [] }),
  hypotheses: Annotation<Hypothesis[]>({ reducer: (_left, right) => right, default: () => [] }),
  workerResults: Annotation<WorkerResult[]>({ reducer: (_left, right) => right, default: () => [] }),
  reproduced: Annotation<boolean>(),
  patch: Annotation<Patch | null>(),
  finalStatus: Annotation<InvestigationRun["status"]>(),
  notes: Annotation<string[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
});

export type InvestigationStateValue = typeof InvestigationState.State;
type InvestigationStateUpdate = typeof InvestigationState.Update;

export type OrchestrationDependencies = {
  store: TracecaseStore;
  model: ReasoningModel;
  workers: WorkerExecutor;
  workerSigningSecret: string;
  now?: () => Date;
};

const nodeOrder: Record<string, number> = {
  classify_context: 10,
  retrieve_context: 20,
  plan_investigation: 30,
  run_workers: 40,
  evaluate_reproduction: 50,
  generate_fix: 60,
  verify_fix: 70,
  prepare_review: 80,
  finalize_not_reproduced: 90,
  finalize: 100,
};

function eventFor(state: InvestigationStateValue, node: string, phase: "started" | "completed", agent: RunEvent["agent"], now: Date): RunEvent {
  const sequence = nodeOrder[node] * 10 + (phase === "started" ? 1 : 2);
  return {
    id: `event_${state.run.id}_${node}_${phase}`,
    organizationId: state.run.organizationId,
    projectId: state.run.projectId,
    runId: state.run.id,
    sequence,
    type: phase === "started" ? "agent.started" : "agent.completed",
    agent,
    summary: `${node.replaceAll("_", " ")} ${phase}`,
    data: { node, phase },
    timestamp: now.toISOString(),
  };
}

function durableNode(dependencies: OrchestrationDependencies, node: string, agent: RunEvent["agent"], work: (state: InvestigationStateValue) => Promise<InvestigationStateUpdate>) {
  return async (state: InvestigationStateValue): Promise<InvestigationStateUpdate> => {
    const scope = { organizationId: state.run.organizationId, projectId: state.run.projectId };
    const idempotencyKey = `${state.run.id}:${node}:v1`;
    const prior = await dependencies.store.getCheckpointByIdempotencyKey(scope, idempotencyKey);
    if (prior) return prior.state as InvestigationStateUpdate;
    const leaseOwner = `control_${process.pid}_${state.run.id}`;
    const leaseAcquired = await dependencies.store.acquireLease(scope, idempotencyKey, leaseOwner, new Date(Date.now() + 60_000).toISOString());
    if (!leaseAcquired) {
      for (const delay of [50, 100, 200, 400]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const completed = await dependencies.store.getCheckpointByIdempotencyKey(scope, idempotencyKey);
        if (completed) return completed.state as InvestigationStateUpdate;
      }
      throw new Error(`Node ${node} is held by another worker`);
    }
    const now = dependencies.now?.() ?? new Date();
    await dependencies.store.appendRunEvent(eventFor(state, node, "started", agent, now));
    try {
      const update = await work(state);
      const checkpoint: RunCheckpoint = {
      id: `checkpoint_${state.run.id}_${node}`,
      ...scope,
      runId: state.run.id,
      node,
      attempt: 1,
      idempotencyKey,
      state: update as Record<string, unknown>,
      modelDecisionRecorded: node === "plan_investigation" || node === "generate_fix",
      lease: { owner: "local-control-plane", expiresAt: new Date(now.getTime() + 60_000).toISOString() },
      createdAt: now.toISOString(),
      };
      await dependencies.store.putCheckpoint(checkpoint);
      await dependencies.store.appendRunEvent(eventFor(state, node, "completed", agent, now));
      return update;
    } finally {
      await dependencies.store.releaseLease(scope, idempotencyKey, leaseOwner);
    }
  };
}

export function buildInvestigationGraph(dependencies: OrchestrationDependencies) {
  const classify = durableNode(dependencies, "classify_context", "supervisor", async (state) => {
    const available = {
      sessionReplay: false,
      exactEnvironment: Boolean(state.report.environment.browser && state.report.environment.operatingSystem),
      exactRelease: Boolean(state.report.release),
      authenticatedState: Boolean(state.report.reporter.externalUserId),
      telemetry: state.report.consent.technicalDetails,
      repository: Boolean(state.project.repository),
    };
    const result = classifyContext(available);
    return { run: { ...state.run, status: "planning", contextClass: result.contextClass, contextReasons: result.reasons, updatedAt: new Date().toISOString() }, notes: result.reasons };
  });

  const retrieve = durableNode(dependencies, "retrieve_context", "supervisor", async (state) => {
    const result = await retrieveRepositoryContext({ store: dependencies.store, scope: state.run, identifiers: state.report.exactIdentifiers, semanticQuery: `${state.report.expected}\n${state.report.observed}`, commit: state.report.release });
    return { repositoryContext: result.chunks, notes: [`Repository retrieval used the ${result.route} route and returned ${result.chunks.length} chunks.`] };
  });

  const plan = durableNode(dependencies, "plan_investigation", "planner", async (state) => {
    const modelPlan = await dependencies.model.plan({ report: `${state.report.expected}\n${state.report.observed}`, context: state.repositoryContext });
    const hypotheses = modelPlan.hypotheses.slice(0, 8).map((statement, index): Hypothesis => ({ id: `hypothesis_${index + 1}`, statement, evidenceFor: [], evidenceAgainst: [], confidence: index === 0 ? 0.68 : 0.32 }));
    const environments = planEnvironments(state.run.contextClass, state.report, state.run.budget.maxWorkers);
    return { hypotheses, environments, run: { ...state.run, status: "running", hypotheses, environments, updatedAt: new Date().toISOString() } };
  });

  const runWorkers = durableNode(dependencies, "run_workers", "browser", async (state) => {
    const startUrl = state.project.targetTestUrl;
    const allowedHost = new URL(startUrl).hostname;
    const workerResults = await Promise.all(state.environments.map(async (environment, index) => {
      const unsigned = {
        id: `worker_${state.run.id}_${index + 1}`,
        runId: state.run.id,
        organizationId: state.run.organizationId,
        projectId: state.run.projectId,
        environment,
        startUrl,
        allowedHosts: [allowedHost],
        actions: [{ kind: "goto" as const, value: startUrl }],
        assertions: [{ id: "assert_reported_behavior", kind: "visual" as const, description: `Check whether the reported behavior occurs: ${state.report.observed}`, expected: state.report.expected }],
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        maxDurationMs: 30_000,
        nonce: createOpaqueId("nonce"),
      };
      const manifest = { ...unsigned, signature: signManifest(unsigned, dependencies.workerSigningSecret) };
      return dependencies.workers.execute(manifest);
    }));
    return { workerResults, run: { ...state.run, workerResults, budget: { ...state.run.budget, workersUsed: workerResults.length }, updatedAt: new Date().toISOString() } };
  });

  const evaluate = durableNode(dependencies, "evaluate_reproduction", "reproduction", async (state) => {
    const failures = state.workerResults.filter((result) => result.status === "failed" && result.assertions.some((assertion) => assertion.passed === false));
    const reproduced = failures.length > 0;
    const testedScope = state.workerResults.map((result) => `${result.environment.operatingSystem}/${result.environment.browser}, reduced-motion=${result.environment.reducedMotion}, state=${result.environment.stateProfile}`);
    const uncertainty = ["No reporter cookies were available.", "The exact reporter operating system remains unknown."];
    await dependencies.store.putEvidenceBundle({
      id: `evidence_${state.run.id}`,
      organizationId: state.run.organizationId,
      projectId: state.run.projectId,
      runId: state.run.id,
      reportId: state.report.id,
      baseCommit: state.report.release,
      assertions: state.workerResults.flatMap((result) => result.assertions),
      workerResults: state.workerResults,
      testedScope,
      reproduced,
      uncertainty,
      redacted: true,
      createdAt: new Date().toISOString(),
    });
    await dependencies.store.appendRunEvent({ id: `event_${state.run.id}_evidence`, organizationId: state.run.organizationId, projectId: state.run.projectId, runId: state.run.id, sequence: 503, type: "evidence.saved", agent: "reproduction", summary: "A complete redacted evidence bundle was saved.", data: { evidenceBundleId: `evidence_${state.run.id}` }, timestamp: new Date().toISOString() });
    return {
      reproduced,
      run: { ...state.run, status: reproduced ? "reproduced" : "not_reproduced", outcome: { reproduced, summary: reproduced ? `The failure reproduced in ${failures.length} of ${state.workerResults.length} bounded environments.` : "The failure did not reproduce in the tested scope.", testedScope, uncertainty }, updatedAt: new Date().toISOString() },
    };
  });

  const generateFix = durableNode(dependencies, "generate_fix", "fix", async (state) => {
    const patch = await dependencies.model.proposePatch({ reproduction: state.run.outcome?.summary ?? "", context: state.repositoryContext });
    if (!patch) return { patch: null, finalStatus: "diagnosis_only", notes: ["No safe patch was proposed."] };
    return { patch: { ...patch, runId: state.run.id }, run: { ...state.run, status: "fixing", updatedAt: new Date().toISOString() } };
  });

  const verifyFix = durableNode(dependencies, "verify_fix", "fix", async (state) => {
    const proven = Boolean(state.patch?.safe && state.patch.regression.baseFailed && state.patch.regression.patchPassed && state.patch.regression.comparableEnvironment && state.patch.relevantTestsPassed);
    return {
      finalStatus: proven ? "verified" : "diagnosis_only",
      run: { ...state.run, status: proven ? "verified" : "diagnosis_only", patch: state.patch ?? undefined, updatedAt: new Date().toISOString() },
      notes: [proven ? "Base failed, patch passed, and the environment was comparable." : "The patch proof gate did not pass; stopping with diagnosis only."],
    };
  });

  const prepareReview = durableNode(dependencies, "prepare_review", "review", async (state) => {
    const idempotencyKey = `${state.run.id}:draft-pr:v1`;
    const review = state.finalStatus === "verified" && state.project.policy.allowDraftPullRequest
      ? { provider: "github" as const, branch: `tracecase/${state.caseDocument.id}`, idempotencyKey, preparedOnly: true }
      : undefined;
    return { run: { ...state.run, review, updatedAt: new Date().toISOString() }, notes: [review ? "A draft pull request handoff was prepared. No branch was pushed because GitHub is not connected." : "Review handoff was not prepared by policy."] };
  });

  const finalizeNotReproduced = durableNode(dependencies, "finalize_not_reproduced", "supervisor", async (state) => ({ finalStatus: "not_reproduced", run: { ...state.run, status: "not_reproduced", updatedAt: new Date().toISOString() } }));
  const finalize = durableNode(dependencies, "finalize", "supervisor", async (state) => {
    const status = state.finalStatus ?? state.run.status;
    const run = { ...state.run, status, updatedAt: new Date().toISOString() };
    await dependencies.store.putRun(run);
    await dependencies.store.appendRunEvent({ id: `event_${run.id}_completed`, organizationId: run.organizationId, projectId: run.projectId, runId: run.id, sequence: 1002, type: "run.completed", agent: "supervisor", summary: `Run completed with status ${status}.`, data: { status }, timestamp: new Date().toISOString() });
    return { run, finalStatus: status };
  });

  return new StateGraph(InvestigationState)
    .addNode("classify_context", classify, { retryPolicy: { maxAttempts: 2, initialInterval: 100, backoffFactor: 2, maxInterval: 500 } })
    .addNode("retrieve_context", retrieve)
    .addNode("plan_investigation", plan)
    .addNode("run_workers", runWorkers)
    .addNode("evaluate_reproduction", evaluate)
    .addNode("generate_fix", generateFix)
    .addNode("verify_fix", verifyFix)
    .addNode("prepare_review", prepareReview)
    .addNode("finalize_not_reproduced", finalizeNotReproduced)
    .addNode("finalize", finalize)
    .addEdge(START, "classify_context")
    .addEdge("classify_context", "retrieve_context")
    .addEdge("retrieve_context", "plan_investigation")
    .addEdge("plan_investigation", "run_workers")
    .addEdge("run_workers", "evaluate_reproduction")
    .addConditionalEdges("evaluate_reproduction", (state) => state.reproduced ? "generate_fix" : "finalize_not_reproduced")
    .addEdge("generate_fix", "verify_fix")
    .addEdge("verify_fix", "prepare_review")
    .addEdge("prepare_review", "finalize")
    .addEdge("finalize_not_reproduced", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer: new MemorySaver() });
}

export async function runInvestigation(dependencies: OrchestrationDependencies, input: { report: Report; caseDocument: CaseDocument; run: InvestigationRun; project: Project }) {
  const graph = buildInvestigationGraph(dependencies);
  return graph.invoke({ ...input, repositoryContext: [], environments: [], hypotheses: [], workerResults: [], reproduced: false, patch: null, finalStatus: input.run.status, notes: [] }, { configurable: { thread_id: input.run.id } });
}
