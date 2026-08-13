import { getConfig } from "./config";
import type { CaseDocument, IntakePayload, InvestigationRun, Report, RunEvent, TenantScope } from "./contracts";
import { intakePayloadSchema } from "./contracts";
import { MongoTracecaseStore } from "./mongodb";
import { extractExactIdentifiers } from "./retrieval";
import { createOpaqueId, redactText, sha256, verifyToken } from "./security";
import { getProcessMemoryStore, type TracecaseStore } from "./store";

type Runtime = { store: TracecaseStore };

declare global {
  var __tracecaseRuntime: Promise<Runtime> | undefined;
}

async function createRuntime(): Promise<Runtime> {
  const config = getConfig();
  const store = config.persistence === "mongodb" ? await MongoTracecaseStore.connect() : getProcessMemoryStore();
  return { store };
}

export async function getRuntime(): Promise<Runtime> {
  globalThis.__tracecaseRuntime ??= createRuntime();
  return globalThis.__tracecaseRuntime;
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(key: string, limit = 10, windowMs = 60_000): void {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) throw new Error("Rate limit exceeded");
  bucket.count += 1;
}

export function intakeQuestions(payload: Partial<IntakePayload>): Array<{ field: string; question: string; reason: string }> {
  const questions = [];
  if (!payload.expected?.trim()) questions.push({ field: "expected", question: "What should have happened?", reason: "expected_result_missing" });
  if (!payload.observed?.trim()) questions.push({ field: "observed", question: "What went wrong?", reason: "observed_result_missing" });
  if (!payload.frequency) questions.push({ field: "frequency", question: "How often does it happen?", reason: "frequency_missing" });
  if (!payload.environment?.browser) questions.push({ field: "environment.browser", question: "Which browser?", reason: "browser_missing" });
  return questions.slice(0, 3);
}

export function findIntakeConflicts(history: Array<{ field: string; value: string }>): Array<{ field: string; question: string }> {
  const byField = new Map<string, Set<string>>();
  for (const answer of history) {
    const values = byField.get(answer.field) ?? new Set<string>();
    values.add(answer.value.trim().toLowerCase());
    byField.set(answer.field, values);
  }
  return [...byField.entries()].filter(([, values]) => values.size > 1).map(([field]) => ({ field, question: `Which ${field} answer should I use?` }));
}

export async function submitTimedOutIntake(raw: Partial<IntakePayload> & Pick<IntakePayload, "projectKey">) {
  const missing = intakeQuestions(raw).map((question) => question.field);
  return submitIntake({
    ...raw,
    expected: raw.expected?.trim() || "Unknown — no response received.",
    observed: raw.observed?.trim() || "Unknown — no response received.",
    frequency: raw.frequency ?? "I don’t know",
    consent: raw.consent ?? { technicalDetails: false, screenshot: false, attachments: false },
    unknowns: [...new Set([...(raw.unknowns ?? []), ...missing])],
  });
}

function frequency(value: IntakePayload["frequency"]): Report["frequency"] {
  if (value === "Every time") return "every_time";
  if (value === "Sometimes") return "sometimes";
  if (value === "Only happened once") return "once";
  return "unknown";
}

export async function submitIntake(raw: unknown): Promise<{ report: Report; caseDocument: CaseDocument; run: InvestigationRun; duplicate: boolean }> {
  const parsed = intakePayloadSchema.parse(raw);
  const config = getConfig();
  if (!parsed.sessionToken) throw new Error("Widget session required");
  if (!config.widgetSigningSecret) throw new Error("WIDGET_SIGNING_SECRET is required");
  enforceRateLimit(sha256(parsed.sessionToken));
  const token = verifyToken<{ sessionId: string; projectKeyHash: string }>(parsed.sessionToken, config.widgetSigningSecret);
  if (token.projectKeyHash !== sha256(parsed.projectKey)) throw new Error("Widget session does not match the project key");

  const payload = { ...parsed, expected: redactText(parsed.expected), observed: redactText(parsed.observed), unknowns: parsed.unknowns.map(redactText) };
  const { store } = await getRuntime();
  const project = await store.getProjectByPublicKeyHash(sha256(payload.projectKey));
  if (!project || !project.widget.enabled) throw new Error("Unknown or disabled widget project key");

  const now = new Date().toISOString();
  const scope: TenantScope = { organizationId: project.organizationId, projectId: project.id };
  const exactIdentifiers = extractExactIdentifiers(payload.expected, payload.observed, payload.route, payload.release);
  const report: Report = {
    id: createOpaqueId("report"), ...scope, sessionId: token.sessionId, immutable: true, reporter: {},
    expected: payload.expected, observed: payload.observed, frequency: frequency(payload.frequency), route: payload.route,
    release: payload.release, exactIdentifiers, environment: payload.environment ?? {}, consent: payload.consent,
    unknowns: [...new Set([...payload.unknowns, ...intakeQuestions(payload).map((item) => item.field)])], attachmentIds: [], receivedAt: now,
  };
  await store.putReport(report);

  const exactCase = await store.findCaseByExactIdentifiers(scope, exactIdentifiers);
  const caseDocument: CaseDocument = exactCase ?? {
    id: createOpaqueId("case"), ...scope, title: payload.observed.slice(0, 140), status: "investigating", reportIds: [report.id],
    exactIdentifiers, unknowns: report.unknowns, mergeProvenance: [{ reportId: report.id, method: "exact" }], createdAt: now, updatedAt: now,
  };
  if (exactCase) {
    caseDocument.reportIds = [...new Set([...exactCase.reportIds, report.id])];
    caseDocument.mergeProvenance = [...exactCase.mergeProvenance, { reportId: report.id, method: "exact" }];
    caseDocument.updatedAt = now;
  }
  await store.putCase(caseDocument);

  const run: InvestigationRun = {
    id: createOpaqueId("run"), ...scope, caseId: caseDocument.id, status: "queued", contextClass: "C", contextReasons: [], hypotheses: [],
    environments: [], workerResults: [], budget: { maxMinutes: project.policy.maxRunMinutes, maxWorkers: Math.min(config.maxParallelEnvironments, project.policy.maxParallelWorkers), workersUsed: 0, cancelled: false },
    modelBundle: { provider: "fireworks", model: process.env.FIREWORKS_MODEL ?? "unconfigured", promptVersion: "investigation-v1", codeVersion: process.env.VERCEL_GIT_COMMIT_SHA ?? "unavailable" },
    createdAt: now, updatedAt: now,
  };
  await store.putRun(run);
  return { report, caseDocument, run, duplicate: Boolean(exactCase) };
}

export async function getRun(scope: TenantScope, runId: string): Promise<{ run: InvestigationRun; events: RunEvent[] } | null> {
  const { store } = await getRuntime();
  const run = await store.getRun(scope, runId);
  if (!run) return null;
  return { run, events: await store.listRunEvents(scope, runId) };
}

export async function listRuns(scope: TenantScope) {
  const { store } = await getRuntime();
  return store.listRuns(scope, 50);
}

export async function listCases(scope: TenantScope) {
  const { store } = await getRuntime();
  return store.listCases(scope, 50);
}

export async function getCase(scope: TenantScope, caseId: string): Promise<CaseDocument | null> {
  const { store } = await getRuntime();
  return store.getCase(scope, caseId);
}
