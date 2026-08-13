import type { CaseDocument, InvestigationRun, ObservableAssertion, Patch, Project, Report, RepositoryChunk, TenantScope, User, WorkerManifest, WorkerResult } from "../lib/tracecase/contracts";
import type { ReasoningModel, WorkerExecutor } from "../lib/tracecase/integrations";
import { createOpaqueId, sha256 } from "../lib/tracecase/security";
import type { TracecaseStore } from "../lib/tracecase/store";

export const fixtureScope: TenantScope = { organizationId: "org_test", projectId: "project_test" };
export const fixturePublicKey = "pk_test_local";

export const fixtureUser: User = {
  id: "user_kim",
  organizationId: fixtureScope.organizationId,
  email: "kim@sable.test",
  displayName: "Kim Morgan",
  rolesByProject: { [fixtureScope.projectId]: "owner" },
  createdAt: "2026-08-13T16:00:00.000Z",
};

export const fixtureProject: Project = {
  id: fixtureScope.projectId,
  organizationId: fixtureScope.organizationId,
  name: "Test Project",
  slug: "sable-web",
  targetTestUrl: "http://localhost:3000/intake",
  repository: { provider: "github", owner: "sable", name: "web", defaultBranch: "main" },
  widget: { publicKeyHash: sha256(fixturePublicKey), allowedOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"], enabled: true },
  policy: { allowBranchPush: false, allowDraftPullRequest: true, allowMerge: false, allowDeploy: false, maxRunMinutes: 15, maxParallelWorkers: 12, requireHumanForProductionAccess: true },
  retention: { reportsDays: 365, artifactsDays: 30, auditDays: 730 },
  connections: [
    { provider: "github", enabled: false, status: "unconfigured" },
    { provider: "otel", enabled: true, status: "configured" },
    { provider: "sentry", enabled: false, status: "unconfigured" },
    { provider: "jira", enabled: false, status: "unconfigured" },
    { provider: "daytona", enabled: false, status: "unconfigured" },
    { provider: "fireworks", enabled: false, status: "unconfigured" },
  ],
  createdAt: "2026-08-13T16:00:00.000Z",
  updatedAt: "2026-08-13T16:00:00.000Z",
};

export class FixtureReasoningModel implements ReasoningModel {
  readonly name = "fixture:deterministic";

  async plan(): Promise<{ hypotheses: string[] }> {
    return { hypotheses: [
      "Reduced-motion disables the CSS animation that emits the completion event.",
      "A failed request leaves the control in its pending state.",
      "A stale session causes the status poll to stop before completion.",
    ] };
  }

  async proposePatch(): Promise<Patch> {
    return {
      id: "patch_test",
      runId: "pending",
      baseCommit: "8d42fe1",
      files: [{ path: "src/components/ActionButton.tsx", diff: "@@ -1 +1 @@\n-old\n+new" }],
      regression: { path: "src/components/ActionButton.test.tsx", baseFailed: true, patchPassed: true, comparableEnvironment: true },
      relevantTestsPassed: true,
      preExistingFailures: [],
      safe: true,
    };
  }
}

export class FixtureWorkerExecutor implements WorkerExecutor {
  async execute(manifest: WorkerManifest): Promise<WorkerResult> {
    const reproduces = manifest.environment.reducedMotion && manifest.environment.stateProfile === "returning-user";
    const assertions: ObservableAssertion[] = manifest.assertions.map((assertion) => ({ ...assertion, observed: reproduces ? "The reported behavior occurred." : assertion.expected, passed: !reproduces }));
    return {
      workerId: manifest.id,
      environment: manifest.environment,
      status: reproduces ? "failed" : "passed",
      assertions,
      console: [],
      network: [],
      artifactIds: [createOpaqueId("artifact")],
      durationMs: reproduces ? 820 : 640,
    };
  }
}

export function createFixtureReport(id = "report_1842"): Report {
  return {
    id,
    ...fixtureScope,
    sessionId: "session_test",
    immutable: true,
    reporter: {},
    expected: "Publish the latest changes to our pricing page",
    observed: "The button changes to Publishing… and never finishes, but the page does go live.",
    frequency: "every_time",
    route: "/pricing",
    release: "8d42fe1",
    exactIdentifiers: ["src/components/PublishButton.tsx", "POST /api/publish", "GET /api/status"],
    environment: {},
    consent: { technicalDetails: true, screenshot: false, attachments: false },
    unknowns: ["Browser and operating system", "Reduced-motion preference", "Account state before the first failed publish", "Session cookies"],
    attachmentIds: [],
    receivedAt: new Date().toISOString(),
  };
}

export function createFixtureCase(report: Report): CaseDocument {
  const now = new Date().toISOString();
  return {
    id: "case_bug_1842",
    ...fixtureScope,
    title: "Publish button remains pending after a successful publish",
    status: "investigating",
    reportIds: [report.id],
    exactIdentifiers: report.exactIdentifiers,
    unknowns: report.unknowns,
    mergeProvenance: [{ reportId: report.id, method: "exact" }],
    createdAt: now,
    updatedAt: now,
  };
}

export function createFixtureRun(caseDocument: CaseDocument, id = "run_2487"): InvestigationRun {
  const now = new Date().toISOString();
  return {
    id,
    ...fixtureScope,
    caseId: caseDocument.id,
    status: "queued",
    contextClass: "C",
    contextReasons: [],
    hypotheses: [],
    environments: [],
    workerResults: [],
    budget: { maxMinutes: 15, maxWorkers: 8, workersUsed: 0, cancelled: false },
    modelBundle: { provider: "fixture", model: "deterministic", promptVersion: "investigation-v1", codeVersion: "local" },
    createdAt: now,
    updatedAt: now,
  };
}

export const fixtureChunks: RepositoryChunk[] = [
  {
    id: "chunk_publish_button",
    ...fixtureScope,
    repository: "sable/web",
    commit: "8d42fe1",
    contentType: "code",
    path: "src/components/PublishButton.tsx",
    symbol: "PublishButton",
    exactIdentifiers: ["src/components/PublishButton.tsx", "PublishButton"],
    content: "export function PublishButton({ reducedMotion }) { const [status, setStatus] = useState('idle'); const finish = () => setStatus('published'); return <button className={reducedMotion ? 'no-animation' : 'publishing'} onAnimationEnd={finish}>{status === 'publishing' ? 'Publishing…' : 'Publish'}</button>; }",
    contentHash: sha256("fixture-publish-button-v1"),
    ignored: false,
    indexedAt: new Date().toISOString(),
  },
  {
    id: "chunk_publish_test",
    ...fixtureScope,
    repository: "sable/web",
    commit: "8d42fe1",
    contentType: "test",
    path: "src/components/PublishButton.test.tsx",
    symbol: "PublishButton test",
    exactIdentifiers: ["src/components/PublishButton.test.tsx"],
    content: "it('shows published after animation', async () => { /* reduced-motion is not covered */ });",
    contentHash: sha256("fixture-publish-test-v1"),
    ignored: false,
    indexedAt: new Date().toISOString(),
  },
  {
    id: "chunk_publish_route",
    ...fixtureScope,
    repository: "sable/web",
    commit: "8d42fe1",
    contentType: "route",
    path: "src/app/api/publish/route.ts",
    exactIdentifiers: ["POST /api/publish", "GET /api/status"],
    content: "POST /api/publish returns 202. GET /api/status returns live=true after the publish job completes.",
    contentHash: sha256("fixture-publish-route-v1"),
    ignored: false,
    indexedAt: new Date().toISOString(),
  },
];

export async function seedFixtureStore(store: TracecaseStore): Promise<{ report: Report; caseDocument: CaseDocument; run: InvestigationRun }> {
  const existing = await store.getProject(fixtureScope);
  if (!existing) await store.putProject(fixtureProject);
  await store.putRepositoryChunks(fixtureChunks);
  const report = createFixtureReport();
  const currentReport = await store.getReport(fixtureScope, report.id);
  if (!currentReport) await store.putReport(report);
  const caseDocument = createFixtureCase(report);
  await store.putCase(caseDocument);
  const run = createFixtureRun(caseDocument);
  const currentRun = await store.getRun(fixtureScope, run.id);
  if (!currentRun) await store.putRun(run);
  return { report: currentReport ?? report, caseDocument, run: currentRun ?? run };
}
