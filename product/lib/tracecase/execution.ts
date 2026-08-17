import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Daytona, type Sandbox } from "@daytona/sdk";
import { getConfig } from "./config";
import type { InvestigationRun, RunEvent, TenantScope } from "./contracts";
import { GitHubAdapter } from "./integrations";
import { getFireworksSettings } from "./fireworks";
import { classifyContext, planEnvironments } from "./planner";
import { retrieveRepositoryContext } from "./retrieval";
import type { RemoteJob } from "./remote-contracts";
import { remoteJobSchema } from "./remote-contracts";
import { createOpaqueId, redactText, sha256 } from "./security";
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
  const fireworks = getFireworksSettings();
  return Boolean(
    config.allowExternalCalls &&
    config.runtimeMode === "live" &&
    config.persistence === "supabase" &&
    config.supabaseUrl &&
    config.supabaseSecretKey &&
    config.workerSigningSecret &&
    config.appUrl &&
    process.env.DAYTONA_API_KEY &&
    fireworks.visionConfigured &&
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_APP_PRIVATE_KEY_BASE64,
  );
}

async function loadWorkerSource(name: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "worker", name));
}

export async function dispatchRun(scope: TenantScope, runId: string): Promise<{ dispatched: boolean; sandboxId?: string; reason?: string }> {
  const config = getConfig();
  const fireworks = getFireworksSettings();
  const { store } = await getRuntime();
  const leaseKey = `${runId}:remote-dispatch:v1`;
  const leaseOwner = createOpaqueId("dispatcher");
  const acquired = await store.acquireLease(scope, leaseKey, leaseOwner, new Date(Date.now() + 120_000).toISOString());
  if (!acquired) return { dispatched: false, reason: "dispatch_already_in_progress" };

  let run: InvestigationRun | null = null;
  let pendingSecretCleanup: { daytona: Daytona; ids: string[] } | undefined;
  let pendingSandboxCleanup: { daytona: Daytona; sandbox: Sandbox } | undefined;
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

    const classification = classifyContext({ sessionReplay: false, exactEnvironment: Boolean(report.environment.browser && report.environment.operatingSystem), exactRelease: Boolean(report.release), authenticatedState: Boolean(report.reporter.externalUserId), telemetry: report.consent.technicalDetails, repository: true });
    const realEnvironmentsConfigured = process.env.REAL_DEVICE_PROVIDER === "browserstack" && Boolean(process.env.BROWSERSTACK_USERNAME && process.env.BROWSERSTACK_ACCESS_KEY);
    const environments = planEnvironments(classification.contextClass, report, Math.min(run.budget.maxWorkers, project.policy.maxParallelWorkers), { realEnvironments: realEnvironmentsConfigured });
    const memory = await retrieveRepositoryContext({ store, scope, identifiers: report.exactIdentifiers, semanticQuery: `${report.expected}\n${report.observed}`, repository: `${project.repository.owner}/${project.repository.name}` });
    const reporterAttachments: Array<{ id: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; contentBase64: string }> = [];
    let reporterAttachmentCharacters = 0;
    for (const id of report.attachmentIds) {
      const artifact = await store.getArtifact(scope, id);
      if (!artifact?.mimeType || !["image/jpeg", "image/png", "image/webp"].includes(artifact.mimeType)) continue;
      const content = await store.getArtifactContent(scope, id);
      if (!content) continue;
      const contentBase64 = Buffer.from(content).toString("base64");
      if (reporterAttachmentCharacters + contentBase64.length > 2_500_000) continue;
      reporterAttachments.push({ id, mimeType: artifact.mimeType as "image/jpeg" | "image/png" | "image/webp", contentBase64 });
      reporterAttachmentCharacters += contentBase64.length;
      if (reporterAttachments.length >= 5) break;
    }
    const targetAllowedDomains = configuredDomains(project.targetTestUrl, config.targetAllowedDomains);
    const callbackUrl = new URL("/api/internal/runs/callback", config.appUrl).toString();
    const frameCallbackUrl = new URL("/api/internal/runs/frame", config.appUrl).toString();
    const jobBase = {
      version: 1,
      runId: run.id,
      organizationId: run.organizationId,
      projectId: run.projectId,
      repository: { ...project.repository, installationId: project.repository.installationId },
      report: {
        id: report.id,
        expected: report.expected,
        observed: report.observed,
        route: report.route ?? undefined,
        release: report.release ?? undefined,
        exactIdentifiers: report.exactIdentifiers,
        unknowns: report.unknowns,
        environment: report.environment,
      },
      caseDocument: { id: caseDocument.id, title: caseDocument.title, unknowns: caseDocument.unknowns },
      targetUrl: project.targetTestUrl,
      targetAllowedDomains,
      privateSelectors: config.privateSelectors,
      environments,
      reporterAttachments,
      memoryContext: memory.chunks.slice(0, 10),
      budget: { maxMinutes: run.budget.maxMinutes, maxWorkers: run.budget.maxWorkers },
      callbackUrl,
      frameCallbackUrl,
      browserImage: config.daytonaBrowserImage,
      playwrightVersion: config.playwrightVersion,
    };

    const github = new GitHubAdapter();
    const installationToken = await github.installationToken(project.repository.installationId);
    const daytona = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY,
      apiUrl: process.env.DAYTONA_API_URL,
      target: process.env.DAYTONA_TARGET,
      requestTimeoutMs: 120_000,
    });
    if (run.execution?.provider === "daytona" && ["failed", "cancelled"].includes(run.status)) {
      try {
        const previousSandbox = await daytona.get(run.execution.sandboxId);
        await daytona.delete(previousSandbox, 60, true);
      } catch (error) {
        console.warn("Tracecase could not remove the previous Daytona coordinator before retrying.", { name: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    const secretSuffix = sha256(`${run.id}:${leaseOwner}`).slice(0, 16);
    const coordinatorFireworksBaseUrl = `${new URL(callbackUrl).origin}/api/internal/fireworks`;
    const daytonaSecrets: Array<{ id: string; name: string }> = [];
    pendingSecretCleanup = { daytona, ids: [] };
    daytonaSecrets.push(await daytona.secret.create({ name: `tracecase_daytona_${secretSuffix}`, value: process.env.DAYTONA_API_KEY!, hosts: ["*.daytona.io"] }));
    pendingSecretCleanup.ids.push(daytonaSecrets.at(-1)!.id);
    daytonaSecrets.push(await daytona.secret.create({ name: `tracecase_fireworks_${secretSuffix}`, value: config.workerSigningSecret!, hosts: [new URL(callbackUrl).hostname] }));
    pendingSecretCleanup.ids.push(daytonaSecrets.at(-1)!.id);
    daytonaSecrets.push(await daytona.secret.create({ name: `tracecase_github_${secretSuffix}`, value: `Bearer ${installationToken}`, hosts: ["*.daytona.io", "github.com", "api.github.com"] }));
    pendingSecretCleanup.ids.push(daytonaSecrets.at(-1)!.id);
    if (realEnvironmentsConfigured) {
      const authorization = `Basic ${Buffer.from(`${process.env.BROWSERSTACK_USERNAME}:${process.env.BROWSERSTACK_ACCESS_KEY}`).toString("base64")}`;
      daytonaSecrets.push(await daytona.secret.create({ name: `tracecase_browserstack_${secretSuffix}`, value: authorization, hosts: ["hub.browserstack.com", "api.browserstack.com"] }));
      pendingSecretCleanup.ids.push(daytonaSecrets.at(-1)!.id);
    }
    const job: RemoteJob = remoteJobSchema.parse({ ...jobBase, daytonaSecretIds: daytonaSecrets.map((item) => item.id) });
    const coordinatorDomains = [
      new URL(callbackUrl).hostname,
      "github.com",
      "api.github.com",
      "objects.githubusercontent.com",
      "registry.npmjs.org",
      ...(realEnvironmentsConfigured ? ["hub.browserstack.com", "api.browserstack.com", "automate.browserstack.com"] : []),
      "*.daytona.io",
      new URL(process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api").hostname,
      new URL(callbackUrl).hostname,
      ...targetAllowedDomains,
    ];
    const sandbox = await daytona.create({
      image: config.daytonaOrchestratorImage,
      language: "typescript",
      name: `tracecase-${run.id.replace(/[^a-z0-9-]/gi, "-").slice(-40)}`,
      labels: { product: "tracecase", runId: run.id, role: "coordinator" },
      envVars: {
        DAYTONA_API_URL: process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api",
        DAYTONA_TARGET: process.env.DAYTONA_TARGET ?? "us",
        FIREWORKS_BASE_URL: coordinatorFireworksBaseUrl,
        FIREWORKS_MODEL: fireworks.visionModel!,
        WORKER_SIGNING_SECRET: config.workerSigningSecret,
      },
      secrets: {
        DAYTONA_API_KEY: daytonaSecrets[0].name,
        FIREWORKS_API_KEY: daytonaSecrets[1].name,
        GITHUB_AUTHORIZATION: daytonaSecrets[2].name,
        ...(realEnvironmentsConfigured ? { BROWSERSTACK_AUTHORIZATION: daytonaSecrets[3].name } : {}),
      },
      domainAllowList: [...new Set(coordinatorDomains)].join(","),
      autoStopInterval: 0,
      autoDeleteInterval: Math.min(120, run.budget.maxMinutes + 20),
      ttlMinutes: Math.min(120, run.budget.maxMinutes + 25),
    }, { timeout: 120 });
    pendingSandboxCleanup = { daytona, sandbox };

    const dispatchedAt = new Date().toISOString();
    run = {
      ...run,
      status: "dispatching",
      contextClass: classification.contextClass,
      contextReasons: classification.reasons,
      environments,
      execution: { provider: "daytona", sandboxId: sandbox.id, dispatchedAt, lastHeartbeatAt: dispatchedAt },
      updatedAt: dispatchedAt,
    };
    await store.putRun(run);

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
    await sandbox.git.remoteAdd("/workspace/repo", "origin", `https://github.com/${project.repository.owner}/${project.repository.name}.git`, false, true);
    await sandbox.process.createSession("tracecase-agent");
    const launched = await sandbox.process.executeSessionCommand("tracecase-agent", {
      command: "chmod 700 /workspace/tracecase/remote-entry.sh && /workspace/tracecase/remote-entry.sh",
      runAsync: true,
      suppressInputEcho: true,
    }, 30);
    if (!launched.cmdId) throw new Error("Daytona did not return a background command ID");
    pendingSecretCleanup = undefined;
    pendingSandboxCleanup = undefined;
    await store.appendRunEvent(event(run, { sequence: 1200, type: "run.dispatched", agent: "system", summary: "The investigation was dispatched to an isolated Daytona coordinator.", data: { provider: "daytona", sandboxId: sandbox.id, workerCount: environments.length } }));
    return { dispatched: true, sandboxId: sandbox.id };
  } catch (error) {
    if (pendingSecretCleanup) await Promise.all(pendingSecretCleanup.ids.map((id) => pendingSecretCleanup!.daytona.secret.delete(id).catch(() => undefined)));
    if (pendingSandboxCleanup) await pendingSandboxCleanup.daytona.delete(pendingSandboxCleanup.sandbox, 60, false).catch(() => undefined);
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
