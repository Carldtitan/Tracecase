import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Daytona } from "@daytona/sdk";
import { getConfig } from "./config";
import type { InvestigationRun, Project, RunEvent, TenantScope } from "./contracts";
import { GitHubAdapter } from "./integrations";
import { planEnvironments } from "./planner";
import type { RemoteJob } from "./remote-contracts";
import { remoteJobSchema } from "./remote-contracts";
import { createOpaqueId, redactText } from "./security";
import { getRuntime } from "./service";

function event(run: InvestigationRun, values: Pick<RunEvent, "sequence" | "type" | "agent" | "summary"> & { data?: Record<string, unknown> }): RunEvent {
  return {
    id: `event_${run.id}_${values.sequence}`,
    organizationId: run.organizationId,
    projectId: run.projectId,
    runId: run.id,
    sequence: values.sequence,
    type: values.type,
    agent: values.agent,
    summary: values.summary,
    data: values.data ?? {},
    timestamp: new Date().toISOString(),
  };
}

function configuredDomains(targetUrl: string, values: string[]): string[] {
  const exact = [new URL(targetUrl).hostname, ...values].map((value) => value.trim().toLowerCase()).filter(Boolean);
  return [...new Set(exact)].slice(0, 40);
}

export function liveExecutionConfigured(): boolean {
  const config = getConfig();
  return Boolean(
    config.allowExternalCalls &&
    config.runtimeMode === "live" &&
    config.persistence === "mongodb" &&
    config.mongodbUri &&
    config.workerSigningSecret &&
    config.appUrl &&
    process.env.DAYTONA_API_KEY &&
    process.env.FIREWORKS_API_KEY &&
    process.env.FIREWORKS_MODEL &&
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64,
  );
}

async function loadWorkerSource(name: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "worker", name));
}

export async function dispatchRun(scope: TenantScope, runId: string): Promise<{ dispatched: boolean; sandboxId?: string; reason?: string }> {
  const config = getConfig();
  const { store } = await getRuntime();
  const leaseKey = `${runId}:remote-dispatch:v1`;
  const leaseOwner = createOpaqueId("dispatcher");
  const acquired = await store.acquireLease(scope, leaseKey, leaseOwner, new Date(Date.now() + 120_000).toISOString());
  if (!acquired) return { dispatched: false, reason: "dispatch_already_in_progress" };

  let run: InvestigationRun | null = null;
  try {
    run = await store.getRun(scope, runId);
    if (!run) throw new Error("Run not found");
    if (run.execution && !["failed", "cancelled"].includes(run.status)) return { dispatched: false, sandboxId: run.execution.sandboxId, reason: "already_dispatched" };
    if (!liveExecutionConfigured()) return { dispatched: false, reason: "live_execution_not_configured" };

    const [project, caseDocument] = await Promise.all([store.getProject(scope), store.getCase(scope, run.caseId)]);
    if (!project || !caseDocument) throw new Error("Run project or case is unavailable");
    const report = await store.getReport(scope, caseDocument.reportIds[0]);
    if (!report) throw new Error("The source report is unavailable");
    if (!project.repository?.installationId) throw new Error("Install the GitHub App on the selected repository before dispatching a run");
    if (!config.appUrl || !config.workerSigningSecret) throw new Error("NEXT_PUBLIC_APP_URL and WORKER_SIGNING_SECRET are required");

    const environments = planEnvironments(run.contextClass, report, Math.min(run.budget.maxWorkers, project.policy.maxParallelWorkers));
    const targetAllowedDomains = configuredDomains(project.targetTestUrl, config.targetAllowedDomains);
    const callbackUrl = new URL("/api/internal/runs/callback", config.appUrl).toString();
    const job: RemoteJob = remoteJobSchema.parse({
      version: 1,
      runId: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      repository: { ...project.repository, installationId: project.repository.installationId },
      report: {
        id: report.id,
        expected: report.expected,
        observed: report.observed,
        route: report.route,
        release: report.release,
        exactIdentifiers: report.exactIdentifiers,
        unknowns: report.unknowns,
        environment: report.environment,
      },
      caseDocument: { id: caseDocument.id, title: caseDocument.title, unknowns: caseDocument.unknowns },
      targetUrl: project.targetTestUrl,
      targetAllowedDomains,
      privateSelectors: config.privateSelectors,
      environments,
      budget: { maxMinutes: run.budget.maxMinutes, maxWorkers: run.budget.maxWorkers },
      callbackUrl,
      browserImage: config.daytonaBrowserImage,
      playwrightVersion: config.playwrightVersion,
    });

    const github = new GitHubAdapter();
    const installationToken = await github.installationToken(project.repository.installationId);
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL,
      target: process.env.DAYTONA_TARGET,
      requestTimeoutMs: 120_000,
    });
    const coordinatorDomains = [
      "api.fireworks.ai",
      "github.com",
      "api.github.com",
      "objects.githubusercontent.com",
      "registry.npmjs.org",
      "*.daytona.io",
      new URL(callbackUrl).hostname,
      ...targetAllowedDomains,
    ];
    const sandbox = await daytona.create({
      image: config.daytonaOrchestratorImage,
      language: "typescript",
      name: `tracecase-${run.id.replace(/[^a-z0-9-]/gi, "-").slice(-40)}`,
      labels: { product: "tracecase", runId: run.id, role: "coordinator" },
      envVars: {
        DAYTONA_API_KEY: process.env.DAYTONA_API_KEY!,
        DAYTONA_API_URL: process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api",
        DAYTONA_TARGET: process.env.DAYTONA_TARGET ?? "us",
        FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY!,
        FIREWORKS_BASE_URL: process.env.FIREWORKS_BASE_URL ?? "https://api.fireworks.ai/inference/v1",
        FIREWORKS_MODEL: process.env.FIREWORKS_MODEL!,
        GITHUB_CLONE_TOKEN: installationToken,
        WORKER_SIGNING_SECRET: config.workerSigningSecret,
      },
      domainAllowList: [...new Set(coordinatorDomains)].join(","),
      autoStopInterval: 0,
      autoDeleteInterval: Math.min(120, run.budget.maxMinutes + 20),
      ttlMinutes: Math.min(120, run.budget.maxMinutes + 25),
    }, { timeout: 120 });

    await sandbox.fs.createFolder("/workspace/tracecase", "700");
    await Promise.all([
      sandbox.fs.uploadFile(Buffer.from(JSON.stringify(job)), "/workspace/tracecase/job.json"),
      sandbox.fs.uploadFile(await loadWorkerSource("orchestrator.mjs"), "/workspace/tracecase/orchestrator.mjs"),
      sandbox.fs.uploadFile(await loadWorkerSource("browser-worker.mjs"), "/workspace/tracecase/browser-worker.mjs"),
      sandbox.fs.uploadFile(await loadWorkerSource("verify-worker.mjs"), "/workspace/tracecase/verify-worker.mjs"),
      sandbox.fs.uploadFile(await loadWorkerSource("remote-entry.sh"), "/workspace/tracecase/remote-entry.sh"),
    ]);
    await sandbox.git.clone(
      `https://github.com/${project.repository.owner}/${project.repository.name}.git`,
      "/workspace/repo",
      project.repository.defaultBranch,
      undefined,
      "x-access-token",
      installationToken,
      false,
      50,
    );
    await sandbox.process.createSession("tracecase-agent");
    const launched = await sandbox.process.executeSessionCommand("tracecase-agent", {
      command: "chmod 700 /workspace/tracecase/remote-entry.sh && /workspace/tracecase/remote-entry.sh",
      runAsync: true,
      suppressInputEcho: true,
    }, 30);
    if (!launched.cmdId) throw new Error("Daytona did not return a background command ID");

    const dispatchedAt = new Date().toISOString();
    run = {
      ...run,
      status: "dispatching",
      environments,
      execution: { provider: "daytona", sandboxId: sandbox.id, dispatchedAt, lastHeartbeatAt: dispatchedAt },
      updatedAt: dispatchedAt,
    };
    await store.putRun(run);
    await store.appendRunEvent(event(run, { sequence: 1200, type: "run.dispatched", agent: "system", summary: "The investigation was dispatched to an isolated Daytona coordinator.", data: { provider: "daytona", sandboxId: sandbox.id, workerCount: environments.length } }));
    return { dispatched: true, sandboxId: sandbox.id };
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : "Unknown dispatch error");
    if (run) {
      const failed = { ...run, status: "failed" as const, execution: run.execution ? { ...run.execution, lastError: message } : undefined, updatedAt: new Date().toISOString() };
      await store.putRun(failed);
      await store.appendRunEvent(event(failed, { sequence: 1201, type: "run.failed", agent: "system", summary: "The remote investigation could not be dispatched.", data: { error: message } }));
    }
    throw error;
  } finally {
    await store.releaseLease(scope, leaseKey, leaseOwner);
  }
}

